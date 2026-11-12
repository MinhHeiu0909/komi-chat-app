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
import { registerStream, unregisterStream } from "./streams.js";
import { quotaExceededText, refundQuota, takeQuota } from "./quota.js";

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

export const STOPPED_NOTE = "_(Đã dừng)_";

/**
 * Trả lời bằng streaming qua socket, phát cho cả room của conversation:
 *   ai:start { conversationId, streamId, botId, askerId }  → frontend hiện bong bóng "đang trả lời"
 *   ai:token { conversationId, streamId, token }            → từng đoạn chữ
 *   new-message (tin thật của bot, clientId = streamId)     → thay bong bóng tạm
 *   ai:done  { conversationId, streamId, messageId, stopped }
 * Người hỏi gửi ai:stop { streamId } để dừng (xem socket/index.js).
 * Hết lượt hỏi trong ngày: chỉ báo riêng người hỏi bằng ai:error { conversationId, message }.
 */
const respond = async (conversation, trigger, bot) => {
  const conversationId = conversation._id.toString();
  const isGroup = conversation.type === "group";
  const botId = bot._id.toString();
  const askerId = trigger.senderId.toString();

  // Hạn mức mỗi user/ngày, chỉ tính khi thật sự gọi LLM (AI tắt thì bot chỉ báo đang tắt)
  const quota = llm.isReady() ? await takeQuota(askerId) : null;
  if (quota && !quota.ok) {
    // báo riêng người hỏi (room cá nhân); không lưu tin, bot không vào nhóm
    io.to(askerId).emit("ai:error", { conversationId, message: quotaExceededText(quota.limit) });
    return;
  }

  const current = isGroup ? await joinGroup(conversation, bot._id) : conversation;

  const streamId = crypto.randomUUID();
  const controller = new AbortController();
  registerStream(streamId, { controller, askerId, conversationId });
  io.to(conversationId).emit("ai:start", { conversationId, streamId, botId, askerId });

  let text = "";
  let stopped = false;
  let errorText = null;
  try {
    if (!llm.isReady()) {
      text = AI_OFF_TEXT;
    } else {
      const messages = await buildKomiPrompt({ conversation: current, botId: bot._id });
      for await (const token of llm.streamChat({ messages, signal: controller.signal })) {
        text += token;
        io.to(conversationId).emit("ai:token", { conversationId, streamId, token });
      }
    }
  } catch (error) {
    if (controller.signal.aborted && error?.name === "AbortError") {
      stopped = true;
    } else if (error instanceof LLMError) {
      console.error("Komi AI lỗi khi gọi LLM:", error.code, error.status ?? "", error.detail ?? "");
      errorText = error.message; // câu báo lỗi thân thiện, không chứa chi tiết kỹ thuật
    } else {
      console.error("Komi AI lỗi:", error);
      errorText = new LLMError().message;
    }
  } finally {
    unregisterStream(streamId);
  }

  // lỗi phía nhà cung cấp / server thì không tính lượt (dừng giữa chừng vẫn tính)
  if (errorText && quota) {
    await refundQuota(askerId, quota.day).catch((error) => console.error("Lỗi khi hoàn lượt hỏi AI", error));
  }

  // Lưu phần đã trả lời (kể cả khi bị dừng / lỗi giữa chừng). Dừng trước khi có chữ nào thì không lưu.
  let content = text.trim();
  if (stopped && content) content += `\n\n${STOPPED_NOTE}`;
  if (errorText) content = content ? `${content}\n\n_${errorText}_` : errorText;
  if (!content && !stopped) content = EMPTY_REPLY_TEXT;

  // Trong nhóm, trả lời kèm trích dẫn câu hỏi để biết bot đang trả lời ai
  const replyTo = isGroup
    ? {
        messageId: trigger._id,
        senderId: trigger.senderId,
        content: (trigger.content ?? "").slice(0, REPLY_SNIPPET_LENGTH),
      }
    : undefined;

  let messageId = null;
  try {
    if (content) {
      const { message } = await createMessageAndEmit(io, current, bot._id, {
        content,
        replyTo,
        clientId: streamId, // để frontend thay bong bóng tạm bằng tin thật
      });
      messageId = message._id.toString();
    }
  } finally {
    // luôn báo xong, kể cả khi lưu lỗi, để frontend không kẹt bong bóng "đang trả lời"
    io.to(conversationId).emit("ai:done", { conversationId, streamId, messageId, stopped });
  }
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
