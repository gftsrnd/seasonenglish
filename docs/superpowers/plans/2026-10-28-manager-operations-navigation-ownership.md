# Manager Operations Navigation and Ownership Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Khôi phục một thanh xem mọi màn Operator cho Quản lý và tách chính xác số liệu người soạn khỏi người duyệt.

**Architecture:** `ManagerOperationsNavigation` là thanh chung cho trang tổng hợp và các route con. Repository tiếp tục trả `ManagerOperationsView`, nhưng các trường `sets`/`lessons` được tính chỉ từ `created_by`, còn `published`/`approved` chỉ từ `approved_by`; UI đổi nhãn để phản ánh đúng hai trách nhiệm.

**Tech Stack:** React, TypeScript, PostgreSQL, Vitest, Testing Library.

**Spec:** `docs/superpowers/specs/2026-10-28-manager-operations-navigation-ownership-design.md`

## Global Constraints

- Một thanh chung gồm đúng: Duyệt mức, Chủ đề tuần, Bài học, Bài tuần, Bài kiểm tra.
- Quản lý chỉ xem; mọi thao tác ghi vẫn bị khóa.
- `created_by` là người soạn; `approved_by` là người duyệt; không dùng điều kiện OR để gộp hai vai trò.
- Dữ liệu cũ thiếu attribution không được tự gán.
- Không reset hoặc ghi đè thay đổi khác trong worktree.

## Review Focus

- Một Operator vừa soạn vừa duyệt cùng bộ: bộ chỉ đếm một lần trong mỗi cột trách nhiệm.
- Operator A soạn, Operator B duyệt: A chỉ có số soạn; B chỉ có số duyệt.
- Bản nháp chưa duyệt: có số soạn và số duyệt bằng 0.
- Bản cũ thiếu attribution: không gán cho Operator và vẫn nằm trong cảnh báo legacy.
- Thanh điều hướng ở cả `/mgr/ops` và route con, với trạng thái active đúng.

---

### Task 1: Restore the shared Manager operations navigation

**Files:**
- Modify: `apps/web/src/app/manager/Operations.tsx`
- Test: `apps/web/src/app/manager/manager-app.test.tsx`
- Test: `apps/web/src/app/manager/ManagerRouteController.test.tsx`

**Interfaces:**
- Consumes: `ManagerOperationsNavigation` and existing `/mgr/ops/*` routes.
- Produces: one `nav` visible on the summary and nested read-only screens.

- [ ] **Step 1: Write a failing UI test**

Assert that `/mgr/ops` renders the operations navigation with the five agreed links and that no per-Operator navigation group exists.

- [ ] **Step 2: Run the focused test and verify RED**

Run: `pnpm --filter @e4s/web test -- manager-app.test.tsx ManagerRouteController.test.tsx`

Expected: FAIL because the summary currently omits `ManagerOperationsNavigation`.

- [ ] **Step 3: Render the shared navigation on the summary page**

Use the existing component; do not create duplicate route definitions or per-Operator buttons. Rename `Chủ đề` to `Chủ đề tuần` if needed so the visible labels match the spec.

- [ ] **Step 4: Run the focused test and verify GREEN**

Run the same web test command; expected PASS.

### Task 2: Split author and approver attribution in operations metrics

**Files:**
- Modify: `packages/database/src/repositories.ts:9528-9621`
- Modify: `apps/web/src/app/manager/Operations.tsx`
- Test: `apps/api/test/manager-operations-complete.integration.test.ts`
- Test: `apps/web/src/app/manager/manager-app.test.tsx`

**Interfaces:**
- Consumes: `lesson_set_versions.created_by`, `lesson_set_versions.approved_by`, and the existing `ManagerOperationsView` fields.
- Produces: `sets`/`lessons` as authored totals and `published` as approved totals; `byWeek` follows the same split.

- [ ] **Step 1: Write a failing integration test**

Create or update a fixture where Operator A created a version and Operator B approved it. Assert A has authored sets/lessons but zero approved sets, while B has zero authored sets/lessons and one approved set.

- [ ] **Step 2: Run the integration test and verify RED**

Run: `pnpm test apps/api/test/manager-operations-complete.integration.test.ts`

Expected: FAIL because current queries use `(created_by = operator OR approved_by = operator)`.

- [ ] **Step 3: Separate repository attribution**

Change weekly and total queries so authored content uses only `created_by`; approved counts use only `approved_by`. Quality and lesson-shape metrics use authored lessons. Preserve legacy orphan detection.

- [ ] **Step 4: Update visible labels and add a failing UI assertion first**

Assert the summary says `Soạn: ...` and `Duyệt: ...`, and the weekly table headings distinguish authored and approved sets. Then update `Operations.tsx` minimally to pass.

- [ ] **Step 5: Verify focused tests**

Run:
- `pnpm test apps/api/test/manager-operations-complete.integration.test.ts`
- `pnpm --filter @e4s/web test -- manager-app.test.tsx ManagerRouteController.test.tsx`

Expected: all PASS.

### Task 3: Recheck the urgent O-012–O-025 acceptance criteria

**Files:**
- Verify only unless a regression belongs directly to the current generation work.
- Relevant tests: operator review, content generation, learner appeal, and level-change suites.

**Interfaces:**
- Consumes: the QA criteria supplied on 28/10 and the agent's one-week generation report.
- Produces: an evidence table with `Đã chứng minh`, `Còn lỗi`, or `Chưa đủ bằng chứng` for each criterion.

- [ ] **Step 1: Run focused non-database and isolated-database tests**

Include the operator UI suites, weekly generation suites, level-change flow, manual grading, appeals, and Coach checked-state persistence.

- [ ] **Step 2: Verify O-021 learner continuity explicitly**

The regression test must prove a new draft/topic does not retire the currently published lesson set until the replacement is published.

- [ ] **Step 3: Record evidence without overclaiming**

Do not mark a criterion fixed solely from code inspection when its persistence behavior requires a database test.

