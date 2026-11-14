import AiUsage from "../models/AiUsage.js";

/**
 * Hạn mức số lượt hỏi Komi AI mỗi user mỗi ngày, để một người không dùng hết
 * hạn mức free của cả app. Đổi bằng biến môi trường AI_DAILY_LIMIT.
 */
export const DEFAULT_DAILY_LIMIT = 20;

const DUPLICATE_KEY = 11000;
const VN_OFFSET_MS = 7 * 60 * 60 * 1000; // Việt Nam UTC+7, không có giờ mùa hè

export const dailyLimit = () => {
  const value = Number(process.env.AI_DAILY_LIMIT);
  return Number.isInteger(value) && value > 0 ? value : DEFAULT_DAILY_LIMIT;
};

// Ngày "YYYY-MM-DD" theo giờ Việt Nam: lượt hỏi được tính lại lúc 0h giờ VN
export const vnDay = (now = new Date()) => new Date(now.getTime() + VN_OFFSET_MS).toISOString().slice(0, 10);

export const quotaExceededText = (limit) =>
  `Bạn đã dùng hết ${limit} lượt hỏi Komi AI hôm nay. Lượt hỏi được tính lại lúc 0h (giờ Việt Nam).`;

/**
 * Lấy một lượt trong bộ đếm theo ngày `Model` (AiUsage, DocumentUploadUsage...).
 * Nguyên tử: chỉ tăng khi count < limit; hai request đồng thời không vượt được hạn mức.
 * Bản ghi đã đủ lượt thì điều kiện không khớp → upsert cố tạo bản ghi mới →
 * vướng unique index (userId, day) → nghĩa là đã hết lượt.
 *
 * @returns {Promise<{ ok: boolean, day: string, used?: number, limit: number }>}
 */
export const takeDailyCount = async (Model, userId, limit, { now = new Date() } = {}) => {
  const day = vnDay(now);
  try {
    const usage = await Model.findOneAndUpdate(
      { userId, day, count: { $lt: limit } },
      { $inc: { count: 1 }, $setOnInsert: { createdAt: now } },
      { upsert: true, returnDocument: "after" },
    ).lean();
    return { ok: true, day, used: usage.count, limit };
  } catch (error) {
    if (error?.code !== DUPLICATE_KEY) throw error;
    return { ok: false, day, limit };
  }
};

export const refundDailyCount = (Model, userId, day) =>
  Model.updateOne({ userId, day, count: { $gt: 0 } }, { $inc: { count: -1 } });

/** Lấy một lượt hỏi Komi AI (AI_DAILY_LIMIT lượt/ngày). */
export const takeQuota = (userId, { now = new Date() } = {}) => takeDailyCount(AiUsage, userId, dailyLimit(), { now });

// Trả lại lượt khi lỗi không phải do người hỏi (nhà cung cấp lỗi, hết hạn mức chung...)
export const refundQuota = (userId, day) => refundDailyCount(AiUsage, userId, day);
