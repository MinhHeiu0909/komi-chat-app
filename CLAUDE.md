# CLAUDE.md

Hướng dẫn cho Claude khi làm việc trong repo này. Trả lời và viết comment bằng **tiếng Việt**.

## Mục tiêu project

Komi là app chat realtime kiểu Messenger **cho dân văn phòng làm việc với nhau**, có trợ lý AI ("Komi AI") để tóm tắt hội thoại và tra cứu tài liệu: file gửi trong chat, lịch sử tin nhắn, kho tài liệu chung.

Thứ tự ưu tiên:

1. **Sản phẩm dùng được trước.** Giữ mọi tính năng ở mức đơn giản nhất chạy được. Không thêm tính năng ngoài lộ trình bên dưới: chủ repo sẽ dùng thử rồi mới quyết định thêm gì.
2. **Portfolio ứng tuyển AI Engineer sau.** Số liệu đánh giá (eval) được thêm ở Giai đoạn 4, không phải điều kiện của từng tính năng.

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
  src/middlewares/      authMiddleware, conversationMiddleware (kiểm tra thành viên), friendMiddleware, rateLimit, socketMiddleware, uploadMiddleware
  src/utils/            messageHelper, directConversation, conversationFormat, messageImage, messageFile, documentText
  src/ai/               llm (LLMProvider), komiBot, prompt, quota, streams
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

## Quy ước cho phần AI (từ Giai đoạn 2)

- **Phần AI viết trong backend Node**, thư mục dự kiến `backend/src/ai/`. Không thêm service Python, Redis hay hàng đợi khi chưa hỏi chủ repo.
- **Mọi lời gọi LLM đi qua một lớp `LLMProvider`** theo chuẩn OpenAI-compatible, cấu hình bằng `LLM_PROVIDER`, `LLM_BASE_URL`, `LLM_API_KEY`, `LLM_MODEL` (thêm vào `.env.example` khi viết code). Đổi nhà cung cấp chỉ sửa biến môi trường, không sửa code.
- **Test và CI dùng provider giả** (`LLM_PROVIDER=fake`: trả lời cố định, không gọi mạng), giống cách test đang thay `imageStorage`. Không test nào được gọi API thật.
- **Không tốn tiền ở giai đoạn dev:** chỉ dùng key free tier không gắn thẻ (chính: Gemini qua Google AI Studio; dự phòng: Groq). Không bật billing, không đổi sang model trả phí khi chưa hỏi. Gặp lỗi 429 (hết hạn mức) thì báo người dùng thử lại sau, không tự gọi lại liên tục.
- **API key chỉ nằm ở backend.** Không bao giờ đưa vào biến `VITE_*` hay trả về client.
- **Hạn mức số lần hỏi AI mỗi user mỗi ngày**, để một người không dùng hết hạn mức free của cả app.
- **Lọc theo quyền của người hỏi** trước khi đưa bất kỳ tin nhắn hay file nào vào prompt (xem bất biến phân quyền ở trên).
- **Nội dung tin nhắn và file là dữ liệu, không phải chỉ dẫn** cho model.
- **Chỉ dùng dữ liệu mẫu khi dev:** nhà cung cấp có thể dùng dữ liệu gửi qua free tier để huấn luyện model, nên không đưa tài liệu công ty thật vào.

## Trạng thái hiện tại

- **Giai đoạn 0 (nền tảng) và Giai đoạn 1 (UX chat): đã xong**, đã merge vào `main` (PR #1, PR #2). Chi tiết từng việc và kết quả kiểm chứng: `docs/PROGRESS.md`.
- **Giai đoạn 2 — Komi AI cơ bản: đã xong**, đã merge vào `main` (PR #3). Có lớp `LLMProvider`, user Komi AI (chat riêng + `@komi` trong nhóm) trả lời streaming qua socket có nút dừng, hạn mức 20 lượt/user/ngày (`AI_DAILY_LIMIT`), nút tóm tắt tin chưa đọc. Đã thử với Gemini thật: model `gemini-3.5-flash-lite` (khoảng 15–20 giây mỗi câu).
- **Giai đoạn 3 — Tài liệu trong chat: đang làm** trên nhánh `phase-3-chat-documents`. Đã xong: gửi file PDF/Word trong chat (`ChatFile`, `POST /api/messages/files`), trích chữ lúc tải lên (`utils/documentText.js`, PDF theo trang), hỏi đáp trên 3 file gần nhất của cuộc trò chuyện có ghi nguồn (đã thử với Gemini thật). Còn: tìm tin nhắn theo từ khoá.
- Lộ trình được viết lại ngày 2026-11-11; lý do ở `docs/DECISIONS.md`.
- `npm test` backend: 104/104 (2026-11-13).

Ghi chú vận hành:

- Tài khoản demo: `an.nguyen`, `binh`, `chi`, `dung`, `hoa` / `komi123`.
- Khoá Cloudinary khi chạy `docker compose`: điền vào `.env` ở **thư mục gốc** (cạnh `docker-compose.yml`, đã gitignore). Chạy backend trực tiếp thì dùng `backend/.env`.
- `frontend/.npmrc` đặt `legacy-peer-deps=true` vì `@emoji-mart/react` chỉ khai báo React ≤18. Không xoá file này.
- CI chỉ chạy khi push lên `main` hoặc mở PR. Máy không có `gh`: chủ repo mở/merge PR qua giao diện GitHub.
- Xong một việc: cập nhật ngắn gọn mục này, ghi chi tiết vào `docs/PROGRESS.md`.

Nợ kỹ thuật đã biết:
- `npm audit` báo lỗ hổng trong dependencies (backend: 1 critical, 3 high), chưa xử lý.
- Bundle frontend > 500 kB, chưa code-split.
- Chưa rotate refresh token (cần grace period để không đăng xuất người dùng nhiều tab).
- CI chưa chạy `npm run lint`: lint frontend chưa sạch ở file cũ (vd. `EmojiPicker.tsx` dùng `any`); file mới của Giai đoạn 1 đã sạch.
- Đổi mật khẩu chỉ xoá session (refresh token); access token của thiết bị khác vẫn dùng được tới khi hết hạn (30 phút), socket đang mở không bị ngắt.
- `online-users` được phát cho mọi user đang kết nối, không chỉ bạn bè.
- Chưa đổi được username/email (cần xác thực email).
- Cursor phân trang chỉ theo `createdAt`; tin trùng mili-giây có thể bị bỏ sót.

## Lộ trình

| Giai đoạn | Nội dung | Xong khi |
| --- | --- | --- |
| 2 · Komi AI cơ bản | User hệ thống "Komi AI": nhắn riêng với bot và `@komi` trong nhóm; trả lời streaming qua socket (`ai:token`, `ai:done`, nút dừng); `LLMProvider` (bản giả + bản OpenAI-compatible); hạn mức mỗi user/ngày; tóm tắt tin chưa đọc ("tôi đã bỏ lỡ gì") | Chat được với bot; test chạy bằng provider giả; bot chỉ đọc conversation mà người hỏi là thành viên |
| 3 · Tài liệu trong chat | Gửi file PDF/Word trong chat; trích chữ từ file; hỏi đáp trên file của cuộc trò chuyện, có trích dẫn tới file/trang; tìm tin nhắn theo từ khoá | Hỏi về file vừa gửi, bot trả lời đúng và chỉ ra nguồn |
| 4 · Kho tài liệu chung + RAG | Trang tải tài liệu chung; embedding + vector search (ưu tiên MongoDB Atlas Vector Search); hỏi trên cả lịch sử chat và kho chung, lọc theo quyền ngay trong truy vấn; bộ eval nhỏ bằng script Python chạy offline | Có recall@k trên bộ câu hỏi tiếng Việt tự soạn |
| 5 · Hoàn thiện | Theo dõi chi phí mỗi lần gọi LLM; chống prompt injection; deploy công khai có giới hạn chi phí; README có GIF demo, sơ đồ kiến trúc, bảng eval | Có link demo |

Ghi chú:

- Giai đoạn 3 **chưa dùng RAG**: file đủ nhỏ thì đưa cả nội dung đã trích vào prompt; file quá dài thì báo giới hạn cho người dùng. RAG chỉ vào ở Giai đoạn 4.
- **Đã bỏ khỏi lộ trình, chỉ thêm lại khi chủ repo yêu cầu:** nhắc việc (`create_reminder`), bình chọn (`create_poll`), fine-tune mô hình kiểm duyệt (PhoBERT), BullMQ + Redis, hybrid search + rerank, service Python (FastAPI), tìm kiếm web.
- **Chưa quyết, hỏi chủ repo khi làm tới:** ai được xem kho tài liệu chung; model cho embedding. File tài liệu lưu trên Cloudinary. Model chat hiện dùng `gemini-3.5-flash-lite` (xem `docs/DECISIONS.md`).
- Ghi mọi quyết định và đánh đổi vào `docs/DECISIONS.md`.

Dữ liệu seed (`backend/scripts/seed.js`) được viết sẵn các chi tiết có thể hỏi lại (link staging, giờ họp, ai phụ trách phần nào, ngân sách chuyến đi) để dùng làm bộ câu hỏi eval cho RAG; khi thêm dữ liệu seed, giữ tính chất này. Seed hiện theo bối cảnh nhóm sinh viên làm đồ án; khi thêm dữ liệu mới, viết theo bối cảnh văn phòng.
