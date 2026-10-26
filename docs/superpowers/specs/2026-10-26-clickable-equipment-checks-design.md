# Clickable equipment checks

## Intent

Let learners start either preparation check from the matching device card, not only from the adjacent text button. Clicking the Headphones card must behave exactly like **Nghe thử**; clicking the Micro card must behave exactly like **Kiểm tra micro**. A learner only needs to use one control in each pair because both controls share the same handler and status.

## Scope

- Preserve both existing text buttons and all current preparation/start behavior.
- Turn each device card into a keyboard-accessible button with a clear accessible name.
- Preserve the current shape, size, spacing, colours, and icon/text layout of both device cards.
- Reuse `checkSound` and `checkMicrophoneForTest`; do not introduce duplicate state or a second check path.
- Keep the microphone card unavailable while its check is already running.
- Do not add a requirement to complete either or both checks before starting the assessment.

## Approach

Considered attaching click handlers to the existing `span` elements and replacing them with semantic buttons. Semantic buttons were selected because they provide keyboard activation, focus behavior, and correct accessibility semantics without custom key handlers. Focused component tests will verify that each card invokes the same behavior and updates the same status as its text-button counterpart.
