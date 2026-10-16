# Chạy E4S local bằng Ubuntu/WSL

Stack local đầy đủ gồm Web, API, worker, PostgreSQL, MinIO và Groq. Docker Engine chạy trong Ubuntu/WSL; không dùng Docker Desktop. Các port host mặc định của E4S là Web `4174`, API `3002`, PostgreSQL `5433`, MinIO `9002` và MinIO Console `9003`, nên không đụng các container đang dùng `5432`, `9000/9001` hay `5678`.

## Khởi động

Từ Ubuntu/WSL, vào thư mục `platform` rồi chạy:

```bash
docker compose up --build -d
docker compose ps
node scripts/verify-local-compose.mjs
```

Mở `http://127.0.0.1:4174`. Demo login được bật cho local; Groq key chỉ được đọc ở API từ `.env`, không được gửi xuống web.

## Kiểm chứng persistence

Sau smoke test đầu tiên, chạy:

```bash
docker compose restart
node scripts/verify-local-compose.mjs
docker compose down
docker compose up -d
node scripts/verify-local-compose.mjs
```

Không chạy `docker compose down -v` trong bước trên: named volumes giữ dữ liệu PostgreSQL và MinIO. Chỉ dùng `down -v` khi chủ động muốn xóa toàn bộ dữ liệu local E4S.
