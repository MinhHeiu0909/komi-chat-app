/**
 * Tìm vị trí từ khoá trong chữ, không phân biệt dấu tiếng Việt và hoa/thường,
 * khớp cách backend tìm tin (backend/src/utils/messageSearch.js): gõ "bao gia" ra "Báo giá".
 * Dùng để tô sáng từ khoá trong kết quả tìm kiếm và trong tin vừa nhảy tới.
 */

const VARIANTS: Record<string, string> = {
  a: "aàáảãạăằắẳẵặâầấẩẫậ",
  e: "eèéẻẽẹêềếểễệ",
  i: "iìíỉĩị",
  o: "oòóỏõọôồốổỗộơờớởỡợ",
  u: "uùúủũụưừứửữự",
  y: "yỳýỷỹỵ",
  d: "dđ",
};

const BASE = new Map<string, string>();
for (const [base, letters] of Object.entries(VARIANTS)) {
  for (const ch of letters) BASE.set(ch, base);
}

// Bỏ dấu từng ký tự và giữ nguyên độ dài chuỗi, để vị trí trong chữ đã bỏ dấu
// cũng là vị trí trong chữ gốc.
const foldSameLength = (text: string) => {
  let out = "";
  for (const ch of text) {
    const lower = ch.toLowerCase();
    const folded = BASE.get(lower) ?? lower;
    out += folded.length === ch.length ? folded : ch;
  }
  return out;
};

const escapeRegExp = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** Các đoạn [đầu, cuối) trong `text` khớp `query`. Từ khoá rỗng thì trả mảng rỗng. */
export const findMatches = (text: string, query: string): [number, number][] => {
  const words = foldSameLength(query.normalize("NFC").trim()).split(/\s+/).filter(Boolean);
  if (words.length === 0 || !text) return [];
  const pattern = new RegExp(words.map(escapeRegExp).join("\\s+"), "g");
  const folded = foldSameLength(text.normalize("NFC"));
  // chuỗi gốc chưa ở dạng NFC thì độ dài khác, không ánh xạ vị trí được
  if (folded.length !== text.length) return [];
  const ranges: [number, number][] = [];
  for (const m of folded.matchAll(pattern)) {
    if (m[0].length === 0) continue;
    ranges.push([m.index, m.index + m[0].length]);
  }
  return ranges;
};
