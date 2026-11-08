import Conversation from "../models/Conversation.js";
import Message from "../models/Message.js";
import {
  emitNewMessage,
  updateConversationAfterCreateMessage,
} from "../utils/messageHelper.js";
import { findOrCreateDirectConversation } from "../utils/directConversation.js";
import { populateAndFormat } from "../utils/conversationFormat.js";
import {
  isParticipant,
  isValidObjectId,
} from "../middlewares/conversationMiddleware.js";
import { io, announceConversation } from "../socket/index.js";

export const MAX_MESSAGE_LENGTH = 4000;

const readContent = (body) => {
  const content = typeof body?.content === "string" ? body.content.trim() : "";

  if (!content) return { error: "Thiếu nội dung" };
  if (content.length > MAX_MESSAGE_LENGTH) {
    return { error: `Tin nhắn tối đa ${MAX_MESSAGE_LENGTH} ký tự` };
  }
  return { content };
};

const readClientId = (body) =>
  typeof body?.clientId === "string" && body.clientId.length <= 64
    ? body.clientId
    : undefined;

const createAndEmit = async (conversation, senderId, content, clientId) => {
  const message = await Message.create({
    conversationId: conversation._id,
    senderId,
    content,
    clientId,
  });

  const updated = await updateConversationAfterCreateMessage(
    conversation,
    message,
    senderId,
  );
  emitNewMessage(io, updated, message);

  return message;
};

export const sendDirectMessage = async (req, res) => {
  try {
    const { recipientId, conversationId } = req.body;
    const senderId = req.user._id;

    const { content, error } = readContent(req.body);
    if (error) return res.status(400).json({ message: error });

    if (!isValidObjectId(recipientId) || recipientId === senderId.toString()) {
      return res.status(400).json({ message: "recipientId không hợp lệ" });
    }

    let conversation;

    if (conversationId) {
      if (!isValidObjectId(conversationId)) {
        return res.status(400).json({ message: "conversationId không hợp lệ" });
      }

      conversation = await Conversation.findById(conversationId);

      // Người gửi và người nhận đều phải nằm trong đúng conversation 1-1 này.
      // Trước đây chỉ kiểm tra người nhận là bạn bè, nên có thể gửi tin
      // vào conversation của người khác chỉ bằng cách đoán conversationId.
      const valid =
        conversation &&
        conversation.type === "direct" &&
        isParticipant(conversation, senderId) &&
        isParticipant(conversation, recipientId);

      if (!valid) {
        return res.status(404).json({ message: "Không tìm thấy cuộc trò chuyện" });
      }
    } else {
      const result = await findOrCreateDirectConversation(senderId, recipientId);
      conversation = result.conversation;

      if (result.created) {
        const formatted = await populateAndFormat(conversation);
        announceConversation([senderId, recipientId], formatted);
      }
    }

    const message = await createAndEmit(
      conversation,
      senderId,
      content,
      readClientId(req.body),
    );

    return res.status(201).json({ message });
  } catch (error) {
    console.error("Lỗi xảy ra khi gửi tin nhắn trực tiếp", error);
    return res.status(500).json({ message: "Lỗi hệ thống" });
  }
};

// req.conversation đã được requireConversationMember kiểm tra
export const sendGroupMessage = async (req, res) => {
  try {
    const conversation = req.conversation;
    const senderId = req.user._id;

    if (conversation.type !== "group") {
      return res.status(400).json({ message: "Conversation không phải nhóm" });
    }

    const { content, error } = readContent(req.body);
    if (error) return res.status(400).json({ message: error });

    const message = await createAndEmit(
      conversation,
      senderId,
      content,
      readClientId(req.body),
    );

    return res.status(201).json({ message });
  } catch (error) {
    console.error("Lỗi xảy ra khi gửi tin nhắn nhóm", error);
    return res.status(500).json({ message: "Lỗi hệ thống" });
  }
};
