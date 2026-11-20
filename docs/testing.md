# Kiểm thử

| Lệnh | Phạm vi |
|---|---|
| `pnpm typecheck` | `tsc -b` toàn repo |
| `pnpm test` | Toàn bộ Vitest. `scripts/run-with-test-postgres.mjs` tự bật một Postgres nhúng (cổng ngẫu nhiên) và đặt `DATABASE_URL`. |
| `node scripts/run-with-test-postgres.mjs apps/api/test/x.test.ts` | Chạy một hoặc vài file test API/DB |
| `pnpm --filter @e4s/web exec vitest run [đường dẫn]` | Test giao diện (jsdom), không cần DB |
| `pnpm test:e2e:monthly` | E2E luồng học tháng (`scripts/monthly-learning-e2e.mjs`), cần stack đang chạy |
| `scripts/browser-smoke/` | Smoke test đa trình duyệt (BrowserStack), xem README trong thư mục |
| `pnpm verify:media`, `verify:pronunciation`, `verify:app-media` | Kiểm tra file media, audio phát âm và luật media trong giao diện (không SVG nội tuyến, không emoji) |

## Bố cục

- `apps/web/src/**/*.test.tsx` là test cạnh component; `apps/web/test/` là test luồng lớn.
- `apps/api/test/*.integration.test.ts` chạy API thật trên Postgres thật.
- `packages/*/test` là test luật nghiệp vụ và repository.
- Bộ chạy test bỏ qua thư mục `dist/` (bản build có chứa bản sao test cũ).

## Kiểm tra giao diện

- Trước khi giao bản mới, chụp ảnh các màn đã sửa ở 390 / 820 / 1440px.
- Chạy kiểm tra tự động trên từng màn: không tràn, không cắt chữ, không nút 2 dòng, không chữ dưới 11px.
- Luật chi tiết ở [ui-rules.md](ui-rules.md).

## Test đang hỏng đã biết

Danh sách cập nhật ở cuối file này, sau mỗi lần dọn test. Mục tiêu là `pnpm test` xanh hoàn toàn. Mỗi test hỏng phải được sửa, hoặc xoá kèm lý do; không bỏ qua bằng `skip`.
