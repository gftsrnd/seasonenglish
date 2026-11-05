# Weekend Review Implementation Plan

> **For agentic workers:** Execute this plan in the current worktree, one vertical slice at a time. Keep existing approved monthly frameworks immutable.

**Goal:** Implement Friday weekly reviews from Monday–Thursday content with the six-part, retry-until-correct flow, attendance rules, and next-week unlock gate in the supplied specification.

**Architecture:** Extend the existing monthly `DaySpec`, lesson generation, learner lesson, and progress paths so a review remains attached to its approved monthly framework. Store review section progress as resumable learner state; count attendance separately from lesson progress and level readiness. Reuse existing six practice part codes for the six sections and use the review vocabulary payload for the optional flip-card warm-up.

**Tech Stack:** TypeScript, Zod, Fastify, PostgreSQL, React, Vitest.

**Spec:** `C:/Users/TT5.01 AI UD/.codex/attachments/d6bdeff4-55c8-49b5-a6ea-3fc03e8e616d/pasted-text-1.txt`

## Global Constraints

- Reviews use only resources taught in the week; no new vocabulary, grammar, or pronunciation may be introduced.
- A complete week has 12 core words, four grammar steps, and the week's pronunciation material; shorter weeks scale question counts while keeping all six sections.
- The review has an optional, ungraded flip-card warm-up, followed by six required sections.
- Wrong answers receive an explanation and a context-different retry at the end of the section; there is no attempt limit and no score penalty.
- A1–A2 explanations use Vietnamese; B1–C1 explanations use simple English.
- Reviews do not count as lessons or level-up/report progress. Completing on Friday counts Friday attendance; completing later does not erase Friday absence, and a makeup on an effective study date may count attendance for that date.
- The next Monday stays locked until the previous week's review is complete; a review-only first week is not a gate.
- If Friday is the monthly exam, the exam replaces the review. The final exam week has no review when the exam falls Monday–Thursday.
- Review answers do not create Operator exercise-error alerts. That alert remains specific to daily lessons.
- Review content is generated with daily lessons from the locked monthly framework; the Operator reviews both together.

## Review Focus

- Short or holiday weeks can have fewer than four new days; the six sections must still be complete and scoped to only taught material.
- A review-only first month week needs the previous month's approved material without creating an unlock dependency.
- A Friday missed and later makeup must record the original Friday absence and the effective makeup-day attendance independently.
- A learner who exits midway must resume at the first unfinished section without losing correct answers or retry variants.
- Repeated wrong answers must not exhaust attempts or create daily-lesson Operator alerts.

---

### Task 1: Weekly Review Schedule and Resource Scope

**Files:**
- Modify: `packages/domain/src/monthly/curriculum.ts`
- Modify: `packages/contracts/src/monthly-contract.ts`
- Modify: `apps/api/src/modules/content/monthly-routes.ts`
- Test: `packages/domain/test/monthly-curriculum.test.ts`

**Interfaces:**
- Preserve `MonthlyDaySpec.kind` as `new | review`; add explicit week identity, prerequisite lesson numbers, and whether the review gates the next week.
- Replace positional every-fifth-slot review inference with calendar-week Friday scheduling and exam-week exceptions.

- [ ] Derive review days from the calendar Friday and the new lessons in that Monday–Thursday week.
- [ ] Bind each review to only the current week's core/support IDs, grammar steps, sound IDs, and examples; keep the first-week prior-month review non-gating.
- [ ] Cover exam Friday, Mon–Thu exam week, short month-start/end weeks, and holiday dates once their source is established.

### Task 2: Six-Part AI Review Generation and Quality Gate

**Files:**
- Modify: `packages/ai/src/schemas.ts`
- Modify: `packages/database/src/prototype-prompts.ts`
- Modify: `apps/api/src/modules/content/monthly-day-generation.ts`
- Modify: `apps/api/src/modules/content/monthly-quality.ts`
- Test: `apps/api/src/modules/content/monthly-day-generation.test.ts`
- Test: `apps/api/src/modules/content/monthly-quality.test.ts`

**Interfaces:**
- Review sections use the existing learner part codes: `listening`, `word_use`, `word_class`, `grammar`, `reading`, `speaking`.
- The generated review payload stores retry variants and source IDs alongside each question; section progress remains separate from daily `LessonProgressView` scoring.

- [ ] Generate listening/word recognition, word use, word form, weekly grammar plus one prior-week item, audio reading with three comprehension questions, and pronunciation/read-aloud/free response.
- [ ] Require weekly core words to appear at least twice across the review, while all passage and prompts use learned or familiar foundation vocabulary.
- [ ] Require the correct explanation language by CEFR, audio for text, and changed-context retry items.
- [ ] Keep wrong-answer review feedback out of the daily exercise-error alert path.

### Task 3: Resumable Review Attempts, Attendance, and Unlocks

**Files:**
- Modify: `packages/contracts/src/learning-contract.ts`
- Modify: `packages/database/src/schema.ts`
- Modify: `packages/database/src/repositories.ts`
- Modify: `packages/database/src/monthly-content-repository.ts`
- Modify: `apps/api/src/modules/learning/routes.ts`
- Test: relevant learning and monthly-content integration tests

**Interfaces:**
- Add a review-session state keyed by learner, framework, and review day, with completed sections, selected answers, retry state, and completion timestamp.
- Derive next-week access from completion of the prior gating review; leave day/date locks and monthly-exam eligibility based on new lessons only.

- [ ] Persist progress after each review section so returning learners resume at the first unfinished section.
- [ ] Make review section completion require one correct pass; retry wrong items with their alternative contexts and no attempt ceiling.
- [ ] Record Friday attendance only when completed Friday; record makeup attendance for the effective makeup date without clearing Friday absence.
- [ ] Exclude reviews from level-up, lesson-count, and learning-progress reports while retaining review completion for the unlock gate.

### Task 4: Learner and Operator Review Experience

**Files:**
- Modify: `apps/web/src/app/learner/Learning.tsx`
- Modify: `apps/web/src/app/learner/Home.tsx`
- Modify: `apps/web/src/app/learner/contracts.ts`
- Modify: `apps/web/src/api/learner.ts`
- Modify: `apps/web/src/app/operator/Months.tsx`
- Test: focused learner and operator UI tests

- [ ] Add optional flip cards with Skip, then six ordered sections with per-section completion state and continue-later behavior.
- [ ] Show concise right/wrong explanations; require only valid English, relevant intent, and two weekly words for the free response.
- [ ] Provide read-aloud recording and brief AI feedback without turning it into a grammar score.
- [ ] Keep review generation, preview, and approval beside daily lessons in the monthly operator flow.

### Task 5: End-to-End Edge-Case Audit

- [ ] Verify short weeks, first-week carryover, Friday absence/makeup, exam replacement, Mon–Thu exam weeks, and holiday chains.
- [ ] Verify review completion unlocks the next Monday and incomplete review blocks it.
- [ ] Verify reviews do not change lesson/level-up progress and do not emit daily error alerts.
- [ ] Inspect generated A1–C1 sample reviews for resource leakage, language, audio, retry variants, and section counts.

---

## Assumptions to Confirm While Implementing

- The existing app has no authoritative holiday-date source. Until one is selected, do not silently invent holiday dates; calendar holiday scenarios remain unverified.
- Existing approved monthly frameworks remain immutable. New review logic applies to newly authored frameworks; replacing approved resources requires the existing Manager retirement flow.
