import express from "express";
import cookieParser from "cookie-parser";
import cors from "cors";
import authRoute from "./routes/authRoute.js";
import userRoute from "./routes/userRoute.js";
import friendRoute from "./routes/friendRoute.js";
import messageRoute from "./routes/messageRoute.js";
import conversationRoute from "./routes/conversationRoute.js";
import documentRoute from "./routes/documentRoute.js";
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

// private routes
app.use(protectedRoute);
app.use("/api/users", userRoute);
app.use("/api/friends", friendRoute);
app.use("/api/messages", messageRoute);
app.use("/api/conversations", conversationRoute);
app.use("/api/documents", documentRoute);

export default app;
