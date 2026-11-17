import { toast } from "sonner";
import { useChatStore } from "@/stores/useChatStore";
import { findMatches } from "@/lib/textSearch";

// tải thêm tối đa chừng này trang tin cũ (20 tin/trang) khi tìm tin để nhảy tới
const MAX_PAGES_TO_LOAD = 25;

const HIGHLIGHT_NAME = "search-hit"; // tên dùng trong ::highlight(search-hit) ở index.css

/**
 * Tô màu từ khoá trong một bong bóng tin bằng CSS Custom Highlight API: không đụng vào DOM
 * do React quản lý. Trình duyệt chưa hỗ trợ thì bỏ qua (vẫn còn viền nháy).
 * Chỉ giữ một tin được tô tại một thời điểm; tô tin khác thì bỏ tô tin cũ.
 */
const highlightKeyword = (bubble: HTMLElement, query: string) => {
  if (typeof CSS === "undefined" || !("highlights" in CSS)) return;
  CSS.highlights.delete(HIGHLIGHT_NAME);
  if (!query.trim()) return;

  // ghép chữ của mọi đoạn text trong bong bóng (markdown tách thành nhiều thẻ)
  const root = bubble.querySelector<HTMLElement>(".chat-markdown") ?? bubble;
  const nodes: { node: Text; start: number }[] = [];
  let full = "";
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  for (let n = walker.nextNode(); n; n = walker.nextNode()) {
    const text = n as Text;
    nodes.push({ node: text, start: full.length });
    full += text.data;
  }

  // vị trí trong chuỗi ghép → (text node, vị trí trong node)
  const locate = (pos: number, isEnd: boolean) => {
    for (let i = nodes.length - 1; i >= 0; i -= 1) {
      const { node, start } = nodes[i];
      if (isEnd ? pos > start : pos >= start) return { node, offset: pos - start };
    }
    return null;
  };

  const ranges = findMatches(full, query).flatMap(([from, to]) => {
    const a = locate(from, false);
    const b = locate(to, true);
    if (!a || !b) return [];
    const range = new Range();
    range.setStart(a.node, a.offset);
    range.setEnd(b.node, b.offset);
    return [range];
  });
  if (ranges.length > 0) CSS.highlights.set(HIGHLIGHT_NAME, new Highlight(...ranges));
};

// Cuộn tới tin và nháy viền để người dùng thấy nó ở đâu. Trả false nếu tin chưa có trên màn hình.
const scrollToMessage = (messageId: string, query?: string) => {
  const el = document.getElementById(`msg-${messageId}`);
  if (!el) return false;
  el.scrollIntoView({ behavior: "smooth", block: "center" });
  // nháy bong bóng (không phải khung ngoài, vì khung ngoài đang có animation nảy vào)
  const bubble = el.querySelector<HTMLElement>("[data-bubble]") ?? el;
  bubble.classList.add("reply-target-flash");
  window.setTimeout(() => bubble.classList.remove("reply-target-flash"), 1500);
  // nhảy từ kết quả tìm kiếm: tô từ khoá; nhảy từ trích dẫn: bỏ tô cũ
  highlightKeyword(bubble, query ?? "");
  return true;
};

/**
 * Nhảy tới một tin của cuộc trò chuyện đang mở (bấm trích dẫn, bấm kết quả tìm kiếm).
 * Tin cũ chưa tải thì tải thêm từng trang cho tới khi thấy (có giới hạn).
 * `query`: từ khoá tìm kiếm, có thì tô màu từ khoá trong tin đó.
 */
export const jumpToMessage = async (conversationId: string, messageId: string, query?: string) => {
  const has = () =>
    useChatStore.getState().messages[conversationId]?.items.some((m) => m._id === messageId) ?? false;

  for (let page = 0; !has() && page < MAX_PAGES_TO_LOAD; page += 1) {
    const before = useChatStore.getState().messages[conversationId];
    if (before && !before.hasMore) break;
    await useChatStore.getState().fetchMessages(conversationId);
    // không tải thêm được gì nữa (lỗi mạng / hết tin) thì dừng
    if (useChatStore.getState().messages[conversationId]?.items.length === before?.items.length) break;
  }

  if (!has()) {
    toast.info("Không tìm thấy tin này trong đoạn chat đã tải.");
    return;
  }
  // đợi React vẽ các tin vừa tải (và khung chat khôi phục vị trí cuộn) rồi mới cuộn
  window.setTimeout(() => {
    if (!scrollToMessage(messageId, query)) toast.info("Không cuộn tới được tin này.");
  }, 150);
};
