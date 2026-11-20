# Biến môi trường

Mẫu đầy đủ nằm ở [`.env.example`](../.env.example). File `.env` không bao giờ được commit; bản thật đặt `.env` cạnh các file compose trên máy chủ.

## Bắt buộc

| Biến | Dùng cho | Ghi chú |
|---|---|---|
| `E4S_SETTINGS_ENCRYPTION_KEY` | Mã hoá API key AI lưu trong màn Cài đặt | 32 byte ngẫu nhiên dạng base64. Compose dừng nếu thiếu. **Đổi key là mất toàn bộ key đã lưu.** |
| `AUTH_OTP_SECRET` | Ký mã quên mật khẩu / đặt lại PIN | Chuỗi ngẫu nhiên dài. Nếu thiếu, compose dùng giá trị mặc định yếu. |
| `POSTGRES_PASSWORD` | Mật khẩu user `e4s` của Postgres | Mặc định chỉ an toàn ở local. |
| `MINIO_ROOT_USER`, `MINIO_ROOT_PASSWORD` | Tài khoản MinIO (cũng là S3 key của api/worker) | Như trên. |

Với bản thật (tunnel), Postgres và MinIO **không mở cổng** ra ngoài máy, nên mật khẩu mặc định ít rủi ro hơn. Dù vậy, khi bàn giao máy chủ mới vẫn nên tự đặt mật khẩu riêng.

## AI

| Biến | Ý nghĩa |
|---|---|
| `AI_PROVIDER` | `anthropic` để dùng `ANTHROPIC_API_KEY` làm mặc định. Nếu để trống, app dùng provider và key do Quản lý lưu cho tổ chức trong Cài đặt. |
| `ANTHROPIC_API_KEY`, `ANTHROPIC_MODEL` | Claude, dùng sinh bài, chấm và chat Season |
| `GROQ_API_KEY`, `GROQ_MODEL`, `GROQ_BASE_URL` | Groq, dùng thay thế |
| `AI_TIMEOUT_MS`, `AI_MAX_ATTEMPTS` | Timeout và số lần thử lại của mỗi lần gọi AI |
| `E4S_LESSON_QUALITY_PROFILE` | `baseline` hoặc `strict`: mức kiểm tra chất lượng bài sinh |
| `MONTHLY_RESOURCE_AI_CALL_LIMIT` | Trần số lần gọi AI cho mỗi lần sinh tài nguyên tháng |
| `OPENAI_API_KEY`, `OPENAI_IMAGE_MODEL`, `OPENAI_IMAGE_API`, `OPENAI_IMAGE_QUALITY`, `OPENAI_BASE_URL` | Ảnh minh hoạ từ cốt lõi |
| `OPENAI_TRANSCRIPTION_MODEL` | Chuyển giọng nói thành chữ cho phần Nói. Để trống thì dùng `gpt-4o-mini-transcribe`; đặt `off` thì không chuyển, Người vận hành chấm tay. |
| `IMAGE_GENERATION_CONCURRENCY` | Số ảnh được sinh song song |

## Media, âm thanh, email

| Biến | Ý nghĩa |
|---|---|
| `PEXELS_API_KEY`, `PIXABAY_API_KEY` | Nguồn ảnh từ vựng có key (tuỳ chọn). Không có key thì dùng Wikimedia và Openverse. |
| `VOCAB_IMAGE_SOURCE` | Compose có truyền biến này, nhưng code hiện không đọc. |
| `E4S_ENABLE_EDGE_TTS`, `EDGE_TTS_COMMAND`, `EDGE_TTS_FFMPEG` | Sinh audio cho bài nghe (Edge TTS chạy trong container api) |
| `RESEND_API_KEY`, `RESEND_FROM_EMAIL` | Gửi email đặt lại mật khẩu / PIN |
| `S3_ENDPOINT`, `S3_REGION`, `S3_ACCESS_KEY`, `S3_SECRET_KEY`, `S3_EVIDENCE_BUCKET`, `S3_MEDIA_BUCKET` | Kho file. Compose tự đặt các biến này theo MinIO; chỉ cần tự điền khi dùng S3 bên ngoài. |

## Web, cookie, cổng

| Biến | Ý nghĩa |
|---|---|
| `WEB_ORIGIN` | Origin được phép gọi API (CORS), có thể ghi nhiều origin cách nhau bằng dấu phẩy |
| `COOKIE_SECURE` | `true` trên bản thật (HTTPS). Overlay tunnel tự đặt. |
| `VITE_API_BASE_URL` | Đặt lúc build web, chỉ khi API nằm ở origin khác |
| `VITE_E4S_STAFF_DIRECT_ENTRY` | Đặt lúc build web. `1` bật lối vào nhân viên ở `/season-english/staff`. |
| `E4S_WEB_PORT`, `E4S_API_PORT`, `E4S_POSTGRES_PORT`, `E4S_MINIO_PORT`, `E4S_MINIO_CONSOLE_PORT` | Cổng host của compose gốc |
| `DATABASE_URL` | Chuỗi kết nối Postgres cho script và test. Compose tự đặt. |

## Worker

`WORKER_POLL_MS` (mặc định 1000), `WORKER_LEASE_SECONDS` (60), `WORKER_ID` (tự sinh).

## Công cụ / chỉ dùng local

| Biến | Ý nghĩa |
|---|---|
| `E4S_SEED_SCENARIOS`, `E4S_ALLOW_LOCAL_SCENARIOS`, `E4S_ALLOW_REMOTE_SCENARIOS` | Cho phép tạo tài khoản tình huống. Không bao giờ bật trên bản thật. |
| `E4S_ENABLE_MAINTENANCE` | Mở endpoint bảo trì cho môi trường dev; bị bỏ qua khi `NODE_ENV=production` |
| `E4S_REGISTER_TRIAL` | Khoá an toàn cho script đăng ký tháng học thử, chỉ chạy được trên 4300 (`dev-4300`) |
| `E4S_E2E_*`, `E4S_CORE_FLOW_*` | Biến của các script e2e cũ (đã chuyển vào `legacy/scripts`) |

## Ngoài `.env`

- Token Cloudflare tunnel: `%LOCALAPPDATA%\E4S\cloudflare-tunnel-token.txt` trên máy chạy bản thật (overlay tunnel đọc file này). Khi chuyển máy, phải chép file này sang máy mới.
