# Weekly AI Language and Lesson Parity Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Enforce CEFR language and two-round selective generation, then render the same lesson presentation for Operator and Learner and verify a newly generated week end to end.

**Architecture:** Domain publication validation is the final safety gate; generation validators produce component findings and targeted repair. A shared read-only lesson presentation owns headings, language fallbacks, ordering, visibility and media for both roles.

**Tech Stack:** TypeScript, React, Fastify, Vitest, PostgreSQL repositories

**Spec:** `docs/superpowers/specs/2026-10-28-weekly-ai-language-parity-design.md`

## Global Constraints

- Never use Docker Desktop.
- Preserve valid AI components; never make generation all-or-nothing.
- Maximum two provider attempts per component: initial generation plus one targeted repair.
- Do not mutate or publish historical lesson sets for acceptance evidence.

## Review Focus

- Vietnamese vocabulary meaning remains valid for B1+ while every other learner-facing field is rejected.
- A1/A2 Vietnamese guidance remains valid.
- Operator and Learner render the same fallback when persisted guidance has the wrong language.
- A failed second repair remains draft and preserves valid components.
- A newly generated five-day set is used for end-to-end acceptance.

---

### Task 1: Language validation at source and publication boundaries

**Files:**
- Modify: `packages/domain/src/content/index.ts`
- Modify: `apps/api/src/modules/content/weekly-generation.ts`
- Modify: `apps/api/src/modules/content/routes.ts`
- Modify: `packages/database/src/repositories.ts`
- Test: `packages/domain/test/content.test.ts`
- Test: `apps/api/src/modules/content/weekly-generation.test.ts`

- [ ] Add failing tests for B1+ mixed content, A1/A2 Vietnamese guidance and B1+ Vietnamese vocabulary meanings.
- [ ] Add CEFR-aware publication and generation validation without rewriting output.
- [ ] Make B1+ prompt contracts English-only outside vocabulary meanings.
- [ ] Run focused domain and generation tests.

### Task 2: Shared Operator/Learner lesson presentation

**Files:**
- Create: `apps/web/src/app/shared/lesson/LessonContentView.tsx`
- Modify: `apps/web/src/app/learner/Learning.tsx`
- Modify: `apps/web/src/app/operator/adapters.tsx`
- Test: `apps/web/src/app/shared/lesson/LessonContentView.test.tsx`
- Test: `apps/web/src/app/operator/adapters.test.tsx`
- Test: `apps/web/src/app/learner/Learning.test.tsx`

- [ ] Add parity tests for B1+ and A1/A2 headings, instructions, part order, visibility and media.
- [ ] Extract the role-neutral presentation and use it from both screens.
- [ ] Keep learner attempts/progress and operator edit/review controls outside the shared component.
- [ ] Run focused web tests and web build.

### Task 3: Two-round selective repair and publication blocking

**Files:**
- Modify: `apps/api/src/modules/content/weekly-generation.ts`
- Modify: `packages/ai/src/service.ts` only if needed to cap nested provider retries for this flow
- Test: `apps/api/src/modules/content/weekly-generation.test.ts`

- [ ] Add tests proving attempt two replaces only the invalid component.
- [ ] Add a test proving unresolved findings block review while valid data remains persisted.
- [ ] Cap the weekly flow at initial plus one targeted repair and run regression tests.

### Task 4: New-set end-to-end acceptance

**Files:**
- Save evidence only under `.artifacts/`; do not alter or publish an existing set.

- [ ] Select a safe empty/new draft week and level.
- [ ] Generate all five days through the local API and record elapsed time/retries.
- [ ] Validate every day/component, CEFR language, collocations, pronunciation/audio and cross-day/level duplication.
- [ ] Confirm the set remains draft and publication is blocked if any serious finding remains.
- [ ] Run focused suites and builds, then report root cause, code changes, automated tests and the new-set results separately.
