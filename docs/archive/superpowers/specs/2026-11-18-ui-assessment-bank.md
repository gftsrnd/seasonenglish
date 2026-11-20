# E4S 4300 UI and assessment banks — approved specification

User approved implementation on 4300 only. Never deploy code, migrate or copy data to 4175. Arena is deferred until rules are agreed.

## UI
1/8 Character image avatars in header/profile/dialog, persisted and circular across devices; retain legacy initials/accessories. Use Thu assets if available; report absence instead of fabricating provided assets.
2 Long text wraps across system, especially all assessment runtime/editor/review screens. Tables scroll locally.
3 Dialogue TTS distinguishes speakers, preserves turn order, supports automatic/manual audio and invalidates old synthesis cache when engine changes.
4 All dialogs have sensible padding/width, at least 16px mobile viewport margin, accessible focus/close, scroll with keyboard.
5 Crossword numbers and input letters must not overlap at 375/440px.
6 Pending review cards clear information/actions, no spurious outline, preserve keyboard focus and manager read-only.
7 Certificate preview clearly marked, actual badges, no fabricated issuance number/date, preserve real eligibility and real certificate.
9 Remove two developer change-exam request forms/endpoints/guides. Preserve historical requests and unrelated reopen workflows.
10 Complete operator feedback/request guide across four tabs, filters, statuses and actions.

## Assessment banks
Placement and Pass Course each initially 3 forms (1 existing legacy + 2 additional); retake 3; level-up 3 per target. Three is an initial inventory, never a hard maximum. Add more forms on demand; do not generate fabricated placeholder exams just to reach three. Legacy is replaceable/archiveable, not permanently privileged.
Monthly remains one per month/level, no mixing or shuffling.
All banks support AI/manual draft, edit, validation, publish, selection and archive. Operator chooses single or mixed delivery using a dialog, NOT a toggle. In mixed mode operator selects how many forms and exactly which published compatible forms. Confirmation saves configuration for NEW attempts only. Summary visible; single form is default. Drafts cannot be delivered.
Mix equivalent group slots only; whole passage/audio/questions remain together. Section duration, marks, task shapes, grading context and level compatible. Shuffle tasks/options only if safe; preserve numbered references, ordering dependencies and shared contexts. Retake avoids copies of original attempt. Fail closed on incompatible/insufficient sources.
Persist actual group sources and permutations once per attempt, reconstruct from immutable source versions. Refresh/resume/worker/review uses exactly the same assembled definition. No answer key leaks into learner view. Keep original version ids and grading data.
Published forms used by attempts/configuration cannot be destructively mutated/deleted. New revision for edits, archive for removal; active attempt and history remain accessible. Audio referenced by history retained. No 2-year expiry or automatic age deletion. Shared source definitions/audio stored once, per-attempt manifests + responses/scores/recordings. Backups cover DB and object storage.
Objective grading stays deterministic, productive AI and operator decision use actual delivered definition/rubric. Test automatic/manual scoring, retry/error and historical review.

## Verification
Focused meaningful unit/integration tests, full typecheck, relevant suite, production build, run on e4s-dev 4300 only; UI at 375/440/768/1440, sample runtime/editor/review and real media. Validate bank lifecycle including archived historical attempt, stable resume and scoring. Preserve 4175 container identity/data.
