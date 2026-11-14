import Conversation from "../../models/Conversation.js";
import User from "../../models/User.js";
import { embeddings } from "../embeddings.js";
import { vectorSearch } from "./vectorStore.js";

export const DEFAULT_K = 5;

/**
 * Các conversation mà câu hỏi đặt trong `conversationId` được phép tìm (theo thành viên tại lúc hỏi):
 *  - chat riêng với Komi AI: mọi conversation người hỏi là thành viên;
 *  - nhóm hoặc chat 1-1 khác: chỉ chính conversation đó (câu trả lời ở đây người khác cũng đọc được,
 *    nên không lấy nội dung từ các cuộc trò chuyện riêng của người hỏi).
 * Trả null nếu người hỏi không phải thành viên của conversationId.
 */
export const allowedConversationIds = async ({ userId, conversationId }) => {
  const conversation = await Conversation.findOne(
    { _id: conversationId, "participants.userId": userId },
    { type: 1, participants: 1 },
  ).lean();
  if (!conversation) return null;

  if (conversation.type === "direct") {
    const others = conversation.participants.map((p) => p.userId).filter((id) => id.toString() !== userId.toString());
    if (others.length > 0 && (await User.exists({ _id: { $in: others }, isBot: true }))) {
      return Conversation.find({ "participants.userId": userId }).distinct("_id");
    }
  }
  return [conversation._id];
};

/** Tìm trong các conversation đã được kiểm tra quyền (và kho chung nếu includeShared). */
export const searchWithin = async ({ conversationIds, includeShared = true, query, k = DEFAULT_K, signal }) => {
  if (conversationIds.length === 0 && !includeShared) return [];
  const [vector] = await embeddings.embed({ texts: [query], signal });
  return vectorSearch({ vector, conversationIds, includeShared, k });
};

/**
 * Tìm các đoạn liên quan tới câu hỏi `query` mà `userId` đặt trong `conversationId`.
 * Người ngoài conversation nhận [] (không lộ conversation có tồn tại).
 * Lỗi embedding (LLMError, vd. 429) ném ra cho bên gọi.
 */
export const searchKnowledge = async ({ userId, conversationId, query, k = DEFAULT_K, signal }) => {
  const conversationIds = await allowedConversationIds({ userId, conversationId });
  if (!conversationIds) return [];
  return searchWithin({ conversationIds, includeShared: true, query, k, signal });
};
