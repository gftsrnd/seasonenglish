# E4S — Season English

Ứng dụng học tiếng Anh công sở theo lộ trình tháng, có bốn phần chính:

- bài học hằng ngày;
- trợ lý AI **Season**;
- mini game và **Đấu trường từ vựng**;
- bài thi đầu vào, thi tháng, lên mức và đầu ra; điểm, mùa, huy hiệu và chứng nhận.

Có 3 vai trò, giao diện tiếng Việt:

| Vai trò | Đường dẫn | Đăng nhập | Việc chính |
|---|---|---|---|
| Học viên | `/home` | email + PIN 6 số | học bài, luyện với Season, chơi game, thi |
| Người vận hành | `/op` | email + mật khẩu | duyệt trình độ, sinh và duyệt bài tháng, chấm và kháng nghị, kho đề |
| Quản lý | `/mgr` | email + mật khẩu | theo dõi tiến độ, nhắc học, báo cáo, yêu cầu, cài đặt, xem phần vận hành |

## Môi trường

| | Địa chỉ | Docker project | Ghi chú |
|---|---|---|---|
| **Thật (live)** | https://e4s.gfts.vn → 127.0.0.1:4175 | `e4s-local` | Qua Cloudflare tunnel. Thay đổi phải được chủ dự án đồng ý. |
| **Sandbox** | http://127.0.0.1:4300 | `e4s-dev` | DB và kho file riêng. Thoải mái thử nghiệm. |

## Chạy nhanh

```powershell
pnpm install
copy .env.example .env      # rồi điền E4S_SETTINGS_ENCRYPTION_KEY, AUTH_OTP_SECRET (xem docs/env.md)
docker compose up --build -d   # máy mới: stack local có tài khoản demo, mở http://127.0.0.1:4175
./scripts/ops/e4s.ps1 -Env sandbox -Action deploy   # cập nhật sandbox 4300 sau khi sửa code
```

Chi tiết: [docs/setup.md](docs/setup.md).

## Cấu trúc

```
apps/web        React 19 + Vite: giao diện 3 vai trò (src/app/{learner,operator,manager,settings,games,shared})
apps/api        Fastify 5: REST API /api/v1/* (src/modules/*)
apps/worker     Job nền: health check, dọn storage, webhook
packages/
  contracts     Kiểu dữ liệu dùng chung web ↔ api, danh sách màn hình (screen-contract.ts)
  domain        Luật nghiệp vụ: lộ trình tháng, điểm, mùa, huy hiệu
  database      Postgres: migrations SQL (115 file), repositories
  ai            Provider AI (Anthropic, Groq, OpenAI) và schema đầu ra
  storage       Lưu file lên MinIO/S3
legacy/         Code đã gỡ khỏi app, giữ để tham khảo (không build)
scripts/        Seed, migrate, kiểm tra media, vận hành (scripts/ops/e4s.ps1)
docs/           Tài liệu, xem mục lục bên dưới
```

## Tài liệu

| Tài liệu | Nội dung |
|---|---|
| [docs/setup.md](docs/setup.md) | Cài đặt và chạy (Docker, chạy trực tiếp, tài khoản demo) |
| [docs/env.md](docs/env.md) | Mọi biến môi trường |
| [docs/architecture.md](docs/architecture.md) | Kiến trúc, luồng dữ liệu, module |
| [docs/operations.md](docs/operations.md) | Vận hành: deploy, migrate, backup, khôi phục, rollback, sự cố |
| [docs/testing.md](docs/testing.md) | Chạy test, test đang hỏng đã biết |
| [docs/glossary.md](docs/glossary.md) | Thuật ngữ tiếng Việt ↔ tên trong code |
| [docs/ui-rules.md](docs/ui-rules.md) | Luật giao diện điện thoại, tablet, desktop |
| [docs/user-guide/](docs/user-guide/) | Hướng dẫn sử dụng cho từng vai trò |
| [docs/features/](docs/features/) | Tài liệu tính năng (đấu trường, phần thưởng…) |
| [docs/archive/](docs/archive/) | Kế hoạch, spec và báo cáo cũ (chỉ để tra cứu) |
