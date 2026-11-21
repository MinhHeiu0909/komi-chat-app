import UserAvatar from "./UserAvatar";
import { Tooltip, TooltipContent, TooltipTrigger } from "../ui/tooltip";

const MAX_SHOWN = 5;

interface SeenAvatarsProps {
  users: { _id: string; displayName?: string; avatarUrl?: string | null }[];
  // userId → giờ xem; dữ liệu cũ không có thì chỉ ghi "đã xem"
  seenAt?: Record<string, string>;
}

// "Bình đã xem lúc 14:32" (hôm nay) / "Bình đã xem lúc 14:32 ngày 20/11"
const seenLabel = (name: string, at?: string) => {
  if (!at) return `${name} đã xem`;
  const date = new Date(at);
  const time = date.toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit", hour12: false });
  const isToday = date.toDateString() === new Date().toDateString();
  const day = date.toLocaleDateString("vi-VN", { day: "2-digit", month: "2-digit" });
  return `${name} đã xem lúc ${time}${isToday ? "" : ` ngày ${day}`}`;
};

// Avatar nhỏ dưới tin cuối: ai đã xem tin đó; rê chuột / focus vào avatar để xem tên và giờ
const SeenAvatars = ({ users, seenAt }: SeenAvatarsProps) => {
  if (users.length === 0) return null;

  const shown = users.slice(0, MAX_SHOWN);
  const rest = users.slice(MAX_SHOWN);

  return (
    <div className="flex items-center -space-x-1 px-1">
      {shown.map((u) => {
        const label = seenLabel(u.displayName || "Ai đó", seenAt?.[u._id]);
        return (
          <Tooltip key={u._id}>
            <TooltipTrigger
              aria-label={label}
              className="rounded-full outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <UserAvatar
                type="mini"
                name={u.displayName ?? "Komi"}
                avatarUrl={u.avatarUrl ?? undefined}
              />
            </TooltipTrigger>
            <TooltipContent side="top">{label}</TooltipContent>
          </Tooltip>
        );
      })}
      {rest.length > 0 && (
        <Tooltip>
          <TooltipTrigger
            className="pl-2 text-[10px] text-muted-foreground tabular-nums outline-none focus-visible:underline"
          >
            +{rest.length}
          </TooltipTrigger>
          <TooltipContent side="top" className="flex-col items-start gap-0.5">
            {rest.map((u) => (
              <span key={u._id}>{seenLabel(u.displayName || "Ai đó", seenAt?.[u._id])}</span>
            ))}
          </TooltipContent>
        </Tooltip>
      )}
    </div>
  );
};

export default SeenAvatars;
