import { cn, formatMessageTime } from "@/lib/utils";
import type { Conversation, Message, Participant } from "@/types/chat";
import UserAvatar from "./UserAvatar";
import { Card } from "../ui/card";
import { Badge } from "../ui/badge";
import { useChatStore } from "@/stores/useChatStore";
import { useAuthStore } from "@/stores/useAuthStore";
import { Reply } from "lucide-react";
import { toast } from "sonner";

// Cuộn tới tin gốc và nháy viền để người dùng thấy nó ở đâu
const jumpToMessage = (messageId: string) => {
  const el = document.getElementById(`msg-${messageId}`);
  if (!el) {
    toast.info("Tin gốc nằm ở đoạn chat cũ hơn. Cuộn lên để tải thêm.");
    return;
  }
  el.scrollIntoView({ behavior: "smooth", block: "center" });
  // nháy bong bóng (không phải khung ngoài, vì khung ngoài đang có animation nảy vào)
  const bubble = el.querySelector<HTMLElement>("[data-bubble]") ?? el;
  bubble.classList.add("reply-target-flash");
  window.setTimeout(() => bubble.classList.remove("reply-target-flash"), 1500);
};

interface MessageItemProps {
  message: Message;
  index: number;
  messages: Message[];
  selectedConvo: Conversation;
  lastMessageStatus: "delivered" | "seen";
}

const MessageItem = ({
  message,
  index,
  messages,
  selectedConvo,
  lastMessageStatus,
}: MessageItemProps) => {
  const prev = index + 1 < messages.length ? messages[index + 1] : undefined;

  const isShowTime =
    index === 0 ||
    new Date(message.createdAt).getTime() -
      new Date(prev?.createdAt || 0).getTime() >
      300000; // 5 phút

  const isGroupBreak = isShowTime || message.senderId !== prev?.senderId;

  const retryMessage = useChatStore((s) => s.retryMessage);
  const setReplyingTo = useChatStore((s) => s.setReplyingTo);
  const currentUserId = useAuthStore((s) => s.user?._id);
  const isSending = message.status === "sending";
  const isFailed = message.status === "failed";

  const nameOf = (userId: string) =>
    userId === currentUserId
      ? "Bạn"
      : selectedConvo.participants.find((p) => p._id === userId)?.displayName ?? "Ai đó";

  const participant = selectedConvo.participants.find(
    (p: Participant) => p._id.toString() === message.senderId.toString()
  );

  // chỉ trả lời được tin đã lưu trên server
  const canReply = !message.status;
  const replyButton = canReply && (
    <button
      type="button"
      onClick={() => setReplyingTo(message)}
      aria-label="Trả lời tin nhắn này"
      title="Trả lời"
      className="self-center shrink-0 rounded-full p-1.5 text-muted-foreground hover:bg-primary/10 hover:text-primary opacity-0 group-hover:opacity-100 focus-visible:opacity-100 [@media(hover:none)]:opacity-100 transition-opacity"
    >
      <Reply className="size-4" />
    </button>
  );

  return (
    <>
      {/* time */}
      {isShowTime && (
        <span className="flex justify-center text-xs text-muted-foreground px-1">
          {formatMessageTime(new Date(message.createdAt))}
        </span>
      )}

      <div
        id={`msg-${message._id}`}
        className={cn(
          "group flex gap-2 message-bounce mt-1 rounded-lg",
          message.isOwn ? "justify-end" : "justify-start"
        )}
      >
        {/* tin của mình: nút trả lời nằm bên trái bong bóng */}
        {message.isOwn && replyButton}

        {/* avatar */}
        {!message.isOwn && (
          <div className="w-8">
            {isGroupBreak && (
              <UserAvatar
                type="chat"
                name={participant?.displayName ?? "Komi"}
                avatarUrl={participant?.avatarUrl ?? undefined}
              />
            )}
          </div>
        )}

        {/* tin nhắn */}
        <div
          className={cn(
            "max-w-xs lg:max-w-md space-y-1 flex flex-col",
            message.isOwn ? "items-end" : "items-start"
          )}
        >
          <Card
            data-bubble
            className={cn(
              "p-3 transition-opacity",
              message.isOwn ? "chat-bubble-sent border-0" : "chat-bubble-received",
              isSending && "opacity-70",
              isFailed && "ring-1 ring-destructive"
            )}
          >
            {/* trích dẫn tin được trả lời; bấm để cuộn tới tin gốc */}
            {message.replyTo && (
              <button
                type="button"
                onClick={() => jumpToMessage(message.replyTo!.messageId)}
                className={cn(
                  "mb-2 block w-full text-left rounded-md border-l-2 px-2 py-1 text-xs",
                  message.isOwn
                    ? "border-white/70 bg-white/15 hover:bg-white/25"
                    : "border-primary/60 bg-primary/5 hover:bg-primary/10"
                )}
              >
                <span className="block font-semibold">
                  {nameOf(message.replyTo.senderId)}
                </span>
                <span className="block line-clamp-2 opacity-80 wrap-break-word">
                  {message.replyTo.content || "Tin nhắn"}
                </span>
              </button>
            )}
            <p className="text-sm leading-relaxed wrap-break-word whitespace-pre-wrap">{message.content}</p>
          </Card>

          {/* đang gửi / gửi lỗi */}
          {isSending && (
            <span className="text-xs text-muted-foreground">Đang gửi…</span>
          )}
          {isFailed && message.clientId && (
            <button
              type="button"
              onClick={() => retryMessage(message.conversationId, message.clientId!)}
              className="text-xs text-destructive hover:underline"
            >
              Gửi không thành công · Thử lại
            </button>
          )}

          {/* seen/ delivered */}
          {message.isOwn && !message.status && message._id === selectedConvo.lastMessage?._id && (
            <Badge
              variant="outline"
              className={cn(
                "text-xs px-1.5 py-0.5 h-4 border-0",
                lastMessageStatus === "seen"
                  ? "bg-primary/20 text-primary"
                  : "bg-muted text-muted-foreground"
              )}
            >
              {lastMessageStatus === "seen" ? "Đã xem" : "Đã gửi"}
            </Badge>
          )}
        </div>

        {/* tin của người khác: nút trả lời nằm bên phải bong bóng */}
        {!message.isOwn && replyButton}
      </div>
    </>
  );
};

export default MessageItem;
