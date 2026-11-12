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
let originalStreamChat;

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

// thay llm.streamChat để xem prompt gửi đi / giả lỗi / giả câu trả lời bị treo
const spyChat = (impl) => {
  const calls = [];
  llm.streamChat = async function* (args) {
    calls.push(args);
    if (impl) yield* impl(args);
    else yield "Trả lời giả";
  };
  return calls;
};

// chờ tới khi bị dừng (signal abort) thì ném AbortError, giống provider thật
// (signal đã huỷ từ trước thì ném ngay: sự kiện abort không phát lại lần nữa)
const untilAborted = (signal) =>
  new Promise((_, reject) => {
    if (signal.aborted) return reject(signal.reason);
    signal.addEventListener("abort", () => reject(signal.reason), { once: true });
  });

const myKomiConversation = async (user) => {
  const res = await request(app).get("/api/conversations").set(auth(user)).expect(200);
  return res.body.conversations.find(
    (c) => c.type === "direct" && c.participants.some((p) => p._id === bot._id.toString()),
  );
};

before(async () => {
  process.env.LLM_PROVIDER = "fake";
  process.env.AI_DAILY_LIMIT = "1000"; // các test khác hỏi bot nhiều lần; test hạn mức tự đặt lại
  models = await startDatabase();
  const { default: AiUsage } = await import("../src/models/AiUsage.js");
  await AiUsage.init();
  ({ default: app } = await import("../src/app.js"));
  ({ server, io } = await import("../src/socket/index.js"));
  ({ llm, LLMError, LLM_ERROR } = await import("../src/ai/llm.js"));
  ({ FAKE_REPLY } = await import("../src/ai/providers/fake.js"));
  ({ KOMI_USERNAME, KOMI_MENTION, AI_OFF_TEXT, getKomiBot } = await import("../src/ai/komiBot.js"));
  originalStreamChat = llm.streamChat;

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
  llm.streamChat = originalStreamChat;
  process.env.LLM_PROVIDER = "fake";
  process.env.AI_DAILY_LIMIT = "1000";
});

after(async () => {
  delete process.env.LLM_PROVIDER;
  delete process.env.AI_DAILY_LIMIT;
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
    spyChat(async function* () {
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

describe("streaming qua socket và nút dừng", () => {
  const sockets = [];
  const connect = async (user, conversationId) => {
    const socket = connectClient(baseUrl, { auth: { token: tokenFor(user) }, transports: ["websocket"] });
    sockets.push(socket);
    await new Promise((resolve) => socket.on("connect", resolve));
    if (conversationId) assert.deepEqual(await socket.emitWithAck("join-conversation", conversationId), { ok: true });
    return socket;
  };
  afterEach(() => sockets.splice(0).forEach((s) => s.disconnect()));

  const askBot = (user, convo, content) =>
    request(app)
      .post("/api/messages/direct")
      .set(auth(user))
      .send({ recipientId: bot._id.toString(), conversationId: convo._id, content })
      .expect(201);

  const nextEvent = (socket, name) => new Promise((resolve) => socket.once(name, resolve));

  test("ai:start → ai:token → new-message → ai:done, tin thật mang clientId = streamId", async () => {
    const convo = await myKomiConversation(A);
    const socket = await connect(A, convo._id);

    const order = [];
    const tokens = [];
    let start;
    socket.on("ai:start", (e) => {
      order.push("start");
      start = e;
    });
    socket.on("ai:token", (e) => {
      if (order.at(-1) !== "token") order.push("token");
      tokens.push(e.token);
    });
    socket.on("new-message", (e) => {
      if (e.message.senderId === bot._id.toString()) order.push("new-message");
    });
    const done = nextEvent(socket, "ai:done").then((e) => (order.push("done"), e));

    await askBot(A, convo, "Kể chuyện đi");
    const doneEvent = await done;

    assert.deepEqual(order, ["start", "token", "new-message", "done"]);
    assert.ok(tokens.length > 1);
    assert.equal(tokens.join(""), FAKE_REPLY);
    assert.equal(start.askerId, A._id.toString());
    assert.equal(start.botId, bot._id.toString());
    assert.equal(doneEvent.streamId, start.streamId);
    assert.equal(doneEvent.stopped, false);

    const saved = await models.Message.findById(doneEvent.messageId).lean();
    assert.equal(saved.content, FAKE_REPLY);
    assert.equal(saved.clientId, start.streamId);
  });

  test("người hỏi bấm dừng giữa chừng: lưu phần đã trả lời, đánh dấu đã dừng", async () => {
    const convo = await myKomiConversation(A);
    const socket = await connect(A, convo._id);
    const calls = spyChat(async function* ({ signal }) {
      yield "Một phần";
      await untilAborted(signal);
    });

    const token = nextEvent(socket, "ai:token");
    const done = nextEvent(socket, "ai:done");
    await askBot(A, convo, "Viết dài vào");

    const { streamId } = await token;
    assert.deepEqual(await socket.emitWithAck("ai:stop", { streamId }), { ok: true });

    const doneEvent = await done;
    assert.equal(doneEvent.stopped, true);
    const saved = await models.Message.findById(doneEvent.messageId).lean();
    assert.equal(saved.content, "Một phần\n\n_(Đã dừng)_");
    assert.ok(calls[0].signal.aborted);
  });

  test("người khác không dừng được câu trả lời của mình; stream không tồn tại → ok: false", async () => {
    const convo = await myKomiConversation(A);
    const socketA = await connect(A, convo._id);
    const socketB = await connect(B);
    spyChat(async function* ({ signal }) {
      yield "Đang viết";
      await untilAborted(signal);
    });

    const token = nextEvent(socketA, "ai:token");
    const done = nextEvent(socketA, "ai:done");
    await askBot(A, convo, "Câu hỏi của An");
    const { streamId } = await token;

    assert.deepEqual(await socketB.emitWithAck("ai:stop", { streamId }), { ok: false });
    assert.deepEqual(await socketA.emitWithAck("ai:stop", { streamId: "khong-co" }), { ok: false });
    assert.deepEqual(await socketA.emitWithAck("ai:stop", null), { ok: false });

    // vẫn đang chạy cho tới khi chính A dừng
    assert.deepEqual(await socketA.emitWithAck("ai:stop", { streamId }), { ok: true });
    assert.equal((await done).stopped, true);
  });

  test("dừng trước khi có chữ nào: không lưu tin, ai:done có messageId null", async () => {
    const convo = await myKomiConversation(A);
    const socket = await connect(A, convo._id);
    spyChat(async function* ({ signal }) {
      await untilAborted(signal);
    });

    const before = (await botMessages(convo._id)).length;
    const start = nextEvent(socket, "ai:start");
    const done = nextEvent(socket, "ai:done");
    await askBot(A, convo, "Thôi khỏi");

    const { streamId } = await start;
    assert.deepEqual(await socket.emitWithAck("ai:stop", { streamId }), { ok: true });

    const doneEvent = await done;
    assert.equal(doneEvent.messageId, null);
    assert.equal(doneEvent.stopped, true);
    assert.equal((await botMessages(convo._id)).length, before);
  });
});

describe("hạn mức lượt hỏi trong chat", () => {
  let D, AiUsage, quotaExceededText;
  const sockets = [];

  before(async () => {
    D = await createUser(models.User, "dung");
    ({ default: AiUsage } = await import("../src/models/AiUsage.js"));
    ({ quotaExceededText } = await import("../src/ai/quota.js"));
    await models.Conversation.updateOne({ _id: group._id }, { $push: { participants: { userId: D._id } } });
  });
  afterEach(() => sockets.splice(0).forEach((s) => s.disconnect()));

  const connect = async (user) => {
    const socket = connectClient(baseUrl, { auth: { token: tokenFor(user) }, transports: ["websocket"] });
    sockets.push(socket);
    await new Promise((resolve) => socket.on("connect", resolve));
    return socket;
  };
  const usedToday = async (user) => (await AiUsage.findOne({ userId: user._id }).lean())?.count ?? 0;

  test("hết lượt: chỉ người hỏi nhận ai:error, bot không trả lời, không gọi LLM", async () => {
    process.env.AI_DAILY_LIMIT = "1";
    const convo = await myKomiConversation(D);
    const socket = await connect(D);
    const calls = spyChat();
    const ask = (content) =>
      request(app)
        .post("/api/messages/direct")
        .set(auth(D))
        .send({ recipientId: bot._id.toString(), conversationId: convo._id, content })
        .expect(201);

    await ask("Lượt thứ nhất");
    await waitFor(async () => (await botMessages(convo._id)).length === 1);

    const starts = [];
    socket.on("ai:start", (e) => starts.push(e));
    const error = new Promise((resolve) => socket.once("ai:error", resolve));
    await ask("Lượt thứ hai");

    assert.deepEqual(await error, { conversationId: convo._id, message: quotaExceededText(1) });
    await new Promise((r) => setTimeout(r, 100));
    assert.equal(calls.length, 1);
    assert.equal(starts.length, 0);
    assert.equal((await botMessages(convo._id)).length, 1);
    assert.equal(await usedToday(D), 1);
  });

  test("lỗi từ nhà cung cấp thì được hoàn lượt; AI tắt thì không tính lượt", async () => {
    await AiUsage.deleteMany({ userId: D._id });
    const convo = await myKomiConversation(D);
    const before = (await botMessages(convo._id)).length;
    const ask = (content) =>
      request(app)
        .post("/api/messages/direct")
        .set(auth(D))
        .send({ recipientId: bot._id.toString(), conversationId: convo._id, content })
        .expect(201);

    spyChat(async function* () {
      throw new LLMError(LLM_ERROR.RATE_LIMIT, { status: 429 });
    });
    await ask("Lỗi nhà cung cấp");
    await waitFor(async () => (await botMessages(convo._id)).length === before + 1);
    await waitFor(async () => (await usedToday(D)) === 0);

    delete process.env.LLM_PROVIDER;
    await ask("AI đang tắt");
    await waitFor(async () => (await botMessages(convo._id)).length === before + 2);
    assert.equal(await usedToday(D), 0);
  });

  test("hết lượt mà gọi @komi trong nhóm: bot không vào nhóm, cả nhóm không thấy gì", async () => {
    process.env.AI_DAILY_LIMIT = "1";
    await AiUsage.deleteMany({ userId: D._id });
    await AiUsage.create({ userId: D._id, day: (await import("../src/ai/quota.js")).vnDay(), count: 1 });

    // nhóm mới chưa có bot, D và B là thành viên
    const fresh = await models.Conversation.create({
      type: "group",
      participants: [{ userId: D._id }, { userId: B._id }],
      group: { name: "Nhóm mới", createdBy: D._id },
      lastMessageAt: new Date(),
    });
    const socketD = await connect(D);
    const socketB = await connect(B);
    const seenByB = [];
    for (const name of ["ai:error", "ai:start", "conversation-participants"]) socketB.on(name, () => seenByB.push(name));
    const error = new Promise((resolve) => socketD.once("ai:error", resolve));

    await request(app)
      .post("/api/messages/group")
      .set(auth(D))
      .send({ conversationId: fresh._id, content: "@komi giúp với" })
      .expect(201);

    assert.equal((await error).conversationId, fresh._id.toString());
    await new Promise((r) => setTimeout(r, 100));
    assert.deepEqual(seenByB, []);
    const after = await models.Conversation.findById(fresh._id);
    assert.ok(!after.participants.some((p) => p.userId.equals(bot._id)));
  });
});
