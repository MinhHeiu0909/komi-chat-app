export interface Participant {
  _id: string;
  displayName: string;
  avatarUrl?: string | null;
  joinedAt: string;
}

export interface SeenUser {
  _id: string;
  displayName?: string;
  avatarUrl?: string | null;
}

export interface Group {
  name: string;
  createdBy: string;
}

export interface LastMessage {
  _id: string;
  content: string;
  createdAt: string;
  sender: {
    _id: string;
    displayName: string;
    avatarUrl?: string | null;
  };
}

export interface Conversation {
  _id: string;
  type: "direct" | "group";
  group: Group;
  participants: Participant[];
  lastMessageAt: string;
  seenBy: SeenUser[];
  lastMessage: LastMessage | null;
  unreadCounts: Record<string, number>; // key = userId, value = unread count
  createdAt: string;
  updatedAt: string;
}

export interface ConversationResponse {
  conversations: Conversation[];
}

// bản trích của tin được trả lời (server lưu sẵn, tối đa 200 ký tự)
export interface ReplyTo {
  messageId: string;
  senderId: string;
  content: string;
}

// mỗi người tối đa một cảm xúc cho mỗi tin
export interface Reaction {
  userId: string;
  emoji: string;
}

export interface Message {
  _id: string;
  conversationId: string;
  senderId: string;
  content: string | null;
  imgUrl?: string | null;
  replyTo?: ReplyTo;
  reactions?: Reaction[];
  updatedAt?: string | null;
  createdAt: string;
  isOwn?: boolean;
  // id tạm do client sinh ra khi gửi, server trả lại để ghép với tin "đang gửi"
  clientId?: string;
  // chỉ có ở tin nhắn chưa được server xác nhận
  status?: "sending" | "failed";
}

// Câu trả lời Komi AI đang streaming (chưa lưu thành tin nhắn)
export interface AiStream {
  streamId: string;
  conversationId: string;
  botId: string;
  askerId: string; // chỉ người hỏi mới thấy nút "Dừng"
  content: string;
}
