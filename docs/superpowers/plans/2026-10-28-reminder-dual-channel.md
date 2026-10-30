# Reminder Dual-Channel Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give Manager separate, independently testable `Gửi email` and `Gửi Base.vn` reminder actions with channel-specific audit history.

**Architecture:** Add an explicit reminder channel to the API/repository boundary and persist each send as its own notification delivery. Reuse the configured Resend sender for email and the existing Base webhook worker for Base.vn.

**Tech Stack:** Fastify, PostgreSQL repository, Resend HTTP API, React, TypeScript, Vitest.

**Spec:** `docs/superpowers/specs/2026-10-28-reminder-dual-channel-design.md`

## Global Constraints

- Never hardcode or log the Base webhook URL or Resend API key.
- Sending one channel must never trigger the other channel.
- Each action uses a unique idempotency request and independent status/history.
- Email requires a real learner email; missing email returns an explicit non-success result.

## Review Focus

- Learner without email must not create a fake sent history row.
- Missing Base webhook configuration must not fall back to email.
- Retrying one failed channel must not duplicate the successful channel.
- Same learner may receive one email and one Base.vn reminder on the same day.
- Provider failures must preserve an auditable failed delivery without exposing secrets.

---

### Task 1: Channel-specific contracts and repository queueing

**Files:**
- Modify: `packages/contracts/src/manager.ts`
- Modify: `packages/database/src/repositories.ts`
- Modify: repository reminder tests under `packages/database/test/`

- [ ] Write failing repository tests for independent `email` and `base_webhook` deliveries, missing email, and same-day cross-channel sends.
- [ ] Run the focused database tests and confirm failures because queueing currently chooses Base/local automatically.
- [ ] Add `channel: "email" | "base"` to the reminder queue boundary and persist provider-specific delivery rows.
- [ ] Run focused tests and confirm they pass.

### Task 2: API delivery endpoints

**Files:**
- Modify: `apps/api/src/modules/manager/routes.ts`
- Modify: `apps/api/src/server.ts`
- Modify: `apps/api/test/manager-reminders.test.ts`

- [ ] Write failing API tests proving each endpoint invokes only its selected provider and reports missing configuration/email honestly.
- [ ] Add the Resend reminder sender dependency and explicit channel request validation without exposing provider secrets.
- [ ] Run focused API tests and confirm they pass.

### Task 3: Manager UI and independent history

**Files:**
- Modify: `apps/web/src/api/manager.ts`
- Modify: `apps/web/src/app/manager/Reminders.tsx`
- Modify: `apps/web/src/app/manager/ManagerRouteController.tsx`
- Modify: `apps/web/src/app/manager/Reminders.test.tsx`
- Modify: `apps/web/src/app/manager/ManagerRouteController.test.tsx`

- [ ] Write failing tests for two visible buttons, channel-specific busy/error states, and history provider labels.
- [ ] Implement `Gửi email` and `Gửi Base.vn` as separate actions; remove ambiguous automatic-provider copy.
- [ ] Run focused Manager reminder tests and confirm they pass.

### Task 4: End-to-end verification

- [ ] Run reminder database, API, contract, and Web test suites.
- [ ] Run API/Web typechecks and production builds.
- [ ] Rebuild local services in WSL `Ubuntu-26.04`.
- [ ] Test Base.vn once and Resend once with explicit test recipients; record accepted/failed status separately without claiming delivery unless provider evidence confirms it.

