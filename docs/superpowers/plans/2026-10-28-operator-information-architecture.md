# Operator Information Architecture Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reorganize Operator review and test workflows while giving Manager a persistent read-only operations switcher.

**Architecture:** Reuse the current review and level-form components behind route-aware containers. Keep Operator's global navigation minimal; render the operations switcher only under `/mgr/ops/*`.

**Tech Stack:** React, React Router, TypeScript, Vitest, Testing Library, CSS.

**Spec:** `docs/superpowers/specs/2026-10-28-operator-information-architecture-design.md`

## Global Constraints

- Operator must not regain Prompt & rubric access.
- Operator must not see a duplicate horizontal operations switcher.
- Existing APIs and mutation behavior must remain unchanged.
- New copy must exactly use the approved Vietnamese labels.

## Review Focus

- Direct links to legacy `/op/levelforms` and `/op/review` must still land on usable content.
- Manager switcher must remain visible on nested lesson detail screens without enabling mutations.
- Zero-count weekly tabs must remain keyboard-accessible.
- Pending learners with missing scores/profile data must still expand safely.
- Assessment detail opening must work after moving `Bài test` to `Đề đầu vào`.

---

### Task 1: Collapsible pending placement reviews

**Files:**
- Modify: `apps/web/src/app/operator/Dashboard.tsx`
- Modify: `apps/web/src/app/operator/operator-app.test.tsx`
- Modify: `apps/web/src/app/operator/styles.css`

**Interfaces:**
- Consumes: existing `OperatorDashboardView.pending` records and dashboard actions.
- Produces: accessible learner-name disclosure elements, collapsed by default.

- [ ] Write tests asserting every pending learner is represented by a collapsed disclosure named with the learner name, and expanding it reveals the existing score/actions.
- [ ] Run `pnpm --filter @e4s/web test -- operator-app.test.tsx -t "collapses pending"` and confirm the test fails because cards are always expanded.
- [ ] Replace each pending card wrapper with an accessible `details/summary` structure while preserving all existing content and handlers.
- [ ] Run the focused test and confirm it passes.

### Task 2: Remove Operator back links and add Manager-only operations switcher

**Files:**
- Modify: `apps/web/src/app/operator/primitives.tsx`
- Modify: `apps/web/src/app/operator/LevelForms.tsx`
- Modify: `apps/web/src/app/manager/Operations.tsx`
- Modify: `apps/web/src/app/operator/OperatorRouteController.test.tsx`
- Modify: `apps/web/src/app/manager/ManagerRouteController.test.tsx`
- Modify: `apps/web/src/app/operator/styles.css`

**Interfaces:**
- Produces: `ManagerOperationsNavigation` with links for Duyệt mức, Chủ đề, Bài học, Bài tuần, and Bài kiểm tra.

- [ ] Write route tests proving Operator screens have no `Điều hướng vận hành`/manual back links and Manager nested operations screens retain a persistent horizontal switcher.
- [ ] Run focused tests and confirm failures against current automatic back-link behavior.
- [ ] Suppress route-back navigation for `/op/*`, remove the LevelForms manual back link, and render the switcher only for `/mgr/ops/*`.
- [ ] Run focused tests and confirm they pass.

### Task 3: Reorganize Bài tuần and Bài kiểm tra

**Files:**
- Modify: `apps/web/src/app/shared/AppShell.tsx`
- Modify: `apps/web/src/app/shared/AppShell.test.tsx`
- Modify: `apps/web/src/app/operator/Review.tsx`
- Modify: `apps/web/src/app/operator/LevelForms.tsx`
- Modify: `apps/web/src/app/operator/OperatorRouteController.tsx`
- Modify: `apps/web/src/app/operator/OperatorRouteController.test.tsx`
- Modify: `apps/web/src/app/operator/types.ts`
- Modify: `apps/web/src/app/operator/adapters.ts`
- Modify: `apps/web/src/app/RoleRoutes.tsx`
- Modify: `apps/web/src/app/RoleRoutes.test.tsx`

**Interfaces:**
- Produces: weekly tabs `Đề bài tuần`, `Bài đã nộp`, `Phản hồi AI Coach`, `Kháng nghị`, `Lịch sử làm bài`.
- Produces: test tabs `Đề đầu vào` and `Đề lên mức` under the `Bài kiểm tra` navigation item.

- [ ] Write tests for the exact global labels and exact five weekly tabs, proving the old `Bài test` weekly tab is absent.
- [ ] Write tests proving `Bài kiểm tra` switches between assessment review and level-form management without losing either workflow.
- [ ] Run focused AppShell, RoleRoutes, and Operator controller tests and confirm expected label/tab failures.
- [ ] Add the route-compatible test container, remove assessment from weekly tabs, and preserve legacy route redirects.
- [ ] Run focused tests and confirm they pass.

### Task 4: Full UI verification

- [ ] Run `pnpm --filter @e4s/web test -- operator-app.test.tsx OperatorRouteController.test.tsx RoleRoutes.test.tsx AppShell.test.tsx ManagerRouteController.test.tsx`.
- [ ] Run `pnpm --filter @e4s/web typecheck` and `pnpm --filter @e4s/web build`.
- [ ] Rebuild local Web with Docker Engine in WSL `Ubuntu-26.04`.
- [ ] Smoke-test Operator and Manager navigation on `http://127.0.0.1:4175` against all acceptance criteria.

