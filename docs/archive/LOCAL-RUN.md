# Chạy E4S local bằng Ubuntu/WSL

Stack local đầy đủ gồm Web, API, worker, PostgreSQL, MinIO và Groq. Docker Engine chạy trong Ubuntu/WSL; không dùng Docker Desktop. Các port host mặc định của E4S là Web `4175`, API `3001`, PostgreSQL `5433`, MinIO `9002` và MinIO Console `9003`.

## Khởi động

Từ Ubuntu/WSL, vào thư mục `platform` rồi chạy:

```bash
docker compose up --build -d
docker compose ps
node scripts/verify-local-compose.mjs
```

Mở `http://127.0.0.1:4175`. Demo login được bật cho local; Groq key chỉ được đọc ở API từ `.env`, không được gửi xuống web.

## Chạy Web/API trực tiếp trên Windows

`pnpm dev:local` dùng Web `4175`, API `3001`, PostgreSQL nhúng `54329`, MinIO API `9002` và MinIO Console `9003`. Trước khi chạy, bật đúng storage từ Ubuntu/WSL:

```bash
docker compose up -d minio minio-init
```

Sau đó chạy `pnpm dev:local` trên Windows. Script kiểm tra MinIO API, Console và hai bucket `e4s-evidence` (file ghi âm/evidence) và `e4s-media` (ảnh nội dung có nguồn), đồng thời báo lỗi rõ nếu `3001`, `4175` hoặc `54329` đang bị chiếm, trước khi mở API. Khi sẵn sàng, terminal in trạng thái và URL của Web, API, PostgreSQL, MinIO API và MinIO Console.

Ảnh từ vựng không cần Pexels/Pixabay key. API tra nguồn mở theo quy tắc bảo thủ, lưu ảnh hợp lệ vào `e4s-media` và trả kèm attribution; từ không phù hợp sẽ hiển thị trạng thái không có ảnh thay vì icon/SVG giả. Manager có thể xoá cache ảnh tại Cài đặt để buộc tra lại.

`GROQ_API_KEY` là tùy chọn khi chỉ chạy chức năng không dùng AI. Nếu có key, đặt trong `.env`; không commit key vào Git.

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

## Tài khoản local

`docker compose up` chạy `prepare-local` và tự chuẩn bị cả ba tài khoản demo chính lẫn bộ tài khoản scenario cố định. Vì vậy máy khác dùng cùng bản deploy cũng có ngay dữ liệu để kiểm thử tuần học, Mini game, bài cuối tuần, bài test và duyệt mức; chạy lại không tạo tài khoản trùng.

Ba tài khoản demo chính:

- `quoc.bao.le@e4s.local` / `manager-pass`
- `thu.ha.tran@e4s.local` / `staff-pass`
- `minh.anh.nguyen@e4s.local` / `learner-pass`

Danh sách đầy đủ tài khoản scenario, PIN/mật khẩu và trạng thái kiểm thử nằm tại [`docs/local-scenario-accounts.md`](./local-scenario-accounts.md).

Để kiểm tra tài khoản test cũ trong PostgreSQL local mà không thay đổi dữ liệu:

```bash
DATABASE_URL=postgres://e4s:e4s_local_password@127.0.0.1:54329/e4s pnpm cleanup:local-users
```

Chỉ thêm `--apply` sau khi đã đọc danh sách tài khoản và số bản ghi trong báo cáo dry-run.
