# Weekly AI Language and Lesson Presentation Parity

## Intent

Prevent mixed-language or incomplete weekly AI lessons from reaching review/publication, while preserving valid generated components and making Operator preview match the Learner lesson presentation.

## Constraints

- B1, B2 and C1 learner-facing content is English; only vocabulary meanings may be Vietnamese.
- A1 and A2 may use Vietnamese guidance.
- One level job generates all five days. Validation may trigger at most one targeted repair round; valid components remain unchanged.
- Remaining serious findings keep the set draft/partial and block review/publication.
- Operator and Learner share presentation, ordering, headings, CEFR language, fallbacks, visibility and media behavior. Only learner progress/answers and operator controls differ.
- Existing published sets are not rewritten. No Docker is used.

## Approach

Create a shared, read-only lesson presentation component and shared presentation model. Learner and Operator provide the same lesson parts and CEFR to it; each screen wraps it with role-specific state and controls. Validate the persisted payload at generation and publication boundaries rather than translating or filling bad model output in a normalizer.

Alternatives rejected: sharing only copy helpers still leaves two render trees that can drift; embedding the full Learner screen in Operator couples preview to learner progress and submission state.

## Evidence and expected behavior

The historical B1 set is deterministic seed content and is already mixed before rendering. Current prompts also require Vietnamese exercise translations for every CEFR, publication validation ignores language, and Operator preview hardcodes Vietnamese. The change addresses each first wrong layer independently and leaves historical published content live until a new draft is approved.
