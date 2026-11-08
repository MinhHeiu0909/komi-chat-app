import jwt from "jsonwebtoken";
import User from "../models/User.js";

const authError = (message, code) => {
  const error = new Error(message);
  // client đọc err.data.code để biết cần refresh token rồi kết nối lại
  error.data = { code };
  return error;
};

export const socketAuthMiddleware = async (socket, next) => {
  const token = socket.handshake.auth?.token;
  if (!token) {
    return next(authError("Unauthorized - Token không tồn tại", "TOKEN_MISSING"));
  }

  let decoded;
  try {
    decoded = jwt.verify(token, process.env.ACCESS_TOKEN_SECRET);
  } catch {
    return next(
      authError("Unauthorized - Token không hợp lệ hoặc đã hết hạn", "TOKEN_INVALID"),
    );
  }

  try {
    const user = await User.findById(decoded.userId).select("-hashedPassword");

    if (!user) {
      return next(authError("User không tồn tại", "USER_NOT_FOUND"));
    }

    socket.user = user;
    next();
  } catch (error) {
    console.error("Lỗi khi xác thực socket", error);
    next(authError("Lỗi hệ thống", "SERVER_ERROR"));
  }
};
