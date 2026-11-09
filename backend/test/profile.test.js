import { test, before, after, describe } from "node:test";
import assert from "node:assert/strict";
import request from "supertest";
import bcrypt from "bcrypt";
import { io as connectClient } from "socket.io-client";
import { startDatabase, stopDatabase, auth, tokenFor, createUser } from "./helpers.js";

/**
 * Hồ sơ cá nhân: sửa thông tin, ẩn trạng thái online, đổi mật khẩu.
 */

let app, server, io, models, Session;
let A, B;
let baseUrl;

before(async () => {
  models = await startDatabase();
  ({ default: app } = await import("../src/app.js"));
  ({ server, io } = await import("../src/socket/index.js"));
  ({ default: Session } = await import("../src/models/Session.js"));

  [A, B] = await Promise.all(["an", "binh"].map((name) => createUser(models.User, name)));

  await new Promise((resolve) => server.listen(0, resolve));
  baseUrl = `http://localhost:${server.address().port}`;
});

after(async () => {
  await new Promise((resolve) => io.close(() => resolve()));
  await stopDatabase();
});

const patchMe = (user, body) => request(app).patch("/api/users/me").set(auth(user)).send(body);

describe("Sửa thông tin cá nhân", () => {
  test("sửa tên, giới thiệu, số điện thoại; bỏ qua username/email", async () => {
    const res = await patchMe(A, {
      displayName: "  Nguyễn Văn An  ",
      bio: "Thích code",
      phone: "+84 912 345 678",
      username: "hacker",
      email: "hacker@example.com",
    });

    assert.equal(res.status, 200);
    assert.equal(res.body.user.displayName, "Nguyễn Văn An");
    assert.equal(res.body.user.bio, "Thích code");
    assert.equal(res.body.user.phone, "+84 912 345 678");
    assert.equal(res.body.user.username, "an");
    assert.equal(res.body.user.email, "an@example.com");
    assert.equal(res.body.user.hashedPassword, undefined);
  });

  test("để trống giới thiệu / số điện thoại thì xoá đi", async () => {
    const res = await patchMe(A, { bio: "", phone: "" });
    assert.equal(res.status, 200);
    assert.equal(res.body.user.bio, undefined);
    assert.equal(res.body.user.phone, undefined);
  });

  test("dữ liệu sai bị từ chối", async () => {
    for (const body of [
      { displayName: "   " },
      { displayName: "x".repeat(51) },
      { bio: "x".repeat(301) },
      { phone: "gọi tôi đi" },
      { showOnlineStatus: "false" },
      {},
    ]) {
      const res = await patchMe(A, body);
      assert.equal(res.status, 400, JSON.stringify(body));
    }
  });
});

describe("Ẩn trạng thái online", () => {
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

  // chờ lần "online-users" kế tiếp thoả điều kiện
  const nextOnlineList = (socket, predicate) =>
    new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error("Không nhận được online-users mong đợi")), 5000);
      const handler = (ids) => {
        if (!predicate(ids)) return;
        clearTimeout(timer);
        socket.off("online-users", handler);
        resolve(ids);
      };
      socket.on("online-users", handler);
    });

  test("tắt thì người khác thấy offline, bật lại thì thấy online", async () => {
    const a = A._id.toString();
    const watcher = await connect(B);
    const sawA = nextOnlineList(watcher, (ids) => ids.includes(a));
    const sockA = await connect(A);

    try {
      await sawA;

      const hidden = nextOnlineList(watcher, (ids) => !ids.includes(a));
      assert.equal((await patchMe(A, { showOnlineStatus: false })).status, 200);
      await hidden;

      // mở thêm tab khi đang ẩn: vẫn ẩn
      const sockA2 = await connect(A);
      await new Promise((r) => setTimeout(r, 200));
      sockA2.disconnect();

      const shown = nextOnlineList(watcher, (ids) => ids.includes(a));
      assert.equal((await patchMe(A, { showOnlineStatus: true })).status, 200);
      await shown;
    } finally {
      sockA.disconnect();
      watcher.disconnect();
    }
  });
});

describe("Đổi mật khẩu", () => {
  let user;

  // đăng nhập thật để có session + refresh token (cookie Secure nên tự đọc header)
  const signIn = async (password) => {
    const res = await request(app)
      .post("/api/auth/signin")
      .send({ username: "chi", password });
    const cookie = (res.headers["set-cookie"] ?? []).find((c) => c.startsWith("refreshToken="));
    return { status: res.status, accessToken: res.body.accessToken, cookie: cookie?.split(";")[0] };
  };

  before(async () => {
    user = await models.User.create({
      username: "chi",
      email: "chi@example.com",
      displayName: "Chi",
      hashedPassword: await bcrypt.hash("matkhau-cu", 10),
    });
  });

  const change = (session, body) =>
    request(app)
      .post("/api/users/me/password")
      .set("Authorization", `Bearer ${session.accessToken}`)
      .set("Cookie", session.cookie)
      .send(body);

  test("sai mật khẩu hiện tại hoặc mật khẩu mới quá ngắn trả 400", async () => {
    const session = await signIn("matkhau-cu");
    assert.equal(session.status, 200);

    assert.equal((await change(session, { currentPassword: "sai", newPassword: "matkhau-moi" })).status, 400);
    assert.equal((await change(session, { currentPassword: "matkhau-cu", newPassword: "123" })).status, 400);
    assert.equal(
      (await change(session, { currentPassword: "matkhau-cu", newPassword: "matkhau-cu" })).status,
      400,
    );
  });

  test("đổi xong: đăng nhập bằng mật khẩu mới, các thiết bị khác bị đăng xuất", async () => {
    await Session.deleteMany({ userId: user._id });
    const thisDevice = await signIn("matkhau-cu");
    const otherDevice = await signIn("matkhau-cu");

    const res = await change(thisDevice, { currentPassword: "matkhau-cu", newPassword: "matkhau-moi" });
    assert.equal(res.status, 200);
    assert.equal(res.body.signedOutSessions, 1);

    const sessions = await Session.find({ userId: user._id }).lean();
    assert.deepEqual(
      sessions.map((s) => `refreshToken=${s.refreshToken}`),
      [thisDevice.cookie],
    );

    // thiết bị kia không refresh được nữa
    const refresh = await request(app).post("/api/auth/refresh").set("Cookie", otherDevice.cookie);
    assert.equal(refresh.status, 403);

    assert.equal((await signIn("matkhau-cu")).status, 401);
    assert.equal((await signIn("matkhau-moi")).status, 200);
  });
});
