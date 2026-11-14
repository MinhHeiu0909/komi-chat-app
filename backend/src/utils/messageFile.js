import crypto from "node:crypto";
import multer from "multer";
import { v2 as cloudinary } from "cloudinary";
import { uploadRawFromBuffer } from "../middlewares/uploadMiddleware.js";

export const MAX_MESSAGE_FILE_BYTES = 10 * 1024 * 1024; // 10MB
export const MESSAGE_FILE_FOLDER = "komi_chat/files";
// tài liệu của kho chung (Giai đoạn 4)
export const SHARED_FILE_FOLDER = "komi_chat/shared";
export const MAX_FILE_NAME_LENGTH = 150;

// Chữ hiện ở danh sách chat / trích dẫn khi tin chỉ có file
export const filePreviewText = (name) => `📎 ${name}`;

/**
 * Nhận dạng tài liệu bằng nội dung file, không tin đuôi file / mimetype client khai.
 *  - PDF: có "%PDF-" ở đầu (cho phép vài byte rác phía trước như các trình đọc PDF).
 *  - DOCX: là file zip ("PK\x03\x04") có chứa "word/document.xml"
 *    (tên file trong zip không bị nén nên tìm thẳng được).
 */
export const detectDocumentKind = (buffer) => {
  if (!Buffer.isBuffer(buffer) || buffer.length < 8) return null;
  const head = buffer.subarray(0, 1024).toString("latin1");
  if (head.indexOf("%PDF-") !== -1) return "pdf";
  if (buffer.subarray(0, 4).equals(Buffer.from([0x50, 0x4b, 0x03, 0x04])) && buffer.includes("word/document.xml")) {
    return "docx";
  }
  return null;
};

/**
 * Tên file để hiển thị: bỏ đường dẫn và ký tự điều khiển, cắt ngắn, đảm bảo đúng đuôi.
 * multer (busboy) đọc tên file theo latin1 nên tên tiếng Việt UTF-8 bị lỗi font:
 * giải mã lại thành UTF-8, nếu ra ký tự hỏng thì giữ nguyên.
 */
export const cleanFileName = (rawName, kind) => {
  let name = String(rawName ?? "");
  const utf8 = Buffer.from(name, "latin1").toString("utf8");
  if (!utf8.includes("�")) name = utf8;

  name = name
    .split(/[\\/]/)
    .pop()
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u001f\u007f]/g, "")
    .trim();

  const ext = `.${kind}`;
  let base = name.toLowerCase().endsWith(ext) ? name.slice(0, -ext.length) : name;
  base = base.slice(0, MAX_FILE_NAME_LENGTH - ext.length).trim() || "tai-lieu";
  return `${base}${ext}`;
};

/**
 * Nơi lưu file. Gói trong một object để test thay được bằng bản giả
 * (không gọi Cloudinary thật).
 */
export const fileStorage = {
  isReady: () =>
    Boolean(
      process.env.CLOUDINARY_CLOUD_NAME &&
        process.env.CLOUDINARY_API_KEY &&
        process.env.CLOUDINARY_API_SECRET,
    ),

  // resource_type "raw": Cloudinary giữ nguyên file, không biến đổi.
  // public_id ngẫu nhiên (kèm đuôi) để không đoán được link; tên gốc lưu ở DB.
  upload: (buffer, userId, kind) =>
    uploadRawFromBuffer(buffer, {
      folder: `${MESSAGE_FILE_FOLDER}/${userId}`,
      public_id: `${crypto.randomUUID()}.${kind}`,
    }),

  // tài liệu kho chung: cùng cách lưu, khác thư mục
  uploadShared: (buffer, userId, kind) =>
    uploadRawFromBuffer(buffer, {
      folder: `${SHARED_FILE_FOLDER}/${userId}`,
      public_id: `${crypto.randomUUID()}.${kind}`,
    }),

  // xoá file "raw" khỏi Cloudinary (khi xoá tài liệu kho chung)
  destroy: (publicId) => cloudinary.uploader.destroy(publicId, { resource_type: "raw", invalidate: true }),
};

const multerUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_MESSAGE_FILE_BYTES, files: 1 },
}).single("file");

// Đọc file "file" từ form; lỗi của multer (quá lớn, sai field) trả 4xx thay vì 500
export const parseMessageFile = (req, res, next) => {
  multerUpload(req, res, (err) => {
    if (!err) return next();
    if (err.code === "LIMIT_FILE_SIZE") {
      return res.status(413).json({ message: "File tối đa 10MB" });
    }
    return res.status(400).json({ message: "Tệp tải lên không hợp lệ" });
  });
};
