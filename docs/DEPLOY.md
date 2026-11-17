# Deploy bản demo công khai

Một web service miễn phí trên **Render**, phục vụ cả API lẫn frontend cùng một địa chỉ; database **MongoDB Atlas M0**; file trên **Cloudinary**; model **Gemini** free tier. Không dịch vụ nào cần gắn thẻ, nên trường hợp xấu nhất là hết hạn mức (Komi AI báo thử lại sau), không phát sinh tiền. Lý do chọn: `docs/DECISIONS.md` (mục "deploy").

```
Trình duyệt ──> https://<tên>.onrender.com ──┬─ /            frontend (React đã build)
                (Render, free, Singapore)     ├─ /api/...     Express
                                              └─ /socket.io   Socket.IO
                        │
                        ├─> MongoDB Atlas M0 (Singapore, có Vector Search)
                        ├─> Cloudinary (ảnh, PDF/Word)
                        └─> Gemini API (chat + embedding, free tier)
```

Phần bạn tự làm: tạo tài khoản, điền khoá bí mật. Không đưa khoá vào git hay vào chat.

## 1. MongoDB Atlas (M0)

1. Đăng ký tại [mongodb.com/atlas](https://www.mongodb.com/atlas), tạo cluster **M0 (Free)**, nhà cung cấp AWS, vùng **Singapore (ap-southeast-1)**.
2. **Database Access:** tạo user (ví dụ `komi-app`) với quyền *Read and write to any database*. Mật khẩu nên chỉ gồm chữ và số để khỏi phải mã hoá trong URL.
3. **Network Access:** thêm `0.0.0.0/0` (Render free không có IP cố định; bảo vệ bằng mật khẩu user ở bước 2).
4. **Connect → Drivers:** chép chuỗi kết nối, thêm tên DB `komi` ngay sau `.net/`:

   ```
   mongodb+srv://komi-app:<mật khẩu>@<cluster>.mongodb.net/komi?retryWrites=true&w=majority
   ```

## 2. Dữ liệu demo

Chạy **trên máy bạn**, trỏ vào Atlas (biến trong lệnh được ưu tiên hơn `backend/.env`):

```bash
cd backend && MONGODB_CONNECTIONSTRING="<chuỗi kết nối Atlas>" npm run seed
```

Tạo 5 tài khoản demo `an.nguyen`, `binh`, `chi`, `dung`, `hoa` (mật khẩu `komi123`) và các cuộc trò chuyện mẫu. Embedding cho tra cứu do server trên Render tự tạo sau khi chạy (worker nền, vài phút).

Dữ liệu demo bị người thử làm bừa thì chạy lại với `--reset` (**xoá toàn bộ** DB `komi` trên Atlas rồi tạo lại).

## 3. Render

1. Đẩy nhánh lên GitHub và merge vào `main` (Blueprint deploy nhánh `main`, xem `render.yaml`).
2. Đăng ký tại [render.com](https://render.com) bằng GitHub, chọn **New → Blueprint**, chọn repo này. Render đọc `render.yaml` và hỏi các biến `sync: false`:

   | Biến | Giá trị |
   | --- | --- |
   | `MONGODB_CONNECTIONSTRING` | chuỗi kết nối Atlas ở bước 1 |
   | `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, `CLOUDINARY_API_SECRET` | như trong `.env` ở máy |
   | `LLM_API_KEY` | key Gemini (Google AI Studio, không bật billing) |
   | `AI_ADMIN_USERNAMES` | username tài khoản **riêng** của bạn (đăng ký sau khi deploy); để trống nếu chưa có |

   Các biến còn lại đã có sẵn trong `render.yaml`: `ACCESS_TOKEN_SECRET` do Render tự sinh, `CLIENT_URL` tự lấy địa chỉ của service (`RENDER_EXTERNAL_URL`).
3. Bấm **Apply**. Lần build đầu mất vài phút (build frontend + backend trong `Dockerfile` ở thư mục gốc).
4. Mở **Logs**, chờ các dòng:

   ```
   Liên kết CSDL thành công!
   Komi AI bật (LLM_PROVIDER=openai-compatible)
   RAG bật (EMBEDDING_PROVIDER=openai-compatible)
   server bắt đầu trên cổng ...
   ```

## 4. Kiểm tra

1. Mở `https://<tên>.onrender.com/api/health` → `{"status":"ok"}`.
2. Mở trang chủ, bấm **Điền tài khoản demo** → đăng nhập.
3. Tải lại trang: vẫn đăng nhập (cookie refresh cùng địa chỉ).
4. Chờ vài phút cho worker tạo embedding, rồi hỏi Komi AI trong nhóm "Đồ án Komi": `@komi link bản staging ở đâu?` → có câu trả lời kèm nguồn.
5. Đăng ký một tài khoản riêng, điền username đó vào `AI_ADMIN_USERNAMES` trên Render (Environment → Save, service tự khởi động lại), mở **Chi phí AI**.

## Giới hạn đã đặt (sửa trong `render.yaml` hoặc tab Environment)

| Biến | Giá trị | Ý nghĩa |
| --- | --- | --- |
| `AI_DAILY_LIMIT` | 10 | lượt hỏi Komi AI mỗi người mỗi ngày |
| `AI_GLOBAL_DAILY_LIMIT` | 200 | tổng lượt hỏi của cả app mỗi ngày |
| `SHARED_DOC_DAILY_LIMIT` | 3 | tài liệu chung mỗi người tải lên mỗi ngày |
| `DEMO_USERNAMES` | 5 tài khoản demo | không đổi được mật khẩu / hồ sơ / avatar |

Đăng ký tài khoản: tối đa 10 lần mỗi giờ mỗi IP (có sẵn trong code).

## Lưu ý khi vận hành

- **Ngủ sau 15 phút không dùng:** người mở trang đầu tiên sau đó chờ khoảng 1 phút (trang trắng trong lúc chờ). Trang đăng nhập và README đã ghi rõ. Không dùng dịch vụ ping để giữ thức.
- **Atlas M0 tự tạm dừng** nếu lâu không dùng: vào Atlas bấm Resume.
- **Vector index:** server tự tạo lúc khởi động. Nếu log báo `Không tạo được vector index`, tạo tay trong Atlas: *Atlas Search → Create Search Index → JSON Editor*, kiểu **Vector Search**, collection `komi.knowledgechunks`, tên `knowledge_vector_index`:

  ```json
  {
    "fields": [
      { "type": "vector", "path": "embedding", "numDimensions": 768, "similarity": "cosine" },
      { "type": "filter", "path": "conversationId" },
      { "type": "filter", "path": "scope" }
    ]
  }
  ```

- **Cloudinary:** bật *Settings → Security → PDF and ZIP files delivery* (không bật thì link PDF trả 401).
- **Thử image deploy trên máy trước khi đẩy lên:**

  ```bash
  docker build -t komi-render --build-arg VITE_DEMO_USERNAME=an.nguyen --build-arg VITE_DEMO_PASSWORD=komi123 .
  ```
