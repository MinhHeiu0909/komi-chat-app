import mongoose from "mongoose";

// Giữ log bao lâu (TTL index tự xoá)
export const AI_CALL_LOG_TTL_DAYS = 90;

// Loại lời gọi, để xem chi phí theo từng tính năng
export const AI_CALL_KIND = {
  CHAT: "chat", // Komi AI trả lời (chat riêng, @komi trong nhóm)
  SUMMARY: "summary", // tóm tắt tin chưa đọc
  EMBEDDING_INDEX: "embedding_index", // worker RAG tạo embedding cho đoạn mới
  EMBEDDING_SEARCH: "embedding_search", // embedding câu hỏi khi tra cứu
  OTHER: "other", // script, eval...
};

/**
 * Một lần gọi LLM hoặc embedding: chỉ lưu con số, KHÔNG lưu nội dung câu hỏi / tin nhắn.
 * Trang admin (/admin/ai-usage) đọc collection này.
 */
const aiCallLogSchema = new mongoose.Schema({
  kind: {
    type: String,
    enum: Object.values(AI_CALL_KIND),
    required: true,
  },
  // người gây ra lời gọi; null = hệ thống (worker RAG)
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    default: null,
  },
  provider: { type: String, default: "" },
  model: { type: String, default: "" },
  inputTokens: { type: Number, default: 0 },
  outputTokens: { type: Number, default: 0 },
  // true: nhà cung cấp không báo số token, đây là số ước tính (~4 ký tự / token)
  estimated: { type: Boolean, default: false },
  durationMs: { type: Number, default: 0 },
  status: {
    type: String,
    enum: ["ok", "error", "aborted"],
    required: true,
  },
  // mã LLM_ERROR khi status = "error"
  errorCode: { type: String, default: null },
  createdAt: {
    type: Date,
    default: Date.now,
    expires: AI_CALL_LOG_TTL_DAYS * 24 * 60 * 60,
  },
});

const AiCallLog = mongoose.model("AiCallLog", aiCallLogSchema);
export default AiCallLog;
