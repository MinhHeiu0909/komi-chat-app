import { useFriendStore } from "@/stores/useFriendStore";
import { useState } from "react";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "../ui/dialog";
import { Button } from "../ui/button";
import { Plus, Search, Users } from "lucide-react";
import { Label } from "../ui/label";
import { Input } from "../ui/input";
import type { Friend } from "@/types/user";
import InviteSuggestionList from "../newGroupChat/InviteSuggestionList";
import SelectedUsersList from "../newGroupChat/SelectedUsersList";
import { toast } from "sonner";
import { useChatStore } from "@/stores/useChatStore";

const NewGroupChatModal = () => {
  const [open, setOpen] = useState(false);
  const [groupName, setGroupName] = useState("");
  const [search, setSearch] = useState("");
  const { friends, getFriends } = useFriendStore();
  const [invitedUsers, setInvitedUsers] = useState<Friend[]>([]);
  const { loading, createConversation } = useChatStore();

  const handleGetFriends = async () => {
    await getFriends();
  };

  const handleToggleFriend = (friend: Friend) => {
    setInvitedUsers((users) =>
      users.some((u) => u._id === friend._id)
        ? users.filter((u) => u._id !== friend._id)
        : [...users, friend],
    );
  };

  const handleRemoveFriend = (friend: Friend) => {
    setInvitedUsers(invitedUsers.filter((u) => u._id !== friend._id));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    try {
      e.preventDefault();
      if (invitedUsers.length === 0) {
        toast.warning("Bạn phải mời ít nhất 1 thành viên vào nhóm");
        return;
      }

      await createConversation(
        "group",
        groupName,
        invitedUsers.map((u) => u._id),
      );

      setGroupName("");
      setSearch("");
      setInvitedUsers([]);
      setOpen(false);
    } catch (error) {
      console.error(
        "Lỗi xảy ra khi handleSubmit trong NewGroupChatModal:",
        error,
      );
    }
  };

  // danh sách luôn hiện; gõ để lọc theo tên hiển thị hoặc username
  const keyword = search.trim().toLowerCase();
  const filteredFriends = friends.filter(
    (friend) =>
      friend.displayName.toLowerCase().includes(keyword) ||
      friend.username.toLowerCase().includes(keyword),
  );

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        render={
          <Button
            variant="ghost"
            onClick={handleGetFriends}
            aria-label="Tạo nhóm chat"
            title="Tạo nhóm chat"
            className="group/icon z-10 size-7 rounded-full hover:bg-sidebar-accent"
          />
        }
      >
        {/* icon nhóm + dấu cộng; rê chuột thì phóng to như icon "Gửi tin nhắn mới" */}
        <span className="relative transition-transform group-hover/icon:scale-125 motion-reduce:transform-none">
          <Users className="size-4" />
          <Plus
            className="absolute -right-1.5 -bottom-1 size-2.5 rounded-full bg-sidebar stroke-[3.5]"
            aria-hidden="true"
          />
        </span>
      </DialogTrigger>

      <DialogContent className="gap-5 p-6 text-sm sm:max-w-lg">
        <DialogHeader className="gap-1.5">
          <DialogTitle className="flex items-center gap-2 text-lg font-semibold">
            <Users className="size-5 text-primary" />
            Tạo nhóm chat mới
          </DialogTitle>
          <DialogDescription className="text-sm">
            Đặt tên nhóm và chọn bạn bè muốn mời.
          </DialogDescription>
        </DialogHeader>

        <form className="space-y-5" onSubmit={handleSubmit}>
          {/* tên nhóm */}
          <div className="space-y-2">
            <Label htmlFor="groupName" className="text-sm font-medium">
              Tên nhóm
            </Label>
            <Input
              id="groupName"
              placeholder="Ví dụ: Dự án website Q4"
              className="h-11 px-3.5 text-sm md:text-sm"
              value={groupName}
              onChange={(e) => setGroupName(e.target.value)}
              required
            />
          </div>

          {/* mời thành viên */}
          <div className="space-y-2">
            <div className="flex items-baseline justify-between">
              <Label htmlFor="invite" className="text-sm font-medium">
                Mời thành viên
              </Label>
              <span className="text-xs text-muted-foreground tabular-nums">
                Đã chọn {invitedUsers.length}
              </span>
            </div>

            {/* người đã chọn */}
            <SelectedUsersList
              invitedUsers={invitedUsers}
              onRemove={handleRemoveFriend}
            />

            <div className="relative">
              <Search
                className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
                aria-hidden="true"
              />
              <Input
                id="invite"
                placeholder="Tìm bạn bè theo tên"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="h-11 pl-10 pr-3.5 text-sm md:text-sm"
              />
            </div>

            <InviteSuggestionList
              filteredFriends={filteredFriends}
              selectedIds={invitedUsers.map((u) => u._id)}
              onSelect={handleToggleFriend}
              emptyText={
                friends.length === 0
                  ? "Bạn chưa có bạn bè nào để mời."
                  : "Không có bạn bè nào khớp tên này."
              }
            />
          </div>

          <DialogFooter className="gap-2 sm:gap-2">
            <DialogClose
              render={
                <Button
                  type="button"
                  variant="outline"
                  className="h-10 flex-1 hover:border-destructive hover:bg-destructive hover:text-white dark:hover:bg-destructive"
                />
              }
            >
              Huỷ
            </DialogClose>
            <Button
              type="submit"
              disabled={loading}
              className="h-10 flex-1 bg-primary text-primary-foreground hover:bg-primary/90"
            >
              {loading
                ? "Đang tạo..."
                : `Tạo nhóm${invitedUsers.length ? ` (${invitedUsers.length + 1} người)` : ""}`}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
};

export default NewGroupChatModal;
