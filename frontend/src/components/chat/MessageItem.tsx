import { cn, formatMessageTime } from "@/lib/utils";
import type { Conversation, Message, Participant } from "@/types/chat";
import UserAvatar from "./UserAvatar";
import { Card } from "../ui/card";
import { Badge } from "../ui/badge";
import { useChatStore } from "@/stores/useChatStore";

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
  const isSending = message.status === "sending";
  const isFailed = message.status === "failed";

  const participant = selectedConvo.participants.find(
    (p: Participant) => p._id.toString() === message.senderId.toString()
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
        className={cn(
          "flex gap-2 message-bounce mt-1",
          message.isOwn ? "justify-end" : "justify-start"
        )}
      >
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
            className={cn(
              "p-3 transition-opacity",
              message.isOwn ? "chat-bubble-sent border-0" : "chat-bubble-received",
              isSending && "opacity-70",
              isFailed && "ring-1 ring-destructive"
            )}
          >
            <p className="text-sm leading-relaxed wrap-break-word">{message.content}</p>
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
      </div>
    </>
  );
};

export default MessageItem;
