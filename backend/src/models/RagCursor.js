import mongoose from "mongoose";

/**
 * Worker RAG đã đọc tin nhắn của một conversation tới đâu (src/ai/rag/indexer.js).
 * Mọi tin tới (lastMessageAt, lastMessageId) đã nằm trong một đoạn đã đóng hoặc được bỏ qua.
 * So theo cả _id vì nhiều tin có thể trùng mili-giây.
 */
const ragCursorSchema = new mongoose.Schema(
  {
    conversationId: { type: mongoose.Schema.Types.ObjectId, ref: "Conversation", required: true, unique: true },
    lastMessageAt: { type: Date, required: true },
    lastMessageId: { type: mongoose.Schema.Types.ObjectId, ref: "Message", required: true },
  },
  { timestamps: true },
);

const RagCursor = mongoose.model("RagCursor", ragCursorSchema);
export default RagCursor;
