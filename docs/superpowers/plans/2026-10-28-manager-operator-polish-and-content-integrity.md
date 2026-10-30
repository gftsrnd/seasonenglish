# Manager/Operator Polish and Content Integrity Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Resolve the 13 reported Manager/Operator layout, workflow, export, editing, and lesson-content defects while keeping the local app on port 4175.

**Architecture:** Fix role leakage and ordering at the route/component boundary, then scope layout rules to the exact surfaces that own them. Preserve existing APIs unless the missing behavior requires a contract change; protect each repaired behavior with focused component or integration tests before implementation.

**Tech Stack:** React, TypeScript, Vitest, Testing Library, Fastify, PostgreSQL repositories, CSS.

**Spec:** Active thread objective and attached images 1–17 in `C:/Users/TT5.01 AI UD/.codex/attachments/a78cc36a-fc01-4300-aa4b-c613084df430/`.

## Global Constraints

- Keep the local web app on `http://127.0.0.1:4175`; do not change its port.
- Manager operational views remain read-only and must not leak Manager-only chrome into Operator routes.
- Long lists retain scrolling, but weekly-work and assessment sections receive enough height to read and edit comfortably.
- Preserve the user's unrelated working-tree changes.
- Implement and verify each repair in the current session without delegating work.

## Review Focus

- Narrow and wide viewports: buttons must wrap intentionally without stretching or overlapping.
- Role transitions: Manager and Operator navigation/background/chrome must remain isolated after moving between routes.
- Large account, weekly-work, and assessment datasets: content stays reachable with bounded but usable scrolling.
- CSV opened by Excel: UTF-8 Vietnamese, stable date/score values, complete columns, and readable headers.
- Lesson audio and answer content: labels, IPA, examples, and playable assets must describe the same target word/sound.

---

### Task 1: Weekly Work and Shared Scroll Layout

**Files:**
- Modify: `apps/web/src/app/operator/Review.tsx`
- Modify: `apps/web/src/app/operator/styles.css`
- Modify: `apps/web/src/app/operator/operator-app.test.tsx`
- Modify: `apps/web/src/app/operator/OperatorRouteController.test.tsx`

**Interfaces:**
- Consumes: `WeeklyPracticeEditor` inputs and existing review view model.
- Produces: compact right-aligned AI generation action and taller scoped list regions.

- [ ] Write failing tests for a non-stretched generation button and section-specific scroll classes.
- [ ] Run the focused Operator tests and confirm the new assertions fail.
- [ ] Scope header/button layout and increase weekly/assessment list height without removing overflow.
- [ ] Run the focused tests and visual-check `/op/review` and `/op/tests`.

### Task 2: Manager Settings Security and Account Controls

**Files:**
- Modify: `apps/web/src/app/manager/ManagerRouteController.tsx`
- Modify: `apps/web/src/app/manager/manager.css`
- Modify: `apps/web/src/app/manager/ManagerRouteController.test.tsx`
- Modify: `apps/web/src/app/manager/manager-layout.test.ts`

**Interfaces:**
- Consumes: `SecurityReport[]`, account reset/reveal APIs.
- Produces: compact contextual security activity panel, separated reset-dialog actions, and visible newly issued PINs.

- [ ] Write failing tests for contextual security placement, reset action spacing, and post-reset PIN reveal.
- [ ] Run the focused Manager tests and confirm failure.
- [ ] Move/reshape the security panel and repair modal/account action layout while retaining protected current-PIN semantics.
- [ ] Run focused tests and visually verify `/settings`.

### Task 3: Manager Progress Ordering, Role Isolation, and CSV Export

**Files:**
- Modify: `apps/web/src/app/manager/Progress.tsx`
- Modify: `apps/web/src/app/manager/ManagerRouteController.tsx`
- Modify: `apps/web/src/app/manager/manager.css`
- Modify: `apps/web/src/app/shared/AppShell.tsx`
- Modify: relevant Manager/AppShell tests.

**Interfaces:**
- Consumes: `ManagerProgressView` and role-aware shell state.
- Produces: submitted-before-in-progress test ordering, no Manager chrome on Operator routes, and an Excel-readable comprehensive progress CSV.

- [ ] Write failing tests for section order, role-specific chrome/background, and literal CSV rows/headers.
- [ ] Run focused tests and confirm failure.
- [ ] Reorder progress groups, scope Manager shell selectors by navigation role, and centralize robust CSV serialization.
- [ ] Verify Manager/Operator route switching, UTF-8 export, and focused tests.

### Task 4: Reminder Policy and Per-Learner Configuration

**Files:**
- Modify: `apps/web/src/app/manager/Reminders.tsx`
- Modify: `apps/web/src/app/settings/Settings.tsx`
- Modify: Manager/settings contracts and API/repository routes only if per-learner overrides are absent.
- Modify: reminder and settings tests.

**Interfaces:**
- Consumes: organization reminder defaults and learner identities.
- Produces: readable reminder description plus per-learner channel/policy overrides with organization fallback.

- [ ] Characterize the current reminder policy data path and write failing tests for description layout and per-learner override behavior.
- [ ] Implement the smallest contract/repository/UI changes needed for per-learner settings.
- [ ] Verify save/reload behavior and reminder candidate rendering.

### Task 5: Promotion Assessment Editing and Dialog Layout

**Files:**
- Modify: `apps/web/src/app/operator/Tests.tsx` and/or assessment editor component located during diagnosis.
- Modify: `apps/web/src/app/operator/styles.css`
- Modify: assessment editor tests and API update tests.

**Interfaces:**
- Consumes: promotion-test draft definition.
- Produces: normal-height Save/Close actions and editable question prompts, options, and correct answers.

- [ ] Write failing UI tests proving prompt, options, and answer edits are submitted.
- [ ] Run tests and confirm fixed-answer behavior fails them.
- [ ] Bind all fields to editable draft state and persist the full definition; normalize dialog action sizing.
- [ ] Verify save/reopen round trip and focused tests.

### Task 6: Lesson Answer and Pronunciation Integrity

**Files:**
- Modify: `apps/web/src/app/operator/Lessons.tsx` or shared lesson presentation components located during diagnosis.
- Modify: `apps/web/src/app/shared/lesson/*`
- Modify: `packages/ai/src/pronunciation.ts`
- Modify: pronunciation/lesson presentation tests and fixtures.

**Interfaces:**
- Consumes: lesson grammar, exercise answer, word, IPA, example, and audio asset data.
- Produces: correctly labelled answer content and word/IPA/example/audio combinations that agree.

- [ ] Add failing fixtures for stray answer text and mismatched word/IPA/audio mappings.
- [ ] Trace whether corruption originates in generation normalization, persistence, or rendering.
- [ ] Fix the earliest responsible layer and remove raw answer leakage from lesson display.
- [ ] Run AI package, Operator, and Learner lesson tests; manually play representative word and phoneme audio.

### Task 7: Completion Verification

**Files:**
- Modify: this plan checklist as tasks complete.

**Interfaces:**
- Consumes: all prior task outputs.
- Produces: verified local build at port 4175.

- [ ] Run focused tests for all touched subsystems.
- [ ] Run web/API typechecks and production builds.
- [ ] Run full relevant suites and report any unrelated baseline failures by name.
- [ ] Inspect all 13 requirements against the rendered Manager/Operator/Learner states.
- [ ] Keep the verified local app running on port 4175.
