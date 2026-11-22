import KomiAvatar from "@/components/chat/KomiAvatar";

// Cột phải của trang đăng nhập/đăng ký: linh vật + giới thiệu Komi; trang đăng ký có thêm đoạn chat mẫu
// (lấy từ dữ liệu seed). Vẽ bằng JSX + SVG theo bộ màu cổ vịt & nghệ, không dùng ảnh ngoài. Ẩn trên mobile.
const AuthShowcase = ({ showChat = false }: { showChat?: boolean }) => (
  <div className="bg-gradient-primary relative hidden flex-col justify-center gap-8 p-8 text-white md:flex">
    <div className="space-y-4">
      {/* linh vật Komi: chấm "đang nhập" nhấp nháy, ngôi sao xoay (animation ở index.css, tắt khi giảm chuyển động) */}
      <svg
        viewBox="0 0 48 44"
        className="w-16 drop-shadow-md"
        aria-hidden="true"
      >
        <path
          d="M8 2h32a6 6 0 0 1 6 6v20a6 6 0 0 1-6 6H20l-9 8v-8H8a6 6 0 0 1-6-6V8a6 6 0 0 1 6-6z"
          fill="#FFFFFF"
        />
        <circle className="komi-dot" cx="13" cy="18" r="3.4" fill="#0E5A63" />
        <circle
          className="komi-dot komi-dot-2"
          cx="22"
          cy="18"
          r="3.4"
          fill="#0E5A63"
        />
        <path
          className="komi-star"
          d="M33 10.5c.6 4.6 1.6 5.6 6.2 6.2-4.6.6-5.6 1.6-6.2 6.2-.6-4.6-1.6-5.6-6.2-6.2 4.6-.6 5.6-1.6 6.2-6.2z"
          fill="#C98A1B"
        />
      </svg>
      <h2 className="text-2xl leading-snug font-bold text-balance">
        <span className="text-[hsl(var(--wordmark))]">Komi</span> - trợ lý AI
      </h2>
      <p className="text-sm text-balance text-white/80">
        Ghi nhớ và giải đáp tất cả tin nhắn của bạn.
      </p>
    </div>

    {/* đoạn chat mẫu, chỉ để minh hoạ */}
    {showChat && (
      <div className="space-y-3 text-sm" aria-hidden="true">
        <div className="max-w-[85%] space-y-1">
          <p className="text-xs text-white/70">Bình</p>
          <p className="chat-bubble-received rounded-2xl rounded-tl-md px-3.5 py-2.5">
            @komi tối thứ Ba họp mấy giờ nhỉ?
          </p>
        </div>
        <div className="ml-auto flex max-w-[90%] items-start gap-2">
          <KomiAvatar type="chat" />
          <div className="chat-ai-note space-y-1 rounded-md rounded-r-2xl px-3.5 py-2.5">
            <p>Nhóm họp online lúc 20h30 tối thứ Ba.</p>
            <p className="text-xs text-muted-foreground">
              Nguồn: nhóm Đồ án Komi
            </p>
          </div>
        </div>
      </div>
    )}
  </div>
);

export default AuthShowcase;
