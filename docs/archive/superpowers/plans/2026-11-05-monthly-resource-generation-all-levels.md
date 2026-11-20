# Monthly Resource Generation Across CEFR Levels

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Make monthly resource generation reliably produce semantically valid A1–C1 pools, establish A1 quality first, then generate the other levels with the same pipeline.

**Architecture:** Keep a shared generation and validation pipeline for every CEFR level. Generate and audit the three mandatory support relationships independently, then gather optional high-quality supports; accept six valid items per core as the floor and never fail only because nine or 432 were not reached. Persist only validated categories as draft checkpoints.

**Tech Stack:** TypeScript, Fastify, Vitest, PostgreSQL draft checkpoints, existing AI task runner.

**Spec:** `C:/Users/TT5.01 AI UD/Downloads/e4s_spec_final_expectation.docx`, VH-R30–R37; user clarifications: minimum six support placements per core with umbrella, synonym and word family; antonyms are optional; repeated expanded terms may occupy up to 35% of the pool; apply the shared fix to all CEFR levels, with A1 quality proven before rolling out.

## Global Constraints

- Keep the approved monthly theme and core headwords unique and level-appropriate.
- Require at least six valid support items per core; the minimum includes umbrella, synonym and word family.
- Add an antonym only when it is a genuine opposite in the exact sense.
- Repeated expanded placements remain at or below 35%.
- Never publish incomplete or unaudited resource categories.
- Use the same generator rules for A1, A2, B1, B2 and C1.

## Review Focus

- A core has no genuine required relationship: replace that core without failing the whole batch if valid replacements exist.
- Six valid supports exist but the ninth does not: accept the six; do not retry endlessly or fail.
- A model mislabels a candidate: reject it before checkpointing.
- A repeated support exceeds the 35% ceiling: reject only that placement and continue with another candidate.
- A1 is successful but a higher CEFR has different POS/semantic constraints: run the same validation under each CEFR before treating rollout as complete.

---

### Task 1: Generate required support relations independently

**Files:**
- Modify: `apps/api/src/modules/content/monthly-resource-generation.ts`
- Modify: `apps/api/src/modules/content/monthly-routes.ts`
- Test: `apps/api/src/modules/content/monthly-resource-generation.test.ts`

- [ ] Add tests for per-relation prompts and for accepting six audited supports without requiring nine.
- [ ] Run the targeted tests and confirm the new cases fail for the intended reason.
- [ ] Add a shared prompt builder that requests umbrella, synonym and word-family candidates in separate relation-specific slices for the current CEFR/core sense.
- [ ] Refactor the monthly route to audit and select those required relations first, generate optional supports only after the required three are satisfied, and accept six or more valid supports up to the requested cap.
- [ ] Preserve category checkpointing, core replacement, uniqueness and the 35% repeat ceiling.
- [ ] Run the targeted resource-generation suite and API typecheck.

### Task 2: Generate and review A1 before rollout

**Files:**
- Use API: `POST /api/v1/content/months/:month/resources/generate`
- Inspect API draft checkpoint and Operator month overview.

- [ ] Generate A1 through the authenticated local API.
- [ ] Review core/support relationships, grammar progression, pronunciation progression, 9 examples per pronunciation target, and count/repeat limits.
- [ ] Keep the result in draft until it passes; do not overwrite or publish a failed pool.
- [ ] Once A1 passes, run the same API pipeline for A2, B1, B2 and C1 in order, retaining each as draft for review.

