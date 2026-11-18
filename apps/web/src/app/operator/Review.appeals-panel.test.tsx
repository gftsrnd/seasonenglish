// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { OperatorReview } from "./Review.js";
import type { OperatorReviewActions, OperatorReviewView } from "./types.js";

afterEach(cleanup);
const view: OperatorReviewView = {
  activeTab: "appeals", counts: { subs: 0, coach: 0, weekly: 0, appeals: 3, attempts: 0, tests: 0 },
  submissions: [], coachTurns: [], weeklyPractices: [], attempts: [], tests: [], aiConnected: true,
  appeals: [
    { id: "a", learnerName: "Lan", at: "18/11/2026", reason: "Check the answer", status: "pending" },
    { id: "b", learnerName: "Lan", at: "17/11/2026", reason: "Old appeal", status: "accepted", decidedSummary: "Accepted earlier" },
    { id: "c", learnerName: "Minh", at: "18/11/2026", reason: "Please review", status: "pending" }
  ]
};
function setup(readOnly = false, appeals = view.appeals) {
  const actions: OperatorReviewActions = { onTabChange: vi.fn(), onMarkSubmission: vi.fn(), onMarkCoachTurn: vi.fn(), onGradeAi: vi.fn(), onGradeManual: vi.fn(), onDecideAppeal: vi.fn(), onViewTest: vi.fn() };
  const result = render(<OperatorReview view={{ ...view, appeals }} actions={actions} readOnly={readOnly} />);
  return { ...result, actions };
}

describe("appeals shared review panel", () => {
  it("places every learner group inside one Season-style card and preserves decisions", () => {
    const { container, actions } = setup();
    const panel = container.querySelector(".card.operator-review-panel") as HTMLElement;
    expect(panel).not.toBeNull();
    const list = panel.querySelector(".operator-coach-list")!;
    const groups = list.querySelectorAll(":scope > details.operator-review-learner-group");
    expect(groups).toHaveLength(2);
    expect(panel.querySelectorAll(".card")).toHaveLength(0);
    expect(groups[0]).toHaveTextContent("2 kháng nghị · 1 chờ xử lý");
    fireEvent.click(within(groups[0] as HTMLElement).getByText("Lan"));
    fireEvent.click(within(groups[0] as HTMLElement).getByRole("button", { name: "Chấp nhận kháng nghị" }));
    expect(actions.onDecideAppeal).toHaveBeenCalledWith("a", true);
    expect(panel).toHaveTextContent("Accepted earlier");
  });

  it("keeps the same grouped card for read-only managers with disabled decisions", () => {
    const { container } = setup(true);
    expect(container.querySelectorAll(".card.operator-review-panel")).toHaveLength(1);
    fireEvent.click(screen.getByText("Minh"));
    const appeal = screen.getByRole("article", { name: "Kháng nghị phần Bài kiểm tra của Minh" });
    expect(within(appeal).getByRole("button", { name: "Chấp nhận kháng nghị" })).toBeDisabled();
    expect(within(appeal).getByRole("button", { name: "Giữ nguyên kết quả" })).toBeDisabled();
  });

  it("preserves the empty appeal message", () => {
    setup(false, []);
    expect(screen.getByText(/Chưa có kháng nghị nào/)).toBeInTheDocument();
  });
});
