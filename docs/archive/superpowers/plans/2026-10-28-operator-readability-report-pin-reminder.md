# Operator Readability, Report, PIN, and Reminder Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Apply the approved neutral Operator hierarchy and finish A4 report printing, Manager PIN reveal, and email-send confirmation.

**Architecture:** Keep visual changes scoped to existing Operator and Manager page classes. Add an on-demand Manager-only PIN reveal endpoint backed by AES-GCM encrypted PIN recovery data while preserving the existing credential hash. Reuse the existing confirmation modal service for reminder sends.

**Tech Stack:** React, TypeScript, CSS, Vitest, Testing Library, Fastify, PostgreSQL migrations/repositories.

**Spec:** `docs/superpowers/specs/2026-10-28-operator-readability-report-pin-reminder-design.md`

## Global Constraints

- Preserve unrelated working-tree changes.
- Keep the local app on port 4175.
- Write and run a failing regression test before each production change.
- Never expose staff passwords or learner PINs to Operators.
- Do not change reminder eligibility, content, or delivery providers.

## Review Focus

- Legacy learner rows without encrypted PIN recovery data return an honest unavailable response and never reset credentials implicitly.
- Cancelling single and bulk confirmation dialogs sends nothing.
- Long Coach feedback and submission text wrap without collapsing labels or action buttons.
- Print output stays within 210mm × 297mm including browser print margins and does not inherit the app background.
- Promotion-form rows remain usable at narrow widths after spacing changes.

---

### Task 1: Operator review readability

**Files:**
- Modify: `apps/web/src/app/operator/styles.css`
- Test: `apps/web/src/app/operator/operator-responsive-layout.test.ts`

**Interfaces:**
- Consumes: existing review and level-form class names.
- Produces: neutral nested surfaces and consistent spacing without component API changes.

- [ ] Add failing stylesheet assertions for neutral review bodies, prose rhythm, result separation, history insets, and level-form spacing.
- [ ] Run the focused test and confirm failure.
- [ ] Replace the many alternating fills with the approved neutral hierarchy and spacing.
- [ ] Run the focused Operator tests and confirm pass.

### Task 2: Portrait A4 report printing

**Files:**
- Modify: `apps/web/src/app/manager/manager.css`
- Test: `apps/web/src/app/manager/manager-layout.test.ts`

**Interfaces:**
- Consumes: `.manager-report-page` and `.report` markup.
- Produces: portrait A4 print rules constrained to the printable box.

- [ ] Add failing assertions for A4 portrait, millimetre width, white print background, and page-break-safe header/footer.
- [ ] Run the layout test and confirm failure.
- [ ] Add scoped print geometry and remove inherited screen height/background in print.
- [ ] Run Manager layout and report component tests.

### Task 3: Manager-only current learner PIN reveal

**Files:**
- Create: `packages/database/migrations/0080_recoverable_learner_pin.sql`
- Modify: `packages/database/src/schema.ts`
- Modify: `packages/database/src/repositories.ts`
- Modify: `packages/contracts/src/manager-contract.ts`
- Modify: `apps/api/src/modules/manager/routes.ts`
- Modify: `apps/web/src/api/manager.ts`
- Modify: `apps/web/src/app/manager/ManagerRouteController.tsx`
- Modify: `scripts/local-scenario-accounts.ts`
- Test: `apps/api/test/manager.integration.test.ts`
- Test: `apps/web/src/app/manager/ManagerRouteController.test.tsx`

**Interfaces:**
- Produces: `GET /api/v1/manager/accounts/:accountId/pin` returning `{ pin: string }` for recoverable learner PINs.
- Consumes: `E4S_SETTINGS_ENCRYPTION_KEY` and the existing Manager-only account boundary.

- [ ] Add failing API tests for Manager reveal, Operator denial, and unavailable legacy PIN.
- [ ] Add a failing UI test proving the eye button reveals without opening the reset prompt.
- [ ] Add encrypted recovery columns and repository encrypt/decrypt helpers.
- [ ] Persist encrypted PIN on learner create/reset and local scenario seed.
- [ ] Add the Manager-only reveal route and client method; update the eye action to fetch it.
- [ ] Run focused API, repository, contract, and Manager UI tests.

### Task 4: Reminder email confirmation and placement

**Files:**
- Modify: `apps/web/src/app/manager/Reminders.tsx`
- Modify: `apps/web/src/app/manager/manager.css`
- Test: `apps/web/src/app/manager/Reminders.test.tsx`
- Test: `apps/web/src/app/manager/manager-app.test.tsx`

**Interfaces:**
- Consumes: existing `onSend` and `onSendAll` callbacks.
- Produces: local accessible confirmation dialog for single and bulk email sends.

- [ ] Add failing tests for cancel/confirm behavior on single and bulk sends.
- [ ] Move the bulk action from the title into a reminder toolbar.
- [ ] Implement the confirmation dialog and ensure handlers run only after confirmation.
- [ ] Run focused reminder and Manager tests.

### Task 5: Verification

**Files:**
- Modify: this plan checklist as tasks complete.

**Interfaces:**
- Consumes: all previous task outputs.
- Produces: verified local behavior on port 4175.

- [ ] Run all focused web/API/database tests.
- [ ] Run web/API typechecks and the relevant build.
- [ ] Inspect the five Operator surfaces, Manager report print preview, PIN reveal, and both reminder confirmations in the browser.
- [ ] Perform a fresh final code review and address Important findings with RED→GREEN tests.

