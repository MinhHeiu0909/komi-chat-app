import mongoose from "mongoose";

// Số tài liệu kho chung một user đã tải lên trong một ngày (giờ Việt Nam). Giống AiUsage.
const documentUploadUsageSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  // "YYYY-MM-DD" theo giờ Việt Nam
  day: { type: String, required: true },
  count: { type: Number, default: 0 },
  // tự xoá sau 7 ngày, chỉ cần số liệu của hôm nay
  createdAt: { type: Date, default: Date.now, expires: 7 * 24 * 60 * 60 },
});

// unique: hai request đồng thời không tạo ra 2 bản ghi cho cùng một ngày
documentUploadUsageSchema.index({ userId: 1, day: 1 }, { unique: true });

const DocumentUploadUsage = mongoose.model("DocumentUploadUsage", documentUploadUsageSchema);
export default DocumentUploadUsage;
