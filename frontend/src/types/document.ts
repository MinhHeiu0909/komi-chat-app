// Tài liệu kho chung (khớp formatDocument ở backend/src/controllers/documentController.js)
export type SharedDocumentStatus = "processing" | "ready" | "unreadable";

export interface SharedDocument {
  _id: string;
  name: string;
  size: number;
  kind: "pdf" | "docx";
  url: string;
  createdAt: string;
  uploader: { _id: string; displayName: string; avatarUrl: string | null } | null;
  canDelete: boolean;
  textStatus: "ok" | "empty" | "failed";
  status: SharedDocumentStatus;
  chunks: { total: number; embedded: number };
  // chỉ index phần đầu (50.000 ký tự); indexedUntilPage: trang cuối được index (PDF)
  indexTruncated: boolean;
  indexedUntilPage: number | null;
}

export interface SharedDocumentLimits {
  dailyUploads: number;
  maxIndexChars: number;
}
