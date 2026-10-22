# Learner Experience and Operator Controls Design

Date: 2026-10-22

## Objective

Make the learner experience start from real activity instead of seeded accomplishments, repair the game word-set lifecycle, show useful Vietnamese translations in Coach, and give Operators narrowly scoped control over the organisation-wide seasonal presentation and background music. Remove AI-provider and prompt editing from the Operator role. Keep the visual language consistent with the existing Season English interface.

## Confirmed product behaviour

- A learner must never see a submitted weekly practice unless that learner actually submitted it.
- The game hub starts empty. Games become available only after the learner explicitly chooses the current week's vocabulary or creates a custom set.
- Coach's expandable feedback shows a Vietnamese translation of Season's reply and a Vietnamese translation of every suggested next sentence.
- Operators can change the organisation-wide season/theme, playlist and music volume, but cannot configure AI providers or edit prompts.
- In automatic theme mode, the application follows real calendar time and changes without requiring a reload.
- Seasonal identity changes include colours, primary marks, game characters/items where supported, and a subtle repeating background pattern.
- The learner account chip shows a learner-role icon and the learner's CEFR level as a badge.

## 1. Coach translation data

Extend the Coach AI output with explicit translation fields rather than embedding translations in correction explanations:

- `replyTranslation`: Vietnamese translation of Season's complete reply.
- `suggestions[].translation`: Vietnamese translation of the suggested learner sentence.
- `suggestions[].explanation`: a short correction reason only.

The fields flow through the AI JSON schema, persisted turn feedback, contracts and repository adapters. The Coach UI receives the Season message text together with feedback and renders one collapsed disclosure:

1. `Season vừa nói` — Vietnamese translation of Season's message.
2. `Bạn có thể nói tiếp` — each English suggestion followed by its Vietnamese translation.
3. `Vì sao cần sửa` — correction reasons, only when genuine errors exist.

Old stored turns remain readable. Missing translation fields produce no fabricated translation and are labelled as older feedback rather than failing rendering.

## 2. Remove seeded learner achievements

The deterministic demo seed currently inserts a reviewed `Weekly sample` submission and a published 15-word game set. These rows make an untouched learner look as though they have already completed activity.

Remove those two inserts and add narrowly targeted cleanup for their fixed demo IDs so an existing local database is corrected on the next seed/migration. Do not delete real submissions or learner-created game sets.

Weekly practice state continues to be derived from lesson completion and real `practice_submissions` records. The reviewed screen is reachable only after a real submission.

## 3. Game word-set lifecycle

Change `GameHubView.wordSet` to nullable and keep the hub available when no set exists.

The lifecycle is:

1. Empty hub: show topic creation, `Dùng từ vựng tuần này`, and a clear message that a set is required. Do not render active game links.
2. Weekly set: a dedicated action builds a learner-owned set from vocabulary in the current published weekly lessons. It runs only when the learner clicks the action.
3. Custom set: AI generates a level-appropriate set for the requested topic.
4. Delete: retire the active learner set and return to the empty hub.

Use separate API actions for `use weekly vocabulary` and `delete`. They must no longer call the same DELETE endpoint. Direct game routes return a clear unavailable state when no active set exists instead of crashing or silently falling back to seed data.

## 4. Organisation experience configuration

Introduce a narrowly scoped organisation-experience contract and endpoint shared by Manager and Operator:

```text
theme: auto | spring | summer | autumn | winter | tet | midautumn | christmas
backgroundMusic:
  enabled: boolean
  playlistId: string
  customUrl: string
  volume: 0..100
```

- All authenticated roles can read the effective configuration.
- Manager and Operator can update only these experience fields.
- Learners cannot update organisation configuration.
- Existing Manager settings remain authoritative for unrelated programme, assessment, reminder and webhook fields.

This removes the current over-broad pattern where Operator saves the complete Manager settings object.

## 5. Real-time automatic seasonal theme

Keep one canonical calendar resolver for automatic mode:

- Tết: seven days before through ten days after the configured/known holiday window.
- Mid-Autumn: five days before through five days after.
- Christmas/New Year: 15 December through 2 January.
- Spring: February-April.
- Summer: May-July.
- Autumn: August-October.
- Winter: November-January.

The client resolves the current theme on boot and schedules the next refresh at the next local calendar boundary. It also refreshes when the tab becomes visible, protecting against laptop sleep. Manual themes remain fixed until changed.

## 6. Seasonal patterns

Create original seamless transparent line-art pattern assets for spring, summer, autumn, winter, Tết, Mid-Autumn and Christmas/New Year. The references supplied by the user establish the direction: hand-drawn seasonal objects, sparse repetition and one-colour outlines.

Patterns are decorative only:

- low opacity over the existing page background;
- no text, logos or third-party artwork;
- no effect on card contrast or content layout;
- disabled under reduced-transparency/high-contrast fallbacks where needed;
- compact optimized assets, loaded only for the active theme.

The corresponding theme also changes existing theme marks and supported seasonal game characters/items.

## 7. Curated free music

Provide built-in playlist choices by season and study period: morning, afternoon and evening. Tracks should be light, focused and moderately energetic; avoid sleepy ambient music and stereotypical slow lofi.

Only use sources with explicit reuse/streaming permission and stable embeddable URLs. Store source, licence and attribution metadata with each preset. Do not download or redistribute music when the licence permits streaming/embedding but not redistribution.

Operator controls:

- preset selector grouped by season and time of day;
- custom YouTube video/playlist URL as an override;
- organisation-wide volume slider;
- save and preview;
- restore the recommended automatic preset.

Automatic music selection follows the active season and the learner's local study period. It never starts during listening exercises or text-to-speech playback and still honours each device's personal music on/off preference.

## 8. Operator permissions and navigation

Remove from Operator:

- AI provider, model and credential fields;
- AI connection testing controls;
- Prompt & rubric card;
- `/op/prompts` route and links;
- provider-settings and prompt-write API permissions.

Manager retains AI and prompt administration. Direct Operator requests to those APIs return forbidden. Operator settings show only operational settings, organisation appearance/music and the read-only account overview.

## 9. Learner account badge

Pass the learner's current CEFR from the loaded profile into the application shell. In the account chip render:

- a learner-role icon beside `Người học`;
- a compact level badge (`A1` through `C1`);
- existing avatar, name, audio controls and logout behaviour unchanged.

The compact/mobile layout must not overflow when the learner name is long.

## 10. Error handling and compatibility

- Missing old Coach translations do not break old messages.
- Missing weekly vocabulary shows an actionable empty state.
- A failed preset preview does not overwrite the saved music configuration.
- Invalid or unavailable custom music URLs return a user-facing validation message.
- API authorization is enforced server-side; hiding controls is not considered sufficient.
- Existing custom learner word sets and real weekly submissions are preserved.

## 11. Verification

Implementation follows test-first development. Required evidence:

- AI schema and prompt tests for both translation fields.
- Repository/API integration tests proving an untouched learner has no fake submission or game set.
- Game integration tests for empty, weekly-set, custom-set and delete states.
- Authorization tests proving Operator cannot read/write provider credentials or prompts, while Manager still can.
- Organisation-experience tests proving Operator can save theme, preset/custom music and volume for the organisation and Learner can read but not write them.
- Fake-clock tests crossing midnight and seasonal boundaries without a page reload.
- UI tests for Operator settings, game gating, Coach translations and learner role/level badges.
- Browser verification on local for Coach, weekly practice, games, Operator settings and learner header.
- Music preview verification confirms the saved preset/URL and volume reach the player; external provider availability is reported separately from application correctness.

