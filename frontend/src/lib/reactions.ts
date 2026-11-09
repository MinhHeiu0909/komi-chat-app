import type { Reaction } from "@/types/chat";

// Phải khớp ALLOWED_REACTIONS ở backend (messageController.js)
export const REACTIONS = ["👍", "❤️", "😆", "😮", "😢", "😡"] as const;

/**
 * Áp một lần bấm cảm xúc giống server: bấm lại đúng emoji của mình thì gỡ,
 * bấm emoji khác thì thay (mỗi người một cảm xúc).
 */
export const applyReaction = (reactions: Reaction[], userId: string, emoji: string) => {
  const removing = reactions.some((r) => r.userId === userId && r.emoji === emoji);
  const others = reactions.filter((r) => r.userId !== userId);
  return removing ? others : [...others, { userId, emoji }];
};

/** Gom theo emoji, giữ thứ tự của REACTIONS: [{ emoji, userIds }] */
export const groupReactions = (reactions: Reaction[]) =>
  REACTIONS.map((emoji) => ({
    emoji,
    userIds: reactions.filter((r) => r.emoji === emoji).map((r) => r.userId),
  })).filter((g) => g.userIds.length > 0);
