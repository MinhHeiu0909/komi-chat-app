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

**Giai đoạn 2 — Komi AI cơ bản: đã xong** (nhánh `phase-2-komi-ai`, chưa mở PR)
- **Việc 1 — lớp `LLMProvider` (2026-11-12):** `backend/src/ai/llm.js` (object `llm`: `isReady()`, `streamChat()`, `chat()`), `ai/errors.js` (`LLMError`, 3 mã: `LLM_RATE_LIMIT`, `LLM_AUTH`, `LLM_ERROR`), `ai/providers/fake.js`, `ai/providers/openaiCompatible.js` (fetch có sẵn, đọc SSE, timeout 30s không nhận byte, dừng qua `AbortSignal`, không tự gọi lại). `LLM_PROVIDER`: trống = tắt, `fake`, `openai-compatible`.
- Người hỏi bấm dừng → ném lại lỗi abort gốc (`err.name === "AbortError"`), không phải `LLMError`.
- Gemini trả 400 kèm "API key not valid" khi sai key → cũng xếp vào `LLM_AUTH` (theo mô tả lỗi phổ biến, chưa thử với key thật).
- Base URL OpenAI-compatible của Gemini: `https://generativelanguage.googleapis.com/v1beta/openai/` (đã đối chiếu tài liệu Gemini ngày 2026-11-12). Tên model chưa chọn.
- `npm test` backend 55/55 (32 cũ + 23 mới trong `test/llm.test.js`, server giả trên localhost). Chưa gọi thử nhà cung cấp thật.
- **Việc 2 — user Komi AI (2026-11-12):** `backend/src/ai/komiBot.js` + `ai/prompt.js`. User hệ thống `komi.ai` (`User.isBot`), tạo khi khởi động server hoặc lần đầu cần. Bot không đăng nhập, không tìm, không kết bạn được.
  - Chat riêng: khi AI bật, `GET /api/conversations` tự tạo cuộc chat 1-1 với bot (qua `findOrCreateDirectConversation`); nhắn cho bot không cần kết bạn (`checkFriendship` cho qua khi người nhận là bot).
  - Nhóm: tin có `@komi` (đứng riêng) → bot tự vào nhóm (update nguyên tử, phát `conversation-participants`), trả lời kèm trích dẫn câu hỏi. AI tắt thì bỏ qua `@komi`.
  - Trả lời cả câu bằng `llm.chat()` ở nền (không chặn request gửi tin), có `typing` của bot; lỗi LLM → bot gửi câu báo lỗi thân thiện. Prompt: 20 tin gần nhất (tối đa 12.000 ký tự) của đúng conversation đó, tin nhóm có dạng "Tên: nội dung", system prompt nói rõ tin nhắn là dữ liệu.
  - `createAndEmit` chuyển sang `utils/messageHelper.js` (`createMessageAndEmit`) để bot dùng chung.
  - Frontend: chỉ thêm xử lý `conversation-participants` trong `useSocketStore`.
  - `npm test` backend 68/68 (13 test mới trong `test/komiBot.test.js`); `npm run build` frontend qua. **Chưa thử trên trình duyệt** (Docker không chạy lúc làm).
  - Chưa xử lý: gửi nhiều tin liên tiếp thì bot trả lời từng tin, song song; chưa có hạn mức.
- **Việc 3 — streaming qua socket + nút dừng (2026-11-12):** bot trả lời bằng `llm.streamChat()`, phát cho room: `ai:start { streamId, botId, askerId }` → `ai:token` → `new-message` (tin thật, `clientId = streamId`) → `ai:done { messageId, stopped }`. Bỏ sự kiện `typing` của bot.
  - Dừng: client gửi `ai:stop { streamId }` (ack `{ ok }`); chỉ người hỏi dừng được (`backend/src/ai/streams.js`, lưu trong bộ nhớ). Dừng giữa chừng thì lưu phần đã có kèm "_(Đã dừng)_"; dừng trước khi có chữ thì không lưu tin, `messageId: null`. Lỗi giữa chừng thì lưu phần đã có kèm câu báo lỗi.
  - Frontend: `aiStreams` trong `useSocketStore`, `components/chat/AiStreamBubbles.tsx` (bong bóng chữ chạy dần, nút "Dừng" chỉ người hỏi thấy); bong bóng biến mất khi tin thật tới hoặc `ai:done`/mất kết nối.
  - `npm test` backend 72/72 (4 test mới về streaming/dừng); `npm run build` frontend qua.
  - **Đã thử trên trình duyệt** (MongoDB tạm trong bộ nhớ + `LLM_PROVIDER=fake`, vì Docker không chạy): chat riêng với Komi AI thấy chữ chạy dần, nút "Dừng" hiện rồi bong bóng được thay bằng tin thật, không trùng; `@komi` trong nhóm thì bot vào nhóm (4 → 5 thành viên) và trả lời kèm trích dẫn. Chưa bấm thử nút "Dừng" trên trình duyệt (provider giả trả lời quá nhanh); dừng đã có test backend.
- **Việc 4 — hạn mức mỗi user/ngày (2026-11-12):** chủ repo chọn 20 lượt/ngày, tính lại lúc 0h giờ Việt Nam; đổi bằng `AI_DAILY_LIMIT` (thêm vào `.env.example` và `docker-compose.yml`).
  - `backend/src/models/AiUsage.js` (`userId`, `day` "YYYY-MM-DD" giờ VN, `count`; unique `(userId, day)`; tự xoá sau 7 ngày) + `backend/src/ai/quota.js` (`takeQuota` nguyên tử: chỉ `$inc` khi `count < limit`, hết lượt thì upsert vướng unique index; `refundQuota`).
  - Mỗi lần bot gọi LLM tính một lượt cho người hỏi (dừng giữa chừng vẫn tính); lỗi phía nhà cung cấp/server thì hoàn lượt; AI tắt thì không tính.
  - Hết lượt: chỉ người hỏi nhận `ai:error { conversationId, message }` (frontend hiện toast); không gọi LLM, không lưu tin, bot không vào nhóm.
  - `npm test` backend 80/80 (5 test trong `test/quota.test.js`, 3 test tích hợp trong `test/komiBot.test.js`); `npm run build` frontend qua. Chưa thử toast trên trình duyệt.
- **Việc 5 — tóm tắt tin chưa đọc (2026-11-12):** chủ repo chọn nút "Tóm tắt" ở danh sách chat (mở cuộc chat ra là bị đánh dấu đã đọc ngay, nên nút phải ở ngoài).
  - `POST /api/conversations/:conversationId/summary` (qua `requireConversationMember`): lấy `unreadCounts` của người hỏi (tối đa 100 tin, 12.000 ký tự), tốn 1 lượt, trả 202 `{ conversationId (chat với bot), count }`; bản tóm tắt stream vào cuộc chat riêng với Komi AI, có tiêu đề "Tóm tắt N tin chưa đọc trong …". Không đánh dấu đã đọc. Lỗi: 404 người ngoài, 400 không có tin chưa đọc / chat với bot, 429 hết lượt, 503 AI tắt.
  - `komiBot.js`: tách phần streaming thành `streamBotReply` dùng chung cho trả lời thường và tóm tắt. `prompt.js`: `prepareSummary` (tin dạng "[dd/MM HH:mm] Tên: nội dung", giờ VN).
  - Participants trả ra có `isBot` (frontend ẩn nút tóm tắt ở chat với bot).
  - Frontend: `SummarizeButton.tsx` trên thẻ chat có tin chưa đọc; bấm thì mở cuộc chat với Komi AI. Cuộc chat với bot còn trống vẫn hiện bong bóng đang trả lời.
  - `npm test` backend 84/84 (4 test mới); `npm run build` frontend qua.
  - **Đã thử trên trình duyệt** (MongoDB tạm + `LLM_PROVIDER=fake`, `AI_DAILY_LIMIT=2`): nút chỉ hiện ở nhóm có tin chưa đọc, bấm thì mở chat với Komi AI có bản tóm tắt, nhóm vẫn giữ tin chưa đọc; lần thứ 3 hiện toast hết lượt; nhắn cho bot khi hết lượt cũng hiện toast (`ai:error`), bot không trả lời.
  - Danh sách chat hiện ký hiệu markdown thô của bản tóm tắt (`**Tóm tắt…`), giống hạn chế đã có với markdown.
- **Thử với Gemini thật (2026-11-13):** key free tier của chủ repo gọi được API (liệt kê 63 model). `gemini-3.8-flash` mất hơn 60 giây → chọn `gemini-3.5-flash-lite` (khoảng 17,5 giây tới chữ đầu tiên). Chủ repo chạy app với `npm run dev` + MongoDB qua `docker compose up -d mongo` và xác nhận Komi AI hoạt động. Chi tiết ở `docs/DECISIONS.md`.
- **Giai đoạn 2 xong:** `npm test` backend 84/84, `npm run build` frontend qua. Còn chủ repo push nhánh và mở PR vào `main`.

**Giai đoạn 3 — Tài liệu trong chat: đang làm** (nhánh `phase-3-chat-documents`, tách từ `main` sau PR #3)
- Quyết định đã chốt (Cloudinary, PDF/.docx ≤ 10MB, tối đa ~50.000 ký tự đưa vào prompt, `pdfjs-dist` + `mammoth`): `docs/DECISIONS.md`.
- **Việc 1 — gửi file PDF/Word trong chat (2026-11-13):**
  - Model mới `ChatFile` (`uploaderId`, `url`, `publicId`, `name`, `size`, `kind`); `Message.file` là bản trích `{ fileId, url, name, size, kind }`. Không đổi dữ liệu cũ.
  - `POST /api/messages/files` (multer 10MB, rate limit 30 lần/10 phút): nhận dạng theo nội dung file (`%PDF-`; zip có `word/document.xml`), không tin đuôi file; tải lên Cloudinary `resource_type: "raw"`, thư mục `komi_chat/files/<userId>`, public_id ngẫu nhiên; tên gốc (sửa lỗi font tiếng Việt của multer) lưu ở DB.
  - Gửi tin kèm `fileId`: server tìm theo `fileId` + `uploaderId` nên không gửi được file của người khác. Danh sách chat / trích dẫn hiện "📎 tên file"; prompt của bot ghi `[file: tên]`.
  - Frontend: nút đính kèm (kẹp giấy) nhận cả ảnh lẫn PDF/Word; tin đang gửi hiện thẻ file; thẻ file trong bong bóng mở link Cloudinary.
  - `npm test` backend 94/94 (10 test mới trong `test/messageFile.test.js`, kho lưu giả); `npm run build` frontend qua.
  - **Chưa thử trên trình duyệt / với Cloudinary thật** (`backend/.env` chưa có khoá Cloudinary). Cần kiểm tra: tài khoản Cloudinary free có thể chặn tải file PDF theo mặc định; nếu link file trả 401 thì bật "Allow delivery of PDF and ZIP files" trong Settings → Security của Cloudinary.

## Lộ trình ban đầu (đã thay ngày 2026-11-11)

Giữ lại để tham khảo. Lý do thay đổi: `docs/DECISIONS.md`.

| Giai đoạn | Nội dung | Xong khi |
| --- | --- | --- |
| 1 · UX chat (tuần 2–3) | Gửi ảnh (backend đã có `imgUrl` + Cloudinary), textarea tự giãn + Shift+Enter, reply, reaction, typing indicator, avatar "đã xem" trong nhóm, render markdown + code block, hoàn thiện hoặc ẩn nút chưa có logic | Demo không còn nút bấm chết |
| 2 · Komi AI (tuần 3–4) | User hệ thống "Komi AI": DM với bot và `@komi` trong nhóm; trả lời streaming qua socket (`ai:token`, `ai:done`, nút dừng); tool calling (`search_messages`, `summarize_conversation`, `create_reminder`, `create_poll`); lớp `LLMProvider` đổi model bằng cấu hình, timeout/retry/fallback; hạn mức token mỗi user | Mọi tool tôn trọng quyền của người hỏi |
| 3 · RAG + eval (tuần 5–6) | Ingest bất đồng bộ (BullMQ + Redis) → embedding → vector store (ưu tiên MongoDB Atlas Vector Search; phương án khác: Qdrant, pgvector); hybrid search + rerank; lọc theo quyền ngay trong truy vấn; câu trả lời có trích dẫn nhảy tới tin gốc; so sánh 2–3 model embedding trên bộ câu hỏi tiếng Việt tự soạn | Có recall@k trên bộ eval, chạy trong CI |
| 4 · Hoàn thiện (tuần 7–9) | Fine-tune mô hình kiểm duyệt tiếng Việt (ví dụ PhoBERT) và so với gọi LLM; trace mỗi lần gọi LLM (ví dụ Langfuse) + dashboard chi phí; chống prompt injection từ nội dung tin nhắn; README có GIF demo, sơ đồ kiến trúc, bảng eval; deploy công khai có giới hạn chi phí | Link demo + bảng eval trong README |

Kiến trúc mục tiêu: giữ backend Node cho realtime; thêm **service Python (FastAPI)** cho toàn bộ phần AI (agent, RAG, eval, mô hình kiểm duyệt), giao tiếp với Node qua HTTP và hàng đợi Redis. Ghi mọi quyết định và đánh đổi (chọn vector store, chọn model embedding, kết quả so sánh) vào `docs/DECISIONS.md`.
