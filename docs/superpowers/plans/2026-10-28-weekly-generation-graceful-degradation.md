# Weekly Generation Graceful Degradation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Preserve valid AI lesson components, retry only defective components, expose actionable findings, and prevent publication only while serious findings remain.

**Architecture:** Keep the current component pipeline and draft persistence model. Add structured generation findings beside partial output, require the accepted five-day CEFR plan instead of fabricating generic focuses, and run normalized frame/CEFR checks as component-level repair loops. Persist findings in the existing generation provenance and expose them through lesson-set contracts for the Operator UI.

**Tech Stack:** TypeScript, Fastify, Zod, PostgreSQL repository layer, React, Vitest.

**Spec:** User request in this task (2026-10-28), continuing the independent weekly-generation audit.

## Global Constraints

- Never reset or overwrite unrelated dirty-worktree changes.
- Never discard valid generated components because another component fails.
- Never synthesize `${topic} - day N` as a grammar/focus fallback.
- Findings must identify the day, component, severity, and repair action.
- C1 is covered by validators and regression tests.

## Review Focus

- Missing or malformed five-day plans preserve existing drafts and request plan regeneration.
- Duplicate frames within and across CEFR levels retry only foundation and retain the last candidate as a flagged draft.
- B1+ learner-facing language and B2/C1 constraints produce repairable component findings.
- Serious unresolved findings block review/publication; warnings do not delete content.
- Operator can see which day/component to regenerate.

---

### Task 1: Component-level generation findings

**Files:**
- Modify: `apps/api/src/modules/content/weekly-generation.ts`
- Test: `apps/api/src/modules/content/weekly-generation.test.ts`

- [ ] Add failing tests for required plans, normalized frame deduplication, CEFR findings, and C1.
- [ ] Run focused tests and verify the new tests fail for the intended missing behavior.
- [ ] Implement structured findings and targeted retries without removing valid output.
- [ ] Run focused tests and verify they pass.

### Task 2: Persist and expose actionable findings

**Files:**
- Modify: `packages/contracts/src/content-contract.ts`
- Modify: `packages/database/src/repositories.ts`
- Modify: `apps/api/src/modules/content/routes.ts`
- Test: `packages/database/test/repositories.integration.test.ts`
- Test: `apps/api/test/content.integration.test.ts`

- [ ] Add failing contract/repository/API tests for persisted findings and publication blocking.
- [ ] Implement provenance extraction and targeted repair inputs.
- [ ] Verify API and repository tests pass.

### Task 3: Operator repair flow

**Files:**
- Modify: `apps/web/src/app/operator/types.ts`
- Modify: `apps/web/src/app/operator/adapters.tsx`
- Modify: `apps/web/src/app/operator/Lessons.tsx`
- Modify: `apps/web/src/app/operator/OperatorRouteController.tsx`
- Test: `apps/web/src/app/operator/operator-app.test.tsx`
- Test: `apps/web/src/app/operator/OperatorRouteController.test.tsx`

- [ ] Add failing UI tests for actionable day/component findings.
- [ ] Render findings and route regenerate actions through the existing day-enrichment endpoint.
- [ ] Verify focused UI tests pass.

### Task 4: Regression verification

- [ ] Run content API, domain/contracts, database, and operator web test suites.
- [ ] Run type checks for affected packages.
- [ ] Review only the scoped diff and report unrelated pre-existing failures separately.
