# Quyết định và đánh đổi

Mỗi quyết định ghi: ngày, chọn gì, vì sao, khi nào nên xem lại.

## 2026-11-11 — Đổi mục tiêu: sản phẩm trước, portfolio sau

- **Chọn:** Komi là app chat cho dân văn phòng, có AI tra cứu tài liệu. Làm sản phẩm dùng được trước; phần đo lường (eval) cho hồ sơ AI Engineer thêm sau.
- **Vì sao:** lộ trình cũ ưu tiên kỹ thuật AI (RAG, fine-tune, eval) trước khi có thứ dùng được, và thiếu tính năng cần nhất là gửi file tài liệu.
- **Nguyên tắc:** giữ tính năng ở mức đơn giản; chỉ thêm khi dùng thật thấy cần.

## 2026-11-11 — Viết phần AI trong backend Node, không tách service Python

- **Chọn:** code AI nằm trong `backend/` (Node), không thêm FastAPI, Redis hay hàng đợi.
- **Vì sao:** streaming đi thẳng qua Socket.IO sẵn có; kiểm tra quyền (`requireConversationMember`) nằm cùng chỗ; bớt một service phải chạy và deploy.
- **Đánh đổi:** hệ sinh thái AI của Python phong phú hơn (eval, xử lý tài liệu).
- **Xem lại khi:** tới Giai đoạn 4. Script eval có thể viết bằng Python chạy offline mà không cần thành service.

## 2026-11-11 — Gọi LLM không tốn tiền ở giai đoạn dev

- **Chọn:** ba lớp.
  1. Provider giả cho test và CI: không key, không mạng.
  2. Khi dev: key free tier **không gắn thẻ** (chính: Gemini qua Google AI Studio; dự phòng: Groq). Không có thẻ thì không thể bị trừ tiền; vượt hạn mức chỉ nhận lỗi 429.
  3. Một lớp `LLMProvider` theo chuẩn OpenAI-compatible, cấu hình bằng `LLM_PROVIDER`, `LLM_BASE_URL`, `LLM_API_KEY`, `LLM_MODEL`. Lên bản trả phí chỉ cần đổi biến môi trường.
- **Hạn mức free tham khảo (tra ngày 2026-11-11, đổi thường xuyên; con số thật xem trong trang quản lý của từng bên):**
  - Gemini: free tier chỉ có dòng Flash và Flash-Lite; cộng đồng ghi nhận khoảng 10 request/phút và 1.500 request/ngày.
  - Groq: giới hạn theo từng model, ví dụ `openai/gpt-oss-120b` 30 request/phút, 1.000 request/ngày, 200.000 token/ngày. Base URL kiểu OpenAI: `https://api.groq.com/openai/v1`.
  - OpenRouter: model đuôi `:free` chỉ 50 request/ngày nếu chưa từng nạp $10 — không dùng.
- **Lưu ý:** ngoài EEA, Thụy Sĩ và Anh, Google có thể dùng dữ liệu gửi qua free tier để huấn luyện model. Giai đoạn dev chỉ dùng tài liệu mẫu.
- **Đã kiểm tra (2026-11-12):** endpoint OpenAI-compatible của Gemini là `https://generativelanguage.googleapis.com/v1beta/openai/`. Model chat đã chọn: xem mục 2026-11-13 bên dưới.
- **Xem lại khi:** có người dùng thật, hoặc cần đưa tài liệu thật vào.
- **Nguồn:** https://geotoolbox.ai/blog/gemini-api-pricing · https://klymentiev.com/blog/gemini-api-free-tier · https://benchlm.ai/md/free-tier/groq.md · https://benchlm.ai/md/free-tier/openrouter.md

## 2026-11-11 — Giai đoạn 3 chưa dùng RAG

- **Chọn:** hỏi đáp trên file gửi trong chat bằng cách đưa cả nội dung đã trích vào prompt.
- **Vì sao:** không cần embedding, vector store hay hàng đợi; đủ cho file vài chục trang.
- **Đánh đổi:** file quá dài sẽ vượt giới hạn của model và hạn mức token free; khi đó báo giới hạn cho người dùng.
- **Xem lại khi:** làm kho tài liệu chung (Giai đoạn 4), lúc đó mới cần RAG.

## 2026-11-11 — Bỏ khỏi lộ trình

Nhắc việc, bình chọn, fine-tune mô hình kiểm duyệt (PhoBERT), BullMQ + Redis, hybrid search + rerank, service FastAPI, tìm kiếm web. Chỉ thêm lại khi dùng thật thấy cần.

## 2026-11-12 — Komi AI là một user hệ thống

- **Chọn:** bot là user thật trong DB (`isBot: true`), tin của bot là tin nhắn thường. Mỗi user tự có cuộc chat riêng với bot (khi AI bật); `@komi` trong nhóm thì bot tự vào nhóm rồi trả lời.
- **Vì sao:** dùng lại toàn bộ luồng tin nhắn, chưa đọc, socket, giao diện sẵn có; frontend lấy tên/avatar người gửi từ danh sách thành viên nên bot phải là thành viên.
- **Đánh đổi:** bot ở lại nhóm sau lần gọi đầu, chưa có cách mời bot ra. Bước này trả lời cả câu; streaming là việc kế tiếp.
- **Xem lại khi:** cần cho phép nhóm tắt Komi AI.

## 2026-11-12 — Hạn mức hỏi Komi AI: 20 lượt/user/ngày

- **Chọn:** mỗi lần bot gọi LLM tính một lượt cho người hỏi; mặc định 20 lượt/ngày, tính lại lúc 0h giờ Việt Nam; đổi bằng `AI_DAILY_LIMIT`. Đếm trong MongoDB (`AiUsage`), không dùng Redis.
- **Vì sao:** free tier Gemini chỉ khoảng 1.500 request/ngày cho cả app; không để một người dùng hết. Đếm theo lượt (không theo token) cho đơn giản.
- **Đánh đổi:** câu hỏi dài và ngắn tính như nhau; lỗi phía nhà cung cấp thì hoàn lượt, dừng giữa chừng thì không.
- **Xem lại khi:** theo dõi chi phí theo token ở Giai đoạn 5.

## 2026-11-12 — Tóm tắt tin chưa đọc gửi vào chat riêng với Komi AI

- **Chọn:** nút "Tóm tắt" ở danh sách chat; bản tóm tắt viết vào cuộc chat riêng của người dùng với bot, không đánh dấu đã đọc.
- **Vì sao:** mở cuộc chat ra là bị đánh dấu đã đọc ngay nên nút phải ở ngoài; "tin chưa đọc" là của riêng từng người nên bản tóm tắt chỉ người đó thấy; dùng lại luồng streaming và nút dừng sẵn có.
- **Đánh đổi:** lịch sử chat với bot lẫn các bản tóm tắt; tối đa 100 tin chưa đọc gần nhất.

## 2026-11-13 — Model chat: `gemini-3.5-flash-lite`

- **Chọn:** `LLM_MODEL=gemini-3.5-flash-lite` (free tier Google AI Studio, không gắn thẻ).
- **Vì sao:** thử bằng key của chủ repo: `gemini-3.8-flash` (Flash mới nhất) trả lời được nhưng mất hơn 60 giây cho một câu ngắn (model "suy nghĩ" trước), vượt timeout 30 giây không nhận dữ liệu của provider. `gemini-3.5-flash-lite` trả chữ đầu tiên sau khoảng 17,5 giây (đo một lần). Không có `gemini-3.8-flash-lite`, chỉ có bản `-tts`.
- **Đánh đổi:** vẫn chờ 15–20 giây mỗi câu và gần như không thấy chữ chạy dần (trả cả câu trong 1–2 đoạn). Chỉ đổi biến môi trường, không sửa code.
- **Xem lại khi:** thấy chậm quá (thử tham số `reasoning_effort` để giảm phần suy nghĩ), hoặc Google đổi danh sách model free.

## 2026-11-13 — Giai đoạn 3: file tài liệu trong chat

- **Chọn (chủ repo duyệt):**
  - Lưu file trên **Cloudinary** (cùng nơi với ảnh), thư mục `komi_chat/files/<userId>`.
  - Chỉ nhận **PDF** và **Word `.docx`** (không nhận `.doc` đời cũ), tối đa **10 MB** mỗi file.
  - Hỏi đáp trên file: đưa cả chữ đã trích vào prompt, tối đa khoảng **50.000 ký tự** mỗi file (cỡ 20–25 trang); quá thì bot báo file quá dài. PDF scan (chỉ có ảnh) thì báo không đọc được chữ, không làm OCR.
  - Thư viện trích chữ: **`pdfjs-dist`** cho PDF (trích theo từng trang để trích dẫn được số trang), **`mammoth`** cho `.docx` (trích dẫn tới tên file, không có số trang).
- **Vì sao:** dùng lại Cloudinary sẵn có, không thêm dịch vụ lưu trữ; giới hạn đủ cho hợp đồng/báo cáo thường gặp mà không vượt hạn mức token free.
- **Đánh đổi:** file dài hơn giới hạn chưa hỏi được (chờ RAG ở Giai đoạn 4).
- **Hỏi đáp (2026-11-13):** bot xét 3 file gửi gần nhất của cuộc trò chuyện (tổng ≤ 50.000 ký tự), kèm vào mọi câu hỏi trong cuộc trò chuyện đó; chưa chọn file theo câu hỏi.
- **Chưa hỏi chéo cuộc trò chuyện (2026-11-13, chủ repo chọn):** Komi AI chỉ đọc file của chính cuộc trò chuyện nơi được hỏi; file nằm trong chat 1-1 với người khác thì phải tải lại vào chat với Komi. Không thêm nút "Hỏi Komi về file này". Hỏi trên mọi cuộc trò chuyện người hỏi là thành viên để dành cho Giai đoạn 4 (RAG, lọc theo quyền trong truy vấn).
- **Xem lại khi:** làm kho tài liệu chung (Giai đoạn 4).

## Chưa quyết

- Ai được xem kho tài liệu chung (mọi người trong app, hay theo nhóm)?
- Model cho embedding (Giai đoạn 4).
