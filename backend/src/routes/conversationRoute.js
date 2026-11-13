import express from "express";
import {
  createConversation,
  getConversations,
  getMessages,
  markAsSeen,
  summarizeUnreadMessages,
  searchMessages,
} from "../controllers/conversationController.js";
import { checkFriendship } from "../middlewares/friendMiddleware.js";
import { requireConversationMember } from "../middlewares/conversationMiddleware.js";

const router = express.Router();

router.post("/", checkFriendship, createConversation);
router.get("/", getConversations);
router.get("/:conversationId/messages", requireConversationMember, getMessages);
router.patch("/:conversationId/seen", requireConversationMember, markAsSeen);
router.post("/:conversationId/summary", requireConversationMember, summarizeUnreadMessages);
router.get("/:conversationId/search", requireConversationMember, searchMessages);

export default router;
