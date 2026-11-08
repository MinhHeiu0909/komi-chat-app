/**
 * Rate limit đơn giản theo IP, lưu trong bộ nhớ (fixed window).
 * Đủ cho một instance; khi chạy nhiều instance nên chuyển sang Redis.
 */
export const rateLimit = ({ windowMs, max, message = "Quá nhiều yêu cầu, hãy thử lại sau" }) => {
  const hits = new Map(); // ip -> { count, resetAt }

  const timer = setInterval(() => {
    const now = Date.now();
    for (const [key, entry] of hits) {
      if (entry.resetAt <= now) hits.delete(key);
    }
  }, windowMs);
  timer.unref?.();

  return (req, res, next) => {
    if (process.env.DISABLE_RATE_LIMIT === "true") return next();

    const key = req.ip ?? "unknown";
    const now = Date.now();
    const entry = hits.get(key);

    if (!entry || entry.resetAt <= now) {
      hits.set(key, { count: 1, resetAt: now + windowMs });
      return next();
    }

    entry.count += 1;

    if (entry.count > max) {
      res.set("Retry-After", Math.ceil((entry.resetAt - now) / 1000).toString());
      return res.status(429).json({ message });
    }

    next();
  };
};
