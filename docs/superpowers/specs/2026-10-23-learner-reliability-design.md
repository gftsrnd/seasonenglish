# Learner reliability and assignment design

## Intent

Repair the learner flows that currently look available but fail because fixture or published data is missing. Mini game must remain usable without a pre-existing weekly word set, weekly practice must be assignable to real learners by both Manager and Operator, assessment exits must use the existing integrity-warning mechanism, and listening audio must be clear and dry.

## Goals

- Mini game opens only after the learner's current CEFR has a published weekly lesson set. Once open, the learner can create a custom word set from any safe natural topic without first selecting weekly vocabulary.
- A published weekly lesson set is the access gate, not a pre-created game word set. “Dùng từ vựng tuần này” is available when weekly vocabulary can be derived; custom topic generation remains available independently.
- Normal weekly practice still opens automatically only after exactly five published lessons are completed.
- Manager and Operator can use **Giao bài ngay** for an approved learner. The assignment creates a real draft for the current week; the learner can submit it normally and it appears in operational review.
- The weekly-practice microphone is visibly idle/listening/error, compact, and explicitly described as speech-to-text rather than audio recording.
- Logging out while an assessment is in progress records an integrity violation before logout. Leaving/hiding the page continues to use the same server-side violation counter; exceeding the configured limit auto-submits.
- Listening assets use a clear mono voice without spatial/dynamic-normalisation artefacts and are louder than the current files.
- Local scenario preparation publishes deterministic A2 and B1 lesson sets, creates reusable weekly vocabulary, clears drift, and verifies all documented accounts against their intended state.
- Season feedback labels in the served production bundle remain the compact format already implemented; verification checks the actual built bundle to catch stale-build mistakes.
- Operator review queues are grouped for scanning rather than rendered as raw event logs.

## Non-goals

- Weekly-practice speech-to-text will not upload or retain microphone audio.
- No notification/email scheduler is added in this change.
- Placement answers and scenario account intent are not redesigned.

## Selected approach

Use the existing `practice_submissions.status = 'draft'` state as the real assignment record. Add Manager and Operator assignment endpoints/actions, and update learner submission so an assigned draft transitions atomically to `submitted`. This avoids a parallel assignment model and keeps history, grading, and review attached to one record.

Make Mini game's active word set optional at the API/contract/UI boundary. Loading the hub requires a published weekly lesson set but no longer requires a pre-created game set. Custom topic generation resolves the learner's active published week and CEFR directly, while weekly-set selection derives vocabulary from published lessons or reports a specific unavailable state.

For assessment exit protection, keep the existing server-side violation counter as the source of truth. The app shell consults the active assessment guard before logout; the guard records `logout` as a violation, shows the consequence, then proceeds or auto-submits according to the server response. Browser visibility/window events continue to use the same endpoint.

## Alternatives considered

- **Manual-only weekly practice assignment:** rejected because it removes the existing useful 5/5 automatic flow and increases operational work.
- **Separate practice-assignment table:** rejected because the existing draft submission state already represents an assigned-but-not-submitted task.
- **Seed a word set and leave Mini game dependent on it:** rejected because the correct gate is published weekly lessons; after that, real learners must be able to create a natural topic without a pre-created game set.
- **Store weekly-practice microphone audio:** deferred because it requires upload, retention, consent, playback, and review rules; the current product only needs dictation.

## UX behavior

- Locked Mini game: learners without a published weekly lesson set see why it is unavailable. Empty-but-open Mini game: topic input and **Tạo bộ từ** remain enabled when AI is available; games stay disabled until a word set exists. The weekly vocabulary action explains when weekly words are unavailable.
- Practice mic idle: compact button `Nói để nhập`. Active: high-contrast button `Đang nghe — bấm để dừng`, `aria-pressed=true`, visible live status, and submission disabled.
- Staff assignment: Manager and Operator see **Giao bài ngay** only for approved learners without an active current-week submission. The action asks for confirmation and returns an explicit success/already-assigned/not-eligible result.
- Assignment placement uses only navigation labels and rows that already exist. Manager opens **Tiến độ** and sees **Giao bài tuần** beside **Hồ sơ** in each eligible learner row. Operator opens **Duyệt mức**, then the existing **Đã duyệt** section, and sees **Giao bài tuần** beside **Hồ sơ**. No new screen, hidden submenu, or profile-modal step is introduced. The button is hidden or replaced by a status badge when the learner is not approved, already assigned, or has submitted the current week's practice.
- Weekly-practice preview: Operator opens **Bài học**, selects week and CEFR, and sees a **Bài thực hành cuối tuần** block after the five lessons. It shows the exact task, guidance, input mode, and required vocabulary; Operator can edit and publish this content with the weekly lesson set. Manager has read-only access to the published snapshot through the assignment confirmation.
- Assignment confirmation: both staff roles see the exact published task and learner level before confirming **Giao bài tuần**. Manager can only assign/cancel; Operator can follow a link back to **Bài học** to edit the source before assigning.
- Assessment logout: confirmation states that logout counts as a warning and shows the current count/limit. The server response determines whether the attempt remains resumable or is auto-submitted.
- Appeals: group by learner. A learner card shows the number of open/history items and the latest reason; expansion reveals the history. Resolution actions sit in a separate footer with wrapping and spacing, never inline against the reason text.
- Coach feedback review: group by learner and collapse by default. The summary shows learner, CEFR, turn count, unread count, and the latest turn; expansion reveals individual turns and their reviewed controls.
- Attempt counts: group first by learner and then by lesson. The collapsed learner summary shows total attempts and lessons touched; expansion shows per-lesson skill counts instead of one raw row per learner/lesson event.

## Data and verification

- Scenario seed is idempotent and fails loudly unless A2 and B1 each have exactly five published lessons with published lesson versions.
- It creates one deterministic shared weekly vocabulary set with enough words and distractors for all games.
- Integration tests assert every documented scenario's profile, enrollment, assessment checkpoint, published learning data, game availability, and practice state; seeding twice must not change counts.
- Component/API tests cover the published-week Mini game gate, empty open hub, natural-topic bootstrap, weekly-practice preview/edit/publish, draft assignment by both roles, draft-to-submitted transition, practice mic states, assessment logout violation, and listening-asset quality.
- Operator UI tests cover learner grouping, collapsed summaries, expanded details, and separated appeal actions across desktop and narrow widths.
