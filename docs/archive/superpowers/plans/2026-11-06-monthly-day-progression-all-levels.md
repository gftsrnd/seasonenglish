# Monthly Day Progression Across All Levels — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Implementation starts after the user approves this plan. Do not create extra agents unless the user requests delegation.

**Goal:** Make monthly grammar, pronunciation and lesson numbering follow the daily learning sequence in the spec across A1, A2, B1, B2 and C1, including review and monthly-exam consumers.

**Architecture:** Resolve the organization calendar first, then persist one versioned daily teaching plan before resource approval. Calendar teaching-kind and organization holiday flags are separate: a declared holiday does not remove its lesson or change N. The planner assigns new-lesson ordinals, daily grammar objectives and pronunciation sets/stages; generators and editors consume those assignments rather than deriving their own sequence. Legacy approved plans retain their original snapshot until an explicit versioned replan is accepted.

**Tech Stack:** TypeScript, PostgreSQL, Fastify, React, existing AI task runner, Vitest, Playwright, Docker Desktop.

**Spec:** `C:/Users/TT5.01 AI UD/Downloads/e4s_spec_final_expectation.docx` (CH-R17, VH-R31–R43 and weekly-review/monthly-exam rules); `C:/Users/TT5.01 AI UD/Downloads/Lộ trình phát âm A1–C1 chia theo tháng & bài theo ngày.docx`; pronunciation text attachment `C:/Users/TT5.01 AI UD/.codex/attachments/6572d64b-7b39-45eb-9351-072a20f121d7/Pasted text.txt`; user clarifications in this chat override older documents.

## Global Constraints

- Scope clarification from the user: change calendar recognition/numbering and grammar/pronunciation progression only. Preserve working vocabulary/support/image generation, provider selection, retry infrastructure and unrelated product flows. Only change an existing consumer where it must read the corrected plan, with a focused regression proving that dependency.
- In particular, preserve the monthly exam's generation algorithm, prompts, question structure and edit/publish workflow. Verify its scope reader against the corrected plan; adapt that reader only if necessary to include the correctly taught grammar/pronunciation resources.
- Apply the shared design to A1–C1. A1/A2 explanations use Vietnamese; B1–C1 use simple English.
- Follow the system's existing selection of monthly topics and level-appropriate pronunciation targets; do not infer a learner's curriculum month from YYYY-MM.
- New lessons occur Monday–Thursday. Friday reviews and the monthly exam do not increment N. Preserve the existing attendance/holiday calendar policy and use its resulting teaching dates.
- Recognize basic Vietnamese public holidays automatically from deterministic rules and a sourced annual calendar: Gregorian New Year, Lunar New Year, Hung Kings, 30 April, 1 May, National Day and Vietnam Culture Day on 24 November (effective from 2026 under Resolution 28/2026/QH16). Use official yearly dates for variable holiday blocks and adjacent/compensatory dates; do not ask AI to guess holiday dates.
- Per the spec's holiday rule, a recognized or declared weekday holiday retains its original new/review assignment, contributes to the same monthly core count and receives automatic attendance. Weekend dates remain rest days. The exam is the final Monday–Friday date and cannot be declared a holiday. If an automatically recognized holiday conflicts with the fixed exam date, surface that conflict for the organization rather than silently moving the exam or suppressing the holiday.
- Holiday chains follow the specified unlock rules, including the Friday-review prerequisite. Adding/removing a holiday after approval changes the calendar annotation and attendance/access policy, not the frozen resource allocation or N ordinals.
- A covers N1–N6; B covers N7–N12; K1–K3 cover N13–N15; M1–M3 cover N16–N18 when those dates exist.
- Keep the monthly resource hierarchy of two grammar topics with three milestones each. Add six explicit daily objectives per topic under those milestones. Repeating a formula is permitted when a planned daily objective advances; do not require six unrelated formulas.
- P1 covers N1–N3; P2 N4–N6; P3 N7–N9; P4 N10–N12. Each target has three sets of three examples, assigned in order rather than always using the first set.
- Pronunciation stages: recognition/production, discrimination in words, use in sentences. K1 contrasts all four monthly targets; K2 reads aloud with exactly eight target positions (two per target); K3 is a workplace voice note. M1 targets observed errors, M2 shadowing, M3 speaking mock when present.
- A1/A2 targets follow the current 44-sound roadmap; advanced-level phenomena such as stress, linking and intonation must use the corresponding level-specific treatment instead of being reduced to a single IPA phoneme exercise.
- Reviews and exams use only the appropriate frozen taught scope. Grammar practice includes 3–5 questions with answers/explanations per daily lesson and the specified A recall from N8.
- Preserve core IDs, support relationships and approved illustration assets through replanning. Retain published lesson versions and learner results.
- All new educational content remains a draft until the existing review/publication action approves it.

## Review Focus

- A Friday at the beginning of a month must use its carry-over review scope without consuming N1.
- A short or long month must produce the right N sequence and optional M slots, with no skipped P target or duplicated N.
- A third pronunciation set must not be silently discarded by schema validation, quality gates, preview adapters or learner audio gates.
- B1/C1 pronunciation phenomena and grammar objectives must preserve their complexity and language through the shared pipeline.
- Replanning a framework with authored lessons, an exam or learner progress must not mix old and new hashes, overwrite historical content or drop illustration links.

## Current Evidence

- `curriculum.ts` assigns one of three grammar milestone IDs to each pair of new lessons, with no explicit daily teaching objective.
- `sound.examples.slice(0, 3)` is used for every new day. A1 has nine examples per sound, but days N1–N3 all reference examples 1–3.
- K1/K2/K3 have labels, but `pronunciationSoundIndex()` still selects one sound per day instead of combined scope.
- Resource-roadmap labels use `lessonNumber`, which includes reviews. Thus P2 is displayed as “Bài 4–7” although its new-learning scope is N4–N6.
- The monthly exam reads taught pronunciation through the single `day.soundId` field. Simply fixing the UI would leave generation and assessment scope inconsistent.

## Task 0: Establish the authoritative calendar before teaching allocation

**Files:**
- Create: `packages/domain/src/monthly/calendar.ts`
- Create: `packages/domain/src/monthly/vietnam-holidays.ts` and a source-attributed annual holiday data file where dates vary by official yearly schedule.
- Modify: `packages/domain/src/monthly/curriculum.ts`, `packages/domain/src/monthly/index.ts`
- Modify: `packages/contracts/src/monthly-contract.ts`, `packages/database/src/monthly-content-repository.ts`
- Modify: `apps/web/src/app/operator/Months.tsx`
- Verify the existing holiday/attendance/access consumers in `packages/database/src/repositories.ts`, `apps/api/src/modules/learning/routes.ts` and Manager holiday routes.
- Test: `packages/domain/test/monthly-calendar.test.ts` and relevant existing holiday/access tests.

**Interfaces:**
- Calendar entries contain `date`, weekday, teaching kind (`new`, `review`, `exam`, `weekend`) and a separate holiday annotation. “Holiday” must not replace a teaching kind in a mutually exclusive enum.
- Calendar input is the selected YYYY-MM, the built-in Vietnamese holiday calendar and the organization's declared/adjusted closure dates. Project date rules use the existing organization system date/timezone, not the browser/host timezone.
- Automatic holiday recognition works locally without a paid service, runtime AI call or compulsory external calendar API. Records carry name, actual date, source and effective year. Manager additions and organization-specific compensatory/exchange dates are merged with the base calendar.
- Official public-sector extended breaks/exchange days are not automatically applied to a company as universal public holidays; use the organization's applicable yearly schedule for those extra dates.
- N increments on new-learning slots only. A weekday holiday keeps its assigned N or review slot. A date is an exam before applying the ordinary Monday–Thursday/Friday teaching rule.
- Public overview returns this resolved calendar so the Operator and learner do not calculate different kinds from weekdays independently.

- [ ] Write failing tests for all month start weekdays, weekend rest, Friday review, last-weekday exam and exam falling on a Friday or Monday–Thursday.
- [ ] Add holiday cases on a new-learning weekday, Friday, a multi-day chain and a chain spanning a weekend. Assert no change to core count/N/grammar/pronunciation assignments.
- [ ] Test 24/11/2026 as Vietnam Culture Day, with no such automatic designation before its effective year; test lunar-to-Gregorian dates, year boundaries and overlap between automatic and Manager-entered holidays without duplicates.
- [ ] Test automatic holiday attendance and the specified before/after-chain unlock behavior, with an unfinished Friday review still gating the next lesson.
- [ ] Reject holidays on the exam date through the existing Manager API, and verify calendar annotations update after a holiday edit without invalidating the teaching scope hash.
- [ ] Implement the shared calendar projection and remove duplicated holiday/day-kind inference in affected UI consumers.
- [ ] Run calendar/holiday/access tests before proceeding to teaching allocation.

## Task 1: Define and prove the daily-plan contract

**Files:**
- Create: `packages/domain/src/monthly/daily-progression.ts`
- Modify: `packages/domain/src/monthly/curriculum.ts`, `packages/domain/src/monthly/index.ts`
- Modify: `packages/contracts/src/monthly-contract.ts`
- Test: `packages/domain/test/monthly-daily-progression.test.ts`

**Interfaces:**
- Add `planSchemaVersion: 2` for newly allocated plans and an explicit legacy reader for existing plans.
- Keep persisted `lessonNumber` as the internal calendar identity. Add `newLessonNumber` only for new lessons and a review-week label for review slots.
- Add `DailyGrammarPlan`: daily code A1–A6/B1–B6/K1–K3/M1–M3, referenced milestone IDs, daily objective, teaching/practice mode and recall scope.
- Add `DailyPronunciationPlan`: slot, stage, target IDs, assigned example sets, production task and listening requirements. Multiple targets are first-class for K/M/review days.
- Add `formatMonthlyDayLabel(day)` for all public labels; no consumer derives N from array index or a raw calendar number.

- [ ] Write failing table-driven tests for all five levels and months with 15–18 new lessons.
- [ ] Assert 02/11/2026=N1, 05/11=N4, 06/11=review, 09/11=N5, 23/11=N13/K1, 26/11=N16/M1 and 30/11=exam.
- [ ] Implement the types, labels and explicit daily sequence; avoid encoding educational progression as only `Math.floor(ordinal / 2)`.
- [ ] Run `pnpm --filter @e4s/domain test test/monthly-daily-progression.test.ts` and domain typecheck.

## Task 2: Produce daily grammar objectives before approval

**Files:**
- Modify: `packages/ai/src/schemas.ts`, `packages/ai/src/registry.ts`
- Modify: `apps/api/src/modules/content/monthly-resource-generation.ts`, `monthly-routes.ts`
- Modify: `packages/domain/src/monthly/curriculum.ts`
- Modify: `apps/web/src/app/operator/MonthlyResourceEditor.tsx`
- Tests: resource-generation tests and AI monthly-schema tests.

**Interfaces:**
- Each of the three milestones has two explicit daily teaching objectives, giving A1–A6 or B1–B6 while preserving the two-topic/three-milestone resource hierarchy.
- The resource stage saves these objectives as part of the draft pool. Phase 2 assigns them deterministically; phase 3 cannot invent a different topic or progression.
- Existing pools lacking daily objectives require a draft enrichment step with a visible reviewable result before v2 approval.

- [ ] Write tests for repeated formulas with distinct objectives, missing objectives, incorrect level/language and duplicate teaching objectives.
- [ ] Update grammar generation/repair prompts and structured schemas to produce the six coherent daily objectives per topic.
- [ ] Validate meaningful progression and references to the parent milestones; retain repeated formulas where pedagogically intended.
- [ ] Expose the daily objectives for operator review/editing before approval.
- [ ] Run focused resource/schema tests and API/web typechecks.

## Task 3: Correct pronunciation assignment and combined stages

**Files:**
- Modify: `packages/domain/src/monthly/daily-progression.ts`, `curriculum.ts`
- Modify: `packages/database/src/monthly-content-repository.ts`
- Test: `packages/domain/test/monthly-curriculum.test.ts`, `monthly-daily-progression.test.ts`

**Interfaces:**
- N1/N2/N3 consume P1 set 1/2/3; the same rule repeats for P2–P4.
- Persist the assigned example IDs and per-day stage/task in `DailyPronunciationPlan`.
- K stages reference all four monthly targets, with K2's eight positions explicitly identified. M stages store their prescribed task; M1 uses learner errors when available, otherwise a clearly identified diagnostic over taught targets.
- Weekly review scope is the union of the actual preceding teaching assignments, not the review calendar day's ordinary `soundId`.

- [ ] Add failing tests for three distinct sets, all nine examples taught, K1/K2/K3 scope, M1/M2/M3 and a Friday spanning two P targets.
- [ ] Replace first-three selection and cyclic single-sound assignment with the new allocator.
- [ ] Update curriculum validation to check stages, sets and complete combined scope.
- [ ] Verify new allocations match the spec while existing v1 snapshots remain readable.

## Task 4: Make AI generation, manual seeds and quality gates consume the daily plan

**Files:**
- Modify: `apps/api/src/modules/content/monthly-day-generation.ts`, `monthly-quality.ts`, `monthly-review-quality.ts`
- Modify: `packages/ai/src/schemas.ts`
- Modify: `apps/web/src/app/operator/monthly-manual-seed.ts`
- Tests: monthly day-generation/quality tests, manual-seed tests and monthly lesson schema tests.

**Interfaces:**
- AI input includes the complete daily grammar and pronunciation plans, the day's three core words, prior-new-day teaching examples and exact repair findings.
- Ordinary lessons, K/M lessons and reviews have explicit applicable output shapes; a combined pronunciation task must not be forced into a single-target/three-word shape.
- Manual authoring seeds use the same selected sets, daily objectives and review scope as AI generation.

- [ ] Test that consecutive new lessons can share a formula but have distinct locked objectives and contextual teaching examples.
- [ ] Generate explanations and examples for the day's core words and objective; stop requiring literal reuse of the monthly reference examples.
- [ ] Check grammar exercise count/answers/explanations and the N8+ recall requirement.
- [ ] Check assigned pronunciation words/IPA, per-day stage and combined task scope. Detect verbatim copying across new lessons while permitting intentional review/retrieval repetition.
- [ ] Include exact quality findings in repairs; preserve valid parts and never satisfy a gate by silently fabricating educational content in code.
- [ ] Run focused API/AI/manual-seed tests and typechecks.

## Task 5: Use one numbering and progression view throughout the product

**Files:**
- Modify: `packages/contracts/src/monthly-contract.ts`, `packages/database/src/monthly-content-repository.ts`
- Modify: `apps/web/src/app/operator/Months.tsx`, `MonthlyResourceEditor.tsx`, `OperatorRouteController.tsx`
- Modify: `apps/web/src/app/learner/Learning.tsx`, `WeeklyReview.tsx`, `LearnerRouteController.tsx`
- Modify: `apps/api/src/modules/learning/routes.ts`, `weekly-review-routes.ts`
- Tests: operator month/manual-seed tests, learner learning/review tests, browser scenarios.

**Interfaces:**
- Public new-day labels show N plus the planned grammar and pronunciation codes; reviews show their week and the exam keeps its own label.
- Resource “Áp dụng” lists/ranges use N ordinals and list reviews separately when relevant.
- Learner pronunciation content shows the assigned daily stage. Speaking unlock depends on the actual required audio set for that task, including combined/review cases.

- [ ] Test labels after each Friday, partial first weeks, optional M days and the exam date.
- [ ] Replace raw calendar-number labels in calendar, previews, headings, confirmations and learner schedule.
- [ ] Check pronunciation audio gating against every required assigned target/example, without hard-coding one target plus three words for combined tasks.
- [ ] Verify desktop/mobile layout with real data and controlled new/review/K/M fixtures.

## Task 6: Verify monthly-assessment compatibility and keep existing data consistent

**Files:**
- Modify: `apps/api/src/modules/assessment/monthly-final-builder.ts`, `monthly-final-checks.ts`, `monthly-final-routes.ts`
- Modify: `packages/database/src/monthly-content-repository.ts`
- Create: `scripts/replan-monthly-progression.ts` (read-only report by default; explicit application mode)
- Tests: monthly-final builder/check tests and monthly-content integration tests.

**Interfaces:**
- `taughtGrammarSteps` and `taughtPronunciationExamples` read the v2 teaching assignments. Exam positions must use examples actually taught and include all required monthly targets.
- A replan report identifies the old snapshot, proposed plan, affected lesson drafts/exam and existing learner use. It preserves frozen illustration assets by stable core IDs.
- Apply through versioned plan/review workflows. Do not rewrite published historical versions, learner answers or a plan hash in place. Block mixing v1 content with a v2 scope hash.
- No automatic exam regeneration and no changes to working exam-generation mechanics. Limit any required assessment edit to reading the corrected taught scope; otherwise leave assessment implementation untouched.

- [ ] Test an existing approved plan with authored drafts, an exam and learner progress before implementing the replan path.
- [ ] Produce a dry-run report for local November A1; verify asset and resource counts remain intact.
- [ ] Create/review a new plan revision and refresh affected drafts under its new hash. Retain an explicit mapping to the previous revision and identify any publication blockers.
- [ ] Test that monthly exam generation remains available after plan approval and stays a draft until separately published.
- [ ] Run focused assessment/domain/database integration tests.

## Task 7: Verify the complete flow and deploy the approved implementation locally

- [ ] Run focused tests for numbering, grammar daily progression, pronunciation sets/stages, review scope, assessment scope and legacy migration across all five levels.
- [ ] Use deterministic/provider fixtures for the full A1–C1 matrix; run representative real-provider generation for basic and advanced levels in isolated draft scenarios. Inspect full outputs, not merely HTTP success.
- [ ] Validate the local A1 replan and its affected daily/review draft content, then inspect one K2/K3 scenario and an advanced-level pronunciation scenario.
- [ ] Run API/web/database/domain typechecks and inspect `git diff --check`.
- [ ] Build and recreate only affected services using `docker --context desktop-linux compose`.
- [ ] Inspect the running browser: N numbering, daily grammar goals, distinct pronunciation sets, review/combined scope, frozen illustrations and audio unlocks. Confirm API readiness.
- [ ] Report changed files, test evidence and remaining limits. Report unrelated pre-existing failures separately; do not claim the full suite is green if only focused checks pass.

## Approval Boundary

This document is the proposed plan. Only the plan file is added in this turn; implementation and replanning begin after the user approves. Previously completed fixes in the working tree belong to earlier requests and are preserved.

## Official Holiday Sources Checked on 2026-11-06

- Government News, 24 April 2026: National Assembly resolution designates 24 November as Vietnam Culture Day with paid leave, effective 1 July 2026: https://baochinhphu.vn/ngay-van-hoa-viet-nam-24-11-nguoi-lao-dong-duoc-nghi-lam-huong-nguyen-luong-102260424093821937.htm
- Government News, 5 August 2026: distinguishes the 24 November statutory date from proposed public-sector exchange/extended-break arrangements and employer-specific adoption: https://baochinhphu.vn/ngay-van-hoa-viet-nam-2026-bo-noi-vu-de-xuat-nghi-4-ngay-lien-tuc-102260805114627885.htm
