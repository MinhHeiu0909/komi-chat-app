import { isValidObjectId } from "mongoose";
import DocumentUploadUsage from "../models/DocumentUploadUsage.js";
import KnowledgeChunk, { CHUNK_SOURCE } from "../models/KnowledgeChunk.js";
import SharedDocument from "../models/SharedDocument.js";
import User from "../models/User.js";
import { refundDailyCount, takeDailyCount } from "../ai/quota.js";
import { limitPagesForIndex, MAX_SHARED_INDEX_CHARS } from "../ai/rag/chunking.js";
import { extractDocumentText } from "../utils/documentText.js";
import { cleanFileName, detectDocumentKind, fileStorage } from "../utils/messageFile.js";

/**
 * Kho tài liệu chung (Giai đoạn 4): mọi người đã đăng nhập xem và tải lên được,
 * chỉ người tải lên xoá được. Worker RAG chia thành đoạn để Komi AI tìm (scope "shared").
 */

export const DEFAULT_DOCUMENT_DAILY_LIMIT = 10;
export const MAX_DOCUMENTS_IN_LIST = 200;

export const documentDailyLimit = () => {
  const value = Number(process.env.SHARED_DOC_DAILY_LIMIT);
  return Number.isInteger(value) && value > 0 ? value : DEFAULT_DOCUMENT_DAILY_LIMIT;
};

// Trạng thái hiển thị: unreadable (không có chữ để tìm) | processing (đang chia / đang embedding) | ready
const statusOf = (doc, chunks) => {
  if (doc.textStatus !== "ok") return "unreadable";
  if (!doc.chunkedAt || chunks.embedded < chunks.total) return "processing";
  return "ready";
};

const formatDocument = (doc, { chunks = { total: 0, embedded: 0 }, uploader, userId }) => ({
  _id: doc._id,
  name: doc.name,
  size: doc.size,
  kind: doc.kind,
  url: doc.url,
  createdAt: doc.createdAt,
  uploader: uploader ? { _id: uploader._id, displayName: uploader.displayName, avatarUrl: uploader.avatarUrl ?? null } : null,
  canDelete: doc.uploaderId.toString() === userId.toString(),
  textStatus: doc.textStatus,
  status: statusOf(doc, chunks),
  chunks,
  indexTruncated: doc.indexTruncated,
  indexedUntilPage: doc.indexedUntilPage,
});

// Đếm số đoạn và số đoạn đã có embedding của từng tài liệu
const chunkCounts = async (docIds) => {
  if (docIds.length === 0) return new Map();
  const rows = await KnowledgeChunk.aggregate([
    { $match: { sourceType: CHUNK_SOURCE.SHARED_DOC, fileId: { $in: docIds } } },
    {
      $group: {
        _id: "$fileId",
        total: { $sum: 1 },
        embedded: { $sum: { $cond: [{ $ne: ["$embeddedAt", null] }, 1, 0] } },
      },
    },
  ]);
  return new Map(rows.map((r) => [r._id.toString(), { total: r.total, embedded: r.embedded }]));
};

export const listDocuments = async (req, res) => {
  try {
    const docs = await SharedDocument.find({}, { pages: 0 })
      .sort({ createdAt: -1 })
      .limit(MAX_DOCUMENTS_IN_LIST)
      .lean();
    const [counts, uploaders] = await Promise.all([
      chunkCounts(docs.map((d) => d._id)),
      User.find({ _id: { $in: [...new Set(docs.map((d) => d.uploaderId.toString()))] } }, { displayName: 1, avatarUrl: 1 }).lean(),
    ]);
    const byId = new Map(uploaders.map((u) => [u._id.toString(), u]));

    return res.status(200).json({
      documents: docs.map((doc) =>
        formatDocument(doc, {
          chunks: counts.get(doc._id.toString()),
          uploader: byId.get(doc.uploaderId.toString()),
          userId: req.user._id,
        }),
      ),
      limits: { dailyUploads: documentDailyLimit(), maxIndexChars: MAX_SHARED_INDEX_CHARS },
    });
  } catch (error) {
    console.error("Lỗi xảy ra khi lấy danh sách tài liệu chung", error);
    return res.status(500).json({ message: "Lỗi hệ thống" });
  }
};

/** Tải một tài liệu (PDF / .docx, tối đa 10MB) vào kho chung. */
export const uploadDocument = async (req, res) => {
  const userId = req.user._id;
  let quota = null;
  try {
    if (!fileStorage.isReady()) {
      return res.status(503).json({ message: "Server chưa cấu hình nơi lưu file (Cloudinary)" });
    }
    if (!req.file) return res.status(400).json({ message: "Chưa chọn file" });
    const kind = detectDocumentKind(req.file.buffer);
    if (!kind) return res.status(400).json({ message: "Chỉ nhận file PDF hoặc Word (.docx)" });

    quota = await takeDailyCount(DocumentUploadUsage, userId, documentDailyLimit());
    if (!quota.ok) {
      quota = null;
      return res.status(429).json({
        message: `Bạn đã tải lên ${documentDailyLimit()} tài liệu chung hôm nay. Hạn mức được tính lại lúc 0h (giờ Việt Nam).`,
      });
    }

    // trích chữ song song với tải lên; không đọc được chữ thì vẫn lưu file (textStatus báo lý do)
    const [result, text] = await Promise.all([
      fileStorage.uploadShared(req.file.buffer, userId.toString(), kind),
      extractDocumentText(req.file.buffer, kind),
    ]);
    const forIndex = limitPagesForIndex(text.pages);
    const doc = await SharedDocument.create({
      uploaderId: userId,
      url: result.secure_url,
      publicId: result.public_id,
      name: cleanFileName(req.file.originalname, kind),
      size: req.file.size,
      kind,
      textStatus: text.status,
      charCount: text.charCount,
      textTruncated: text.truncated,
      pages: text.pages,
      indexTruncated: text.truncated || forIndex.truncated,
      indexedUntilPage: forIndex.truncated && kind === "pdf" ? forIndex.lastPage : null,
    });
    quota = null; // đã tạo xong: không hoàn lượt

    return res.status(201).json({ document: formatDocument(doc.toObject(), { uploader: req.user, userId }) });
  } catch (error) {
    console.error("Lỗi xảy ra khi tải tài liệu chung", error);
    return res.status(500).json({ message: "Tải tài liệu không thành công" });
  } finally {
    // lỗi giữa chừng (Cloudinary, DB): trả lại lượt đã lấy
    if (quota) await refundDailyCount(DocumentUploadUsage, userId, quota.day).catch(() => {});
  }
};

/** Xoá tài liệu: chỉ người tải lên. Xoá cả các đoạn RAG và file trên Cloudinary. */
export const deleteDocument = async (req, res) => {
  try {
    const { documentId } = req.params;
    if (!isValidObjectId(documentId)) return res.status(404).json({ message: "Không tìm thấy tài liệu" });

    const doc = await SharedDocument.findById(documentId, { uploaderId: 1, publicId: 1 }).lean();
    if (!doc) return res.status(404).json({ message: "Không tìm thấy tài liệu" });
    // kho chung ai cũng thấy nên trả 403 (404 không che giấu được gì)
    if (doc.uploaderId.toString() !== req.user._id.toString()) {
      return res.status(403).json({ message: "Chỉ người tải lên mới xoá được tài liệu này" });
    }

    // xoá tài liệu trước để worker không chia tiếp, rồi xoá đoạn (không còn tìm thấy nữa)
    await SharedDocument.deleteOne({ _id: doc._id });
    await KnowledgeChunk.deleteMany({ sourceType: CHUNK_SOURCE.SHARED_DOC, fileId: doc._id });
    // file trên Cloudinary: lỗi thì chỉ ghi log (tài liệu đã không còn trong app)
    await fileStorage.destroy(doc.publicId).catch((error) => console.error("Không xoá được file trên Cloudinary", error));

    return res.sendStatus(204);
  } catch (error) {
    console.error("Lỗi xảy ra khi xoá tài liệu chung", error);
    return res.status(500).json({ message: "Lỗi hệ thống" });
  }
};
