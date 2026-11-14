import { LLMError, LLM_ERROR } from "../errors.js";
import { errorFromResponse, truncate } from "./httpErrors.js";

// Một request embedding không trả lời trong khoảng này thì coi là treo
export const DEFAULT_EMBEDDING_TIMEOUT_MS = 30_000;

// Gemini nhận tối đa 100 đoạn trong một request (quá thì 400)
export const MAX_BATCH_SIZE = 100;

/**
 * Gọi API embeddings chuẩn OpenAI (POST {baseUrl}/embeddings) bằng fetch có sẵn của Node.
 * Nhiều đoạn thì chia thành từng lô tối đa MAX_BATCH_SIZE, gửi lần lượt.
 * Không tự gọi lại khi lỗi (kể cả 429).
 */
export const createOpenAICompatibleEmbeddingProvider = ({
  baseUrl,
  apiKey,
  model,
  dimensions,
  timeoutMs = DEFAULT_EMBEDDING_TIMEOUT_MS,
}) => {
  const url = `${baseUrl.replace(/\/+$/, "")}/embeddings`;

  const embedBatch = async (texts, signal) => {
    const timeout = AbortSignal.timeout(timeoutMs);
    const fetchSignal = signal ? AbortSignal.any([signal, timeout]) : timeout;

    try {
      signal?.throwIfAborted();
      const res = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {}),
        },
        body: JSON.stringify({ model, input: texts, dimensions }),
        signal: fetchSignal,
      });
      if (!res.ok) throw await errorFromResponse(res);

      const body = await res.text();
      let json;
      try {
        json = JSON.parse(body);
      } catch (cause) {
        throw new LLMError(LLM_ERROR.OTHER, { detail: `Phản hồi embedding hỏng: ${truncate(body)}`, cause });
      }

      const data = Array.isArray(json?.data) ? json.data : [];
      // Gemini bỏ trường index khi index = 0, nên thiếu index thì lấy theo thứ tự trả về
      const vectors = data
        .map((item, i) => ({ index: item?.index ?? i, embedding: item?.embedding }))
        .sort((a, b) => a.index - b.index)
        .map((item) => item.embedding);

      const valid =
        vectors.length === texts.length &&
        vectors.every((v) => Array.isArray(v) && v.length === dimensions && v.every(Number.isFinite));
      if (!valid) {
        throw new LLMError(LLM_ERROR.OTHER, {
          detail: `Embedding trả về sai: cần ${texts.length} vector ${dimensions} chiều, nhận ${truncate(body, 200)}`,
        });
      }
      return vectors;
    } catch (err) {
      // bên gọi tự huỷ: ném lại lỗi abort gốc
      if (signal?.aborted) signal.throwIfAborted();
      if (timeout.aborted) {
        throw new LLMError(LLM_ERROR.OTHER, { detail: `Quá ${timeoutMs}ms không nhận được embedding` });
      }
      if (err instanceof LLMError) throw err;
      throw new LLMError(LLM_ERROR.OTHER, { detail: truncate(String(err?.message ?? err)), cause: err });
    }
  };

  return {
    dimensions,
    async embed({ texts, signal }) {
      const vectors = [];
      for (let i = 0; i < texts.length; i += MAX_BATCH_SIZE) {
        vectors.push(...(await embedBatch(texts.slice(i, i + MAX_BATCH_SIZE), signal)));
      }
      return vectors;
    },
  };
};
