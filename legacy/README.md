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

## old-routes/ (moved 2026-11-20)

Old URLs and screens that no longer had a link anywhere in the app.

| Path | What it was |
|---|---|
| `removed-redirects.txt` | Redirect-only URLs: `/mgr/reopen-requests`, `/mgr/complaints`, `/mgr/recovery`, `/settings/prompts`, `/mgr/ops/prompts`, `/op/prompts`, `/op/requests`, `/op/months#my-reopen-requests`, `/op/weeks`, `/op/lessons`, `/practice`, `/survey/monthly`, `/profile#my-requests`, `/duel/*`. These URLs now show the 404 card. |
| `PromptsRoute.tsx.txt`, `Prompts.tsx.txt` | "Prompt & rubric" screen. Every role was blocked from it. The prompts API (`/api/v1/content/prompts`) is still live. |
| `LearnerPractice.tsx.txt` | Learner weekly practice screen (`/practice`). It had redirected to Home since the monthly cycle. The `practice` link has also been removed from the learner home data. The practice API stays, because grading and appeals still use old submissions. |
| `LearnerArena-duel.tsx.txt`, `engagement-duels-api.ts.txt`, `*-app-states.test.tsx.txt` | The first arena (duels) and its API, which only answered 410. The current arena is `/arena` plus `apps/api/src/modules/arena`. |
| `removed-test-cases.txt` | Test cases for the URLs and screens above |

## Later on 2026-11-20

| Path | What it was |
|---|---|
| `weekly-content/web/operator-api-client-weekly.ts.txt` | Web API client calls for the removed weekly endpoints and screens |
| `weekly-content/web/Review-weekly-components.tsx.txt` | Weekly submission card and weekly-practice editor (no longer rendered) |
| `old-routes/learner-practice-plumbing.txt` | Learner weekly-practice client calls and callbacks |
| `scripts/*.txt` | Scripts nothing referenced: old e2e runners, the 4300-only backup (replaced by `scripts/ops/e4s.ps1`), a one-off reward fix, QA account prep |
| `weekly-content/api/test/removed-cases-backend.txt` | Backend test cases that only exercised the weekly learner flow |
