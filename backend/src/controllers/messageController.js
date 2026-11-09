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
  userIsMemberOf,
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

// Độ dài tối đa của đoạn trích tin gốc lưu trong replyTo
export const REPLY_SNIPPET_LENGTH = 200;

/**
 * Đọc replyToId và tạo bản trích của tin gốc.
 * Tin gốc phải thuộc đúng conversation đang gửi: nếu không, người dùng có thể
 * đưa id của tin ở conversation khác vào để đọc lén nội dung của nó.
 * Không phân biệt "không tồn tại" và "ở conversation khác" để không lộ thông tin.
 */
const readReplyTo = async (body, conversationId) => {
  const replyToId = body?.replyToId;
  if (replyToId === undefined || replyToId === null || replyToId === "") return {};

  const invalid = { error: "Tin nhắn được trả lời không hợp lệ" };
  if (!isValidObjectId(replyToId)) return invalid;

  const original = await Message.findOne(
    { _id: replyToId, conversationId },
    { senderId: 1, content: 1, imgUrl: 1 },
  ).lean();
  if (!original) return invalid;

  const text = original.content || (original.imgUrl ? "[Hình ảnh]" : "");
  return {
    replyTo: {
      messageId: original._id,
      senderId: original.senderId,
      content: text.slice(0, REPLY_SNIPPET_LENGTH),
    },
  };
};

const createAndEmit = async (conversation, senderId, content, clientId, replyTo) => {
  const message = await Message.create({
    conversationId: conversation._id,
    senderId,
    content,
    clientId,
    replyTo,
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

    const reply = await readReplyTo(req.body, conversation._id);
    if (reply.error) return res.status(400).json({ message: reply.error });

    const message = await createAndEmit(
      conversation,
      senderId,
      content,
      readClientId(req.body),
      reply.replyTo,
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

    const reply = await readReplyTo(req.body, conversation._id);
    if (reply.error) return res.status(400).json({ message: reply.error });

    const message = await createAndEmit(
      conversation,
      senderId,
      content,
      readClientId(req.body),
      reply.replyTo,
    );

    return res.status(201).json({ message });
  } catch (error) {
    console.error("Lỗi xảy ra khi gửi tin nhắn nhóm", error);
    return res.status(500).json({ message: "Lỗi hệ thống" });
  }
};

// Bộ cảm xúc cố định (giống Messenger); chỉ nhận đúng các emoji này
export const ALLOWED_REACTIONS = ["👍", "❤️", "😆", "😮", "😢", "😡"];

/**
 * Thả / đổi / gỡ cảm xúc cho một tin nhắn.
 * - Chưa có hoặc đang có emoji khác: đặt emoji mới (mỗi user một emoji).
 * - Đang có đúng emoji này: gỡ đi.
 * Cập nhật bằng một lệnh nguyên tử (pipeline update), không load-sửa-save.
 */
export const toggleReaction = async (req, res) => {
  try {
    const { messageId } = req.params;
    const { emoji } = req.body ?? {};
    const userId = req.user._id;

    if (!isValidObjectId(messageId)) {
      return res.status(400).json({ message: "messageId không hợp lệ" });
    }
    if (!ALLOWED_REACTIONS.includes(emoji)) {
      return res.status(400).json({ message: "Cảm xúc không hợp lệ" });
    }

    const message = await Message.findById(messageId, { conversationId: 1, reactions: 1 }).lean();

    // Không phải thành viên thì trả 404 như tin không tồn tại, để không lộ tin nhắn
    if (!message || !(await userIsMemberOf(message.conversationId.toString(), userId))) {
      return res.status(404).json({ message: "Không tìm thấy tin nhắn" });
    }

    const removing = (message.reactions ?? []).some(
      (r) => r.userId.toString() === userId.toString() && r.emoji === emoji,
    );

    const updated = await Message.findOneAndUpdate(
      { _id: messageId },
      [
        {
          $set: {
            reactions: {
              $concatArrays: [
                {
                  $filter: {
                    input: { $ifNull: ["$reactions", []] },
                    cond: { $ne: ["$$this.userId", userId] },
                  },
                },
                removing ? [] : [{ userId, emoji }],
              ],
            },
          },
        },
      ],
      {
        returnDocument: "after",
        projection: { conversationId: 1, reactions: 1 },
        updatePipeline: true, // Mongoose yêu cầu bật rõ khi update bằng pipeline
      },
    ).lean();

    const payload = {
      messageId,
      conversationId: updated.conversationId.toString(),
      reactions: updated.reactions ?? [],
    };

    io.to(payload.conversationId).emit("message-reaction", payload);

    return res.status(200).json(payload);
  } catch (error) {
    console.error("Lỗi xảy ra khi thả cảm xúc", error);
    return res.status(500).json({ message: "Lỗi hệ thống" });
  }
};
