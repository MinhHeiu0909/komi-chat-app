import { useChatStore } from "@/stores/useChatStore";
import type { Conversation } from "@/types/chat";
import { SidebarTrigger } from "../ui/sidebar";
import { useAuthStore } from "@/stores/useAuthStore";
import { Separator } from "../ui/separator";
import UserAvatar from "./UserAvatar";
import StatusBadge from "./StatusBadge";
import GroupChatAvatar from "./GroupChatAvatar";
import { useSocketStore } from "@/stores/useSocketStore";
import MessageSearch from "./MessageSearch";
import KomiAvatar from "./KomiAvatar";
import AiBadge from "./AiBadge";
import { displayNameOf } from "@/lib/utils";
import { Popover, PopoverContent, PopoverTrigger } from "../ui/popover";

const ChatWindowHeader = ({ chat }: { chat?: Conversation }) => {
  const { conversations, activeConversationId } = useChatStore();
  const { user } = useAuthStore();
  const { onlineUsers } = useSocketStore();

  let otherUser;

  chat = chat ?? conversations.find((c) => c._id === activeConversationId);

  if (!chat) {
    return (
      <header className="md:hidden sticky top-0 z-10 flex items-center gap-2 px-4 py-2 w-full">
        <SidebarTrigger className="-ml-1 text-foreground" />
      </header>
    );
  }

  if (chat.type === "direct") {
    const otherUsers = chat.participants.filter((p) => p._id !== user?._id);
    otherUser = otherUsers.length > 0 ? otherUsers[0] : null;

    if (!user || !otherUser) return;
  }

  const statusOf = (p?: { _id: string; isBot?: boolean } | null) =>
    p?.isBot
      ? "Hỏi về tin nhắn và tài liệu của bạn"
      : onlineUsers.includes(p?._id ?? "")
        ? "Đang hoạt động"
        : "Ngoại tuyến";

  return (
    <header className="sticky top-0 z-10 px-2 py-1.5 md:px-4 flex items-center bg-card border-b">
      <div className="flex items-center gap-2 w-full">
        <SidebarTrigger className="-ml-1 text-foreground" />
        <Separator
          orientation="vertical"
          className="mr-2 data-[orientation=vertical]:h-4"
        />

        <div className="py-1 w-full min-w-0 flex items-center gap-3">
          {chat.type === "direct" ? (
            <>
              <div className="relative">
                {otherUser?.isBot ? (
                  <KomiAvatar type="sidebar" />
                ) : (
                  <UserAvatar
                    type={"sidebar"}
                    name={otherUser?.displayName || "Moji"}
                    avatarUrl={otherUser?.avatarUrl || undefined}
                  />
                )}
                {/* bot không có trạng thái online */}
                {!otherUser?.isBot && (
                  <StatusBadge
                    status={
                      onlineUsers.includes(otherUser?._id ?? "") ? "online" : "offline"
                    }
                  />
                )}
              </div>
              <div className="min-w-0">
                <div className="flex min-w-0 items-center gap-1.5">
                  <h2 className="truncate font-semibold leading-tight text-foreground">
                    {displayNameOf(otherUser)}
                  </h2>
                  {otherUser?.isBot && <AiBadge />}
                </div>
                <p className="truncate text-xs text-muted-foreground">
                  {statusOf(otherUser)}
                </p>
              </div>
            </>
          ) : (
            // nhóm: rê chuột hoặc bấm vào avatar / tên nhóm để xem danh sách thành viên
            <Popover>
              <PopoverTrigger
                openOnHover
                delay={200}
                aria-label={`Xem thành viên nhóm ${chat.group?.name ?? ""}`}
                className="-mx-1.5 flex min-w-0 items-center gap-3 rounded-lg px-1.5 py-1 text-left outline-none hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring data-[popup-open]:bg-muted"
              >
                <GroupChatAvatar participants={chat.participants} type="chat" />
                <div className="min-w-0">
                  <h2 className="truncate font-semibold leading-tight text-foreground">
                    {chat.group?.name}
                  </h2>
                  <p className="truncate text-xs text-muted-foreground">
                    {chat.participants.length} thành viên
                  </p>
                </div>
              </PopoverTrigger>
              <PopoverContent align="start" className="w-72 max-w-[calc(100vw-2rem)] gap-1 p-2">
                <p className="px-2 pt-1 pb-1.5 text-xs font-medium text-muted-foreground">
                  {chat.participants.length} thành viên
                </p>
                <ul className="max-h-72 overflow-y-auto beautiful-scrollbar">
                  {chat.participants.map((p) => (
                    <li key={p._id} className="flex items-center gap-2.5 rounded-md px-2 py-1.5">
                      {p.isBot ? (
                        <KomiAvatar type="chat" />
                      ) : (
                        <UserAvatar
                          type="chat"
                          name={p.displayName}
                          avatarUrl={p.avatarUrl ?? undefined}
                        />
                      )}
                      <div className="min-w-0">
                        <p className="flex items-center gap-1.5 truncate text-sm font-medium text-foreground">
                          <span className="truncate">{displayNameOf(p)}</span>
                          {p.isBot && <AiBadge />}
                          {p._id === user?._id && (
                            <span className="font-normal text-muted-foreground">(bạn)</span>
                          )}
                        </p>
                        <p className="truncate text-xs text-muted-foreground">{statusOf(p)}</p>
                      </div>
                    </li>
                  ))}
                </ul>
              </PopoverContent>
            </Popover>
          )}

          <MessageSearch key={chat._id} convo={chat} />
        </div>
      </div>
    </header>
  );
};

export default ChatWindowHeader;
