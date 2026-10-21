# Operator review flow: data, AI status, and assessment detail

## Goal

Make the Operator assessment-review surface trustworthy and readable after a learner submits a placement test. The Operator must see the learner in exactly one lifecycle bucket, see all four assessment sections, understand what has and has not been scored, and know whether AI is actually available to the running API.

## Confirmed problems

- The API capability flag is derived from the process-level `GROQ_API_KEY` only. Provider credentials saved by Manager Settings are encrypted in `provider_configurations` but are not used to create the runtime AI service.
- The overview query excludes only approved placement attempts from `unassessedLearners`, so pending-review and other existing attempts can be listed as “Chưa làm test”.
- Assessment detail renders only rows present in `assessment_scores`; deterministic Listening/Reading rows can hide the existence of Writing/Speaking when productive scoring has not run.
- Integrity events are displayed as raw JSON. There is no readable attempt activity timeline.
- The current Operator page presents unrelated workflow areas with similar visual weight and weak section boundaries.

## Scope

### Approved extension: prototype-faithful manual review

The assessment detail modal is a working Operator grading surface, not a raw
data dump. Its compact summary table uses the columns **Kỹ năng**, **Điểm**,
**CEFR**, and **Thời gian**. It ends with a **Tổng** row containing the total
score out of 100, the overall CEFR result, and total learner time used out of
the assessment's 70-minute limit.

The time shown is the learner's actual time used per section, not only the
configured limit. The backend must persist each section's `startedAt` and
`completedAt` (including timeout/forced-submit completion) and return a
formatted duration plus the configured limit. Existing attempts without
section timing show `—` for actual time and retain the configured limit; they
must not receive fabricated elapsed values.

The four sections use the assessment blueprint's configured limits: Listening
15 minutes, Reading 20 minutes, Writing 20 minutes, and Speaking 15 minutes.
The total row sums actual section durations that exist and shows `—` when the
attempt lacks a complete timing record, rather than silently treating missing
data as zero.

Listening and Reading remain evidence/automatic-score views:

- Listening is grouped into Part A (5 points), Part B (5 points), and Part C
  (10 points), with the group score and CEFR band where the blueprint supplies
  one.
- Reading is grouped into Questions 1–10, 11–20, 21–30, and 31–40, with each
  group showing its score and note exactly as the prototype does.

Writing and Speaking expose manual rubric controls only after the learner's
answers/evidence are visible:

- Writing shows Task 1 and Task 2, followed by five inputs from 0–5:
  Task achievement, Organization & coherence, Vocabulary, Grammar, and
  Workplace communication. The five-criterion total (maximum 25) is converted
  to the Writing score out of 20 with `total / 25 * 20`.
- Speaking shows all four speaking tasks and four inputs from 0–5: Fluency &
  interaction, Grammar, Vocabulary, and Professional communication. There is
  no pronunciation input because pronunciation cannot be assessed from the
  typed transcript. The four-criterion total (maximum 20) is the Speaking
  score out of 20.
- Both sections include one shared comment field. Saving writes
  `source = human`, the rubric criteria, normalized section score, and the
  Operator comment. Listening/Reading scores are not overwritten by this
  manual form.

The primary action is **Lưu điểm chấm tay**. It is disabled until all required
rubric values are valid integers from 0 to 5. Clicking it opens a confirmation
step that summarizes the Writing and Speaking scores and comment; only the
confirmed action sends the save request. A successful save refreshes the
detail, recalculates the total and CEFR, writes an Operator activity event,
and shows the existing bottom toast. A failed save leaves all entered values
in place and shows an error toast.

The detail modal keeps the existing compact behavior: Listening, Reading,
Writing, Speaking evidence blocks, processing history, and integrity history
are collapsed by default and can be opened independently. Technical audit
JSON remains server-side evidence and is rendered as human-readable labels.

### Manual scoring contract

Add a reviewer-guarded endpoint:

`POST /api/v1/assessment-reviews/:attemptId/manual-score`

The request contains the Writing rubric, Speaking rubric, and shared comment;
the server validates the attempt is reviewable, validates organization scope,
validates every rubric value is an integer from 0 to 5, computes the two
section scores server-side, and upserts the two `assessment_scores` rows with
`source = 'human'`. The response returns the refreshed
`ContentReviewAssessmentDetailView` so the client does not calculate or trust
the persisted total itself.

The detail contract adds section metadata needed by the UI: configured
maximum score, configured duration, actual duration (nullable), CEFR/band
label where available, grouped task/score evidence, and manual-review state.
No API key or raw audit payload is included in this response.

### Backend and contracts

1. Resolve AI availability from the actual provider configuration for the organization, with a safe environment-variable fallback for local development. Do not expose credentials or secret material to the browser. Report provider configuration state and last connection-test state separately from “AI runner available”.
2. Correct assessment lifecycle classification:
   - `pending_review` → Chờ duyệt.
   - `approved` → Đã duyệt.
   - `in_progress` or `submitted` → Đang làm/chưa nộp.
   - no placement attempt → Chưa bắt đầu.
   - `needs_retry` → Cần làm lại (kept separate from Chưa bắt đầu).
3. Extend the review detail response with a stable four-section summary for Listening, Reading, Writing, and Speaking. A missing score is represented as unscored, not as zero.
4. Add a readable activity timeline derived from persisted attempt/audit data, while retaining integrity events for evidence. Every event must include a timestamp, a human-readable label, and optional detail; raw JSON is not the primary presentation.

### Operator UI

1. Replace the generic “missing API key” warning with an AI status panel that distinguishes configured, unavailable, and connection-test failure states, and links to Settings only when action is needed.
2. Organize the dashboard into visually distinct sections: Chờ duyệt, Đã duyệt, Đang làm/chưa nộp, Cần làm lại, and Chưa bắt đầu. A learner must not appear in more than one section.
3. Show four section score rows on each pending card and in the detail modal. Use “Chưa chấm” for missing productive scores.
4. Redesign the detail modal into connected blocks: summary, four sections and answers/evidence, scoring status, activity timeline, integrity log, and decision. Preserve audio playback and decision evidence.
5. Use the existing bottom toast pattern for successful/error operator mutations, followed by refreshing the relevant section. Keep persistent instructional content inline.

## Data flow and safety

- Provider secrets remain server-side and encrypted at rest. The browser receives booleans/status labels only.
- Organization scoping remains enforced by the existing reviewer guards and repository joins.
- A provider configuration saved in Settings must be usable without restarting the API. Environment configuration remains a fallback when no organization provider is configured.
- AI failure must not block manual review or hide the submitted attempt. Missing AI output is shown as “Chưa chấm”.
- Existing decision semantics remain unchanged: approving a placement writes the approved level and removes the attempt from Chờ duyệt; rejection maps to Cần làm lại.

## Verification

- Repository/API tests cover lifecycle bucket exclusivity, four-section detail output, activity timeline output, organization scoping, and AI capability states.
- Operator component tests cover status messaging, section rendering, missing-score labels, and toast/refresh behavior.
- Typecheck and focused web/API tests must pass. Full-suite failures unrelated to this change must be reported separately.
