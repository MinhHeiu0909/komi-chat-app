import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import request from "supertest";
import { startDatabase, stopDatabase } from "./helpers.js";

/**
 * Bản deploy một service: backend phục vụ luôn frontend đã build (FRONTEND_DIST).
 * Các route /api và /socket.io không bị trang React "nuốt".
 */

let app, dist;

before(async () => {
  dist = fs.mkdtempSync(path.join(os.tmpdir(), "komi-dist-"));
  fs.mkdirSync(path.join(dist, "assets"));
  fs.writeFileSync(path.join(dist, "index.html"), "<!doctype html><title>Komi</title>");
  fs.writeFileSync(path.join(dist, "assets", "index-abc123.js"), "console.log('komi')");
  process.env.FRONTEND_DIST = dist; // phải đặt trước khi import app.js
  await startDatabase();
  ({ default: app } = await import("../src/app.js"));
});

after(async () => {
  delete process.env.FRONTEND_DIST;
  fs.rmSync(dist, { recursive: true, force: true });
  await stopDatabase();
});

test("trang chủ và các trang của React Router trả index.html, không cache", async () => {
  for (const url of ["/", "/documents", "/admin/ai-usage", "/signin"]) {
    const res = await request(app).get(url).expect(200);
    assert.match(res.text, /<title>Komi<\/title>/, url);
    assert.equal(res.headers["cache-control"], "no-cache", url);
  }
});

test("file trong assets/ cache lâu", async () => {
  const res = await request(app).get("/assets/index-abc123.js").expect(200);
  assert.match(res.headers["cache-control"], /immutable/);
});

test("API vẫn là API: health, route cần đăng nhập, route không tồn tại", async () => {
  const health = await request(app).get("/api/health").expect(200);
  assert.deepEqual(health.body, { status: "ok" });
  await request(app).get("/api/users/me").expect(401);
  const missing = await request(app).get("/api").expect(401); // đi qua protectedRoute, không phải index.html
  assert.doesNotMatch(missing.text, /<title>Komi/);
});
