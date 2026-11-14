/**
 * Chia tin nhắn và file thành đoạn để tạo embedding (hàm thuần, không đụng DB).
 * Thông số đã duyệt ngày 2026-11-14, xem docs/DECISIONS.md.
 */

// ---- Tin nhắn: gom nhiều tin liền nhau thành một đoạn ----
export const MAX_MESSAGES_PER_CHUNK = 10;
export const MAX_CHUNK_CHARS = 1_000;
// hai tin cách nhau hơn chừng này thì sang đoạn mới
export const MAX_GAP_MS = 60 * 60 * 1000;
// đoạn chưa đủ tin chỉ đóng khi cuộc trò chuyện im lặng chừng này (tin mới có thể còn tới)
export const IDLE_CLOSE_MS = 10 * 60 * 1000;
// một tin quá dài thì chỉ giữ chừng này ký tự trong đoạn
export const MAX_LINE_CHARS = 2_000;

// ---- File: đoạn ~1.000 ký tự, chồng 150 ký tự, không vắt qua hai trang ----
export const FILE_CHUNK_CHARS = 1_000;
export const FILE_CHUNK_OVERLAP = 150;

const timeFormat = new Intl.DateTimeFormat("vi-VN", {
  timeZone: "Asia/Ho_Chi_Minh",
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
});

// "dd/MM/yyyy HH:mm" giờ Việt Nam (tự ghép, vì định dạng sẵn của vi-VN đặt giờ trước ngày)
const formatTime = (date) => {
  const p = Object.fromEntries(timeFormat.formatToParts(date).map((x) => [x.type, x.value]));
  return `${p.day}/${p.month}/${p.year} ${p.hour}:${p.minute}`;
};

/** "[14/11/2026 09:05] Bình: Họp lúc 9h nhé (gửi file: bao-gia.pdf)" */
export const formatMessageLine = ({ createdAt, senderName, content, fileName }) => {
  const parts = [content?.trim(), fileName ? `(gửi file: ${fileName})` : ""].filter(Boolean);
  if (parts.length === 0) return null;
  let body = parts.join(" ");
  if (body.length > MAX_LINE_CHARS) body = `${body.slice(0, MAX_LINE_CHARS)}…`;
  return `[${formatTime(createdAt)}] ${senderName ?? "Ai đó"}: ${body}`;
};

/**
 * Gom các tin (đã sắp cũ → mới) thành các đoạn đã đóng.
 *
 * @param {{ _id, createdAt: Date, line: string | null }[]} items  line = null: tin bị bỏ qua (tin của bot, chỉ có ảnh...)
 * @param {Date} now
 * @returns {{ windows: typeof items[], consumed: number }}
 *   windows: các đoạn đã đóng (mỗi đoạn là các tin có chữ);
 *   consumed: chỉ số tin cuối cùng đã xử lý xong (-1 nếu chưa tin nào): mọi tin tới đó đã nằm
 *   trong đoạn đã đóng hoặc bị bỏ qua. Các tin sau đó thuộc đoạn còn mở, lần sau đọc lại.
 */
export const buildMessageWindows = (items, now, options = {}) => {
  const {
    maxMessages = MAX_MESSAGES_PER_CHUNK,
    maxChars = MAX_CHUNK_CHARS,
    maxGapMs = MAX_GAP_MS,
    idleCloseMs = IDLE_CLOSE_MS,
  } = options;

  const windows = [];
  let current = [];
  let chars = 0;
  let consumed = -1;

  const close = (lastIndex) => {
    if (current.length > 0) windows.push(current);
    current = [];
    chars = 0;
    consumed = lastIndex;
  };

  items.forEach((item, i) => {
    const last = current.at(-1);
    // cách tin trước của đoạn quá lâu: đóng đoạn cũ (tính cả tin bị bỏ qua nằm giữa)
    if (last && item.createdAt - last.createdAt > maxGapMs) close(i - 1);

    if (!item.line) {
      if (current.length === 0) consumed = i; // bỏ qua, không nằm trong đoạn nào đang mở
      return;
    }

    // thêm tin này thì quá dài: đóng đoạn cũ trước
    if (current.length > 0 && chars + item.line.length > maxChars) close(i - 1);

    current.push(item);
    chars += item.line.length + 1;
    if (current.length >= maxMessages) close(i);
  });

  // đoạn cuối còn mở: chỉ đóng khi cuộc trò chuyện đã im lặng đủ lâu
  if (current.length > 0 && now - current.at(-1).createdAt >= idleCloseMs) close(items.length - 1);

  return { windows, consumed };
};

// thu gọn khoảng trắng (chữ trích từ PDF hay có xuống dòng giữa câu)
const squash = (text) => String(text ?? "").replace(/\s+/g, " ").trim();

/** Chia chữ của một trang thành các đoạn ~size ký tự, chồng overlap ký tự, cắt ở khoảng trắng nếu được. */
export const splitText = (text, size = FILE_CHUNK_CHARS, overlap = FILE_CHUNK_OVERLAP) => {
  const clean = squash(text);
  if (!clean) return [];
  if (clean.length <= size) return [clean];

  const pieces = [];
  let start = 0;
  while (start < clean.length) {
    let end = Math.min(start + size, clean.length);
    if (end < clean.length) {
      // lùi về khoảng trắng gần nhất để không cắt giữa chữ (nếu không lùi quá nửa đoạn)
      const space = clean.lastIndexOf(" ", end);
      if (space > start + size / 2) end = space;
    }
    pieces.push(clean.slice(start, end).trim());
    if (end >= clean.length) break;

    // đoạn sau bắt đầu lùi lại overlap ký tự, ở đầu một chữ
    let next = Math.max(end - overlap, start + 1);
    const space = clean.indexOf(" ", next);
    if (space !== -1 && space < end) next = space + 1;
    start = next;
  }
  return pieces.filter(Boolean);
};

/**
 * Chia file theo trang: [{ page, text }] (page = null với .docx).
 * @param {{ number?: number, text: string }[]} pages  ChatFile.pages
 */
export const chunkFilePages = (pages) =>
  (pages ?? []).flatMap((p) => splitText(p.text).map((text) => ({ page: p.number ?? null, text })));

/** Chữ đưa vào embedding: dòng nguồn + nội dung */
export const embeddingInput = (chunk) => (chunk.header ? `${chunk.header}\n${chunk.text}` : chunk.text);
