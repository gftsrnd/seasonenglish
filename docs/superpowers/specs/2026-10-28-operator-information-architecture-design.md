# Operator information architecture design

## Intent

Make the Operator area easier to scan and remove navigation that repeats the global menu. Keep a separate, persistent operations switcher for Manager because Manager inspects several Operator screens in read-only mode.

## Goals

- Collapse each pending placement review under the learner's name; expanding one reveals the existing scores, rationale, profile and actions.
- Remove `← Vận hành` and `← Duyệt trình độ` links from Operator screens.
- Rename the Operator global item `Đọc mẫu` to `Bài tuần`.
- Replace `Đề lên mức` in the Operator global menu with `Bài kiểm tra`.
- Make `Bài kiểm tra` one page with horizontal tabs `Đề đầu vào` and `Đề lên mức`.
- Move the existing assessment-review tab `Bài test` into `Bài kiểm tra` as `Đề đầu vào`.
- Standardize the remaining `Bài tuần` tabs as `Đề bài tuần`, `Bài đã nộp`, `Phản hồi AI Coach`, `Kháng nghị`, and `Lịch sử làm bài`.
- Show a persistent horizontal read-only operations switcher only for Manager, so Manager can move between operational screens without returning to the operations overview.

## Related verification and follow-up

- Reverify C-013 on the current local build: A1-A2 learner lesson framing and guidance are Vietnamese; B1+ framing and guidance are English; vocabulary meanings remain Vietnamese.
- Implement the previously selected reminder design with two independent actions: `Gửi email` and `Gửi Base.vn`, each with its own status and history. No automatic double-send.

## Non-goals

- Do not change the assessment or lesson-generation APIs for the navigation reorganization.
- Do not give Operator access to Prompt & rubric settings.
- Do not restore the horizontal operations switcher for Operator.
- Do not combine email and Base.vn into one send action.

## Chosen approach

Use route-compatible composition rather than duplicating business logic. The existing review and level-form components stay responsible for their data and actions; a new `Bài kiểm tra` container provides the two horizontal tabs and routes to the existing content. The weekly-review screen removes the assessment tab. Manager receives a manager-only persistent operations switcher.

This was chosen over label-only changes because label-only changes would leave the two test types split across unrelated screens and would not satisfy the requested horizontal test navigation.

## Acceptance criteria

1. Pending learners are collapsed by default and identifiable by name; expanding shows the complete existing review card.
2. No Operator page renders route-back links to `Vận hành` or `Duyệt trình độ`.
3. Operator global navigation shows `Bài tuần` and `Bài kiểm tra`.
4. `Bài tuần` has exactly the five standardized tabs and no assessment/test tab.
5. `Bài kiểm tra` has `Đề đầu vào` and `Đề lên mức`; both existing workflows remain usable.
6. Manager operational screens show a persistent switcher; Operator screens do not.
7. C-013 automated tests and a local UI smoke test pass on the current build.
8. Manager reminder UI exposes separate email and Base.vn send buttons with independent results/history, and each channel can be tested separately.

