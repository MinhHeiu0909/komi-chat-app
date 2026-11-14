/**
 * Nạp bộ dữ liệu eval (eval/data/corpus.json) vào một DB riêng rồi tạo index RAG.
 *
 *   npm run eval:load                                   # DB komi_eval, đoạn tin 10 tin (cấu hình hiện tại)
 *   npm run eval:load -- --db komi_eval_w5 --max-messages 5   # biến thể đoạn 5 tin
 *
 * XOÁ toàn bộ DB đích trước khi nạp (chỉ chấp nhận tên bắt đầu bằng "komi_eval").
 * Cần EMBEDDING_* (xem backend/.env.example); giữ 60 đoạn/phút như worker, gặp 429 thì chờ 1 phút.
 */
import "dotenv/config";
import mongoose from "mongoose";
import Conversation from "../src/models/Conversation.js";
import KnowledgeChunk from "../src/models/KnowledgeChunk.js";
import Message from "../src/models/Message.js";
import RagCursor from "../src/models/RagCursor.js";
import SharedDocument from "../src/models/SharedDocument.js";
import User from "../src/models/User.js";
import { embeddings } from "../src/ai/embeddings.js";
import { LLM_ERROR } from "../src/ai/errors.js";
import { countPending, createRateBudget, runIndexerOnce } from "../src/ai/rag/indexer.js";
import { ensureVectorIndex } from "../src/ai/rag/vectorStore.js";
import { findOrCreateDirectConversation } from "../src/utils/directConversation.js";
import { evalConnectionString, parseArgs, readJson, sleep, vnDate } from "./evalCommon.js";

const args = parseArgs();
const dbName = args.db ?? "komi_eval";
const maxMessages = args["max-messages"] ? Number(args["max-messages"]) : undefined;

const run = async () => {
  if (!embeddings.isReady()) throw new Error("Embedding đang tắt: đặt EMBEDDING_PROVIDER (xem backend/.env.example)");
  const corpus = readJson("data/corpus.json");

  await mongoose.connect(evalConnectionString(dbName));
  await mongoose.connection.dropDatabase(); // vector index đi theo collection, tạo lại bên dưới
  await Promise.all([User.init(), Conversation.init(), KnowledgeChunk.init(), RagCursor.init()]);

  // người dùng + Komi AI (để có chat riêng với Komi khi chạy câu hỏi)
  const users = {};
  for (const u of corpus.users) {
    users[u.username] = await User.create({
      ...u,
      email: `${u.username}@eval.komi`,
      hashedPassword: "eval-khong-dang-nhap",
    });
  }
  await User.create({
    username: "komi.ai",
    email: "komi.ai@eval.komi",
    displayName: "Komi AI",
    hashedPassword: "eval-khong-dang-nhap",
    isBot: true,
  });

  for (const spec of corpus.conversations) {
    const members = spec.members.map((name) => users[name]);
    const conversation =
      spec.type === "group"
        ? await Conversation.create({
            type: "group",
            group: { name: spec.name, createdBy: members[0]._id },
            participants: members.map((m) => ({ userId: m._id })),
          })
        : (await findOrCreateDirectConversation(members[0]._id, members[1]._id)).conversation;

    const docs = spec.messages.map(([sender, at, content]) => ({
      conversationId: conversation._id,
      senderId: users[sender]._id,
      content,
      createdAt: vnDate(at),
      updatedAt: vnDate(at),
    }));
    await Message.insertMany(docs);
    await Conversation.updateOne({ _id: conversation._id }, { lastMessageAt: docs.at(-1).createdAt });
  }

  // tài liệu kho chung: chỉ cần chữ, không có file thật trên Cloudinary
  for (const doc of corpus.sharedDocuments) {
    await SharedDocument.create({
      uploaderId: users[doc.uploader]._id,
      url: `https://example.invalid/eval/${doc.name}`,
      publicId: `eval/${doc.name}`,
      name: doc.name,
      size: 1,
      kind: doc.kind,
      textStatus: "ok",
      charCount: doc.pages.join("").length,
      pages: doc.pages.map((text, i) => (doc.kind === "pdf" ? { number: i + 1, text } : { text })),
    });
  }

  const index = await ensureVectorIndex();
  console.log(`DB ${dbName}: đã nạp dữ liệu; vector index: ${index.status}`);
  if (index.status === "mismatch") throw new Error("Vector index lệch số chiều");

  // tạo đoạn + embedding (đóng mọi đoạn: "bây giờ" ở rất xa)
  const budget = createRateBudget();
  const windowOptions = maxMessages ? { maxMessages } : undefined;
  for (;;) {
    const max = budget.available();
    if (max === 0) {
      await sleep(5_000);
      continue;
    }
    let result;
    try {
      result = await runIndexerOnce({ now: new Date(8.64e15), maxEmbeddings: max, windowOptions });
    } catch (error) {
      if (error?.code !== LLM_ERROR.RATE_LIMIT) throw error;
      console.log("Hết hạn mức embedding (429), chờ 1 phút...");
      budget.use(max);
      budget.pauseUntil(Date.now() + 60_000);
      continue;
    }
    budget.use(result.embedded);
    const pending = await countPending();
    console.log(`Tạo ${result.chunksCreated} đoạn, embedding ${result.embedded} đoạn, còn chờ ${pending}`);
    if (pending === 0 && result.chunksCreated === 0) break;
  }

  const bySource = await KnowledgeChunk.aggregate([{ $group: { _id: "$sourceType", n: { $sum: 1 } } }]);
  console.log("Số đoạn:", Object.fromEntries(bySource.map((r) => [r._id, r.n])), maxMessages ? `(tối đa ${maxMessages} tin/đoạn)` : "");
};

run()
  .catch((error) => {
    console.error(error?.detail ?? error?.message ?? error);
    process.exitCode = 1;
  })
  .finally(() => mongoose.disconnect());
