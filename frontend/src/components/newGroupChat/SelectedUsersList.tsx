import type { Friend } from "@/types/user";
import UserAvatar from "../chat/UserAvatar";
import { X } from "lucide-react";

interface SelectedUsersListProps {
  invitedUsers: Friend[];
  onRemove: (user: Friend) => void;
}

const SelectedUsersList = ({ invitedUsers, onRemove }: SelectedUsersListProps) => {
  if (invitedUsers.length === 0) {
    return;
  }
  return (
    <div className="flex flex-wrap gap-2">
      {invitedUsers.map((user) => (
        <span
          key={user._id}
          className="flex items-center gap-1.5 rounded-full bg-primary/10 py-1 pl-1 pr-1 text-sm text-foreground"
        >
          <UserAvatar type="chat" name={user.displayName} avatarUrl={user.avatarUrl} />
          <span className="max-w-32 truncate">{user.displayName}</span>
          <button
            type="button"
            onClick={() => onRemove(user)}
            aria-label={`Bỏ ${user.displayName}`}
            className="flex size-5 items-center justify-center rounded-full text-muted-foreground outline-none transition-colors hover:bg-destructive hover:text-white focus-visible:ring-2 focus-visible:ring-ring"
          >
            <X className="size-3" />
          </button>
        </span>
      ))}
    </div>
  );
};

export default SelectedUsersList;
