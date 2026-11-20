# Four-week pilot and full-level generation design

## Intent

Extend the active local E4S pilot from two weeks to four weeks, create complete non-duplicated topic plans for weeks 2–4, and generate five daily lessons for every active CEFR lane (A1, A2, B1, B2, C1). The result must be reviewable on local without manually repairing generated lesson content.

## Goals

- Keep the existing approved week 1 content unchanged.
- Set the active pilot duration to four weeks.
- Generate and save one complete weekly topic plan for each missing week, with five English blueprint items for all five CEFR levels.
- Generate 25 lessons per week (5 levels × 5 days) for weeks 2–4.
- Run each week sequentially and each level as an independent resumable lane.
- Persist component checkpoints so a failed component resumes without regenerating valid earlier work.
- Validate each level, then cross-validate all five levels before importing that week to local.
- Preserve the rule that levels may share the same communicative progression while complexity differs internally.

## Non-goals

- Do not rewrite or hand-edit individual AI lesson outputs.
- Do not regenerate week 1.
- Do not approve or publish lesson sets automatically; save them as drafts for operator review.
- Do not run all 75 new lessons as one uncheckpointed request.
- Do not change learner-facing scheduling rules beyond extending the pilot to four weeks.

## Constraints

- Use WSL/Docker Engine only; do not start Docker Desktop.
- Use the configured local AI provider and existing environment key.
- Topic suggestions must avoid existing and newly accepted topics.
- Every weekly plan must include exactly A1, A2, B1, B2, C1 and five day blueprints per level.
- Every lesson must pass component validation; failures retain diagnostics and the last valid checkpoint.
- Batch execution must remain restartable after provider limits, network failures, or process interruption.

## Approaches considered

### 1. Sequential weeks with resumable full-level batches — selected

Generate and accept one week topic at a time, then run five independent level lanes for that week, cross-validate, and import before moving to the next week. This is slower than full parallel execution but isolates failures, avoids rate-limit bursts, and makes every saved checkpoint useful.

### 2. Generate all weeks and levels concurrently

This reduces wall-clock time but creates up to fifteen level lanes at once, increases provider throttling risk, and makes failures harder to attribute. Rejected because reliability and diagnosis matter more than speed.

### 3. Stop after topic generation for manual approval

This gives maximum editorial control but requires user intervention three times and conflicts with the request to continue the pilot automatically. Rejected for this run.

## Design

### Pilot extension

Use the existing pilot-cycle settings path to increase the active program from its current duration to four weeks. The operation is an extension only; it must not create a new cycle or decrease the current duration.

### Topic-plan generation

Request weeks 2, 3, and 4 through the existing one-week-at-a-time suggestion pipeline. Carry accepted and rejected option topics forward in `usedTopics` so later weeks cannot repeat them. For each week, accept the first fully validated option returned by the ranked provider response and save its topic, description, objectives, vocabulary hints, and five-level plan.

Before lesson generation, validate:

- exactly one saved plan for the requested week;
- exactly five requested CEFR levels;
- exactly five non-empty day blueprints per level;
- all blueprint labels are present;
- topic is not a duplicate or near-duplicate of any earlier week.

### Lesson generation

For each of weeks 2–4:

1. Create a dedicated output root for that week.
2. Start A1, A2, B1, B2, and C1 together as one controlled five-lane batch. Each lane remains independent and resumable.
3. Within each lane, run days 1–5 sequentially.
4. Save a checkpoint after every validated component.
5. Retry only the failing component, with up to three attempts for components already classified as frequently invalid.
6. Save full diagnostics on terminal failure and leave all valid checkpoints intact.
7. Once every lane completes, run cross-level validation.
8. Import the week into local only when all five level results and cross-level validation are valid.

The run order is week 2 → week 3 → week 4. A later week does not start until the prior week has been imported successfully. Week-level sequencing prevents fifteen simultaneous lanes while preserving the requested five-level batch behavior.

### Validation and review

Automated acceptance for each week requires:

- 25 assembled lessons and no unresolved component failure;
- cross-level validation reports `valid: true`;
- vocabulary enrichment coverage checks for word family, umbrella word, synonym and antonym requirements;
- concise objective and instruction constraints;
- AI, API, and web typechecks still pass;
- local web and API health endpoints return 200 after import.

Operator review remains read-only and displays the complete exercise source/transcript, question, choices, and answer. The generated sets remain drafts so the user can evaluate them before approval.

If cross-level validation fails, map each issue to the implicated level or levels. Invalidate and rerun only the latest relevant component checkpoint for those lanes, then repeat cross-level validation. If an issue cannot be attributed safely, stop that week with full diagnostics and do not import; never regenerate all five lanes merely because one cross-level rule failed.

Weekly import is restart-safe rather than globally transactional. Import begins only after all five validated level files exist. The existing draft-save operation replaces the draft for the same week and CEFR, so rerunning an interrupted import is idempotent. Record an import manifest after each successful level so the coordinator can reconcile a partial import without creating duplicates.

The topic provider receives up to two complete attempts, matching the existing suggestion service. If neither response contains a fully valid option, stop with structured findings and do not begin lesson generation for that week. Every topic option returned by a valid response—selected or unselected—is carried into `usedTopics` for later weeks. Near-duplicate detection uses the existing normalized token/Dice validator: exact normalized match, or at least two shared tokens with Dice similarity of 0.65 or greater.

Post-import typecheck or health failure does not delete already imported drafts. The week is marked verification-failed in its run manifest, remains unapproved, and can be reconciled after the local service is repaired.

### Recovery

Rerunning the same week and level reuses validated component checkpoints whose fingerprint matches the week plan, CEFR level, prompt version, and quality profile. If a topic plan changes, its fingerprint changes and stale lesson checkpoints are not reused.

## Expected result

The local pilot contains four weeks. Week 1 remains as-is; weeks 2–4 each contain a distinct workplace topic and 25 draft lessons across A1–C1, for 75 newly generated lessons and 100 lessons across the complete four-week pilot.
