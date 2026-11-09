import { Server } from "socket.io";
import http from "http";
import express from "express";
import Conversation from "../models/Conversation.js";
import { socketAuthMiddleware } from "../middlewares/socketMiddleware.js";
import { userIsMemberOf } from "../middlewares/conversationMiddleware.js";

const app = express();

const server = http.createServer(app);

const io = new Server(server, {
  cors: {
    origin: process.env.CLIENT_URL,
    credentials: true,
  },
});

io.use(socketAuthMiddleware);

// userId (string) -> Set<socketId>
// Một user có thể mở nhiều tab; user chỉ offline khi tab cuối cùng đóng.
const onlineUsers = new Map();

const getOnlineUserIds = () => Array.from(onlineUsers.keys());

const addOnlineSocket = (userId, socketId) => {
  const sockets = onlineUsers.get(userId) ?? new Set();
  const wasOffline = sockets.size === 0;
  sockets.add(socketId);
  onlineUsers.set(userId, sockets);
  return wasOffline;
};

const removeOnlineSocket = (userId, socketId) => {
  const sockets = onlineUsers.get(userId);
  if (!sockets) return false;

  sockets.delete(socketId);
  if (sockets.size > 0) return false;

  onlineUsers.delete(userId);
  return true;
};

io.on("connection", async (socket) => {
  const userId = socket.user._id.toString();

  // room riêng của user, dùng để gửi sự kiện cá nhân (ví dụ: conversation mới)
  socket.join(userId);

  if (addOnlineSocket(userId, socket.id)) {
    io.emit("online-users", getOnlineUserIds());
  } else {
    socket.emit("online-users", getOnlineUserIds());
  }

  socket.on("join-conversation", async (conversationId, ack) => {
    const reply = typeof ack === "function" ? ack : () => {};

    try {
      // Chỉ thành viên mới được vào room; trước đây client có thể
      // join bất kỳ room nào và nhận tin nhắn realtime của người khác.
      const allowed = await userIsMemberOf(conversationId, userId);
      if (!allowed) return reply({ ok: false });

      socket.join(conversationId);
      reply({ ok: true });
    } catch (error) {
      console.error("Lỗi khi join-conversation:", error);
      reply({ ok: false });
    }
  });

  // "đang nhập…": chuyển tiếp cho các thành viên khác trong room.
  // Phải kiểm tra thành viên vì socket.to(room) vẫn phát được vào room
  // mà socket gửi không ở trong đó. Client chỉ gửi typing:start tối đa
  // vài giây một lần nên truy vấn DB ở đây không đáng kể.
  const relayTyping = (isTyping) => async (conversationId) => {
    try {
      if (!(await userIsMemberOf(conversationId, userId))) return;
      socket.to(conversationId).emit("typing", { conversationId, userId, isTyping });
    } catch (error) {
      console.error("Lỗi khi chuyển tiếp typing:", error);
    }
  };

  socket.on("typing:start", relayTyping(true));
  socket.on("typing:stop", relayTyping(false));

  socket.on("disconnect", () => {
    if (removeOnlineSocket(userId, socket.id)) {
      io.emit("online-users", getOnlineUserIds());
    }
  });

  try {
    const conversations = await Conversation.find(
      { "participants.userId": socket.user._id },
      { _id: 1 },
    ).lean();

    conversations.forEach((c) => socket.join(c._id.toString()));
  } catch (error) {
    console.error("Lỗi khi join các conversation của user:", error);
  }
});

/**
 * Đưa mọi socket đang mở của các user vào room của conversation mới
 * và báo cho họ biết conversation đó vừa được tạo.
 */
const announceConversation = (userIds, conversation) => {
  const roomId = conversation._id.toString();

  userIds.forEach((id) => {
    const userRoom = id.toString();
    io.in(userRoom).socketsJoin(roomId);
    io.to(userRoom).emit("new-group", conversation);
  });
};

export { io, app, server, announceConversation, getOnlineUserIds };
