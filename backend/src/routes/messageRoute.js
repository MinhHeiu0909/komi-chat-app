import express from "express";

import {
  sendDirectMessage,
  sendGroupMessage,
  toggleReaction,
} from "../controllers/messageController.js";

import { checkFriendship } from "../middlewares/friendMiddleware.js";
import { requireConversationMember } from "../middlewares/conversationMiddleware.js";

const router = express.Router();

router.post("/direct", checkFriendship, sendDirectMessage);
router.post("/group", requireConversationMember, sendGroupMessage);
// kiểm tra thành viên nằm trong controller vì phải tìm conversation từ messageId
router.post("/:messageId/reactions", toggleReaction);

export default router;
