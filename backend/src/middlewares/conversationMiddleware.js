import mongoose from "mongoose";
import Conversation from "../models/Conversation.js";

export const isValidObjectId = (id) =>
  typeof id === "string" && mongoose.Types.ObjectId.isValid(id);

export const isParticipant = (conversation, userId) =>
  conversation.participants.some(
    (p) => (p.userId?._id ?? p.userId).toString() === userId.toString(),
  );

/**
 * Chỉ cho phép thành viên của conversation đi tiếp.
 * conversationId được lấy từ params trước, sau đó tới body.
 * Gắn conversation vào req.conversation để controller dùng lại.
 *
 * Trả 404 (không phải 403) khi user không phải thành viên,
 * để không tiết lộ conversation đó có tồn tại hay không.
 */
export const requireConversationMember = async (req, res, next) => {
  try {
    const conversationId = req.params?.conversationId ?? req.body?.conversationId;

    if (!isValidObjectId(conversationId)) {
      return res.status(400).json({ message: "conversationId không hợp lệ" });
    }

    const conversation = await Conversation.findById(conversationId);

    if (!conversation || !isParticipant(conversation, req.user._id)) {
      return res.status(404).json({ message: "Không tìm thấy cuộc trò chuyện" });
    }

    req.conversation = conversation;
    next();
  } catch (error) {
    console.error("Lỗi trong requireConversationMember:", error);
    return res.status(500).json({ message: "Lỗi hệ thống" });
  }
};

/**
 * Kiểm tra membership dùng cho socket (không có req/res).
 */
export const userIsMemberOf = async (conversationId, userId) => {
  if (!isValidObjectId(conversationId)) return false;

  const exists = await Conversation.exists({
    _id: conversationId,
    "participants.userId": userId,
  });

  return Boolean(exists);
};
