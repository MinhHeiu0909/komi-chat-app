import ChatFile from "../../models/ChatFile.js";
import Conversation from "../../models/Conversation.js";
import KnowledgeChunk, { CHUNK_SCOPE, CHUNK_SOURCE } from "../../models/KnowledgeChunk.js";
import Message from "../../models/Message.js";
import RagCursor from "../../models/RagCursor.js";
import User from "../../models/User.js";
import { embeddings } from "../embeddings.js";
import { LLM_ERROR } from "../errors.js";
import { buildMessageWindows, chunkFilePages, embeddingInput, formatMessageLine } from "./chunking.js";

/**
 * Worker RAG chạy nền trong backend (không Redis/hàng đợi), hai pha mỗi lượt:
 *  1. Tạo đoạn (không gọi API): đọc tin mới của từng conversation từ RagCursor, gom thành đoạn,
 *     chia file được gửi kèm. Bỏ tin của bot và chữ trong chat riêng với Komi (file vẫn lấy).
 *  2. Embedding: lấy các đoạn chưa có vector, tối đa theo hạn mức còn lại của phút này.
 * Chạy lại bao nhiêu lần cũng không tạo trùng (khoá `key` của KnowledgeChunk).
 */

// số tin đọc mỗi lần cho một conversation
export const MESSAGE_BATCH = 500;
// hạn mức free của gemini-embedding-2 là 100 đoạn/phút; worker dùng 60, chừa 40 cho embedding câu hỏi
export const EMBEDDINGS_PER_MINUTE = 60;
export const INDEX_INTERVAL_MS = 30_000;

const idOf = (value) => (value?._id ?? value).toString();

/** 'Nhóm "Đồ án Komi"' hoặc "Chat riêng giữa An và Bình" */
export const conversationLabel = (conversation, names) => {
  if (conversation.type === "group") return `Nhóm "${conversation.group?.name ?? "không tên"}"`;
  const people = conversation.participants.map((p) => names.get(idOf(p.userId)) ?? "Ai đó");
  return `Chat riêng giữa ${people.join(" và ")}`;
};

// Upsert theo key: chạy lại hay hai worker cùng chạy cũng không trùng. Trả số đoạn mới tạo.
const insertChunks = async (docs) => {
  if (docs.length === 0) return 0;
  try {
    const result = await KnowledgeChunk.bulkWrite(
      docs.map((doc) => ({
        updateOne: { filter: { key: doc.key }, update: { $setOnInsert: { ...doc, embeddedAt: null } }, upsert: true },
      })),
      { ordered: false },
    );
    return result.upsertedCount;
  } catch (error) {
    // hai upsert cùng key chạy đồng thời: một bên báo trùng, đoạn vẫn chỉ có một
    if (error?.code === 11000 || error?.writeErrors?.every((e) => e.code === 11000)) {
      return error.result?.upsertedCount ?? 0;
    }
    throw error;
  }
};

/** Chia một file thành đoạn cho một conversation (mỗi conversation một bộ, để lọc quyền theo conversationId). */
const chunkFileFor = async (conversation, fileId, label) => {
  const prefix = `file:${conversation._id}:${fileId}:`;
  if (await KnowledgeChunk.exists({ key: `${prefix}0` })) return 0;

  const file = await ChatFile.findById(fileId, { name: 1, textStatus: 1, pages: 1 }).lean();
  if (!file || file.textStatus !== "ok") return 0; // file scan / hỏng: không có chữ để tìm

  const docs = chunkFilePages(file.pages).map((piece, seq) => ({
    key: `${prefix}${seq}`,
    scope: CHUNK_SCOPE.CONVERSATION,
    conversationId: conversation._id,
    sourceType: CHUNK_SOURCE.CHAT_FILE,
    header: `File "${file.name}"${piece.page ? `, trang ${piece.page}` : ""} — gửi trong ${label}`,
    text: piece.text,
    fileId: file._id,
    fileName: file.name,
    page: piece.page ?? undefined,
    seq,
  }));
  return insertChunks(docs);
};

/** Pha 1 cho một conversation. Trả số đoạn mới tạo. */
const chunkConversation = async (conversation, { now, botIds }) => {
  const conversationId = conversation._id;
  const isKomiChat =
    conversation.type === "direct" && conversation.participants.some((p) => botIds.has(idOf(p.userId)));
  let created = 0;

  for (;;) {
    const cursor = await RagCursor.findOne({ conversationId }).lean();
    const filter = { conversationId };
    if (cursor) {
      filter.$or = [
        { createdAt: { $gt: cursor.lastMessageAt } },
        { createdAt: cursor.lastMessageAt, _id: { $gt: cursor.lastMessageId } },
      ];
    }
    const messages = await Message.find(filter, { senderId: 1, content: 1, file: 1, createdAt: 1 })
      .sort({ createdAt: 1, _id: 1 })
      .limit(MESSAGE_BATCH)
      .lean();
    if (messages.length === 0) return created;

    const ids = [...new Set([...messages.map((m) => idOf(m.senderId)), ...conversation.participants.map((p) => idOf(p.userId))])];
    const users = await User.find({ _id: { $in: ids } }, { displayName: 1 }).lean();
    const names = new Map(users.map((u) => [idOf(u), u.displayName]));
    const label = conversationLabel(conversation, names);

    // file gửi kèm (không phải của bot): chia ngay, kể cả trong chat riêng với Komi
    for (const m of messages) {
      if (m.file?.fileId && !botIds.has(idOf(m.senderId))) created += await chunkFileFor(conversation, m.file.fileId, label);
    }

    const items = messages.map((m) => ({
      _id: m._id,
      createdAt: m.createdAt,
      line:
        isKomiChat || botIds.has(idOf(m.senderId))
          ? null
          : formatMessageLine({
              createdAt: m.createdAt,
              senderName: names.get(idOf(m.senderId)),
              content: m.content,
              fileName: m.file?.name,
            }),
    }));

    // lô đầy thì còn tin phía sau: không đóng đoạn cuối vì "im lặng" (tin tiếp theo có thể nối vào)
    const full = messages.length === MESSAGE_BATCH;
    const { windows, consumed } = buildMessageWindows(items, full ? new Date(0) : now);

    created += await insertChunks(
      windows.map((w) => ({
        key: `msg:${conversationId}:${w[0]._id}`,
        scope: CHUNK_SCOPE.CONVERSATION,
        conversationId,
        sourceType: CHUNK_SOURCE.MESSAGE,
        header: label,
        text: w.map((item) => item.line).join("\n"),
        startMessageId: w[0]._id,
        endMessageId: w.at(-1)._id,
        startAt: w[0].createdAt,
        endAt: w.at(-1).createdAt,
      })),
    );

    if (consumed >= 0) {
      const last = items[consumed];
      await RagCursor.updateOne(
        { conversationId },
        { $set: { lastMessageAt: last.createdAt, lastMessageId: last._id } },
        { upsert: true },
      );
    }
    // đọc tiếp lô sau chỉ khi lô này đầy và đã tiến được
    if (!full || consumed < 0) return created;
  }
};

/** Pha 1 cho mọi conversation có tin mới hơn cursor. */
export const chunkPending = async ({ now = new Date() } = {}) => {
  const botIds = new Set((await User.find({ isBot: true }, { _id: 1 }).lean()).map(idOf));
  const conversations = await Conversation.find(
    { lastMessageAt: { $ne: null } },
    { type: 1, participants: 1, group: 1, lastMessageAt: 1 },
  ).lean();
  const cursors = await RagCursor.find({}, { conversationId: 1, lastMessageAt: 1 }).lean();
  const cursorAt = new Map(cursors.map((c) => [idOf(c.conversationId), c.lastMessageAt]));

  let created = 0;
  for (const conversation of conversations) {
    const at = cursorAt.get(idOf(conversation));
    if (at && at >= conversation.lastMessageAt) continue; // đã đọc hết
    created += await chunkConversation(conversation, { now, botIds });
  }
  return created;
};

/** Pha 2: embedding tối đa `limit` đoạn đang chờ (cũ trước). Lỗi của nhà cung cấp ném ra cho bên gọi. */
export const embedPending = async ({ limit, signal } = {}) => {
  if (!(limit > 0)) return 0;
  const chunks = await KnowledgeChunk.find({ embeddedAt: null }, { header: 1, text: 1 })
    .sort({ createdAt: 1 })
    .limit(limit)
    .lean();
  if (chunks.length === 0) return 0;

  const vectors = await embeddings.embed({ texts: chunks.map(embeddingInput), signal });
  const embeddedAt = new Date();
  await KnowledgeChunk.bulkWrite(
    chunks.map((chunk, i) => ({
      updateOne: { filter: { _id: chunk._id }, update: { $set: { embedding: vectors[i], embeddedAt } } },
    })),
  );
  return chunks.length;
};

export const countPending = () => KnowledgeChunk.countDocuments({ embeddedAt: null });

/**
 * Một lượt của worker. Không làm gì khi embedding đang tắt.
 * @returns {Promise<{ chunksCreated: number, embedded: number }>}
 */
export const runIndexerOnce = async ({ now = new Date(), maxEmbeddings = EMBEDDINGS_PER_MINUTE, signal } = {}) => {
  if (!embeddings.isReady()) return { chunksCreated: 0, embedded: 0 };
  const chunksCreated = await chunkPending({ now });
  const embedded = await embedPending({ limit: maxEmbeddings, signal });
  return { chunksCreated, embedded };
};

/**
 * Hạn mức theo phút (cửa sổ cố định), đếm trong bộ nhớ của một tiến trình.
 * pauseUntil: nghỉ hẳn tới thời điểm đó (sau lỗi 429 hoặc sai key).
 */
export const createRateBudget = ({ perMinute = EMBEDDINGS_PER_MINUTE, now = () => Date.now() } = {}) => {
  let windowStart = -Infinity;
  let used = 0;
  let pausedUntil = 0;
  return {
    available() {
      const t = now();
      if (t < pausedUntil) return 0;
      if (t - windowStart >= 60_000) {
        windowStart = t;
        used = 0;
      }
      return Math.max(0, perMinute - used);
    },
    use(n) {
      used += n;
    },
    pauseUntil(t) {
      pausedUntil = Math.max(pausedUntil, t);
    },
  };
};

/** Một lượt có kiểm soát hạn mức: lỗi 429 thì nghỉ tới phút sau (không gọi lại ngay), sai key thì nghỉ 10 phút. */
export const createIndexerTick = ({ budget = createRateBudget(), now = () => Date.now(), log = console } = {}) => {
  let running = false;
  return async () => {
    if (running) return null; // lượt trước chưa xong
    running = true;
    const max = budget.available();
    try {
      const result = await runIndexerOnce({ now: new Date(now()), maxEmbeddings: max });
      budget.use(result.embedded);
      if (result.chunksCreated || result.embedded) {
        log.log(`RAG: tạo ${result.chunksCreated} đoạn, embedding ${result.embedded} đoạn`);
      }
      return result;
    } catch (error) {
      budget.use(max); // không biết đã gửi bao nhiêu: coi như dùng hết phần của phút này
      if (error?.code === LLM_ERROR.RATE_LIMIT) budget.pauseUntil(now() + 60_000);
      else if (error?.code === LLM_ERROR.AUTH) budget.pauseUntil(now() + 10 * 60_000);
      log.error("RAG: lỗi khi tạo index", error?.code ?? "", error?.detail ?? error?.message ?? error);
      return null;
    } finally {
      running = false;
    }
  };
};

/** Bật worker chạy nền (gọi từ server.js). Trả hàm để dừng. */
export const startRagIndexer = ({ intervalMs = INDEX_INTERVAL_MS } = {}) => {
  const tick = createIndexerTick();
  const first = setTimeout(tick, 5_000); // chờ server khởi động xong
  const timer = setInterval(tick, intervalMs);
  return () => {
    clearTimeout(first);
    clearInterval(timer);
  };
};
