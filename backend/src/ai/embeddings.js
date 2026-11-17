import { LLMError, LLM_ERROR } from "./errors.js";
import { createFakeEmbeddingProvider } from "./providers/fakeEmbedding.js";
import { createOpenAICompatibleEmbeddingProvider } from "./providers/openaiCompatibleEmbedding.js";
import { AI_CALL_KIND, estimateTokens, outcomeOf, recordAiCall } from "./usageLog.js";

// Giá trị hợp lệ của EMBEDDING_PROVIDER. Để trống (hoặc giá trị lạ) thì tắt embedding.
export const EMBEDDING_PROVIDERS = {
  FAKE: "fake",
  OPENAI_COMPATIBLE: "openai-compatible",
};

// Số chiều mặc định; phải khớp numDimensions của vector index trong MongoDB
export const DEFAULT_EMBEDDING_DIMENSIONS = 768;
const MAX_DIMENSIONS = 4096; // giới hạn của Atlas Vector Search

// Để trống thì dùng mặc định; giá trị sai thì trả null (tắt embedding, không tự đoán)
const readDimensions = () => {
  const raw = process.env.EMBEDDING_DIMENSIONS?.trim();
  if (!raw) return DEFAULT_EMBEDDING_DIMENSIONS;
  const n = Number(raw);
  return Number.isInteger(n) && n > 0 && n <= MAX_DIMENSIONS ? n : null;
};

// Đọc biến môi trường mỗi lần gọi (rẻ) để test đổi cấu hình được mà không phải nạp lại module
const createProvider = () => {
  const provider = (process.env.EMBEDDING_PROVIDER ?? "").trim().toLowerCase();
  const dimensions = readDimensions();
  if (!dimensions) return null;

  if (provider === EMBEDDING_PROVIDERS.FAKE) return createFakeEmbeddingProvider({ dimensions });

  if (provider === EMBEDDING_PROVIDERS.OPENAI_COMPATIBLE) {
    const model = process.env.EMBEDDING_MODEL?.trim();
    // Không đặt EMBEDDING_BASE_URL thì dùng chung nhà cung cấp và key với chat (LLM_BASE_URL + LLM_API_KEY).
    // Đặt riêng thì chỉ dùng EMBEDDING_API_KEY, để không gửi key của chat tới nhà cung cấp khác.
    const ownBaseUrl = process.env.EMBEDDING_BASE_URL?.trim();
    const baseUrl = ownBaseUrl || process.env.LLM_BASE_URL?.trim();
    const apiKey = (ownBaseUrl ? process.env.EMBEDDING_API_KEY : process.env.LLM_API_KEY)?.trim();
    if (baseUrl && model) {
      return createOpenAICompatibleEmbeddingProvider({ baseUrl, apiKey, model, dimensions });
    }
  }

  return null;
};

/**
 * Điểm duy nhất để tạo embedding trong backend.
 *
 * Lỗi ném ra giống llm.js:
 *  - LLMError (err.code thuộc LLM_ERROR) khi nhà cung cấp lỗi (429 là hết hạn mức: KHÔNG tự gọi lại),
 *    timeout, dữ liệu trả về sai, hoặc embedding đang tắt;
 *  - lỗi abort gốc (err.name === "AbortError") khi signal bị huỷ.
 *
 * Mỗi lần gọi được ghi vào AiCallLog như llm.js (`usage`: { kind, userId }).
 */
export const embeddings = {
  // false khi EMBEDDING_PROVIDER để trống / không hợp lệ / thiếu cấu hình / EMBEDDING_DIMENSIONS sai
  isReady: () => createProvider() !== null,

  // Số chiều vector đang cấu hình (để tạo vector index); null khi EMBEDDING_DIMENSIONS sai
  dimensions: () => readDimensions(),

  /**
   * Trả về mảng vector cùng thứ tự với texts, mỗi vector có `dimensions` số.
   * @param {{ texts: string[], signal?: AbortSignal, usage?: { kind?: string, userId?: unknown } }} args
   */
  async embed({ texts, signal, usage = {} } = {}) {
    const provider = createProvider();
    if (!provider) {
      throw new LLMError(LLM_ERROR.OTHER, { detail: "Embedding đang tắt: chưa cấu hình EMBEDDING_PROVIDER" });
    }
    if (!Array.isArray(texts) || texts.length === 0) return [];

    const inputs = texts.map((t) => String(t ?? ""));
    const startedAt = Date.now();
    let reportedTokens = null; // cộng dồn qua các lô; null nếu nhà cung cấp không báo
    let outcome = { status: "ok", errorCode: null };
    try {
      return await provider.embed({
        texts: inputs,
        signal,
        onUsage: (u) => {
          const n = u?.prompt_tokens ?? u?.total_tokens;
          if (Number.isFinite(n)) reportedTokens = (reportedTokens ?? 0) + n;
        },
      });
    } catch (error) {
      outcome = outcomeOf(error, signal);
      throw error;
    } finally {
      await recordAiCall({
        kind: usage.kind ?? AI_CALL_KIND.OTHER,
        userId: usage.userId ?? null,
        provider: (process.env.EMBEDDING_PROVIDER ?? "").trim().toLowerCase(),
        model: process.env.EMBEDDING_MODEL?.trim() || "",
        inputTokens: reportedTokens ?? (outcome.status === "ok" ? estimateTokens(inputs.join("\n")) : 0),
        outputTokens: 0,
        estimated: reportedTokens === null && outcome.status === "ok",
        durationMs: Date.now() - startedAt,
        ...outcome,
      });
    }
  },
};
