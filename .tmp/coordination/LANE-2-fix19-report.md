# Lane 2 — fix19 final report

Base: `7317ef11838313ff4130668385f88a895784400c`  
Worktree: `e4s-fix19-worktree`  
Verification: 2026-10-20, headed desktop, local Web `http://127.0.0.1:4182/`, real API `http://127.0.0.1:3001`

## Final gate

**PASS 19/19 · FAIL 0 · UNVERIFIED 0.**

The current email/password product intent was used throughout; no legacy PIN flow was restored. Column M was not edited here because the workbook is an Office file opened in Google Sheets; the coordinator should insert the referenced PNGs through the visible workbook UI.

## Criterion mapping

Rows are 1-based Excel rows from `.tmp/inventory/E4S-checklist-latest.xlsx`. Every PASS below has an exact-state PNG, not a generic route screenshot.

| ID | Sheet / row | Status | Exact trigger and expected result | Evidence / route and API |
|---|---:|---|---|---|
| C-001 | Chung / 2 | PASS | Opened a fresh unauthenticated session; entry screen shows no learner/staff session data. | `evidence/C-001-local-api-empty-session-entry.png`; `/`, `GET /api/session → 401 UNAUTHENTICATED`. |
| C-004 | Chung / 5 | PASS | Submitted learner email/password with wrong-case password; login is rejected under current credentials. | `evidence/C-004-local-api-email-password-rejects-wrong-case.png`; `POST /api/auth/learner/login → 401`, no session. |
| A-001 | Bổ sung / 2 | PASS | Entered password and clicked reveal; exact password value becomes visible. | `evidence/A-001-local-api-password-reveal.png`; `/`, password input changes to `type=text`. |
| A-002 | Bổ sung / 3 | PASS | Clicked “Quên mật khẩu?”; current design displays operator/manager reset instruction. | `evidence/A-002-local-email-password-reset-request.png`; `/`, status banner shows current reset instruction. |
| A-003 | Bổ sung / 4 | PASS | Submitted learner credentials in staff panel; wrong-role warning directs to learner panel. | `evidence/A-003-local-api-wrong-role-warning.png`; real staff login rejects learner as `WRONG_LOGIN_PATH`. |
| L-001 | Người học / 2 | PASS | Selected learner login; email and password fields are present and usable. | `evidence/L-001-local-api-learner-email-password-form.png`; `/`, current form. |
| L-002 | Người học / 3 | PASS | Submitted unknown email; API rejects it and no learner session is created. | `evidence/L-002-local-api-unknown-email-rejected.png`; real learner login `401 INVALID_CREDENTIALS`. |
| L-003 | Người học / 4 | PASS | Submitted a three-character password; client blocks submission with minimum-length error. | `evidence/L-003-local-api-short-password-rejected.png`; `/`, exact validation state. |
| L-004 | Người học / 5 | PASS | Entered mismatching first-setup password confirmation; form shows mismatch and blocks save. | `evidence/L-004-local-email-password-first-setup-mismatch.png`; `/onboard`, exact mismatch state. |
| L-005 | Người học / 6 | PASS | Registered an existing learner email; API rejects duplicate. | `evidence/L-005-local-api-duplicate-email-rejected.png`; real registration `409 LEARNER_REGISTRATION_EMAIL_EXISTS`. |
| L-008 | Người học / 9 | PASS | Typed invalid email and then saved uppercase email; live error appears and valid value is normalized. | `evidence/L-008-local-api-live-email-error.png`, `evidence/L-008-local-api-uppercase-normalized.png`; `/onboard`, profile save returns `jame@gmail.com`. |
| L-044 | Người học / 47 | PASS | Opened seeded weekly lesson path in learner desktop flow; lesson-day state is visible. | `evidence/L-044-L-046-lesson-initial.png`; `/home` → weekly lesson state. |
| L-046 | Người học / 50 | PASS | Opened seeded lesson state for the learner lesson content/translation path. | `evidence/L-044-L-046-lesson-initial.png`; `/home` weekly lesson state. |
| L-056 | Người học / 64 | PASS | Opened avatar picker and selected an avatar option; selected state is visible. | `evidence/L-056-local-api-avatar-options.png`; `/profile`, authenticated learner. |
| O-013 | Người vận hành / 14 | PASS | Edited week topic and saved the week frame; saved topic remains visible. | `evidence/O-013-local-api-week-form-saved.png`; `/op/weeks`, `PUT /api/v1/content/weeks → 200`. |
| O-015 | Người vận hành / 16 | PASS | Changed existing topic manually and saved; five existing day lesson IDs/titles remained identical after reload. | `evidence/O-015-local-api-topic-edit-saved.png` + `evidence/O-015-local-api-five-day-plan-preserved.png`; `/op/weeks → /home`, real PUT and learner GET both 200, 5/5 plan preserved. |
| O-026 | Người vận hành / 27 | PASS | Edited a prompt, saved it, then reset; both exact states are visible. | `evidence/O-026-local-api-prompt-saved.png`, `evidence/O-026-local-api-prompt-reset.png`; `/op/prompts`. |
| M-007 | Quản lý / 8 | PASS | Opened progress, used shortcut/export, and completed CSV download. | `evidence/M-007-local-api-progress-shortcuts-csv.png` plus `evidence/M-007-local-api-e4s-tien-do.csv`; `/mgr`. |
| M-015 | Quản lý / 16 | PASS | Selected “đủ điểm, thiếu huy hiệu”; deterministic result stays level 1 because badge is missing. | `evidence/M-015-local-api-reward-simulation-case.png`; `/mgr/rewards`. |

## O-015 focused verification

The headed harness `.tmp/coordination/fix19-o015-local-api-evidence.mjs` records the pre-save learner plan, performs the topic edit through visible operator UI, confirms `PUT /api/v1/content/weeks` returned 200 and the saved topic, reloads learner desktop home, and asserts the five `(id, dayNumber, title)` tuples are identical before and after. This passed with five lessons preserved and the updated topic visible in learner home.

## Code and focused verification

- Production: current email/password reset affordance and onboarding email validation/normalization in `apps/web/src/app/shared/EntryScreen.tsx` and `apps/web/src/app/learner/Onboard.tsx`.
- Harness/report: `.tmp/coordination/fix19-local-api-evidence.mjs`, `.tmp/coordination/fix19-ops-manager-local-evidence.mjs`, `.tmp/coordination/fix19-o015-local-api-evidence.mjs`.
- Passed: `pnpm exec vitest run apps/web/src/app/shared/EntryScreen.test.tsx apps/web/src/app/learner/Onboard.test.tsx apps/web/src/app/operator/OperatorRouteController.test.tsx`.
- Workspace typecheck remains blocked by pre-existing package-resolution errors outside changed behavior; not counted as a criterion failure.

Evidence directory: `D:/TTS - AI Application - Huynh Doan Hoang Minh/12_10_2026 - 17_10_2026/E4S/e4s-fix19-worktree/.tmp/coordination/evidence/`
