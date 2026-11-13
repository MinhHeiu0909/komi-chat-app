import { useEffect, useRef, useState } from "react";
import { Search } from "lucide-react";
import axios from "axios";
import { Popover, PopoverContent, PopoverTrigger } from "../ui/popover";
import { chatService } from "@/services/chatService";
import { jumpToMessage } from "@/lib/messageJump";
import { messagePreviewText } from "@/lib/messageFile";
import { formatMessageTime } from "@/lib/utils";
import { useAuthStore } from "@/stores/useAuthStore";
import type { Conversation, Message } from "@/types/chat";

const MIN_QUERY = 2; // khớp backend (utils/messageSearch.js)
const DEBOUNCE_MS = 300;

/**
 * Tìm tin trong cuộc trò chuyện đang mở (gõ không dấu vẫn ra tin có dấu).
 * Bấm một kết quả để nhảy tới tin đó. Dùng với key={convo._id} để đổi cuộc trò chuyện là xoá kết quả cũ.
 */
const MessageSearch = ({ convo }: { convo: Conversation }) => {
  const currentUserId = useAuthStore((s) => s.user?._id);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Message[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const latest = useRef(0); // bỏ kết quả của lần tìm cũ về muộn
  const timer = useRef<number | undefined>(undefined);

  // rời khung chat thì huỷ lần tìm đang chờ
  useEffect(() => () => window.clearTimeout(timer.current), []);

  const run = async (q: string, before?: string | null) => {
    const id = ++latest.current;
    setLoading(true);
    setError(null);
    try {
      const data = await chatService.searchMessages(convo._id, q, before);
      if (id !== latest.current) return;
      setResults((prev) => (before ? [...prev, ...data.messages] : data.messages));
      setNextCursor(data.nextCursor);
    } catch (err) {
      if (id !== latest.current) return;
      setError(
        (axios.isAxiosError(err) ? err.response?.data?.message : undefined) ?? "Không tìm được, thử lại sau nhé"
      );
    } finally {
      if (id === latest.current) setLoading(false);
    }
  };

  // tìm sau khi ngừng gõ một chút
  const changeQuery = (value: string) => {
    setQuery(value);
    window.clearTimeout(timer.current);
    const q = value.trim();
    if (q.length < MIN_QUERY) {
      latest.current += 1; // bỏ kết quả của lần tìm đang chạy
      setResults([]);
      setNextCursor(null);
      setLoading(false);
      setError(null);
      return;
    }
    timer.current = window.setTimeout(() => run(q), DEBOUNCE_MS);
  };

  const nameOf = (userId: string) =>
    userId === currentUserId
      ? "Bạn"
      : convo.participants.find((p) => p._id === userId)?.displayName ?? "Ai đó";

  const q = query.trim();

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        aria-label="Tìm tin nhắn"
        title="Tìm trong cuộc trò chuyện"
        className="ml-auto shrink-0 rounded-full p-2 text-muted-foreground hover:bg-primary/10 hover:text-primary"
      >
        <Search className="size-4" />
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 max-w-[calc(100vw-2rem)] gap-2 p-3">
        <input
          autoFocus
          type="search"
          value={query}
          onChange={(e) => changeQuery(e.target.value)}
          maxLength={100}
          placeholder="Tìm trong cuộc trò chuyện…"
          aria-label="Từ khoá"
          className="w-full rounded-md border bg-background px-3 py-2 text-sm outline-none focus:border-primary/50"
        />

        <div className="max-h-80 overflow-y-auto beautiful-scrollbar" aria-live="polite">
          {q.length > 0 && q.length < MIN_QUERY && (
            <p className="px-1 py-2 text-xs text-muted-foreground">Gõ ít nhất {MIN_QUERY} ký tự.</p>
          )}
          {error && <p className="px-1 py-2 text-xs text-destructive">{error}</p>}
          {!error && !loading && q.length >= MIN_QUERY && results.length === 0 && (
            <p className="px-1 py-2 text-xs text-muted-foreground">Không có tin nào khớp.</p>
          )}

          <ul className="flex flex-col">
            {results.map((m) => (
              <li key={m._id}>
                <button
                  type="button"
                  onClick={() => {
                    setOpen(false);
                    jumpToMessage(convo._id, m._id);
                  }}
                  className="w-full rounded-md px-2 py-1.5 text-left hover:bg-primary/10"
                >
                  <span className="flex items-baseline justify-between gap-2 text-xs">
                    <span className="truncate font-semibold">{nameOf(m.senderId)}</span>
                    <span className="shrink-0 text-muted-foreground">
                      {formatMessageTime(new Date(m.createdAt))}
                    </span>
                  </span>
                  <span className="block line-clamp-2 text-sm wrap-break-word">
                    {messagePreviewText(m)}
                  </span>
                </button>
              </li>
            ))}
          </ul>

          {loading && <p className="px-1 py-2 text-xs text-muted-foreground">Đang tìm…</p>}
          {!loading && nextCursor && (
            <button
              type="button"
              onClick={() => run(q, nextCursor)}
              className="mt-1 w-full rounded-md py-1.5 text-xs text-primary hover:bg-primary/10"
            >
              Xem thêm
            </button>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
};

export default MessageSearch;
