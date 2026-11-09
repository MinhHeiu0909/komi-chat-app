// Phải khớp backend (src/utils/messageImage.js)
export const ACCEPTED_IMAGE_TYPES = ["image/jpeg", "image/png", "image/gif", "image/webp"];
export const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
export const IMAGE_PREVIEW_TEXT = "📷 Hình ảnh";

/** Kiểm tra sơ bộ trước khi tải lên (server vẫn kiểm tra lại). Trả về lỗi hoặc null. */
export const validateImageFile = (file: File): string | null => {
  if (!ACCEPTED_IMAGE_TYPES.includes(file.type)) return "Chỉ gửi được ảnh JPG, PNG, GIF hoặc WEBP";
  if (file.size > MAX_IMAGE_BYTES) return "Ảnh tối đa 5MB";
  return null;
};
