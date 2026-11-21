import { NavUser } from "@/components/sidebar/nav-user";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar";
import { ChartColumn, FileText, Moon, Sun } from "lucide-react";
import { Link, useLocation } from "react-router";
import { Switch } from "../ui/switch";
import KomiAiCard from "../chat/KomiAiCard";
import NewGroupChatModal from "../chat/NewGroupChatModal";
import GroupChatList from "../chat/GroupChatList";
import AddFriendModal from "../chat/AddFriendModal";
import DirectMessageList from "../chat/DirectMessageList";
import { useThemeStore } from "@/stores/useThemeStore";
import { useAuthStore } from "@/stores/useAuthStore";
import ConversationSkeleton from "../skeleton/ConversationSkeleton";
import { useChatStore } from "@/stores/useChatStore";
import FriendsStrip from "./FriendsStrip";
import HeaderMascot from "./HeaderMascot";
import HeaderScene from "./HeaderScene";
import HeaderScenePicker from "./HeaderScenePicker";
import { useHeaderSceneStore } from "@/stores/useHeaderSceneStore";

export function AppSidebar({ ...props }: React.ComponentProps<typeof Sidebar>) {
  const { isDark, toggleTheme } = useThemeStore();
  const scene = useHeaderSceneStore((s) => s.scene);
  const { user } = useAuthStore();
  const { convoLoading } = useChatStore();
  const { pathname } = useLocation();


  return (
    <Sidebar variant="inset" {...props}>
      {/* Header */}
      <SidebarHeader className="pr-4">
        {/* thẻ tĩnh (trước là nút/link nên rê chuột làm mờ cả thẻ); chỉ công tắc là tương tác được */}
        <div className="relative isolate overflow-hidden rounded-lg px-4 pt-2 pb-1.5">
          {/* nền người dùng chọn (cổ vịt, bầu trời sao, cánh đồng…) */}
          <HeaderScene scene={scene} />

          <div className="relative flex items-center justify-between">
            <div className="flex items-center gap-1">
              <h1 className="text-xl font-bold text-[hsl(var(--wordmark))] [text-shadow:0_1px_2px_rgb(0_0_0/0.35)]">Komi</h1>
              <HeaderScenePicker />
            </div>

            {/* icon có màu riêng để nổi trên nền cổ vịt ở cả hai chế độ */}
            <div className="flex items-center gap-2">
              <Sun className="size-5 text-[hsl(var(--wordmark))]" aria-hidden="true" />

              <Switch
                checked={isDark}
                onCheckedChange={toggleTheme}
                aria-label="Chế độ tối"
                className="h-6! w-11! px-[2px] data-checked:bg-[#0B1F24] data-unchecked:bg-white/35 *:data-[slot=switch-thumb]:size-5! *:data-[slot=switch-thumb]:bg-white!"
              />

              <Moon className="size-5 text-[#C9DDF2]" aria-hidden="true" />
            </div>
          </div>

          {/* linh vật Komi đi qua đi lại */}
          <div className="relative">
            <HeaderMascot />
          </div>
        </div>
      </SidebarHeader>

      {/* Content */}
      {/* thanh cuộn nằm trong thanh bên; pr-2 chừa một khe bên phải để khi thanh cuộn
          (kiểu overlay của macOS) phóng to lúc rê chuột thì nằm trong khe, không đè lên các thẻ */}
      <SidebarContent className="beautiful-scrollbar pr-2">
        {/* Chat với Komi (trợ lý AI) */}
        <SidebarGroup>
          <SidebarGroupContent>
            <KomiAiCard />
          </SidebarGroupContent>
        </SidebarGroup>

        {/* Kho tài liệu chung */}
        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuButton
                  className="h-10 w-fit gap-2.5 px-3 text-sm font-medium [&_svg]:size-5"
                  render={<Link to="/documents" />}
                  isActive={pathname === "/documents"}
                >
                  <FileText />
                  <span>Tài liệu chung</span>
                </SidebarMenuButton>
              </SidebarMenuItem>
              {/* chỉ admin (AI_ADMIN_USERNAMES) thấy; API admin vẫn tự kiểm tra quyền */}
              {user?.isAiAdmin && (
                <SidebarMenuItem>
                  <SidebarMenuButton
                    className="h-10 w-fit gap-2.5 px-3 text-sm font-medium [&_svg]:size-5"
                    render={<Link to="/admin/ai-usage" />}
                    isActive={pathname === "/admin/ai-usage"}
                  >
                    <ChartColumn />
                    <span>Chi phí AI</span>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              )}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        {/* Danh bạ: bạn bè, ai đang online */}
        <FriendsStrip />

        {/* Group Chat */}
        <SidebarGroup>
          <div className="flex items-center justify-between">
            <SidebarGroupLabel>Nhóm chat</SidebarGroupLabel>
            <NewGroupChatModal />
          </div>

          <SidebarGroupContent>
            {convoLoading ? <ConversationSkeleton /> : <GroupChatList />}
          </SidebarGroupContent>
        </SidebarGroup>

        {/* Dirrect Message */}

        <SidebarGroup>
          <div className="flex items-center justify-between">
            <SidebarGroupLabel>Bạn bè</SidebarGroupLabel>
            <AddFriendModal />
          </div>

          <SidebarGroupContent>
            <DirectMessageList />
          </SidebarGroupContent>
        </SidebarGroup>

      </SidebarContent>

      {/* Footer */}
      <SidebarFooter className="pr-4">{user && <NavUser user={user} />}</SidebarFooter>
    </Sidebar>
  );
}
