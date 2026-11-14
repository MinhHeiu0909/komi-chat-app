import { LLMError, LLM_ERROR } from "../errors.js";

// Dùng chung cho các provider gọi API chuẩn OpenAI (chat và embedding)

// Chỉ giữ một đoạn ngắn của phản hồi lỗi để ghi log
export const truncate = (text, max = 500) => (text.length > max ? `${text.slice(0, max)}…` : text);

export const codeFromStatus = (status, text = "") => {
  if (status === 429) return LLM_ERROR.RATE_LIMIT;
  if (status === 401 || status === 403) return LLM_ERROR.AUTH;
  // Gemini trả 400 kèm "API key not valid" thay vì 401 khi sai key
  if (status === 400 && /api[_ ]?key/i.test(text)) return LLM_ERROR.AUTH;
  return LLM_ERROR.OTHER;
};

export const errorFromResponse = async (res) => {
  const text = await res.text().catch(() => "");
  return new LLMError(codeFromStatus(res.status, text), { status: res.status, detail: truncate(text) });
};
