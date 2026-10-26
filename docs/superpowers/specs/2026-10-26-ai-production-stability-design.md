# AI Production Stability Design

## Goal

Make every E4S AI-backed flow testable and recoverable in the deployed environment. A valid user action must either produce a valid result or expose a specific retryable failure; it must never silently succeed while dropping AI output.

## Sources and priority

This design follows the 23/10 developer-fix document and cross-checks the linked test checklist. The first release gate is the document's P0 failure: operators must be able to generate lesson content and learners/operators must be able to complete AI-backed workflows on the deployed service.

Priority order:

1. AI generation and grading correctness.
2. Prompt publication and runtime-version visibility.
3. Independent per-level generation and recoverability.
4. Production/deploy startup and smoke verification.
5. Assessment audio integrity, account data consistency, and seasonal contrast regressions reported in the same test round.

## AI surface inventory

The release gate covers every registered task, not only weekly lessons:

- Coach dialogue.
- Week suggestions.
- Weekly lesson grammar classification, foundation, vocabulary, skills, and complete-day generation.
- Weekly-practice grading and vocabulary generation.
- Placement assessment scoring and level-form generation.
- Micro-lesson generation and micro grading.

## Design

### 1. One repair boundary

`createAiService` owns parsing, normalization, schema validation, semantic validation, and retry. Task definitions may provide an output normalizer and semantic validator. Provider JSON parse failures, schema failures, and semantic failures are represented as repairable `AI_OUTPUT_INVALID` failures. The repair prompt names only sanitized issue paths and messages.

Weekly foundation normalization runs before strict validation, so omitted `instruction.step1` or `instruction.step2` can be derived from the available instruction text instead of failing before the fallback is reached. Week suggestions validate requested week/level coverage and exactly five T2–T6 items inside this same boundary.

### 2. Explicit prompt publication

Saving remains a draft operation. Operators receive a separate Publish action. Publishing atomically retires the prior active version and activates the selected draft. API responses expose active/draft state and runtime AI calls continue to resolve only active versions. The UI must not imply that a saved draft is already live.

### 3. Durable assessment scoring state

Assessment submission and regrade record an AI scoring run lifecycle: `queued`, `running`, `succeeded`, or `failed`. A failed run preserves existing deterministic/human scores, stores a sanitized error code, and is visible as “AI chấm lỗi — thử lại” rather than “Chưa chấm AI”. Regrade is idempotent by request ID and can be retried without duplicating scores.

The first implementation may execute the job in-process through the existing job repository/worker boundary, but the persisted lifecycle is authoritative. A process restart cannot turn a failed run into an invisible missing result.

### 4. Independent generation cells

Each `(week, CEFR)` generation is an independent operation. The client uses settled results and continues after one level fails. Responses identify succeeded and failed cells. The rate limit applies to the logical batch or is high enough for all active levels; adding C1 must not make a five-level batch fail at request four.

### 5. Deploy parity

Production startup must not depend on mutable scenario-data assertions. Scenario preparation is an explicit opt-in command and cannot prevent the API from binding its port. Render/Koyeb-style deployment uses the built artifacts, production environment variables, and readiness endpoint.

Verification has three layers:

- Focused unit/integration tests for each repaired contract.
- Production build and typecheck.
- A deployment smoke command that starts the built API with production settings, checks `/api/readiness`, and exercises AI health/configuration without exposing secrets. If a real provider key is unavailable in CI, the smoke test uses the same HTTP/provider boundary with a deterministic local provider fixture.

### 6. Adjacent regressions from the same test round

- Only one audio source may play at a time. Replay buttons toggle Play/Stop and leaving the assessment stops playback.
- Listening audio targets 140–150 WPM with 0.7–1.0 second speaker pauses; every question must be supported by explicit transcript evidence.
- Pending deletion counts ignore resolved requests and inactive learners; remote startup must not reactivate deleted accounts.
- Seasonal hover/active tokens must retain WCAG-readable contrast on Winter, Tet, and Christmas backgrounds.

## Error and observability contract

Persist or return a stable code from this set: `AI_PROMPT_NOT_READY`, `AI_PROVIDER_RATE_LIMIT`, `AI_PROVIDER_FAILED`, `AI_TIMEOUT`, `AI_OUTPUT_INVALID`, `AI_SCORING_FAILED`. Logs include task key, prompt version, trace ID, provider/model, attempt count, and sanitized issue paths. They never include learner free text or API keys.

## Acceptance criteria

- Every registered AI task has a valid fixture that passes its real input/output schemas through `createAiService`.
- Repairable malformed output receives a repair attempt; valid second output succeeds.
- Missing weekly instruction steps and missing week/level/day coverage are repaired inside the retry boundary.
- Publishing a prompt makes the exact version active; saving a draft alone does not.
- Failed assessment scoring is visible and retryable; successful regrade replaces AI sections and feedback.
- One failed level does not stop later levels.
- Focused tests, typecheck, production build, and deployment smoke all pass before deployment is reported ready.
- Audio, deletion-count, and seasonal-contrast focused regressions pass.

