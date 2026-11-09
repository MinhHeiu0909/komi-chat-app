import { create } from "zustand";
import { io, type Socket } from "socket.io-client";
import { useAuthStore } from "./useAuthStore";
import type { SocketState } from "@/types/store";
import { useChatStore } from "./useChatStore";
import { refreshAccessToken } from "@/lib/axios";

const baseURL = import.meta.env.VITE_SOCKET_URL;

const AUTH_ERROR_CODES = ["TOKEN_INVALID", "TOKEN_MISSING"];

// Người gửi nhắc lại typing:start vài giây một lần khi còn gõ. Quá thời gian
// này không nghe gì thì coi như đã dừng (phòng khi mất sự kiện typing:stop).
const TYPING_TTL_MS = 5000;
const typingTimers = new Map<string, ReturnType<typeof setTimeout>>();

export const useSocketStore = create<SocketState>((set, get) => {
  const setTyping = (conversationId: string, userId: string, isTyping: boolean) => {
    const key = `${conversationId}:${userId}`;
    clearTimeout(typingTimers.get(key));
    typingTimers.delete(key);

    const current = get().typingUsers[conversationId] ?? [];
    const others = current.filter((id) => id !== userId);
    const next = isTyping ? [...others, userId] : others;

    if (isTyping) {
      typingTimers.set(key, setTimeout(() => setTyping(conversationId, userId, false), TYPING_TTL_MS));
    }

    // không đổi gì thì không set để tránh render lại
    if (next.length === current.length && next.every((id, i) => id === current[i])) return;
    set({ typingUsers: { ...get().typingUsers, [conversationId]: next } });
  };

  const clearAllTyping = () => {
    typingTimers.forEach((timer) => clearTimeout(timer));
    typingTimers.clear();
    set({ typingUsers: {} });
  };

  return {
    socket: null,
    onlineUsers: [],
    typingUsers: {},
    emitTyping: (conversationId, isTyping) => {
      get().socket?.emit(isTyping ? "typing:start" : "typing:stop", conversationId);
    },
    connectSocket: () => {
      const existingSocket = get().socket;

      if (existingSocket) return; // tránh tạo nhiều socket

      const socket: Socket = io(baseURL, {
        // Hàm thay vì giá trị cố định: mỗi lần (re)connect sẽ lấy access token
        // mới nhất. Trước đây token được chốt lúc tạo socket nên sau 30 phút
        // mọi lần reconnect đều bị server từ chối.
        auth: (cb) => cb({ token: useAuthStore.getState().accessToken }),
        transports: ["websocket"],
      });

      set({ socket });

      let hasConnected = false;
      let refreshingToken = false;

      socket.on("connect", () => {
        // kết nối lại sau khi mất mạng: đồng bộ lại danh sách chat
        // vì có thể đã bỏ lỡ tin nhắn trong lúc mất kết nối
        if (hasConnected) {
          useChatStore.getState().fetchConversations();
        }
        hasConnected = true;
      });

      socket.on("connect_error", async (err: Error & { data?: { code?: string } }) => {
        // Server từ chối ở middleware thì socket.io sẽ KHÔNG tự thử lại,
        // nên phải refresh token rồi tự gọi connect().
        if (socket.active || refreshingToken) return;
        if (!AUTH_ERROR_CODES.includes(err.data?.code ?? "")) return;

        refreshingToken = true;
        try {
          await refreshAccessToken();
          socket.connect();
        } catch {
          useAuthStore.getState().clearState();
        } finally {
          refreshingToken = false;
        }
      });

      // online users
      socket.on("online-users", (userIds) => {
        set({ onlineUsers: userIds });
      });

      // người khác đang gõ (server đã kiểm tra họ là thành viên)
      socket.on("typing", ({ conversationId, userId, isTyping }) => {
        // tab khác của chính mình cũng nhận được, bỏ qua
        if (userId === useAuthStore.getState().user?._id) return;
        setTyping(conversationId, userId, isTyping);
      });

      // mất kết nối thì không còn biết ai đang gõ
      socket.on("disconnect", clearAllTyping);

      // new message
      socket.on("new-message", ({ message, conversation, unreadCounts }) => {
        // người gửi vừa gửi xong thì thôi hiện "đang nhập"
        setTyping(message.conversationId, message.senderId, false);
        useChatStore.getState().addMessage(message);

        const lastMessage = {
          _id: conversation.lastMessage._id,
          content: conversation.lastMessage.content,
          createdAt: conversation.lastMessage.createdAt,
          sender: {
            _id: conversation.lastMessage.senderId,
            displayName: "",
            avatarUrl: null,
          },
        };

        const updatedConversation = {
          ...conversation,
          lastMessage,
          unreadCounts,
        };

        if (useChatStore.getState().activeConversationId === message.conversationId) {
          useChatStore.getState().markAsSeen();
        }

        useChatStore.getState().updateConversation(updatedConversation);
      });

      // read message
      socket.on("read-message", ({ conversation, lastMessage }) => {
        const updated = {
          _id: conversation._id,
          lastMessage,
          lastMessageAt: conversation.lastMessageAt,
          unreadCounts: conversation.unreadCounts,
          seenBy: conversation.seenBy,
        };

        useChatStore.getState().updateConversation(updated);
      });

      // new conversation (nhóm hoặc 1-1); server đã tự đưa socket vào room
      socket.on("new-group", (conversation) => {
        useChatStore.getState().addConvo(conversation, { activate: false });
      });
    },
    disconnectSocket: () => {
      const socket = get().socket;
      if (socket) {
        socket.disconnect();
        set({ socket: null });
      }
      clearAllTyping();
    },
  };
});
