import { cn, formatMessageTime } from "@/lib/utils";
import type { Conversation, Message, Participant } from "@/types/chat";
import UserAvatar from "./UserAvatar";
import { Card } from "../ui/card";
import { Badge } from "../ui/badge";
import { useChatStore } from "@/stores/useChatStore";
import { useAuthStore } from "@/stores/useAuthStore";
import { FileText, Reply, SmilePlus } from "lucide-react";
import { useState } from "react";
import { Popover, PopoverContent, PopoverTrigger } from "../ui/popover";
import { REACTIONS, groupReactions } from "@/lib/reactions";
import SeenAvatars from "./SeenAvatars";
import MessageContent from "./MessageContent";
import { formatFileSize } from "@/lib/messageFile";
import { jumpToMessage } from "@/lib/messageJump";
import type { MessageFile } from "@/types/chat";

const actionButtonClass =
  "self-center shrink-0 rounded-full p-1.5 text-muted-foreground hover:bg-primary/10 hover:text-primary opacity-0 group-hover:opacity-100 focus-visible:opacity-100 data-[popup-open]:opacity-100 [@media(hover:none)]:opacity-100 transition-opacity";

const MessageImage = ({
  src,
  href,
  spaced,
}: {
  src: string;
  href?: string;
  spaced: boolean;
}) => {
  const img = (
    <img
      src={src}
      alt="Ảnh trong tin nhắn"
      loading="lazy"
      className={cn(
        "block max-h-72 w-auto max-w-full rounded-md object-contain bg-muted/40",
        spaced && "mb-2"
      )}
    />
  );

  return href ? (
    <a href={href} target="_blank" rel="noopener noreferrer" title="Mở ảnh gốc">
      {img}
    </a>
  ) : (
    img
  );
};

// Thẻ file PDF/Word trong bong bóng; bấm để mở file (tin đang gửi chưa có link)
const MessageFileCard = ({
  file,
  isOwn,
  spaced,
}: {
  file: MessageFile;
  isOwn?: boolean;
  spaced: boolean;
}) => {
  const body = (
    <>
      <FileText className="size-8 shrink-0" aria-hidden="true" />
      <span className="min-w-0">
        <span className="block truncate font-medium">{file.name}</span>
        <span className="block text-xs opacity-75">
          {file.kind === "pdf" ? "PDF" : "Word"} · {formatFileSize(file.size)}
        </span>
      </span>
    </>
  );
  const className = cn(
    "flex w-64 max-w-full items-center gap-2 rounded-md px-2 py-2 text-sm",
    isOwn ? "bg-white/15" : "bg-primary/5",
    spaced && "mb-2"
  );

  return file.url ? (
    <a
      href={file.url}
      target="_blank"
      rel="noopener noreferrer"
      title={`Mở ${file.name}`}
      className={cn(className, isOwn ? "hover:bg-white/25" : "hover:bg-primary/10")}
    >
      {body}
    </a>
  ) : (
    <div className={className}>{body}</div>
  );
};

interface MessageItemProps {
  message: Message;
  index: number;
  messages: Message[];
  selectedConvo: Conversation;
}

const MessageItem = ({
  message,
  index,
  messages,
  selectedConvo,
}: MessageItemProps) => {
  const prev = index + 1 < messages.length ? messages[index + 1] : undefined;

  // messages đã đảo ngược (mới nhất ở index 0), prev là tin cũ hơn liền trước.
  // Hiện giờ khi cách tin trước > 5 phút; tin cũ nhất đã tải (không có prev) luôn hiện.
  const isShowTime =
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

  const toggleReaction = useChatStore((s) => s.toggleReaction);
  const [pickerOpen, setPickerOpen] = useState(false);
  const react = (emoji: string) =>
    toggleReaction(message.conversationId, message._id, emoji);
  const reactionGroups = groupReactions(message.reactions ?? []);
  const myReaction = message.reactions?.find((r) => r.userId === currentUserId)?.emoji;

  // "Đã xem" chỉ tính cho tin cuối: server xoá seenBy mỗi khi có tin mới
  const isLastMessage =
    !message.status && message._id === selectedConvo.lastMessage?._id;
  const seenUsers = isLastMessage
    ? (selectedConvo.seenBy ?? [])
        // dữ liệu cũ trong localStorage có thể chỉ là id
        .map((s) => (typeof s === "string" ? { _id: s } : s))
        .filter((s) => s._id !== currentUserId && s._id !== message.senderId)
        // ưu tiên tên / avatar mới nhất trong danh sách thành viên
        .map((s) => selectedConvo.participants.find((p) => p._id === s._id) ?? s)
    : [];
  const showSeenAvatars = selectedConvo.type === "group" && seenUsers.length > 0;

  // chỉ trả lời / thả cảm xúc được với tin đã lưu trên server
  const canAct = !message.status;
  const actions = canAct && (
    <div
      className={cn(
        "flex items-center self-center",
        // tin của mình: nút nằm bên trái bong bóng nên đảo thứ tự cho cân
        message.isOwn && "flex-row-reverse"
      )}
    >
      <button
        type="button"
        onClick={() => setReplyingTo(message)}
        aria-label="Trả lời tin nhắn này"
        title="Trả lời"
        className={actionButtonClass}
      >
        <Reply className="size-4" />
      </button>

      <Popover open={pickerOpen} onOpenChange={setPickerOpen}>
        <PopoverTrigger
          aria-label="Thả cảm xúc"
          title="Thả cảm xúc"
          className={actionButtonClass}
        >
          <SmilePlus className="size-4" />
        </PopoverTrigger>
        <PopoverContent side="top" className="w-auto flex-row gap-1 rounded-full p-1.5">
          {REACTIONS.map((emoji) => (
            <button
              key={emoji}
              type="button"
              aria-label={`Thả ${emoji}`}
              aria-pressed={myReaction === emoji}
              onClick={() => {
                react(emoji);
                setPickerOpen(false);
              }}
              className={cn(
                "size-9 rounded-full text-xl leading-none transition-transform hover:scale-125 motion-reduce:hover:scale-100",
                myReaction === emoji && "bg-primary/15"
              )}
            >
              {emoji}
            </button>
          ))}
        </PopoverContent>
      </Popover>
    </div>
  );

  return (
    <>
      <div
        id={`msg-${message._id}`}
        className={cn(
          "group flex gap-2 message-bounce mt-1 rounded-lg",
          message.isOwn ? "justify-end" : "justify-start"
        )}
      >
        {/* tin của mình: các nút nằm bên trái bong bóng */}
        {message.isOwn && actions}

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
            "max-w-xs lg:max-w-md min-w-0 space-y-1 flex flex-col",
            message.isOwn ? "items-end" : "items-start"
          )}
        >
          <Card
            data-bubble
            className={cn(
              // max-w-full: khối code / bảng dài thì cuộn ngang bên trong, không đẩy bong bóng tràn ra
              "p-3 transition-opacity max-w-full min-w-0",
              // tin chỉ có ảnh: viền mỏng quanh ảnh thay vì đệm dày
              message.imgUrl && !message.content && !message.replyTo && "p-1",
              message.isOwn ? "chat-bubble-sent border-0" : "chat-bubble-received",
              isSending && "opacity-70",
              isFailed && "ring-1 ring-destructive"
            )}
          >
            {/* trích dẫn tin được trả lời; bấm để cuộn tới tin gốc */}
            {message.replyTo && (
              <button
                type="button"
                onClick={() => jumpToMessage(message.conversationId, message.replyTo!.messageId)}
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
            {message.imgUrl && (
              <MessageImage
                src={message.imgUrl}
                // ảnh đang gửi là ảnh tạm trên máy (blob:), chưa có link để mở
                href={message.status ? undefined : message.imgUrl}
                spaced={Boolean(message.content || message.replyTo)}
              />
            )}
            {message.file && (
              <MessageFileCard
                file={message.file}
                isOwn={message.isOwn}
                spaced={Boolean(message.content)}
              />
            )}
            {message.content && <MessageContent content={message.content} />}
          </Card>

          {/* cảm xúc: bấm vào một ô để thả / gỡ đúng cảm xúc đó */}
          {reactionGroups.length > 0 && (
            <div className="-mt-2 flex flex-wrap gap-1 px-1">
              {reactionGroups.map(({ emoji, userIds }) => {
                const mine = userIds.includes(currentUserId ?? "");
                return (
                  <button
                    key={emoji}
                    type="button"
                    onClick={() => react(emoji)}
                    aria-pressed={mine}
                    title={userIds.map(nameOf).join(", ")}
                    className={cn(
                      "flex items-center gap-1 rounded-full border bg-background px-1.5 py-0.5 text-xs shadow-sm tabular-nums transition-colors",
                      mine
                        ? "border-primary/50 bg-primary/10 text-primary"
                        : "border-border text-muted-foreground hover:bg-muted"
                    )}
                  >
                    <span className="text-sm leading-none">{emoji}</span>
                    {userIds.length > 1 && <span>{userIds.length}</span>}
                  </button>
                );
              })}
            </div>
          )}

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

          {/* nhóm: avatar những người đã xem tin cuối */}
          {showSeenAvatars && <SeenAvatars users={seenUsers} />}

          {/* tin cuối của mình: đã gửi / đã xem (nhóm đã có avatar thì thôi) */}
          {isLastMessage && message.isOwn && !showSeenAvatars && (
            <Badge
              variant="outline"
              className={cn(
                "text-xs px-1.5 py-0.5 h-4 border-0",
                seenUsers.length > 0
                  ? "bg-primary/20 text-primary"
                  : "bg-muted text-muted-foreground"
              )}
            >
              {seenUsers.length > 0 ? "Đã xem" : "Đã gửi"}
            </Badge>
          )}
        </div>

        {/* tin của người khác: các nút nằm bên phải bong bóng */}
        {!message.isOwn && actions}
      </div>

      {/* Nhãn giờ đặt SAU tin trong JSX: danh sách hiển thị bằng
          flex-col-reverse nên nó sẽ nằm phía TRÊN tin trên màn hình */}
      {isShowTime && (
        <span className="flex justify-center text-xs text-muted-foreground px-1 pt-2">
          {formatMessageTime(new Date(message.createdAt))}
        </span>
      )}
    </>
  );
};

export default MessageItem;
