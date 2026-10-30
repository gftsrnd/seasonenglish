# Level Vocabulary Registry Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Prevent duplicate learner-facing vocabulary in one level and render a shared umbrella label once per vocabulary group.

**Architecture:** Add a deterministic registry projection in the content domain, use it as the generator's hard vocabulary admission check, and persist umbrella groups with each vocabulary part. Both lesson renderers consume the same group projection with a legacy fallback.

**Tech Stack:** TypeScript, Vitest, React.

**Spec:** `docs/superpowers/specs/2026-10-30-level-vocabulary-registry-design.md`

## Global Constraints

- Never ban terms used only in examples or exercises.
- Duplicate primary or learner-facing lexical metadata is blocking; repair only vocabulary.
- Keep the five-level batch concurrent.
- Preserve legacy lesson rendering when `groups` is absent.

## Review Focus

- A synonym shared by two target words must block the later vocabulary component, not a complete lesson.
- The same umbrella may group several targets in one lesson yet render once.
- The same word in a reading/example is not treated as a duplicate vocabulary introduction.
- A vocabulary-only repair sees lexical terms from every untouched day as forbidden.
- Operator and Learner render identical grouping for both new and legacy content.

### Task 1: Canonical lexical registry

**Files:**
- Modify: `packages/domain/src/content/generation-quality.ts`
- Test: `packages/domain/test/content.test.ts`

**Interfaces:**
- Produces: `buildLevelVocabularyRegistry(lessons)` and blocking registry findings consumed by the quality gate.

- [ ] Write tests for duplicated primary, synonym and umbrella terms, and for an example-only occurrence.
- [ ] Run the focused domain test and confirm it fails because registry metadata is absent.
- [ ] Implement the registry and quality findings without treating prose/examples as vocabulary entries.
- [ ] Run focused domain tests and typecheck.

### Task 2: Generation admission and persisted umbrella groups

**Files:**
- Modify: `apps/api/src/modules/content/weekly-generation.ts`
- Test: `apps/api/src/modules/content/weekly-generation-components.test.ts`

**Interfaces:**
- Consumes: registry terms from Task 1.
- Produces: vocabulary part content `{ items, groups }`; component-only repair receives untouched-day lexical terms as hard exclusions.

- [ ] Write a failing generation test for an unchanged-day lexical relation returned again by a vocabulary repair and a grouping test for shared umbrella labels.
- [ ] Run the focused API test and confirm failure.
- [ ] Pass retained registry terms to vocabulary generation; reject/retry duplicate lexical metadata; persist `groups` with vocabulary content.
- [ ] Run focused API tests and typecheck.

### Task 3: Shared grouped vocabulary presentation

**Files:**
- Modify: `apps/web/src/app/learner/Learning.tsx`, `apps/web/src/app/operator/adapters.tsx`, shared lesson presentation helper/styles as needed
- Test: `apps/web/src/app/learner/Learning.test.tsx`, `apps/web/src/app/operator/adapters.test.tsx`

**Interfaces:**
- Consumes: `{ items, groups }` with fallback derivation for old parts.

- [ ] Write failing render tests proving `office supplies` appears once for `paper`, `box`, and `pen` in both roles.
- [ ] Run focused web tests and confirm failure.
- [ ] Implement the shared grouping projection and render one group header without repeating umbrella chips.
- [ ] Run focused web tests and typecheck.

### Task 4: Integrated verification

**Files:** no production changes unless a failing test identifies a defect.

- [ ] Run affected domain/API/web tests, all three typechecks, and a local API health check.
- [ ] Inspect the final diff for unrelated changes before committing.
