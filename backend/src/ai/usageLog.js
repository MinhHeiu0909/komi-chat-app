import mongoose from "mongoose";
import AiCallLog, { AI_CALL_KIND } from "../models/AiCallLog.js";

export { AI_CALL_KIND };

/** Ước tính số token khi nhà cung cấp không báo: khoảng 4 ký tự một token. */
export const estimateTokens = (text) => Math.ceil(String(text ?? "").length / 4);

const toCount = (value) => (Number.isFinite(value) && value > 0 ? Math.round(value) : 0);

/**
 * Ghi một lần gọi LLM / embedding vào AiCallLog. Không bao giờ ném lỗi:
 * ghi log hỏng thì chỉ in ra console, không làm hỏng câu trả lời của Komi AI.
 * Chưa kết nối DB (vd. test riêng provider) thì bỏ qua, không chờ mongoose.
 */
export const recordAiCall = async ({
  kind = AI_CALL_KIND.OTHER,
  userId = null,
  provider = "",
  model = "",
  inputTokens,
  outputTokens,
  estimated = false,
  durationMs,
  status,
  errorCode = null,
}) => {
  if (mongoose.connection.readyState !== 1) return;
  try {
    await AiCallLog.create({
      kind: Object.values(AI_CALL_KIND).includes(kind) ? kind : AI_CALL_KIND.OTHER,
      userId,
      provider,
      model,
      inputTokens: toCount(inputTokens),
      outputTokens: toCount(outputTokens),
      estimated,
      durationMs: toCount(durationMs),
      status,
      errorCode,
    });
  } catch (error) {
    console.error("Lỗi khi ghi log gọi AI:", error?.message ?? error);
  }
};

/** Trạng thái và mã lỗi để ghi log từ lỗi bắt được khi gọi nhà cung cấp. */
export const outcomeOf = (error, signal) => {
  if (signal?.aborted && error?.name === "AbortError") return { status: "aborted", errorCode: null };
  return { status: "error", errorCode: error?.code ?? "LLM_ERROR" };
};
