import mongoose from "mongoose";

/**
 * Tài liệu của kho tài liệu chung (Giai đoạn 4): mọi người trong app xem và tìm được,
 * chỉ người tải lên xoá được. Chữ trích lúc tải lên giống ChatFile (utils/documentText.js).
 * Worker RAG chia thành đoạn (scope "shared") rồi đặt chunkedAt.
 */
const sharedDocumentSchema = new mongoose.Schema(
  {
    uploaderId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
    url: { type: String, required: true },
    // Cloudinary public_id (resource_type "raw") để xoá file
    publicId: { type: String, required: true },
    name: { type: String, required: true },
    size: { type: Number, required: true },
    kind: { type: String, enum: ["pdf", "docx"], required: true },

    // ok: có chữ; empty: không có chữ (PDF scan); failed: không đọc được (hỏng, có mật khẩu)
    textStatus: { type: String, enum: ["ok", "empty", "failed"], default: "failed" },
    charCount: { type: Number, default: 0 },
    textTruncated: { type: Boolean, default: false },
    pages: {
      type: [new mongoose.Schema({ number: Number, text: String }, { _id: false })],
      default: [],
    },

    // Chỉ index tối đa MAX_SHARED_INDEX_CHARS ký tự đầu: indexTruncated cho biết có bị cắt không,
    // indexedUntilPage là trang cuối được index (PDF; null với .docx)
    indexTruncated: { type: Boolean, default: false },
    indexedUntilPage: { type: Number, default: null },
    // worker đã chia thành đoạn chưa (null: chưa)
    chunkedAt: { type: Date, default: null },
  },
  { timestamps: true },
);

sharedDocumentSchema.index({ createdAt: -1 });
sharedDocumentSchema.index({ chunkedAt: 1 });

const SharedDocument = mongoose.model("SharedDocument", sharedDocumentSchema);
export default SharedDocument;
