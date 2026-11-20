# Monthly Learning Cycle Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans task-by-task.

**Goal:** Replace weekly content delivery with a controlled monthly curriculum while preserving legacy data and immutable published lessons.

**Architecture:** Port only the proven calendar, monthly assessment, learner attendance, and manager-lock foundations from the prototype. Build the curriculum contract, scoped daily generation, quality gate, immutable corrections, and Operator flow natively on `codex/deploy-web-fallback`; do not merge the prototype branch wholesale.

**Tech Stack:** TypeScript, Fastify, PostgreSQL migrations, Vitest, React.

**Spec:** User-approved plan in this Codex conversation, 2026-11-02.

## Global Constraints

- One shared monthly theme for all A1–C1 frameworks.
- New vocabulary is Monday–Thursday; Friday is review only; core vocabulary count is three times the new-day count.
- Every level has four concrete grammar topics and four sounds.
- Manual additions are supplemental only and never change monthly exam scope.
- Severe quality issues block approval; one or two light issues require explicit Operator acknowledgement.
- Approved lessons are immutable; corrections are audited revisions, never a direct draft rollback.
- Preserve legacy weekly data and tests; migrations only add or deprecate.
- Do not modify the pre-existing `docker-compose.yml` change or untracked local artifacts.

## Review Focus

- A Friday must never introduce a core word.
- A regenerated framework must never resume a checkpoint from an older scope hash.
- Batch generation must never overwrite a draft, manual, or approved day.
- A published correction must not hide an otherwise available learner level.
- A monthly exam must only assess core terms, grammar steps, and sounds in the approved contract.

### Task 1: Monthly calendar and curriculum contract

**Files:** Create focused domain calendar/curriculum modules and tests; modify domain exports only.

- [ ] Write failing domain tests for 20- and 22-lesson months, Friday review, dynamic core count, distinct core terms, controlled support terms, grammar steps, sound-example rotation, and immutable scope hash.
- [ ] Implement pure `buildMonthlyCurriculum`, `validateMonthlyCurriculum`, and `recommendedPendingBatch` APIs.
- [ ] Run the focused domain suite and commit `feat: add shared monthly curriculum contract`.

### Task 2: Persistence and monthly API foundations

**Files:** Add additive migrations, contracts, repositories, and monthly Fastify routes with integration tests.

- [ ] Write failing integration tests for shared brief, five frameworks, framework approval, recommended ten-day batch, and no legacy-data mutation.
- [ ] Persist brief/version/scope hash, framework contract, day status, quality acknowledgements, and correction audit metadata.
- [ ] Implement validated API endpoints and commit `feat: persist monthly briefs and scoped frameworks`.

### Task 3: Scoped generation and quality gate

**Files:** Create separate monthly generation/quality modules and tests; reuse only narrowly scoped validators from weekly generation.

- [ ] Write failing tests for per-component retry/resume, no sample fallback, severe/light classification, acknowledgement, and no batch overwrite.
- [ ] Implement generation jobs from immutable day specifications and expose diagnostics by level/day/component.
- [ ] Run focused API/domain tests and commit `feat: add scoped monthly generation quality gate`.

### Task 4: Immutable approval, correction, and exam scope

**Files:** Repository/routes/assessment integration and tests.

- [ ] Write failing integration tests for immutable approval, Admin-authorized correction revisions, learner correction visibility, and exam scope mapping.
- [ ] Reuse immutable lesson versions; add correction events rather than reopening the approved record.
- [ ] Port and adapt the deterministic monthly exam blueprint; require real listening artifacts before approval.
- [ ] Commit `feat: add immutable monthly corrections and exam scope`.

### Task 5: Operator, Learner, and Manager UI

**Files:** Monthly API clients, Operator month planner, learner month/exam screens, manager monthly readiness screens, and focused component tests.

- [ ] Write failing UI tests for shared brief, curriculum display, batch proposal, locked day, quality acknowledgement, and correction history.
- [ ] Implement the monthly planner and preserve old weekly routes as compatibility/read-only until migration is accepted.
- [ ] Display four monthly readiness metrics but never execute automatic level changes without an active policy.
- [ ] Commit `feat: integrate monthly learning user flows`.

### Task 6: End-to-end release gate

- [ ] Add fixtures and E2E/integration coverage for all five levels, complete month generation, manual supplemental content, approvals, learner availability, attendance, appeal, lock/unlock, and exam visibility.
- [ ] Run typecheck, focused unit/integration/web suites, then a clean real-provider generation using a new topic.
- [ ] Commit `test: verify monthly learning release gate`.
