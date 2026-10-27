# Design QA

## Scope

- Operator lesson matrix and lesson detail
- Shared Operator/Learner vocabulary cards
- Manual lesson editor
- Learner study and exercise sections

## Automated evidence

- Shared vocabulary card rendering, image states, audio controls, relation chips: passed.
- Learner grammar/example audio and lesson media: passed.
- Manual editor vocabulary rows and part-of-speech field: passed.
- Confirmation modals and lesson-set operations: passed.
- Responsive overflow protections and production CSS bundle: built successfully.

## Visual review

- Visual source of truth: the attached prototype captures, especially
  `C:/Users/TT5~1.01A/AppData/Local/Temp/codex-clipboard-bb69ec75-e09d-44b2-bb29-23e0cbef5fa6.png`,
  `C:/Users/TT5~1.01A/AppData/Local/Temp/codex-clipboard-fa35a1e7-3aad-4ede-817a-741f48523fc5.png`,
  `C:/Users/TT5~1.01A/AppData/Local/Temp/codex-clipboard-b739a5e0-56bc-4930-8524-b00f0bf192b2.png`, and
  `C:/Users/TT5~1.01A/AppData/Local/Temp/codex-clipboard-c3e6d537-d645-4f1d-97d6-40940d2431ef.png`.
- Browser implementation checked live at `http://127.0.0.1:4175/op/lessons/1/A1` in the Codex in-app browser (narrow 320 px-class viewport).
- Authenticated Operator review passed for the pale concise objective, unnumbered pale instruction block, compact vocabulary media, word/type/IPA/meaning hierarchy, orange umbrella control, green synonyms, red antonyms, and gray grammar/pronunciation blocks.
- Learner exercise review now uses six low-saturation skill surfaces (Nghe, Đọc, Viết, Từ loại, Dùng từ, Nói) instead of one long white sheet; the redundant six-part overview is removed.
- Learner/Operator speaking parity is protected by tests: the Vietnamese requirement and English model sentence remain separate, while the model and its audio control share one card.
- Interaction review passed: umbrella, synonym, antonym, and word-family controls open centered detail lists whose words are individually playable; the sticky close action remains in the modal header; Learn/Exercise tabs switch correctly.
- Responsive review passed after moving the meaning to a full-width row and preventing the word/audio header from squeezing Vietnamese text into a one-character column.
- Real image resolution passed through the API and UI: Pixabay is preferred, Openverse and Wikimedia are resilient fallbacks, and every accepted image is a bitmap with source/licence metadata; diagram/timeline/icon-like results are rejected.
- Real configured AI runtime review passed without saving generated lessons: 5 lessons, 5 concise objectives, one-sentence grammar explanations, and 15/15 unique vocabulary words after duplicate-repair hardening.
- The repository documents that the original HTML prototype is not shipped with the runtime, so the attached prototype captures were used for the fidelity comparison rather than inventing an unavailable local prototype URL.

## Result

**PASSED** — authenticated browser comparison, responsive interaction review, focused tests, real AI/API generation, attributed image resolution, and production build all completed successfully.

## 2026-10-23 — Seasonal settings and background music

- The eight seasonal themes render as a balanced 4×2 grid on wide screens and 2×4 on narrow screens.
- The learner home no longer renders the programme or weekly-topic context cards; the highlighted “Hôm nay học gì nào?” heading leads directly into the lesson content.
- The music picker is a custom theme-coloured dropdown, not the Windows-native blue selection menu, and displays track titles rather than time-of-day labels.
- The volume track and thumb use the active E4S theme colour; the source/licence line is intentionally hidden from the product UI while attribution remains in `docs/music-sources.md`.
- `Soft Corporate` is served locally as `audio/ogg` (HTTP 200) to remove Wikimedia availability/rate-limit failures. YouTube video and playlist URLs are converted to an autoplay-capable YouTube embed player instead of being passed to an HTML audio element.
- Browser preview reached the `playing` state at volume 55/100 with no console errors. Focused web tests passed (127/127), web typecheck passed, and the production Docker web image rebuilt successfully.

## 2026-10-27 — Appeals, pending weekly submission, and game guidance

- The Operator appeal screen was checked live in the authenticated local Docker app. Lesson-part appeals now separate the prompt, learner answer, reference answer, previous feedback, and appeal reason into labeled blocks; actions remain at the bottom of each white review card.
- The local scenario data includes one real ungraded weekly submission for Trương Hải Yến. The Operator screen shows `Chưa chấm`, three manual rubric inputs, a feedback field, `Chấm bằng AI`, and `Lưu chấm tay`.
- The vocabulary game hub was checked as learner Trương Hải Yến. Arena copy is reduced to one purpose sentence plus the B1 unlock condition.
- The Word Scramble introduction was checked live: one goal, three short steps, two compact metadata chips, and two text-only actions. No decorative action icons or long explanatory paragraphs remain.
- Focused UI tests passed (58/58), local scenario integration tests passed (14/14), web typecheck passed, and the local Docker web/API/migrate images built successfully.

**PASSED** — authenticated desktop and narrow-layout checks completed for all three requested changes.

## 2026-10-27 — Game guidance, Operator review clarity, and scoring parity

- Visual references reviewed: `C:/Users/TT5~1.01A/AppData/Local/Temp/codex-clipboard-30c7aed2-ae4e-42e9-9f29-a36861377042.png`, `C:/Users/TT5~1.01A/AppData/Local/Temp/codex-clipboard-950772c6-a092-49f9-a6b7-eed2f3deb0cf.png`, and `C:/Users/TT5~1.01A/AppData/Local/Temp/codex-clipboard-9a9dec1e-6f99-4275-b0e1-eb72d64838ef.png`.
- The game introduction was checked live at `/games/scramble` in the local Docker app. The three instructions are now separate responsive tiles with large purposeful SVG icons, while score rules and the active word set use compact icon-backed metadata.
- The Operator submissions screen was checked live with a real ungraded local submission. Task, guidance, required vocabulary, learner answer, status, AI grading, manual rubric inputs, feedback, and the explicit manual-save action are visually separated.
- The Operator appeals screen was checked live. Review cards no longer use the requested-to-remove coloured left rail.
- Game scoring now sends the same deterministic attempt seed used to prepare the learner's word set to the API, preventing the server from grading a different subset after frontend shuffling.
- Fresh verification: domain engagement tests 9/9, API engagement integration 17/17, local scenario integration 14/14, focused web tests 70/70, API and web typechecks passed, and Docker API/Web production builds completed. API readiness and the web route both returned HTTP 200.

final result: passed
