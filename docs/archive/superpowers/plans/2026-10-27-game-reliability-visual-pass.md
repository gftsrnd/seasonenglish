# Game Reliability and Visual Pass Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make all six vocabulary games honestly available, mechanically complete, and visually clearer on desktop and mobile.

**Architecture:** Add one pure availability/round-summary layer shared by the hub and tutorial, then fix isolated engine input defects, then apply scoped CSS/markup improvements. Keep scoring contracts and deterministic attempt preparation unchanged.

**Tech Stack:** React, TypeScript, Vitest, Testing Library, Lucide React, CSS.

**Spec:** `docs/superpowers/specs/2026-10-27-game-reliability-visual-pass-design.md`

## Global Constraints

- Keep the six existing games and seasonal SVG artwork.
- Unavailable games remain visible with the reason and cannot navigate.
- Write and observe a failing test before each behavior fix.
- Do not alter scoring or arena rules.

## Review Focus

- Three-word weekly sets must not open Word Sort or an impossible Crossword.
- Apostrophes and hyphens must be enterable on touch in Typing Race.
- Rio tutorial counts must match the generated gate count for short sets.
- Keyboard input outside an active game must not mutate the answer.
- Narrow screens must retain readable clues, controls, and progress without horizontal overflow.

---

### Task 1: Honest game availability and tutorial summaries

**Files:**
- Modify: `apps/web/src/app/learner/Games.tsx`
- Modify: `apps/web/src/app/games/types.ts`
- Test: `apps/web/src/app/learner/GamesUx.test.tsx`

**Interfaces:**
- Produces: `getGameAvailability(key, words)` and `getGameRoundSummary(key, words)` pure helpers.

- [ ] Add failing tests for disabled Word Sort/Crossword tiles and dynamic Rio tutorial counts.
- [ ] Run focused tests and confirm expected failures.
- [ ] Implement the smallest shared availability and summary helpers and render disabled tiles with reasons.
- [ ] Run focused tests and confirm pass.

### Task 2: Complete engine controls

**Files:**
- Modify: `apps/web/src/app/games/TypingRaceGame.tsx`
- Modify: `apps/web/src/app/games/SeasonRioGame.tsx`
- Test: `apps/web/src/app/learner/GamesUx.test.tsx`

**Interfaces:**
- Consumes: existing engine props and attempt preparation.

- [ ] Add failing tests for apostrophe/hyphen touch keys, scoped typing input, Rio pointer cancellation, and dialog focus containment.
- [ ] Run focused tests and confirm expected failures.
- [ ] Implement minimal input and focus fixes without changing scoring.
- [ ] Run focused tests and confirm pass.

### Task 3: Individual game visual hierarchy

**Files:**
- Modify: `apps/web/src/app/games/games.css`
- Modify only when semantic grouping requires it: six files under `apps/web/src/app/games/*Game.tsx`
- Test: `apps/web/src/app/learner/GamesUx.test.tsx`
- Update: `design-qa.md`

**Interfaces:**
- Produces: shared clue/progress/feedback surface classes used by the existing engines.

- [ ] Add structural tests for clue, progress, play, and feedback regions.
- [ ] Run focused tests and confirm expected failures.
- [ ] Apply shared visual surfaces and responsive rules using current CSS variables and SVG icons.
- [ ] Run focused tests, typecheck, production build, and authenticated responsive browser review.
- [ ] Record the visual QA evidence and remaining non-blocking gaps.
