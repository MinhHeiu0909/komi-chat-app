/**
 * Embedding giả cho test và CI: không gọi mạng, không cần key.
 * Mỗi từ (đã bỏ dấu, chữ thường) được băm vào một chiều của vector, rồi chuẩn hoá về độ dài 1.
 * Nhờ vậy hai đoạn chung nhiều từ thì gần nhau: test tìm kiếm có kết quả đoán trước được.
 * Không hiểu nghĩa: "họp" và "cuộc gặp" là hai từ khác nhau.
 */

// Bỏ dấu tiếng Việt để "Họp" và "hop" là một từ
export const fakeTokens = (text) =>
  String(text ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .replace(/đ/g, "d")
    .split(/[^\p{L}\p{N}]+/u)
    .filter(Boolean);

// FNV-1a 32 bit: cùng chữ thì luôn ra cùng số
const hash = (word) => {
  let h = 0x811c9dc5;
  for (let i = 0; i < word.length; i++) {
    h ^= word.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
};

export const fakeEmbed = (text, dimensions) => {
  const vector = new Array(dimensions).fill(0);
  const tokens = fakeTokens(text);
  if (tokens.length === 0) vector[0] = 1; // đoạn rỗng: vẫn trả vector hợp lệ (không chia cho 0)
  for (const token of tokens) vector[hash(token) % dimensions] += 1;
  const norm = Math.hypot(...vector);
  return vector.map((x) => x / norm);
};

export const createFakeEmbeddingProvider = ({ dimensions }) => ({
  dimensions,
  async embed({ texts, signal }) {
    signal?.throwIfAborted();
    return texts.map((text) => fakeEmbed(text, dimensions));
  },
});
