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

## 2026-11-14 — Giai đoạn 4: kho tài liệu chung và RAG

- **Chọn (chủ repo duyệt):**
  - **Kho tài liệu chung: mọi người trong app xem được.** Coi cả app là một công ty. Ai cũng tải lên được, chỉ người tải lên xoá được. Lưu sẵn trường phạm vi trên từng tài liệu để sau này thêm quyền theo nhóm mà không đổi schema.
  - **Model embedding: `gemini-embedding-2`**, dùng lại key Gemini (Google AI Studio, free tier, không gắn thẻ), gọi qua endpoint OpenAI-compatible (`/embeddings`), cấu hình bằng biến môi trường riêng cho embedding. Test dùng embedding giả (không gọi mạng).
  - **Vector search: `mongodb/mongodb-atlas-local` khi dev** (có `mongod` + `mongot`, chạy `$vectorSearch` mà không cần tài khoản cloud), thay `mongo:7` trong `docker-compose.yml`. Test vẫn dùng `mongodb-memory-server`, kèm bản tìm kiếm giả tính cosine trong JS. Deploy ở Giai đoạn 5 dùng Atlas M0.
  - **Phạm vi hỏi:** hỏi `@komi` trong nhóm thì chỉ tìm trong nhóm đó + kho chung; chat riêng với Komi thì tìm trên mọi cuộc trò chuyện người hỏi là thành viên + kho chung. Lọc theo quyền ngay trong truy vấn vector (filter `conversationId`).
- **Vì sao:** một key cho cả chat và embedding, không thêm dependency hay dịch vụ mới; Atlas Local cho đúng API của Atlas Vector Search nên lên Atlas M0 không phải sửa code. Câu trả lời trong nhóm thì cả nhóm đọc được, nên không lấy nội dung từ chat riêng của người hỏi.
- **Đánh đổi:**
  - Google không công bố hạn mức free cố định cho embedding (nguồn ngoài nói khoảng 1.000 request/ngày, theo project); phải xem trong AI Studio và gom nhiều đoạn vào một request. Dữ liệu gửi qua free tier có thể bị dùng để huấn luyện: chỉ dùng dữ liệu mẫu.
  - Trang tài liệu của Google không ghi rõ tiếng Việt (chỉ ghi "hơn 100 ngôn ngữ"); bộ eval tiếng Việt sẽ kiểm chứng.
  - Đổi image DB: dữ liệu trong volume `mongo-data` cũ cần seed lại; test không chạy được `$vectorSearch` thật.
- **Xem lại khi:** chạm hạn mức embedding (cân nhắc model chạy ngay trong Node), hoặc cần quyền theo nhóm cho kho chung.
- **Đo thật (2026-11-14):** free tier của `gemini-embedding-2` là **100 đoạn/phút**, tính theo từng đoạn trong batch (không phải theo request); mỗi request tối đa 100 đoạn. Hệ quả cho bước chia đoạn: không embedding từng tin nhắn riêng lẻ mà gom nhiều tin liền nhau thành một đoạn, và việc embedding chạy nền phải giãn nhịp theo hạn mức.
- **Cấu hình embedding (2026-11-14):** biến `EMBEDDING_*` riêng, mặc định 768 chiều. Không đặt `EMBEDDING_BASE_URL` thì dùng chung nhà cung cấp và key với chat; đặt riêng thì chỉ dùng `EMBEDDING_API_KEY`, không gửi key của chat sang nhà cung cấp khác. Chưa thêm tiền tố nhiệm vụ của Gemini (`task: search result | query: ...`) vì chỉ đúng với một model; để bộ eval ở bước 6 đo xem có đáng không.

## 2026-11-14 — Giai đoạn 4, bước 3: chia đoạn và tạo index

- **Chọn (chủ repo duyệt):**
  - **Collection mới `KnowledgeChunk`**, không sửa collection cũ: mỗi đoạn có loại nguồn (`message` / `chatFile` / `sharedDoc`), `conversationId` (`null` với kho chung), chữ, `embedding` và thông tin ghi nguồn (tin đầu–cuối, hoặc file + trang). Một file gửi vào hai cuộc trò chuyện thì có hai bộ đoạn, để bộ lọc quyền chỉ là `conversationId ∈ [được phép]` hoặc kho chung.
  - **Tin nhắn: gom nhiều tin liền nhau** thành một đoạn (tối đa 10 tin hoặc khoảng 1.000 ký tự; hai tin cách nhau hơn 1 giờ thì sang đoạn mới). Nguồn trỏ tới tin đầu của đoạn.
  - **File: khoảng 1.000 ký tự mỗi đoạn, chồng 150 ký tự, không vắt qua hai trang** (giữ số trang để ghi nguồn).
  - **Chạy nền trong backend** (mỗi 30 giây, không Redis/hàng đợi), tối đa 60 đoạn/phút để chừa 40 cho embedding câu hỏi; gặp 429 thì nghỉ tới phút sau. Đoạn tin chỉ đóng khi đủ 10 tin hoặc cuộc trò chuyện im 10 phút. Dữ liệu có sẵn được làm dần.
  - **Không index** tin của Komi AI và chữ trong chat riêng với Komi; file tải vào chat với Komi vẫn được index.
  - Hàm `searchKnowledge` lọc theo quyền ngay trong `$vectorSearch` (danh sách thành viên tại lúc hỏi). Test dùng bản tìm kiếm giả (cosine trong JS) vì `mongodb-memory-server` không có `$vectorSearch`.
- **Vì sao:** gom tin giữ được ngữ cảnh hỏi–đáp ("mấy giờ họp?" + "9h nhé") và tốn ít hạn mức (100 đoạn/phút); chạy nền chịu được 429 mà không mất việc. Câu trả lời của bot có thể sai, index lại sẽ làm bot tự trích chính nó.
- **Đánh đổi:** tin vừa gửi chưa tìm chéo được ngay (tới 10 phút); cuộc trò chuyện hiện tại vẫn có 20 tin gần nhất trong prompt. Nguồn của tin nhắn chỉ trỏ tới đầu đoạn, không đúng từng tin. File gửi nhiều nơi tốn embedding nhiều lần.
- **Xem lại khi:** chạy nhiều backend cùng lúc (cần khoá để hai worker không làm trùng), hoặc bộ eval cho thấy cỡ đoạn chưa hợp.

## 2026-11-14 — Giai đoạn 4, bước 4: kho tài liệu chung

- **Chọn (chủ repo duyệt):**
  - **Model mới `SharedDocument`** (giống `ChatFile`, thêm `chunkedAt`), không đụng `ChatFile`. File lưu Cloudinary `raw`, thư mục `komi_chat/shared`; nhận PDF / `.docx`, tối đa 10 MB như chat.
  - **API `/api/documents`** cho mọi người đã đăng nhập: `GET` danh sách (mới nhất trước, kèm người tải, trạng thái index), `POST` tải lên, `DELETE /:id` chỉ người tải lên (người khác 403: kho chung ai cũng thấy nên 404 không che giấu được gì). Xoá thì xoá cả file trên Cloudinary và các đoạn RAG.
  - **Index tối đa 50.000 ký tự mỗi tài liệu** (~20–25 trang, ~60 đoạn, khoảng 1 phút với 60 đoạn/phút), bằng giới hạn hỏi đáp trên file chat. Dài hơn thì vẫn lưu file nhưng chỉ index phần đầu, giao diện ghi rõ.
  - **Tối đa 10 tài liệu chung mỗi người mỗi ngày** (đổi bằng biến môi trường), đếm trong MongoDB, tính lại lúc 0h giờ Việt Nam như hạn mức hỏi AI.
  - **Worker:** pha 1 thêm việc chia tài liệu chung chưa chia (`scope: "shared"`, `conversationId: null`); pha embedding và `searchKnowledge` dùng lại.
  - **Giao diện:** trang riêng `/documents`, mục "Tài liệu chung" trên sidebar; khung bên phải hiện danh sách thay cho khung chat. Nút tải lên, xoá tài liệu của mình, nhãn trạng thái (đang xử lý x/y đoạn, sẵn sàng, không đọc được chữ); tự làm mới mỗi 5 giây khi còn tài liệu đang xử lý.
- **Vì sao:** chủ repo chọn giới hạn 50.000 ký tự để an toàn cho hạn mức embedding (hạn mức ngày chưa biết); giới hạn số lần tải lên để một người không dùng hết hạn mức của cả app.
- **Đánh đổi:** tài liệu dài hơn ~25 trang chỉ tìm được phần đầu. Ai cũng xem và tải được mọi tài liệu chung.
- **Xem lại khi:** biết hạn mức embedding theo ngày (có thể nới giới hạn ký tự), hoặc cần quyền theo nhóm.

## 2026-11-14 — Giai đoạn 4, bước 5: nối RAG vào Komi AI

- **Chọn (chủ repo duyệt):**
  - **Tra cứu ở mọi câu hỏi** (không dùng tool calling): mỗi câu hỏi thêm 1 embedding (~1 giây), không thêm lượt gọi LLM. Câu hỏi không liên quan thì bot bỏ qua đoạn tìm được theo hướng dẫn trong prompt.
  - **Phạm vi** như đã chốt: `@komi` trong nhóm → nhóm đó + kho chung; chat riêng với Komi → mọi cuộc trò chuyện người hỏi là thành viên + kho chung (`searchKnowledge`).
  - **Câu hỏi nối tiếp:** tìm bằng câu hỏi hiện tại ghép với câu hỏi trước đó của cùng người trong cuộc trò chuyện (bỏ `@komi`); không nhờ LLM viết lại câu hỏi.
  - **File của Giai đoạn 3:** giữ toàn văn **1 file gần nhất** của cuộc trò chuyện (≤ 50.000 ký tự, để "tóm tắt file vừa gửi" vẫn đọc được cả file); bỏ giới hạn "3 file gần nhất", các file khác đi qua RAG.
  - **Đưa vào prompt:** 6 đoạn điểm cao nhất, tổng tối đa khoảng 8.000 ký tự, trong một khối dữ liệu ở vai người dùng (không nằm trong system prompt), mỗi đoạn kèm nhãn nguồn sẵn (tin nhắn: tên cuộc trò chuyện + thời gian; file: tên file + trang; kho chung: tên tài liệu + trang).
  - **Ghi nguồn bằng chữ thường** trong câu trả lời, vd. `(Nguồn: Nhóm "Đồ án Komi", 05/11/2026 09:00)`; không sửa frontend.
  - **Lỗi tra cứu** (embedding tắt, 429, lỗi khác): vẫn trả lời dựa trên lịch sử chat; khi tra cứu lỗi (không phải khi tắt) thì kèm dòng "_Chưa tra cứu được tài liệu lúc này_". Hạn mức hỏi AI vẫn tính 1 lượt.
- **Vì sao:** `gemini-3.5-flash-lite` mất ~15 giây mỗi lượt gọi; tool calling hay viết lại câu hỏi bằng LLM sẽ gấp đôi thời gian chờ và hạn mức. Giữ toàn văn file gần nhất để không mất khả năng tóm tắt cả file của Giai đoạn 3.
- **Đánh đổi:** câu hỏi chào hỏi cũng tốn 1 embedding; ghép câu hỏi trước đôi khi kéo theo chủ đề cũ; nguồn chưa bấm được.
- **Xem lại khi:** bộ eval (bước 6) cho thấy cần đổi k / cỡ đoạn / cách ghép câu hỏi; chủ repo muốn nguồn bấm được.
- **Sửa ngày 2026-11-14 sau eval (chủ repo chọn): bỏ ghép câu hỏi trước**, câu tìm chỉ là câu hỏi hiện tại (bỏ `@komi`). Eval: recall@1 51% → 88%, MRR 0,74 → 0,92; trong nhóm tin trước đó của người hỏi thường là chat không liên quan. Câu nối tiếp vẫn nằm trong 6 đoạn đầu khi không ghép (`eval/README.md`).

## 2026-11-14 — Giai đoạn 4, bước 6: bộ eval cho tìm kiếm (RAG)

- **Chọn:**
  - **Bộ dữ liệu eval riêng**, bối cảnh văn phòng (3–4 nhóm + chat 1-1, ~120–150 tin, 2–3 tài liệu kho chung dạng chữ), nạp vào DB riêng `komi_eval` trên cùng Atlas Local; không đụng dữ liệu demo, không cần Cloudinary. Seed hiện tại (54 tin, 19 đoạn) quá nhỏ để phân biệt cấu hình.
  - **~40 câu hỏi tiếng Việt** (Claude soạn, chủ repo duyệt): mỗi câu ghi người hỏi, nơi hỏi (nhóm / chat riêng với Komi), loại câu (tin nhắn, tài liệu chung, tìm chéo cuộc trò chuyện, câu nối tiếp, câu viết khác chữ với nguồn) và 1–2 **chuỗi bằng chứng**. Thêm vài câu **kiểm tra rò rỉ**: người hỏi không có quyền thì số đoạn lộ ra phải bằng 0.
  - **"Tìm đúng"** = đoạn tìm được chứa chuỗi bằng chứng (chủ repo chọn): không phụ thuộc id hay cách chia đoạn, so được các cấu hình chia đoạn khác nhau.
  - **Node tra cứu, Python tính số** (chủ repo chọn): script Node chạy đúng code thật (`buildRetrievalQuery` + `searchKnowledge`) cho từng câu, xuất JSON; script Python chỉ dùng thư viện chuẩn, đọc JSON, tính recall@1/3/5/6 và MRR (tách theo loại câu), in bảng Markdown. Python không gọi mạng.
  - **Biến thể so sánh** (Claude chọn, chủ repo không có ưu tiên): cấu hình hiện tại; **không ghép câu hỏi trước** (chỉ tốn embedding câu hỏi); **đoạn tin 5 tin** thay vì 10 (tốn embedding lại phần tin nhắn). Để sau: tiền tố nhiệm vụ của Gemini (chỉ đúng với một model, phải sửa lớp embedding).
  - Kết quả (JSON + bảng) lưu trong repo để đưa vào README ở Giai đoạn 5. Không chạy trong CI (cần Gemini thật).
- **Vì sao:** đo đúng code đang chạy thay vì một bản viết lại; chuỗi bằng chứng giữ bộ câu hỏi dùng được khi đổi cách chia đoạn.
- **Đánh đổi:** chuỗi bằng chứng có thể khớp nhầm nếu xuất hiện ở nhiều nơi (soạn dữ liệu để mỗi chuỗi là duy nhất). Dữ liệu tự soạn, nhỏ: số liệu chỉ để so cấu hình, không đại diện cho dữ liệu thật.
- **Xem lại khi:** có dữ liệu dùng thử thật; muốn so model embedding khác.
- **Kết quả (2026-11-14):** bộ dữ liệu 84 tin (ít hơn dự kiến 120–150; chủ repo chọn đo luôn), 33 đoạn. Cấu hình hiện tại: recall@1 88%, recall@6 100%, MRR 0,92, rò rỉ 0/6. Ghép câu hỏi trước: recall@1 51% → đã bỏ (xem mục bước 5). Đoạn 5 tin: 85% / 0,91 → giữ 10 tin. recall@6 chạm trần ở mọi cấu hình: bộ dữ liệu dễ, cần dữ liệu khó hơn nếu muốn so tiếp (vd. tiền tố nhiệm vụ Gemini).

## Chưa quyết

- (Chưa có.)
