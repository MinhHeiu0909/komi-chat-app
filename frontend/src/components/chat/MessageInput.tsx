import { useAuthStore } from "@/stores/useAuthStore";
import type { Conversation } from "@/types/chat";
import { useLayoutEffect, useRef, useState } from "react";
import { Button } from "../ui/button";
import { ImagePlus, Send } from "lucide-react";
import { Textarea } from "../ui/textarea";
import { useChatStore } from "@/stores/useChatStore";
import { toast } from "sonner";
import EmojiPicker from "./EmojiPicker";

// ô nhập cao tối đa ~6 dòng, quá thì cuộn bên trong
const MAX_INPUT_HEIGHT = 160;

const MessageInput = ({ selectedConvo }: { selectedConvo: Conversation }) => {
  const { user } = useAuthStore();
  const { sendDirectMessage, sendGroupMessage } = useChatStore();
  const [value, setValue] = useState("");
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // tự giãn theo nội dung: đặt về auto rồi lấy scrollHeight
  // (không dùng CSS field-sizing vì Firefox chưa hỗ trợ)
  useLayoutEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, MAX_INPUT_HEIGHT)}px`;
    el.style.overflowY = el.scrollHeight > MAX_INPUT_HEIGHT ? "auto" : "hidden";
  }, [value]);

  if (!user) return;

  const sendMessage = async () => {
    // backend cũng trim; trim ở đây để bản "đang gửi" giống bản thật
    const currValue = value.trim();
    if (!currValue) return;
    setValue("");

    try {
      if (selectedConvo.type === "direct") {
        const participants = selectedConvo.participants;
        const otherUser = participants.filter((p) => p._id !== user._id)[0];
        await sendDirectMessage(otherUser._id, currValue);
      } else {
        await sendGroupMessage(selectedConvo._id, currValue);
      }
    } catch (error) {
      console.error(error);
      toast.error("Lỗi xảy ra khi gửi tin nhắn. Bạn hãy thử lại!");
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    // Enter gửi, Shift+Enter xuống dòng (mặc định của textarea).
    // isComposing: đang gõ dở bằng bộ gõ (Telex/VNI, IME), Enter lúc này
    // là để chốt chữ chứ không phải để gửi
    if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      sendMessage();
    }
  };

  return (
    // items-end: khi ô nhập giãn cao, các nút nằm ở dòng cuối
    <div className="flex items-end gap-2 p-3 min-h-14 bg-background">
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
          onChange={(e) => setValue(e.target.value)}
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
  );
};

export default MessageInput;
