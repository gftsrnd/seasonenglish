# Task 7 — AI gateway, Groq và AI Coach

## Phạm vi đã kiểm tra

- Coach giữ đúng một màn `/coach` và các khối nhìn thấy của prototype: chủ đề, CEFR, phong cách Informal/Formal, bộ đếm, hội thoại, phản hồi, ô từ bí mật, ô nhập và nút nói/gửi.
- Lớp sinh động do Thư thiết kế được giữ làm chuẩn trải nghiệm; phần kỹ thuật chỉ nối dữ liệu và trạng thái thật, không tự đổi avatar, huy hiệu, màu sắc, chủ đề mùa, icon hoặc minh hoạ.
- Khóa Groq chỉ nằm trong `.env` local đã bị Git bỏ qua; browser không nhận khóa, trace hoặc metadata nội bộ.

## Bằng chứng hình ảnh

- `00-prototype-coach.jpg`: màn Coach trong prototype dùng để đối chiếu trước khi triển khai.
- `01-local-coach-live.png`: bản local sau khi gửi một lượt thật; thể hiện bộ đếm tăng, ba điểm rubric, gợi ý sửa, câu mẫu và hai ô từ được mở.

## Live smoke ngày 13/10/2026

| Hạng mục | Kết quả |
|---|---|
| Provider | Groq |
| Model | `qwen/qwen3.8-27b` |
| Trạng thái | `succeeded` |
| Độ trễ provider | 814 ms |
| Schema output | Hợp lệ |
| Trace ID | `bc7349c7-714a-41ee-8279-1aaec13466e1` |
| Token | input 426, output 246, tổng 672 |
| Dữ liệu đầu vào lưu lại | Chỉ SHA-256 dài 64 ký tự |
| Liên kết dữ liệu | 1 AI run ↔ 1 coach turn |

Nội dung người học và khóa API không được chép vào tài liệu bằng chứng.

## Kiểm thử tự động

- Schema/fixture: input và output sai bị từ chối.
- Timeout/retry: timeout và lỗi tạm thời được retry theo giới hạn; lỗi không retry được trả mã an toàn.
- Privacy: response không trả trace, input hash, provider credential hoặc raw metadata.
- Authorization: chỉ learner truy cập Coach; role khác bị chặn.
- Idempotency: gửi lại cùng `requestId` không tạo lượt hoặc reward trùng.
- UI: lỗi giữ nguyên câu đang nhập để người học có thể thử lại.
