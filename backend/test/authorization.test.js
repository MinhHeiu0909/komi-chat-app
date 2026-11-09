import { test, before, after, describe } from "node:test";
import assert from "node:assert/strict";
import request from "supertest";
import { io as connectClient } from "socket.io-client";
import {
  startDatabase,
  stopDatabase,
  auth,
  tokenFor,
  createUser,
  makeFriends,
} from "./helpers.js";

/**
 * Kịch bản: An (A) và Bình (B) có một cuộc trò chuyện 1-1 và một nhóm.
 * Chi (C) là bạn của An nhưng KHÔNG ở trong hai cuộc trò chuyện đó.
 * Chi không được đọc, ghi, đánh dấu đã xem hay nghe lén realtime.
 */

let app, server, io, models;
let A, B, C, D;
let directAB, groupAB;
let baseUrl;

before(async () => {
  models = await startDatabase();
  ({ default: app } = await import("../src/app.js"));
  ({ server, io } = await import("../src/socket/index.js"));

  const { User, Friend, Conversation, Message } = models;

  [A, B, C, D] = await Promise.all(
    ["an", "binh", "chi", "dung"].map((name) => createUser(User, name)),
  );

  await Promise.all([
    makeFriends(Friend, A, B),
    makeFriends(Friend, A, C),
    makeFriends(Friend, A, D),
  ]);

  // conversation 1-1 kiểu "dữ liệu cũ": chưa có directKey
  directAB = await Conversation.create({
    type: "direct",
    participants: [{ userId: A._id }, { userId: B._id }],
    lastMessageAt: new Date(),
  });

  groupAB = await Conversation.create({
    type: "group",
    participants: [{ userId: A._id }, { userId: B._id }],
    group: { name: "Nhóm An Bình", createdBy: A._id },
    lastMessageAt: new Date(),
  });

  await Message.create({
    conversationId: directAB._id,
    senderId: B._id,
    content: "Tin nhắn riêng tư giữa An và Bình",
  });

  directAB.lastMessage = {
    _id: "x",
    content: "Tin nhắn riêng tư giữa An và Bình",
    senderId: B._id,
    createdAt: new Date(),
  };
  await directAB.save();

  await new Promise((resolve) => server.listen(0, resolve));
  baseUrl = `http://localhost:${server.address().port}`;
});

after(async () => {
  await new Promise((resolve) => io.close(() => resolve()));
  await stopDatabase();
});

describe("REST: phân quyền theo thành viên conversation", () => {
  test("người ngoài không đọc được tin nhắn", async () => {
    const res = await request(app)
      .get(`/api/conversations/${directAB._id}/messages`)
      .set(auth(C));

    assert.equal(res.status, 404);
    assert.equal(res.body.messages, undefined);
  });

  test("thành viên đọc được tin nhắn", async () => {
    const res = await request(app)
      .get(`/api/conversations/${directAB._id}/messages`)
      .set(auth(A));

    assert.equal(res.status, 200);
    assert.equal(res.body.messages.length, 1);
  });

  test("người ngoài không đánh dấu đã xem được", async () => {
    const res = await request(app)
      .patch(`/api/conversations/${directAB._id}/seen`)
      .set(auth(C));

    assert.equal(res.status, 404);

    const fresh = await models.Conversation.findById(directAB._id);
    assert.equal(fresh.seenBy.length, 0);
  });

  test("người ngoài không gửi tin vào conversation 1-1 của người khác", async () => {
    const beforeCount = await models.Message.countDocuments({ conversationId: directAB._id });

    // C là bạn của A nên vượt qua checkFriendship, nhưng conversationId là của A và B
    const res = await request(app)
      .post("/api/messages/direct")
      .set(auth(C))
      .send({ recipientId: A._id.toString(), conversationId: directAB._id.toString(), content: "chen ngang" });

    assert.equal(res.status, 404);

    const afterCount = await models.Message.countDocuments({ conversationId: directAB._id });
    assert.equal(afterCount, beforeCount);
  });

  test("người ngoài không gửi tin vào nhóm", async () => {
    const res = await request(app)
      .post("/api/messages/group")
      .set(auth(C))
      .send({ conversationId: groupAB._id.toString(), content: "chen ngang" });

    assert.equal(res.status, 404);
  });

  test("conversationId sai định dạng trả 400 thay vì 500", async () => {
    const res = await request(app)
      .get("/api/conversations/khong-phai-objectid/messages")
      .set(auth(A));

    assert.equal(res.status, 400);
  });

  test("tin nhắn rỗng hoặc quá dài bị từ chối", async () => {
    const empty = await request(app)
      .post("/api/messages/group")
      .set(auth(A))
      .send({ conversationId: groupAB._id.toString(), content: "   " });
    assert.equal(empty.status, 400);

    const tooLong = await request(app)
      .post("/api/messages/group")
      .set(auth(A))
      .send({ conversationId: groupAB._id.toString(), content: "a".repeat(4001) });
    assert.equal(tooLong.status, 400);
  });
});

describe("REST: không tạo trùng conversation 1-1", () => {
  test("nhiều request đồng thời chỉ tạo một conversation", async () => {
    const sends = Array.from({ length: 5 }, (_, i) =>
      request(app)
        .post("/api/messages/direct")
        .set(auth(A))
        .send({ recipientId: D._id.toString(), content: `xin chào ${i}` }),
    );

    const results = await Promise.all(sends);
    results.forEach((res) => assert.equal(res.status, 201));

    const conversations = await models.Conversation.find({
      type: "direct",
      "participants.userId": { $all: [A._id, D._id] },
    });
    assert.equal(conversations.length, 1);

    const ids = new Set(results.map((res) => res.body.message.conversationId));
    assert.equal(ids.size, 1);
  });

  test("conversation cũ chưa có directKey được dùng lại", async () => {
    const res = await request(app)
      .post("/api/messages/direct")
      .set(auth(A))
      .send({ recipientId: B._id.toString(), content: "vẫn là cuộc trò chuyện cũ" });

    assert.equal(res.status, 201);
    assert.equal(res.body.message.conversationId, directAB._id.toString());
  });
});

describe("Socket: chỉ thành viên mới vào được room", () => {
  const connect = (user) =>
    new Promise((resolve, reject) => {
      const socket = connectClient(baseUrl, {
        auth: { token: tokenFor(user) },
        transports: ["websocket"],
        reconnection: false,
      });
      socket.once("connect", () => resolve(socket));
      socket.once("connect_error", reject);
    });

  const join = (socket, conversationId) =>
    new Promise((resolve) => socket.emit("join-conversation", conversationId, resolve));

  test("người ngoài bị từ chối và không nhận tin realtime", async () => {
    const [outsider, member] = await Promise.all([connect(C), connect(B)]);

    try {
      assert.deepEqual(await join(outsider, groupAB._id.toString()), { ok: false });
      assert.deepEqual(await join(member, groupAB._id.toString()), { ok: true });

      const received = { outsider: 0, member: 0 };
      outsider.on("new-message", () => (received.outsider += 1));
      const memberGotIt = new Promise((resolve) => member.once("new-message", resolve));
      member.on("new-message", () => (received.member += 1));

      const res = await request(app)
        .post("/api/messages/group")
        .set(auth(A))
        .send({ conversationId: groupAB._id.toString(), content: "chỉ nhóm mới thấy" });
      assert.equal(res.status, 201);

      await memberGotIt;
      await new Promise((resolve) => setTimeout(resolve, 200));

      assert.equal(received.member, 1);
      assert.equal(received.outsider, 0);
    } finally {
      outsider.disconnect();
      member.disconnect();
    }
  });

  test("typing: thành viên báo được cho người khác, người ngoài thì không", async () => {
    const [a, b, outsider] = await Promise.all([connect(A), connect(B), connect(C)]);
    const roomId = groupAB._id.toString();

    try {
      const got = { a: [], b: [], outsider: [] };
      a.on("typing", (e) => got.a.push(e));
      b.on("typing", (e) => got.b.push(e));
      outsider.on("typing", (e) => got.outsider.push(e));

      // người ngoài cố phát vào room của nhóm: không ai được nhận
      outsider.emit("typing:start", roomId);
      // id rác cũng không được làm sập handler
      outsider.emit("typing:start", "khong-phai-id");

      const bGotStart = new Promise((resolve) => b.once("typing", resolve));
      a.emit("typing:start", roomId);
      assert.deepEqual(await bGotStart, {
        conversationId: roomId,
        userId: A._id.toString(),
        isTyping: true,
      });

      const bGotStop = new Promise((resolve) => b.once("typing", resolve));
      a.emit("typing:stop", roomId);
      assert.equal((await bGotStop).isTyping, false);

      await new Promise((resolve) => setTimeout(resolve, 200));

      // B chỉ nhận đúng 2 sự kiện của A (không có sự kiện nào từ người ngoài)
      assert.equal(got.b.length, 2);
      assert.ok(got.b.every((e) => e.userId === A._id.toString()));
      // người gửi không nhận lại sự kiện của chính mình, người ngoài không nghe được
      assert.equal(got.a.length, 0);
      assert.equal(got.outsider.length, 0);
    } finally {
      a.disconnect();
      b.disconnect();
      outsider.disconnect();
    }
  });

  test("token sai bị từ chối với mã lỗi để client biết cần refresh", async () => {
    const error = await new Promise((resolve) => {
      const socket = connectClient(baseUrl, {
        auth: { token: "token-gia" },
        transports: ["websocket"],
        reconnection: false,
      });
      socket.once("connect_error", (err) => {
        socket.close();
        resolve(err);
      });
    });

    assert.equal(error.data?.code, "TOKEN_INVALID");
  });
});

describe("Trả lời (reply) tin nhắn", () => {
  const PRIVATE = "Tin nhắn riêng tư giữa An và Bình";

  test("trả lời tin trong cùng nhóm lưu kèm bản trích", async () => {
    const original = await request(app)
      .post("/api/messages/group")
      .set(auth(A))
      .send({ conversationId: groupAB._id.toString(), content: "Họp lúc 14h nhé" });
    assert.equal(original.status, 201);

    const res = await request(app)
      .post("/api/messages/group")
      .set(auth(B))
      .send({
        conversationId: groupAB._id.toString(),
        content: "Ok",
        replyToId: original.body.message._id,
      });

    assert.equal(res.status, 201);
    assert.deepEqual(res.body.message.replyTo, {
      messageId: original.body.message._id,
      senderId: A._id.toString(),
      content: "Họp lúc 14h nhé",
    });
  });

  test("không trả lời được tin ở cuộc trò chuyện khác (không lộ nội dung)", async () => {
    const privateMsg = await models.Message.findOne({ conversationId: directAB._id, content: PRIVATE });
    const before = await models.Message.countDocuments();

    // Chi (bạn của An) gửi tin 1-1 cho An, kèm id tin riêng của An và Bình
    const fromOutsider = await request(app)
      .post("/api/messages/direct")
      .set(auth(C))
      .send({ recipientId: A._id.toString(), content: "xem trộm", replyToId: privateMsg._id.toString() });

    assert.equal(fromOutsider.status, 400);
    assert.ok(!JSON.stringify(fromOutsider.body).includes(PRIVATE));

    // Bình là thành viên cả hai nơi nhưng vẫn không được trích tin 1-1 sang nhóm
    const crossConvo = await request(app)
      .post("/api/messages/group")
      .set(auth(B))
      .send({ conversationId: groupAB._id.toString(), content: "chuyển tiếp", replyToId: privateMsg._id.toString() });

    assert.equal(crossConvo.status, 400);
    assert.equal(await models.Message.countDocuments(), before);
  });

  test("replyToId sai định dạng trả 400", async () => {
    const res = await request(app)
      .post("/api/messages/group")
      .set(auth(A))
      .send({ conversationId: groupAB._id.toString(), content: "hi", replyToId: "abc" });

    assert.equal(res.status, 400);
  });
});

describe("Cảm xúc (reaction)", () => {
  let messageId;

  const react = (user, emoji, id = messageId) =>
    request(app).post(`/api/messages/${id}/reactions`).set(auth(user)).send({ emoji });

  before(async () => {
    const res = await request(app)
      .post("/api/messages/group")
      .set(auth(A))
      .send({ conversationId: groupAB._id.toString(), content: "Thả tim tin này đi" });
    messageId = res.body.message._id;
  });

  test("thả, đổi rồi gỡ cảm xúc; mỗi người một cảm xúc", async () => {
    let res = await react(B, "❤️");
    assert.equal(res.status, 200);
    assert.deepEqual(res.body.reactions, [{ userId: B._id.toString(), emoji: "❤️" }]);

    res = await react(A, "👍");
    assert.equal(res.body.reactions.length, 2);

    // Bình đổi sang 😆: thay chứ không thêm
    res = await react(B, "😆");
    assert.deepEqual(
      res.body.reactions.find((r) => r.userId === B._id.toString()),
      { userId: B._id.toString(), emoji: "😆" },
    );
    assert.equal(res.body.reactions.length, 2);

    // bấm lại đúng 😆: gỡ
    res = await react(B, "😆");
    assert.deepEqual(res.body.reactions, [{ userId: A._id.toString(), emoji: "👍" }]);
  });

  test("người ngoài nhận 404 và không thay đổi được gì", async () => {
    const before = await models.Message.findById(messageId).lean();

    const res = await react(C, "😡");
    assert.equal(res.status, 404);

    const after = await models.Message.findById(messageId).lean();
    assert.deepEqual(after.reactions, before.reactions);
  });

  test("emoji ngoài danh sách hoặc messageId sai trả 400", async () => {
    assert.equal((await react(A, "<script>")).status, 400);
    assert.equal((await react(A, "👍", "khong-phai-id")).status, 400);
  });

  test("thành viên khác nhận cập nhật realtime", async () => {
    const socket = connectClient(baseUrl, {
      auth: { token: tokenFor(B) },
      transports: ["websocket"],
      reconnection: false,
    });

    try {
      await new Promise((resolve, reject) => {
        socket.once("connect", resolve);
        socket.once("connect_error", reject);
      });
      // chờ server đưa socket vào các room conversation của Bình
      await new Promise((resolve) => setTimeout(resolve, 100));

      const got = new Promise((resolve, reject) => {
        socket.once("message-reaction", resolve);
        setTimeout(() => reject(new Error("Không nhận được message-reaction")), 5000);
      });
      const res = await react(A, "😮");
      assert.equal(res.status, 200);
      const event = await got;

      assert.equal(event.messageId, messageId);
      assert.equal(event.conversationId, groupAB._id.toString());
      assert.ok(event.reactions.some((r) => r.userId === A._id.toString() && r.emoji === "😮"));
    } finally {
      socket.disconnect();
    }
  });
});

describe("Đã xem (seen) trong nhóm", () => {
  test("người gửi nhận read-message kèm tên người đã xem", async () => {
    const socket = connectClient(baseUrl, {
      auth: { token: tokenFor(A) },
      transports: ["websocket"],
      reconnection: false,
    });

    try {
      await new Promise((resolve, reject) => {
        socket.once("connect", resolve);
        socket.once("connect_error", reject);
      });
      await new Promise((resolve) => setTimeout(resolve, 100));

      const sent = await request(app)
        .post("/api/messages/group")
        .set(auth(A))
        .send({ conversationId: groupAB._id.toString(), content: "Mọi người đọc chưa?" });
      assert.equal(sent.status, 201);

      const got = new Promise((resolve, reject) => {
        socket.once("read-message", resolve);
        setTimeout(() => reject(new Error("Không nhận được read-message")), 5000);
      });
      const res = await request(app)
        .patch(`/api/conversations/${groupAB._id}/seen`)
        .set(auth(B));
      assert.equal(res.status, 200);
      const event = await got;

      assert.equal(event.conversation._id, groupAB._id.toString());
      assert.equal(event.lastMessage._id, sent.body.message._id);
      assert.deepEqual(
        event.conversation.seenBy.map((u) => ({ _id: u._id, displayName: u.displayName })),
        [{ _id: B._id.toString(), displayName: B.displayName }],
      );
      assert.equal(event.conversation.unreadCounts[B._id.toString()], 0);
    } finally {
      socket.disconnect();
    }
  });
});

describe("Gửi ảnh", () => {
  // ảnh PNG 1x1 thật
  const PNG = Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=",
    "base64",
  );
  let imageStorage;
  let original;
  const urlFor = (user, name = "anh1") =>
    `https://res.cloudinary.com/komi-test/image/upload/v1700000000/komi_chat/messages/${user._id}/${name}.png`;

  before(async () => {
    ({ imageStorage } = await import("../src/utils/messageImage.js"));
    original = { ...imageStorage };
    process.env.CLOUDINARY_CLOUD_NAME = "komi-test";
    // không gọi Cloudinary thật trong test
    imageStorage.isReady = () => true;
    imageStorage.upload = async (_buffer, userId) => ({ secure_url: urlFor({ _id: userId }) });
  });

  after(() => {
    Object.assign(imageStorage, original);
    delete process.env.CLOUDINARY_CLOUD_NAME;
  });

  const upload = (user, buffer, filename = "anh.png", contentType = "image/png") =>
    request(app)
      .post("/api/messages/images")
      .set(auth(user))
      .attach("file", buffer, { filename, contentType });

  test("tải ảnh lên rồi gửi tin chỉ có ảnh", async () => {
    const up = await upload(A, PNG);
    assert.equal(up.status, 201);
    assert.equal(up.body.imgUrl, urlFor(A));

    const res = await request(app)
      .post("/api/messages/group")
      .set(auth(A))
      .send({ conversationId: groupAB._id.toString(), imgUrl: up.body.imgUrl });
    assert.equal(res.status, 201);
    assert.equal(res.body.message.imgUrl, urlFor(A));

    // danh sách chat hiện chữ thay cho tin rỗng
    const convo = await models.Conversation.findById(groupAB._id).lean();
    assert.equal(convo.lastMessage.content, "📷 Hình ảnh");
  });

  test("file không phải ảnh bị từ chối dù khai là image/png", async () => {
    const res = await upload(A, Buffer.from("<html><script>alert(1)</script></html>"), "x.png");
    assert.equal(res.status, 400);
  });

  test("ảnh quá 5MB trả 413", async () => {
    const big = Buffer.concat([PNG, Buffer.alloc(5 * 1024 * 1024)]);
    const res = await upload(A, big);
    assert.equal(res.status, 413);
  });

  test("không nhận imgUrl tuỳ ý hoặc ảnh của người khác", async () => {
    const send = (imgUrl) =>
      request(app)
        .post("/api/messages/group")
        .set(auth(A))
        .send({ conversationId: groupAB._id.toString(), content: "xem nè", imgUrl });

    for (const imgUrl of [
      "https://tracker.example.com/pixel.png", // link theo dõi
      urlFor(B), // ảnh trong thư mục của Bình
      urlFor(A).replace("komi-test", "cloud-khac"), // Cloudinary của người khác
      urlFor(A, "../../x"), // cố thoát khỏi thư mục
      "javascript:alert(1)",
    ]) {
      const res = await send(imgUrl);
      assert.equal(res.status, 400, imgUrl);
    }
  });

  test("server chưa cấu hình Cloudinary thì báo 503", async () => {
    imageStorage.isReady = () => false;
    try {
      const res = await upload(A, PNG);
      assert.equal(res.status, 503);
    } finally {
      imageStorage.isReady = () => true;
    }
  });
});

describe("Auth", () => {
  test("đăng ký trùng email trả 409 thay vì 500", async () => {
    const res = await request(app).post("/api/auth/signup").send({
      username: "an_khac",
      email: "an@example.com",
      password: "matkhau123",
      firstName: "An",
      lastName: "Nguyễn",
    });

    assert.equal(res.status, 409);
  });
});
