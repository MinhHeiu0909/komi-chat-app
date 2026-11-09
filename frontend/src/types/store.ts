import type { Socket } from "socket.io-client";
import type { Conversation, Message, Reaction } from "./chat";
import type { Friend, FriendRequest, User } from "./user";

export interface AuthState {
  accessToken: string | null;
  user: User | null;
  loading: boolean;

  setAccessToken: (accessToken: string) => void;
  setUser: (user: User) => void;
  clearState: () => void;
  signUp: (
    username: string,
    password: string,
    email: string,
    firstName: string,
    lastName: string
  ) => Promise<boolean>; // true nếu đăng ký thành công
  signIn: (username: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
  fetchMe: () => Promise<void>;
  refresh: () => Promise<void>;
}

export interface ThemeState {
  isDark: boolean;
  toggleTheme: () => void;
  setTheme: (dark: boolean) => void;
}

export interface ChatState {
  conversations: Conversation[];
  messages: Record<
    string,
    {
      items: Message[];
      hasMore: boolean; // infinite-scroll
      nextCursor?: string | null; // phân trang
    }
  >;
  activeConversationId: string | null;
  convoLoading: boolean;
  messageLoading: boolean;
  loading: boolean;
  reset: () => void;

  setActiveConversation: (id: string | null) => void;
  fetchConversations: () => Promise<void>;
  fetchMessages: (conversationId?: string) => Promise<void>;
  // tin đang được trả lời (thanh "Đang trả lời" phía trên ô nhập)
  replyingTo: Message | null;
  setReplyingTo: (message: Message | null) => void;
  // thả / đổi / gỡ cảm xúc (cập nhật ngay, lỗi thì hoàn tác)
  toggleReaction: (conversationId: string, messageId: string, emoji: string) => Promise<void>;
  // cập nhật cảm xúc từ server (socket "message-reaction")
  setMessageReactions: (conversationId: string, messageId: string, reactions: Reaction[]) => void;
  // image: ảnh người dùng chọn; store tự tải lên rồi gửi kèm imgUrl
  sendDirectMessage: (
    recipientId: string,
    content: string,
    image?: File | null,
    replyTo?: Message | null
  ) => Promise<void>;
  sendGroupMessage: (
    conversationId: string,
    content: string,
    image?: File | null,
    replyTo?: Message | null
  ) => Promise<void>;
  // add message
  addMessage: (message: Message) => Promise<void>;
  // update convo
  updateConversation: (conversation: unknown) => void;
  markAsSeen: () => Promise<void>;
  addConvo: (convo: Conversation, options?: { activate?: boolean }) => void;
  retryMessage: (conversationId: string, clientId: string) => Promise<void>;
  createConversation: (
    type: "group" | "direct",
    name: string,
    memberIds: string[]
  ) => Promise<void>;
}

export interface SocketState {
  socket: Socket | null;
  onlineUsers: string[];
  // conversationId -> userId của những người khác đang gõ
  typingUsers: Record<string, string[]>;
  connectSocket: () => void;
  disconnectSocket: () => void;
  emitTyping: (conversationId: string, isTyping: boolean) => void;
}

export interface FriendState {
  friends: Friend[];
  loading: boolean;
  receivedList: FriendRequest[];
  sentList: FriendRequest[];
  searchByUsername: (username: string) => Promise<User | null>;
  addFriend: (to: string, message?: string) => Promise<string>;
  getAllFriendRequests: () => Promise<void>;
  acceptRequest: (requestId: string) => Promise<void>;
  declineRequest: (requestId: string) => Promise<void>;
  getFriends: () => Promise<void>;
}

export type ProfilePatch = Partial<
  Pick<User, "displayName" | "bio" | "phone" | "showOnlineStatus">
>;

export interface UserState {
  updateAvatarUrl: (formData: FormData) => Promise<void>;
  // trả về true nếu lưu thành công (lỗi đã được báo bằng toast)
  updateProfile: (patch: ProfilePatch) => Promise<boolean>;
  changePassword: (currentPassword: string, newPassword: string) => Promise<boolean>;
}
