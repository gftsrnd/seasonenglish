# Persistent Drafts Audit Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ensure every action presented as saving data persists across logout/login, with no false success message.

**Architecture:** Keep transient form edits in component state, but persist explicit drafts on the server. Store learner profile drafts separately from the last completed profile so saving an incomplete edit cannot demote or overwrite a valid profile. Existing Operator drafts remain database-backed; Manager settings remain explicit server saves.

**Tech Stack:** React 19, Fastify, PostgreSQL, Vitest, TypeScript.

**Spec:** User report in the current task: saved drafts must survive logout/login across Learner, Operator and Manager flows.

## Global Constraints

- A success message may only appear after the server confirms persistence.
- Logout may clear device/session caches but must not delete server drafts.
- A completed learner profile remains active until a new profile is explicitly completed and saved.
- Assessment screens that explicitly state “Không lưu tạm” remain unchanged.
- Preserve unrelated dirty worktree changes.

## Review Focus

- Partial learner profiles with empty required choice groups survive a new login.
- Saving a draft for an already-completed profile does not demote the learner.
- A failed server save does not navigate away or display success.
- Final profile save clears the corresponding server draft.
- One account never restores another account’s device fallback draft.

---

### Task 1: Make learner profile drafts authoritative on the server

**Files:**
- Modify: `packages/database/src/schema.ts`
- Create: `packages/database/migrations/0051_learner_profile_drafts.sql`
- Modify: `packages/database/src/repositories.ts`
- Modify: `packages/contracts/src/learning-contract.ts`
- Modify: `apps/api/src/modules/learning/routes.ts`
- Modify: `apps/web/src/api/learner.ts`

- [x] Add a failing integration test for saving and reloading an incomplete profile draft.
- [x] Add separate draft storage and a relaxed draft endpoint.
- [x] Return draft availability without changing completed-profile state.
- [x] Clear the draft only after a successful final profile save.
- [x] Run API and database typechecks/tests.

### Task 2: Remove false client-side draft success

**Files:**
- Modify: `apps/web/src/app/learner/Onboard.test.tsx`
- Modify: `apps/web/src/app/learner/Onboard.tsx`
- Modify: `apps/web/src/app/learner/LearnerRouteController.tsx`
- Modify: `apps/web/src/app/learner/Router.tsx`

- [x] Add a failing test proving a rejected server save shows an error and does not navigate.
- [x] Route draft saves to the dedicated API.
- [x] Show success and navigate only after server confirmation.
- [x] Run focused web tests and typecheck.

### Task 3: Verify all role save surfaces

**Files:**
- Test existing Operator and Manager save paths; modify only when evidence shows a false success or non-persistent save.

- [x] Verify Operator week, lesson, level-form and prompt saves use server endpoints.
- [x] Verify Manager settings save actions use server endpoints and expose failures.
- [x] Rebuild local containers.
- [x] Smoke-test save → logout → login → restore for learner profile; verify staff persistence through focused controller/API tests.
