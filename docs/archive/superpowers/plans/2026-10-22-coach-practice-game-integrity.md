# Coach, Weekly Practice, and Game Integrity Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make Coach translations explicit, remove fake learner achievements, and require an intentional word-set choice before games open.

**Architecture:** Extend the typed Coach output end-to-end, clean only deterministic demo rows, and make the game hub valid with a nullable active word set. Separate weekly-set creation from deletion at both API and client boundaries.

**Tech Stack:** TypeScript, React, Fastify, Zod, PostgreSQL, Vitest, Testing Library.

**Spec:** `docs/superpowers/specs/2026-10-22-learner-experience-and-operator-controls-design.md`

## Global Constraints

- Preserve real weekly submissions and learner-created word sets.
- Old Coach turns without translations must remain readable.
- No game route may silently fall back to seeded vocabulary.
- Every production change follows a witnessed RED → GREEN test cycle.

## Review Focus

- An old Coach record without translation renders an explicit legacy state rather than blank labels or a crash (Task 2).
- Duplicate AI suggestions remain deduplicated after translation fields are added (Task 2).
- An empty weekly vocabulary source returns an actionable message rather than creating an empty playable set (Task 5).
- Direct navigation to `/games/:key` with no set cannot start or submit a score (Task 6).
- Seed cleanup targets only the fixed demo IDs and cannot delete a real record with different IDs (Task 3).

---

### Task 1: Coach Translation Output Contract

**Files:**
- Modify: `packages/ai/src/schemas.ts`
- Modify: `packages/ai/test/service.test.ts`
- Modify: `apps/api/src/modules/coach/routes.ts`
- Modify: `apps/api/test/coach-prompt.test.ts`
- Modify: `packages/database/src/prototype-prompts.ts`

**Interfaces:**
- Produces: `CoachTaskOutput.replyTranslation: string`
- Produces: `CoachTaskOutput.suggestions[].translation: string`

- [ ] **Step 1: Write failing schema and prompt tests** asserting both fields are required by Zod/JSON schema and the prompt asks for natural Vietnamese translations of Season's reply and each suggested learner sentence.
- [ ] **Step 2: Run tests to verify RED**

Run: `pnpm --filter @e4s/ai test -- service.test.ts && pnpm --filter @e4s/api test -- coach-prompt.test.ts`

Expected: FAIL because the fields and prompt instructions do not exist.

- [ ] **Step 3: Add the fields to `coachOutputSchema`, `coachOutputJsonSchema`, and both canonical Coach prompts**; remove the previous instruction that overloaded `explanation` with a translation.
- [ ] **Step 4: Run tests to verify GREEN** using the Step 2 command.
- [ ] **Step 5: Commit**

```bash
git add packages/ai/src/schemas.ts packages/ai/test/service.test.ts apps/api/src/modules/coach/routes.ts apps/api/test/coach-prompt.test.ts packages/database/src/prototype-prompts.ts
git commit -m "feat: add explicit coach translations"
```

### Task 2: Persist and Render Coach Translations

**Files:**
- Modify: `packages/contracts/src/coach-contract.ts`
- Modify: `packages/database/src/repositories.ts`
- Modify: `packages/database/test/repositories.integration.test.ts`
- Modify: `apps/web/src/app/learner/CoachPractice.tsx`
- Modify: `apps/web/src/app/learner/CoachPractice.test.tsx`
- Modify: `apps/web/src/app/learner/learner.css`

**Interfaces:**
- Consumes: `CoachTaskOutput.replyTranslation`, `suggestions[].translation`
- Produces: `CoachFeedbackView.replyTranslation?: string`, `CoachSuggestionView.translation?: string`

- [ ] **Step 1: Write failing repository tests** proving new turns persist both translations and old JSON without them still maps successfully.
- [ ] **Step 2: Run repository test to verify RED**

Run: `pnpm --filter @e4s/database test -- repositories.integration.test.ts`

Expected: FAIL because repository mapping drops translation fields.

- [ ] **Step 3: Update contracts and repository save/read mapping** with optional read compatibility and required new-write values.
- [ ] **Step 4: Run repository test to verify GREEN**.
- [ ] **Step 5: Write failing UI tests** for the collapsed disclosure sections `Season vừa nói`, `Bạn có thể nói tiếp`, and conditional `Vì sao cần sửa`; include duplicate translated suggestions and a legacy turn.
- [ ] **Step 6: Run UI test to verify RED**

Run: `pnpm --filter @e4s/web test -- CoachPractice.test.tsx`

Expected: FAIL because the current disclosure only prints generic explanations.

- [ ] **Step 7: Pass Season message text into `CoachFeedback` and render the three compact sections** without repeating the original sentence.
- [ ] **Step 8: Run UI test to verify GREEN** and commit.

```bash
git add packages/contracts/src/coach-contract.ts packages/database/src/repositories.ts packages/database/test/repositories.integration.test.ts apps/web/src/app/learner/CoachPractice.tsx apps/web/src/app/learner/CoachPractice.test.tsx apps/web/src/app/learner/learner.css
git commit -m "feat: show coach reply and suggestion translations"
```

### Task 3: Remove Deterministic Fake Activity

**Files:**
- Modify: `packages/database/src/seed.ts`
- Create: `packages/database/migrations/0048_remove_demo_learner_activity.sql`
- Modify: `packages/database/test/repositories.integration.test.ts`

**Interfaces:**
- Produces: demo learner with no seeded practice submission and no seeded game set.

- [ ] **Step 1: Write failing integration assertions** that a freshly seeded demo learner has no practice submission and no active game set, while unrelated real-ID fixtures survive cleanup.
- [ ] **Step 2: Run the database integration test to verify RED**.
- [ ] **Step 3: Remove the two seed inserts and add migration deletes scoped to `DEMO_IDS.practiceSubmission` and `DEMO_IDS.gameSet` only.**
- [ ] **Step 4: Rebuild a disposable test database and verify GREEN**.
- [ ] **Step 5: Commit**

```bash
git add packages/database/src/seed.ts packages/database/migrations/0048_remove_demo_learner_activity.sql packages/database/test/repositories.integration.test.ts
git commit -m "fix: remove fake learner activity from demo seed"
```

### Task 4: Nullable Game Hub

**Files:**
- Modify: `packages/contracts/src/engagement-contract.ts`
- Modify: `packages/database/src/repositories.ts`
- Modify: `apps/api/src/modules/engagement/routes.ts`
- Modify: `apps/api/test/engagement.integration.test.ts`

**Interfaces:**
- Produces: `GameHubView.wordSet: GameWordSetView | null`
- Produces: `gameHub()` that returns CEFR/bests with `wordSet: null` instead of `null` context when no active set exists.

- [ ] **Step 1: Write failing API integration tests** for an empty hub returning 200 with `wordSet: null`, and direct game data requests returning a stable unavailable code.
- [ ] **Step 2: Run to verify RED**

Run: `pnpm --filter @e4s/api test -- engagement.integration.test.ts`

- [ ] **Step 3: Update contract, repository query, and `gameHubView`** so absence of a set is a supported state.
- [ ] **Step 4: Run to verify GREEN** and commit.

### Task 5: Separate Weekly Set Creation from Delete

**Files:**
- Modify: `packages/database/src/repositories.ts`
- Modify: `apps/api/src/modules/engagement/routes.ts`
- Modify: `apps/api/test/engagement.integration.test.ts`
- Modify: `apps/web/src/api/learner.ts`
- Modify: `apps/web/src/app/learner/LearnerRouteController.tsx`

**Interfaces:**
- Produces: `POST /api/v1/engagement/games/word-set/weekly`
- Produces: `createWeeklyWordSet(learnerId: string): Promise<GameWordSetView | null>`
- Keeps: `DELETE /api/v1/engagement/games/word-set` as delete-only.

- [ ] **Step 1: Write failing API tests** proving weekly vocabulary is created only after POST, contains deduplicated current published lesson vocabulary, empty lesson vocabulary returns `WEEKLY_VOCABULARY_UNAVAILABLE`, and DELETE returns an empty hub.
- [ ] **Step 2: Run to verify RED**.
- [ ] **Step 3: Implement repository aggregation and the dedicated endpoint**, keeping learner-created rows scoped by learner and current week.
- [ ] **Step 4: Update the web client/controller to call distinct endpoints.**
- [ ] **Step 5: Run API and web controller tests to verify GREEN** and commit.

### Task 6: Game Empty-State UI and Route Guard

**Files:**
- Modify: `apps/web/src/app/learner/Games.tsx`
- Modify: `apps/web/src/app/learner/Games.test.tsx`
- Modify: `apps/web/src/app/learner/GamesUx.test.tsx`
- Modify: `apps/web/src/app/learner/learner.css`

**Interfaces:**
- Consumes: nullable `GameHubView.wordSet`

- [ ] **Step 1: Write failing UI tests** asserting no vocabulary list or game links before set selection, weekly/custom selection opens the game list, delete closes it, and a direct game route shows `Hãy chọn bộ từ trước khi chơi` without mounting a game component.
- [ ] **Step 2: Run to verify RED**

Run: `pnpm --filter @e4s/web test -- Games.test.tsx GamesUx.test.tsx`

- [ ] **Step 3: Render the staged empty/ready UI and guard game routes.**
- [ ] **Step 4: Run to verify GREEN** and commit.

### Task 7: Integrated Verification

- [ ] **Step 1: Run focused tests**

Run: `pnpm --filter @e4s/ai test -- service.test.ts && pnpm --filter @e4s/database test -- repositories.integration.test.ts && pnpm --filter @e4s/api test -- coach-prompt.test.ts engagement.integration.test.ts && pnpm --filter @e4s/web test -- CoachPractice.test.tsx Games.test.tsx GamesUx.test.tsx`

- [ ] **Step 2: Run typechecks** for `@e4s/ai`, `@e4s/contracts`, `@e4s/database`, `@e4s/api`, and `@e4s/web`.
- [ ] **Step 3: Browser verify** `/coach`, `/practice`, `/games`, all six direct game routes, weekly-set creation and delete.
- [ ] **Step 4: Commit any verification-only fixture updates.**

