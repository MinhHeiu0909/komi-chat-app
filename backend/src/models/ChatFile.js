import mongoose from "mongoose";

/**
 * File tài liệu (PDF/Word) người dùng tải lên để gửi trong chat.
 * Tin nhắn chỉ tham chiếu file qua fileId; server kiểm tra file thuộc đúng người gửi.
 */
const chatFileSchema = new mongoose.Schema(
  {
    uploaderId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    url: { type: String, required: true },
    // Cloudinary public_id (resource_type "raw") để xoá file khi cần
    publicId: { type: String, required: true },
    // tên file gốc để hiển thị
    name: { type: String, required: true },
    size: { type: Number, required: true },
    kind: { type: String, enum: ["pdf", "docx"], required: true },

    // Chữ trích lúc tải lên (utils/documentText.js), dùng cho hỏi đáp trên file.
    // ok: có chữ; empty: không có chữ (PDF scan); failed: không đọc được (hỏng, có mật khẩu)
    textStatus: { type: String, enum: ["ok", "empty", "failed"], default: "failed" },
    charCount: { type: Number, default: 0 },
    // chữ quá dài bị cắt bớt khi lưu (giữ các trang đầu)
    textTruncated: { type: Boolean, default: false },
    // PDF: mỗi trang một phần tử (number = số trang); .docx: một phần tử, không có number
    pages: {
      type: [new mongoose.Schema({ number: Number, text: String }, { _id: false })],
      default: [],
    },
  },
  { timestamps: true },
);

const ChatFile = mongoose.model("ChatFile", chatFileSchema);
export default ChatFile;
