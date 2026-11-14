/**
 * Chạy bộ câu hỏi eval (eval/data/questions.json) qua đúng code tra cứu của Komi AI
 * (buildRetrievalQuery + searchKnowledge, lọc quyền như thật), ghi kết quả ra eval/results/<tên>.json.
 * (Cấu hình "ghép câu hỏi trước" từng so ở đây đã bị bỏ khỏi code; kết quả cũ giữ ở eval/results/ghep-cau-truoc.json.)
 * Script Python eval/metrics.py tính recall@k / MRR từ các file này.
 *
 *   npm run eval:run -- --name hien-tai                          # DB komi_eval
 *   npm run eval:run -- --name doan-5-tin --db komi_eval_w5        # dữ liệu nạp với --max-messages 5
 *
 * Mỗi câu: lưu tạm câu hỏi trước (nếu có) và câu hỏi thành tin nhắn của người hỏi ở đúng nơi hỏi
 * (giống app: bot đọc câu hỏi đã lưu), tra cứu, rồi xoá các tin tạm. Lấy 10 đoạn để tính MRR.
 */
import "dotenv/config";
import fs from "node:fs";
import path from "node:path";
import mongoose from "mongoose";
import Conversation from "../src/models/Conversation.js";
import Message from "../src/models/Message.js";
import User from "../src/models/User.js";
import { embeddings } from "../src/ai/embeddings.js";
import { LLM_ERROR } from "../src/ai/errors.js";
import { buildRetrievalQuery, RETRIEVAL_K, sourceLabel } from "../src/ai/prompt.js";
import { searchKnowledge } from "../src/ai/rag/search.js";
import { findOrCreateDirectConversation } from "../src/utils/directConversation.js";
import { EVAL_DIR, evalConnectionString, parseArgs, readJson, sleep } from "./evalCommon.js";

const TOP = 10;
// giữ dưới 60 câu/phút (hạn mức embedding free 100 đoạn/phút)
const PAUSE_MS = 1_100;

const args = parseArgs();
const dbName = args.db ?? "komi_eval";
const name = args.name;

const findConversation = async (user, where, bot) => {
  if (where === "komi") return (await findOrCreateDirectConversation(user._id, bot._id)).conversation;
  const group = await Conversation.findOne({ type: "group", "group.name": where, "participants.userId": user._id }).lean();
  if (!group) throw new Error(`${user.username} không ở nhóm "${where}"`);
  return group;
};

// tra cứu; gặp 429 thì chờ 1 phút rồi thử lại câu đó (script chạy tay, không phải người dùng chờ)
const searchWithRetry = async (params) => {
  for (let attempt = 1; ; attempt++) {
    try {
      return await searchKnowledge(params);
    } catch (error) {
      if (error?.code !== LLM_ERROR.RATE_LIMIT || attempt >= 3) throw error;
      console.log("Hết hạn mức embedding (429), chờ 1 phút...");
      await sleep(60_000);
    }
  }
};

const run = async () => {
  if (!name || !/^[a-z0-9-]+$/.test(name)) throw new Error("Cần --name <tên-cấu-hình> (chữ thường, số, gạch ngang)");
  if (!embeddings.isReady()) throw new Error("Embedding đang tắt: đặt EMBEDDING_PROVIDER (xem backend/.env.example)");
  const { questions } = readJson("data/questions.json");

  await mongoose.connect(evalConnectionString(dbName));
  const bot = await User.findOne({ isBot: true }).lean();
  if (!bot) throw new Error(`DB ${dbName} chưa có dữ liệu: chạy npm run eval:load trước`);

  const results = [];
  const base = Date.now();
  for (const [i, q] of questions.entries()) {
    const user = await User.findOne({ username: q.asker }).lean();
    const conversation = await findConversation(user, q.where, bot);

    // tin tạm: mới hơn mọi tin trong dữ liệu
    const temp = [];
    if (q.previous) {
      temp.push(await Message.create({ conversationId: conversation._id, senderId: user._id, content: q.previous, createdAt: new Date(base + i * 10_000) }));
    }
    const content = q.where === "komi" ? q.question : `@komi ${q.question}`;
    const trigger = await Message.create({ conversationId: conversation._id, senderId: user._id, content, createdAt: new Date(base + i * 10_000 + 1_000) });
    temp.push(trigger);

    let query;
    let found;
    try {
      query = buildRetrievalQuery({ trigger });
      found = await searchWithRetry({ userId: user._id, conversationId: conversation._id, query, k: TOP });
    } finally {
      await Message.deleteMany({ _id: { $in: temp.map((m) => m._id) } });
    }

    results.push({
      ...q,
      query,
      retrieved: found.map((chunk, rank) => ({
        rank: rank + 1,
        score: Number(chunk.score.toFixed(4)),
        sourceType: chunk.sourceType,
        source: sourceLabel(chunk),
        hit: q.evidence.some((e) => chunk.text.includes(e)),
        text: chunk.text.length > 300 ? `${chunk.text.slice(0, 300)}…` : chunk.text,
      })),
    });
    const firstHit = results.at(-1).retrieved.find((r) => r.hit)?.rank ?? "-";
    console.log(`${q.id} [${q.type}] đoạn đúng ở hạng ${firstHit}`);
    await sleep(PAUSE_MS);
  }

  const out = path.join(EVAL_DIR, "results", `${name}.json`);
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(
    out,
    `${JSON.stringify(
      {
        name,
        db: dbName,
        promptK: RETRIEVAL_K,
        top: TOP,
        embeddingProvider: process.env.EMBEDDING_PROVIDER,
        embeddingModel: process.env.EMBEDDING_MODEL ?? null,
        dimensions: embeddings.dimensions(),
        runAt: new Date().toISOString(),
        results,
      },
      null,
      2,
    )}\n`,
  );
  console.log(`Đã ghi ${path.relative(process.cwd(), out)}`);
};

run()
  .catch((error) => {
    console.error(error?.detail ?? error?.message ?? error);
    process.exitCode = 1;
  })
  .finally(() => mongoose.disconnect());
