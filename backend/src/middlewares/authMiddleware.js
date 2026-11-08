import jwt from "jsonwebtoken";
import User from "../models/User.js";

// authorization - xác minh user là ai
export const protectedRoute = async (req, res, next) => {
  // lấy token từ header
  const authHeader = req.headers["authorization"];
  const token = authHeader && authHeader.split(" ")[1]; // Bearer <token>

  if (!token) {
    return res.status(401).json({ message: "Không tìm thấy access token" });
  }

  let decoded;
  try {
    decoded = jwt.verify(token, process.env.ACCESS_TOKEN_SECRET);
  } catch {
    // frontend dựa vào mã 403 để tự gọi /auth/refresh
    return res.status(403).json({ message: "Access token hết hạn hoặc không đúng" });
  }

  try {
    const user = await User.findById(decoded.userId).select("-hashedPassword");

    if (!user) {
      return res.status(404).json({ message: "người dùng không tồn tại." });
    }

    // trả user về trong req
    req.user = user;
    next();
  } catch (error) {
    // trước đây lỗi DB trong callback của jwt.verify không được bắt,
    // có thể làm sập process vì unhandled rejection
    console.error("Lỗi khi xác minh JWT trong authMiddleware", error);
    return res.status(500).json({ message: "Lỗi hệ thống" });
  }
};
