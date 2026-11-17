import { setTimeout as sleep } from "node:timers/promises";
import { estimateTokens } from "../usageLog.js";

// Câu trả lời cố định, test so sánh với hằng số này
export const FAKE_REPLY = "Xin chào, mình là Komi AI (bản thử nghiệm). Đây là câu trả lời cố định.";

// Chia câu trả lời thành vài đoạn để giống streaming thật
const CHUNKS = FAKE_REPLY.match(/.{1,16}/gsu);

/**
 * Provider giả cho test và CI: không gọi mạng, không cần key.
 * Nghỉ một chút giữa các đoạn để test được nút dừng (AbortSignal).
 * Báo số token ở cuối như nhà cung cấp thật (ước tính theo số ký tự).
 */
export const createFakeProvider = ({ delayMs = 5 } = {}) => ({
  async *streamChat({ messages = [], signal, onUsage } = {}) {
    for (const chunk of CHUNKS) {
      // ném AbortError nếu bị dừng giữa chừng
      await sleep(delayMs, undefined, { signal });
      yield chunk;
    }
    onUsage?.({
      prompt_tokens: estimateTokens(messages.map((m) => m.content).join("\n")),
      completion_tokens: estimateTokens(FAKE_REPLY),
    });
  },
});
