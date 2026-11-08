import express from "express";
import { refreshToken, signIn, signOut, signUp } from "../controllers/authController.js";
import { rateLimit } from "../middlewares/rateLimit.js";

const router = express.Router();

const MINUTE = 60 * 1000;

router.post(
  "/signup",
  rateLimit({ windowMs: 60 * MINUTE, max: 10, message: "Đăng ký quá nhiều lần, hãy thử lại sau" }),
  signUp,
);

router.post(
  "/signin",
  rateLimit({ windowMs: 15 * MINUTE, max: 10, message: "Đăng nhập sai quá nhiều lần, hãy thử lại sau" }),
  signIn,
);

router.post("/signout", signOut);

router.post("/refresh", rateLimit({ windowMs: 15 * MINUTE, max: 60 }), refreshToken);

export default router;
