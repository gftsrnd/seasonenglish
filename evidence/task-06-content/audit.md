# Task 6 — Content operations and publishing evidence

Date: 2026-10-13

## Outcome

- Operator screens keep Thu's existing visible structure: week topics, lesson matrix, in-place lesson-set review/editor, six review tabs, and seven prompt/rubric blocks.
- Thu's avatars, badges, seasonal treatment, icons, warm colours, illustrations, and other lively visual details remain protected. This task did not remove, simplify, or restyle them.
- A missing lesson set can be authored from the existing `Soạn tay` link without creating another route. The form persists a PostgreSQL draft and reopens in the same lesson-set screen.
- Lesson publication enforces maker/checker separation. Published lesson content is immutable and learner APIs only expose approved content.
- Manager access is read-only at both UI and API boundaries.

## Verified visible routes

| Existing screen | Local route | Evidence |
|---|---|---|
| Prompt & rubric | `/op/prompts` | `00-prototype-prompts.jpg`, `14-local-prompts.jpg` |
| Khung chủ đề tuần | `/op/weeks` | `01-prototype-weeks.jpg`, `10-local-weeks.jpg` |
| Ma trận bài học | `/op/lessons` | `02-prototype-lessons.jpg`, `11-local-lessons.jpg` |
| Chi tiết bộ bài | `/op/lessons/:week/:cefr` | `03-prototype-lesson-set.jpg`, `12-local-lesson-set.jpg` |
| Đọc mẫu & kiểm tra AI | `/op/review` | `04-prototype-review.jpg`, `13-local-review.jpg` |
| Modal sửa bài trong chi tiết bộ bài | same route, no new screen | `06-prototype-lesson-edit.jpg`, `15-local-lesson-editor.jpg` |

`05-prototype-settings.jpg` confirms that Settings is a separate existing screen; it is deliberately not merged into Prompt & rubric.

## Manual browser proof

1. Opened `/op/lessons/2/A2?edit=1` as the demo operator.
2. Confirmed the existing lesson-set page opened the T2 editor as an in-place dialog.
3. Entered objective, grammar, three vocabulary items, pronunciation, listening, reading, writing, and speaking content.
4. Selected `Kiểm tra & lưu`.
5. Confirmed the same route returned with `1 bài`, draft status, and the saved title `Email: I need to reschedule` (`16-local-manual-draft-saved.jpg`).
6. Confirmed `Gửi duyệt` stayed disabled because the set was not yet complete (requires exactly T2–T6).

## API and policy proof

- `PUT /api/v1/content/lesson-sets/:week/:cefr/draft` creates a new editable draft version.
- `POST /api/v1/content/lesson-set-versions/:id/review` requires a complete five-day set.
- `POST /api/v1/content/lesson-set-versions/:id/publication` rejects self-approval and requires a different operator as checker.
- `POST /api/v1/content/lesson-set-versions/:id/retirement` retires a published version without mutating its content.
- `GET /api/v1/content/lesson-matrix`, `/review`, and `/prompts` drive the existing operator screens.
- Database triggers reject update/delete attempts against active prompt/rubric versions and reject content changes to published lesson-set versions.

## Verification

- `pnpm test` → 19 test files, 95/95 tests passed.
- `pnpm typecheck` → passed.
- `pnpm build` → passed.

AI generation actions remain disabled until Task 7 supplies the server-only Groq gateway and schema validation. This preserves the visible controls without pretending the capability is ready.
