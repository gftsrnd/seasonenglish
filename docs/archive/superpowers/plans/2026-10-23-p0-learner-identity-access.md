# P0 Learner Identity and Access Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Verify and repair the P0 learner identity, session isolation, role access, unique email, and profile-prefill criteria.

**Architecture:** Keep opaque HttpOnly cookies, database-backed sessions, and server-side role guards. Add focused regression tests first; modify production code only for a reproducible failing criterion.

**Tech Stack:** TypeScript 7, Fastify 5, React 19, PostgreSQL, Vitest, Testing Library.

**Spec:** `docs/superpowers/specs/2026-10-23-learner-priority-remediation-design.md`

## Global Constraints

- Work directly on `codex/deploy-web-fallback`.
- Do not run the full test suite; run focused identity, route, and onboarding tests only.
- Preserve database and object-storage volumes.
- Stop after P0 and report each checklist criterion before P1.

## Review Focus

- Two browser cookie jars remain bound to their own users after either one refreshes.
- A learner cannot use staff APIs even after manually entering a staff URL.
- Registration rejects case-only email duplicates and deleted-account reuse.
- Onboarding prefill comes from the authenticated account, not stale profile JSON.
- A local onboarding draft from another email cannot overwrite the current account identity.

---

### Task 1: Session and role isolation

**Files:**
- Modify: `apps/api/test/identity.integration.test.ts`
- Modify only if a focused test fails: `apps/api/src/modules/identity/routes.ts`
- Modify only if a focused test fails: `apps/api/src/modules/identity/policy.ts`
- Test: `apps/web/src/app/App.test.tsx`
- Test: `apps/web/src/app/RoleRoutes.test.tsx`

**Interfaces:**
- Consumes: `e4s_session` opaque cookie and persisted `AccountRole`.
- Produces: isolated sessions and server-enforced 401/403 responses.

- [x] Add focused integration coverage for two independent session cookies and refresh-equivalent `/api/session` requests.
- [x] Run the identity integration test and confirm the new assertion passes or fails for the intended reason.
- [x] Add or confirm direct learner access checks for operator and manager routes/APIs.
- [x] Apply the smallest production fix only if a criterion still fails.
- [x] Run only identity, App session, and RoleRoutes tests.

### Task 2: Unique email and account identity

**Files:**
- Modify: `apps/api/test/identity.integration.test.ts`
- Modify only if a focused test fails: `packages/database/src/repositories.ts`

**Interfaces:**
- Consumes: learner registration email.
- Produces: canonical lowercase email with case-insensitive uniqueness.

- [x] Verify active duplicate, case-only duplicate, and deleted-account duplicate behavior.
- [x] Verify login accepts canonical case differences without changing role authorization.
- [x] Apply the smallest repository or constraint fix only if a criterion fails.
- [x] Run only `apps/api/test/identity.integration.test.ts`.

### Task 3: Learner onboarding prefill

**Files:**
- Modify: `apps/api/test/learning.integration.test.ts`
- Modify: `apps/web/src/app/learner/Onboard.test.tsx`
- Modify only if a focused test fails: `apps/api/src/modules/learning/routes.ts`
- Modify only if a focused test fails: `packages/database/src/repositories.ts`
- Modify only if a focused test fails: `apps/web/src/app/learner/Onboard.tsx`

**Interfaces:**
- Consumes: authenticated session user and persisted learner profile.
- Produces: onboarding view with locked-to-account `fullName` and `email` defaults while preserving same-account drafts.

- [x] Add an API test proving a new learner profile exposes the account display name and email.
- [x] Add a component test proving a draft from another email cannot override current account identity.
- [x] Apply the smallest API/profile hydration fix needed by the tests.
- [x] Run only learning integration and onboarding component tests.

### Task 4: P0 gate

**Files:**
- Verify: all files changed by Tasks 1-3.

**Interfaces:**
- Consumes: focused test results and local smoke evidence.
- Produces: per-criterion P0 report with `Đạt`, `Lỗi`, or `Bị chặn`.

- [x] Confirm the local WSL compose stack is healthy.
- [x] Smoke the learner login, direct `/op` and `/mgr`, registration duplicate, and onboarding-prefill paths.
- [x] Run focused typecheck/tests only for affected packages.
- [x] Report P0 results and hold before P1.
