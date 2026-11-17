/**
 * Quyền xem chi phí AI: username nằm trong AI_ADMIN_USERNAMES (phân cách bằng dấu phẩy).
 * Không đổi schema User; muốn thêm/bớt người thì sửa biến môi trường rồi khởi động lại backend.
 */
export const aiAdminUsernames = () =>
  new Set(
    (process.env.AI_ADMIN_USERNAMES ?? "")
      .split(",")
      .map((name) => name.trim().toLowerCase())
      .filter(Boolean),
  );

export const isAiAdmin = (user) => Boolean(user?.username) && aiAdminUsernames().has(user.username.toLowerCase());

/**
 * Người không có quyền đi tiếp như thể route không tồn tại (Express trả 404 mặc định),
 * giống quy ước "người ngoài nhận 404" để không lộ có trang admin.
 * Dùng sau protectedRoute.
 */
export const requireAiAdmin = (req, res, next) => (isAiAdmin(req.user) ? next() : next("router"));
