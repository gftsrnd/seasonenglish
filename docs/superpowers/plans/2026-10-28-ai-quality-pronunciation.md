# AI quality and pronunciation generation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Preserve baseline AI lesson generation while adding reversible strict quality checks and stable phoneme-only pronunciation assets.

**Architecture:** Keep generation orchestration in `weekly-generation.ts`; extract deterministic IPA/audio normalization into a small pure module. The default profile remains baseline, while strict mode applies local repairs and emits metrics/diagnostics without changing learner-facing names.

**Tech Stack:** TypeScript, Zod, Vitest, existing Vite public media assets.

**Spec:** `docs/superpowers/specs/2026-10-28-ai-quality-pronunciation-design.md`

## Global Constraints

- Preserve C-021 no-AI fallback and A-045 partial-success behavior.
- Preserve `pronunciation.content.phonemeAudioUrl` and `wordAudioUrls`.
- `phonemeAudioUrl` must be phoneme-only audio; word URLs are separate.
- Do not edit database/storage migrations or learner/operator page layout.
- Use exact checklist IDs from the supplied checklist; requirements are acceptance extensions, not new IDs.

## Review Focus

- A target word with a wrong final consonant must not satisfy the phoneme check: test `slipped /slɪpt/` against `/d/`.
- Missing optional pronunciation audio must warn without blocking a valid lesson.
- Invalid recoverable sections must be locally repaired/preserved while fatal empty output blocks publication.
- Baseline output must remain unchanged when strict mode is disabled.
- Phoneme and word audio identifiers must never be interchangeable.

### Task 1: Curated IPA and audio contract

**Files:**
- Create: `packages/ai/src/pronunciation.ts`
- Test: `packages/ai/test/pronunciation.test.ts`
- Modify: `packages/ai/src/index.ts`
- Modify: `packages/contracts/src/learning-contract.ts` only if the existing contract needs the stable fields typed.

- [ ] Write failing tests for curated IPA lookup, exact target matching, the slipped regression, and distinct phoneme/word audio URLs.
- [ ] Run the focused test and confirm it fails for the missing module/behavior.
- [ ] Implement a small immutable mapping and `buildPronunciationAssets` returning `phonemeAudioUrl`, `wordAudioUrls`, and a warning list.
- [ ] Run focused tests and then the AI package tests.

### Task 2: Reversible generation profile and strict local repairs

**Files:**
- Modify: `apps/api/src/modules/content/weekly-generation.ts`
- Test: `apps/api/src/modules/content/weekly-generation.test.ts`
- Modify: `apps/api/src/modules/content/enrichment.ts` if merge behavior needs to preserve new pronunciation fields.

- [ ] Add failing regression tests showing baseline output remains unchanged and strict mode repairs/retains valid sections.
- [ ] Run them red.
- [ ] Add an explicit `qualityProfile` option, keep baseline default, and use strict-only deterministic pronunciation normalization/metrics.
- [ ] Attach stable pronunciation fields while preserving existing fields and partial failures.
- [ ] Run focused API tests.

### Task 3: Provenance/rollback documentation and full verification

**Files:**
- Modify: `docs/superpowers/specs/2026-10-28-ai-quality-pronunciation-design.md`
- Modify: `docs/superpowers/plans/2026-10-28-ai-quality-pronunciation.md`

- [ ] Record the exact profile switch and Agent 2 contract.
- [ ] Run typecheck, focused tests, and the full repository test command.
- [ ] Review the diff for unrelated changes and commit the scoped implementation.
