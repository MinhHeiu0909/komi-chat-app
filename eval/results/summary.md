## Kết quả tìm kiếm (RAG)

| Cấu hình | Số câu | recall@1 | recall@3 | recall@5 | recall@6 | MRR | Rò rỉ |
|---|---|---|---|---|---|---|---|
| ghep-cau-truoc | 41 | 51% | 98% | 98% | 100% | 0.74 | 0/6 |
| hien-tai | 41 | 88% | 95% | 100% | 100% | 0.92 | 0/6 |
| doan-5-tin | 41 | 85% | 95% | 98% | 100% | 0.91 | 0/6 |

### recall@6 theo loại câu hỏi

| Loại câu hỏi | ghep-cau-truoc | hien-tai | doan-5-tin |
|---|---|---|---|
| tin nhắn cùng nơi hỏi | 100% (16 câu) | 100% (16 câu) | 100% (16 câu) |
| viết khác chữ với nguồn | 100% (5 câu) | 100% (5 câu) | 100% (5 câu) |
| câu nối tiếp | 100% (5 câu) | 100% (5 câu) | 100% (5 câu) |
| tìm chéo cuộc trò chuyện | 100% (8 câu) | 100% (8 câu) | 100% (8 câu) |
| tài liệu chung | 100% (7 câu) | 100% (7 câu) | 100% (7 câu) |

### Câu không tìm được đoạn đúng trong 6 đoạn đầu

- **ghep-cau-truoc**: không có
- **hien-tai**: không có
- **doan-5-tin**: không có

### Cấu hình đã chạy

- **ghep-cau-truoc**: DB `komi_eval`, ghép câu hỏi trước: có, model `gemini-embedding-2` 768 chiều, chạy lúc 2026-11-14T15:44:39.352Z
- **hien-tai**: DB `komi_eval`, ghép câu hỏi trước: không, model `gemini-embedding-2` 768 chiều, chạy lúc 2026-11-14T15:53:50.020Z
- **doan-5-tin**: DB `komi_eval_w5`, ghép câu hỏi trước: không, model `gemini-embedding-2` 768 chiều, chạy lúc 2026-11-14T15:56:12.330Z
