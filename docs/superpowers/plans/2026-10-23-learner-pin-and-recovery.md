# Learner PIN and Recovery Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace learner passwords with a six-digit PIN, add inline entry validation, verify registration and PIN recovery through Resend OTP, and notify Managers after a successful PIN change.

**Architecture:** Keep the existing credential hash column and store the learner PIN through the same one-way credential hashing boundary, while staff credentials remain 8+ character passwords. Add one-time auth challenges in Postgres, a small Resend HTTP adapter, public identity endpoints for registration/reset, and a Manager-facing security notification view backed by the existing PIN report table.

**Tech Stack:** React, TypeScript, Fastify, Zod, PostgreSQL, Vitest, native `fetch`, Resend HTTP API.

**Spec:** `docs/superpowers/specs/2026-10-23-learner-pin-and-recovery-design.md`

## Global Constraints

- Learner credentials are exactly six ASCII digits; staff passwords remain at least eight characters.
- Field errors render immediately below their field; only non-field failures render near the submit action.
- Duplicate-email copy is exactly “Email này không khả dụng. Hãy dùng email khác.”
- OTPs expire after 10 minutes, are single-use, rate-limited, attempt-limited, and never stored or logged in clear text.
- Resend secrets come only from environment variables and never enter source, test snapshots, or logs.
- Manager receives an audit notification only after a successful PIN reset and never sees PIN or OTP values.
- Work on the current branch; do not commit or push without a separate user request.

## Review Focus

- Vietnamese compound names containing diacritics, hyphens, apostrophes, and one-letter middle names must validate while numeric/single-token names fail.
- Duplicate, deleted, and unknown emails must not leak account ownership through reset responses.
- OTP replay, expiry, excessive wrong attempts, and duplicate send requests must fail safely.
- A successful PIN reset must revoke existing learner sessions without invalidating unrelated users.
- Resend failure must not create an active learner or consume a reset challenge.

---

### Task 1: Shared identity validation and inline entry errors

**Files:**
- Create: `apps/api/src/modules/identity/validation.ts`
- Modify: `apps/api/src/modules/identity/routes.ts`
- Modify: `apps/web/src/app/shared/EntryScreen.tsx`
- Test: `apps/api/src/modules/identity/routes.test.ts`
- Test: `apps/web/src/app/shared/EntryScreen.test.tsx`

**Interfaces:**
- Produces: `learnerDisplayNameSchema`, `learnerPinSchema`, and field-specific public error codes.
- Consumes: existing identity routes and `AuthClient`.

- [ ] Write failing API and UI tests for invalid names, duplicate-email inline copy, placeholders, PIN format, confirmation mismatch, and non-field fallback errors.
- [ ] Run focused tests and verify failures are caused by missing validation/UI behavior.
- [ ] Add Unicode-aware name validation and field-error state/rendering.
- [ ] Run focused tests and verify pass.

### Task 2: PIN and OTP entry components plus auth client contracts

**Files:**
- Create: `apps/web/src/app/shared/PinInput.tsx`
- Modify: `apps/web/src/features/auth/contracts.ts`
- Modify: `apps/web/src/api/shared.ts`
- Modify: `apps/web/src/app/shared/EntryScreen.tsx`
- Test: `apps/web/src/app/shared/EntryScreen.test.tsx`

**Interfaces:**
- Produces: accessible six-position numeric PIN/OTP input and typed registration/reset methods.
- Consumes: Task 1 field errors.

- [ ] Write failing tests for numeric filtering, paste, six-dot rendering, registration verification state, and forgot-PIN state transitions.
- [ ] Run focused tests and verify expected failures.
- [ ] Implement the component and client contracts without adding a second learner credential.
- [ ] Run focused tests and verify pass.

### Task 3: One-time challenge persistence and Resend delivery

**Files:**
- Create: `packages/database/migrations/0049_auth_challenges.sql`
- Modify: `packages/database/src/schema.ts`
- Modify: `packages/database/src/repositories.ts`
- Create: `apps/api/src/modules/identity/email.ts`
- Modify: `docker-compose.yml`
- Test: `apps/api/test/identity.integration.test.ts`
- Test: `packages/database/src/repositories.integration.test.ts`

**Interfaces:**
- Produces: challenge create/verify/consume repository methods and `sendOtpEmail(input)` Resend adapter.
- Consumes: `RESEND_API_KEY`, `RESEND_FROM_EMAIL`, `AUTH_OTP_SECRET`, optional local email test mode.

- [ ] Write failing integration tests for hashed OTP storage, expiry, attempt limits, one-time consumption, and delivery failure rollback.
- [ ] Run focused tests and verify expected failures.
- [ ] Add migration, repository methods, HMAC OTP hashing, and Resend adapter using native fetch.
- [ ] Run focused tests and verify pass.

### Task 4: Registration verification and self-service PIN reset APIs

**Files:**
- Modify: `apps/api/src/modules/identity/routes.ts`
- Modify: `packages/database/src/repositories.ts`
- Modify: `apps/web/src/app/shared/EntryScreen.tsx`
- Test: `apps/api/test/identity.integration.test.ts`
- Test: `apps/web/src/app/shared/EntryScreen.test.tsx`

**Interfaces:**
- Produces: registration start/verify and PIN-reset start/verify/complete endpoints.
- Consumes: Tasks 1–3 schemas, challenge persistence, and Resend delivery.

- [ ] Write failing end-to-end route tests for verified registration, neutral reset start response, reset token exchange, session revocation, and new-PIN login.
- [ ] Run focused tests and verify expected failures.
- [ ] Implement endpoints and connect all UI states.
- [ ] Run focused tests and verify pass.

### Task 5: Manager security notification and real local email smoke test

**Files:**
- Modify: `packages/contracts/src/manager-contract.ts`
- Modify: `apps/api/src/modules/manager/routes.ts`
- Modify: `apps/web/src/api/manager.ts`
- Modify: `apps/web/src/app/manager/ManagerRouteController.tsx`
- Modify: `apps/web/src/app/manager/ManagerRouteController.test.tsx`
- Modify: `.env` (ignored local secret only)

**Interfaces:**
- Produces: read-only Manager security notification list for completed learner PIN resets.
- Consumes: Task 4 successful reset audit/report entry.

- [ ] Write failing tests proving one notification appears only after reset success and contains no secret.
- [ ] Run focused tests and verify expected failures.
- [ ] Implement the Manager view and API mapping.
- [ ] Rebuild WSL Compose, run targeted tests and typecheck, request one real OTP to the user-authorized mailbox, and verify Resend accepted delivery without printing the OTP or API key.
