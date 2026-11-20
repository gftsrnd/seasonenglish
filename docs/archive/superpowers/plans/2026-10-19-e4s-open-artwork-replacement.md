# E4S Open Artwork Replacement Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace every active fake/generated illustration outside avatars and rewards with traceable CC0 raster artwork or functional Lucide icons while preserving the current 4175 UI and game behavior.

**Architecture:** Pin a minimal Kenney CC0 asset subset under `public/media`, verify every file against a committed manifest, centralize product-art paths and seasonal metadata, then migrate branding, onboarding, survey, and both season games. A static source gate prevents inline/data SVG, CSS scenery, and illustrative emoji from returning outside narrow avatar/reward exemptions.

**Tech Stack:** React 19, TypeScript 7, Vite 8, Lucide React, Vitest, Testing Library, Node verification scripts, Playwright/browser smoke.

**Spec:** `docs/superpowers/specs/2026-10-19-e4s-real-media-design.md`

## Global Constraints

- Execute only after `2026-10-19-e4s-content-media-pipeline.md` is green.
- Keep the GFT logo, learner avatar symbols, rewards, badges, certificates, scoring, physics, route structure, and theme colors unchanged.
- Use only selected PNG/WebP files from official Kenney asset pages licensed CC0. Do not add generated SVG or AI artwork.
- Do not commit downloaded archives, screenshots, or evidence; only selected runtime assets and their manifest belong in Git.
- Decorative images have empty alt text. Meaning-bearing game objects have concise accessible labels through surrounding UI.
- Validate at 390×827 and 1440×900. Do not hide overflow by globally clipping the page.
- Commit after each green task.

## Review Focus

- Licence/source traceability and digest validation for every bundled file.
- No regression to avatar/reward rendering.
- No image-driven layout shift, pointer hitbox change, game timing change, or inaccessible status-only icon.
- Source scan exemptions must be line-scoped and justified; never exclude an entire mixed-purpose file.
- Raster art should be visually coherent and should not introduce a second brand mark beside GFT.

---

## Task 1: Pin the CC0 asset subset and enforce its manifest

**Files:**

- Create: `apps/web/public/media/manifest.json`
- Create: `apps/web/public/media/mascot/`
- Create: `apps/web/public/media/games/`
- Create: `apps/web/public/media/seasons/`
- Create: `apps/web/public/media/LICENSES.md`
- Create: `scripts/verify-media-assets.mjs`
- Create: `scripts/verify-media-assets.test.mjs`
- Modify: `package.json`
- Modify: `.gitignore` if temporary extraction paths are not already ignored

**Manifest entry:**

```ts
interface MediaManifestEntry {
  id: string;
  localPath: `apps/web/public/media/${string}.png` | `apps/web/public/media/${string}.webp`;
  sourcePage: `https://kenney.nl/assets/${string}`;
  sourcePack: string;
  originalArchivePath: string;
  licence: "CC0-1.0";
  sha256: string; // exactly 64 lowercase hexadecimal characters
  purpose: string;
}
```

Select the smallest coherent subset from official Kenney pages, beginning with Animal Pack/Animal Pack Remastered for mascot/animals and Pixel Platformer plus its Food Expansion for platform objects/food. The manifest must cover exactly these logical purposes: mascot, basket, dinosaur, three gift states, flag, mushroom, bomb, six seasonal heroes, six hero foods, and seven seasonal catch objects. Record the exact pack page and original archive path for each selected file in `LICENSES.md`; do not claim an original filename until the downloaded archive confirms it.

**Steps:**

- [ ] Write a failing verifier test for missing files, undeclared files, duplicate IDs/paths, non-CC0 entries, non-Kenney source pages, invalid extensions, and SHA-256 mismatch.
- [ ] Run `pnpm exec vitest run scripts/verify-media-assets.test.mjs`; expect module-not-found failure.
- [ ] Implement the verifier and add root script `verify:media`.
- [ ] Download official packs into an ignored temporary directory, inspect them, copy only the chosen PNG/WebP files, and calculate hashes with the verifier. Do not generate or redraw assets.
- [ ] Populate a complete manifest and `LICENSES.md`, then delete the temporary archives/extraction directory.
- [ ] Make root `build` run `pnpm verify:media` before `pnpm -r build`.
- [ ] Run `pnpm verify:media` and `pnpm build`; expect both to pass.
- [ ] Commit: `assets(web): add verified cc0 artwork`

## Task 2: Centralize brand, mascot, and seasonal visual metadata

**Files:**

- Create: `apps/web/src/app/shared/media/ProductArt.tsx`
- Create: `apps/web/src/app/shared/media/product-art.css`
- Create: `apps/web/src/app/shared/media/product-art.test.tsx`
- Create: `apps/web/src/app/games/season-visual.ts`
- Create: `apps/web/src/app/games/season-visual.test.ts`
- Modify: `apps/web/src/app/shared/AppShell.tsx`
- Modify: `apps/web/src/app/shared/EntryScreen.tsx`
- Modify: `apps/web/src/app/shared/AppShell.test.tsx`
- Modify: `apps/web/src/app/shared/EntryScreen.test.tsx`

**Interfaces:**

```ts
export type ProductArtId =
  | "mascot"
  | "basket"
  | "dinosaur"
  | "gift-closed"
  | "gift-correct"
  | "gift-wrong"
  | "flag"
  | "mushroom"
  | "bomb"
  | `hero-${HeroKind}`
  | `food-${HeroKind}`
  | `catch-${SeasonTheme}`;

type ProductArtProps =
  | { id: ProductArtId; className?: string; decorative: true; alt?: never }
  | { id: ProductArtId; className?: string; decorative?: false; alt: string };

export function ProductArt(props: ProductArtProps): JSX.Element;
```

`season-visual.ts` retains date/theme/hero selection and Vietnamese labels only. It contains no JSX, emoji, inline SVG, or data URLs.

**Steps:**

- [ ] Add failing tests that every `ProductArtId` resolves to a manifest-declared raster, decorative output has `alt=""`, and semantic output requires alt text.
- [ ] Add failing shell/entry tests requiring the existing `/gft-logo.png` instead of `SeasonMark`.
- [ ] Run `pnpm exec vitest run apps/web/src/app/shared/media/product-art.test.tsx apps/web/src/app/shared/AppShell.test.tsx apps/web/src/app/shared/EntryScreen.test.tsx`; expect failures.
- [ ] Implement `ProductArt`, split seasonal metadata out of `season-art.tsx`, and migrate shell/entry branding to the GFT logo.
- [ ] Run focused tests and `pnpm typecheck`; expect pass.
- [ ] Commit: `refactor(web): centralize verified product artwork`

## Task 3: Replace onboarding and survey mascot art

**Files:**

- Modify: `apps/web/src/app/learner/Onboard.tsx`
- Modify: `apps/web/src/app/learner/Onboard.test.tsx`
- Modify: `apps/web/src/app/learner/ProfileReward.tsx`
- Modify: `apps/web/src/app/learner/ProfileReward.test.tsx`
- Modify: `apps/web/src/app/learner/learner.css`

**Steps:**

- [ ] Add failing tests that onboarding and survey/thank-you states render `ProductArt id="mascot"`, never `SeasonMark`, while avatar and reward symbols remain byte-for-byte represented by their existing tests.
- [ ] Run `pnpm exec vitest run apps/web/src/app/learner/Onboard.test.tsx apps/web/src/app/learner/ProfileReward.test.tsx`; expect mascot assertions to fail.
- [ ] Replace only the non-reward mascot usages and add responsive raster sizing/object-fit rules.
- [ ] Re-run focused tests and `pnpm typecheck`; expect pass.
- [ ] Commit: `fix(learner): use cc0 mascot artwork`

## Task 4: Replace Season Catch artwork and status emoji

**Files:**

- Modify: `apps/web/src/app/games/SeasonCatchGame.tsx`
- Modify: `apps/web/src/app/games/games.css`
- Modify: `apps/web/src/app/learner/Games.tsx`
- Modify: `apps/web/src/app/learner/GamesUx.test.tsx`

**Behavior:**

- Use manifest-backed seasonal catch object, selected animal, basket, and dinosaur assets.
- Use Lucide `Heart`, `HeartCrack`, `CheckCircle2`, and `XCircle` with text/ARIA for lives and feedback.
- Preserve item positions, basket hitbox, speed multipliers, keyboard/pointer controls, scoring, and game-over timing.

**Steps:**

- [ ] Add failing tests for each visual state, accessible life count, success/error notices independent of emoji prefixes, and unchanged game mechanics.
- [ ] Run `pnpm exec vitest run apps/web/src/app/learner/GamesUx.test.tsx`; expect fake-art/status assertions to fail.
- [ ] Replace visual components with `ProductArt`, change notice state from emoji-prefix inference to an explicit tone enum, and remove emoji from instructions/HUD.
- [ ] Run focused tests and `pnpm typecheck`; expect pass.
- [ ] Commit: `fix(games): replace season catch fake art`

## Task 5: Replace Season-rio artwork and status emoji

**Files:**

- Modify: `apps/web/src/app/games/SeasonRioGame.tsx`
- Modify: `apps/web/src/app/games/games.css`
- Modify: `apps/web/src/app/learner/Games.tsx`
- Modify: `apps/web/src/app/learner/GamesUx.test.tsx`

**Behavior:**

- Use manifest-backed hero poses or one stable hero raster with CSS motion, gift states, mushroom, food/boss, flag, and dinosaur.
- Use Lucide icons plus text for score, timer, lives, correct/incorrect, and completion.
- Preserve platform/gate coordinates, collision boxes, boss health, 10-second timer, controls, and finish conditions.

**Steps:**

- [ ] Add failing tests for closed/correct/wrong gifts, boss states, game-over states, life/timer accessibility, and unchanged round-plan behavior.
- [ ] Run `pnpm exec vitest run apps/web/src/app/learner/GamesUx.test.tsx`; expect failures.
- [ ] Replace all `GiftArt`, `SeasonHero`, `DinoGameOverArt`, food emoji, flag emoji, and notice-prefix logic with manifest art and explicit state.
- [ ] Run focused tests and `pnpm typecheck`; expect pass.
- [ ] Commit: `fix(games): replace season rio fake art`

## Task 6: Replace remaining non-reward illustrative emoji with functional icons

**Files:**

- Modify: `apps/web/src/app/learner/Learning.tsx`
- Modify: `apps/web/src/app/learner/Assessment.tsx`
- Modify: `apps/web/src/app/learner/AssessmentRuntime.tsx`
- Modify: `apps/web/src/app/learner/Home.tsx`
- Modify: `apps/web/src/app/learner/CoachPractice.tsx`
- Modify: `apps/web/src/app/learner/Games.tsx`
- Modify: `apps/web/src/app/games/ScrambleGame.tsx`
- Modify: `apps/web/src/app/games/WordSortGame.tsx`
- Modify: `apps/web/src/app/manager/Reminders.tsx`
- Modify: `apps/web/src/app/shared/AppShell.tsx`
- Modify: `apps/web/src/app/learner/Learning.test.tsx`
- Modify: `apps/web/src/app/learner/Assessment.test.tsx`
- Modify: `apps/web/src/app/learner/Home.test.tsx`
- Modify: `apps/web/src/app/learner/CoachPractice.test.tsx`
- Modify: `apps/web/src/app/learner/GamesUx.test.tsx`
- Modify: `apps/web/src/app/shared/AppShell.test.tsx`
- Create: `apps/web/src/app/manager/Reminders.test.tsx`

**Steps:**

- [ ] Add/extend tests for lock, audio, microphone, warning, success, failure, save, and reminder states so meaning remains in accessible text without requiring an emoji glyph.
- [ ] Run the focused web tests; expect assertions to fail on current emoji strings.
- [ ] Replace functional emoji with existing Lucide components, explicit tone/state props, and text. Remove the decorative `💪` from generated reminder copy.
- [ ] Keep all avatar/reward/badge/certificate emoji unchanged.
- [ ] Run focused tests and `pnpm typecheck`; expect pass.
- [ ] Commit: `fix(ui): replace illustrative emoji with icons`

## Task 7: Remove generated SVG and CSS-drawn scenery

**Files:**

- Delete: `apps/web/src/app/games/season-art.tsx`
- Modify: `apps/web/src/app/settings/Settings.tsx`
- Modify: `apps/web/src/app/app.css`
- Modify: `apps/web/src/app/learner/learner.css`
- Modify: `apps/web/src/app/games/games.css`
- Modify: any imports still pointing at `season-art.tsx`
- Modify: `apps/web/src/app/settings/settings-ai-parity.test.tsx`
- Modify: `apps/web/src/app/learner/GamesUx.test.tsx`

**Steps:**

- [ ] Add failing source assertions for the commented legacy `ThemeMark` SVG, select-arrow data SVG, hero/party inline SVG, CSS-drawn sky/cloud scenery, and remaining `season-art` imports.
- [ ] Run the focused tests; expect source assertions to fail.
- [ ] Delete the commented Settings SVG, use the current Lucide `ThemeMark`, return the select arrow to native browser rendering or a React/Lucide wrapper, and remove dead hero/party/sky art rules.
- [ ] Delete `season-art.tsx` after every consumer uses `season-visual.ts` and `ProductArt`.
- [ ] Run `pnpm typecheck` and focused tests; expect pass.
- [ ] Commit: `refactor(web): remove generated illustration code`

## Task 8: Add a permanent fake-art source gate

**Files:**

- Create: `scripts/verify-app-media.mjs`
- Create: `scripts/verify-app-media.test.mjs`
- Modify: `package.json`
- Modify: avatar/reward source lines only to add narrow `media-scan: allow-avatar-reward` annotations where needed

**Gate behavior:**

- Scan active `apps/web/src/app` source for illustrative `<svg`, `data:image`, removed art helper names/imports, CSS-drawn scenery selectors, and a curated set of pictographic emoji.
- Allow Lucide imports/components.
- Allow reward/avatar symbols only when the exact source line is preceded by `media-scan: allow-avatar-reward`; do not allow whole-file exclusions.
- Ignore tests and `research/seasonenglish`; tests separately prove runtime behavior.

**Steps:**

- [ ] Write failing verifier tests using temporary fixtures for prohibited SVG/data URL/emoji and narrow allowed annotations.
- [ ] Run `pnpm exec vitest run scripts/verify-app-media.test.mjs`; expect module-not-found failure.
- [ ] Implement `verify:app-media` and run it as part of root `build` after `verify:media`.
- [ ] Annotate only the deliberate avatar/reward lines and fix every other reported match.
- [ ] Run `pnpm verify:app-media`, `pnpm verify:media`, and `pnpm build`; expect pass.
- [ ] Commit: `test(web): prevent fake artwork regressions`

## Task 9: Run final functional and visual verification

**Files:**

- No product file is planned for this task. Any evidence-driven correction must name its exact file and receive its own focused regression test before editing.
- Store runtime output under ignored `.tmp/evidence/`.

**Steps:**

- [ ] Run `pnpm typecheck`; expect exit 0.
- [ ] Run `pnpm test`; expect exit 0 and no public network access.
- [ ] Run `pnpm build`; expect both media verifiers and production build to pass.
- [ ] Start the current 4175 app and smoke Entry, Onboarding, Survey, Settings, Lesson detail, Season Catch, and Season-rio at 390×827 and 1440×900.
- [ ] Confirm game controls, hitboxes, scoring, timers, game-over states, and source attribution still work.
- [ ] Confirm avatar selection and Manager/Learner reward/badge/certificate visuals are unchanged.
- [ ] Save screenshots/logs under `.tmp/evidence` only.
- [ ] Review `git diff --check`, `git status --short`, and the full branch diff.
- [ ] Commit any evidence-driven correction separately; otherwise do not create an empty commit.

## Plan Completion Gate

- [ ] Every manifest file exists, matches SHA-256, and has an official Kenney CC0 source page.
- [ ] No active fake/generated artwork remains outside line-scoped avatar/reward exemptions.
- [ ] GFT logo is the only brand mark; mascot is decorative product artwork, not a second logo.
- [ ] `pnpm typecheck`, `pnpm test`, and `pnpm build` pass.
- [ ] Both target viewports are visually checked.
- [ ] Only after both media plans are green may the branch proceed to final review and push to `origin/gftsaimedia-cpu`.
