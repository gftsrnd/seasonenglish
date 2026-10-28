# Audio and IPA Frontend Implementation Plan

> **For agentic workers:** Use the inline execution workflow and test-driven development task-by-task.

**Goal:** Preserve learner recordings and transcripts across placement, lessons, weekly practice, and Season flows; expose resilient operator playback and cleanup UX; and make pronunciation target audio phoneme-only.

**Architecture:** Add a small web-owned audio evidence adapter that accepts the current artifact-key/read-URL pattern and optional future signed-upload/playback metadata. Reuse it in learner recording controls and operator review, keeping transcript, score, and feedback independent from audio availability or deletion. Keep phoneme playback asset-only: `phonemeAudioUrl` is the only source for the target sound, with no IPA speech fallback.

**Tech Stack:** React 19, TypeScript, Vitest, Testing Library, existing `uploadAssessmentAudio`/read-URL callbacks, `MediaRecorder`, and existing exclusive-audio coordination.

**Spec:** Role 2 frontend brief in the task request; checklist IDs C-022, L-030, L-031, L-032, L-041, L-043, L-047, L-051, L-060, A-012, A-023, A-032, A-046, O-004, I-093, I-104, plus shared O-018 pronunciation contract.

## Global Constraints

- Work only in the supplied `deploy-web-fallback-worktree` fork at base `f6b069f`.
- Frontend and web tests only; do not change database migrations, storage implementation, or AI generation prompts/validators.
- Preserve `pronunciation.content.phonemeAudioUrl` and `wordAudioUrls`; the former is target-phoneme-only audio.
- Never use browser speech synthesis to read IPA text or as an inaccurate phoneme fallback.
- Audio deletion is explicit and recoverability is represented in UI; never auto-delete.

## Review Focus

- A MediaRecorder or permission failure must leave the typed/transcribed draft intact and offer upload fallback.
- A signed URL that is missing, expired, or deleted must leave transcript and result text visible.
- A phoneme asset failure must produce a no-audio state without invoking speech synthesis.
- A recording uploaded before submit must remain available for replay and future signed playback metadata.
- Cleanup metadata at and beyond 60 days must prompt for confirmation, not silently remove audio.

### Task 1: Shared audio evidence adapter and cleanup display

**Files:**
- Create: `apps/web/src/app/shared/media/audio-evidence.ts`
- Create: `apps/web/src/app/shared/media/AudioEvidencePanel.tsx`
- Test: `apps/web/src/app/shared/media/audio-evidence.test.ts`
- Test: `apps/web/src/app/shared/media/AudioEvidencePanel.test.tsx`

Define tolerant `AudioEvidence` fields for artifact key, signed URL, expiry/created timestamps, transcript, and deletion metadata. Normalize current and future backend shapes without dropping unknown optional metadata. The panel renders transcript/result text independently, an audio player when playable, unavailable/deleted copy when not, a 60-day cleanup reminder, and a confirmation-gated delete callback.

### Task 2: Learner recording retention for weekly practice and Season

**Files:**
- Modify: `apps/web/src/app/learner/contracts.ts`
- Modify: `apps/web/src/api/learner.ts`
- Modify: `apps/web/src/app/learner/LearnerRouteController.tsx`
- Modify: `apps/web/src/app/learner/CoachPractice.tsx`
- Create: `apps/web/src/app/learner/AudioCaptureControl.tsx`
- Test: `apps/web/src/app/learner/CoachPractice.test.tsx`

Add optional audio evidence to the web callbacks and API request adapters while retaining compatibility with the existing text-only callbacks. Replace transcript-only speech recognition submission with a capture/upload path that preserves both draft transcript and original recording metadata. Keep typed text on failures, use the existing assessment-audio upload/read pattern until Agent 1 supplies a general signed-upload endpoint, and expose replay/unavailable states.

### Task 3: Lesson speaking and IPA pronunciation states

**Files:**
- Modify: `apps/web/src/app/learner/Learning.tsx`
- Modify: `apps/web/src/app/operator/adapters.tsx`
- Test: `apps/web/src/app/learner/Learning.test.tsx`
- Test: `apps/web/src/app/operator/Review.audio.test.tsx`

Route lesson speaking transcript/audio through the shared adapter when future fields are present. Make learner and operator phoneme controls render a graceful no-audio state, play only `phonemeAudioUrl`, and keep word/collocation audio separate. Add regression coverage proving IPA text never reaches `speak`/`speechSynthesis`.

### Task 4: Operator review playback and deletion metadata

**Files:**
- Modify: `apps/web/src/app/operator/Review.tsx`
- Modify: `apps/web/src/app/operator/types.ts`
- Test: `apps/web/src/app/operator/Review.audio.test.tsx`

Use the shared panel for each supported audio answer, preserving transcript and scoring copy when playback fails or the artifact has been deleted. Support optional operator deletion callbacks and display supplied deletion metadata without auto-deleting.

## Verification

- Run focused source tests with `pnpm exec vitest run` for the changed files, excluding stale `apps/web/dist` output.
- Run `pnpm --filter @e4s/web typecheck` and `pnpm --filter @e4s/web build`.
- Run the repository web test command and report the pre-existing stale-dist placement failures if they remain.
