# Vận hành E4S

Mọi thao tác dùng **`scripts/ops/e4s.ps1`**. Script tự chọn đúng project và file compose, và chặn mọi thao tác lên bản thật nếu thiếu `-ConfirmLive`.

| | Bản thật (`-Env live`) | Sandbox (`-Env sandbox`) |
|---|---|---|
| Địa chỉ | https://e4s.gfts.vn (127.0.0.1:4175) | http://127.0.0.1:4300 |
| Docker project | `e4s-local` | `e4s-dev` |
| Volume dữ liệu | `e4s-local_e4s-postgres`, `e4s-local_e4s-minio` | `e4s-dev_e4s-postgres`, `e4s-dev_e4s-minio` |
| Quy tắc | Chỉ thay đổi khi chủ dự án đồng ý | Thoải mái thử |

Chạy lệnh từ thư mục repo. Nếu `.env` nằm chỗ khác, thêm `-EnvFile <đường dẫn>`.

## Quy trình đưa bản mới

1. Sửa code, chạy `pnpm typecheck` và các test liên quan.
2. `./scripts/ops/e4s.ps1 -Env sandbox -Action deploy`, rồi kiểm tra trên 4300.
3. Commit, rồi push lên nhánh giao nộp `codex/deploy-web-fallback`.
4. Khi chủ dự án đồng ý:
   ```powershell
   ./scripts/ops/e4s.ps1 -Env live -Action deploy -ConfirmLive
   ```
   Lệnh `deploy` làm lần lượt: backup DB và file → gắn tag `rollback-<giờ>` cho image đang chạy → build api/worker/web → khởi động lại 3 service đó → chờ `/api/readiness` báo `ready`.

## Migration

- Migration mới chạy trên sandbox trước:
  ```powershell
  ./scripts/ops/e4s.ps1 -Env sandbox -Action migrate
  ```
- Ổn rồi mới chạy trên bản thật:
  ```powershell
  ./scripts/ops/e4s.ps1 -Env live -Action migrate -ConfirmLive
  ```
- `migrate` luôn backup trước, rồi chạy `scripts/migrate-only.ts`. Script này chỉ áp migration SQL: **không** seed, **không** đặt lại mật khẩu, **không** đồng bộ đề thi.
- Migration nào đã ghi trong `schema_migrations` thì không chạy lại.
- ⚠️ **Không** chạy `docker compose up` trên project `e4s-local` mà thiếu overlay. Compose gốc chạy `prepare-local.ts`, script này đặt lại tài khoản demo.
- Nếu buộc phải áp một file SQL bằng tay (`psql -1 -f`), phải thêm dòng `insert into schema_migrations(version) values ('NNNN_ten')` cho đúng file đó.

## Backup và khôi phục

```powershell
./scripts/ops/e4s.ps1 -Env live -Action backup          # chỉ đọc; tạo backups/e4s-local-<giờ>.dump + -minio.tar.gz
./scripts/ops/e4s.ps1 -Env sandbox -Action restore -Dump backups/x.dump -MinioArchive backups/x-minio.tar.gz
```

- **Backup** gồm `pg_dump -Fc` của DB và file nén toàn bộ dữ liệu MinIO (ảnh, audio, bài ghi âm).
- **Khôi phục:**
  1. Bắt gõ đúng tên project để xác nhận (bản thật luôn hỏi).
  2. Tự backup bản hiện tại.
  3. Dừng api/worker.
  4. Chạy `pg_restore --clean`; nếu có file MinIO thì thay toàn bộ volume MinIO.
  5. Bật lại api/worker và chờ sẵn sàng.
- Quy trình khôi phục đã được chạy thử trên sandbox ngày 20/11/2026.
- **Backup định kỳ:** tạo tác vụ trong Windows Task Scheduler chạy lệnh dưới đây mỗi đêm, và chép thư mục `backups/` sang ổ khác hoặc lên cloud.
  ```powershell
  powershell -File <repo>\scripts\ops\e4s.ps1 -Env live -Action backup -BackupDir D:\e4s-backups
  ```
- **Chép dữ liệu thật sang sandbox:** backup bản thật, rồi `restore` file đó vào sandbox.

## Rollback (quay lại bản trước)

Mỗi lần `deploy` đều gắn tag cho image cũ (xem bằng `docker images e4s-local-*`). Để quay lại một bản:

```powershell
docker tag e4s-local-api:rollback-<giờ> e4s-local-api:latest     # làm tương tự cho worker, web
docker compose --env-file .env -p e4s-local -f docker-compose.yml -f docker-compose.tunnel.yml up -d --no-deps --no-build api worker web
```

Nếu bản mới có migration, phải khôi phục cả DB từ backup chụp ngay trước lần deploy đó.

## Sự cố thường gặp

| Hiện tượng | Kiểm tra |
|---|---|
| Trang báo không tải được | `./scripts/ops/e4s.ps1 -Env live -Action status`, rồi xem log bằng `-Action logs` |
| e4s.gfts.vn không vào được, nhưng 127.0.0.1:4175 vẫn chạy | Container `e4s-local-cloudflared-1` và file token `%LOCALAPPDATA%\E4S\cloudflare-tunnel-token.txt` |
| API báo `PROVIDER_SETTINGS_ENCRYPTION_KEY_*` | `E4S_SETTINGS_ENCRYPTION_KEY` trong `.env` bị thiếu, sai định dạng hoặc đã bị đổi |
| Không sinh được bài, AI báo lỗi | Key AI trong Cài đặt hoặc `.env`; xem log api |
| Học viên quên PIN | Quản lý → Cài đặt → Người dùng → xem hoặc đặt lại PIN |

## Máy chủ hiện tại

- Bản thật chạy trên **một máy Windows**: Postgres, MinIO và tunnel cùng nằm trên máy này. Máy hỏng thì phải dựng lại bằng backup gần nhất cộng file token tunnel.
- Chỉ có một worker, chạy bằng cách đọc bảng `jobs` trong DB; không có hàng đợi riêng.
- Image MinIO được ghim theo digest trong `docker-compose.yml`. Muốn nâng cấp thì đổi digest có chủ đích và thử trên sandbox trước.
