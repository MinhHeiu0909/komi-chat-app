import express from "express";
import {
  authMe,
  searchUserByUsername,
  uploadAvatar,
  updateMe,
  changePassword,
} from "../controllers/userController.js";
import { upload } from "../middlewares/uploadMiddleware.js";
import { rateLimit } from "../middlewares/rateLimit.js";

const router = express.Router();

router.get("/me", authMe);
router.patch("/me", updateMe);
router.post(
  "/me/password",
  rateLimit({ windowMs: 15 * 60 * 1000, max: 10, message: "Thử đổi mật khẩu quá nhiều lần, hãy thử lại sau" }),
  changePassword,
);
router.get("/search", searchUserByUsername);
router.post("/uploadAvatar", upload.single("file"), uploadAvatar);

export default router;
