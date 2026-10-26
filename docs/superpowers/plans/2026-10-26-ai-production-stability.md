# AI Production Stability Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make all registered E4S AI workflows valid, observable, retryable, and deploy-verifiable while fixing the assessment regressions identified in test round 3.

**Architecture:** Move all repairable AI output checks into the shared gateway boundary, add explicit prompt publication and persisted assessment-scoring state, and isolate each week/CEFR generation result. Preserve the existing Fastify/React/PostgreSQL architecture and add focused production-parity smoke verification.

**Tech Stack:** TypeScript, Zod, Fastify, React, PostgreSQL, Vitest, pnpm, Render-compatible Node deployment.

**Spec:** `docs/superpowers/specs/2026-10-26-ai-production-stability-design.md`

## Global Constraints

- No AI flow may silently drop a provider/schema failure.
- AI errors and logs must not persist learner free text or API keys.
- A saved prompt draft is not live until explicitly published.
- A failed CEFR cell must not stop generation for other cells.
- Scenario preparation must not block production API startup.
- Use focused tests during implementation; run typecheck, build, and deployment smoke at the release gate.

## Review Focus

- Provider returns valid JSON with missing nested fields: repair once, then expose a stable failure.
- Provider returns malformed JSON or rate limit: classify consistently and do not lose user data.
- Process/request interruption during assessment scoring: persisted state remains retryable.
- Five CEFR levels generated together: no fail-fast or four-request limiter failure.
- Production startup with stale/missing scenario rows: API still binds readiness port.

---

### Task 1: Shared AI repair and semantic-validation boundary

**Files:**
- Modify: `packages/ai/src/types.ts`
- Modify: `packages/ai/src/service.ts`
- Modify: `packages/ai/src/registry.ts`
- Modify: `packages/ai/src/schemas.ts`
- Modify: `packages/ai/src/providers/groq.ts`
- Modify: `packages/ai/src/providers/anthropic.ts`
- Test: `packages/ai/test/service.test.ts`
- Test: `packages/ai/test/registry-contract.test.ts`

**Interfaces:**
- Produces: task-level `normalizeOutput(raw)` and `validateOutput(output, input)` hooks executed inside `runTask` retry.
- Produces: all provider parse/schema/semantic failures use retryable `AI_OUTPUT_INVALID` with sanitized issues.

- [ ] Write failing gateway tests for normalization-before-validation, semantic repair, malformed JSON repair, and all registered-task valid fixtures.
- [ ] Run focused tests and confirm failures identify the missing boundary behavior.
- [ ] Implement the task hooks and provider error normalization with the smallest API change.
- [ ] Run `pnpm vitest run packages/ai/test/service.test.ts packages/ai/test/registry-contract.test.ts` and expect all tests to pass.
- [ ] Commit `fix(ai): repair all structured outputs inside gateway`.

### Task 2: Weekly generation schema and independent cells

**Files:**
- Modify: `apps/api/src/modules/content/weekly-generation.ts`
- Modify: `apps/api/src/modules/content/routes.ts`
- Modify: `apps/web/src/app/operator/OperatorRouteController.tsx`
- Test: `apps/api/src/modules/content/weekly-generation.test.ts`
- Test: `apps/api/test/content.integration.test.ts`
- Test: `apps/web/src/app/operator/OperatorRouteController.test.tsx`

**Interfaces:**
- Consumes: Task 1 semantic validation hooks.
- Produces: settled per-cell generation results and continued generation after a cell failure.

- [ ] Write failing tests for missing instruction steps, missing active levels, non-five-day plans, and one failed cell followed by a successful cell.
- [ ] Run focused tests and confirm each regression fails for the expected reason.
- [ ] Move weekly normalization/coverage checks into task validation and change the client batch to settled independent results.
- [ ] Run the three focused test files and expect all tests to pass.
- [ ] Commit `fix(content): isolate and repair weekly AI generation`.

### Task 3: Prompt draft and publication lifecycle

**Files:**
- Modify: `packages/database/src/repositories.ts`
- Modify: `packages/contracts/src/content-contract.ts`
- Modify: `apps/api/src/modules/content/routes.ts`
- Modify: `apps/web/src/api/operator.ts`
- Modify: `apps/web/src/app/operator/OperatorRouteController.tsx`
- Modify: prompt-settings component under `apps/web/src/app/operator/`
- Test: `apps/api/test/content.integration.test.ts`
- Test: `apps/web/src/app/operator/OperatorRouteController.test.tsx`

**Interfaces:**
- Produces: `publishPromptVersion(versionId)` that atomically activates exactly one version.
- Produces: UI status and separate Save draft / Publish actions.

- [ ] Write failing API and UI tests proving a draft is not active and publishing changes the next runtime prompt version.
- [ ] Run the focused tests and confirm they fail on the missing publish action.
- [ ] Implement repository transaction, endpoint, client method, and explicit UI controls.
- [ ] Run focused API/UI tests and expect all tests to pass.
- [ ] Commit `feat(ai): add explicit prompt publication`.

### Task 4: Durable assessment scoring and regrade status

**Files:**
- Modify: `packages/database/src/schema.ts`
- Modify: database migration files under `packages/database/migrations/`
- Modify: `packages/database/src/repositories.ts`
- Modify: `apps/api/src/modules/assessment/routes.ts`
- Modify: `apps/worker/src/handlers.ts`
- Modify: `packages/contracts/src/assessment-contract.ts`
- Modify: `apps/web/src/app/operator/adapters.tsx`
- Modify: `apps/web/src/app/operator/Dashboard.tsx`
- Test: `apps/api/test/operator-assessment-rescore.integration.test.ts`
- Test: `apps/api/test/assessment-runtime.integration.test.ts`
- Test: worker handler tests under `apps/worker/src/`
- Test: `apps/web/src/app/operator/operator-rescore.test.tsx`

**Interfaces:**
- Consumes: Task 1 stable AI errors.
- Produces: persisted scoring lifecycle and idempotent retry/regrade.

- [ ] Write failing persistence/API/UI tests for failed, retrying, and succeeded scoring states.
- [ ] Run focused tests and verify silent failure/current “Chưa chấm AI” behavior is reproduced.
- [ ] Add migration, repository lifecycle, worker handler, endpoint behavior, and visible status/error UI.
- [ ] Run the focused database/API/worker/UI tests and expect all tests to pass.
- [ ] Commit `fix(assessment): make AI scoring durable and retryable`.

### Task 5: Assessment audio integrity

**Files:**
- Modify: `apps/web/src/app/learner/AssessmentRuntime.tsx`
- Modify: `apps/web/src/app/learner/Assessment.tsx`
- Modify: `apps/web/src/app/providers/Experience.tsx`
- Modify: `scripts/generate-placement-listening-audio.ps1`
- Modify: `packages/domain/src/assessment-blueprints.ts`
- Test: learner assessment audio tests under `apps/web/src/app/learner/`
- Test: `packages/domain/test/assessment-blueprints.test.ts`
- Test: `scripts/placement-listening-audio.test.ts`

**Interfaces:**
- Produces: one global active playback, Play/Stop toggle, unmount cleanup, and transcript/question evidence contract.

- [ ] Write failing tests for toggle state, cross-task exclusivity, navigation cleanup, WPM/pause thresholds, and question evidence.
- [ ] Run focused tests and confirm the reported playback/content failures.
- [ ] Implement the shared playback lifecycle and regenerate/revise listening assets and transcripts.
- [ ] Run focused web/domain/media tests and expect all tests to pass.
- [ ] Commit `fix(assessment): stabilize listening and recording playback`.

### Task 6: Account counts, seasonal contrast, and deploy parity

**Files:**
- Modify: `scripts/prepare-local.ts`
- Modify: `scripts/local-scenario-accounts.ts`
- Modify: `packages/database/src/repositories.ts`
- Modify: `apps/web/src/app/app.css`
- Modify: `apps/web/src/app/shared/shared.css`
- Modify: `render.yaml`
- Create: `scripts/smoke-production.mjs`
- Test: `scripts/local-scenario-accounts.integration.test.ts`
- Test: manager repository/controller focused tests
- Test: seasonal style test under `apps/web/src/app/`
- Test: production smoke script test under `scripts/`

**Interfaces:**
- Produces: non-blocking production startup, accurate pending counts, readable seasonal interactions, and a release smoke command.

- [ ] Write failing tests for resolved/inactive deletion requests, non-reactivation, winter/tet/christmas interaction contrast, and startup with incomplete scenario rows.
- [ ] Run focused tests and confirm the deployment/data/theme regressions.
- [ ] Separate scenario setup from startup, correct queries/tokens, and add the built-API readiness smoke script.
- [ ] Run focused tests plus `pnpm typecheck`, `pnpm build`, and the production smoke command.
- [ ] Commit `fix(deploy): enforce production parity release gate`.

### Task 7: Whole-branch verification and checklist evidence

**Files:**
- Create: `docs/verification/2026-10-26-ai-production-stability.md`

**Interfaces:**
- Consumes: all prior task tests and release commands.
- Produces: test-round evidence mapped to the DOCX/checklist priorities.

- [ ] Run the complete focused AI/API/web/media test set and record commands, counts, and failures.
- [ ] Run `pnpm typecheck` and `pnpm build`.
- [ ] Run production smoke against the built API and readiness endpoint.
- [ ] Record each source issue as pass/fail/not-testable; do not mark provider-live behavior passed without a real deployed key/run.
- [ ] Request one fresh whole-branch code review and address Critical/Important findings with RED→GREEN tests.
- [ ] Commit `docs: record AI production stability verification`.
