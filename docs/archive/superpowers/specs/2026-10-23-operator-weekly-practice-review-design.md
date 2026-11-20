# Operator weekly-practice review design

## Intent

Keep lesson authoring, weekly-practice authoring, and learner activity review understandable. The lesson matrix must not advertise or squeeze weekly-practice information into each cell. Operators manage weekly-practice copy in a dedicated `Bài cuối tuần` tab under `Đọc mẫu`, while learner attempts are summarized by learner instead of repeated as a flat log.

## Goals

- In `Bài học`, remove `Có bài cuối tuần`; use the compact action label `Xem` for existing lesson sets.
- Add a dedicated `Bài cuối tuần` tab to `Đọc mẫu`, listing each existing week/CEFR lesson set and its current task, guidance, and required vocabulary.
- Allow Operator to edit those weekly-practice fields manually. Saving creates a new draft lesson-set version and preserves all T2–T6 lessons; published content changes only after the normal review/publication flow.
- Group `Số lần làm bài` by learner. A collapsed learner summary shows lesson count and total attempts; expanding it shows the existing lesson-level table.

## Non-goals

- Do not move T2–T6 lesson editing out of `Bài học`.
- Do not edit an already-published version in place.
- Do not add a new standalone navigation page.

## Approach

Selected approach: a dedicated `Bài cuối tuần` tab in `Đọc mẫu`. The alternative—placing the editor above `Bài nộp`—was rejected because it mixes authoring with submitted learner work.

The content review response supplies weekly-practice summaries. A version-checked endpoint saves a manual weekly-practice draft. The repository's copy-on-write mutation preserves the current lesson rows and payload, preventing lesson edits or weekly-practice edits from erasing sibling content.

## Constraints

- Operator can edit; Manager remains read-only through the existing role rules.
- Required vocabulary is entered as a comma/newline-separated list and persisted as trimmed, unique values.
- Existing optimistic version conflicts return HTTP 409.
- The dirty shared worktree is preserved; no unrelated files are reset or committed.
