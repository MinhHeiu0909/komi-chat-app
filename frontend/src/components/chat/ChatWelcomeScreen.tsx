import { MessagesSquare } from "lucide-react";
import { SidebarInset } from "../ui/sidebar";
import ChatWindowHeader from "./ChatWindowHeader";

const ChatWelcomeScreen = () => {
  return (
    <SidebarInset className="flex w-full h-full bg-transparent">
      <ChatWindowHeader />
      <div className="flex bg-[hsl(var(--chat-surface))] md:rounded-xl md:border flex-1 items-center justify-center">
        <div className="text-center px-4">
          <div className="size-14 mx-auto mb-4 rounded-xl bg-primary/10 text-primary flex items-center justify-center">
            <MessagesSquare className="size-7" />
          </div>
          <h2 className="text-lg font-semibold mb-1 text-foreground">Chào mừng bạn đến với Komi</h2>
          <p className="text-sm text-muted-foreground">Chọn một cuộc trò chuyện ở bên trái để bắt đầu.</p>
        </div>
      </div>
    </SidebarInset>
  );
};

export default ChatWelcomeScreen;
