import express from "express";

import { getAiUsage } from "../controllers/adminController.js";
import { requireAiAdmin } from "../middlewares/adminMiddleware.js";

// Trang admin. Người không có quyền nhận 404 như route không tồn tại (xem adminMiddleware.js).
const router = express.Router();

router.use(requireAiAdmin);
router.get("/ai-usage", getAiUsage);

export default router;
