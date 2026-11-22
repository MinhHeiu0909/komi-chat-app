import { useChatStore } from "@/stores/useChatStore";
import ChatWelcomeScreen from "./ChatWelcomeScreen";
import { SidebarInset, useSidebar } from "../ui/sidebar";
import ChatWindowHeader from "./ChatWindowHeader";
import ChatWindowBody from "./ChatWindowBody";
import MessageInput from "./MessageInput";
import TypingIndicator from "./TypingIndicator";
import { useEffect } from "react";
import ChatWindowSkeleton from "./ChatWindowSkeleton";

const ChatWindowLayout = () => {
  const {
    activeConversationId,
    conversations,
    messageLoading: loading,
    markAsSeen,
  } = useChatStore();

  const selectedConvo =
    conversations.find((c) => c._id === activeConversationId) ?? null;

  // điện thoại: mở cuộc trò chuyện (chọn thẻ, tạo chat mới, tạo nhóm…) thì thu thanh bên lại
  const { setOpenMobile } = useSidebar();
  useEffect(() => {
    if (activeConversationId) setOpenMobile(false);
  }, [activeConversationId, setOpenMobile]);

  useEffect(() => {
    if (!selectedConvo) {
      return;
    }

    const markSeen = async () => {
      try {
        await markAsSeen();
      } catch (error) {
        console.error("Lỗi khi markSeen", error);
      }
    };

    markSeen();
  }, [markAsSeen, selectedConvo]);

  if (!selectedConvo) {
    return <ChatWelcomeScreen />;
  }

  if (loading) {
    return <ChatWindowSkeleton />;
  }

  return (
    <SidebarInset className="flex flex-col h-full flex-1 overflow-hidden md:rounded-xl md:border">
      {/* Header */}
      <ChatWindowHeader chat={selectedConvo} />

      {/* Body */}
      <div className="flex-1 overflow-y-auto bg-[hsl(var(--chat-surface))]">
        <ChatWindowBody />
      </div>

      {/* Footer */}
      <TypingIndicator convo={selectedConvo} />
      {/* key: đổi cuộc trò chuyện thì ô nhập mới tinh, chữ / ảnh đang soạn
          không bị mang sang cuộc khác */}
      <MessageInput key={selectedConvo._id} selectedConvo={selectedConvo} />
    </SidebarInset>
  );
};

export default ChatWindowLayout;
