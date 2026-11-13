/**
 * Các câu trả lời Komi AI đang streaming, để người hỏi bấm dừng được.
 * Tách riêng (không import gì) để socket/index.js dùng mà không bị import vòng.
 * Chỉ nằm trong bộ nhớ: chạy một tiến trình server là đủ ở giai đoạn này.
 */

// streamId -> { controller: AbortController, askerId: string, conversationId: string }
const active = new Map();

export const registerStream = (streamId, info) => active.set(streamId, info);

export const unregisterStream = (streamId) => active.delete(streamId);

/**
 * Dừng một câu trả lời. Chỉ người đã hỏi mới dừng được
 * (người hỏi luôn là thành viên của conversation nên không cần truy vấn DB).
 */
export const stopStream = (streamId, userId) => {
  const stream = typeof streamId === "string" ? active.get(streamId) : undefined;
  if (!stream || stream.askerId !== userId.toString()) return false;
  stream.controller.abort();
  return true;
};
