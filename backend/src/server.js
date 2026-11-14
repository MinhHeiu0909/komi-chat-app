// Phải là import đầu tiên: ESM chạy các import trước code của file,
// nên nếu gọi dotenv.config() ở thân file thì socket/index.js và app.js
// đã đọc process.env (CLIENT_URL...) khi biến môi trường chưa được nạp.
import "dotenv/config";

import { v2 as cloudinary } from "cloudinary";
import { connectDB } from "./libs/db.js";
import "./app.js";
import { server } from "./socket/index.js";
import { getKomiBot } from "./ai/komiBot.js";
import { llm } from "./ai/llm.js";
import { embeddings } from "./ai/embeddings.js";
import { startRagIndexer } from "./ai/rag/indexer.js";
import { ensureVectorIndex } from "./ai/rag/vectorStore.js";

const PORT = process.env.PORT || 5001;

const REQUIRED_ENV = ["MONGODB_CONNECTIONSTRING", "ACCESS_TOKEN_SECRET", "CLIENT_URL"];
const missing = REQUIRED_ENV.filter((key) => !process.env[key]);

if (missing.length > 0) {
  console.error(`Thiếu biến môi trường: ${missing.join(", ")} (xem backend/.env.example)`);
  process.exit(1);
}

// CLOUDINARY Configuration
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

connectDB().then(async () => {
  if (llm.isReady()) {
    await getKomiBot().catch((error) => console.error("Không tạo được user Komi AI", error));
    console.log(`Komi AI bật (LLM_PROVIDER=${process.env.LLM_PROVIDER})`);
  } else {
    console.log("Komi AI tắt (chưa cấu hình LLM_PROVIDER)");
  }

  // RAG (Giai đoạn 4): tạo vector index nếu chưa có, rồi bật worker chạy nền
  if (embeddings.isReady()) {
    try {
      const index = await ensureVectorIndex();
      if (index.status === "mismatch") {
        console.error(
          `Vector index có ${index.indexDimensions} chiều nhưng EMBEDDING_DIMENSIONS là ${embeddings.dimensions()}: ` +
            "tìm kiếm sẽ lỗi tới khi xoá index và embedding cũ",
        );
      }
    } catch (error) {
      console.error("Không tạo được vector index (MongoDB có hỗ trợ $vectorSearch không?)", error?.message ?? error);
    }
    startRagIndexer();
    console.log(`RAG bật (EMBEDDING_PROVIDER=${process.env.EMBEDDING_PROVIDER})`);
  } else {
    console.log("RAG tắt (chưa cấu hình EMBEDDING_PROVIDER)");
  }

  server.listen(PORT, () => {
    console.log(`server bắt đầu trên cổng ${PORT}`);
  });
});
