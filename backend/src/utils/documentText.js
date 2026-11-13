/**
 * Trích chữ từ file tài liệu gửi trong chat, chạy ngay lúc tải lên.
 *  - PDF: theo từng trang (pdfjs-dist) để Komi AI trích dẫn được số trang.
 *  - Word .docx: cả file một khối (mammoth); Word không có số trang cố định.
 * Không đọc được chữ (PDF scan chỉ có ảnh, file hỏng, có mật khẩu) thì không ném lỗi:
 * trả status để tải file vẫn thành công và bot báo rõ cho người hỏi.
 */

// Lưu tối đa chừng này ký tự mỗi file (Giai đoạn 3 chỉ đưa ~50.000 ký tự vào prompt;
// giữ dư cho Giai đoạn 4) để document MongoDB không quá lớn
export const MAX_STORED_CHARS = 1_000_000;

// Trung bình ít hơn chừng này ký tự (không tính khoảng trắng) mỗi trang thì coi là PDF scan
const MIN_CHARS_PER_PAGE = 5;

export const TEXT_STATUS = {
  OK: "ok", // có chữ
  EMPTY: "empty", // không có chữ (PDF scan / file trắng)
  FAILED: "failed", // không đọc được (hỏng, có mật khẩu...)
};

// gộp khoảng trắng thừa, giữ xuống dòng
const tidy = (text) =>
  text
    .replace(/\r\n?/g, "\n")
    .replace(/[ \t ]+/g, " ")
    .replace(/ *\n */g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

const countChars = (text) => text.replace(/\s/g, "").length;

const extractPdfPages = async (buffer) => {
  // nạp khi cần: pdfjs khá nặng, không làm chậm lúc khởi động server
  const { getDocument } = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const task = getDocument({
    data: new Uint8Array(buffer), // pdfjs không nhận Buffer; bản sao để pdfjs tự do chuyển giao
    isEvalSupported: false,
    disableFontFace: true,
    useSystemFonts: false,
    verbosity: 0,
  });
  const pdf = await task.promise;
  try {
    const pages = [];
    for (let number = 1; number <= pdf.numPages; number += 1) {
      const page = await pdf.getPage(number);
      const content = await page.getTextContent();
      const text = content.items.map((item) => (item.str ?? "") + (item.hasEOL ? "\n" : "")).join("");
      pages.push({ number, text: tidy(text) });
      page.cleanup();
    }
    return pages;
  } finally {
    await task.destroy();
  }
};

const extractDocxPages = async (buffer) => {
  const { default: mammoth } = await import("mammoth");
  const { value } = await mammoth.extractRawText({ buffer });
  return [{ text: tidy(value) }];
};

// cắt bớt khi vượt MAX_STORED_CHARS (giữ các trang đầu)
const capPages = (pages) => {
  let total = 0;
  const kept = [];
  for (const page of pages) {
    const room = MAX_STORED_CHARS - total;
    if (room <= 0) return { pages: kept, truncated: true };
    const text = page.text.length > room ? page.text.slice(0, room) : page.text;
    kept.push({ ...page, text });
    total += text.length;
    if (text.length < page.text.length) return { pages: kept, truncated: true };
  }
  return { pages: kept, truncated: false };
};

/**
 * @param {Buffer} buffer
 * @param {"pdf"|"docx"} kind
 * @returns {Promise<{ status: string, pages: { number?: number, text: string }[], charCount: number, truncated: boolean }>}
 */
export const extractDocumentText = async (buffer, kind) => {
  let pages;
  try {
    pages = kind === "pdf" ? await extractPdfPages(buffer) : await extractDocxPages(buffer);
  } catch (error) {
    console.warn(`Không trích được chữ từ file ${kind}:`, error?.name ?? "", error?.message ?? error);
    return { status: TEXT_STATUS.FAILED, pages: [], charCount: 0, truncated: false };
  }

  const capped = capPages(pages);
  const charCount = capped.pages.reduce((sum, p) => sum + p.text.length, 0);
  const visible = capped.pages.reduce((sum, p) => sum + countChars(p.text), 0);
  const isEmpty = visible === 0 || visible < MIN_CHARS_PER_PAGE * Math.max(pages.length, 1);

  return {
    status: isEmpty ? TEXT_STATUS.EMPTY : TEXT_STATUS.OK,
    pages: isEmpty ? [] : capped.pages,
    charCount: isEmpty ? 0 : charCount,
    truncated: !isEmpty && capped.truncated,
  };
};
