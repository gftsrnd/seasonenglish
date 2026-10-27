# Pilot Fixtures And AI Test Mode Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make pilot week propagation, reminder and streak fixtures, and no-AI acceptance testing reproducible.

**Architecture:** Synchronize placeholder program weeks transactionally when Manager saves program length. Store an organization-scoped `aiTestDisabled` setting and enforce it server-side before constructing any AI runner. Extend deterministic local fixtures and produce two verified DOCX guides.

**Tech Stack:** TypeScript, Fastify, PostgreSQL, React, Vitest, python-docx.

**Spec:** `docs/superpowers/specs/2026-10-26-pilot-fixtures-ai-test-mode-design.md`

## Global Constraints

- Preserve existing week content and provider credentials.
- Local fixture preparation is idempotent.
- AI test mode is Manager-only and enforced by the API.
- Verify DOCX output by rendering every page.

## Review Focus

- Increasing from two to four weeks creates weeks 3 and 4 without touching weeks 1 and 2.
- Decreasing the pilot does not expose out-of-range weeks.
- Disabling AI affects provider-backed and environment fallback runners.
- Re-enabling AI restores the prior provider without entering the key again.
- Running fixture preparation twice creates no duplicate activity evidence.

---

### Task 1: Pilot Week Synchronization

**Files:**
- Modify: `packages/database/src/repositories.ts`
- Test: `apps/api/test/manager-settings-operations.integration.test.ts`

- [ ] Add a failing integration test that changes pilot length to four and asserts both content endpoints return four weeks.
- [ ] Synchronize missing program week placeholders in the settings transaction and filter deleted-range weeks from reads.
- [ ] Run the integration test and confirm it passes.

### Task 2: Organization AI Test Mode

**Files:**
- Modify: `packages/contracts/src/manager-contract.ts`
- Modify: `packages/database/src/repositories.ts`
- Modify: `apps/api/src/modules/ai/runtime.ts`
- Modify: `apps/api/src/modules/system/routes.ts`
- Modify: `apps/api/src/modules/manager/routes.ts`
- Modify: `apps/web/src/app/settings/Settings.tsx`
- Test: `apps/api/src/modules/ai/runtime.test.ts`
- Test: `apps/web/src/app/settings/settings-app.test.tsx`

- [ ] Add failing API and UI tests for disabling and re-enabling AI without changing credentials.
- [ ] Add the persisted boolean, runner guard, capability state, and Manager control.
- [ ] Run focused API and UI tests.

### Task 3: Deterministic Reminder And Streak Fixtures

**Files:**
- Modify: `scripts/local-scenario-accounts.ts`
- Test: `scripts/local-scenario-accounts.test.ts`

- [ ] Add a failing fixture test for inactivity of at least two days and a streak spanning Friday through Monday.
- [ ] Seed deterministic dates idempotently.
- [ ] Run fixture preparation twice and verify counts remain stable.

### Task 4: Tester Guides

**Files:**
- Create: `docs/test-guides/E4S_Huong_dan_du_lieu_mau.docx`
- Create: `docs/test-guides/E4S_Huong_dan_kiem_thu_khi_tat_AI.docx`

- [ ] Write both Vietnamese guides from verified behavior.
- [ ] Render every page to PNG and inspect for clipping, overlap, and broken typography.
- [ ] Run build, typecheck, focused tests, and local smoke tests.

