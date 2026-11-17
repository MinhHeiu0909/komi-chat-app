import fs from "node:fs";
import path from "node:path";
import express from "express";
import cookieParser from "cookie-parser";
import cors from "cors";
import authRoute from "./routes/authRoute.js";
import userRoute from "./routes/userRoute.js";
import friendRoute from "./routes/friendRoute.js";
import messageRoute from "./routes/messageRoute.js";
import conversationRoute from "./routes/conversationRoute.js";
import documentRoute from "./routes/documentRoute.js";
import adminRoute from "./routes/adminRoute.js";
import { protectedRoute } from "./middlewares/authMiddleware.js";
import { app } from "./socket/index.js";

// Khi deploy sau reverse proxy (Render, Railway, Nginx...), đặt TRUST_PROXY=1
// để req.ip là IP thật của người dùng (rate limit cần điều này).
if (process.env.TRUST_PROXY) {
  const value = Number(process.env.TRUST_PROXY);
  app.set("trust proxy", Number.isNaN(value) ? process.env.TRUST_PROXY : value);
}

// middlewares
app.use(express.json({ limit: "100kb" }));
app.use(cookieParser());
app.use(cors({ origin: process.env.CLIENT_URL, credentials: true }));

// public routes
app.get("/api/health", (req, res) => res.status(200).json({ status: "ok" }));
app.use("/api/auth", authRoute);

// Deploy một service (Render): backend phục vụ luôn frontend đã build, cùng địa chỉ với API,
// nên cookie refresh token không thành cookie bên thứ ba (Safari chặn) và không cần CORS.
// Đặt trước protectedRoute vì middleware đó áp dụng cho mọi route phía sau.
const frontendDist = process.env.FRONTEND_DIST ? path.resolve(process.env.FRONTEND_DIST) : null;
if (frontendDist && fs.existsSync(path.join(frontendDist, "index.html"))) {
  app.use(
    express.static(frontendDist, {
      index: false,
      // file trong assets/ có hash trong tên: cache lâu; index.html luôn hỏi lại để nhận bản mới
      setHeaders: (res, filePath) =>
        res.setHeader(
          "Cache-Control",
          filePath.includes(`${path.sep}assets${path.sep}`) ? "public, max-age=31536000, immutable" : "no-cache",
        ),
    }),
  );
  // các trang của React Router (/documents, /admin/ai-usage...): trả index.html
  app.get(/^\/(?!api\/|api$|socket\.io\/).*/, (req, res) => {
    res.setHeader("Cache-Control", "no-cache");
    res.sendFile(path.join(frontendDist, "index.html"));
  });
}

// private routes
app.use(protectedRoute);
app.use("/api/users", userRoute);
app.use("/api/friends", friendRoute);
app.use("/api/messages", messageRoute);
app.use("/api/conversations", conversationRoute);
app.use("/api/documents", documentRoute);
app.use("/api/admin", adminRoute);

export default app;
