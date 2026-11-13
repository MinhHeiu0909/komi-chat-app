import type { Message, MessageFile } from "@/types/chat";
import { IMAGE_PREVIEW_TEXT } from "./messageImage";

// Phải khớp backend (src/utils/messageFile.js)
export const MAX_DOCUMENT_BYTES = 10 * 1024 * 1024;
export const DOCUMENT_ACCEPT =
  ".pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document";

const extOf = (name: string) => name.toLowerCase().split(".").pop() ?? "";

/** File PDF / Word .docx (theo đuôi file; server nhận dạng lại theo nội dung). */
export const isDocumentFile = (file: File) => ["pdf", "docx"].includes(extOf(file.name));

export const documentKindOf = (file: File): MessageFile["kind"] =>
  extOf(file.name) === "docx" ? "docx" : "pdf";

/** Kiểm tra sơ bộ trước khi tải lên (server vẫn kiểm tra lại). Trả về lỗi hoặc null. */
export const validateDocumentFile = (file: File): string | null => {
  if (!isDocumentFile(file)) return "Chỉ gửi được file PDF hoặc Word (.docx)";
  if (file.size > MAX_DOCUMENT_BYTES) return "File tối đa 10MB";
  return null;
};

export const filePreviewText = (name: string) => `📎 ${name}`;

// Chữ đại diện cho tin (trích dẫn, thanh "Đang trả lời"): nội dung, hoặc ảnh, hoặc tên file
export const messagePreviewText = (message: Pick<Message, "content" | "imgUrl" | "file">) =>
  message.content ||
  (message.imgUrl ? IMAGE_PREVIEW_TEXT : "") ||
  (message.file ? filePreviewText(message.file.name) : "");

// 1536000 → "1,5 MB"
export const formatFileSize = (bytes: number) => {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1).replace(".", ",")} MB`;
};
