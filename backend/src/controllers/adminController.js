import AiCallLog, { AI_CALL_KIND } from "../models/AiCallLog.js";
import User from "../models/User.js";
import { vnDay } from "../ai/quota.js";

// Các khoảng thời gian trang admin cho chọn (số ngày, tính cả hôm nay, theo giờ Việt Nam)
export const USAGE_RANGES = [1, 7, 30];
const DEFAULT_RANGE = 7;
const DAY_MS = 24 * 60 * 60 * 1000;

const EMBEDDING_KINDS = [AI_CALL_KIND.EMBEDDING_INDEX, AI_CALL_KIND.EMBEDDING_SEARCH];

// Giá USD cho 1 triệu token, đặt bằng biến môi trường. Để trống / sai thì null (không tính chi phí).
const readPrice = (name) => {
  const raw = process.env[name]?.trim();
  if (!raw) return null;
  const n = Number(raw);
  return Number.isFinite(n) && n >= 0 ? n : null;
};

export const readPricing = () => {
  const input = readPrice("AI_PRICE_INPUT_PER_1M");
  const output = readPrice("AI_PRICE_OUTPUT_PER_1M");
  const embedding = readPrice("AI_PRICE_EMBEDDING_PER_1M");
  return { input, output, embedding, configured: input !== null || output !== null || embedding !== null };
};

// Cộng dồn trong một nhóm: tách token chat và token embedding vì giá khác nhau
const SUMS = {
  calls: { $sum: 1 },
  errors: { $sum: { $cond: [{ $eq: ["$status", "error"] }, 1, 0] } },
  rateLimited: { $sum: { $cond: [{ $eq: ["$errorCode", "LLM_RATE_LIMIT"] }, 1, 0] } },
  aborted: { $sum: { $cond: [{ $eq: ["$status", "aborted"] }, 1, 0] } },
  estimatedCalls: { $sum: { $cond: ["$estimated", 1, 0] } },
  chatInputTokens: { $sum: { $cond: [{ $in: ["$kind", EMBEDDING_KINDS] }, 0, "$inputTokens"] } },
  embeddingTokens: { $sum: { $cond: [{ $in: ["$kind", EMBEDDING_KINDS] }, "$inputTokens", 0] } },
  outputTokens: { $sum: "$outputTokens" },
  totalDurationMs: { $sum: "$durationMs" },
};

const EMPTY_ROW = {
  calls: 0,
  errors: 0,
  rateLimited: 0,
  aborted: 0,
  estimatedCalls: 0,
  chatInputTokens: 0,
  embeddingTokens: 0,
  outputTokens: 0,
  totalDurationMs: 0,
};

// Dòng gửi về client: tổng token vào, thời gian trung bình, chi phí ước tính (null nếu chưa đặt giá)
const toRow = (raw, pricing) => {
  const r = { ...EMPTY_ROW, ...raw };
  const costUsd = pricing.configured
    ? ((r.chatInputTokens * (pricing.input ?? 0)) +
        (r.outputTokens * (pricing.output ?? 0)) +
        (r.embeddingTokens * (pricing.embedding ?? 0))) /
      1_000_000
    : null;
  return {
    calls: r.calls,
    errors: r.errors,
    rateLimited: r.rateLimited,
    aborted: r.aborted,
    estimatedCalls: r.estimatedCalls,
    inputTokens: r.chatInputTokens + r.embeddingTokens,
    chatInputTokens: r.chatInputTokens,
    embeddingTokens: r.embeddingTokens,
    outputTokens: r.outputTokens,
    avgDurationMs: r.calls ? Math.round(r.totalDurationMs / r.calls) : 0,
    costUsd,
  };
};

/**
 * GET /api/admin/ai-usage?days=1|7|30
 * Tổng hợp AiCallLog: tổng, theo ngày, theo loại lời gọi, theo người dùng. Chỉ số liệu, không có nội dung.
 */
export const getAiUsage = async (req, res) => {
  try {
    const requested = Number(req.query.days);
    const days = USAGE_RANGES.includes(requested) ? requested : DEFAULT_RANGE;

    // 0h giờ Việt Nam của ngày đầu khoảng (Việt Nam không có giờ mùa hè nên trừ đúng 24h mỗi ngày)
    const today = vnDay();
    const from = new Date(Date.parse(`${today}T00:00:00+07:00`) - (days - 1) * DAY_MS);

    const [facets] = await AiCallLog.aggregate([
      { $match: { createdAt: { $gte: from } } },
      {
        $facet: {
          totals: [{ $group: { _id: null, ...SUMS } }],
          byDay: [
            {
              $group: {
                _id: { $dateToString: { format: "%Y-%m-%d", date: "$createdAt", timezone: "+07:00" } },
                ...SUMS,
              },
            },
          ],
          byKind: [{ $group: { _id: "$kind", ...SUMS } }],
          byUser: [{ $group: { _id: "$userId", ...SUMS } }, { $sort: { calls: -1 } }, { $limit: 50 }],
        },
      },
    ]);

    const pricing = readPricing();

    // đủ mọi ngày trong khoảng (ngày không có lời gọi nào thì toàn số 0), mới nhất trước
    const dayMap = new Map(facets.byDay.map((d) => [d._id, d]));
    const byDay = Array.from({ length: days }, (_, i) => {
      const day = vnDay(new Date(Date.now() - i * DAY_MS));
      return { day, ...toRow(dayMap.get(day), pricing) };
    });

    const byKind = facets.byKind
      .map((k) => ({ kind: k._id, ...toRow(k, pricing) }))
      .sort((a, b) => b.calls - a.calls);

    const userIds = facets.byUser.map((u) => u._id).filter(Boolean);
    const users = await User.find({ _id: { $in: userIds } }, { username: 1, displayName: 1 }).lean();
    const userMap = new Map(users.map((u) => [u._id.toString(), u]));
    const byUser = facets.byUser.map((u) => {
      const user = u._id ? userMap.get(u._id.toString()) : null;
      return {
        userId: u._id ? u._id.toString() : null, // null = hệ thống (worker RAG)
        username: user?.username ?? null,
        displayName: user?.displayName ?? null,
        ...toRow(u, pricing),
      };
    });

    return res.status(200).json({
      days,
      from: from.toISOString(),
      pricing,
      totals: toRow(facets.totals[0], pricing),
      byDay,
      byKind,
      byUser,
    });
  } catch (error) {
    console.error("Lỗi khi tổng hợp chi phí AI", error);
    return res.status(500).json({ message: "Lỗi hệ thống" });
  }
};
