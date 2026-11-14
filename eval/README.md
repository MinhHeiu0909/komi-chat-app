# Bộ eval tìm kiếm (RAG) của Komi AI

Đo xem Komi AI có tìm đúng đoạn chứa câu trả lời không, và có để lộ dữ liệu người hỏi không được xem không.
Thiết kế và lý do: `docs/DECISIONS.md`, mục "Giai đoạn 4, bước 6".

## Thành phần

| File | Nội dung |
| --- | --- |
| `data/corpus.json` | Dữ liệu tự soạn, bối cảnh văn phòng: 6 người, 5 nhóm + 3 chat 1-1 (84 tin), 3 tài liệu kho chung |
| `data/questions.json` | 47 câu hỏi tiếng Việt: 41 câu cần tìm đúng + 6 câu kiểm tra rò rỉ |
| `backend/scripts/evalLoad.js` | Nạp dữ liệu vào DB riêng (`komi_eval*`), tạo đoạn và embedding bằng worker thật |
| `backend/scripts/evalRun.js` | Chạy từng câu qua đúng code tra cứu của bot (`buildRetrievalQuery` + `searchKnowledge`, lọc quyền), ghi `results/<tên>.json` |
| `metrics.py` | Tính recall@k, MRR, số câu rò rỉ; chỉ dùng thư viện chuẩn Python, không gọi mạng |

Mỗi câu hỏi có **chuỗi bằng chứng** (vd. `crm.company.vn`): đoạn tìm được chứa chuỗi đó là tìm đúng.
Mỗi chuỗi chỉ xuất hiện ở đúng một nơi trong dữ liệu. Câu `leak` là câu người hỏi không được thấy nguồn
(nhóm mình không ở, chat riêng của người khác, hoặc hỏi trong nhóm mà nguồn ở nhóm khác): đoạn chứa bằng chứng không được lọt vào kết quả.

## Chạy

Cần MongoDB Atlas Local đang chạy (`docker compose up mongo`), `backend/.env` có `MONGODB_CONNECTIONSTRING`
và key Gemini (`LLM_BASE_URL`, `LLM_API_KEY`). Bộ eval dùng DB riêng, **không đụng dữ liệu demo**.

```bash
cd backend
export EMBEDDING_PROVIDER=openai-compatible EMBEDDING_MODEL=gemini-embedding-2

# cấu hình hiện tại (đoạn 10 tin)
npm run eval:load
npm run eval:run -- --name hien-tai

# biến thể đoạn 5 tin (DB riêng)
npm run eval:load -- --db komi_eval_w5 --max-messages 5
npm run eval:run -- --name doan-5-tin --db komi_eval_w5

cd ..
python3 eval/metrics.py --out eval/results/summary.md
```

Hạn mức embedding free của Gemini là 100 đoạn/phút: nạp dữ liệu tốn khoảng 35–50 lượt, mỗi lần chạy câu hỏi
47 lượt (script tự giãn nhịp dưới 60 lượt/phút, gặp 429 thì chờ 1 phút).

`metrics.py` trả mã lỗi 2 nếu có câu rò rỉ.

## Kết quả (2026-11-14, `gemini-embedding-2`, 768 chiều)

Bảng đầy đủ: `results/summary.md`.

| Cấu hình | recall@1 | recall@3 | recall@6 | MRR | Rò rỉ |
| --- | --- | --- | --- | --- | --- |
| Ghép câu hỏi trước (bản đầu của bước 5, đã bỏ) | 51% | 98% | 100% | 0,74 | 0/6 |
| **Hiện tại**: chỉ câu hỏi hiện tại, đoạn ≤10 tin | **88%** | 95% | 100% | **0,92** | 0/6 |
| Đoạn ≤5 tin | 85% | 95% | 100% | 0,91 | 0/6 |

- Bot đưa 6 đoạn vào prompt: recall@6 đạt 100% ở cả ba cấu hình, không câu kiểm tra rò rỉ nào lộ nguồn.
- Ghép tin trước đó của người hỏi làm hỏng thứ hạng: trong nhóm, tin trước thường là câu chat không liên quan
  (vd. "Dạ em nhận gọi 600 khách đầu tiên" ghép vào câu hỏi về chỉ tiêu quý 4). Câu viết khác chữ: hạng 1 từ 0/5 lên 5/5
  khi bỏ ghép. Câu nối tiếp không cần ghép (4/5 câu vẫn ở hạng 1, câu còn lại hạng 5). Code đã bỏ ghép.
- Đoạn 5 tin không tốt hơn 10 tin: trong dữ liệu này các đợt chat ngắn, đã bị tách theo khoảng cách 1 giờ
  (28 so với 29 đoạn tin nhắn). Giữ 10 tin.
- **Giới hạn:** bộ dữ liệu nhỏ và dễ (33 đoạn; 6 đoạn đầu đã là gần 1/5 kho), recall@6 chạm trần nên chỉ recall@1 / MRR
  phân biệt được cấu hình. Số liệu dùng để so cấu hình, không đại diện cho dữ liệu thật.
