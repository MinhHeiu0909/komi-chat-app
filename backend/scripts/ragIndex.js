/**
 * Chạy worker RAG cho tới khi hết việc (thay vì chờ worker chạy nền của server mỗi 30 giây).
 *
 *   npm run rag:index              # đoạn tin còn mở (cuộc trò chuyện chưa im 10 phút) thì để sau
 *   npm run rag:index -- --flush   # đóng luôn mọi đoạn còn mở (vd. ngay sau khi seed)
 *
 * Cần EMBEDDING_PROVIDER (xem backend/.env.example). Giữ hạn mức 60 đoạn/phút như worker;
 * gặp 429 thì chờ một phút rồi làm tiếp.
 */
import "dotenv/config";
import mongoose from "mongoose";
import { embeddings } from "../src/ai/embeddings.js";
import { LLM_ERROR } from "../src/ai/errors.js";
import { countPending, createRateBudget, runIndexerOnce } from "../src/ai/rag/indexer.js";
import { ensureVectorIndex } from "../src/ai/rag/vectorStore.js";

const flush = process.argv.includes("--flush");
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const run = async () => {
  if (!embeddings.isReady()) throw new Error("Embedding đang tắt: đặt EMBEDDING_PROVIDER (xem backend/.env.example)");
  await mongoose.connect(process.env.MONGODB_CONNECTIONSTRING);

  const index = await ensureVectorIndex();
  console.log(`Vector index: ${index.status}`);
  if (index.status === "mismatch") {
    throw new Error(`Index có ${index.indexDimensions} chiều, cấu hình ${embeddings.dimensions()} chiều`);
  }

  const budget = createRateBudget();
  // --flush: coi như đã rất lâu sau tin cuối, mọi đoạn đều đóng
  const now = () => (flush ? new Date(8.64e15) : new Date());

  for (;;) {
    const max = budget.available();
    if (max === 0) {
      await sleep(5_000);
      continue;
    }
    let result;
    try {
      result = await runIndexerOnce({ now: now(), maxEmbeddings: max });
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
  if (!flush) console.log("Xong. Đoạn tin của cuộc trò chuyện chưa im 10 phút sẽ được tạo sau (hoặc chạy với --flush).");
};

run()
  .catch((error) => {
    console.error(error?.detail ?? error?.message ?? error);
    process.exitCode = 1;
  })
  .finally(() => mongoose.disconnect());
