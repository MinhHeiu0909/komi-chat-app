import { test, before, after, beforeEach, describe } from "node:test";
import assert from "node:assert/strict";
import request from "supertest";
import { startDatabase, stopDatabase, auth, createUser } from "./helpers.js";

/**
 * Theo dõi chi phí AI: mỗi lần gọi LLM / embedding ghi một dòng AiCallLog,
 * trang admin tổng hợp lại. Dùng provider giả, không gọi mạng ra ngoài.
 */

const ENV = [
  "LLM_PROVIDER",
  "LLM_BASE_URL",
  "LLM_MODEL",
  "EMBEDDING_PROVIDER",
  "EMBEDDING_BASE_URL",
  "EMBEDDING_MODEL",
  "AI_ADMIN_USERNAMES",
  "AI_PRICE_INPUT_PER_1M",
  "AI_PRICE_OUTPUT_PER_1M",
  "AI_PRICE_EMBEDDING_PER_1M",
];
const savedEnv = Object.fromEntries(ENV.map((k) => [k, process.env[k]]));

let app, models, AiCallLog, llm, embeddings, FAKE_REPLY, AI_CALL_KIND, estimateTokens;
let admin, member;

const collect = async (iterable) => {
  let text = "";
  for await (const chunk of iterable) text += chunk;
  return text;
};

const MESSAGES = [{ role: "user", content: "Tóm tắt giúp mình cuộc họp sáng nay" }];

before(async () => {
  models = await startDatabase();
  ({ default: AiCallLog } = await import("../src/models/AiCallLog.js"));
  ({ default: app } = await import("../src/app.js"));
  ({ llm } = await import("../src/ai/llm.js"));
  ({ embeddings } = await import("../src/ai/embeddings.js"));
  ({ FAKE_REPLY } = await import("../src/ai/providers/fake.js"));
  ({ AI_CALL_KIND, estimateTokens } = await import("../src/ai/usageLog.js"));
  [admin, member] = await Promise.all(["sep.lan", "nhan.vien"].map((n) => createUser(models.User, n)));
});

after(async () => {
  for (const [key, value] of Object.entries(savedEnv)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  await stopDatabase();
});

beforeEach(async () => {
  await AiCallLog.deleteMany({});
  for (const key of ENV) delete process.env[key];
  process.env.LLM_PROVIDER = "fake";
  process.env.EMBEDDING_PROVIDER = "fake";
});

describe("ghi log mỗi lần gọi", () => {
  test("chat xong: lưu loại, người hỏi, số token nhà cung cấp báo; không lưu nội dung", async () => {
    process.env.LLM_MODEL = "model-thu";
    const text = await collect(
      llm.streamChat({ messages: MESSAGES, usage: { kind: AI_CALL_KIND.SUMMARY, userId: member._id } }),
    );
    assert.equal(text, FAKE_REPLY);

    const logs = await AiCallLog.find().lean();
    assert.equal(logs.length, 1);
    const [log] = logs;
    assert.equal(log.kind, AI_CALL_KIND.SUMMARY);
    assert.equal(log.userId.toString(), member._id.toString());
    assert.equal(log.provider, "fake");
    assert.equal(log.model, "model-thu");
    assert.equal(log.status, "ok");
    assert.equal(log.estimated, false); // provider giả báo usage như nhà cung cấp thật
    assert.equal(log.inputTokens, estimateTokens(MESSAGES[0].content));
    assert.equal(log.outputTokens, estimateTokens(FAKE_REPLY));
    assert.ok(log.durationMs >= 0);
    // chỉ có con số, không có chữ của câu hỏi / câu trả lời
    assert.ok(!JSON.stringify(log).includes("cuộc họp"));
    assert.ok(!JSON.stringify(log).includes(FAKE_REPLY));
  });

  test("không truyền usage thì ghi loại other, không có người dùng", async () => {
    await llm.chat({ messages: MESSAGES });
    const [log] = await AiCallLog.find().lean();
    assert.equal(log.kind, AI_CALL_KIND.OTHER);
    assert.equal(log.userId, null);
  });

  test("bị dừng giữa chừng: status aborted, số token ước tính", async () => {
    const controller = new AbortController();
    let received = "";
    await assert.rejects(async () => {
      for await (const chunk of llm.streamChat({ messages: MESSAGES, signal: controller.signal })) {
        received += chunk;
        controller.abort();
      }
    }, { name: "AbortError" });

    const [log] = await AiCallLog.find().lean();
    assert.equal(log.status, "aborted");
    assert.equal(log.errorCode, null);
    assert.equal(log.estimated, true);
    assert.equal(log.outputTokens, estimateTokens(received));
  });

  test("nhà cung cấp lỗi trước khi trả chữ nào: status error, mã lỗi, không tính token", async () => {
    process.env.LLM_PROVIDER = "openai-compatible";
    process.env.LLM_BASE_URL = "http://127.0.0.1:1/v1"; // cổng đóng: không kết nối được
    process.env.LLM_MODEL = "model-thu";
    await assert.rejects(collect(llm.streamChat({ messages: MESSAGES })), { name: "LLMError" });

    const [log] = await AiCallLog.find().lean();
    assert.equal(log.status, "error");
    assert.equal(log.errorCode, "LLM_ERROR");
    assert.equal(log.inputTokens, 0);
    assert.equal(log.outputTokens, 0);
  });

  test("embedding: provider không báo token thì ước tính theo số ký tự", async () => {
    const texts = ["Họp giao ban lúc 9h", "Link staging ở kênh #dev"];
    await embeddings.embed({ texts, usage: { kind: AI_CALL_KIND.EMBEDDING_SEARCH, userId: member._id } });

    const [log] = await AiCallLog.find().lean();
    assert.equal(log.kind, AI_CALL_KIND.EMBEDDING_SEARCH);
    assert.equal(log.status, "ok");
    assert.equal(log.estimated, true);
    assert.equal(log.inputTokens, estimateTokens(texts.join("\n")));
    assert.equal(log.outputTokens, 0);
  });

  test("danh sách rỗng không gọi nhà cung cấp nên không ghi log", async () => {
    await embeddings.embed({ texts: [] });
    assert.equal(await AiCallLog.countDocuments(), 0);
  });
});

describe("GET /api/admin/ai-usage", () => {
  const usage = (user, days) => {
    const req = request(app).get(`/api/admin/ai-usage${days ? `?days=${days}` : ""}`);
    return user ? req.set(auth(user)) : req;
  };

  const seed = (docs) => AiCallLog.insertMany(docs.map((d) => ({ status: "ok", ...d })));

  test("chưa đăng nhập 401; không có tên trong AI_ADMIN_USERNAMES thì 404 như route không tồn tại", async () => {
    await usage(null).expect(401);
    await usage(member).expect(404); // biến để trống: không ai xem được
    process.env.AI_ADMIN_USERNAMES = "sep.lan";
    const res = await usage(member).expect(404);
    const missing = await request(app).get("/api/admin/khong-co").set(auth(member)).expect(404);
    assert.equal(res.text, missing.text.replace("/api/admin/khong-co", "/api/admin/ai-usage"));
  });

  test("/api/users/me báo isAiAdmin; không phân biệt hoa thường, bỏ khoảng trắng", async () => {
    process.env.AI_ADMIN_USERNAMES = " khac , SEP.LAN ";
    const me = await request(app).get("/api/users/me").set(auth(admin)).expect(200);
    assert.equal(me.body.isAiAdmin, true);
    const other = await request(app).get("/api/users/me").set(auth(member)).expect(200);
    assert.equal(other.body.isAiAdmin, false);
  });

  test("admin xem tổng, theo loại, theo người (có dòng hệ thống), chi phí theo giá đã đặt", async () => {
    process.env.AI_ADMIN_USERNAMES = "sep.lan";
    process.env.AI_PRICE_INPUT_PER_1M = "0.1";
    process.env.AI_PRICE_OUTPUT_PER_1M = "0.4";
    process.env.AI_PRICE_EMBEDDING_PER_1M = "0.15";
    await seed([
      { kind: "chat", userId: member._id, inputTokens: 1000, outputTokens: 200, durationMs: 1000 },
      { kind: "chat", userId: member._id, status: "error", errorCode: "LLM_RATE_LIMIT", durationMs: 100 },
      { kind: "summary", userId: admin._id, inputTokens: 3000, outputTokens: 500, durationMs: 2000 },
      { kind: "embedding_index", inputTokens: 10_000, estimated: true, durationMs: 300 },
      // quá 30 ngày: không tính
      { kind: "chat", userId: member._id, inputTokens: 9999, createdAt: new Date(Date.now() - 40 * 864e5) },
    ]);

    const { body } = await usage(admin, 30).expect(200);
    assert.equal(body.days, 30);
    assert.equal(body.byDay.length, 30);
    assert.equal(body.totals.calls, 4);
    assert.equal(body.totals.errors, 1);
    assert.equal(body.totals.rateLimited, 1);
    assert.equal(body.totals.estimatedCalls, 1);
    assert.equal(body.totals.chatInputTokens, 4000);
    assert.equal(body.totals.embeddingTokens, 10_000);
    assert.equal(body.totals.inputTokens, 14_000);
    assert.equal(body.totals.outputTokens, 700);
    assert.equal(body.totals.avgDurationMs, 850);
    // 4000×0.1 + 700×0.4 + 10000×0.15 = 2180 (trên 1 triệu token)
    assert.ok(Math.abs(body.totals.costUsd - 0.00218) < 1e-12);
    assert.equal(body.byDay[0].calls, 4); // hôm nay, mới nhất trước

    const kinds = Object.fromEntries(body.byKind.map((k) => [k.kind, k.calls]));
    assert.deepEqual(kinds, { chat: 2, summary: 1, embedding_index: 1 });

    const byUser = Object.fromEntries(body.byUser.map((u) => [u.username ?? "hệ thống", u]));
    assert.equal(byUser["nhan.vien"].calls, 2);
    assert.equal(byUser["sep.lan"].outputTokens, 500);
    assert.equal(byUser["hệ thống"].userId, null);
    assert.equal(byUser["hệ thống"].embeddingTokens, 10_000);
  });

  test("chưa đặt giá thì costUsd null; days lạ thì dùng 7 ngày", async () => {
    process.env.AI_ADMIN_USERNAMES = "sep.lan";
    await seed([{ kind: "chat", userId: member._id, inputTokens: 10 }]);
    const { body } = await usage(admin, 999).expect(200);
    assert.equal(body.days, 7);
    assert.equal(body.byDay.length, 7);
    assert.equal(body.pricing.configured, false);
    assert.equal(body.totals.costUsd, null);
  });

  test("days=1 chỉ tính từ 0h hôm nay giờ Việt Nam", async () => {
    process.env.AI_ADMIN_USERNAMES = "sep.lan";
    const todayVN = new Date(Date.now() + 7 * 3600e3).toISOString().slice(0, 10);
    const startOfTodayVN = Date.parse(`${todayVN}T00:00:00+07:00`);
    await seed([
      { kind: "chat", createdAt: new Date(startOfTodayVN + 1000) },
      { kind: "chat", createdAt: new Date(startOfTodayVN - 1000) }, // 23:59:59 hôm qua
    ]);
    const { body } = await usage(admin, 1).expect(200);
    assert.equal(body.totals.calls, 1);
    assert.equal(body.byDay.length, 1);
    assert.equal(body.byDay[0].day, todayVN);
  });
});
