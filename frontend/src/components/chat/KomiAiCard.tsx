import { useChatStore } from "@/stores/useChatStore";
import { useAuthStore } from "@/stores/useAuthStore";
import { cn } from "@/lib/utils";
import ChatCard from "./ChatCard";
import KomiAvatar from "./KomiAvatar";
import UnreadCountBadge from "./UnreadCountBadge";
import AiBadge from "./AiBadge";

/**
 * Thẻ riêng cho chat với Komi (trợ lý AI), đặt đầu thanh bên (không nằm trong mục Bạn bè).
 * Backend tự tạo cuộc trò chuyện này khi tải danh sách (ensureKomiConversation); chưa có thì ẩn.
 */
const KomiAiCard = () => {
  const { conversations, activeConversationId, setActiveConversation, messages, fetchMessages } =
    useChatStore();
  const user = useAuthStore((s) => s.user);

  const convo = conversations.find(
    (c) => c.type === "direct" && c.participants.some((p) => p.isBot)
  );
  if (!user || !convo) return null;

  const unreadCount = convo.unreadCounts[user._id] ?? 0;

  const handleSelect = async (id: string) => {
    setActiveConversation(id);
    if (!messages[id]) await fetchMessages();
  };

  return (
    <ChatCard
      convoId={convo._id}
      name="Komi"
      badge={<AiBadge />}
      timestamp={convo.lastMessage?.createdAt ? new Date(convo.lastMessage.createdAt) : undefined}
      isActive={activeConversationId === convo._id}
      onSelect={handleSelect}
      unreadCount={unreadCount}
      // dải vàng nghệ bên trái giống "tờ ghi chú" của Komi AI trong khung chat
      className="border-l-[3px]! [border-left-style:solid]! border-[hsl(var(--ai))]!"
      leftSection={
        <>
          <KomiAvatar type="sidebar" />
          {unreadCount > 0 && <UnreadCountBadge unreadCount={unreadCount} />}
        </>
      }
      subtitle={
        <p
          className={cn(
            "truncate text-sm",
            unreadCount > 0 ? "font-medium text-foreground" : "text-muted-foreground"
          )}
        >
          {convo.lastMessage?.content || "Hỏi về tin nhắn và tài liệu của bạn"}
        </p>
      }
    />
  );
};

export default KomiAiCard;
