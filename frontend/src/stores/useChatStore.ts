import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { ChatState } from "@/types/store";
import type { Message } from "@/types/chat";
import { chatService } from "@/services/chatService";
import { useAuthStore } from "./useAuthStore";
import { applyReaction } from "@/lib/reactions";
import { toast } from "sonner";

type MessageEntry = ChatState["messages"][string];

const newClientId = () =>
  typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`;

const isPendingFor = (m: Message, clientId?: string) =>
  Boolean(m.status && clientId && m.clientId === clientId);

export const useChatStore = create<ChatState>()(
  persist(
    (set, get) => {
      // ---- helpers cho tin nhắn gửi đi (optimistic UI) ----

      const updateItems = (
        convoId: string,
        fn: (items: Message[]) => Message[]
      ) => {
        set((state) => {
          const entry: MessageEntry | undefined = state.messages[convoId];
          const items = entry?.items ?? [];
          const next = fn(items);
          if (next === items) return state;

          return {
            messages: {
              ...state.messages,
              [convoId]: {
                items: next,
                hasMore: entry?.hasMore ?? true,
                nextCursor: entry?.nextCursor,
              },
            },
          };
        });
      };

      // Ghép tin nhắn thật (từ HTTP response hoặc socket) với tin "đang gửi".
      // Hai nguồn có thể về theo bất kỳ thứ tự nào, nên phải chịu được cả hai.
      const settleMessage = (incoming: Message) => {
        const { user } = useAuthStore.getState();
        const message = { ...incoming, isOwn: incoming.senderId === user?._id };

        updateItems(message.conversationId, (items) => {
          if (items.some((m) => m._id === message._id)) {
            // đã có tin thật: chỉ cần bỏ bản "đang gửi" còn sót (nếu có)
            return items.some((m) => isPendingFor(m, message.clientId))
              ? items.filter((m) => !isPendingFor(m, message.clientId))
              : items;
          }

          const pendingIndex = items.findIndex((m) =>
            isPendingFor(m, message.clientId)
          );

          return pendingIndex >= 0
            ? items.map((m, i) => (i === pendingIndex ? message : m))
            : [...items, message];
        });
      };

      const setPendingStatus = (
        convoId: string,
        clientId: string,
        status: "sending" | "failed"
      ) => {
        updateItems(convoId, (items) =>
          items.map((m) => (isPendingFor(m, clientId) ? { ...m, status } : m))
        );
      };

      // Gửi tin của một conversation đã có sẵn; tin hiện ngay với trạng thái
      // "đang gửi", lỗi thì chuyển sang "lỗi" để người dùng bấm gửi lại.
      const deliver = async (
        conversationId: string,
        content: string,
        clientId: string,
        replyToId?: string
      ) => {
        const { user } = useAuthStore.getState();
        const convo = get().conversations.find((c) => c._id === conversationId);
        if (!convo || !user) return;

        setPendingStatus(conversationId, clientId, "sending");

        try {
          let message: Message;

          if (convo.type === "direct") {
            const other = convo.participants.find((p) => p._id !== user._id);
            if (!other) throw new Error("Không tìm thấy người nhận");

            message = await chatService.sendDirectMessage(
              other._id,
              content,
              undefined,
              conversationId,
              clientId,
              replyToId
            );
          } else {
            message = await chatService.sendGroupMessage(
              conversationId,
              content,
              undefined,
              clientId,
              replyToId
            );
          }

          settleMessage(message);

          set((state) => ({
            conversations: state.conversations.map((c) =>
              c._id === conversationId ? { ...c, seenBy: [] } : c
            ),
          }));
        } catch (error) {
          console.error("Lỗi xảy ra khi gửi tin nhắn", error);
          setPendingStatus(conversationId, clientId, "failed");
        }
      };

      const sendOptimistic = async (
        conversationId: string,
        content: string,
        replyTo?: Message | null
      ) => {
        const { user } = useAuthStore.getState();
        if (!user) return;

        const clientId = newClientId();
        // chỉ trả lời được tin đã lưu (có _id thật), không phải tin "đang gửi"
        const replyTarget = replyTo && !replyTo.status ? replyTo : null;

        updateItems(conversationId, (items) => [
          ...items,
          {
            _id: `pending-${clientId}`,
            clientId,
            conversationId,
            senderId: user._id,
            content,
            createdAt: new Date().toISOString(),
            isOwn: true,
            status: "sending",
            // bản trích tạm, server sẽ trả về bản chính thức
            ...(replyTarget && {
              replyTo: {
                messageId: replyTarget._id,
                senderId: replyTarget.senderId,
                content: (replyTarget.content ?? "").slice(0, 200),
              },
            }),
          },
        ]);

        await deliver(conversationId, content, clientId, replyTarget?._id);
      };

      return {
        conversations: [],
        messages: {},
        activeConversationId: null,
        replyingTo: null,
        convoLoading: false,
        messageLoading: false,
        loading: false,

        // đổi cuộc trò chuyện thì bỏ tin đang trả lời của cuộc cũ
        setActiveConversation: (id) => set({ activeConversationId: id, replyingTo: null }),
        setReplyingTo: (message) => set({ replyingTo: message }),
        setMessageReactions: (conversationId, messageId, reactions) => {
          updateItems(conversationId, (items) =>
            items.some((m) => m._id === messageId)
              ? items.map((m) => (m._id === messageId ? { ...m, reactions } : m))
              : items
          );
        },
        toggleReaction: async (conversationId, messageId, emoji) => {
          const { user } = useAuthStore.getState();
          if (!user) return;

          const current = get().messages[conversationId]?.items.find((m) => m._id === messageId);
          const previous = current?.reactions ?? [];

          // hiện ngay, không chờ server
          get().setMessageReactions(conversationId, messageId, applyReaction(previous, user._id, emoji));

          try {
            const reactions = await chatService.toggleReaction(messageId, emoji);
            get().setMessageReactions(conversationId, messageId, reactions);
          } catch (error) {
            console.error("Lỗi xảy ra khi thả cảm xúc", error);
            get().setMessageReactions(conversationId, messageId, previous);
            toast.error("Không thả được cảm xúc. Bạn thử lại nhé!");
          }
        },
        reset: () => {
          set({
            conversations: [],
            messages: {},
            activeConversationId: null,
            replyingTo: null,
            convoLoading: false,
            messageLoading: false,
          });
        },
        fetchConversations: async () => {
          try {
            set({ loading: true });
            const { conversations } = await chatService.fetchConversations();

            set({ conversations, loading: false });
          } catch (error) {
            console.error("Lỗi xảy ra khi fetchConversations:", error);
            set({ loading: false });
          }
        },
        fetchMessages: async (conversationId) => {
          const { activeConversationId, messages } = get();
          const { user } = useAuthStore.getState();

          const convoId = conversationId ?? activeConversationId;

          if (!convoId) return;

          const current = messages?.[convoId];
          const nextCursor =
            current?.nextCursor === undefined ? "" : current?.nextCursor;

          if (nextCursor === null) return;

          set({ messageLoading: true });

          try {
            const { messages: fetched, cursor } = await chatService.fetchMessages(
              convoId,
              nextCursor
            );

            const processed = fetched.map((m) => ({
              ...m,
              isOwn: m.senderId === user?._id,
            }));

            set((state) => {
              const prev = state.messages[convoId]?.items ?? [];
              // bỏ những tin đã có (ví dụ tin vừa tới qua socket trong lúc đang tải)
              const known = new Set(prev.map((m) => m._id));
              const merged = [
                ...processed.filter((m) => !known.has(m._id)),
                ...prev,
              ];

              return {
                messages: {
                  ...state.messages,
                  [convoId]: {
                    items: merged,
                    hasMore: !!cursor,
                    nextCursor: cursor ?? null,
                  },
                },
              };
            });
          } catch (error) {
            console.error("Lỗi xảy ra khi fetchMessages:", error);
          } finally {
            set({ messageLoading: false });
          }
        },
        sendDirectMessage: async (recipientId, content, imgUrl, replyTo) => {
          const { activeConversationId } = get();

          if (activeConversationId) {
            await sendOptimistic(activeConversationId, content, replyTo);
            return;
          }

          // chưa có conversation: server sẽ tạo và báo về qua socket
          try {
            const message = await chatService.sendDirectMessage(
              recipientId,
              content,
              imgUrl
            );
            settleMessage(message);
          } catch (error) {
            console.error("Lỗi xảy ra khi gửi direct message", error);
          }
        },
        sendGroupMessage: async (conversationId, content, _imgUrl, replyTo) => {
          await sendOptimistic(conversationId, content, replyTo);
        },
        retryMessage: async (conversationId, clientId) => {
          const pending = get().messages[conversationId]?.items.find((m) =>
            isPendingFor(m, clientId)
          );
          if (!pending || pending.status !== "failed") return;

          await deliver(
            conversationId,
            pending.content ?? "",
            clientId,
            pending.replyTo?.messageId
          );
        },
        addMessage: async (message) => {
          try {
            const convoId = message.conversationId;

            // conversation chưa từng tải: tải trang đầu trước để giữ đúng thứ tự
            if ((get().messages[convoId]?.items ?? []).length === 0) {
              await get().fetchMessages(convoId);
            }

            settleMessage(message);
          } catch (error) {
            console.error("Lỗi xảy khi ra add message:", error);
          }
        },
        updateConversation: (conversation) => {
          const patch = conversation as { _id: string };
          set((state) => ({
            conversations: state.conversations.map((c) =>
              c._id === patch._id ? { ...c, ...patch } : c
            ),
          }));
        },

        markAsSeen: async () => {
          try {
            const { user } = useAuthStore.getState();
            const { activeConversationId, conversations } = get();

            if (!activeConversationId || !user) {
              return;
            }

            const convo = conversations.find((c) => c._id === activeConversationId);

            if (!convo) {
              return;
            }

            if ((convo.unreadCounts?.[user._id] ?? 0) === 0) {
              return;
            }

            await chatService.markAsSeen(activeConversationId);

            set((state) => ({
              conversations: state.conversations.map((c) =>
                c._id === activeConversationId && c.lastMessage
                  ? {
                      ...c,
                      unreadCounts: {
                        ...c.unreadCounts,
                        [user._id]: 0,
                      },
                    }
                  : c
              ),
            }));
          } catch (error) {
            console.error("Lỗi xảy ra khi gọi markAsSeen trong store", error);
          }
        },
        addConvo: (convo, options) => {
          // conversation tới qua socket (người khác tạo) không được tự mở ra,
          // nếu không người nhận đang chat dở sẽ bị chuyển sang cuộc trò chuyện khác
          const activate = options?.activate ?? true;

          set((state) => {
            const exists = state.conversations.some(
              (c) => c._id.toString() === convo._id.toString()
            );

            return {
              conversations: exists
                ? state.conversations
                : [convo, ...state.conversations],
              ...(activate ? { activeConversationId: convo._id, replyingTo: null } : {}),
            };
          });
        },
        createConversation: async (type, name, memberIds) => {
          try {
            set({ loading: true });
            const conversation = await chatService.createConversation(
              type,
              name,
              memberIds
            );

            // server đã tự đưa các socket của thành viên vào room
            get().addConvo(conversation);
          } catch (error) {
            console.error("Lỗi xảy ra khi gọi createConversation trong store", error);
          } finally {
            set({ loading: false });
          }
        },
      };
    },
    {
      name: "chat-storage",
      partialize: (state) => ({ conversations: state.conversations }),
    }
  )
);
