# AI quality and pronunciation generation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Preserve baseline AI lesson generation while adding reversible strict quality checks and stable phoneme-only pronunciation assets.

**Architecture:** Keep generation orchestration in `weekly-generation.ts`; extract deterministic IPA normalization and registry-backed audio resolution into small pure modules. The default profile remains baseline, while strict mode applies local repairs and emits metrics/diagnostics without changing learner-facing names. Audio URLs are emitted only from verified registry entries, so an empty registry produces no 404-prone URLs.

**Tech Stack:** TypeScript, Zod, Vitest, existing Vite public media assets.

**Spec:** `docs/superpowers/specs/2026-10-28-ai-quality-pronunciation-design.md`

## Global Constraints

- Preserve C-021 no-AI fallback and A-045 partial-success behavior.
- Preserve `pronunciation.content.phonemeAudioUrl` and `wordAudioUrls`.
- `phonemeAudioUrl` must be phoneme-only audio; word URLs are separate.
- Emit an audio URL only when a corresponding verified registry entry exists; missing assets produce warnings and no URL fields.
- Store future phoneme clips under `apps/web/public/media/audio/phonemes/` and word clips under `apps/web/public/media/audio/words/`, with manifest/hash/license verification.
- Do not edit database/storage migrations or learner/operator page layout.
- Use exact checklist IDs from the supplied checklist; requirements are acceptance extensions, not new IDs.

## Review Focus

- A target word with a wrong final consonant must not satisfy the phoneme check: test `slipped /slɪpt/` against `/d/`.
- Missing optional pronunciation audio must warn without blocking a valid lesson.
- Invalid recoverable sections must be locally repaired/preserved while fatal empty output blocks publication.
- Baseline output must remain unchanged when strict mode is disabled.
- Phoneme and word audio identifiers must never be interchangeable.

### Task 1: Registry-backed pronunciation assets

**Files:**
- Create: `packages/ai/src/pronunciation.ts`
- Create: `packages/ai/src/pronunciation-assets.ts`
- Test: `packages/ai/test/pronunciation.test.ts`
- Modify: `packages/ai/src/index.ts`
- Modify: `packages/contracts/src/learning-contract.ts` only if the existing contract needs the stable fields typed.
- Create: `apps/web/public/media/pronunciation-manifest.json`
- Create: `scripts/verify-pronunciation-assets.mjs`
- Test: `scripts/verify-pronunciation-assets.test.mjs`
- Modify: `package.json`

- [ ] Write failing tests for curated IPA lookup, exact target matching, the slipped regression, registry-only URL emission, and manifest/file verification.
- [ ] Run the focused tests and confirm they fail because unregistered URLs are currently emitted and the verifier is missing.
- [ ] Implement the registry and make `buildPronunciationAssets` return URLs only for registered phoneme and word assets.
- [ ] Implement the empty-by-default pronunciation manifest and `pnpm verify:pronunciation` verifier; it must fail on missing, hash-mismatched, or unregistered future files.
- [ ] Run focused tests and the media verification command.

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

- [ ] Record the exact profile switch, Agent 2 contract, and audio registry/storage mechanism.
- [ ] Run typecheck, focused tests, and the full repository test command.
- [ ] Review the diff for unrelated changes and commit the scoped implementation.
