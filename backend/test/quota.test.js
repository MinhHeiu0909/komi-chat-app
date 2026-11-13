import { test, before, after, afterEach, describe } from "node:test";
import assert from "node:assert/strict";
import { startDatabase, stopDatabase, createUser } from "./helpers.js";

/**
 * Hạn mức số lượt hỏi Komi AI mỗi user mỗi ngày (ai/quota.js).
 */

let models, AiUsage, quota;
let A, B;

before(async () => {
  models = await startDatabase();
  ({ default: AiUsage } = await import("../src/models/AiUsage.js"));
  await AiUsage.init(); // unique index (userId, day) phải có trước khi test đồng thời
  quota = await import("../src/ai/quota.js");
  [A, B] = await Promise.all(["an", "binh"].map((n) => createUser(models.User, n)));
});

afterEach(async () => {
  delete process.env.AI_DAILY_LIMIT;
  await AiUsage.deleteMany({});
});

after(stopDatabase);

describe("hạn mức hỏi AI", () => {
  test("ngày tính theo giờ Việt Nam (UTC+7)", () => {
    assert.equal(quota.vnDay(new Date("2026-11-12T16:59:59.999Z")), "2026-11-12"); // 23:59:59 giờ VN
    assert.equal(quota.vnDay(new Date("2026-11-12T17:00:00.000Z")), "2026-11-13"); // 0h giờ VN
  });

  test("AI_DAILY_LIMIT: mặc định 20, giá trị sai thì dùng mặc định", () => {
    assert.equal(quota.dailyLimit(), 20);
    process.env.AI_DAILY_LIMIT = "5";
    assert.equal(quota.dailyLimit(), 5);
    for (const bad of ["0", "-3", "abc", "2.5", ""]) {
      process.env.AI_DAILY_LIMIT = bad;
      assert.equal(quota.dailyLimit(), 20, bad);
    }
  });

  test("dùng hết lượt thì bị từ chối; người khác và ngày khác không ảnh hưởng", async () => {
    process.env.AI_DAILY_LIMIT = "2";
    const today = new Date("2026-11-12T03:00:00Z");
    const tomorrow = new Date("2026-11-12T17:30:00Z"); // 0h30 ngày 13 giờ VN

    assert.deepEqual(await quota.takeQuota(A._id, { now: today }), { ok: true, day: "2026-11-12", used: 1, limit: 2 });
    assert.equal((await quota.takeQuota(A._id, { now: today })).used, 2);
    assert.deepEqual(await quota.takeQuota(A._id, { now: today }), { ok: false, day: "2026-11-12", limit: 2 });

    assert.equal((await quota.takeQuota(B._id, { now: today })).ok, true);
    assert.equal((await quota.takeQuota(A._id, { now: tomorrow })).ok, true);

    // lượt bị từ chối không làm tăng bộ đếm
    const usage = await AiUsage.findOne({ userId: A._id, day: "2026-11-12" });
    assert.equal(usage.count, 2);
  });

  test("nhiều request đồng thời không vượt hạn mức", async () => {
    process.env.AI_DAILY_LIMIT = "3";
    const results = await Promise.all(Array.from({ length: 10 }, () => quota.takeQuota(A._id)));
    assert.equal(results.filter((r) => r.ok).length, 3);
    assert.equal((await AiUsage.findOne({ userId: A._id })).count, 3);
  });

  test("hoàn lượt: trả lại một lượt, không xuống dưới 0", async () => {
    process.env.AI_DAILY_LIMIT = "1";
    const first = await quota.takeQuota(A._id);
    assert.equal((await quota.takeQuota(A._id)).ok, false);

    await quota.refundQuota(A._id, first.day);
    assert.equal((await quota.takeQuota(A._id)).ok, true);

    await quota.refundQuota(A._id, first.day);
    await quota.refundQuota(A._id, first.day);
    assert.equal((await AiUsage.findOne({ userId: A._id })).count, 0);
  });
});
