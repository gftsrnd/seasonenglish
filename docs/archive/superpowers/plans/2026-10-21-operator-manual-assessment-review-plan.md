# Operator manual assessment review Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn the Operator assessment detail modal into a prototype-faithful review and manual-scoring surface with actual section timing, grouped evidence, rubric scoring, confirmation, and persisted human scores.

**Architecture:** Reuse the existing `assessment_scores`, `assessment_attempts.timing_state`, `audit_events`, and `ContentReviewAssessmentDetailView` flow. Add a reviewer-guarded manual-score repository method and route, enrich the detail contract with section metadata/group evidence/timing, and isolate the rubric form in a focused Operator component that the existing detail modal hosts.

**Tech Stack:** TypeScript, React 19, Fastify, Zod, PostgreSQL, Vitest, Testing Library, pnpm workspaces.

**Spec:** `docs/superpowers/specs/2026-10-21-operator-review-flow-design.md`

## Global Constraints

- Use the existing `assessment_scores` table with `source = 'human'`; do not create a parallel manual-score table.
- Validate all rubric values server-side as integers from 0 through 5.
- Writing score is `sum / 25 * 20`; Speaking score is the sum of four 0–5 criteria and is out of 20.
- Listening and Reading scores remain read-only in the manual form.
- Actual section time is derived only from persisted `timing_state.sections`; missing timing is `—`, never fabricated as zero.
- Keep provider secrets and raw audit JSON out of browser responses.
- Preserve existing Operator organization scoping and reviewer guards.
- Preserve the existing bottom toast and confirmation patterns; do not add a new notification system.

## Review Focus

- A submitted attempt with no Writing/Speaking score still renders both sections as “Chưa chấm” and exposes the correct rubric inputs.
- An old attempt with no section timing shows `—` for actual duration while retaining its configured limit.
- A partially completed rubric cannot be submitted, and a confirmed valid rubric persists normalized scores rather than client-calculated totals.
- A cross-organization attempt cannot be manually scored or read through the new route.
- A failed save leaves the entered rubric and comment in the modal and emits an error toast instead of closing or clearing the form.

---

### Task 1: Enrich the assessment detail contract and repository projection

**Files:**
- Modify: `packages/contracts/src/content-contract.ts`
- Modify: `packages/database/src/repositories.ts`
- Test: `apps/api/test/assessment-review-lifecycle.test.ts` or the focused assessment-review integration test file already covering detail responses

**Interfaces:**
- Produces `ContentReviewAssessmentSectionView` metadata for each fixed section: `maxScore`, `durationMinutes`, `actualSeconds: number | null`, `cefr: string | null`, grouped task evidence, and current manual-review criteria/comment.
- Produces a stable `totalTimeSeconds: number | null` and a `totalTimeLimitMinutes` on `ContentReviewAssessmentDetailView`.
- Produces grouped Listening/Reading evidence from blueprint groups, preserving Writing and Speaking task prompts/answers.

- [ ] **Step 1: Write failing contract/projection tests** asserting the detail includes four sections in Listening/Reading/Writing/Speaking order, configured limits 15/20/20/15, group labels for LA/LB/LC and R1–R4, a total row source value, and `actualSeconds: null` when timing is absent.
- [ ] **Step 2: Run the focused API test and verify it fails** because the new metadata is absent.
- [ ] **Step 3: Extend the contract types** with section metadata, grouped evidence, timing fields, and manual-review fields without removing existing fields consumed by the dashboard.
- [ ] **Step 4: Project blueprint groups and timing state** in `getReviewAttempt`; calculate actual seconds only when both persisted section timestamps exist, derive the total only when all four actual durations exist, and map blueprint CEFR labels without leaking blueprint internals.
- [ ] **Step 5: Run the focused test and verify it passes.**

### Task 2: Add the reviewer-guarded manual-score API

**Files:**
- Modify: `packages/contracts/src/content-contract.ts` or the assessment contract module for the request/response input types
- Modify: `apps/api/src/modules/assessment/routes.ts`
- Modify: `packages/database/src/repositories.ts`
- Test: `apps/api/test/assessment-review-manual-score.integration.test.ts`

**Interfaces:**
- Adds `ManualAssessmentScoreInput` with Writing criteria, Speaking criteria, and one shared comment.
- Adds `manualScoreAssessment(reviewerId, attemptId, input): Promise<boolean | null>` or the repository-equivalent method that returns `null` when the attempt is not reviewable or out of organization scope.
- Adds `POST /api/v1/assessment-reviews/:attemptId/manual-score`, returning a refreshed `ContentReviewAssessmentDetailView`.

- [ ] **Step 1: Write failing integration tests** for valid save, invalid 0–5 values, missing required criteria, non-reviewable attempt, cross-organization attempt, and audit-event creation.
- [ ] **Step 2: Run the new integration test and verify it fails** because the route/client contract does not exist.
- [ ] **Step 3: Implement Zod validation and the reviewer-guarded route**; reject malformed UUIDs, invalid rubrics, and attempts outside the reviewer organization with the project’s existing error-code conventions.
- [ ] **Step 4: Implement the repository transaction** to verify scope/status, upsert Writing and Speaking `assessment_scores` with `source = 'human'`, store criteria plus comment, and append an `assessment.manual_score` audit event. Compute section scores on the server.
- [ ] **Step 5: Return the refreshed detail projection** and run the focused integration tests until all cases pass.

### Task 3: Persist and expose actual section timing

**Files:**
- Modify: `packages/database/src/repositories.ts`
- Modify: `apps/api/src/modules/assessment/routes.ts` only where section transitions/forced submit currently update timing state
- Test: `apps/api/test/assessment-runtime.integration.test.ts` and the detail projection test from Task 1

**Interfaces:**
- Existing `timing_state.sections[section]` gains/retains `startedAt`, `endsAt`, and `completedAt` for manual and timeout transitions.
- Detail projection consumes those timestamps and returns actual seconds plus configured limits.

- [ ] **Step 1: Write failing timing tests** for manual section transition, timeout/forced submit, and total duration calculation.
- [ ] **Step 2: Run the timing tests and verify the missing completion timestamps or projection causes failure.**
- [ ] **Step 3: Update transition and submit paths** so every completed section records `completedAt`, including automatic timeout/violation submission, while preserving existing runtime behavior.
- [ ] **Step 4: Add the duration projection helper** with explicit incomplete-data behavior (`null` actual time).
- [ ] **Step 5: Run the timing and existing assessment-runtime tests and verify they pass.**

### Task 4: Connect the Operator API client and controller

**Files:**
- Modify: `apps/web/src/api/operator.ts`
- Modify: `apps/web/src/app/operator/OperatorRouteController.tsx`
- Modify: `apps/web/src/app/operator/types.ts` if the callback/input needs a shared UI type
- Test: `apps/web/src/app/operator/OperatorRouteController.test.tsx`

**Interfaces:**
- `OperatorApiClient.manualScoreAssessment(attemptId, input): Promise<ContentReviewAssessmentDetailView>`.
- `OperatorReviewAssessmentDetail` receives an `onSaveManualScore(input)` callback and a saving state; it remains presentational and does not call the API directly.

- [ ] **Step 1: Write failing controller tests** asserting the manual-score client method receives the attempt ID and rubric payload only after confirmation, refreshes the overview/detail, and shows success/error toast states.
- [ ] **Step 2: Run the controller tests and verify they fail** because the client method and callback are absent.
- [ ] **Step 3: Add the API client method** using the new POST route and add the controller save handler with read-only/capability guards.
- [ ] **Step 4: Re-fetch the detail after a successful save** and use the existing toast path; retain the modal and form values after failure.
- [ ] **Step 5: Run the focused controller tests and verify they pass.**

### Task 5: Build the prototype-faithful detail and manual rubric UI

**Files:**
- Create: `apps/web/src/app/operator/AssessmentManualScore.tsx`
- Test: `apps/web/src/app/operator/AssessmentManualScore.test.tsx`
- Modify: `apps/web/src/app/operator/Review.tsx`
- Modify: `apps/web/src/app/operator/Review.audio.test.tsx`
- Modify: `apps/web/src/app/operator/styles.css`

**Interfaces:**
- `AssessmentManualScore({ detail, disabled, busy, onSave })` owns draft rubric/comment state and emits the exact `ManualAssessmentScoreInput` shape.
- `OperatorReviewAssessmentDetail` renders the summary and grouped evidence, then hosts the form below Writing/Speaking and the existing collapsed processing/integrity logs.

- [ ] **Step 1: Write failing component tests** for:
  - summary columns `Kỹ năng`, `Điểm`, `CEFR`, `Thời gian` plus a `Tổng` row;
  - Listening Part A/B/C and Reading Questions 1–10/11–20/21–30/31–40 labels;
  - Writing two task responses and five 0–5 controls;
  - Speaking four task responses and four 0–5 controls with no pronunciation control;
  - score conversion, required-field validation, and confirmation before `onSave`;
  - collapsed default evidence/history and preserved audio playback.
- [ ] **Step 2: Run the focused component tests and verify they fail** because the current modal has the old source/status table and no rubric form.
- [ ] **Step 3: Implement the focused rubric component** with controlled numeric inputs, computed preview scores, one shared comment field, and a confirmation step using the existing modal/confirmation primitive.
- [ ] **Step 4: Replace the modal’s source/status presentation** with score/CEFR/actual-time metadata, total row, grouped evidence blocks, and the manual form; keep missing answers visible and logs collapsed by default.
- [ ] **Step 5: Add responsive styling** so each learner/task remains one readable row/card level without nested cards, and keep the save action visible on narrow screens.
- [ ] **Step 6: Run the focused UI tests and verify they pass.**

### Task 6: Full verification and handoff

**Files:**
- Test: `apps/web/src/app/operator/*.test.tsx`, `apps/api/test/assessment-review-manual-score.integration.test.ts`, `apps/api/test/assessment-runtime.integration.test.ts`

- [ ] **Step 1: Run all Operator web tests.** Expected: all existing and new Operator tests pass.
- [ ] **Step 2: Run the API assessment-review/runtime integration tests.** Expected: manual-score, timing, organization-scope, and existing runtime cases pass.
- [ ] **Step 3: Run `pnpm typecheck` and `pnpm --filter @e4s/web typecheck`.** Expected: no TypeScript errors.
- [ ] **Step 4: Run `pnpm --filter @e4s/web build`.** Expected: Vite production build succeeds.
- [ ] **Step 5: Run `git diff --check` and report any unrelated pre-existing failures separately.**

