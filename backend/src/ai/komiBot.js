import crypto from "node:crypto";
import bcrypt from "bcrypt";
import User from "../models/User.js";
import Conversation from "../models/Conversation.js";
import { io } from "../socket/index.js";
import { findOrCreateDirectConversation } from "../utils/directConversation.js";
import { populateAndFormat } from "../utils/conversationFormat.js";
import { createMessageAndEmit } from "../utils/messageHelper.js";
import { buildKomiPrompt } from "./prompt.js";
import { llm, LLMError } from "./llm.js";

/**
 * Komi AI là một user hệ thống (isBot: true):
 *  - mỗi user tự có sẵn cuộc chat riêng với bot (khi AI đang bật);
 *  - gõ @komi trong nhóm thì bot vào nhóm (lần đầu) và trả lời.
 * Bot chỉ đọc tin của đúng conversation nơi nó được gọi; người gọi luôn là
 * thành viên của conversation đó (route gửi tin đã kiểm tra trước khi tới đây).
 */

export const KOMI_USERNAME = "komi.ai";
export const KOMI_DISPLAY_NAME = "Komi AI";
const KOMI_EMAIL = "komi.ai@komi.local";

export const AI_OFF_TEXT = "Komi AI đang tắt trên máy chủ này.";
const EMPTY_REPLY_TEXT = "Komi AI chưa nghĩ ra câu trả lời, bạn hỏi lại theo cách khác nhé.";

// "@komi" đứng riêng (đầu tin hoặc sau khoảng trắng); "email@komi" hay "@komiabc" không tính
export const KOMI_MENTION = /(^|\s)@komi\b/i;

const DUPLICATE_KEY = 11000;
// giống REPLY_SNIPPET_LENGTH của messageController (đoạn trích tin được trả lời)
const REPLY_SNIPPET_LENGTH = 200;

/**
 * Lấy user Komi AI, tạo nếu chưa có. Không cache: seed --reset có thể xoá user
 * khi server đang chạy; tìm theo username (có unique index) nên rất rẻ.
 * Trả null nếu username đã bị một người dùng thật chiếm.
 */
export const getKomiBot = async () => {
  let bot = await User.findOne({ username: KOMI_USERNAME }, { isBot: 1, displayName: 1 }).lean();

  if (!bot) {
    try {
      // mật khẩu ngẫu nhiên không ai biết; signIn cũng chặn riêng user isBot
      const hashedPassword = await bcrypt.hash(crypto.randomBytes(32).toString("hex"), 10);
      const created = await User.create({
        username: KOMI_USERNAME,
        email: KOMI_EMAIL,
        displayName: KOMI_DISPLAY_NAME,
        hashedPassword,
        isBot: true,
        bio: "Trợ lý AI của Komi",
      });
      bot = { _id: created._id, isBot: true, displayName: created.displayName };
    } catch (error) {
      if (error?.code !== DUPLICATE_KEY) throw error;
      bot = await User.findOne({ username: KOMI_USERNAME }, { isBot: 1, displayName: 1 }).lean();
    }
  }

  if (!bot?.isBot) {
    console.error(`Username "${KOMI_USERNAME}" đã bị người dùng thật dùng, Komi AI không hoạt động`);
    return null;
  }
  return bot;
};

/**
 * Bảo đảm user có cuộc chat riêng với Komi AI (chỉ khi AI đang bật).
 * Mới tạo thì đưa các socket đang mở của user vào room để nhận tin realtime.
 */
export const ensureKomiConversation = async (userId) => {
  if (!llm.isReady()) return null;
  const bot = await getKomiBot();
  if (!bot) return null;

  const result = await findOrCreateDirectConversation(userId, bot._id);
  if (result.created) {
    io.in(userId.toString()).socketsJoin(result.conversation._id.toString());
  }
  return result;
};

const hasParticipant = (conversation, userId) =>
  conversation.participants.some((p) => (p.userId?._id ?? p.userId).toString() === userId.toString());

/**
 * Thêm bot vào nhóm nếu chưa là thành viên (update nguyên tử, gọi đồng thời vẫn chỉ thêm một lần)
 * và báo danh sách thành viên mới cho cả nhóm để frontend hiện được tên/avatar của bot.
 */
const joinGroup = async (conversation, botId) => {
  const updated = await Conversation.findOneAndUpdate(
    { _id: conversation._id, type: "group", "participants.userId": { $ne: botId } },
    { $push: { participants: { userId: botId } } },
    { returnDocument: "after" },
  );
  if (!updated) return Conversation.findById(conversation._id); // đã là thành viên

  const formatted = await populateAndFormat(updated);
  io.to(updated._id.toString()).emit("conversation-participants", {
    conversationId: updated._id.toString(),
    participants: formatted.participants,
  });
  return updated;
};

const emitTyping = (conversationId, botId, isTyping) =>
  io.to(conversationId).emit("typing", { conversationId, userId: botId.toString(), isTyping });

const respond = async (conversation, trigger, bot) => {
  const conversationId = conversation._id.toString();
  const isGroup = conversation.type === "group";

  const current = isGroup ? await joinGroup(conversation, bot._id) : conversation;
  emitTyping(conversationId, bot._id, true);

  let content;
  try {
    if (!llm.isReady()) {
      content = AI_OFF_TEXT;
    } else {
      const messages = await buildKomiPrompt({ conversation: current, botId: bot._id });
      content = (await llm.chat({ messages })).trim() || EMPTY_REPLY_TEXT;
    }
  } catch (error) {
    if (error instanceof LLMError) {
      console.error("Komi AI lỗi khi gọi LLM:", error.code, error.status ?? "", error.detail ?? "");
      content = error.message; // câu báo lỗi thân thiện, không chứa chi tiết kỹ thuật
    } else {
      console.error("Komi AI lỗi:", error);
      content = new LLMError().message;
    }
  } finally {
    emitTyping(conversationId, bot._id, false);
  }

  // Trong nhóm, trả lời kèm trích dẫn câu hỏi để biết bot đang trả lời ai
  const replyTo = isGroup
    ? {
        messageId: trigger._id,
        senderId: trigger.senderId,
        content: (trigger.content ?? "").slice(0, REPLY_SNIPPET_LENGTH),
      }
    : undefined;

  await createMessageAndEmit(io, current, bot._id, { content, replyTo });
};

/**
 * Gọi sau mỗi tin người dùng gửi. Không ném lỗi, không cần await
 * (trả về promise để test chờ được).
 */
export const handleKomiTrigger = async (conversation, message) => {
  try {
    const isGroup = conversation.type === "group";
    // nhóm: chỉ khi có @komi; AI tắt thì bỏ qua để bot không vào nhóm vô ích
    if (isGroup && !(KOMI_MENTION.test(message.content ?? "") && llm.isReady())) return;

    const bot = await getKomiBot();
    if (!bot || message.senderId.toString() === bot._id.toString()) return;
    // chat riêng: chỉ khi người kia là bot
    if (!isGroup && !hasParticipant(conversation, bot._id)) return;

    await respond(conversation, message, bot);
  } catch (error) {
    console.error("Lỗi khi Komi AI trả lời:", error);
  }
};

// Dùng cho route gửi tin 1-1: nhắn cho bot không cần kết bạn
export const isKomiBotId = (userId) => User.exists({ _id: userId, isBot: true });
