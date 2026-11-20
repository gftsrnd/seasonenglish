# Operator Organisation Experience Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give Operator safe organisation-wide theme/music controls while removing all Operator access to provider credentials and prompts.

**Architecture:** Introduce a narrow experience API over existing organisation settings, enforce role boundaries server-side, and make automatic theme resolution a clock-aware shared service. Manager retains full settings; Operator only edits the experience subset.

**Tech Stack:** TypeScript, React, Fastify, PostgreSQL, Vitest, Testing Library.

**Spec:** `docs/superpowers/specs/2026-10-22-learner-experience-and-operator-controls-design.md`

## Global Constraints

- Operator changes apply to the whole organisation.
- Learner can read but never write organisation experience configuration.
- Operator cannot read/write provider credentials or prompts through direct API calls.
- Automatic themes update after a calendar boundary without reload.

## Review Focus

- An Operator-crafted request containing unrelated Manager settings cannot mutate them (Task 2).
- A learner from another organisation never receives another organisation's configuration (Task 2).
- Device sleep across midnight refreshes theme on visibility change (Task 4).
- A manual theme remains stable when the date changes (Task 4).
- Invalid music volume or URL is rejected without partially saving theme changes (Task 2).

---

### Task 1: Lock Down Provider and Prompt Permissions

**Files:**
- Modify: `apps/api/src/modules/manager/routes.ts`
- Modify: `apps/api/src/modules/content/routes.ts`
- Modify: `apps/api/test/manager.integration.test.ts`
- Modify: `apps/api/test/content.integration.test.ts`

**Interfaces:**
- Provider GET/PUT/test: Manager only.
- Prompt GET/PUT: Manager only.

- [ ] **Step 1: Write failing authorization tests** for Operator 403 and Manager 200 on provider and prompt endpoints.
- [ ] **Step 2: Run tests to verify RED**.
- [ ] **Step 3: Replace staff guards with manager-only guards for these endpoints.**
- [ ] **Step 4: Run tests to verify GREEN** and commit.

### Task 2: Organisation Experience API

**Files:**
- Create: `packages/contracts/src/experience-contract.ts`
- Modify: `packages/contracts/src/index.ts`
- Modify: `packages/database/src/repositories.ts`
- Modify: `apps/api/src/modules/system/routes.ts`
- Modify: `apps/api/test/system.integration.test.ts`

**Interfaces:**
- Produces: `OrganisationExperienceView`
- Produces: `OrganisationExperienceInput`
- Produces: `GET /api/v1/organisation-experience` for authenticated roles.
- Produces: `PUT /api/v1/organisation-experience` for Manager and Operator.

- [ ] **Step 1: Write failing API tests** covering role matrix, organisation isolation, exact accepted theme values, volume `0..100`, valid custom YouTube URL/blank URL, and atomic rejection.
- [ ] **Step 2: Run to verify RED**.
- [ ] **Step 3: Add focused repository read/write methods** that update only theme and background-music configuration.
- [ ] **Step 4: Add GET/PUT routes and Zod validation.**
- [ ] **Step 5: Run to verify GREEN** and commit.

### Task 3: Remove Operator AI and Prompt UI

**Files:**
- Modify: `apps/web/src/app/RoleRoutes.tsx`
- Modify: `apps/web/src/app/settings/Settings.tsx`
- Modify: `apps/web/src/app/manager/ManagerRouteController.tsx`
- Modify: `apps/web/src/app/operator/OperatorRouteController.tsx`
- Modify: `apps/web/src/app/settings/settings-app.test.tsx`
- Modify: `apps/web/src/app/settings/settings-ai-parity.test.tsx`

**Interfaces:**
- Consumes: organisation experience API from Task 2.

- [ ] **Step 1: Write failing UI tests** asserting Operator sees no AI section, API key/model/provider controls, Prompt card, or `/op/prompts`; Manager still sees them.
- [ ] **Step 2: Run to verify RED**.
- [ ] **Step 3: Remove Operator provider fetching/actions and prompt route/navigation.**
- [ ] **Step 4: Run to verify GREEN** and commit.

### Task 4: Clock-Aware Theme Resolver

**Files:**
- Modify: `apps/web/src/app/games/season-visual.ts`
- Create: `apps/web/src/features/experience/useAutomaticTheme.ts`
- Create: `apps/web/src/features/experience/useAutomaticTheme.test.tsx`
- Modify: `apps/web/src/app/shared/ThemeProvider.tsx`

**Interfaces:**
- Produces: `resolveAutomaticTheme(at: Date): ResolvedSeasonTheme`
- Produces: `millisecondsUntilNextLocalDay(at: Date): number`
- Produces: `useAutomaticTheme(configuredTheme)`.

- [ ] **Step 1: Write failing fake-clock tests** for all seasonal boundaries, midnight rollover, tab visibility recovery, and manual-theme stability.
- [ ] **Step 2: Run to verify RED**.
- [ ] **Step 3: Consolidate calendar resolution and implement a next-midnight timer plus `visibilitychange` refresh.**
- [ ] **Step 4: Run to verify GREEN** and commit.

### Task 5: Operator Theme and Music Controls

**Files:**
- Modify: `apps/web/src/api/manager.ts`
- Modify: `apps/web/src/api/shared.ts`
- Modify: `apps/web/src/app/settings/Settings.tsx`
- Modify: `apps/web/src/app/settings/settings-app.test.tsx`
- Modify: `apps/web/src/app/manager/ManagerRouteController.tsx`
- Modify: `apps/web/src/app/App.tsx`

**Interfaces:**
- Consumes: `OrganisationExperienceView/Input`.

- [ ] **Step 1: Write failing UI tests** asserting Operator can save global theme, enabled state, playlist/custom URL and volume, while unrelated Manager fields are absent.
- [ ] **Step 2: Run to verify RED**.
- [ ] **Step 3: Add client methods and render standardized Theme/Music cards for both Manager and Operator using the narrow endpoint.**
- [ ] **Step 4: Load effective organisation experience for every signed-in role in `App`, not only Manager.**
- [ ] **Step 5: Run to verify GREEN** and commit.

### Task 6: Integrated Verification

- [ ] **Step 1: Run API authorization and experience integration tests.**
- [ ] **Step 2: Run web settings/theme tests and all affected typechecks.**
- [ ] **Step 3: Browser verify Manager, Operator and Learner sessions: permissions, saved theme, saved volume and automatic rollover using controlled clock where available.**
- [ ] **Step 4: Commit verification fixture updates.**

