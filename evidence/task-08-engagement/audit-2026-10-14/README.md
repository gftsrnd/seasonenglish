# Engagement game audit — 2026-10-14

Scope: direct browser check of the learner demo at `http://127.0.0.1:4173`, plus the automated engagement suite. The review preserves the existing routes, game order, seasonal illustrations, badges and avatars established in the prototype.

| Route | What was checked | Evidence |
| --- | --- | --- |
| `/games` | Six game cards and their existing destinations are available. | `00-games-hub.jpg` |
| `/games/scramble` | Tutorial opens; letters are shuffled; a learner can assemble an answer. | `01-word-scramble-start.jpg`, `01-word-scramble-play.jpg` |
| `/games/crossword` | Crossword board, clues, editable cells and across/down navigation are available. | `02-crosswords-play.jpg` |
| `/games/eggs` | Prompt, falling vocabulary options, basket and seasonal character render together. | `03-season-catch-play.jpg` |
| `/games/mario` | Eight gates, platforms, boss, flag and movement controls render; right movement works. | `04-season-rio-play.jpg`, `04-season-rio-move.jpg` |
| `/games/sort` | Existing part-of-speech grouping interaction is available. | `05-word-sort-play.jpg` |
| `/games/typing` | Countdown, typed-character feedback and the virtual keyboard are available. | `06-typing-race-play.jpg` |

## Reliability closure

When saving a completed game fails, the learner now sees **“Thử gửi lại”** instead of being stranded in a locked completed round. Retry uses the same completed answers and the same request ID, so the server can preserve its existing idempotency rule and cannot create a second result for that round.

The two remaining learner actions in this scope now keep their entered selection if the request fails: an Arena challenge displays a retryable error, and the pilot survey displays a retryable error while retaining rating, comment and study-time selections.

Automated proof: `apps/web/test/engagement-screens.test.tsx` covers one failed game save followed by retry (the second submission receives the exact same answer payload object), one failed Arena challenge, and one failed survey submission.

## Follow-up requiring visual owner confirmation

Season-rio's hero can be difficult to distinguish from the left side of the scene at the initial position. This is a visual/readability observation only. No asset, layout, screen or visible flow was changed; Minh–Thư should decide whether it warrants a design adjustment.
