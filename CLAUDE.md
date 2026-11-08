# CLAUDE.md

Hướng dẫn cho Claude khi làm việc trong repo này. Trả lời và viết comment bằng **tiếng Việt**.

## Mục tiêu project

Komi là app chat realtime kiểu Messenger. Chủ repo đang nâng cấp nó thành project portfolio để **ứng tuyển vị trí AI Engineer**: giữ Komi làm nền realtime, rồi xây thêm lớp AI có thể đo lường được (trợ lý trong chat, RAG trên lịch sử chat, eval, kiểm duyệt). Mỗi tính năng AI nên đi kèm số liệu đánh giá.

## Quy tắc làm việc (bắt buộc)

- **Không bao giờ `git push`**, không tạo PR, không đổi remote. Chủ repo tự push khi đã ưng ý.
- **Không `git push --force`, không `git reset --hard` trên `main`.** Không sửa trực tiếp `main`.
- Mỗi giai đoạn làm trên **một nhánh riêng** (`phase-1-chat-ux`, `phase-2-komi-ai`, ...), tách từ nhánh giai đoạn trước. Commit nhỏ, message tiếng Việt.
- Hỏi trước khi: thêm dependency lớn, đổi schema làm hỏng dữ liệu cũ, đổi kiến trúc so với lộ trình bên dưới.
- Sau mỗi thay đổi backend: chạy `npm test` trong `backend/`. Sau thay đổi frontend: `npm run build` trong `frontend/`. Báo rõ cái gì chưa kiểm chứng được.
- Không commit `.env` hay bất kỳ secret nào.

## Cấu trúc

```
backend/    Express 5 + Socket.IO + Mongoose (JavaScript, ESM)
  src/app.js            dựng Express app (routes, middleware) — import được trong test
  src/server.js         entrypoint: nạp env, kết nối DB, listen
  src/socket/index.js   Socket.IO server, online users, announceConversation()
  src/controllers/      auth, user, friend, conversation, message
  src/middlewares/      authMiddleware, conversationMiddleware (kiểm tra thành viên), friendMiddleware, rateLimit, socketMiddleware
  src/utils/            messageHelper, directConversation, conversationFormat
  scripts/seed.js       dữ liệu demo tiếng Việt
  test/                 test tích hợp (node:test + supertest + mongodb-memory-server)
frontend/   React 19 + Vite + TypeScript + Zustand + Tailwind 4 + shadcn/ui
  src/stores/           useAuthStore, useChatStore, useSocketStore, useFriendStore, ...
  src/services/         gọi API (axios instance ở src/lib/axios.ts)
  src/components/chat/  giao diện chat
```

## Lệnh thường dùng

```bash
docker compose up --build                  # cả stack: mongo, backend :5001, frontend :5173
docker compose exec backend npm run seed   # dữ liệu demo, mật khẩu chung: komi123

cd backend && npm run dev     # cần backend/.env (xem .env.example)
cd backend && npm test        # lần đầu sẽ tải binary MongoDB cho mongodb-memory-server
cd backend && npm run seed -- --reset   # XOÁ toàn bộ dữ liệu rồi seed lại

cd frontend && npm run dev
cd frontend && npm run build
```

## Những bất biến không được phá

- **Phân quyền theo thành viên:** mọi API và sự kiện socket nhận `conversationId` phải đi qua `requireConversationMember` (REST) hoặc `userIsMemberOf` (socket). Người ngoài nhận **404**, không phải 403, để không lộ conversation có tồn tại. Tính năng AI đọc lịch sử chat (tool, RAG) cũng phải lọc theo quyền của người hỏi.
- **Chat 1-1 dùng `findOrCreateDirectConversation`** với `directKey` unique; không tạo conversation direct bằng tay.
- **Cập nhật conversation khi có tin mới bằng update nguyên tử** (`updateConversationAfterCreateMessage`), không load-sửa-`save()` (gây `VersionError` khi gửi đồng thời).
- **Trả conversation ra ngoài qua `formatConversation`** (`toObject({ flattenMaps: true })`), nếu không `unreadCounts` thành `{}` khi serialize.
- **Socket lấy token qua hàm `auth`** để reconnect dùng token mới; refresh token đi qua `refreshAccessToken()` duy nhất ở `src/lib/axios.ts`.
- **Tin nhắn gửi đi dùng `clientId`** để ghép bản "đang gửi" với tin thật (từ HTTP hoặc socket, thứ tự nào cũng được).
- `dotenv/config` phải là import đầu tiên của `server.js`.
- Ô nhập tin: không gửi khi `e.nativeEvent.isComposing` (bộ gõ tiếng Việt).

## Trạng thái hiện tại

**Giai đoạn 0 — Nền tảng: đã xong** (nhánh `phase-0-foundation`)
- Vá 4 lỗ hổng phân quyền, chống trùng chat 1-1, update nguyên tử, online đa tab, rate limit, validate đăng ký.
- Optimistic UI + thử lại khi gửi lỗi; socket tự refresh token.
- Test tích hợp, Docker Compose, seed, CI (GitHub Actions), README.

Đã kiểm chứng trên máy (2026-11-09):
- `package-lock.json` backend đã cập nhật; `npm test` qua 12/12 (chạy trên Node 26).
- Frontend `npm ci` + `npm run build` qua. `frontend/.npmrc` đặt `legacy-peer-deps=true` vì `@emoji-mart/react` 1.1.1 chỉ khai báo React ≤18 (chạy được với React 19); Dockerfile frontend copy file này.
- `docker compose up --build` + seed chạy được; đã thử đăng nhập, gửi tin, đăng ký trên trình duyệt.
- Tài khoản demo: `an.nguyen`, `binh`, `chi`, `dung`, `hoa` / `komi123` (username phải 3–30 ký tự).

Chưa kiểm chứng:
- CI trên GitHub (chưa push). `ci.yml` chỉ chạy khi push lên `main` hoặc mở PR.
- Bộ test trên Node 22 (phiên bản CI và Docker dùng).

Nợ kỹ thuật đã biết:
- `npm audit` báo lỗ hổng trong dependencies (backend: 1 critical, 3 high), chưa xử lý.
- Mongoose cảnh báo option `new` của `findOneAndUpdate` đã lỗi thời (nên đổi sang `returnDocument: 'after'`).
- Bundle frontend > 500 kB, chưa code-split.
- Chưa rotate refresh token (cần grace period để không đăng xuất người dùng nhiều tab).
- CI chưa chạy `npm run lint` vì chưa biết lint có sạch không.
- Các nút trong `PrivacySettings` và toggle trạng thái online trong `PreferencesForm` chưa có logic.
- Cursor phân trang chỉ theo `createdAt`; tin trùng mili-giây có thể bị bỏ sót.

## Lộ trình

| Giai đoạn | Nội dung | Xong khi |
| --- | --- | --- |
| 1 · UX chat (tuần 2–3) | Gửi ảnh (backend đã có `imgUrl` + Cloudinary), textarea tự giãn + Shift+Enter, reply, reaction, typing indicator, avatar "đã xem" trong nhóm, render markdown + code block, hoàn thiện hoặc ẩn nút chưa có logic | Demo không còn nút bấm chết |
| 2 · Komi AI (tuần 3–4) | User hệ thống "Komi AI": DM với bot và `@komi` trong nhóm; trả lời streaming qua socket (`ai:token`, `ai:done`, nút dừng); tool calling (`search_messages`, `summarize_conversation`, `create_reminder`, `create_poll`); lớp `LLMProvider` đổi model bằng cấu hình, timeout/retry/fallback; hạn mức token mỗi user | Mọi tool tôn trọng quyền của người hỏi |
| 3 · RAG + eval (tuần 5–6) | Ingest bất đồng bộ (BullMQ + Redis) → embedding → vector store (ưu tiên MongoDB Atlas Vector Search; phương án khác: Qdrant, pgvector); hybrid search + rerank; lọc theo quyền ngay trong truy vấn; câu trả lời có trích dẫn nhảy tới tin gốc; so sánh 2–3 model embedding trên bộ câu hỏi tiếng Việt tự soạn | Có recall@k trên bộ eval, chạy trong CI |
| 4 · Hoàn thiện (tuần 7–9) | Fine-tune mô hình kiểm duyệt tiếng Việt (ví dụ PhoBERT) và so với gọi LLM; trace mỗi lần gọi LLM (ví dụ Langfuse) + dashboard chi phí; chống prompt injection từ nội dung tin nhắn; README có GIF demo, sơ đồ kiến trúc, bảng eval; deploy công khai có giới hạn chi phí | Link demo + bảng eval trong README |

Kiến trúc mục tiêu: giữ backend Node cho realtime; thêm **service Python (FastAPI)** cho toàn bộ phần AI (agent, RAG, eval, mô hình kiểm duyệt), giao tiếp với Node qua HTTP và hàng đợi Redis. Ghi mọi quyết định và đánh đổi (chọn vector store, chọn model embedding, kết quả so sánh) vào `docs/DECISIONS.md`.

Dữ liệu seed (`backend/scripts/seed.js`) được viết sẵn các chi tiết có thể hỏi lại (link staging, giờ họp, ai phụ trách phần nào, ngân sách chuyến đi) để dùng làm bộ câu hỏi eval cho RAG; khi thêm dữ liệu seed, giữ tính chất này.
