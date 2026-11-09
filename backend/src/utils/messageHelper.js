import Conversation from "../models/Conversation.js";
import { IMAGE_PREVIEW_TEXT } from "./messageImage.js";

/**
 * Cập nhật conversation sau khi có tin nhắn mới bằng MỘT lệnh update nguyên tử.
 *
 * Trước đây code load document, sửa rồi gọi save(). Vì có gán lại mảng seenBy,
 * Mongoose đưa __v vào điều kiện update, nên khi hai người gửi tin vào cùng
 * conversation gần như cùng lúc, request sau bị VersionError (lỗi 500)
 * và số tin chưa đọc có thể bị ghi đè sai. $inc giải quyết cả hai.
 */
export const updateConversationAfterCreateMessage = async (
  conversation,
  message,
  senderId,
) => {
  const sender = senderId.toString();

  const increments = {};
  conversation.participants.forEach((p) => {
    const memberId = (p.userId?._id ?? p.userId).toString();
    if (memberId !== sender) increments[`unreadCounts.${memberId}`] = 1;
  });

  const update = {
    $set: {
      seenBy: [],
      lastMessageAt: message.createdAt,
      lastMessage: {
        _id: message._id.toString(),
        // tin chỉ có ảnh: hiện "📷 Hình ảnh" ở danh sách chat
        content: message.content || (message.imgUrl ? IMAGE_PREVIEW_TEXT : ""),
        senderId,
        createdAt: message.createdAt,
      },
      [`unreadCounts.${sender}`]: 0,
    },
  };

  if (Object.keys(increments).length > 0) update.$inc = increments;

  return Conversation.findByIdAndUpdate(conversation._id, update, { returnDocument: "after" });
};

export const emitNewMessage = (io, conversation, message) => {
  io.to(conversation._id.toString()).emit("new-message", {
    message,
    conversation: {
      _id: conversation._id,
      lastMessage: conversation.lastMessage,
      lastMessageAt: conversation.lastMessageAt,
    },
    unreadCounts: conversation.unreadCounts,
  });
};
