# Weekly Five-Level Batch Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Run the five CEFR weekly pipelines concurrently while preserving component checkpoints and level-specific difficulty.

**Architecture:** Keep each level pipeline unchanged as a sequential five-day unit. Add a shared CEFR allocation brief, batch the level units concurrently, aggregate settled results, then run cross-level validation.

**Tech Stack:** TypeScript, Vitest, existing E4S AI task runner.

**Spec:** `docs/superpowers/specs/2026-10-29-weekly-five-level-batch-design.md`

## Global Constraints

- Preserve existing component checkpoints.
- Do not run days concurrently within one level.
- Shared theme and grammar structure across levels are allowed.
- Exact duplicate vocabulary remains a cross-level issue.

## Review Focus

- One level rejection preserves successful sibling outputs and names the failed level.
- Empty or repeated level arguments do not create duplicate generation jobs.
- Checkpoint callbacks remain safe under concurrent calls.
- Cross-level validation runs only after all requested levels succeed.
- Existing single-level generation behavior remains unchanged.

---

### Task 1: Cross-level policy and CEFR allocation

**Files:**
- Modify: `apps/api/src/modules/content/weekly-generation.ts`
- Test: `apps/api/src/modules/content/weekly-generation-cross-level.test.ts`

**Interfaces:**
- Produces: `buildWeeklyLessonLevelAllocation(levels)` and revised `validateWeeklyLessonCrossLevelSet(...)`.

- [ ] Add failing tests proving shared visible grammar frames are allowed and each CEFR lane is distinct.
- [ ] Run the focused test and observe the expected failure.
- [ ] Implement the allocation and revised grammar policy.
- [ ] Run the focused test and observe it pass.

### Task 2: Concurrent all-level orchestration

**Files:**
- Modify: `apps/api/src/modules/content/weekly-generation.ts`
- Test: `apps/api/src/modules/content/weekly-generation-cross-level.test.ts`

**Interfaces:**
- Consumes: CEFR allocation from Task 1.
- Produces: concurrent `generateWeeklyLessonAllLevelsPipeline(...)` with level-attributed failures.

- [ ] Add a failing behavioral test proving two level jobs overlap and settled failures retain successful results.
- [ ] Run the focused test and observe the expected failure.
- [ ] Implement concurrent settled orchestration with normalized unique levels.
- [ ] Run the focused and component tests and observe them pass.

### Task 3: Verification and live batch entrypoint

**Files:**
- Create: `apps/api/scripts/run-weekly-all-levels-pipeline.ts`
- Test: existing weekly generation test suites and TypeScript typecheck.

**Interfaces:**
- Consumes: `generateWeeklyLessonAllLevelsPipeline(...)`.
- Produces: resumable per-level/per-day checkpoint files and one cross-level result.

- [ ] Add the script using existing checkpoint filenames and environment loading conventions.
- [ ] Run tests, typecheck, and `git diff --check`.
- [ ] Execute the clean week batch only after static verification passes.

