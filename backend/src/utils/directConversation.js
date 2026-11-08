import Conversation, { makeDirectKey } from "../models/Conversation.js";

const DUPLICATE_KEY = 11000;

/**
 * Trả về conversation 1-1 giữa hai user, tạo mới nếu chưa có.
 *
 * - Ưu tiên tìm theo directKey (unique index).
 * - Dữ liệu cũ chưa có directKey: tìm theo participants rồi gắn directKey vào.
 * - Hai request đồng thời cùng tạo: request thua nhận lỗi duplicate key
 *   và đọc lại bản ghi đã được tạo.
 */
export const findOrCreateDirectConversation = async (userId, otherUserId) => {
  const directKey = makeDirectKey(userId, otherUserId);

  let conversation = await Conversation.findOne({ directKey });
  if (conversation) return { conversation, created: false };

  conversation = await Conversation.findOne({
    type: "direct",
    "participants.userId": { $all: [userId, otherUserId] },
    participants: { $size: 2 },
  });

  if (conversation) {
    conversation.directKey = directKey;
    try {
      await conversation.save();
    } catch (error) {
      if (error?.code !== DUPLICATE_KEY) throw error;
    }
    return { conversation, created: false };
  }

  try {
    conversation = await Conversation.create({
      type: "direct",
      directKey,
      participants: [{ userId }, { userId: otherUserId }],
      lastMessageAt: new Date(),
    });
    return { conversation, created: true };
  } catch (error) {
    if (error?.code !== DUPLICATE_KEY) throw error;
    conversation = await Conversation.findOne({ directKey });
    return { conversation, created: false };
  }
};
