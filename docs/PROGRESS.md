# Nhật ký tiến độ

Chi tiết từng giai đoạn đã làm. Bản tóm tắt nằm ở mục "Trạng thái hiện tại" trong `CLAUDE.md`.

**Giai đoạn 0 — Nền tảng: đã xong** (nhánh `phase-0-foundation`)
- Vá 4 lỗ hổng phân quyền, chống trùng chat 1-1, update nguyên tử, online đa tab, rate limit, validate đăng ký.
- Optimistic UI + thử lại khi gửi lỗi; socket tự refresh token.
- Test tích hợp, Docker Compose, seed, CI (GitHub Actions), README.

Đã kiểm chứng trên máy (2026-11-09):
- `package-lock.json` backend đã cập nhật; `npm test` qua 12/12 (chạy trên Node 26).
- Frontend `npm ci` + `npm run build` qua. `frontend/.npmrc` đặt `legacy-peer-deps=true` vì `@emoji-mart/react` 1.1.1 chỉ khai báo React ≤18 (chạy được với React 19); Dockerfile frontend copy file này.
- `docker compose up --build` + seed chạy được; đã thử đăng nhập, gửi tin, đăng ký trên trình duyệt.
- Tài khoản demo: `an.nguyen`, `binh`, `chi`, `dung`, `hoa` / `komi123` (username phải 3–30 ký tự).

- CI trên GitHub xanh (job backend chạy test trên Node 22, job frontend build); PR #1 đã merge vào `main`.
- `ci.yml` chỉ chạy khi push lên `main` hoặc mở PR — muốn CI chạy cho nhánh giai đoạn thì mở PR.
- Push từ máy: lần đầu cần chạy với `GCM_INTERACTIVE=always` để Git Credential Manager mở cửa sổ đăng nhập GitHub (shell của Claude tắt lời nhắc tương tác).

**Giai đoạn 1 — UX chat: đã xong** (nhánh `phase-1-chat-ux`; PR #2 đã merge vào `main` ngày 2026-11-10, CI xanh)
- Máy không có `gh`: PR được mở/merge qua giao diện GitHub. CI có lần lỗi "Internal server error" phía GitHub (không chạy job nào) — bấm "Re-run all jobs" là qua.
- Thứ tự: textarea tự giãn + Shift+Enter → typing indicator → reply → reaction → avatar "đã xem" trong nhóm → markdown/code block → gửi ảnh → hoàn thiện/ẩn nút chết.
- **Đã xong cả 8 việc (2026-11-10)**, mỗi việc một commit, đã thử trên trình duyệt. `npm test` backend 32/32.
- Nút chết: chủ repo chọn làm thật sửa hồ sơ (`PATCH /api/users/me`), ẩn trạng thái online (`User.showOnlineStatus`, server lọc khỏi `online-users`), đổi mật khẩu (`POST /api/users/me/password`, xoá session khác); đã bỏ "Cài đặt thông báo", "Chặn & Báo cáo", "Xoá tài khoản" và dấu "…" ở danh sách chat.
- Markdown: chủ repo đã duyệt `react-markdown` + `remark-gfm` (+ `remark-breaks` để Enter một lần vẫn xuống dòng). HTML thô hiện thành chữ, ảnh trong markdown không tải. Danh sách chat và trích dẫn reply vẫn hiện ký hiệu markdown thô.
- Gửi ảnh: tải lên trước (`POST /api/messages/images`, Cloudinary, thư mục `komi_chat/messages/<userId>`), rồi gửi tin kèm `imgUrl`; server chỉ nhận `imgUrl` là ảnh Cloudinary của app trong thư mục của chính người gửi (`isOwnMessageImageUrl`). Test thay `imageStorage` bằng bản giả.
- Khoá Cloudinary khi chạy `docker compose`: điền vào `.env` ở **thư mục gốc** (cạnh `docker-compose.yml`, đã gitignore), rồi `docker compose up -d backend`. Chạy backend trực tiếp thì dùng `backend/.env`.
- Khi thử trên trình duyệt: ảnh chụp màn hình của công cụ có thể nhỏ hơn viewport (800×600 so với 1024×768) — toạ độ bấm phải quy đổi.

## Lộ trình ban đầu (đã thay ngày 2026-11-11)

Giữ lại để tham khảo. Lý do thay đổi: `docs/DECISIONS.md`.

| Giai đoạn | Nội dung | Xong khi |
| --- | --- | --- |
| 1 · UX chat (tuần 2–3) | Gửi ảnh (backend đã có `imgUrl` + Cloudinary), textarea tự giãn + Shift+Enter, reply, reaction, typing indicator, avatar "đã xem" trong nhóm, render markdown + code block, hoàn thiện hoặc ẩn nút chưa có logic | Demo không còn nút bấm chết |
| 2 · Komi AI (tuần 3–4) | User hệ thống "Komi AI": DM với bot và `@komi` trong nhóm; trả lời streaming qua socket (`ai:token`, `ai:done`, nút dừng); tool calling (`search_messages`, `summarize_conversation`, `create_reminder`, `create_poll`); lớp `LLMProvider` đổi model bằng cấu hình, timeout/retry/fallback; hạn mức token mỗi user | Mọi tool tôn trọng quyền của người hỏi |
| 3 · RAG + eval (tuần 5–6) | Ingest bất đồng bộ (BullMQ + Redis) → embedding → vector store (ưu tiên MongoDB Atlas Vector Search; phương án khác: Qdrant, pgvector); hybrid search + rerank; lọc theo quyền ngay trong truy vấn; câu trả lời có trích dẫn nhảy tới tin gốc; so sánh 2–3 model embedding trên bộ câu hỏi tiếng Việt tự soạn | Có recall@k trên bộ eval, chạy trong CI |
| 4 · Hoàn thiện (tuần 7–9) | Fine-tune mô hình kiểm duyệt tiếng Việt (ví dụ PhoBERT) và so với gọi LLM; trace mỗi lần gọi LLM (ví dụ Langfuse) + dashboard chi phí; chống prompt injection từ nội dung tin nhắn; README có GIF demo, sơ đồ kiến trúc, bảng eval; deploy công khai có giới hạn chi phí | Link demo + bảng eval trong README |

Kiến trúc mục tiêu: giữ backend Node cho realtime; thêm **service Python (FastAPI)** cho toàn bộ phần AI (agent, RAG, eval, mô hình kiểm duyệt), giao tiếp với Node qua HTTP và hàng đợi Redis. Ghi mọi quyết định và đánh đổi (chọn vector store, chọn model embedding, kết quả so sánh) vào `docs/DECISIONS.md`.
