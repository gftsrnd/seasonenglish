// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { AssessmentRetakeStatus, AssessmentReviewOverviewView } from "@e4s/contracts";
import { OperatorDashboard } from "./Dashboard.js";
import { adaptAssessmentOverview } from "./adapters.js";
import type { OperatorDashboardActions } from "./types.js";

afterEach(cleanup);

const overview = (retry: AssessmentRetakeStatus, pending?: { isPlacementRetake: boolean; placementRetake: AssessmentRetakeStatus }) => ({
  pendingAssessments: pending ? [{
    attemptId: "attempt-9", learnerId: "learner-9", learnerName: "Minh", kind: "placement" as const, title: "Test đầu vào",
    submittedAt: "2026-11-16T03:00:00.000Z", sectionScores: { listening: 10, reading: 20, writing: 10, speaking: 10 }, suggestedLevel: "B1" as const, ...pending
  }] : [],
  pendingLevelUp: [],
  approvedLearners: [],
  unassessedLearners: [],
  retryLearners: [{ learnerId: "learner-1", learnerName: "Lan", profileComplete: true, lifecycle: "needs_retry" as const, placementRetake: retry }],
  levelSignals: { windowDays: 14 as const, ready: [], weak: [], inFlow: [] },
  topicReports: []
}) satisfies AssessmentReviewOverviewView;

const actions = (overrides: Partial<OperatorDashboardActions> = {}): OperatorDashboardActions => ({
  onApprovePlacement: vi.fn(), onViewTest: vi.fn(), onRescore: vi.fn(),
  onDeleteLearner: vi.fn(), onApproveLevelRequest: vi.fn(), onRejectLevelRequest: vi.fn(), onViewChallenge: vi.fn(),
  onDemote: vi.fn(), onChangeLevel: vi.fn(), onEditGoal: vi.fn(), onViewProfile: vi.fn(), onSetLevelDirect: vi.fn(),
  onOpenAppeals: vi.fn(), onOpenSettings: vi.fn(), onOpenWeeks: vi.fn(), onOpenLevelForms: vi.fn(),
  onGrantPlacementRetake: vi.fn(), onRetryPlacementOnce: vi.fn(),
  ...overrides
});

describe("Operator placement retake status", () => {
  it("offers 'Cho thi lại' once for a sent-back learner, next to the manual placement", async () => {
    const user = userEvent.setup();
    const onGrantPlacementRetake = vi.fn();
    render(<OperatorDashboard view={adaptAssessmentOverview(overview("not_granted"), { aiConnected: true, openAppeals: 0 })} actions={actions({ onGrantPlacementRetake })} />);
    expect(screen.getByTestId("retake-learner-1")).toHaveTextContent("Chưa cho thi lại");
    await user.click(screen.getByRole("button", { name: "Cho thi lại" }));
    expect(onGrantPlacementRetake).toHaveBeenCalledWith("learner-1");
    expect(screen.getByRole("button", { name: "Đánh giá thủ công" })).toBeInTheDocument();
  });

  it("shows granted and used states without a second grant button", () => {
    render(<OperatorDashboard view={adaptAssessmentOverview(overview("granted"), { aiConnected: true, openAppeals: 0 })} actions={actions()} />);
    expect(screen.getByTestId("retake-learner-1")).toHaveTextContent("Đã duyệt thi lại");
    expect(screen.queryByRole("button", { name: "Cho thi lại" })).not.toBeInTheDocument();
    cleanup();
    render(<OperatorDashboard view={adaptAssessmentOverview(overview("used"), { aiConnected: true, openAppeals: 0 })} actions={actions()} />);
    expect(screen.getByTestId("retake-learner-1")).toHaveTextContent("Đã dùng lượt thi lại");
    expect(screen.getByRole("button", { name: "Xếp lớp" })).toBeInTheDocument();
  });

  it("lets the operator send a pending placement back with the one retake, and marks the retake attempt as the final placement", async () => {
    const user = userEvent.setup();
    const onRetryPlacementOnce = vi.fn();
    render(<OperatorDashboard view={adaptAssessmentOverview(overview("granted", { isPlacementRetake: false, placementRetake: "not_granted" }), { aiConnected: true, openAppeals: 0 })} actions={actions({ onRetryPlacementOnce })} />);
    const pending = screen.getByLabelText("Chờ duyệt Minh");
    await user.click(within(pending).getByRole("button", { name: "Cho thi lại" }));
    expect(onRetryPlacementOnce).toHaveBeenCalledWith("attempt-9");
    cleanup();
    render(<OperatorDashboard view={adaptAssessmentOverview(overview("granted", { isPlacementRetake: true, placementRetake: "used" }), { aiConnected: true, openAppeals: 0 })} actions={actions()} />);
    const final = screen.getByLabelText("Chờ duyệt Minh");
    expect(within(final).getByRole("note")).toHaveTextContent("đây là quyết định cuối cùng");
    expect(within(final).queryByRole("button", { name: "Cho thi lại" })).not.toBeInTheDocument();
  });
});
