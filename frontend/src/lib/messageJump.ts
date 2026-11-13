import { toast } from "sonner";
import { useChatStore } from "@/stores/useChatStore";

// tải thêm tối đa chừng này trang tin cũ (20 tin/trang) khi tìm tin để nhảy tới
const MAX_PAGES_TO_LOAD = 25;

// Cuộn tới tin và nháy viền để người dùng thấy nó ở đâu. Trả false nếu tin chưa có trên màn hình.
const scrollToMessage = (messageId: string) => {
  const el = document.getElementById(`msg-${messageId}`);
  if (!el) return false;
  el.scrollIntoView({ behavior: "smooth", block: "center" });
  // nháy bong bóng (không phải khung ngoài, vì khung ngoài đang có animation nảy vào)
  const bubble = el.querySelector<HTMLElement>("[data-bubble]") ?? el;
  bubble.classList.add("reply-target-flash");
  window.setTimeout(() => bubble.classList.remove("reply-target-flash"), 1500);
  return true;
};

/**
 * Nhảy tới một tin của cuộc trò chuyện đang mở (bấm trích dẫn, bấm kết quả tìm kiếm).
 * Tin cũ chưa tải thì tải thêm từng trang cho tới khi thấy (có giới hạn).
 */
export const jumpToMessage = async (conversationId: string, messageId: string) => {
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
    if (!scrollToMessage(messageId)) toast.info("Không cuộn tới được tin này.");
  }, 150);
};
