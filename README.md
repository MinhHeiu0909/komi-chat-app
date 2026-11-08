# Komi

Ứng dụng chat realtime kiểu Messenger: chat 1-1, chat nhóm, bạn bè, trạng thái online, đã xem và đếm tin chưa đọc.

**Stack:** React 19 · TypeScript · Vite · Zustand · Tailwind 4 · shadcn/ui — Node.js · Express 5 · Socket.IO · MongoDB (Mongoose) · Cloudinary

## Chạy nhanh bằng Docker

```bash
docker compose up --build
docker compose exec backend npm run seed   # tạo dữ liệu demo
```

Mở http://localhost:5173 và đăng nhập bằng `an`, `binh`, `chi`, `dung` hoặc `hoa` với mật khẩu `komi123`.

## Chạy không dùng Docker

Cần Node.js 22 và MongoDB 7 trở lên.

```bash
# backend
cd backend
cp .env.example .env        # điền ACCESS_TOKEN_SECRET, MONGODB_CONNECTIONSTRING
npm install
npm run seed                # tuỳ chọn: dữ liệu demo
npm run dev

# frontend (terminal khác)
cd frontend
cp .env.example .env
npm install
npm run dev
```

## Test

```bash
cd backend
npm test
```

Test tích hợp chạy trên MongoDB in-memory (`mongodb-memory-server`), không cần database thật. Bộ test hiện kiểm tra:

- Người ngoài cuộc trò chuyện không đọc, không gửi tin, không đánh dấu đã xem được.
- Socket chỉ cho thành viên join room, người ngoài không nhận được tin realtime.
- Nhiều request gửi tin đồng thời không tạo trùng cuộc trò chuyện 1-1.
- Dữ liệu đầu vào sai định dạng trả 400 thay vì 500.

## Kiến trúc

```
frontend (React)  ──REST + WebSocket──▶  backend (Express + Socket.IO)  ──▶  MongoDB
```

- **Xác thực:** access token JWT 30 phút trong bộ nhớ + refresh token trong cookie httpOnly, lưu ở bảng `Session` có TTL. Frontend gom các lần refresh đồng thời thành một request; socket lấy token mới mỗi lần kết nối lại.
- **Phân quyền:** mọi API và sự kiện socket theo `conversationId` đều đi qua kiểm tra thành viên (`requireConversationMember`, `userIsMemberOf`).
- **Realtime:** mỗi conversation là một room Socket.IO; mỗi user có room riêng theo `userId` để nhận sự kiện cá nhân. Một user có thể mở nhiều tab.
- **Gửi tin:** tin hiện ngay ở trạng thái "đang gửi" (optimistic UI), được ghép với tin thật qua `clientId`; gửi lỗi thì có nút thử lại.
- **Phân trang:** tin nhắn tải theo cursor (`createdAt`), cuộn ngược vô hạn.

## Lộ trình

Đang phát triển thêm trợ lý AI trong chat (streaming, tool calling) và hỏi đáp trên lịch sử chat (RAG có trích dẫn, lọc theo quyền), kèm bộ đánh giá.
