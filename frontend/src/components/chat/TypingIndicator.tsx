import { useSocketStore } from "@/stores/useSocketStore";
import type { Conversation } from "@/types/chat";

const EMPTY: string[] = [];

// "Bình đang nhập…", "Bình và Chi đang nhập…", "Bình và 2 người khác đang nhập…"
const describe = (names: string[]) => {
  if (names.length === 1) return `${names[0]} đang nhập`;
  if (names.length === 2) return `${names[0]} và ${names[1]} đang nhập`;
  return `${names[0]} và ${names.length - 1} người khác đang nhập`;
};

const TypingIndicator = ({ convo }: { convo: Conversation }) => {
  const typingIds = useSocketStore((s) => s.typingUsers[convo._id] ?? EMPTY);

  const names = typingIds
    .map((id) => convo.participants.find((p) => p._id === id)?.displayName)
    .filter((name): name is string => Boolean(name));

  return (
    // luôn giữ chỗ (h-5) để khung chat không nhảy khi dòng này hiện/ẩn
    <div
      className="h-5 px-4 flex items-center gap-1.5 text-xs text-muted-foreground bg-background"
      aria-live="polite"
    >
      {names.length > 0 && (
        <>
          <span className="flex gap-0.5" aria-hidden="true">
            {[0, 150, 300].map((delay) => (
              <span
                key={delay}
                className="size-1 rounded-full bg-muted-foreground motion-safe:animate-bounce"
                style={{ animationDelay: `${delay}ms` }}
              />
            ))}
          </span>
          <span className="truncate">{describe(names)}…</span>
        </>
      )}
    </div>
  );
};

export default TypingIndicator;
