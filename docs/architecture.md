# Kiến trúc E4S

## Tổng thể

```
Trình duyệt ── https://e4s.gfts.vn ── Cloudflare tunnel (cloudflared)
                                          │
                                   web: nginx + bản build React (cổng 80 → 127.0.0.1:4175)
                                          │  /api/*  (proxy)
                                   api: Fastify 5 (cổng 3001) ───── AI: Anthropic / Groq / OpenAI
                                     │            │                  Audio nghe: Edge TTS (trong container api)
                                     ▼            ▼                  Ảnh: Wikimedia / Openverse / Pexels / Pixabay
                     Postgres 18 + pgvector     MinIO (S3)           Email: Resend · Nhạc nền: link YouTube
                     (volume e4s-postgres)      bucket e4s-evidence (bài ghi âm, minh chứng)
                                                bucket e4s-media    (ảnh, audio nội dung)
                                     ▲
                     worker: đọc bảng `jobs` mỗi 1 giây (health check, dọn storage, webhook thông báo)
```

- **Container** (`docker-compose.yml`): `postgres`, `minio`, `minio-init` (tạo bucket), `migrate` (chạy một lần), `api`, `worker`, `web`.
- **Overlay tunnel** (`docker-compose.tunnel.yml`): khoá cổng Postgres/MinIO/API, chỉ mở web ở 127.0.0.1, thêm `cloudflared`, đặt `COOKIE_SECURE`.
- **Overlay sandbox** (`docker-compose.dev4300.yml`): web 4300, api 4301, Postgres 5434.
- **API và worker** chạy TypeScript trực tiếp bằng `tsx` (`Dockerfile.local`). **Web** được build tĩnh rồi phục vụ bằng nginx (`Dockerfile.web`, `docker/nginx*.conf`).

## Monorepo

| Package | Phụ thuộc | Vai trò |
|---|---|---|
| `apps/web` | contracts, domain | Giao diện 3 vai trò |
| `apps/api` | ai, contracts, database, domain, storage | REST API |
| `apps/worker` | ai, database, storage | Job nền |
| `packages/contracts` | — | Kiểu dữ liệu web ↔ api; danh sách màn hình chuẩn (`screen-contract.ts`) |
| `packages/domain` | contracts | Luật nghiệp vụ thuần: lộ trình tháng, ngày học, điểm, mùa, huy hiệu, mức CEFR |
| `packages/database` | contracts, domain | Migrations SQL, `repositories.ts` (truy vấn), repo riêng cho tháng / đấu trường |
| `packages/ai` | — | Provider (Anthropic, Groq, OpenAI), registry tác vụ AI, schema đầu ra |
| `packages/storage` | — | Ghi/đọc MinIO/S3, URL ký sẵn |

## API (`apps/api/src/modules`)

| Module | Phụ trách |
|---|---|
| `identity` | Đăng nhập (học viên: email + PIN; nhân viên: email + mật khẩu), phiên `e4s_session`, quên mật khẩu/PIN, `createRoleGuard` |
| `learning` | Trang chủ học viên, bài học, tiến độ, hồ sơ |
| `content` | Nội dung: chủ đề và tài nguyên tháng, sinh bài tháng bằng AI, duyệt và phát hành, kho bài tuần cũ, chấm và kháng nghị, prompt |
| `assessment` | Thi đầu vào, tháng, lên mức, đầu ra; kho đề và trộn đề; audio nghe; chấm |
| `coach` | Hội thoại với Season, giới hạn lượt |
| `engagement` | Mini game, bộ từ, phần thưởng, khảo sát cuối pilot |
| `arena` | Đấu trường: mùa, xếp hạng, ghép trận, chấm trận |
| `notifications` | Hộp thông báo (chuông), huy hiệu mới |
| `manager` | Ngày nghỉ, yêu cầu mở khoá, khiếu nại, minh chứng |
| `monthly-surveys` | Khảo sát hằng tháng |
| `media` | Tìm ảnh từ vựng có nguồn và giấy phép, cache |
| `files` | Tải file lên MinIO |
| `system` | Cài đặt tổ chức (giao diện mùa, nhạc nền, provider AI), readiness |

## Web (`apps/web/src/app`)

- **Điều hướng:** `RoleRoutes.tsx` chọn khu vực theo vai trò. Mỗi khu vực có controller riêng: `learner/LearnerRouteController.tsx`, `operator/OperatorRouteController.tsx`, `manager/ManagerRouteController.tsx`. Danh sách màn hình chuẩn và menu nằm ở `packages/contracts/src/screen-contract.ts`.
- **Thành phần dùng chung** (`shared/`): `AppShell` (menu, thanh dưới trên điện thoại, chuông), `ModalProvider`, `Pager`, `ScrollJump`, `RulesDisclosure`, `StatusPage` (trang 404/403/lỗi), `BadgeCelebration`.
- **API client** nằm trong `apps/web/src/api/*.ts`.
- **CSS:** mỗi màn có file riêng, cộng các file responsive dùng chung: `responsive-phone.css`, `responsive-tablet.css`, `responsive-learner.css`, `responsive-manager.css`. Ba tầng giao diện (≤600 / 601–1024 / ≥1025) theo [ui-rules.md](ui-rules.md).

## Luồng nghiệp vụ chính

1. **Vào học:** học viên đăng ký → hồ sơ (`/onboard`) → thi đầu vào (`/test/placement`) → Người vận hành duyệt mức (`/op`) → học viên nhận lộ trình tháng.
2. **Nội dung tháng:** Người vận hành chọn chủ đề tháng → sinh tài nguyên (từ, ngữ pháp, phát âm) → sinh bài từng ngày → duyệt → phát hành (`/op/months`). Bài chỉ hiện với học viên sau khi phát hành.
3. **Học hằng ngày:** bài học (`/lesson/:id`) gồm phần Học và Bài tập. Điểm danh, điểm Season, mùa và huy hiệu do `packages/domain` tính.
4. **Thi:** bài thi tháng vào cuối tháng; khi đủ điều kiện thì thi lên mức; thi đầu ra ở C1. Kháng nghị và yêu cầu thi lại đi qua Người vận hành và Quản lý.
5. **Đấu trường** (từ B1): thách đấu, nhận trận, chơi trò từ vựng, xếp hạng theo mùa. Xem [features/arena.md](features/arena.md).

## Dữ liệu

- Migrations nằm trong `packages/database/migrations/NNNN_*.sql`: 115 file, đánh số tới 0130, có chỗ nhảy số. Mỗi file chạy trong một transaction và được ghi lại trong bảng `schema_migrations`.
- Nhóm bảng chính:
  - **Người dùng:** `users`, `user_credentials`, `sessions`, `learner_profiles`
  - **Nội dung tháng:** `program_months`, `month_frameworks`, `month_lessons`
  - **Bài tuần cũ** (còn dùng cho tiến độ và cảnh báo): `program_weeks`, `lesson_sets`
  - **Bài thi:** `assessment_*`, `appeals`, `certificate_issuances`
  - **Phần thưởng:** `reward_events`, `badges`
  - **Đấu trường:** `arena_*`
  - **Thông báo:** `inbox_notifications`
  - **File:** `files`, `media_assets`
  - **AI:** `ai_runs`, `prompt_versions`
  - **Job nền:** `jobs`
- **Seed:** `packages/database/src/seed.ts` (3 tài khoản demo) và `scripts/local-scenario-accounts.ts` (tài khoản tình huống). Chỉ dùng ở local.

## Code đã gỡ

`legacy/` giữ phần đã bỏ: màn và bộ sinh bài theo tuần, các link chuyển hướng cũ, màn Prompt & rubric, màn bài thực hành tuần của học viên, đấu trường đời đầu (duel). Xem `legacy/README.md`.
