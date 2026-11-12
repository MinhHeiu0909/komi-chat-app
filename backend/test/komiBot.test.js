import { test, before, after, afterEach, describe } from "node:test";
import assert from "node:assert/strict";
import request from "supertest";
import { io as connectClient } from "socket.io-client";
import { startDatabase, stopDatabase, auth, tokenFor, createUser } from "./helpers.js";

/**
 * User hệ thống Komi AI: chat riêng với bot, @komi trong nhóm, bot chỉ đọc
 * conversation nơi nó được gọi. Dùng provider giả (LLM_PROVIDER=fake), không gọi mạng.
 */

let app, server, io, models;
let llm, LLMError, LLM_ERROR, FAKE_REPLY, KOMI_USERNAME, KOMI_MENTION, AI_OFF_TEXT, getKomiBot;
let A, B, C, bot, group, baseUrl;
let originalChat;

// chờ tới khi fn() trả giá trị truthy (bot trả lời ở nền, không chờ trong request)
const waitFor = async (fn, timeoutMs = 3000) => {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const value = await fn();
    if (value) return value;
    if (Date.now() > deadline) throw new Error("Hết thời gian chờ");
    await new Promise((r) => setTimeout(r, 20));
  }
};

const botMessages = (conversationId) =>
  models.Message.find({ conversationId, senderId: bot._id }).sort({ createdAt: 1 }).lean();

// thay llm.chat để xem prompt gửi đi / giả lỗi
const spyChat = (impl) => {
  const calls = [];
  llm.chat = async (args) => {
    calls.push(args);
    return impl ? impl(args) : "Trả lời giả";
  };
  return calls;
};

const myKomiConversation = async (user) => {
  const res = await request(app).get("/api/conversations").set(auth(user)).expect(200);
  return res.body.conversations.find(
    (c) => c.type === "direct" && c.participants.some((p) => p._id === bot._id.toString()),
  );
};

before(async () => {
  process.env.LLM_PROVIDER = "fake";
  models = await startDatabase();
  ({ default: app } = await import("../src/app.js"));
  ({ server, io } = await import("../src/socket/index.js"));
  ({ llm, LLMError, LLM_ERROR } = await import("../src/ai/llm.js"));
  ({ FAKE_REPLY } = await import("../src/ai/providers/fake.js"));
  ({ KOMI_USERNAME, KOMI_MENTION, AI_OFF_TEXT, getKomiBot } = await import("../src/ai/komiBot.js"));
  originalChat = llm.chat;

  [A, B, C] = await Promise.all(["an", "binh", "chi"].map((n) => createUser(models.User, n)));
  bot = await getKomiBot();

  group = await models.Conversation.create({
    type: "group",
    participants: [{ userId: A._id }, { userId: B._id }],
    group: { name: "Phòng Kế hoạch", createdBy: A._id },
    lastMessageAt: new Date(),
  });

  await new Promise((resolve) => server.listen(0, resolve));
  baseUrl = `http://localhost:${server.address().port}`;
});

afterEach(() => {
  llm.chat = originalChat;
  process.env.LLM_PROVIDER = "fake";
});

after(async () => {
  delete process.env.LLM_PROVIDER;
  await new Promise((resolve) => io.close(() => resolve()));
  await stopDatabase();
});

describe("user Komi AI", () => {
  test("là user hệ thống, chỉ có một", async () => {
    assert.ok(bot?.isBot);
    const again = await getKomiBot();
    assert.equal(again._id.toString(), bot._id.toString());
    assert.equal(await models.User.countDocuments({ username: KOMI_USERNAME }), 1);
  });

  test("không đăng nhập được, không tìm được, không kết bạn được", async () => {
    await request(app).post("/api/auth/signin").send({ username: KOMI_USERNAME, password: "bat-ky" }).expect(401);

    const search = await request(app).get("/api/users/search").query({ username: KOMI_USERNAME }).set(auth(A));
    assert.equal(search.body.user, null);

    await request(app).post("/api/friends/requests").set(auth(A)).send({ to: bot._id.toString() }).expect(404);
  });

  test("nhận diện @komi", () => {
    for (const text of ["@komi tóm tắt giúp", "nhờ @komi xem", "@Komi?", "hỏi @komi.ai"]) {
      assert.ok(KOMI_MENTION.test(text), text);
    }
    for (const text of ["gửi email@komi.vn", "@komiabc", "komi ơi"]) {
      assert.ok(!KOMI_MENTION.test(text), text);
    }
  });
});

describe("chat riêng với Komi AI", () => {
  test("AI tắt thì không tự tạo cuộc chat với bot", async () => {
    delete process.env.LLM_PROVIDER;
    assert.equal(await myKomiConversation(C), undefined);
  });

  test("danh sách chat tự có cuộc chat với bot, gọi lại không tạo trùng", async () => {
    const first = await myKomiConversation(A);
    assert.ok(first);
    const second = await myKomiConversation(A);
    assert.equal(second._id, first._id);
    assert.equal(
      await models.Conversation.countDocuments({ type: "direct", "participants.userId": { $all: [A._id, bot._id] } }),
      1,
    );
    assert.ok(first.participants.some((p) => p.displayName === "Komi AI"));
  });

  test("nhắn cho bot không cần kết bạn, bot trả lời bằng provider giả", async () => {
    const convo = await myKomiConversation(A);
    await request(app)
      .post("/api/messages/direct")
      .set(auth(A))
      .send({ recipientId: bot._id.toString(), conversationId: convo._id, content: "Chào Komi" })
      .expect(201);

    const [reply] = await waitFor(async () => {
      const list = await botMessages(convo._id);
      return list.length > 0 && list;
    });
    assert.equal(reply.content, FAKE_REPLY);

    // tin của bot cập nhật conversation như tin thường: A có 1 tin chưa đọc
    const updated = await models.Conversation.findById(convo._id);
    assert.equal(updated.lastMessage.senderId.toString(), bot._id.toString());
    assert.equal(updated.unreadCounts.get(A._id.toString()), 1);
  });

  test("prompt gồm system và lịch sử của đúng cuộc chat (user/assistant)", async () => {
    const convo = await myKomiConversation(A);
    const calls = spyChat();
    await request(app)
      .post("/api/messages/direct")
      .set(auth(A))
      .send({ recipientId: bot._id.toString(), conversationId: convo._id, content: "Câu thứ hai" })
      .expect(201);

    await waitFor(() => calls.length > 0);
    const { messages } = calls[0];
    assert.equal(messages[0].role, "system");
    assert.deepEqual(
      messages.slice(1).map((m) => m.role),
      ["user", "assistant", "user"],
    );
    assert.equal(messages.at(-1).content, "Câu thứ hai");
    assert.equal(messages[2].content, FAKE_REPLY);
  });

  test("lỗi từ nhà cung cấp → bot báo lỗi thân thiện", async () => {
    const convo = await myKomiConversation(B);
    spyChat(() => {
      throw new LLMError(LLM_ERROR.RATE_LIMIT, { status: 429 });
    });
    await request(app)
      .post("/api/messages/direct")
      .set(auth(B))
      .send({ recipientId: bot._id.toString(), conversationId: convo._id, content: "Có ai không" })
      .expect(201);

    const [reply] = await waitFor(async () => {
      const list = await botMessages(convo._id);
      return list.length > 0 && list;
    });
    assert.equal(reply.content, new LLMError(LLM_ERROR.RATE_LIMIT).message);
  });

  test("AI tắt sau khi đã có cuộc chat → bot báo đang tắt", async () => {
    const convo = await myKomiConversation(B);
    const before = (await botMessages(convo._id)).length;
    delete process.env.LLM_PROVIDER;
    await request(app)
      .post("/api/messages/direct")
      .set(auth(B))
      .send({ recipientId: bot._id.toString(), conversationId: convo._id, content: "Còn đó không" })
      .expect(201);

    const list = await waitFor(async () => {
      const l = await botMessages(convo._id);
      return l.length > before && l;
    });
    assert.equal(list.at(-1).content, AI_OFF_TEXT);
  });
});

describe("@komi trong nhóm", () => {
  const sendGroup = (user, content, conversationId = group._id) =>
    request(app).post("/api/messages/group").set(auth(user)).send({ conversationId, content });

  test("không nhắc @komi thì bot im lặng và không vào nhóm", async () => {
    await sendGroup(A, "Họp lúc 9h sáng mai ở phòng 3").expect(201);
    await new Promise((r) => setTimeout(r, 100));
    assert.equal((await botMessages(group._id)).length, 0);
    const g = await models.Conversation.findById(group._id);
    assert.ok(!g.participants.some((p) => p.userId.equals(bot._id)));
  });

  test("người ngoài nhóm không gọi được bot", async () => {
    const calls = spyChat();
    await sendGroup(C, "@komi đọc nhóm này giúp tôi").expect(404);
    await new Promise((r) => setTimeout(r, 100));
    assert.equal(calls.length, 0);
    assert.equal((await botMessages(group._id)).length, 0);
  });

  test("@komi: bot vào nhóm, báo thành viên mới, trả lời kèm trích dẫn câu hỏi", async () => {
    // một conversation khác có nội dung bí mật: không được lọt vào prompt
    const other = await models.Conversation.create({
      type: "group",
      participants: [{ userId: C._id }],
      group: { name: "Nhóm riêng của Chi" },
      lastMessageAt: new Date(),
    });
    await models.Message.create({ conversationId: other._id, senderId: C._id, content: "MẬT-KHẨU-WIFI-123" });

    // B nghe sự kiện thành viên mới qua socket
    const socket = connectClient(baseUrl, { auth: { token: tokenFor(B) }, transports: ["websocket"] });
    const participantsEvent = new Promise((resolve) => socket.on("conversation-participants", resolve));
    await new Promise((resolve) => socket.on("connect", resolve));

    const calls = spyChat();
    const sent = await sendGroup(B, "@komi mai họp mấy giờ?").expect(201);

    const [reply] = await waitFor(async () => {
      const list = await botMessages(group._id);
      return list.length > 0 && list;
    });
    assert.equal(reply.content, "Trả lời giả");
    assert.equal(reply.replyTo.messageId.toString(), sent.body.message._id);

    const event = await participantsEvent;
    assert.equal(event.conversationId, group._id.toString());
    assert.ok(event.participants.some((p) => p._id === bot._id.toString() && p.displayName === "Komi AI"));
    socket.disconnect();

    // prompt: có tên người nói, có tin trước đó trong nhóm, không có tin của nhóm khác
    const prompt = calls[0].messages.map((m) => m.content).join("\n");
    assert.match(prompt, /an: Họp lúc 9h sáng mai ở phòng 3/);
    assert.match(prompt, /binh: @komi mai họp mấy giờ\?/);
    assert.doesNotMatch(prompt, /MẬT-KHẨU-WIFI-123/);
  });

  test("gọi @komi lần nữa: bot không bị thêm trùng vào nhóm", async () => {
    await sendGroup(A, "@komi cảm ơn nhé").expect(201);
    await waitFor(async () => (await botMessages(group._id)).length >= 2);
    const g = await models.Conversation.findById(group._id);
    assert.equal(g.participants.filter((p) => p.userId.equals(bot._id)).length, 1);
  });
});
