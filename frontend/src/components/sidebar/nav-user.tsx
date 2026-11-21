import { Bell, ChevronsUpDown, Settings } from "lucide-react";

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from "@/components/ui/sidebar";
import type { User } from "@/types/user";
import Logout from "../auth/Logout";
import { useState } from "react";
import FriendRequestDialog from "../friendRequest/FriendRequestDialog";
import ProfileDialog from "../profile/ProfileDialog";

export function NavUser({ user }: { user: User }) {
  const { isMobile } = useSidebar();
  const [friendRequestOpen, setfriendRequestOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);

  return (
    <>
      <SidebarMenu>
        <SidebarMenuItem>
          <DropdownMenu>
            <DropdownMenuTrigger
              render={
                // w-fit: vùng rê chuột chỉ ôm avatar + tên, không kéo hết chiều ngang thanh bên
                <SidebarMenuButton
                  size="lg"
                  className="w-fit max-w-full pr-3 data-[popup-open]:bg-sidebar-accent data-[popup-open]:text-sidebar-accent-foreground"
                />
              }
            >
              <Avatar className="h-8 w-8 rounded-lg">
                <AvatarImage src={user.avatarUrl} alt={user.displayName} />
                <AvatarFallback className="rounded-lg">
                  {user.displayName.charAt(0)}
                </AvatarFallback>
              </Avatar>

              <div className="grid min-w-0 text-left text-sm leading-tight">
                <span className="truncate font-medium">{user.displayName}</span>
                <span className="truncate text-xs text-muted-foreground">@{user.username}</span>
              </div>

              <ChevronsUpDown className="size-4 text-muted-foreground" />
            </DropdownMenuTrigger>
            <DropdownMenuContent
              className="w-64 rounded-xl p-1.5"
              side={isMobile ? "bottom" : "right"}
              align="end"
              sideOffset={4}
            >
              <DropdownMenuGroup>
                <DropdownMenuLabel className="p-0 font-normal">
                  <div className="flex items-center gap-3 px-2 py-2 text-left text-sm">
                    <Avatar className="size-10 rounded-lg">
                      <AvatarImage src={user.avatarUrl} alt={user.username} />
                      <AvatarFallback className="rounded-lg">
                        {user.displayName.charAt(0)}
                      </AvatarFallback>
                    </Avatar>

                    <div className="grid flex-1 gap-0.5 text-left leading-tight">
                      <span className="truncate text-sm font-semibold text-foreground">
                        {user.displayName}
                      </span>
                      <span className="truncate text-xs text-muted-foreground">@{user.username}</span>
                    </div>
                  </div>
                </DropdownMenuLabel>
              </DropdownMenuGroup>

              <DropdownMenuSeparator className="my-1.5" />

              <DropdownMenuGroup className="space-y-0.5">
                {/* mục cao 40px, chữ 14px, icon 18px cho thoáng (mặc định 28px / 12px) */}
                <DropdownMenuItem onClick={() => setProfileOpen(true)} className="min-h-10 gap-3 rounded-lg px-3 text-sm [&_svg]:size-[18px]!">
                  <Settings className="text-muted-foreground dark:group-focus:text-accent-foreground!" />
                  Cài đặt
                </DropdownMenuItem>

                <DropdownMenuItem onClick={() => setfriendRequestOpen(true)} className="min-h-10 gap-3 rounded-lg px-3 text-sm [&_svg]:size-[18px]!">
                  <Bell className="text-muted-foreground dark:group-focus:text-accent-foreground!" />
                  Thông báo
                </DropdownMenuItem>
              </DropdownMenuGroup>

              <DropdownMenuSeparator className="my-1.5" />

              <Logout />
            </DropdownMenuContent>
            
          </DropdownMenu>
        </SidebarMenuItem>
      </SidebarMenu>

      <FriendRequestDialog
        open={friendRequestOpen}
        setOpen={setfriendRequestOpen}
      />

      <ProfileDialog open={profileOpen} setOpen={setProfileOpen} />
    </>
  );
}
