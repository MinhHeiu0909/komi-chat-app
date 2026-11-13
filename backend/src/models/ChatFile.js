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
  },
  { timestamps: true },
);

const ChatFile = mongoose.model("ChatFile", chatFileSchema);
export default ChatFile;
