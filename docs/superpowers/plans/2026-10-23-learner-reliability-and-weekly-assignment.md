# Learner Reliability and Weekly Assignment Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make Mini game, weekly practice assignment, scenario accounts, assessment integrity, listening audio, and staff review screens behave consistently for real learners.

**Architecture:** Treat the published weekly lesson set as the shared source of truth for Mini game access and weekly-practice content. Reuse `practice_submissions.status = 'draft'` for staff assignments, keep assessment violations server-authoritative, and reshape staff UI data into learner-grouped view models before rendering.

**Tech Stack:** TypeScript, React, Fastify, PostgreSQL, Vitest, pnpm workspace, Docker Compose under WSL.

**Spec:** `docs/superpowers/specs/2026-10-23-learner-reliability-design.md`

## Global Constraints

- Mini game stays locked until the learner's current CEFR has a published weekly lesson set; it must not require a pre-created `game_sets` row.
- Once open, custom safe natural topics work independently; weekly vocabulary is only an optional source.
- Automatic weekly practice opens after five published lessons are complete; Manager and Operator may assign it earlier through a real draft submission.
- Manager placement is **Tiến độ**, beside **Hồ sơ**; Operator placement is **Duyệt mức → Đã duyệt**, beside **Hồ sơ**.
- Shared preview/editing is **Operator → Bài học → Bài thực hành cuối tuần** after the five lessons; no invented profile page or hidden submenu.
- Weekly-practice microphone is speech-to-text only and never claims to upload or retain audio.
- Existing user changes in the dirty worktree must be preserved; do not reset, discard, or commit unrelated files.
- Build with WSL Ubuntu and Docker Compose only after focused tests pass.

## Review Focus

- A published week with no game set must return an open empty hub and permit a safe custom topic; Task 1 tests both conditions.
- Concurrent Manager/Operator assignment requests must create exactly one draft and return an already-assigned result for the duplicate; Task 3 tests this race/idempotency boundary.
- A learner submitting an assigned draft must update that row instead of creating or skipping another row; Task 3 tests draft-to-submitted identity preservation.
- Logout violation recording must fail closed: if the server cannot record the warning, the app must not silently log out; Task 7 tests this error state.
- Re-running scenario preparation must preserve row counts and restore drifted published data; Task 4 tests both idempotency and repair.

---

### Task 1: Mini game access and natural-topic bootstrap

**Files:**
- Modify: `packages/contracts/src/engagement-contract.ts`
- Modify: `packages/database/src/repositories.ts`
- Modify: `apps/api/src/modules/engagement/routes.ts`
- Modify: `apps/api/test/engagement.integration.test.ts`
- Modify: `apps/api/test/game-topic-moderation.integration.test.ts`
- Modify: `apps/web/src/api/learner.ts`
- Modify: `apps/web/src/app/learner/contracts.ts`
- Modify: `apps/web/src/app/learner/GamesUx.test.tsx`
- Modify: `apps/web/src/app/learner/Games.tsx` if present, otherwise the current Mini game page selected by the learner router

**Interfaces:**
- Produces: `GameHubView` with `access: "locked" | "open"`, nullable active word set, and a specific weekly-vocabulary availability state.
- Produces: repository lookup that resolves the current published lesson set by learner CEFR/week without requiring `game_sets`.

- [ ] **Step 1: Write failing repository/API tests** asserting unpublished week → locked, published week + zero game sets → HTTP 200 open hub, safe natural topic → created active set, and unavailable weekly vocabulary → explicit nonfatal state.
- [ ] **Step 2: Run `pnpm --filter @e4s/api test -- engagement.integration.test.ts game-topic-moderation.integration.test.ts`** and verify the new assertions fail on `GAME_SET_NOT_FOUND` or the old contract.
- [ ] **Step 3: Make `gameHub(learnerId)` gate on the published lesson-set version and return a nullable word set; make custom generation resolve learner/week/CEFR directly.** Keep existing topic moderation and token limits unchanged.
- [ ] **Step 4: Write failing learner component tests** asserting topic input and **Tạo bộ từ** are enabled in the open-empty state while game tiles remain disabled until generation succeeds.
- [ ] **Step 5: Update the learner API adapter and Mini game UI** to distinguish locked, open-empty, active-set, and weekly-vocabulary-unavailable states.
- [ ] **Step 6: Run the focused API and web Mini game tests** and require all to pass.

### Task 2: Publishable weekly-practice content and shared preview

**Files:**
- Create: `packages/database/migrations/0074_weekly_practice_spec.sql`
- Modify: `packages/database/src/schema.ts`
- Modify: `packages/database/src/repositories.ts`
- Modify: `packages/contracts/src/content-contract.ts`
- Modify: `apps/api/src/modules/content/routes.ts`
- Modify: `apps/api/test/content.integration.test.ts`
- Modify: `apps/web/src/app/operator/Lessons.tsx`
- Modify: `apps/web/src/app/operator/OperatorRouteController.tsx`
- Modify: `apps/web/src/app/operator/OperatorRouteController.test.tsx`
- Modify: `apps/web/src/app/operator/operator.css` or the active operator stylesheet

**Interfaces:**
- Produces: `WeeklyPracticeSpec { promptEn, guidanceVi, inputMode: "text_or_dictation", requiredVocabulary: string[] }` embedded in each lesson-set version and frozen on publish.
- Produces: content API read/update behavior for draft versions; published versions are read-only.

- [ ] **Step 1: Add failing schema and content integration tests** for draft save, publish snapshot, and rejection of edits to a published weekly-practice spec.
- [ ] **Step 2: Run the focused database/content tests** and verify failure because the field and route behavior do not exist.
- [ ] **Step 3: Add migration, schema mapping, contracts, repository serialization, and route validation** with deterministic default content derived from topic and CEFR when an older draft has no spec.
- [ ] **Step 4: Add failing operator component tests** for the **Bài thực hành cuối tuần** block after the five lessons, exact preview fields, draft editing, published read-only state, and an edit-source link from assignment confirmation.
- [ ] **Step 5: Implement the Bài học preview/editor** without adding a new navigation item or profile screen.
- [ ] **Step 6: Run focused content and operator tests** and require all to pass.

### Task 3: Real weekly-practice assignment for Manager and Operator

**Files:**
- Modify: `packages/contracts/src/manager-contract.ts`
- Modify: `packages/contracts/src/assessment-contract.ts` or the existing operator overview contract
- Modify: `packages/database/src/repositories.ts`
- Modify: `apps/api/src/modules/manager/routes.ts`
- Modify: `apps/api/src/modules/assessment/routes.ts` or the existing operator learner-operation route
- Modify: `apps/api/src/modules/engagement/routes.ts`
- Modify: `apps/api/test/engagement.integration.test.ts`
- Modify: `apps/api/test/operator-learner-operations.integration.test.ts`
- Modify: `apps/web/src/api/manager.ts`
- Modify: `apps/web/src/api/shared.ts`
- Modify: `apps/web/src/app/manager/Progress.tsx`
- Modify: `apps/web/src/app/manager/manager-app.test.tsx`
- Modify: `apps/web/src/app/operator/Dashboard.tsx`
- Modify: `apps/web/src/app/operator/operator-app.test.tsx`

**Interfaces:**
- Produces: `assignWeeklyPractice(learnerId)` returning `assigned | already_assigned | not_eligible` plus the published task snapshot.
- Consumes: `WeeklyPracticeSpec` from Task 2.

- [ ] **Step 1: Add failing repository/API tests** for Manager and Operator authorization, approved-learner eligibility, exact task snapshot, duplicate/concurrent idempotency, and already-submitted behavior.
- [ ] **Step 2: Add a failing learner submission test** proving an assigned draft keeps its ID and transitions atomically to `submitted`.
- [ ] **Step 3: Implement one transactional repository assignment method** used by both role routes and update submission to lock/update an existing draft.
- [ ] **Step 4: Add failing Manager UI tests** for **Tiến độ** row placement beside **Hồ sơ**, preview confirmation, success status, and hidden/disabled states.
- [ ] **Step 5: Add failing Operator UI tests** for **Duyệt mức → Đã duyệt** row placement beside **Hồ sơ**, the same confirmation, and link back to **Bài học**.
- [ ] **Step 6: Implement both row actions using the shared API result model**; do not route through a profile modal.
- [ ] **Step 7: Run focused repository, API, Manager, Operator, and learner submission tests** and require all to pass.

### Task 4: Idempotent complete scenario data

**Files:**
- Modify: `scripts/local-scenario-accounts.ts`
- Modify: `scripts/prepare-local-scenarios.ts`
- Modify: `scripts/local-scenario-accounts.integration.test.ts`
- Modify: `docs/local-scenario-accounts.md`

**Interfaces:**
- Produces: deterministic A2 and B1 published lesson sets, five published lesson versions each, weekly-practice specs, and reusable game vocabulary for every documented learner scenario.

- [ ] **Step 1: Extend the scenario integration test table** so every documented account asserts profile/enrollment, checkpoint, published week, Mini game access, weekly-practice state, and credentials category.
- [ ] **Step 2: Add failing tests** for repairing drift and for two consecutive runs preserving counts.
- [ ] **Step 3: Update the seeder** to upsert the deterministic published A2/B1 data, clear conflicting scenario-only drift, and fail unless each level has exactly five published lessons and a valid practice spec.
- [ ] **Step 4: Run the scenario integration tests against the test database**, then run the preparer twice and compare counts.
- [ ] **Step 5: Refresh `docs/local-scenario-accounts.md`** with the complete test-account table and verified expected state.

### Task 5: Weekly-practice dictation control

**Files:**
- Modify: `apps/web/src/app/learner/Learning.tsx`
- Modify: `apps/web/src/app/learner/Learning.test.tsx`
- Modify: `apps/web/src/app/learner/learner.css`

**Interfaces:**
- Produces: compact dictation control with idle, listening, unsupported, and error states; no audio-file language.

- [ ] **Step 1: Add failing component tests** for labels `Nói để nhập` and `Đang nghe — bấm để dừng`, `aria-pressed`, stop behavior, unsupported browser copy, and submit disabled while listening.
- [ ] **Step 2: Run the focused Learning tests** and verify current stretched/unobservable control fails.
- [ ] **Step 3: Extract or refactor the SpeechRecognition lifecycle** so start/stop/end/error deterministically update visible state and append transcript to the text answer.
- [ ] **Step 4: Add compact button/status styling** that does not stretch to textarea width at desktop or narrow widths.
- [ ] **Step 5: Run focused tests and inspect both responsive widths.**

### Task 6: Grouped Operator review queues

**Files:**
- Modify: `apps/web/src/app/operator/Review.tsx`
- Modify: `apps/web/src/app/operator/operator-app.test.tsx`
- Modify: `apps/web/src/app/operator/operator.css` or the active operator stylesheet

**Interfaces:**
- Produces: pure grouping helpers for coach turns, appeals, and attempts keyed first by learner.

- [ ] **Step 1: Add failing tests** for collapsed learner summaries, expansion, latest/unread counts, appeal history, action-footer separation, and attempts grouped learner → lesson.
- [ ] **Step 2: Run focused Operator tests** and verify raw-list rendering fails the new assertions.
- [ ] **Step 3: Implement grouping helpers and accessible disclosure cards** while preserving existing mutation handlers and checked-state behavior.
- [ ] **Step 4: Add responsive footer/button wrapping CSS** and verify action buttons never touch at narrow width.
- [ ] **Step 5: Run focused tests and inspect desktop/narrow layouts.**

### Task 7: Assessment logout integrity guard

**Files:**
- Modify: `packages/contracts/src/assessment-contract.ts`
- Modify: `apps/api/src/modules/assessment/routes.ts`
- Modify: `apps/api/test/assessment-runtime.integration.test.ts`
- Modify: `apps/web/src/app/learner/AssessmentRuntime.tsx`
- Modify: `apps/web/src/app/learner/Assessment.test.tsx`
- Modify: `apps/web/src/app/shared/AppShell.tsx`
- Modify: `apps/web/src/app/shared/AppShell.test.tsx`

**Interfaces:**
- Produces: active assessment guard registration with `requestLogout(): Promise<"resume" | "logout" | "auto_submitted">`.
- Consumes: existing violation endpoint with reason `logout` and server-owned count/limit.

- [ ] **Step 1: Add failing API test** proving `logout` is accepted as a violation reason and can auto-submit at the configured limit.
- [ ] **Step 2: Add failing shell/runtime tests** for confirmation copy, warning recording before logout, server auto-submit, cancel/resume, and network failure preventing silent logout.
- [ ] **Step 3: Extend the violation contract and runtime guard** without duplicating counters in the browser.
- [ ] **Step 4: Wire the AppShell logout action through the registered active-attempt guard** and preserve immediate logout outside assessments.
- [ ] **Step 5: Run focused assessment and shell tests.**

### Task 8: Clear listening assets and production-bundle verification

**Files:**
- Modify: `scripts/generate-placement-listening-audio.ps1`
- Modify: `scripts/placement-listening-audio.test.ts`
- Modify: `scripts/verify-media-assets.mjs`
- Modify: `scripts/verify-media-assets.test.mjs`
- Replace: `apps/web/public/media/audio/placement-listening-LA.wav`
- Replace: `apps/web/public/media/audio/placement-listening-LB.wav`
- Replace: `apps/web/public/media/audio/placement-listening-LC.wav`
- Modify: `apps/web/public/media/manifest.json`
- Modify: or create focused served-bundle verification under `scripts/`

**Interfaces:**
- Produces: dry mono listening WAV assets with measurable peak/RMS/loudness bounds and no reverb/spatial processing.

- [ ] **Step 1: Tighten failing audio tests** for mono channel count, sample rate, minimum RMS/peak headroom, silence bounds, and removal of the current spatial/dynamic filter chain.
- [ ] **Step 2: Regenerate the three listening assets** using the clear dry voice path and update manifest checksums/durations.
- [ ] **Step 3: Run media verification** and manually compare playback with the headphone-test asset at the same system volume.
- [ ] **Step 4: Add a served-bundle test** asserting compact Season labels are present and stale visible labels are absent after production build.
- [ ] **Step 5: Run focused media and Season tests.**

### Task 9: Integrated verification and Docker WSL rebuild

**Files:**
- Modify only files required by failures found in this verification task.

**Interfaces:**
- Consumes all interfaces from Tasks 1–8.

- [ ] **Step 1: Run affected workspace typechecks and focused test suites** for contracts, database, API, web, scripts, and media.
- [ ] **Step 2: Run the full scenario account reconciliation twice** and save the final account/state table for handoff.
- [ ] **Step 3: Build required services with `C:\Program Files\WSL\wsl.exe -d Ubuntu-26.04` and Docker Compose**, then recreate only changed services.
- [ ] **Step 4: Smoke-test as learner, Manager, and Operator**: open Mini game with a published week/no set, create a natural-topic set, preview/assign/submit weekly practice, verify grouped review, and verify assessment logout warning.
- [ ] **Step 5: Inspect the served JS bundle and current browser UI** for compact Season copy, then report exact tests, containers, and any remaining limitation.
