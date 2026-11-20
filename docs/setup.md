# Cài đặt và chạy E4S

## Yêu cầu

- Node.js 24–26 và pnpm 12.3.4 (`corepack enable`)
- Docker Engine (Docker Desktop hoặc Docker trong WSL) với Docker Compose v2
- Windows PowerShell 5.1 trở lên, để chạy `scripts/ops/e4s.ps1`

## 1. Lấy mã và cài thư viện

```powershell
git clone <repo> e4s; cd e4s
pnpm install
copy .env.example .env
```

Điền tối thiểu hai biến bắt buộc trong `.env` (giải thích ở [env.md](env.md)):

```powershell
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"   # → E4S_SETTINGS_ENCRYPTION_KEY
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"      # → AUTH_OTP_SECRET
```

Không có key AI thì app vẫn chạy được, nhưng sẽ không sinh được bài, không chấm AI được và không chat được với Season.

## 2. Ba cách chạy

### A. Máy mới, chạy local đầy đủ (Docker)

```powershell
docker compose up --build -d
docker compose ps
node scripts/verify-local-compose.mjs
```

Mở http://127.0.0.1:4175.

Compose gốc chạy `scripts/prepare-local.ts`. Script này áp migration, **tạo tài khoản demo** và bộ tài khoản tình huống. Danh sách tài khoản nằm ở [local-scenario-accounts.md](local-scenario-accounts.md).

> ⚠️ Chỉ dùng compose gốc cho máy local. **Không bao giờ** chạy `docker compose up` thiếu file overlay với project `e4s-local` (bản thật): nó sẽ đặt lại tài khoản demo. Với 4175 và 4300, luôn dùng `scripts/ops/e4s.ps1`.

Dữ liệu nằm trong named volume (`e4s-postgres`, `e4s-minio`). `docker compose down` vẫn giữ dữ liệu; còn `down -v` **xóa sạch**.

### B. Sandbox 4300 (bản để thử code)

```powershell
./scripts/ops/e4s.ps1 -Env sandbox -Action deploy    # backup → build api/worker/web → chạy → chờ sẵn sàng
./scripts/ops/e4s.ps1 -Env sandbox -Action status
```

- Web chạy ở http://127.0.0.1:4300, API ở 4301, Postgres ở 127.0.0.1:5434.
- DB và kho file của sandbox tách hẳn khỏi bản thật.

### C. Chạy web và API trực tiếp, không cần Docker (để sửa giao diện nhanh)

```powershell
docker compose up -d minio minio-init    # MinIO vẫn cần Docker
pnpm dev:local                            # web 4175, api 3001, Postgres nhúng 54329
```

## 3. Lệnh hay dùng

| Lệnh | Việc |
|---|---|
| `pnpm typecheck` | Kiểm tra kiểu toàn repo (`tsc -b`) |
| `pnpm test` | Toàn bộ test, có Postgres nhúng (xem [testing.md](testing.md)) |
| `pnpm --filter @e4s/web exec vitest run` | Chỉ chạy test web |
| `pnpm build` | Kiểm tra media/phát âm rồi build mọi package |
| `pnpm db:migrate` | Chỉ áp migration SQL (cần `DATABASE_URL`) |
| `pnpm prepare:local-scenarios` | Tạo lại tài khoản tình huống, chỉ trên DB local |

## 4. Đưa bản mới lên bản thật

Xem [operations.md](operations.md). Tóm tắt: thử trên 4300 → commit và push → chủ dự án đồng ý → `./scripts/ops/e4s.ps1 -Env live -Action deploy -ConfirmLive`.
