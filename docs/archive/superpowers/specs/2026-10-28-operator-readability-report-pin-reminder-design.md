# Operator readability, report, PIN, and reminder design

## Intent

Finish the reported Manager and Operator defects without changing their data workflows. Operator review screens use the approved neutral-surface direction; Manager report printing, learner PIN reveal, and reminder sending become explicit and predictable.

## Chosen visual direction

- Use one warm neutral content surface for expanded cards.
- Reserve sage/beige tints for group headers, learner answers, warnings, and semantic status only.
- Long prose uses a readable line height and visible spacing between speaker, feedback, rubric, and suggestions.
- Nested result/editor blocks have clear outer margins so they never touch their parent card.
- Promotion-form groups keep the same neutral hierarchy and restore card padding, row spacing, and action alignment.

## Functional requirements

1. The printable Manager report is portrait A4, stays inside the printable width, does not emit a blank patterned page, and keeps report header/footer content intact across page breaks.
2. A Manager can reveal the actual current six-digit learner PIN. PINs remain hashed for authentication and are stored separately in encrypted recoverable form. Operator cannot access the reveal endpoint. Legacy learner accounts without recoverable PIN data show an honest unavailable state until the PIN is reset.
3. Sending one reminder email and sending all reminder emails both require a confirmation step that names the recipient or recipient count. Cancelling does not call the send handler.
4. The bulk email action sits with the reminder list controls instead of being crowded into the page title.

## Non-goals

- Do not expose staff passwords.
- Do not change reminder eligibility or delivery providers.
- Do not redesign unrelated Manager or Operator pages.
- Do not alter learner progress or assessment data.

## Acceptance criteria

- Bài tuần, Bài đã nộp, Phản hồi AI Coach, Lịch sử làm bài, and Đề lên mức share a quiet neutral hierarchy with readable spacing.
- Print CSS declares A4 portrait and constrains all report content to the printable box; no decorative page background remains in print.
- Clicking “Hiện PIN” fetches and displays the stored current learner PIN without resetting it.
- Every email send path shows a confirmation dialog before invoking its handler.

