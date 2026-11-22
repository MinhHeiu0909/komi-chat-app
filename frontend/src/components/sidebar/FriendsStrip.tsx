import { useEffect, useState } from "react";
import { Search, X } from "lucide-react";
import { findMatches } from "@/lib/textSearch";
import { useLocation, useNavigate } from "react-router";
import { useFriendStore } from "@/stores/useFriendStore";
import { useSocketStore } from "@/stores/useSocketStore";
import { useChatStore } from "@/stores/useChatStore";
import { SidebarGroup, SidebarGroupLabel, useSidebar } from "@/components/ui/sidebar";
import UserAvatar from "../chat/UserAvatar";
import { cn } from "@/lib/utils";
import type { Friend } from "@/types/user";

// "Trần Thị Bình" → "Bình": thẻ hẹp nên chỉ hiện tên gọi
const givenName = (displayName: string) => displayName.trim().split(/\s+/).pop() ?? displayName;

/**
 * Danh bạ: mọi bạn bè thành thẻ tên trên một hàng ngang cuộn được,
 * người đang online xếp trước và sáng màu. Bấm thẻ để mở chat riêng.
 * Nút kính lúp: lọc bạn bè theo tên / username (không phân biệt dấu), thay cho "Gửi tin nhắn mới".
 */
const FriendsStrip = () => {
  const { friends, getFriends } = useFriendStore();
  const onlineUsers = useSocketStore((s) => s.onlineUsers);
  const { conversations, messages, setActiveConversation, fetchMessages, createConversation } =
    useChatStore();
  const { setOpenMobile } = useSidebar();
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const [searching, setSearching] = useState(false);
  const [query, setQuery] = useState("");

  useEffect(() => {
    getFriends();
  }, [getFriends]);

  const isOnline = (id: string) => onlineUsers.includes(id);
  const sorted = [...friends].sort(
    (a, b) =>
      Number(isOnline(b._id)) - Number(isOnline(a._id)) ||
      a.displayName.localeCompare(b.displayName, "vi"),
  );
  const onlineCount = friends.filter((f) => isOnline(f._id)).length;
  // gõ "binh" ra "Trần Thị Bình" (cùng cách tìm tin nhắn, lib/textSearch)
  const shown = query.trim()
    ? sorted.filter(
        (f) => findMatches(f.displayName, query).length > 0 || findMatches(f.username, query).length > 0,
      )
    : sorted;

  const closeSearch = () => {
    setSearching(false);
    setQuery("");
  };

  const openChat = async (friend: Friend) => {
    const existing = conversations.find(
      (c) => c.type === "direct" && c.participants.some((p) => p._id === friend._id),
    );
    if (existing) {
      setActiveConversation(existing._id);
      if (!messages[existing._id]) await fetchMessages();
    } else {
      // server dùng findOrCreateDirectConversation, không tạo trùng
      await createConversation("direct", "", [friend._id]);
      await fetchMessages();
    }
    setOpenMobile(false);
    closeSearch();
    if (pathname !== "/") navigate("/");
  };

  return (
    <SidebarGroup className="py-1">
      {searching ? (
        <div className="relative mx-1 mb-2">
          <Search
            className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
            aria-hidden="true"
          />
          <input
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Escape") closeSearch();
              // Enter: mở chat với người khớp đầu tiên
              if (e.key === "Enter" && !e.nativeEvent.isComposing && shown[0]) openChat(shown[0]);
            }}
            placeholder="Tìm bạn bè để nhắn tin"
            aria-label="Tìm bạn bè để nhắn tin"
            className="h-9 w-full rounded-full border bg-background pr-9 pl-9 text-sm outline-none transition-colors placeholder:text-muted-foreground focus:border-primary/60 focus:ring-2 focus:ring-ring/30"
          />
          <button
            type="button"
            onClick={closeSearch}
            aria-label="Đóng tìm kiếm"
            className="absolute top-1/2 right-1.5 flex size-6 -translate-y-1/2 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-destructive hover:text-white"
          >
            <X className="size-3.5" />
          </button>
        </div>
      ) : (
        <div className="flex items-center justify-between pr-1">
          <SidebarGroupLabel>Danh bạ</SidebarGroupLabel>
          {friends.length > 0 && (
            <div className="flex items-center gap-1">
              <span className="text-xs text-muted-foreground tabular-nums">
                {onlineCount}/{friends.length} online
              </span>
              <button
                type="button"
                onClick={() => setSearching(true)}
                aria-label="Tìm bạn bè để nhắn tin"
                title="Tìm bạn bè để nhắn tin"
                className="group/icon flex size-7 items-center justify-center rounded-full outline-none hover:bg-sidebar-accent focus-visible:ring-2 focus-visible:ring-ring"
              >
                <Search className="size-4 transition-transform group-hover/icon:scale-125 motion-reduce:transform-none" />
              </button>
            </div>
          )}
        </div>
      )}

      {friends.length === 0 ? (
        <p className="px-2 pb-1 text-xs text-muted-foreground">
          Chưa có bạn bè nào. Dùng nút kết bạn ở mục Bạn bè bên dưới.
        </p>
      ) : shown.length === 0 ? (
        <p className="px-2 pb-2 text-sm text-muted-foreground">
          Không có bạn bè nào tên “{query.trim()}”. Muốn kết bạn mới, dùng nút kết bạn ở mục Bạn bè.
        </p>
      ) : (
        <ul className="flex gap-1 overflow-x-auto px-1 pb-2 beautiful-scrollbar">
          {shown.map((friend) => {
            const online = isOnline(friend._id);
            return (
              <li key={friend._id} className="shrink-0">
                {/* tên dưới avatar; online thì sáng, offline thì mờ (không dùng chấm xanh) */}
                <button
                  type="button"
                  onClick={() => openChat(friend)}
                  title={`${friend.displayName} (${online ? "đang online" : "offline"})`}
                  aria-label={`Nhắn tin với ${friend.displayName}, ${online ? "đang online" : "offline"}`}
                  className="flex w-16 flex-col items-center gap-1 rounded-lg px-1 py-1.5 outline-none transition-colors hover:bg-sidebar-accent focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <UserAvatar
                    type="sidebar"
                    name={friend.displayName}
                    avatarUrl={friend.avatarUrl}
                    className={cn(
                      "transition-[opacity,filter]",
                      online ? "ring-2 ring-primary/60 ring-offset-2 ring-offset-sidebar" : "opacity-40 grayscale"
                    )}
                  />
                  <span
                    className={cn(
                      "w-full truncate text-center text-xs",
                      online ? "font-semibold text-foreground" : "text-muted-foreground"
                    )}
                  >
                    {givenName(friend.displayName)}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </SidebarGroup>
  );
};

export default FriendsStrip;
