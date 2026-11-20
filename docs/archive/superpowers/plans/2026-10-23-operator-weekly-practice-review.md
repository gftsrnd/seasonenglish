# Operator Weekly-Practice Review Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move weekly-practice authoring into `Đọc mẫu`, simplify lesson-matrix cells, and group attempt history by learner.

**Architecture:** Extend the existing content-review contract with versioned weekly-practice summaries. Save edits through the lesson-set copy-on-write repository so T2–T6 lessons and payload metadata survive. Keep attempt grouping as a presentation transformation over the existing review data.

**Tech Stack:** TypeScript, React, Fastify, PostgreSQL, Vitest, Testing Library

**Spec:** `docs/superpowers/specs/2026-10-23-operator-weekly-practice-review-design.md`

## Global Constraints

- Existing published versions are immutable; edits create a draft.
- Preserve all five lesson rows when editing weekly practice.
- Operator writes; Manager remains read-only.
- No destructive Git operations or unrelated cleanup in the dirty worktree.

## Review Focus

- A weekly-practice save from a published set preserves every T2–T6 lesson.
- A stale `expectedVersion` returns 409 rather than overwriting newer work.
- Empty/duplicate vocabulary values are trimmed and deduplicated.
- Learners with the same display name do not merge accidentally; grouping uses a stable learner identity supplied by the contract.
- A narrow lesson matrix does not regain long weekly-practice labels.

---

### Task 1: Simplify the lesson matrix

**Files:**
- Modify: `apps/web/src/app/operator/Lessons.tsx`
- Test: `apps/web/src/app/operator/operator-app.test.tsx`

**Interfaces:**
- Consumes: existing `OperatorLessonMatrixView` and `onOpenSet(week, cefr)`.
- Produces: compact `Xem` action with no weekly-practice announcement.

- [x] Add a failing component test asserting the matrix omits `Có bài cuối tuần` and exposes a compact `Xem` button.
- [x] Run the focused test and verify the old copy causes the failure.
- [x] Remove the announcement and shorten the button label.
- [x] Run the focused test and verify it passes.

### Task 2: Add versioned weekly-practice editing under Đọc mẫu

**Files:**
- Modify: `packages/contracts/src/content-contract.ts`
- Modify: `packages/database/src/repositories.ts`
- Modify: `apps/api/src/modules/content/routes.ts`
- Modify: `apps/web/src/api/operator.ts`
- Modify: `apps/web/src/app/operator/types.ts`
- Modify: `apps/web/src/app/operator/adapters.tsx`
- Modify: `apps/web/src/app/operator/OperatorRouteController.tsx`
- Modify: `apps/web/src/app/operator/Review.tsx`
- Modify: `apps/web/src/app/operator/styles.css`
- Test: `apps/api/test/content.integration.test.ts`
- Test: `apps/web/src/app/operator/operator-app.test.tsx`
- Test: `apps/web/src/app/operator/OperatorRouteController.test.tsx`

**Interfaces:**
- Produces: `ContentReviewView.weeklyPractices`; `PUT /api/v1/content/lesson-sets/:week/:cefr/draft/weekly-practice`; `OperatorReviewActions.onSaveWeeklyPractice`.
- Consumes: lesson-set `version`, weekly-practice fields, and current lesson rows.

- [x] Add failing repository/API tests for list, save, lesson preservation, normalization, and stale-version conflict.
- [x] Add failing UI tests for the dedicated tab, edit form, read-only behavior, and save callback.
- [x] Run focused tests and verify failures are caused by missing behavior.
- [x] Implement contract, copy-on-write payload preservation, endpoint, client, adapter, route state, and tab editor.
- [x] Run focused API/UI tests and typecheck.

### Task 3: Group attempt history by learner

**Files:**
- Modify: `packages/contracts/src/content-contract.ts`
- Modify: `packages/database/src/repositories.ts`
- Modify: `apps/web/src/app/operator/types.ts`
- Modify: `apps/web/src/app/operator/adapters.tsx`
- Modify: `apps/web/src/app/operator/Review.tsx`
- Test: `apps/web/src/app/operator/operator-app.test.tsx`
- Test: `apps/web/src/app/operator/adapters.test.tsx`

**Interfaces:**
- Produces: stable `learnerId` on each review attempt and learner-grouped expandable rendering.
- Consumes: existing lesson attempt rows and per-skill attempt counts.

- [x] Add failing adapter/component tests for stable learner grouping, collapsed summaries, and expanded lesson rows.
- [x] Run focused tests and verify the current flat table fails.
- [x] Add `learnerId` to the contract/query/adapter and render grouped `<details>` sections.
- [x] Run focused tests and typecheck.

### Task 4: Verification and deployed rebuild

**Files:**
- Modify: `.superpowers/sdd/2026-10-23-operator-weekly-practice-review/progress.md`

**Interfaces:**
- Consumes: Tasks 1–3.
- Produces: verified local Docker deployment at port 4175.

- [x] Run focused web and API suites plus contract/database tests touched by the change.
- [x] Run workspace typechecks and media gates.
- [x] Rebuild/recreate the `web` and `api` Docker services from the verified worktree.
- [x] Verify container health, HTTP 200, served bundle copy, and the weekly-practice endpoint.
