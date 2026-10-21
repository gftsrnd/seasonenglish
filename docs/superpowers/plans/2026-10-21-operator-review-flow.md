# Operator Review Flow Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Make Operator review data accurate, AI status truthful, assessment detail complete, and the review page visually readable.

**Architecture:** Add an organization-aware server-side AI runtime resolver that uses encrypted Manager provider settings without exposing credentials, while retaining the environment provider as a local fallback. Extend the assessment review contract/repository with mutually exclusive lifecycle buckets, four-section score summaries, and readable activity entries. Rebuild the existing Operator dashboard/detail surfaces around those contracts and the existing toast pattern.

**Tech Stack:** TypeScript, Fastify, PostgreSQL, React, Vitest, existing `@e4s/ai` providers and contract packages.

**Spec:** `docs/superpowers/specs/2026-10-21-operator-review-flow-design.md`

## Global Constraints

- Provider secrets remain server-side and encrypted at rest.
- The browser receives booleans/status labels only, never credentials or decrypted secrets.
- A learner must appear in exactly one assessment lifecycle bucket.
- Missing scores are displayed as “Chưa chấm”, never as zero.
- AI failure never blocks manual review or hides a submitted attempt.
- Existing organization scoping and approval semantics remain enforced.

## Review Focus

- A Manager-saved provider key must work without an API restart; test with a configured database provider and with the environment fallback.
- Pending-review and needs-retry attempts must not appear under “Chưa bắt đầu”; pin each status in the repository integration test.
- A test with only deterministic scores must still render all four sections and “Chưa chấm” for productive sections.
- Empty integrity/activity history must render an explicit empty state rather than a blank block.
- A failed AI request must leave the review card and manual approval controls usable.

---

### Task 1: Add organization-aware AI runtime resolution and truthful capability status

**Files:**
- Create: `apps/api/src/modules/ai/runtime.ts`
- Modify: `apps/api/src/app.ts`
- Modify: `apps/api/src/server.ts`
- Modify: `apps/api/src/modules/system/routes.ts`
- Modify: AI-using route modules under `apps/api/src/modules/{assessment,coach,content,engagement,learning}/`
- Modify: provider repository methods in `packages/database/src/repositories.ts`
- Test: `apps/api/test/provider-settings.integration.test.ts`
- Test: `apps/api/test/health.integration.test.ts`

**Interfaces:**
- Produce `AiRuntimeResolver` with `forUser(userId): Promise<{ runner?: AiTaskRunner; status: AiRuntimeStatus }>` and `statusForUser(userId): Promise<AiRuntimeStatus>`.
- `AiRuntimeStatus` exposes only `configured`, `available`, `provider`, `model`, `lastTestStatus`, `lastTestCode`, and `lastTestedAt`.
- Consume the existing encrypted provider configuration repository and `createAiService`/`createGroqProvider` abstractions.

- [ ] **Step 1: Write failing integration tests** for a Manager-saved provider configuration being reported as configured/available to Operator capabilities, for an absent configuration reporting not configured, and for environment fallback preserving local behavior.
- [ ] **Step 2: Run the focused API tests** and verify they fail because system capabilities currently use only `Boolean(options.aiRunner)`.
- [ ] **Step 3: Implement the resolver** so it loads the organization provider configuration, decrypts only inside the server runtime, constructs the provider/service on demand, and returns a status object without secret fields. Keep the current environment runner as fallback when no organization configuration exists.
- [ ] **Step 4: Thread the resolver through AI-using routes** so request-scoped calls use the current organization configuration and availability checks no longer depend on a process-wide boolean.
- [ ] **Step 5: Make `/api/v1/system/capabilities` return the request user’s AI status** and update Operator adapters to consume that status.
- [ ] **Step 6: Run `pnpm exec vitest run apps/api/test/provider-settings.integration.test.ts apps/api/test/health.integration.test.ts --reporter=dot --maxWorkers=1`** and verify PASS.

### Task 2: Correct assessment lifecycle buckets and contract data

**Files:**
- Modify: `packages/contracts/src/assessment-contract.ts`
- Modify: `packages/database/src/repositories.ts`
- Modify: `apps/api/src/modules/assessment/routes.ts`
- Test: `apps/api/test/operator-review-detail.integration.test.ts`
- Test: repository assessment integration coverage near `packages/database/test/`

**Interfaces:**
- Extend the overview view with `inProgressLearners`, `retryLearners`, and `unstartedLearners`, each using the existing learner identity/profile fields plus a stable lifecycle status.
- Keep `pendingAssessments` and `approvedLearners` as the source of truth for those two states.

- [ ] **Step 1: Write failing repository/API tests** with learners in `pending_review`, `approved`, `in_progress`, `submitted`, `needs_retry`, and no placement attempt; assert each appears once in the expected bucket.
- [ ] **Step 2: Run the focused integration tests** and verify the current `unassessedLearners` query incorrectly includes pending-review learners.
- [ ] **Step 3: Replace the approved-only exclusion query** with latest-placement-attempt classification, using deterministic precedence: pending review, approved, needs retry, in progress/submitted, then unstarted.
- [ ] **Step 4: Map the new fields in the assessment overview route and web adapter** without changing approval/retry mutation semantics.
- [ ] **Step 5: Run the focused repository/API tests** and verify the bucket exclusivity assertions pass.

### Task 3: Return complete four-section detail and readable activity history

**Files:**
- Modify: `packages/contracts/src/assessment-contract.ts`
- Modify: `packages/database/src/repositories.ts`
- Modify: `apps/api/src/modules/content/routes.ts`
- Modify: `apps/web/src/app/operator/Review.tsx`
- Modify: `apps/web/src/app/operator/types.ts`
- Test: `apps/api/test/operator-review-detail.integration.test.ts`
- Test: `apps/web/src/app/operator/Review.audio.test.tsx`

**Interfaces:**
- Add a detail `sections` array ordered `listening`, `reading`, `writing`, `speaking`; each entry includes label, score `number | null`, source, and score state.
- Add `activity` entries with `at`, `label`, and optional `detail`; preserve `integrityEvents` as evidence.

- [ ] **Step 1: Write failing API tests** asserting a detail response has four ordered sections even when only Listening/Reading scores exist, and that submit/decision/violation events are represented with readable labels.
- [ ] **Step 2: Run the tests** and verify the current response only contains rows from `assessment_scores` and raw integrity JSON.
- [ ] **Step 3: Build section summaries from the stored blueprint and score rows**; use `null` for missing scores and calculate totals only from actual scored sections.
- [ ] **Step 4: Build activity entries from persisted assessment activity/audit data and integrity events**, preserving timestamps and organization scoping.
- [ ] **Step 5: Update the detail contract mapper and Operator modal** to render summary, four sections, answers/evidence, scoring status, activity timeline, integrity log, and decision in connected blocks.
- [ ] **Step 6: Add component assertions** for all four sections, “Chưa chấm”, readable empty states, and audio evidence; run the focused web/API tests.

### Task 4: Rebuild the Operator dashboard hierarchy and toast mutations

**Files:**
- Modify: `apps/web/src/app/operator/Dashboard.tsx`
- Modify: `apps/web/src/app/operator/OperatorRouteController.tsx`
- Modify: `apps/web/src/app/operator/adapters.tsx`
- Modify: `apps/web/src/app/operator/types.ts`
- Modify: `apps/web/src/app/operator/styles.css`
- Modify: shared toast wiring only if the existing provider cannot be reused
- Test: `apps/web/src/app/operator/operator-app.test.tsx`
- Test: `apps/web/src/app/operator/OperatorRouteController.test.tsx`

**Interfaces:**
- Dashboard consumes the new lifecycle arrays and `AiRuntimeStatus`.
- Mutation callbacks continue to return promises through the existing controller refresh path; success/error feedback is rendered through the bottom toast pattern.

- [ ] **Step 1: Write failing UI tests** for truthful AI status, five distinct lifecycle sections, no duplicate learner names, four score rows on a pending card, and green/red toast after approve/retry/error.
- [ ] **Step 2: Implement the new page composition** with a clear title/status area, connected section cards, stronger title bands, and consistent internal spacing/backgrounds.
- [ ] **Step 3: Move approve/reject/rescore/load errors from persistent top banners to bottom toasts**, while keeping persistent capability guidance inline where it helps the Operator act.
- [ ] **Step 4: Render “Chưa chấm” and lifecycle metadata consistently** in cards and tables; keep manual review controls enabled when AI is unavailable.
- [ ] **Step 5: Run focused Operator component/controller tests** and verify PASS.

### Task 5: End-to-end verification and cleanup

**Files:**
- Modify only files required by failed tests or accessibility/type fixes.
- Test: focused API and web suites from Tasks 1–4.

- [ ] **Step 1: Run `pnpm --filter @e4s/web typecheck`**.
- [ ] **Step 2: Run the focused Operator, assessment runtime, and provider tests** with one worker.
- [ ] **Step 3: Run `git diff --check` and inspect the final status for accidental secret/config changes.**
- [ ] **Step 4: Report any unrelated full-suite failures separately; do not mask them as regressions from this work.**
