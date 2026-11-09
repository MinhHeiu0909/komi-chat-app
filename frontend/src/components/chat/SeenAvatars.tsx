import UserAvatar from "./UserAvatar";

const MAX_SHOWN = 5;

interface SeenAvatarsProps {
  users: { _id: string; displayName?: string; avatarUrl?: string | null }[];
}

// Hàng avatar nhỏ dưới tin cuối trong nhóm: ai đã xem tin đó
const SeenAvatars = ({ users }: SeenAvatarsProps) => {
  if (users.length === 0) return null;

  const names = users.map((u) => u.displayName || "Ai đó").join(", ");
  const shown = users.slice(0, MAX_SHOWN);
  const rest = users.length - shown.length;

  return (
    <div
      className="flex items-center -space-x-1 px-1"
      title={`Đã xem: ${names}`}
      aria-label={`Đã xem: ${names}`}
      role="img"
    >
      {shown.map((u) => (
        <UserAvatar
          key={u._id}
          type="mini"
          name={u.displayName ?? "Komi"}
          avatarUrl={u.avatarUrl ?? undefined}
        />
      ))}
      {rest > 0 && (
        <span className="pl-2 text-[10px] text-muted-foreground tabular-nums">+{rest}</span>
      )}
    </div>
  );
};

export default SeenAvatars;
