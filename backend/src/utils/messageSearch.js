/**
 * Tìm tin nhắn theo từ khoá, không phân biệt dấu tiếng Việt và hoa/thường:
 * gõ "bao gia" ra "Báo giá", gõ "do an" ra "Đồ án".
 * Không đổi schema: dựng một regex mà mỗi chữ cái gốc khớp mọi biến thể dấu của nó,
 * nên tin cũ vẫn tìm được. Chỉ quét tin của MỘT cuộc trò chuyện (có index conversationId).
 */

export const MIN_QUERY_LENGTH = 2;
export const MAX_QUERY_LENGTH = 100;

const VARIANTS = {
  a: "aàáảãạăằắẳẵặâầấẩẫậ",
  e: "eèéẻẽẹêềếểễệ",
  i: "iìíỉĩị",
  o: "oòóỏõọôồốổỗộơờớởỡợ",
  u: "uùúủũụưừứửữự",
  y: "yỳýỷỹỵ",
  d: "dđ",
};

// chữ có dấu (thường) → chữ gốc
const BASE = new Map();
for (const [base, letters] of Object.entries(VARIANTS)) {
  for (const ch of letters) BASE.set(ch, base);
}

/** Bỏ dấu tiếng Việt, đưa về chữ thường: "Đồ Án" → "do an". */
export const foldVietnamese = (text) =>
  [...text.normalize("NFC").toLowerCase()].map((ch) => BASE.get(ch) ?? ch).join("");

const escapeRegExp = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/**
 * Regex (chuỗi nguồn) khớp từ khoá ở mọi dạng dấu và hoa/thường.
 * Chữ cái có biến thể → lớp ký tự gồm cả chữ thường lẫn chữ hoa (không dựa vào cờ "i"
 * của MongoDB với chữ ngoài ASCII); khoảng trắng → \s+.
 */
export const buildSearchPattern = (query) =>
  foldVietnamese(query.trim())
    .split(/\s+/)
    .filter(Boolean)
    .map((word) =>
      [...word]
        .map((ch) => {
          const letters = VARIANTS[ch];
          return letters ? `[${letters}${letters.toUpperCase()}]` : escapeRegExp(ch);
        })
        .join(""),
    )
    .join("\\s+");
