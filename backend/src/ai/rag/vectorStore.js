import mongoose from "mongoose";
import KnowledgeChunk, { CHUNK_SCOPE } from "../../models/KnowledgeChunk.js";
import { embeddings } from "../embeddings.js";

/**
 * Tìm đoạn gần nhất theo vector, lọc theo quyền NGAY TRONG truy vấn.
 *   VECTOR_STORE=atlas (mặc định): $vectorSearch của MongoDB Atlas / Atlas Local.
 *   VECTOR_STORE=memory: tính cosine trong JS trên các đoạn khớp bộ lọc. Dùng cho test
 *   (mongodb-memory-server không có $vectorSearch); chậm khi nhiều đoạn, không dùng thật.
 * Hai bản trả cùng thang điểm: (1 + cosine) / 2, giống điểm cosine của Atlas.
 */

export const VECTOR_INDEX_NAME = "knowledge_vector_index";
export const VECTOR_STORES = { ATLAS: "atlas", MEMORY: "memory" };

export const vectorStoreKind = () =>
  (process.env.VECTOR_STORE ?? "").trim().toLowerCase() === VECTOR_STORES.MEMORY
    ? VECTOR_STORES.MEMORY
    : VECTOR_STORES.ATLAS;

const indexDefinition = (numDimensions) => ({
  fields: [
    { type: "vector", path: "embedding", numDimensions, similarity: "cosine" },
    { type: "filter", path: "conversationId" },
    { type: "filter", path: "scope" },
  ],
});

/**
 * Tạo vector index nếu chưa có (gọi lúc server khởi động). Không tự xoá index cũ:
 * số chiều khác cấu hình thì báo "mismatch" để người vận hành xử lý (xoá index và embedding cũ).
 * @returns {Promise<{ status: "memory" | "created" | "exists" | "mismatch", indexDimensions?: number }>}
 */
export const ensureVectorIndex = async () => {
  if (vectorStoreKind() === VECTOR_STORES.MEMORY) return { status: "memory" };
  const dimensions = embeddings.dimensions();

  await KnowledgeChunk.createCollection(); // createSearchIndex cần collection có sẵn
  const collection = KnowledgeChunk.collection;
  const [existing] = await collection.listSearchIndexes(VECTOR_INDEX_NAME).toArray();
  if (!existing) {
    await collection.createSearchIndex({
      name: VECTOR_INDEX_NAME,
      type: "vectorSearch",
      definition: indexDefinition(dimensions),
    });
    return { status: "created" };
  }

  const fields = (existing.latestDefinition ?? existing.definition)?.fields ?? [];
  const indexDimensions = fields.find((f) => f.type === "vector")?.numDimensions;
  return indexDimensions === dimensions ? { status: "exists" } : { status: "mismatch", indexDimensions };
};

const cosine = (a, b) => {
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  return na && nb ? dot / Math.sqrt(na * nb) : 0;
};

/**
 * @param {object} args
 * @param {number[]} args.vector              vector của câu hỏi
 * @param {Array<string|ObjectId>} args.conversationIds  các conversation người hỏi được xem
 * @param {boolean} [args.includeShared]      có tìm cả kho tài liệu chung không
 * @param {number} [args.k]                   số đoạn trả về
 * @returns {Promise<object[]>} các KnowledgeChunk (không kèm embedding) có thêm `score`, điểm cao trước
 */
export const vectorSearch = async ({ vector, conversationIds = [], includeShared = false, k = 5 }) => {
  const ids = conversationIds.map((id) => new mongoose.Types.ObjectId(String(id)));
  const clauses = [];
  if (ids.length > 0) clauses.push({ scope: CHUNK_SCOPE.CONVERSATION, conversationId: { $in: ids } });
  if (includeShared) clauses.push({ scope: CHUNK_SCOPE.SHARED });
  if (clauses.length === 0 || !(k > 0)) return []; // không được xem gì
  const filter = clauses.length === 1 ? clauses[0] : { $or: clauses };

  if (vectorStoreKind() === VECTOR_STORES.MEMORY) {
    const chunks = await KnowledgeChunk.find({ ...filter, embeddedAt: { $ne: null } }).lean();
    return chunks
      .map(({ embedding, ...chunk }) => ({ ...chunk, score: (1 + cosine(vector, embedding)) / 2 }))
      .sort((a, b) => b.score - a.score)
      .slice(0, k);
  }

  return KnowledgeChunk.aggregate([
    {
      $vectorSearch: {
        index: VECTOR_INDEX_NAME,
        path: "embedding",
        queryVector: vector,
        numCandidates: Math.min(10_000, Math.max(100, k * 20)),
        limit: k,
        filter,
      },
    },
    { $set: { score: { $meta: "vectorSearchScore" } } },
    { $unset: "embedding" },
  ]);
};
