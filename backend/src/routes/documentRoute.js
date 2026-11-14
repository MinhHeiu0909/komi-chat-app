import express from "express";

import { deleteDocument, listDocuments, uploadDocument } from "../controllers/documentController.js";
import { rateLimit } from "../middlewares/rateLimit.js";
import { parseMessageFile } from "../utils/messageFile.js";

// Kho tài liệu chung: mọi người đã đăng nhập (protectedRoute ở app.js)
const router = express.Router();

router.get("/", listDocuments);
router.post(
  "/",
  rateLimit({ windowMs: 10 * 60 * 1000, max: 30, message: "Tải tài liệu quá nhiều, hãy thử lại sau" }),
  parseMessageFile, // PDF / .docx, tối đa 10MB như file trong chat
  uploadDocument,
);
router.delete("/:documentId", deleteDocument);

export default router;
