import { LLMError, LLM_ERROR } from "./errors.js";
import { createFakeProvider } from "./providers/fake.js";
import { createOpenAICompatibleProvider } from "./providers/openaiCompatible.js";
import { AI_CALL_KIND, estimateTokens, outcomeOf, recordAiCall } from "./usageLog.js";

export { LLMError, LLM_ERROR };

// Giá trị hợp lệ của LLM_PROVIDER. Để trống (hoặc giá trị lạ) thì AI tắt.
export const LLM_PROVIDERS = {
  FAKE: "fake",
  OPENAI_COMPATIBLE: "openai-compatible",
};

// Đọc biến môi trường mỗi lần gọi (rẻ) để test đổi cấu hình được mà không phải nạp lại module
const createProvider = () => {
  const provider = (process.env.LLM_PROVIDER ?? "").trim().toLowerCase();

  if (provider === LLM_PROVIDERS.FAKE) return createFakeProvider();

  if (provider === LLM_PROVIDERS.OPENAI_COMPATIBLE) {
    const baseUrl = process.env.LLM_BASE_URL?.trim();
    const model = process.env.LLM_MODEL?.trim();
    // API key có thể để trống (server nội bộ không cần key); sai/thiếu key thì nhận lỗi AUTH khi gọi
    const apiKey = process.env.LLM_API_KEY?.trim();
    if (baseUrl && model) return createOpenAICompatibleProvider({ baseUrl, apiKey, model });
  }

  return null;
};

/**
 * Điểm duy nhất để gọi LLM trong backend.
 * messages theo định dạng OpenAI: [{ role: "system" | "user" | "assistant", content: "..." }]
 *
 * Lỗi ném ra:
 *  - LLMError (err.code thuộc LLM_ERROR) khi nhà cung cấp lỗi, timeout, hoặc AI đang tắt;
 *  - lỗi abort gốc (err.name === "AbortError") khi signal bị huỷ.
 *
 * Mỗi lần gọi được ghi vào AiCallLog (số token, thời gian, kết quả; không lưu nội dung).
 * `usage`: { kind (AI_CALL_KIND), userId } để biết lời gọi thuộc tính năng nào, của ai.
 */
export const llm = {
  // false khi LLM_PROVIDER để trống / không hợp lệ / thiếu LLM_BASE_URL hoặc LLM_MODEL
  isReady: () => createProvider() !== null,

  // Trả về từng đoạn chữ: for await (const chunk of llm.streamChat({ messages, signal })) ...
  async *streamChat({ messages, signal, usage = {} } = {}) {
    const provider = createProvider();
    if (!provider) {
      throw new LLMError(LLM_ERROR.OTHER, { detail: "AI đang tắt: chưa cấu hình LLM_PROVIDER" });
    }

    const startedAt = Date.now();
    let output = "";
    let reported = null; // số token nhà cung cấp báo (nếu có)
    let outcome = { status: "ok", errorCode: null };
    try {
      for await (const piece of provider.streamChat({ messages, signal, onUsage: (u) => (reported = u) })) {
        output += piece;
        yield piece;
      }
    } catch (error) {
      outcome = outcomeOf(error, signal);
      throw error;
    } finally {
      // Nhà cung cấp không báo token (bị dừng, lỗi giữa chừng, hoặc không hỗ trợ) thì ước tính.
      // Lỗi trước khi có chữ nào (vd. 429) thì coi như không tốn token đầu vào.
      const failedEarly = outcome.status === "error" && !output;
      await recordAiCall({
        kind: usage.kind ?? AI_CALL_KIND.OTHER,
        userId: usage.userId ?? null,
        provider: (process.env.LLM_PROVIDER ?? "").trim().toLowerCase(),
        model: process.env.LLM_MODEL?.trim() || "",
        inputTokens:
          reported?.prompt_tokens ??
          (failedEarly ? 0 : estimateTokens((messages ?? []).map((m) => m.content).join("\n"))),
        outputTokens: reported?.completion_tokens ?? estimateTokens(output),
        estimated: !reported,
        durationMs: Date.now() - startedAt,
        ...outcome,
      });
    }
  },

  // Trả cả câu trả lời một lần (dùng cho việc không cần streaming)
  async chat({ messages, signal, usage } = {}) {
    let text = "";
    for await (const chunk of llm.streamChat({ messages, signal, usage })) text += chunk;
    return text;
  },
};
