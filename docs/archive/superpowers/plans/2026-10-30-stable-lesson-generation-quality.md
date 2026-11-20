# Stable Lesson Generation Quality Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make weekly AI lesson generation admit only levels with zero blocking defects and at most two genuine extended-vocabulary gaps, while preserving valid component checkpoints and repairing only the failed component.

**Architecture:** Extract one domain quality policy and route generation, repair, Operator display and publication through it. Remove fabricated lexical fallbacks, normalize every component retry to three attempts, and use deterministic evidence to decide whether an AI-review finding blocks a lesson.

**Tech Stack:** TypeScript, Vitest, Fastify, PostgreSQL repositories, React.

**Spec:** `docs/superpowers/specs/2026-10-30-lesson-generation-quality-design.md`

## Global Constraints

- Scope is only weekly lesson generation through publication.
- Blocking defects are never downgraded to warnings.
- Light defects are only genuine missing family, umbrella, or lexical relation fields; maximum is two per CEFR level.
- Retry budget is exactly three total attempts per generated component.
- Preserve prior ready drafts; do not run AI during automated verification.

## Review Focus

- A plural, `-ing`, `-ly`, or unrelated derivation must not satisfy word-family coverage; Task 1 pins this.
- A valid calendar label exemption must remain valid while an ordinary workplace word cannot self-exempt; Task 1 pins this.
- One repaired vocabulary day must recompute level-wide gaps from all five merged days; Task 2 pins this.
- A quality-gate failure must retain repair state without marking a candidate ready; Task 3 pins this.
- Review/publication must reject a persisted draft whose quality policy has more than two light defects; Task 4 pins this.

---

### Task 1: Domain quality policy and truthful lexical data

**Files:**
- Create: `packages/domain/src/content/lesson-quality-policy.ts`
- Modify: `packages/domain/src/content/generation-quality.ts`
- Modify: `packages/domain/src/content/index.ts`
- Modify: `packages/domain/test/content.test.ts`
- Modify: `apps/api/src/modules/content/weekly-generation.ts`
- Test: `apps/api/src/modules/content/weekly-generation-components.test.ts`

**Interfaces:**
- Produces: `evaluateLessonQualityPolicy({ cefr, lessons, findings }): GeneratedLessonQuality`.
- Consumed by Tasks 2–4 as the only quality classifier.

- [ ] Write failing tests for two-light pass, three-light fail, real calendar exemption pass, ordinary-word exemption fail, and fabricated word-family failure.
- [ ] Run the focused domain/component tests and verify they fail for the missing policy or fabricated fallback.
- [ ] Implement the policy and remove `synthesizeVocabularyFamilyFallback`; preserve only AI-supplied, validated family data.
- [ ] Run focused tests until green.
- [ ] Commit the domain policy change.

### Task 2: Single repair classification and three-attempt component budget

**Files:**
- Modify: `apps/api/src/modules/content/enrichment.ts`
- Modify: `apps/api/src/modules/content/weekly-generation.ts`
- Modify: `apps/api/src/modules/content/enrichment.test.ts`
- Modify: `apps/api/src/modules/content/weekly-generation-components.test.ts`

**Interfaces:**
- Consumes: `evaluateLessonQualityPolicy` from Task 1.
- Produces: targeted repair sets and a uniform `MAX_COMPONENT_ATTEMPTS = 3` behavior.

- [ ] Write failing tests proving a valid component is retained, an invalid component succeeds on attempt three, and merged five-day lexical gaps are recomputed after one vocabulary repair.
- [ ] Run the focused tests and verify the old two-attempt/duplicated classification behavior fails.
- [ ] Make enrichment and generation consume the shared policy; remove component-local conflicting gap rules and set every component retry ceiling to three.
- [ ] Run focused tests until green.
- [ ] Commit the repair/retry change.

### Task 3: Quality-failure recovery without unsafe overwrite

**Files:**
- Modify: `apps/api/src/modules/content/routes.ts`
- Modify: `apps/api/test/content.integration.test.ts`
- Modify: `apps/api/src/modules/content/weekly-generation.ts`
- Test: `apps/api/src/modules/content/weekly-generation-components.test.ts`

**Interfaces:**
- Consumes: Task 1 policy and Task 2 repair targets.
- Produces: retained checkpoint/candidate diagnostics and targeted repair for quality failures.

- [ ] Write failing integration tests proving a quality failure triggers targeted component repair, keeps the prior ready draft unchanged, and never returns a ready version while blocking issues remain.
- [ ] Run the focused tests and verify the current immediate quality-failure path fails them.
- [ ] Route quality failures through the same component-repair path as pipeline failures; retain diagnostics/checkpoints but save only a policy-ready generated version as the active AI draft.
- [ ] Run focused tests until green.
- [ ] Commit the recovery change.

### Task 4: Deterministic reviewer and admission at review/publication

**Files:**
- Modify: `apps/api/src/modules/content/weekly-generation.ts`
- Modify: `apps/api/src/modules/content/routes.ts`
- Modify: `packages/database/src/repositories.ts`
- Modify: `packages/domain/test/content.test.ts`
- Modify: `apps/api/test/content.integration.test.ts`

**Interfaces:**
- Consumes: `evaluateLessonQualityPolicy` from Task 1.
- Produces: reviewer findings that block only with verified evidence, and review/publication admission using the same policy.

- [ ] Write failing tests for a style-only reviewer note becoming warning, a source/key contradiction blocking, and persisted >2-light draft rejection at review and publication.
- [ ] Run focused tests and verify current publication validation allows the excess-light draft.
- [ ] Replace reviewer disposition heuristics with evidence-backed deterministic classification; call the shared policy from review and publication paths.
- [ ] Run focused tests until green.
- [ ] Commit the admission change.

### Task 5: Restore orchestration regression coverage and prove the full generation path

**Files:**
- Modify: `apps/api/src/modules/content/weekly-generation.test.ts`
- Modify: `apps/web/src/app/operator/adapters.test.tsx`
- Modify: `apps/api/src/modules/content/weekly-generation-cross-level.test.ts`

**Interfaces:**
- Consumes: the completed quality/retry/admission interfaces from Tasks 1–4.
- Produces: a green, contract-based regression suite for lesson generation.

- [ ] Replace stale expectations for hidden grammar, two attempts, and synthetic family data with the approved policy tests.
- [ ] Add route-to-Operator assertions: ready only at `0 heavy / <=2 light`; incomplete candidates remain visibly repairable.
- [ ] Run the focused generation suite, API content integration, domain tests, web adapter tests, and both API/web typechecks.
- [ ] Run `pnpm test:unit`; record unrelated pre-existing failures separately if any remain.
- [ ] Commit test synchronization and final verification.
