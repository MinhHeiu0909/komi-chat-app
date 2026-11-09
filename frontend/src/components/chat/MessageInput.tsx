import { useAuthStore } from "@/stores/useAuthStore";
import type { Conversation } from "@/types/chat";
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { useSocketStore } from "@/stores/useSocketStore";
import { Button } from "../ui/button";
import { ImagePlus, Reply, Send, X } from "lucide-react";
import { Textarea } from "../ui/textarea";
import { useChatStore } from "@/stores/useChatStore";
import { toast } from "sonner";
import EmojiPicker from "./EmojiPicker";

// ô nhập cao tối đa ~6 dòng, quá thì cuộn bên trong
const MAX_INPUT_HEIGHT = 160;

// "đang nhập…": nhắc lại typing:start mỗi 2,5 giây khi còn gõ (bên nhận
// tự ẩn sau 5 giây), và báo dừng sau 3 giây không gõ
const TYPING_RESEND_MS = 2500;
const TYPING_IDLE_MS = 3000;

const MessageInput = ({ selectedConvo }: { selectedConvo: Conversation }) => {
  const { user } = useAuthStore();
  const { sendDirectMessage, sendGroupMessage, replyingTo, setReplyingTo } = useChatStore();
  const [value, setValue] = useState("");
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // vừa bấm "Trả lời" thì đưa con trỏ vào ô nhập luôn
  useEffect(() => {
    if (replyingTo) textareaRef.current?.focus();
  }, [replyingTo]);

  // tự giãn theo nội dung: đặt về auto rồi lấy scrollHeight
  // (không dùng CSS field-sizing vì Firefox chưa hỗ trợ)
  useLayoutEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, MAX_INPUT_HEIGHT)}px`;
    el.style.overflowY = el.scrollHeight > MAX_INPUT_HEIGHT ? "auto" : "hidden";
  }, [value]);

  const emitTyping = useSocketStore((s) => s.emitTyping);
  const conversationId = selectedConvo._id;
  const typing = useRef({ active: false, lastSentAt: 0, idleTimer: 0 });

  const stopTyping = useCallback(() => {
    window.clearTimeout(typing.current.idleTimer);
    if (!typing.current.active) return;
    typing.current.active = false;
    emitTyping(conversationId, false);
  }, [conversationId, emitTyping]);

  const noteTyping = (text: string) => {
    if (!text.trim()) return stopTyping();

    const now = Date.now();
    if (!typing.current.active || now - typing.current.lastSentAt > TYPING_RESEND_MS) {
      emitTyping(conversationId, true);
      typing.current.lastSentAt = now;
    }
    typing.current.active = true;
    window.clearTimeout(typing.current.idleTimer);
    typing.current.idleTimer = window.setTimeout(stopTyping, TYPING_IDLE_MS);
  };

  // đổi sang cuộc trò chuyện khác hoặc rời trang: báo dừng gõ ở cuộc cũ
  useEffect(() => stopTyping, [stopTyping]);

  if (!user) return;

  const sendMessage = async () => {
    // backend cũng trim; trim ở đây để bản "đang gửi" giống bản thật
    const currValue = value.trim();
    if (!currValue) return;
    const replyTo = replyingTo;
    setValue("");
    setReplyingTo(null);
    stopTyping();

    try {
      if (selectedConvo.type === "direct") {
        const participants = selectedConvo.participants;
        const otherUser = participants.filter((p) => p._id !== user._id)[0];
        await sendDirectMessage(otherUser._id, currValue, undefined, replyTo);
      } else {
        await sendGroupMessage(selectedConvo._id, currValue, undefined, replyTo);
      }
    } catch (error) {
      console.error(error);
      toast.error("Lỗi xảy ra khi gửi tin nhắn. Bạn hãy thử lại!");
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Escape" && replyingTo) {
      e.preventDefault();
      setReplyingTo(null);
      return;
    }

    // Enter gửi, Shift+Enter xuống dòng (mặc định của textarea).
    // isComposing: đang gõ dở bằng bộ gõ (Telex/VNI, IME), Enter lúc này
    // là để chốt chữ chứ không phải để gửi
    if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      sendMessage();
    }
  };

  const replyName = replyingTo
    ? replyingTo.senderId === user._id
      ? "chính bạn"
      : selectedConvo.participants.find((p) => p._id === replyingTo.senderId)?.displayName ?? "tin nhắn"
    : "";

  return (
    <div className="bg-background">
      {/* thanh "Đang trả lời"; Esc hoặc nút X để huỷ */}
      {replyingTo && (
        <div className="mx-3 mt-2 flex items-start gap-2 rounded-md border-l-2 border-primary bg-primary/5 px-3 py-1.5 text-xs">
          <Reply className="size-3.5 mt-0.5 shrink-0 text-primary" aria-hidden="true" />
          <div className="min-w-0 flex-1">
            <span className="block font-semibold text-primary">Đang trả lời {replyName}</span>
            <span className="block truncate text-muted-foreground">{replyingTo.content}</span>
          </div>
          <button
            type="button"
            onClick={() => setReplyingTo(null)}
            aria-label="Huỷ trả lời"
            title="Huỷ (Esc)"
            className="shrink-0 rounded p-0.5 text-muted-foreground hover:bg-primary/10 hover:text-foreground"
          >
            <X className="size-3.5" />
          </button>
        </div>
      )}

    {/* items-end: khi ô nhập giãn cao, các nút nằm ở dòng cuối */}
    <div className="flex items-end gap-2 p-3 min-h-14">
      <Button
        variant="ghost"
        size="icon"
        className="hover:bg-primary/10 transition-smooth"
      >
        <ImagePlus className="size-4" />
      </Button>

      <div className="flex-1 relative">
        <Textarea
          ref={textareaRef}
          rows={1}
          maxLength={4000} // khớp MAX_MESSAGE_LENGTH ở backend
          onKeyDown={handleKeyDown}
          value={value}
          onChange={(e) => {
            setValue(e.target.value);
            noteTyping(e.target.value);
          }}
          placeholder="Soạn tin nhắn... (Shift+Enter để xuống dòng)"
          aria-label="Soạn tin nhắn"
          className="block min-h-9 py-2 pr-12 text-sm md:text-sm leading-5 bg-white border-border/50 focus:border-primary/50 transition-smooth"
        />
        <div className="absolute right-2 bottom-0.5 flex items-center gap-1">
          <Button
            render={<div/>}
            variant="ghost"
            size="icon"
            className="size-8 hover:bg-primary/10 transition-smooth"
          >
            <div>
              <EmojiPicker
                onChange={(emoji: string) => setValue(`${value}${emoji}`)}
              />
            </div>
          </Button>
        </div>
      </div>

      <Button
        onClick={sendMessage}
        className="bg-gradient-chat hover:shadow-glow transition-smooth hover:scale-105"
        disabled={!value.trim()}
      >
        <Send className="size-4 text-white" />
      </Button>
    </div>
    </div>
  );
};

export default MessageInput;
