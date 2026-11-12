/**
 * Lỗi khi gọi LLM, gom về 3 loại để tầng trên xử lý (báo người dùng, ghi log):
 *  - RATE_LIMIT: hết hạn mức của nhà cung cấp (HTTP 429). Báo người dùng thử lại sau, KHÔNG tự gọi lại.
 *  - AUTH: sai hoặc thiếu API key (HTTP 401/403). Lỗi cấu hình phía server.
 *  - OTHER: mọi lỗi còn lại (mạng, timeout, 5xx, dữ liệu trả về hỏng...).
 *
 * Người hỏi tự bấm dừng (AbortSignal) KHÔNG phải LLMError: khi đó ném lại
 * lỗi abort gốc (err.name === "AbortError") để phân biệt với lỗi thật.
 */
export const LLM_ERROR = {
  RATE_LIMIT: "LLM_RATE_LIMIT",
  AUTH: "LLM_AUTH",
  OTHER: "LLM_ERROR",
};

const USER_MESSAGES = {
  [LLM_ERROR.RATE_LIMIT]: "Komi AI đang quá tải, bạn thử lại sau ít phút nhé.",
  [LLM_ERROR.AUTH]: "Komi AI chưa được cấu hình đúng.",
  [LLM_ERROR.OTHER]: "Komi AI đang gặp sự cố, bạn thử lại sau nhé.",
};

export class LLMError extends Error {
  /**
   * @param {string} code   một giá trị trong LLM_ERROR
   * @param {object} [info]
   * @param {number} [info.status]  mã HTTP từ nhà cung cấp (nếu có)
   * @param {string} [info.detail]  chi tiết để ghi log (đã cắt ngắn, không chứa API key)
   * @param {unknown} [info.cause]
   */
  constructor(code, { status, detail, cause } = {}) {
    super(USER_MESSAGES[code] ?? USER_MESSAGES[LLM_ERROR.OTHER], { cause });
    this.name = "LLMError";
    this.code = code;
    this.status = status;
    this.detail = detail;
  }
}
