import api from "@/lib/axios";
import type { SharedDocument, SharedDocumentLimits } from "@/types/document";

// Kho tài liệu chung: /api/documents
export const documentService = {
  async list(): Promise<{ documents: SharedDocument[]; limits: SharedDocumentLimits }> {
    const res = await api.get("/documents");
    return res.data;
  },

  async upload(file: File): Promise<SharedDocument> {
    const form = new FormData();
    form.append("file", file);
    const res = await api.post("/documents", form, {
      headers: { "Content-Type": "multipart/form-data" },
    });
    return res.data.document;
  },

  async remove(documentId: string): Promise<void> {
    await api.delete(`/documents/${documentId}`);
  },
};
