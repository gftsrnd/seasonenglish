# legacy/

This folder holds code removed from the running app but kept for reference. It is **not compiled, tested or deployed**: every file has a `.txt` suffix so TypeScript and Vitest ignore it.

## weekly-content/ (moved 2026-11-20)

The weekly content flow was replaced by the monthly cycle (`/op/months`, migration `0081_monthly_learning_cycle`).

| Path | What it was |
|---|---|
| `web/Weeks.tsx.txt`, `web/Lessons.tsx.txt` | Operator screens "Khung chủ đề tuần" (`/op/weeks`) and the weekly lesson matrix / lesson set (`/op/lessons`) |
| `web/OperatorRouteController.weekly-routes.tsx.txt` | `WeeksRoute`, `LessonsRoute`, `LessonSetRoute` |
| `api/weekly-generation.ts.txt` | Weekly AI lesson generation pipeline (about 6,400 lines) |
| `api/week-suggestion-generation.ts.txt` | AI suggestions for weekly topics |
| `api/content-routes-weekly-ai.ts.txt` | The removed endpoints: `POST /api/v1/content/weeks/suggestions`, `POST /api/v1/content/lesson-sets/:week/generate`, `POST /api/v1/content/lesson-sets/:week/:cefr/generate`, and `POST …/draft/{enrich,fill-phrases}` |
| `api/scripts/` | One-off weekly pipeline scripts (`run-weekly-*`, `audit-weekly-*`) |
| `api/test/`, `web/test/` | The tests and test cases for the removed code |

**Still live, not moved.** These still use the weekly data model:

- the weekly lesson-set storage endpoints: draft, review, publish, retire, and the weekly practice editor in Operator › Phản hồi;
- the `program_weeks` and `lesson_sets` tables, which assessment review alerts and learner progress still read.

**To restore a piece**, copy the file back without the `.txt` suffix, then re-register the route or endpoint. The full history is also in git.
