# P1 Core Learning Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: use `superpowers:executing-plans`; follow test-driven development and verification-before-completion.

**Goal:** Make the complete learner-critical path correct: Placement → AI/manual scoring → Operator CEFR approval → generated lesson → valid exercises/feedback → lesson completion.

**Architecture:** Move all scoring, validation, timing, and completion rules into deterministic server/domain code; version prompt contracts; validate and independently verify AI output; keep UI state derived from persisted server state.

**Tech Stack:** TypeScript, React, Fastify, PostgreSQL, Anthropic-compatible provider, Vitest, Testing Library, Playwright, Docker WSL.

## Task 0 — Freeze baseline and map evidence

**Files:** existing tests under `apps/api/test`, `apps/web/src/app/learner`, `packages/domain/test`; new evidence ledger under `artifacts/verification/` during execution.

- Record dirty files and current test failures.
- Map L-022–L-036, C-018, O-005–O-007, A-006–A-009, L-042–L-050 to tests and owners.
- Do not reuse migration numbers 0049–0051; select the next free number at execution time.

## Task 1 — Placement blueprint and immutable answer keys

**Files:** `packages/database/src/assessment-blueprints.ts`, assessment blueprint/domain tests.

RED tests:

- Timed sections total 75 minutes: Listening 15, Reading 25, Writing 20, Speaking 15; administrative allowance is separate.
- Listening is 15 questions, weights 10×1 + 5×2, three recordings, maximum two plays, no learner transcript.
- Reading is 40 questions with the exact spec key.
- Writing W1/W2 prompts, timeboxes, word ranges, and weights 7/13 match the spec.
- Speaking S1–S4 stimuli, data values, role-play turn limit, and typed-proxy review flag match the spec.

Implement immutable versioned blueprint data. Published attempts retain a blueprint snapshot/version so future updates do not alter historical scoring.

## Task 2 — Server-authoritative timing, warnings, and anti-cheating

**Files:** `apps/web/src/app/learner/AssessmentRuntime.tsx`, `Assessment.tsx`, assessment routes/repository/contracts and focused tests.

RED tests:

- Sticky section progress, countdown colors, warning count, and submit-section action.
- Reload/exit does not pause server time and cannot reopen submitted sections.
- 5-minute and 1-minute sound/toast; zero triggers a visible five-second countdown and section transition; final section auto-submits.
- Right-click/copy/paste/new-window attempts are blocked and counted; file-picker and microphone-permission transitions are exempt.
- First three real violations warn; fourth causes five-second auto-submit.
- C-018: warning continues while hidden, and fourth violation submits even if effects are muted.

Repository stores server deadlines and violations idempotently. Browser code must not be the source of truth.

## Task 3 — Listening, Reading, Writing, Speaking and microphone

**Files:** assessment contracts/routes/repository, file service, `Assessment.tsx`, `AssessmentRuntime.tsx`, integration tests.

RED tests:

- Audio play count survives reload and concurrent clicks cannot exceed two.
- Draft answers survive reload and are isolated by learner × attempt.
- Writing displays live word count and exact under-range evidence at submission.
- Recording accepts mp3/m4a/wav/ogg/webm, rejects >20MB, persists evidence, and marks technical failure separately.
- Transcript is derived, non-editable, and never used as pronunciation scoring in MVP.
- S3 stops at four learner turns/four minutes/customer acceptance; locks input and records the reason.
- AI unavailable falls back to opening + one-way learner response and still permits manual review.
- Submit confirmation lists each missing answer, under-word task, and missing speaking evidence.

## Task 4 — Per-task manual rubrics and CEFR approval

**Files:** `packages/contracts/src/assessment-contract.ts`, `packages/domain/src/assessment/index.ts`, assessment routes/repository, `apps/web/src/app/operator/Review.tsx`, tests.

Replace aggregate productive-skill forms with task-level data:

- Writing: W1 and W2, five criteria each 0–4, weighted 7/13.
- Speaking: S1–S4, four criteria each 0–5; task score is criterion sum ÷4.
- Values outside ranges are rejected; evidence type is displayed.
- Server recomputes totals; UI and AI totals are never trusted.
- Preserve two decimals and map raw totals without pre-rounding: A1 <25, A2 <45, B1 <65, B2 <85, C1 ≤100.
- Missing productive section, technical error, typed proxy, material skill gap, and ≤0.5 boundary require explicit manual review.

Acceptance examples: W1 criteria 3/3/2/4/3 → 5.25/7; W2 4/3/3/3/4 → 11.05/13; Speaking task sums 12/14/15/15 → 14/20; 70.30 → B2; 84.60 → B2. Operator approval must produce the learner's effective level and audit history.

## Task 5 — A-006 objectives prompt and validator

**Files:** `apps/api/src/modules/content/weekly-generation.ts`, `packages/ai/src/schemas.ts`, prompt version migration, tests.

RED gold/contract tests:

- 2–4 objectives; exactly one content objective plus level-dependent language objectives.
- Every objective begins with SWBAT, uses an observable verb, includes condition and criterion, and maps to an assessment.
- Missing assessment coverage is reported as a gap.
- A1/A2 explanations are Vietnamese; B1+ English.

Publish a new immutable prompt version; validate deterministically before persistence.

## Task 6 — A-008 grammar classifier then generator

Implement the supplied two-stage classifier/generator contract and all 15 supplied cases. Supported categories: grammar rule, sentence pattern, usage rule, word formation, pronunciation rule, no suitable content, insufficient evidence. Add deterministic structural checks and a semantic reviewer. Invalid output is repaired once, then rejected/falls back rather than published.

## Task 7 — A-007 lexical relations, IPA, and TTS

Enforce same part of speech, same sense, contextual substitutability, real antonyms or an empty list, no derivational impostors, IPA/stress/heteronym metadata, SSML and contextual example. Add relation gold cases and ensure B1+ UI receives rich fields while lower levels degrade gracefully.

## Task 8 — A-009 exercise generation and grading

Build separate generation, deterministic grading, semantic grading, independent solver/reviewer, and fallback layers.

RED tests cover supplied T01–T10 plus:

- normalization of case/punctuation/spacing;
- alternate valid answers are accepted;
- self-writing requires at least two words;
- AI-off open responses are retained for manual review;
- answer keys are server-verified before publication;
- feedback may only cite an evidenced error and cannot invent mistakes.

Run the documented quality thresholds under the master token ledger before publishing a prompt/model version.

## Task 9 — Learner lesson UI L-042–L-050

Only start after Tasks 5–8 contracts are stable.

- L-042: render correct meaning, usage, CEFR-appropriate relations, slang/poetic details without conflating senses.
- L-043: target sound plus three words; slower/hold interaction; pause background music during pronunciation/TTS.
- L-045/L-046: maximum two attempts, progressively useful hint, reveal only after success/exhaustion, normalized and semantic grading, accurate translation.
- L-047: speaking unlocks after all three pronunciation examples; recording required; explicit “Kiểm tra nói”; pass if missing words ≤20% under the agreed transcript rule.
- L-048: show Vietnamese question and correct answer after success.
- L-049: reason at least five characters, one appeal per lesson part, persisted status.
- L-050: completion only after every required part; score percentage and real 3–30 minute activity duration; revisiting creates a review attempt without rewriting original completion.

## Task 10 — P1 integrated acceptance

Using the seeded scenario accounts in Docker WSL:

1. New learner starts and completes all four Placement sections.
2. Reload, timing, warning, audio, draft, microphone, and technical-failure cases are demonstrated.
3. Objective sections auto-score; productive sections are AI-scored or safely queued for manual scoring.
4. Operator scores per task and approves CEFR.
5. Learner receives a newly generated lesson from the approved level.
6. Objective, grammar, vocabulary, pronunciation, exercise, feedback, appeal, and completion evidence all match upstream contracts.
7. Logout/login and container restart preserve results.

P1 is accepted only when this complete chain passes; isolated green component tests are insufficient.
