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
- **Cần kiểm tra khi bắt đầu code:** endpoint OpenAI-compatible của Gemini và tên model Flash hiện hành (xem tài liệu Gemini API).
- **Xem lại khi:** có người dùng thật, hoặc cần đưa tài liệu thật vào.
- **Nguồn:** https://geotoolbox.ai/blog/gemini-api-pricing · https://klymentiev.com/blog/gemini-api-free-tier · https://benchlm.ai/md/free-tier/groq.md · https://benchlm.ai/md/free-tier/openrouter.md

## 2026-11-11 — Giai đoạn 3 chưa dùng RAG

- **Chọn:** hỏi đáp trên file gửi trong chat bằng cách đưa cả nội dung đã trích vào prompt.
- **Vì sao:** không cần embedding, vector store hay hàng đợi; đủ cho file vài chục trang.
- **Đánh đổi:** file quá dài sẽ vượt giới hạn của model và hạn mức token free; khi đó báo giới hạn cho người dùng.
- **Xem lại khi:** làm kho tài liệu chung (Giai đoạn 4), lúc đó mới cần RAG.

## 2026-11-11 — Bỏ khỏi lộ trình

Nhắc việc, bình chọn, fine-tune mô hình kiểm duyệt (PhoBERT), BullMQ + Redis, hybrid search + rerank, service FastAPI, tìm kiếm web. Chỉ thêm lại khi dùng thật thấy cần.

## Chưa quyết

- Ai được xem kho tài liệu chung (mọi người trong app, hay theo nhóm)?
- Lưu file tài liệu ở đâu (Cloudinary đang dùng cho ảnh, hay nơi khác)?
- Model cụ thể cho chat và cho embedding.
