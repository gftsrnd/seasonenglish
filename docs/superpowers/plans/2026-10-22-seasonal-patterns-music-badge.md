# Seasonal Patterns, Music Presets, and Learner Badge Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add original seasonal pattern layers, licensed study-music presets, and a compact learner role/level identity in the header.

**Architecture:** Keep decorative assets separate from theme logic, store licensed music metadata in a typed catalog, and derive the active preset from resolved season plus local study period. Extend AppShell with learner profile identity without changing other roles.

**Tech Stack:** TypeScript, React, CSS, image generation assets, Vitest, Testing Library, browser verification.

**Spec:** `docs/superpowers/specs/2026-10-22-learner-experience-and-operator-controls-design.md`

## Global Constraints

- Patterns are original, seamless, transparent, text-free and low contrast.
- Music must have explicit reuse/streaming permission and stable embeddable URLs.
- Do not redistribute audio when the licence only permits embedding/streaming.
- Listening exercises and text-to-speech always suspend background music.
- Learner header must remain compact with long names.

## Review Focus

- A missing pattern asset falls back to the base seasonal colour without hiding content (Task 2).
- High-contrast/reduced-transparency preferences suppress decorative patterns (Task 2).
- A preset with an unavailable external URL reports preview failure without overwriting saved configuration (Task 4).
- Local time exactly at 12:00 and 18:00 selects the documented study period deterministically (Task 3).
- A learner profile without CEFR shows no fake badge and does not shift logout controls (Task 5).

---

### Task 1: Research and Define Licensed Music Catalog

**Files:**
- Create: `apps/web/src/features/experience/music-presets.ts`
- Create: `apps/web/src/features/experience/music-presets.test.ts`
- Create: `docs/music-sources.md`

**Interfaces:**
- Produces: `MusicPreset` with `id`, `label`, `themes`, `period`, `embedUrl`, `sourceUrl`, `licence`, `attribution`.
- Produces: `musicPresetFor(theme, period): MusicPreset`.

- [ ] **Step 1: Verify candidate tracks/playlists against official licence/source pages** and record direct citations plus whether embedding is permitted.
- [ ] **Step 2: Write failing catalog tests** for unique IDs, HTTPS URLs, non-empty licence/source metadata, coverage for every theme × morning/afternoon/evening, and deterministic 12:00/18:00 boundaries.
- [ ] **Step 3: Run to verify RED**.
- [ ] **Step 4: Implement the smallest catalog using only verified sources**; prefer reuse of a suitable preset across themes over padding the list with weak tracks.
- [ ] **Step 5: Run to verify GREEN** and commit.

### Task 2: Generate and Integrate Seasonal Pattern Assets

**Files:**
- Create: `apps/web/public/patterns/season-*.png`
- Modify: `apps/web/src/app/app-layout.css`
- Modify: `apps/web/src/app/shared/ThemeProvider.tsx`
- Modify: `apps/web/src/app/App.test.tsx`

**Interfaces:**
- Consumes: resolved theme from organisation experience plan.

- [ ] **Step 1: Write failing DOM/CSS contract tests** asserting each non-auto theme maps to one pattern URL and accessibility media queries can disable it.
- [ ] **Step 2: Run to verify RED**.
- [ ] **Step 3: Use the image generation skill to create seven original seamless transparent line-art patterns** (spring, summer, autumn, winter, Tết, Mid-Autumn, Christmas/New Year) following the supplied references without copying their artwork.
- [ ] **Step 4: Optimize assets without changing pixels materially and add a low-opacity fixed pseudo-layer behind content.**
- [ ] **Step 5: Run tests and visual checks at desktop/mobile widths, then commit assets and CSS.**

### Task 3: Automatic Music Selection

**Files:**
- Modify: `apps/web/src/features/experience/Experience.tsx`
- Create: `apps/web/src/features/experience/music-selection.ts`
- Create: `apps/web/src/features/experience/music-selection.test.ts`

**Interfaces:**
- Consumes: `MusicPreset`, resolved theme, organisation music config.
- Produces: `studyPeriodFor(date: Date): "morning" | "afternoon" | "evening"` with morning `<12:00`, afternoon `<18:00`, evening otherwise.
- Produces: effective embed URL and volume.

- [ ] **Step 1: Write failing tests** for season/period selection, custom override, personal off switch, organisation disabled state, listening/TTS suspension, and unavailable preview preserving saved state.
- [ ] **Step 2: Run to verify RED**.
- [ ] **Step 3: Implement pure selection logic and connect it to the existing player lifecycle.**
- [ ] **Step 4: Run to verify GREEN** and commit.

### Task 4: Operator Preset Picker and Real Preview

**Files:**
- Modify: `apps/web/src/app/settings/Settings.tsx`
- Modify: `apps/web/src/app/settings/settings-app.test.tsx`
- Modify: `apps/api/src/modules/manager/routes.ts`
- Modify: `apps/api/test/manager.integration.test.ts`

**Interfaces:**
- Consumes: catalog from Task 1 and organisation experience API.

- [ ] **Step 1: Write failing UI/API tests** for grouped preset choice, custom URL override, volume preview, save, reset to automatic preset, and failed preview not saving.
- [ ] **Step 2: Run to verify RED**.
- [ ] **Step 3: Implement standardized controls and validation.**
- [ ] **Step 4: Browser-test with a verified embeddable preset:** save as Operator, reload as Learner, confirm player receives URL/volume, and confirm listening/TTS suspends it.
- [ ] **Step 5: Run tests to verify GREEN** and commit.

### Task 5: Learner Role Icon and CEFR Badge

**Files:**
- Modify: `apps/web/src/app/App.tsx`
- Modify: `apps/web/src/app/shared/AppShell.tsx`
- Modify: `apps/web/src/app/app-layout.css`
- Modify: `apps/web/src/app/App.test.tsx`
- Modify: `apps/web/src/app/shared/AppShell.test.tsx`

**Interfaces:**
- Produces: `AppShell` props `learnerCefr?: CefrLevel`.

- [ ] **Step 1: Write failing tests** for learner icon + A1–C1 badge, absent unknown level, non-learner unchanged, and long-name compact layout class.
- [ ] **Step 2: Run to verify RED**.
- [ ] **Step 3: Pass profile CEFR into AppShell and render Lucide role icon plus shared badge styling.**
- [ ] **Step 4: Run to verify GREEN** and commit.

### Task 6: Integrated Verification

- [ ] **Step 1: Run catalog, selection, settings, App and AppShell tests plus web/API typechecks.**
- [ ] **Step 2: Inspect all seven themes at desktop and mobile sizes for readability and seamless pattern repetition.**
- [ ] **Step 3: Verify morning/afternoon/evening preset resolution with controlled local time and verify a real preset preview.**
- [ ] **Step 4: Browser verify learner badge with A1, A2, B1, B2 and C1 fixture profiles.**
- [ ] **Step 5: Commit verification updates.**

