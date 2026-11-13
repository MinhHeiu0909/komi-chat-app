import { test, before, after, describe } from "node:test";
import assert from "node:assert/strict";
import request from "supertest";
import { startDatabase, stopDatabase, auth, createUser } from "./helpers.js";

/**
 * Tìm tin nhắn theo từ khoá trong một cuộc trò chuyện (không phân biệt dấu tiếng Việt).
 */

let app, models, search;
let A, B, C, team, other, busy;

const find = (user, conversationId, params) =>
  request(app).get(`/api/conversations/${conversationId}/search`).query(params).set(auth(user));

const contents = (res) => res.body.messages.map((m) => m.content || m.file?.name);

before(async () => {
  models = await startDatabase();
  ({ default: app } = await import("../src/app.js"));
  search = await import("../src/utils/messageSearch.js");

  [A, B, C] = await Promise.all(["an", "binh", "chi"].map((n) => createUser(models.User, n)));
  const group = (name, members) =>
    models.Conversation.create({
      type: "group",
      participants: members.map((u) => ({ userId: u._id })),
      group: { name },
      lastMessageAt: new Date(),
    });
  [team, other, busy] = await Promise.all([group("Phòng Kinh doanh", [A, B]), group("Nhóm riêng", [B, C]), group("Nhóm đông tin", [A, B])]);

  const at = (minutes) => new Date(Date.UTC(2026, 10, 13, 8, minutes));
  await models.Message.create([
    { conversationId: team._id, senderId: B._id, content: "Báo giá cho khách Hoà Phát gửi trước thứ Sáu", createdAt: at(1) },
    { conversationId: team._id, senderId: A._id, content: "ĐỒ ÁN cuối kỳ nộp ngày 20", createdAt: at(2) },
    { conversationId: team._id, senderId: A._id, content: "Họp lúc 9h. (phòng 3)", createdAt: at(3) },
    {
      conversationId: team._id,
      senderId: B._id,
      file: { fileId: B._id, url: "https://example.com/bb.docx", name: "Biên bản họp.docx", size: 10, kind: "docx" },
      createdAt: at(4),
    },
    { conversationId: other._id, senderId: C._id, content: "Báo giá bí mật của nhóm riêng", createdAt: at(5) },
  ]);
  await models.Message.create(
    Array.from({ length: 35 }, (_, i) => ({
      conversationId: busy._id,
      senderId: A._id,
      content: `Nhắc việc số ${i + 1}`,
      createdAt: at(10 + i),
    })),
  );
});

after(stopDatabase);

describe("bỏ dấu và dựng regex", () => {
  test("foldVietnamese", () => {
    assert.equal(search.foldVietnamese("Đồ Án Komi"), "do an komi");
    assert.equal(search.foldVietnamese("Hoà Phát ƯU TIÊN"), "hoa phat uu tien");
  });

  test("regex khớp mọi dạng dấu, hoa/thường; ký tự đặc biệt được thoát", () => {
    const re = (q) => new RegExp(search.buildSearchPattern(q), "i");
    assert.ok(re("bao gia").test("Báo giá cho khách"));
    assert.ok(re("BÁO GIÁ").test("bao  gia"));
    assert.ok(re("do an").test("ĐỒ ÁN cuối kỳ"));
    assert.ok(re("9h.").test("Họp lúc 9h. (phòng 3)"));
    assert.ok(!re("9h.").test("Họp lúc 9hx"));
    assert.ok(!re("bao gia").test("bảo vệ giá"));
  });
});

describe("tìm tin trong cuộc trò chuyện", () => {
  test("gõ không dấu vẫn ra tin có dấu", async () => {
    const res = await find(A, team._id, { q: "bao gia" }).expect(200);
    assert.deepEqual(contents(res), ["Báo giá cho khách Hoà Phát gửi trước thứ Sáu"]);
  });

  test("chữ hoa có dấu, chữ đ", async () => {
    const res = await find(A, team._id, { q: "do an" }).expect(200);
    assert.deepEqual(contents(res), ["ĐỒ ÁN cuối kỳ nộp ngày 20"]);
  });

  test("tìm cả tên file đính kèm; mới nhất trước", async () => {
    const res = await find(B, team._id, { q: "hop" }).expect(200);
    assert.deepEqual(contents(res), ["Biên bản họp.docx", "Họp lúc 9h. (phòng 3)"]);
    assert.equal(res.body.nextCursor, null);
  });

  test("ký tự đặc biệt không làm lỗi, không khớp bừa", async () => {
    const res = await find(A, team._id, { q: "9h. (phòng" }).expect(200);
    assert.deepEqual(contents(res), ["Họp lúc 9h. (phòng 3)"]);
    assert.deepEqual((await find(A, team._id, { q: ".*" }).expect(200)).body.messages, []);
  });

  test("không lấy tin của cuộc trò chuyện khác", async () => {
    const res = await find(B, team._id, { q: "bi mat" }).expect(200);
    assert.deepEqual(res.body.messages, []);
  });

  test("phân trang: 30 tin mỗi lần, before để xem thêm", async () => {
    const first = await find(A, busy._id, { q: "nhac viec" }).expect(200);
    assert.equal(first.body.messages.length, 30);
    assert.equal(first.body.messages[0].content, "Nhắc việc số 35");
    assert.ok(first.body.nextCursor);

    const second = await find(A, busy._id, { q: "nhac viec", before: first.body.nextCursor }).expect(200);
    assert.deepEqual(contents(second), ["Nhắc việc số 5", "Nhắc việc số 4", "Nhắc việc số 3", "Nhắc việc số 2", "Nhắc việc số 1"]);
    assert.equal(second.body.nextCursor, null);
  });

  test("người ngoài nhận 404; từ khoá quá ngắn / quá dài / before sai → 400", async () => {
    await find(C, team._id, { q: "bao gia" }).expect(404);
    await find(A, team._id, { q: " a " }).expect(400);
    await find(A, team._id, {}).expect(400);
    await find(A, team._id, { q: "x".repeat(101) }).expect(400);
    await find(A, team._id, { q: "bao gia", before: "khong-phai-ngay" }).expect(400);
  });
});

describe("phân trang tin nhắn (GET /messages)", () => {
  test("tải hết các trang không bỏ sót tin nào ở ranh giới trang", async () => {
    // nhóm busy có 35 tin; trang 20 tin → trước đây mất tin thứ 21 (tin dư dùng làm cursor)
    const seen = [];
    let cursor = "";
    for (let page = 0; cursor !== null && page < 10; page += 1) {
      const res = await request(app)
        .get(`/api/conversations/${busy._id}/messages`)
        .query({ limit: 20, cursor })
        .set(auth(A))
        .expect(200);
      seen.push(...res.body.messages.map((m) => m.content));
      cursor = res.body.nextCursor;
    }
    assert.equal(seen.length, 35);
    assert.equal(new Set(seen).size, 35);
  });
});
