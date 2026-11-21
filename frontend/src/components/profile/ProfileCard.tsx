import type { User } from "@/types/user";
import UserAvatar from "../chat/UserAvatar";
import { cn } from "@/lib/utils";
import { useSocketStore } from "@/stores/useSocketStore";
import AvatarUploader from "./AvatarUploader";

interface ProfileCardProps {
  user: User | null;
}

const ProfileCard = ({ user }: ProfileCardProps) => {
  const { onlineUsers } = useSocketStore();
  if (!user) return;

  // đang ẩn trạng thái thì server không đưa mình vào danh sách online
  const hidden = user.showOnlineStatus === false;
  const isOnline = !hidden && onlineUsers.includes(user._id);
  const statusText = hidden ? "Đang ẩn" : isOnline ? "Online" : "Offline";

  return (
    <div>
      {/* chưa có tính năng ảnh bìa: chế độ sáng nền xám dịu, chế độ tối nền đen */}
      <div className="mx-6 h-28 rounded-xl bg-[hsl(var(--muted))] dark:bg-[#0B1012] dark:ring-1 dark:ring-white/5" />

      {/* chỉ avatar đè lên banner; tên và trạng thái nằm hẳn bên dưới banner (sm:pt-14 > 48px đè) */}
      <div className="-mt-12 flex flex-col items-center gap-4 px-6 sm:flex-row sm:items-start sm:px-10">
        <div className="relative shrink-0">
          <UserAvatar
            type="profile"
            name={user.displayName}
            avatarUrl={user.avatarUrl ?? undefined}
            className="ring-4 ring-popover"
          />
          <AvatarUploader />
        </div>

        <div className="min-w-0 flex-1 text-center sm:pt-14 sm:text-left">
          <h2 className="truncate text-2xl font-semibold tracking-tight text-foreground">
            {user.displayName}
          </h2>
          <p className="truncate text-base text-muted-foreground">@{user.username}</p>
        </div>

        {/* trạng thái: chấm có vòng toả ra khi online cho dễ thấy */}
        <span
          className={cn(
            "inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-sm font-medium sm:mt-15",
            isOnline
              ? "bg-[hsl(var(--online)/0.15)] text-emerald-700 dark:text-emerald-300"
              : "bg-muted text-muted-foreground"
          )}
        >
          <span className="relative flex size-3">
            {isOnline && (
              <span className="absolute inline-flex size-full rounded-full bg-[hsl(var(--online))] opacity-75 motion-safe:animate-ping" />
            )}
            <span
              className={cn(
                "relative inline-flex size-3 rounded-full",
                isOnline ? "bg-[hsl(var(--online))]" : "bg-[hsl(var(--offline))]"
              )}
            />
          </span>
          {statusText}
        </span>
      </div>
    </div>
  );
};

export default ProfileCard;
