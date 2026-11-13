import api from "@/lib/axios";
import type { ConversationResponse, Message, Reaction } from "@/types/chat";

interface FetchMessageProps {
  messages: Message[];
  cursor?: string;
}

const pageLimit = 20;

export const chatService = {
  async fetchConversations(): Promise<ConversationResponse> {
    const res = await api.get("/conversations");
    return res.data;
  },

  async fetchMessages(id: string, cursor?: string): Promise<FetchMessageProps> {
    const res = await api.get(
      `/conversations/${id}/messages?limit=${pageLimit}&cursor=${cursor}`
    );

    return { messages: res.data.messages, cursor: res.data.nextCursor };
  },

  async sendDirectMessage(
    recipientId: string,
    content: string = "",
    imgUrl?: string,
    conversationId?: string,
    clientId?: string,
    replyToId?: string
  ): Promise<Message> {
    const res = await api.post("/messages/direct", {
      recipientId,
      content,
      imgUrl,
      conversationId,
      clientId,
      replyToId,
    });

    return res.data.message;
  },

  async sendGroupMessage(
    conversationId: string,
    content: string = "",
    imgUrl?: string,
    clientId?: string,
    replyToId?: string
  ): Promise<Message> {
    const res = await api.post("/messages/group", {
      conversationId,
      content,
      imgUrl,
      clientId,
      replyToId,
    });
    return res.data.message;
  },

  // tải ảnh lên trước, server trả về imgUrl để gửi kèm tin
  async uploadImage(file: File): Promise<string> {
    const form = new FormData();
    form.append("file", file);
    const res = await api.post("/messages/images", form, {
      headers: { "Content-Type": "multipart/form-data" },
    });
    return res.data.imgUrl;
  },

  async toggleReaction(messageId: string, emoji: string): Promise<Reaction[]> {
    const res = await api.post(`/messages/${messageId}/reactions`, { emoji });
    return res.data.reactions;
  },

  // Komi AI tóm tắt tin chưa đọc vào cuộc chat riêng với bot (trả về id cuộc chat đó)
  async summarizeUnread(conversationId: string): Promise<{ conversationId: string; count: number }> {
    const res = await api.post(`/conversations/${conversationId}/summary`);
    return res.data;
  },

  async markAsSeen(conversationId: string) {
    const res = await api.patch(`/conversations/${conversationId}/seen`);
    return res.data; 
  },

  async createConversation(
    type: "direct" | "group",
    name: string,
    memberIds: string[]
  ) {
    const res = await api.post("/conversations", { type, name, memberIds });
    return res.data.conversation;
  },
};