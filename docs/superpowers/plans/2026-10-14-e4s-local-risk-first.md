# E4S 14/10 Three-Task Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Hoàn thành ba đầu việc ngày 14/10 theo đúng thứ tự đã chốt: đóng luồng game, dựng toàn bộ hệ thống chạy local, rồi nối vận hành và kiểm chứng; không tự thay đổi user flow hoặc phần nhìn của Thư.

**Architecture:** Tiếp tục modular monolith TypeScript hiện có. Prototype là chuẩn tham chiếu cho màn, thứ tự luồng, badges, avatar và phần nhìn; source code, endpoint, framework và database được chuẩn hóa độc lập. PostgreSQL là source of truth, AI chạy server-side và Docker Engine chạy qua Ubuntu/WSL.

**Tech Stack:** TypeScript 7, React, Fastify 5, PostgreSQL 18, MinIO/S3, pnpm workspace, Vitest 5, Docker Engine trong Ubuntu/WSL, Groq server-side.

**Spec:** `D:/TTS - AI Application - Huynh Doan Hoang Minh/12_10_2026 - 17_10_2026/E4S/E4S-TECHNICAL-ARCHITECTURE.md`

## Global Constraints

- Giữ nguyên các màn, chức năng và user flow Thư đã mô tả; chỉ sắp xếp khối/ngữ cảnh nhỏ khi không đổi hành vi.
- Giữ nguyên badges, avatar và phần nhìn sinh động của Thư.
- Không sửa phần nhìn Crosswords, Season-rio hoặc Typing race khi chưa được Minh–Thư xác nhận.
- Prototype chỉ là tham chiếu trải nghiệm; không dùng HTML/CSS/JS, endpoint hay dữ liệu demo làm chuẩn công nghệ.
- Mọi bug chức năng đi theo RED → GREEN → full verification → evidence → commit.
- Secret chỉ nằm ở server environment; không commit `.env`, API key, credential hoặc log nhạy cảm.
- GitHub 403 không được ghi thành “đã push”; local commit và bằng chứng vẫn tiếp tục.

## Review Focus

- Game kết thúc, gửi điểm hoặc tải lại trang không được nhân đôi điểm, reward hay attempt.
- Điểm hiển thị phải khớp luật chấm hiện tại, kể cả record cũ có mẫu số khác.
- Tương tác bàn phím, pointer và touch không được làm kẹt game hoặc bỏ qua bước bắt buộc.
- Crosswords, Season-rio và Typing race phải được kiểm tra chức năng mà không tự đổi phần nhìn.
- Arena, reward và survey phải giữ route/flow riêng và xử lý đúng trạng thái khóa, gửi lặp, refresh.

---

### Setup: Branch, ledger và baseline

**Files:**
- Inspect: `package.json`, current branch and working tree.
- Read: `.superpowers/sdd/e4s-implementation-plan/progress.md`

- [ ] Xác nhận branch `codex/e4s-full-local`, checkpoint `c9d936e` và thay đổi hiện có.
- [ ] Chạy `pnpm test`, `pnpm typecheck`, `pnpm build` và đọc toàn bộ kết quả trước khi sửa.
- [ ] Khởi động local bằng script hiện có và lưu ảnh đầu vào của sáu game.

### Task 1: Rà soát và đóng luồng game E4S

**Files:**
- Inspect/modify only when a verified functional bug exists: `apps/web/src/pages/learner/games/*.tsx`
- Inspect/modify: `apps/web/src/pages/learner/{Game,Games,Arena,Reward,Survey}.tsx`
- Inspect/modify: `apps/api/src/modules/engagement/routes.ts`
- Inspect/modify: `packages/domain/src/engagement/index.ts`
- Test: `apps/web/test/engagement-screens.test.tsx`
- Test: `apps/api/test/engagement.integration.test.ts`
- Test: `packages/domain/test/engagement.test.ts`
- Evidence: `evidence/task-08-engagement/`

**Interfaces:**
- Consumes: `GameKey`, `GameWord`, `FinishGame`, server-authoritative scoring, existing screen contract.
- Produces: sáu game có luồng hoàn chỉnh; Arena/reward/survey có edge case đã khóa bằng test; ma trận điểm lệch phần nhìn cần Thư xác nhận.

- [x] **Step 1: Chụp và kiểm tra đủ sáu game**

Kiểm tra Word Scramble, Crosswords, Season Catch, Season-rio, Word Sort và Typing Race theo các trạng thái bắt đầu, tương tác chính, sai/đúng, kết thúc và refresh. Phân loại từng điểm thành `đã đúng`, `bug chức năng`, hoặc `phần nhìn cần xác nhận`.

- [x] **Step 2: Viết test đỏ cho từng bug chức năng**

Mỗi test phải gọi hành vi thật và chỉ bắt một lỗi: tính điểm, state progression, duplicate submit, keyboard/pointer/touch, timer hoặc refresh. Test phải fail đúng vì bug trước khi sửa production code.

- [x] **Step 3: Sửa tối thiểu từng bug đến GREEN**

Không đổi màn, thứ tự flow, asset, avatar, badge hoặc phong cách. Riêng Crosswords, Season-rio và Typing Race chỉ sửa logic/state nếu test chứng minh lỗi; điểm lệch hình ảnh chỉ ghi evidence.

- [x] **Step 4: Đóng Arena, reward và survey**

Viết test đỏ rồi sửa các edge case còn lại: Arena khóa dưới B1 và không tạo duel trái phép; reward không phát trùng; survey gửi một lần và giữ trạng thái sau refresh.

- [x] **Step 5: Verify, evidence và commit**

Run: `pnpm vitest run apps/web/test/engagement-screens.test.tsx apps/api/test/engagement.integration.test.ts packages/domain/test/engagement.test.ts`

Run: `pnpm test && pnpm typecheck && pnpm build`

Expected: focused tests, full suite, typecheck và build đều thoát 0; ảnh của sáu game và ma trận phân loại được lưu.

Commit: `fix: close verified engagement gaps`

### Task 2: Dựng hệ thống E4S chạy local đầy đủ

**Files:**
- Create/modify: `packages/storage/`, `apps/worker/`, database migrations/repositories.
- Create/modify: `docker-compose.yml`, Dockerfiles, health/readiness routes and local scripts.
- Test: storage ownership, job lease/retry/dead-letter, health/readiness and smoke tests.
- Evidence: `evidence/task-10-local/`

**Interfaces:**
- Consumes: các route và domain behavior đã xanh ở Task 1.
- Produces: web, API, worker, PostgreSQL, MinIO và Groq chạy local từ một quy trình tái lập được.

- [ ] Viết test đỏ cho file ownership, competing job lease, retry/dead-letter và readiness.
- [ ] Implement storage, worker và health theo lát cắt nhỏ; mỗi lát cắt GREEN trước khi sang lát tiếp theo.
- [ ] Dựng Docker Engine qua Ubuntu/WSL; khởi động từ empty volumes, chạy smoke và restart chứng minh persistence.
- [ ] Chạy full verification, lưu evidence và commit `feat: run E4S full local service stack`.

### Task 3: Kết nối vận hành và kiểm chứng E4S

**Files:**
- Modify: các route/page Manager và Settings hiện có; không tạo product screen mới.
- Create/update: API tests, web tests, E2E, route × role × state matrix and accessibility evidence.
- Evidence: `evidence/task-09-manager/`, `evidence/task-11-quality/`

**Interfaces:**
- Consumes: PostgreSQL, storage, worker, session/role authorization và stack local xanh từ Task 2.
- Produces: Manager/Settings dùng dữ liệu thật; E2E và evidence đủ để báo cáo checkpoint trung thực.

- [ ] Lập screen-to-data matrix và viết test đỏ cho quyền, loading, empty, success và error.
- [ ] Nối từng màn theo lát cắt dọc, giữ nguyên screen contract và phần nhìn đã chốt.
- [ ] Chạy E2E theo vai trò, keyboard/focus/label/contrast cơ bản và failure paths.
- [ ] Chạy full verification, audit secret, lưu evidence, commit và chỉ sau đó cập nhật RACI/Blueprint theo bằng chứng.

## Quy tắc kết thúc ca

- Chỉ báo cáo sau khi Minh xác nhận kết thúc ca.
- Báo cáo đúng bốn mục của lead: kết quả, phần chưa xong, vướng mắc, lần nộp tiếp theo.
- Chỉ ghi hoàn thành tới cổng có test, ảnh/evidence và local commit; không suy diễn “full V1”.
