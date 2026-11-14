import { LLMError, LLM_ERROR } from "../errors.js";
import { codeFromStatus, errorFromResponse, truncate } from "./httpErrors.js";

// Không nhận được byte nào trong khoảng này (kể cả giữa hai đoạn streaming) thì coi là treo
export const DEFAULT_TIMEOUT_MS = 30_000;

const DONE = Symbol("done");

/**
 * Đọc một dòng của luồng SSE kiểu OpenAI:
 *   data: {"choices":[{"delta":{"content":"Xin"}}]}
 *   data: [DONE]
 * Trả về đoạn chữ, DONE, hoặc null (dòng trống, comment ": ping", delta không có chữ).
 */
const parseSseLine = (line) => {
  if (!line.startsWith("data:")) return null;
  const data = line.slice(5).trim();
  if (!data) return null;
  if (data === "[DONE]") return DONE;

  let json;
  try {
    json = JSON.parse(data);
  } catch (cause) {
    throw new LLMError(LLM_ERROR.OTHER, { detail: `Dữ liệu streaming hỏng: ${truncate(data)}`, cause });
  }

  // Một số nhà cung cấp báo lỗi giữa luồng (vd. hết hạn mức khi đang trả lời)
  if (json.error) {
    const status = Number(json.error.code ?? json.error.status) || undefined;
    throw new LLMError(codeFromStatus(status, JSON.stringify(json.error)), {
      status,
      detail: truncate(JSON.stringify(json.error)),
    });
  }

  return json.choices?.[0]?.delta?.content || null;
};

/**
 * Gọi API chat completions chuẩn OpenAI (Gemini, Groq, OpenAI...) bằng fetch có sẵn của Node.
 * Không tự gọi lại khi lỗi.
 */
export const createOpenAICompatibleProvider = ({ baseUrl, apiKey, model, timeoutMs = DEFAULT_TIMEOUT_MS }) => {
  const url = `${baseUrl.replace(/\/+$/, "")}/chat/completions`;

  return {
    async *streamChat({ messages, signal } = {}) {
      // internal: dùng cho timeout và để huỷ request khi bên gọi ngừng đọc giữa chừng
      const internal = new AbortController();
      const fetchSignal = signal ? AbortSignal.any([signal, internal.signal]) : internal.signal;
      let timedOut = false;
      let timer;
      const armTimer = () => {
        clearTimeout(timer);
        timer = setTimeout(() => {
          timedOut = true;
          internal.abort();
        }, timeoutMs);
      };

      try {
        signal?.throwIfAborted();
        armTimer();

        const res = await fetch(url, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Accept: "text/event-stream",
            ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {}),
          },
          body: JSON.stringify({ model, messages, stream: true }),
          signal: fetchSignal,
        });

        if (!res.ok) throw await errorFromResponse(res);
        if (!res.body) throw new LLMError(LLM_ERROR.OTHER, { detail: "Phản hồi không có nội dung" });

        const decoder = new TextDecoder();
        let buffer = "";
        for await (const bytes of res.body) {
          armTimer();
          // một sự kiện SSE có thể bị cắt ngang giữa hai gói TCP: giữ phần dở dang lại
          buffer += decoder.decode(bytes, { stream: true });
          const lines = buffer.split(/\r?\n/);
          buffer = lines.pop();
          for (const line of lines) {
            const piece = parseSseLine(line);
            if (piece === DONE) return;
            if (piece) yield piece;
          }
        }

        // luồng đóng mà không có [DONE]: xử lý nốt phần còn lại
        const piece = parseSseLine(buffer + decoder.decode());
        if (piece && piece !== DONE) yield piece;
      } catch (err) {
        // người hỏi tự dừng: ném lại lỗi abort gốc, không coi là lỗi của LLM
        if (signal?.aborted) signal.throwIfAborted();
        if (timedOut) {
          throw new LLMError(LLM_ERROR.OTHER, { detail: `Quá ${timeoutMs}ms không nhận được dữ liệu` });
        }
        if (err instanceof LLMError) throw err;
        throw new LLMError(LLM_ERROR.OTHER, { detail: truncate(String(err?.message ?? err)), cause: err });
      } finally {
        clearTimeout(timer);
        internal.abort(); // giải phóng kết nối nếu bên gọi dừng đọc sớm
      }
    },
  };
};
