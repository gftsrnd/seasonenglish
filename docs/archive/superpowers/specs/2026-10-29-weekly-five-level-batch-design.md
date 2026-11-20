# Weekly Five-Level Batch Design

## Intent

Generate A1, A2, B1, B2, and C1 for the same week concurrently so the operator does not wait for five complete level runs in series.

## Required behavior

- The five levels start concurrently from one approved week plan.
- Days T2-T6 remain sequential inside each level so validated component checkpoints and same-level vocabulary exclusions remain deterministic.
- Every component checkpoint is persisted independently through the existing callback.
- The shared topic, five-day shape, and grammar frame may match across levels; this is not a cross-level defect by itself.
- Each level receives an explicit CEFR lane describing the expected internal difficulty and language behavior.
- Cross-level validation runs after all five level promises settle and continues to reject exact vocabulary reuse.
- A failed level does not erase checkpoints or successful results from sibling levels.

## Non-goals

- Do not replace the existing per-day component pipeline.
- Do not regenerate an entire week to repair one failed component.
- Do not make the five days inside one level concurrent.

## Approach

Use the existing `generateWeeklyLessonLevelPipeline` as the unit of concurrency. Add a deterministic shared allocation brief for all requested levels, append the appropriate lane to each level prompt, and launch all level pipelines with `Promise.allSettled`. Aggregate fulfilled checkpoints and report failures with their level identities. Validate the complete set only when all requested levels succeed.

