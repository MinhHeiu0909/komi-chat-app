/**
 * Tài khoản demo dùng chung trên bản deploy công khai (DEMO_USERNAMES, phân cách bằng dấu phẩy):
 * không cho đổi mật khẩu / hồ sơ / avatar, để người sau vẫn đăng nhập và thấy đúng dữ liệu mẫu.
 * Để trống = không có tài khoản demo (khi dev).
 */
export const demoUsernames = () =>
  new Set(
    (process.env.DEMO_USERNAMES ?? "")
      .split(",")
      .map((name) => name.trim().toLowerCase())
      .filter(Boolean),
  );

export const isDemoAccount = (user) => Boolean(user?.username) && demoUsernames().has(user.username.toLowerCase());

export const DEMO_LOCKED_MESSAGE =
  "Tài khoản demo dùng chung nên không đổi được mật khẩu, hồ sơ hay avatar. Hãy đăng ký tài khoản riêng để thử.";

// Dùng sau protectedRoute
export const rejectDemoAccount = (req, res, next) =>
  isDemoAccount(req.user) ? res.status(403).json({ message: DEMO_LOCKED_MESSAGE }) : next();
