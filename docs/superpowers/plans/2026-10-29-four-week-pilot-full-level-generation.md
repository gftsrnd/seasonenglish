# Four-week Pilot Full-level Generation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extend the active local pilot to four weeks and generate distinct week plans plus five daily draft lessons for A1, A2, B1, B2, and C1 in weeks 2–4.

**Architecture:** Keep week suggestions and lesson creation on the existing product APIs. Change the operator batch coordinator so weeks are strict sequential barriers while all active CEFR lanes in one week start together and retain their server-side component checkpoints. Prepare and validate each local week before starting the next.

**Tech Stack:** React, TypeScript, Vitest, Fastify content APIs, PostgreSQL repositories, Anthropic provider.

**Spec:** `docs/superpowers/specs/2026-10-29-four-week-pilot-full-level-generation-design.md`

## Global Constraints

- Keep approved week 1 content unchanged.
- Use WSL/Docker Engine only; do not start Docker Desktop.
- Generate weeks in order 2 → 3 → 4.
- Run A1, A2, B1, B2, and C1 together within one week, with independent resumable server checkpoints.
- Do not start the next week until the current week's five level jobs settle successfully.
- Import/save only complete draft sets; do not approve automatically.
- Never hand-edit generated lesson content.

## Review Focus

- One level fails while its four peers succeed: preserve peers, expose the failed cell, and do not start the next week.
- Five active levels: all five start in the same week batch and peak concurrency is five, not the old limit of two.
- Four selected weeks: no request for week N+1 starts before every request for week N settles successfully.
- Duplicate click for the same week/level: reuse the existing in-flight promise instead of starting a duplicate generation job.
- Interrupted local generation: rerun uses server checkpoints and does not overwrite validated prior components.

---

### Task 1: Make the operator batch coordinator week-scoped

**Files:**
- Modify: `apps/web/src/app/operator/lesson-generation.ts`
- Modify: `apps/web/src/app/operator/lesson-generation.test.ts`

**Interfaces:**
- Consumes: `startLessonGenerationJob(week, level, generate)`
- Produces: `generateLessonCellsSettled(weekNumbers, levels, generate, onStart)` with a strict week barrier and one concurrent lane per active level.

- [ ] **Step 1: Replace the old concurrency-two test with a five-level week-batch test**

Add a test named `runs every level in one week together` that calls the helper with `["A1", "A2", "B1", "B2", "C1"]`, holds each promise, asserts five calls start before any resolves, and asserts peak concurrency equals five.

- [ ] **Step 2: Add a failing strict week-barrier test**

Add `does not start the next week until the current week succeeds`. Hold week 2's five promises, verify no week 3 call occurs, release all week 2 promises, then verify exactly five week 3 calls.

- [ ] **Step 3: Add a failing stop-after-failed-week test**

Make one week 2 lane reject, assert all five week 2 results are returned, and assert no week 3 generation call starts.

- [ ] **Step 4: Run the focused tests and verify they fail**

Run: `pnpm exec vitest run apps/web/src/app/operator/lesson-generation.test.ts`

Expected: the new concurrency and week-barrier assertions fail against the current flat concurrency-two implementation.

- [ ] **Step 5: Implement the week-scoped coordinator**

In `generateLessonCellsSettled`, loop over `weekNumbers`; for each week invoke all `levels` with one `Promise.all`, append settled results, and break before the next week if any level failed. Preserve `onStart(week, level, completed, total)` and the existing result shape.

- [ ] **Step 6: Run the focused tests**

Run: `pnpm exec vitest run apps/web/src/app/operator/lesson-generation.test.ts`

Expected: PASS.

### Task 2: Align the topic-page button and progress copy with the real batch

**Files:**
- Modify: `apps/web/src/app/operator/OperatorRouteController.tsx`
- Modify: `apps/web/src/app/operator/OperatorRouteController.test.tsx`
- Verify: `apps/web/src/app/operator/Weeks.tsx`

**Interfaces:**
- Consumes: the week-scoped `generateLessonCellsSettled` from Task 1 and active levels from `getContentLessonMatrix()`.
- Produces: topic-page generation that includes C1 when active, reports five-level week batches accurately, and leaves later weeks untouched after a failed week.

- [ ] **Step 1: Add a controller test for all active levels**

Return matrix levels `A1, A2, B1, B2, C1`, select one week in the confirmation dialog, start generation, and assert the client receives one generation request for each of the five levels.

- [ ] **Step 2: Add a controller test for failed-week status**

Reject one level in week 2, select weeks 2 and 3, and assert no week 3 request occurs; assert the visible status names the failed week and level and says successful level drafts were kept.

- [ ] **Step 3: Run the controller test and verify the copy assertion fails**

Run: `pnpm exec vitest run apps/web/src/app/operator/OperatorRouteController.test.tsx`

Expected: FAIL on the old “không chạy song song”/flat-batch behavior.

- [ ] **Step 4: Correct progress and completion messaging**

Keep the existing dialog count `selectedWeeks × levelCount × 5`. Replace misleading “không chạy song song” text with copy that states the completed week count and five-level batch behavior. On failure, state that the next week was not started.

- [ ] **Step 5: Run operator tests and web typecheck**

Run: `pnpm exec vitest run apps/web/src/app/operator/lesson-generation.test.ts apps/web/src/app/operator/OperatorRouteController.test.tsx apps/web/src/app/operator/operator-responsive-layout.test.ts`

Run: `pnpm --filter @e4s/web typecheck`

Expected: PASS.

### Task 3: Extend and populate the local four-week pilot

**Files:**
- Runtime data only: active local pilot settings, content weeks, lesson drafts.
- Output evidence: `.artifacts/four-week-pilot/week2`, `.artifacts/four-week-pilot/week3`, `.artifacts/four-week-pilot/week4`.

**Interfaces:**
- Consumes: `PUT /api/v1/manager/settings`, `POST /api/v1/content/weeks/suggestions`, `PUT /api/v1/content/weeks`, and `POST /api/v1/content/lesson-sets/:week/:cefr/generate`.
- Produces: four active pilot weeks and 25 draft lessons per new week.

- [ ] **Step 1: Read current manager settings and content weeks**

Record the active cycle, pilot duration, week 1 payload, current topics, and active CEFR levels before mutation.

- [ ] **Step 2: Extend the active cycle**

Save current settings unchanged except `pilotWeeks: 4`, `weekOverride: 0`, and `pilotCycleAction: "save"`. Verify the returned active cycle still has the same cycle number and start date.

- [ ] **Step 3: Generate topic options for weeks 2–4**

Request `weekNumbers: [2, 3, 4]`. For each week select the first fully validated ranked option, retaining its complete five-level, five-day plan. Verify topics are distinct under the existing near-duplicate validator.

- [ ] **Step 4: Save the complete four-week frame**

Preserve week 1 verbatim and save selected plans for weeks 2–4. Re-read the frame and assert four weeks, five levels, and five day blueprints per new week.

- [ ] **Step 5: Generate week 2**

Start the five level endpoints together. Save logs/evidence under `.artifacts/four-week-pilot/week2`. If any level fails, stop before week 3, retain diagnostics/checkpoints, repair the core rule, and rerun only the failed lane/component.

- [ ] **Step 6: Validate week 2**

Assert five complete level drafts, 25 lessons, vocabulary enrichment coverage, concise objectives/instructions, and valid cross-level output before proceeding.

- [ ] **Step 7: Repeat generation and validation for weeks 3 and 4**

Use identical gates and separate artifact directories. Do not start a later week while the prior week has unresolved findings.

### Task 4: Final four-week verification

**Files:**
- Verify only: generated runtime data and existing test suites.

**Interfaces:**
- Consumes: completed Tasks 1–3.
- Produces: evidence that the local pilot and generation product path are usable.

- [ ] **Step 1: Run AI generation tests**

Run: `pnpm exec vitest run apps/api/src/modules/content/weekly-generation-components.test.ts apps/api/src/modules/content/weekly-generation-cross-level.test.ts apps/api/src/modules/content/week-suggestion-generation.test.ts`

Expected: PASS.

- [ ] **Step 2: Run package typechecks**

Run: `pnpm --filter @e4s/ai typecheck`

Run: `pnpm --filter @e4s/api typecheck`

Run: `pnpm --filter @e4s/web typecheck`

Expected: all PASS.

- [ ] **Step 3: Verify local health and data counts**

Assert web and API return HTTP 200. Assert the content frame has four weeks, weeks 2–4 each have five CEFR draft cells, and each cell has five lessons.

- [ ] **Step 4: Verify the topic-page button behavior directly**

Open the topic page, select a generated week, confirm the dialog reports five active levels and 25 lessons, and verify the lesson page shows one observable job per level without starting the next selected week early.

- [ ] **Step 5: Run `git diff --check`**

Expected: no whitespace errors.
