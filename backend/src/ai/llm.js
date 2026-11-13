import { LLMError, LLM_ERROR } from "./errors.js";
import { createFakeProvider } from "./providers/fake.js";
import { createOpenAICompatibleProvider } from "./providers/openaiCompatible.js";

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
 */
export const llm = {
  // false khi LLM_PROVIDER để trống / không hợp lệ / thiếu LLM_BASE_URL hoặc LLM_MODEL
  isReady: () => createProvider() !== null,

  // Trả về từng đoạn chữ: for await (const chunk of llm.streamChat({ messages, signal })) ...
  async *streamChat({ messages, signal } = {}) {
    const provider = createProvider();
    if (!provider) {
      throw new LLMError(LLM_ERROR.OTHER, { detail: "AI đang tắt: chưa cấu hình LLM_PROVIDER" });
    }
    yield* provider.streamChat({ messages, signal });
  },

  // Trả cả câu trả lời một lần (dùng cho việc không cần streaming, vd. tóm tắt)
  async chat({ messages, signal } = {}) {
    let text = "";
    for await (const chunk of llm.streamChat({ messages, signal })) text += chunk;
    return text;
  },
};
