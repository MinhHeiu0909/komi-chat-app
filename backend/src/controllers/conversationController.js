import Conversation from "../models/Conversation.js";
import Message from "../models/Message.js";
import { io, announceConversation } from "../socket/index.js";
import { isValidObjectId } from "../middlewares/conversationMiddleware.js";
import { findOrCreateDirectConversation } from "../utils/directConversation.js";
import {
  CONVERSATION_POPULATE,
  formatConversation,
  populateAndFormat,
} from "../utils/conversationFormat.js";

const MAX_GROUP_NAME = 100;
const MAX_PAGE_SIZE = 100;

export const createConversation = async (req, res) => {
  try {
    const { type, memberIds } = req.body;
    const name = typeof req.body.name === "string" ? req.body.name.trim() : "";
    const userId = req.user._id;
    const me = userId.toString();

    if (
      !["direct", "group"].includes(type) ||
      !Array.isArray(memberIds) ||
      memberIds.length === 0 ||
      !memberIds.every(isValidObjectId)
    ) {
      return res.status(400).json({ message: "type hoặc memberIds không hợp lệ" });
    }

    // bỏ trùng lặp và bỏ chính mình
    const others = [...new Set(memberIds.map(String))].filter((id) => id !== me);

    if (others.length === 0) {
      return res.status(400).json({ message: "Cần ít nhất một thành viên khác" });
    }

    let conversation;
    let created = true;

    if (type === "direct") {
      if (others.length !== 1) {
        return res.status(400).json({ message: "Chat 1-1 chỉ có một người nhận" });
      }

      ({ conversation, created } = await findOrCreateDirectConversation(
        userId,
        others[0],
      ));
    } else {
      if (!name || name.length > MAX_GROUP_NAME) {
        return res
          .status(400)
          .json({ message: `Tên nhóm là bắt buộc, tối đa ${MAX_GROUP_NAME} ký tự` });
      }

      conversation = await Conversation.create({
        type: "group",
        participants: [{ userId }, ...others.map((id) => ({ userId: id }))],
        group: { name, createdBy: userId },
        lastMessageAt: new Date(),
      });
    }

    const formatted = await populateAndFormat(conversation);

    if (created) {
      announceConversation([me, ...others], formatted);
    }

    return res.status(created ? 201 : 200).json({ conversation: formatted });
  } catch (error) {
    console.error("Lỗi khi tạo conversation", error);
    return res.status(500).json({ message: "Lỗi hệ thống" });
  }
};

export const getConversations = async (req, res) => {
  try {
    const conversations = await Conversation.find({
      "participants.userId": req.user._id,
    })
      .sort({ lastMessageAt: -1, updatedAt: -1 })
      .populate(CONVERSATION_POPULATE);

    return res
      .status(200)
      .json({ conversations: conversations.map(formatConversation) });
  } catch (error) {
    console.error("Lỗi xảy ra khi lấy conversations", error);
    return res.status(500).json({ message: "Lỗi hệ thống" });
  }
};

// req.conversation đã được requireConversationMember kiểm tra
export const getMessages = async (req, res) => {
  try {
    const conversationId = req.conversation._id;
    const limit = Math.min(Math.max(Number(req.query.limit) || 50, 1), MAX_PAGE_SIZE);
    const { cursor } = req.query;

    const query = { conversationId };

    if (cursor) {
      const before = new Date(cursor);
      if (Number.isNaN(before.getTime())) {
        return res.status(400).json({ message: "cursor không hợp lệ" });
      }
      query.createdAt = { $lt: before };
    }

    let messages = await Message.find(query)
      .sort({ createdAt: -1 })
      .limit(limit + 1);

    let nextCursor = null;

    if (messages.length > limit) {
      const nextMessage = messages[messages.length - 1];
      nextCursor = nextMessage.createdAt.toISOString();
      messages.pop();
    }

    messages = messages.reverse();

    return res.status(200).json({ messages, nextCursor });
  } catch (error) {
    console.error("Lỗi xảy ra khi lấy messages", error);
    return res.status(500).json({ message: "Lỗi hệ thống" });
  }
};

// req.conversation đã được requireConversationMember kiểm tra
export const markAsSeen = async (req, res) => {
  try {
    const conversationId = req.conversation._id.toString();
    const userId = req.user._id.toString();
    const last = req.conversation.lastMessage;

    if (!last) {
      return res.status(200).json({ message: "Không có tin nhắn để mark as seen" });
    }

    if (last.senderId.toString() === userId) {
      return res.status(200).json({ message: "Sender không cần mark as seen" });
    }

    const updated = await Conversation.findByIdAndUpdate(
      conversationId,
      {
        $addToSet: { seenBy: userId },
        $set: { [`unreadCounts.${userId}`]: 0 },
      },
      { returnDocument: "after" },
    ).populate("seenBy", "displayName avatarUrl");

    // Chỉ gửi những gì client cần; seenBy kèm tên + avatar để hiện "đã xem"
    // trong nhóm (trước đây chỉ là mảng id nên client không biết ai đã xem).
    io.to(conversationId).emit("read-message", {
      conversation: {
        _id: updated._id,
        lastMessageAt: updated.lastMessageAt,
        unreadCounts: Object.fromEntries(updated.unreadCounts ?? []),
        seenBy: updated.seenBy,
      },
      lastMessage: {
        _id: updated.lastMessage._id,
        content: updated.lastMessage.content,
        createdAt: updated.lastMessage.createdAt,
        sender: {
          _id: updated.lastMessage.senderId,
        },
      },
    });

    return res.status(200).json({
      message: "Marked as seen",
      seenBy: updated.seenBy || [],
      myUnreadCount: updated.unreadCounts?.get(userId) || 0,
    });
  } catch (error) {
    console.error("Lỗi khi mark as seen", error);
    return res.status(500).json({ message: "Lỗi hệ thống" });
  }
};
