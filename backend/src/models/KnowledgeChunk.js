import mongoose from "mongoose";

/**
 * Một đoạn chữ để tìm kiếm bằng vector (RAG, Giai đoạn 4).
 * Tạo bởi worker chạy nền (src/ai/rag/indexer.js): tạo đoạn trước, embedding sau,
 * nên đoạn chưa có `embedding` thì chưa tìm được (vector index bỏ qua tài liệu thiếu trường này).
 *
 * Quyền xem: scope "conversation" thì chỉ thành viên của conversationId;
 * scope "shared" (kho tài liệu chung) thì mọi người trong app.
 * Một file gửi vào hai cuộc trò chuyện có hai bộ đoạn riêng, để bộ lọc quyền chỉ cần conversationId.
 */
export const CHUNK_SCOPE = { CONVERSATION: "conversation", SHARED: "shared" };
export const CHUNK_SOURCE = { MESSAGE: "message", CHAT_FILE: "chatFile", SHARED_DOC: "sharedDoc" };

const knowledgeChunkSchema = new mongoose.Schema(
  {
    // khoá chống tạo trùng khi worker chạy lại:
    //   msg:<conversationId>:<id tin đầu>   |   file:<conversationId>:<fileId>:<số thứ tự>
    //   doc:<sharedDocumentId>:<số thứ tự> (kho chung)
    key: { type: String, required: true, unique: true },
    scope: { type: String, enum: Object.values(CHUNK_SCOPE), required: true },
    conversationId: { type: mongoose.Schema.Types.ObjectId, ref: "Conversation", default: null, index: true },
    sourceType: { type: String, enum: Object.values(CHUNK_SOURCE), required: true },

    // dòng mở đầu cho biết đoạn đến từ đâu (vd. 'Nhóm "Đồ án Komi"'), được đưa cùng chữ vào embedding
    header: { type: String, default: "" },
    text: { type: String, required: true },

    // Ghi nguồn — đoạn tin nhắn: tin đầu và cuối của đoạn
    startMessageId: { type: mongoose.Schema.Types.ObjectId, ref: "Message" },
    endMessageId: { type: mongoose.Schema.Types.ObjectId, ref: "Message" },
    startAt: Date,
    endAt: Date,
    // Ghi nguồn — đoạn file: file, trang (PDF; .docx không có trang), thứ tự đoạn trong file.
    // fileId là ChatFile (sourceType chatFile) hoặc SharedDocument (sourceType sharedDoc)
    fileId: { type: mongoose.Schema.Types.ObjectId },
    fileName: String,
    page: Number,
    seq: Number,

    // vector từ embeddings.embed(); thiếu trường này nghĩa là đang chờ worker
    embedding: { type: [Number], default: undefined },
    embeddedAt: { type: Date, default: null },
  },
  { timestamps: true },
);

// worker tìm đoạn chờ embedding theo thứ tự tạo
knowledgeChunkSchema.index({ embeddedAt: 1, createdAt: 1 });
// đếm / xoá đoạn của một tài liệu
knowledgeChunkSchema.index({ sourceType: 1, fileId: 1 });

const KnowledgeChunk = mongoose.model("KnowledgeChunk", knowledgeChunkSchema);
export default KnowledgeChunk;
