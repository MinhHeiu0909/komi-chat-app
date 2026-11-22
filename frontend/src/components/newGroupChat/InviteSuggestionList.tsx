import type { Friend } from "@/types/user";
import UserAvatar from "../chat/UserAvatar";
import { Check } from "lucide-react";
import { cn } from "@/lib/utils";

interface InviteSuggestionListProps {
  filteredFriends: Friend[];
  selectedIds: string[];
  onSelect: (friend: Friend) => void;
  emptyText: string;
}

// Danh sách bạn bè để tích chọn; bấm lần nữa để bỏ chọn
const InviteSuggestionList = ({
  filteredFriends,
  selectedIds,
  onSelect,
  emptyText,
}: InviteSuggestionListProps) => {
  if (filteredFriends.length === 0) {
    return <p className="rounded-lg border border-dashed px-3 py-6 text-center text-muted-foreground">{emptyText}</p>;
  }

  return (
    <ul className="max-h-60 overflow-y-auto rounded-lg border beautiful-scrollbar">
      {filteredFriends.map((friend) => {
        const selected = selectedIds.includes(friend._id);
        return (
          <li key={friend._id} className="border-b last:border-b-0">
            <button
              type="button"
              role="checkbox"
              aria-checked={selected}
              aria-label={`${friend.displayName} (@${friend.username})`}
              onClick={() => onSelect(friend)}
              className={cn(
                "flex w-full items-center gap-3 px-3 py-2.5 text-left outline-none transition-colors hover:bg-muted focus-visible:bg-muted",
                selected && "bg-primary/5"
              )}
            >
              <UserAvatar type="chat" name={friend.displayName} avatarUrl={friend.avatarUrl} />
              <span className="min-w-0 flex-1">
                <span className="block truncate font-medium">{friend.displayName}</span>
                <span className="block truncate text-xs text-muted-foreground">@{friend.username}</span>
              </span>
              <span
                className={cn(
                  "flex size-5 shrink-0 items-center justify-center rounded-md border transition-colors",
                  selected ? "border-primary bg-primary text-primary-foreground" : "border-input"
                )}
                aria-hidden="true"
              >
                {selected && <Check className="size-3.5 stroke-3" />}
              </span>
            </button>
          </li>
        );
      })}
    </ul>
  );
};

export default InviteSuggestionList;
