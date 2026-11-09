import multer from "multer";
import { uploadImageFromBuffer } from "../middlewares/uploadMiddleware.js";

export const MAX_MESSAGE_IMAGE_BYTES = 5 * 1024 * 1024; // 5MB
export const MESSAGE_IMAGE_FOLDER = "komi_chat/messages";
// Chữ hiện ở danh sách chat / trích dẫn khi tin chỉ có ảnh
export const IMAGE_PREVIEW_TEXT = "📷 Hình ảnh";

// Nhận dạng ảnh bằng vài byte đầu file. Không tin mimetype/đuôi file
// vì client tự khai, đổi tên file .html thành .png là qua.
const SIGNATURES = [
  (b) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff, // JPEG
  (b) => b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])), // PNG
  (b) => b.subarray(0, 4).toString("latin1") === "GIF8", // GIF
  (b) => b.subarray(0, 4).toString("latin1") === "RIFF" && b.subarray(8, 12).toString("latin1") === "WEBP",
];

export const isSupportedImage = (buffer) =>
  Buffer.isBuffer(buffer) && buffer.length >= 12 && SIGNATURES.some((test) => test(buffer));

/**
 * Nơi lưu ảnh. Gói trong một object để test thay được bằng bản giả
 * (không gọi Cloudinary thật).
 */
export const imageStorage = {
  isReady: () =>
    Boolean(
      process.env.CLOUDINARY_CLOUD_NAME &&
        process.env.CLOUDINARY_API_KEY &&
        process.env.CLOUDINARY_API_SECRET,
    ),

  // Mỗi người một thư mục để server kiểm tra được ảnh gửi kèm tin là do chính họ tải lên.
  // Thu nhỏ ảnh quá lớn (giữ tỉ lệ) ngay khi tải lên để tiết kiệm dung lượng.
  upload: (buffer, userId) =>
    uploadImageFromBuffer(buffer, {
      folder: `${MESSAGE_IMAGE_FOLDER}/${userId}`,
      transformation: [{ width: 1600, height: 1600, crop: "limit" }],
    }),
};

const escapeRegExp = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/**
 * imgUrl gửi kèm tin chỉ hợp lệ khi là ảnh trên Cloudinary của app, nằm trong
 * thư mục của chính người gửi. Không nhận URL tuỳ ý: nếu không, ai cũng có thể
 * nhét link theo dõi (lộ IP người xem) hoặc link tới nội dung bên ngoài.
 */
export const isOwnMessageImageUrl = (url, userId) => {
  const cloud = process.env.CLOUDINARY_CLOUD_NAME;
  if (typeof url !== "string" || url.length > 500 || !cloud) return false;

  const pattern = new RegExp(
    `^https://res\\.cloudinary\\.com/${escapeRegExp(cloud)}/image/upload/(v\\d+/)?` +
      `${MESSAGE_IMAGE_FOLDER}/${escapeRegExp(userId.toString())}/[A-Za-z0-9_-]+\\.(jpe?g|png|gif|webp)$`,
  );
  return pattern.test(url);
};

const multerUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_MESSAGE_IMAGE_BYTES, files: 1 },
}).single("file");

// Đọc file "file" từ form; lỗi của multer (quá lớn, sai field) trả 4xx thay vì 500
export const parseMessageImage = (req, res, next) => {
  multerUpload(req, res, (err) => {
    if (!err) return next();
    if (err.code === "LIMIT_FILE_SIZE") {
      return res.status(413).json({ message: "Ảnh tối đa 5MB" });
    }
    return res.status(400).json({ message: "Tệp tải lên không hợp lệ" });
  });
};
