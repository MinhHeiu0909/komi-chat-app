import express from "express";

import {
  sendDirectMessage,
  sendGroupMessage,
  toggleReaction,
  uploadMessageImage,
} from "../controllers/messageController.js";
import { parseMessageImage } from "../utils/messageImage.js";
import { rateLimit } from "../middlewares/rateLimit.js";

import { checkFriendship } from "../middlewares/friendMiddleware.js";
import { requireConversationMember } from "../middlewares/conversationMiddleware.js";

const router = express.Router();

router.post("/direct", checkFriendship, sendDirectMessage);
router.post("/group", requireConversationMember, sendGroupMessage);
router.post(
  "/images",
  rateLimit({ windowMs: 10 * 60 * 1000, max: 30, message: "Tải ảnh quá nhiều, hãy thử lại sau" }),
  parseMessageImage,
  uploadMessageImage,
);
// kiểm tra thành viên nằm trong controller vì phải tìm conversation từ messageId
router.post("/:messageId/reactions", toggleReaction);

export default router;
