// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { AssessmentReviewOverviewView } from "@e4s/contracts";
import { OperatorDashboard } from "./Dashboard.js";
import { adaptAssessmentOverview } from "./adapters.js";

afterEach(cleanup);

const overview = {
  pendingAssessments: [{
    attemptId: "attempt-1", learnerId: "learner-1", learnerName: "Lan", kind: "placement",
    title: "Bài test đầu vào", submittedAt: "2026-10-15T08:00:00.000Z",
    sectionScores: { listening: 14, reading: 16, writing: 13, speaking: 12 }, suggestedLevel: "A2"
  }],
  pendingLevelUp: [],
  approvedLearners: [],
  unassessedLearners: [],
  levelSignals: { windowDays: 14, ready: [], weak: [], inFlow: [] },
  topicReports: []
} satisfies AssessmentReviewOverviewView;

describe("Operator assessment rescore action", () => {
  it("shows the real rescore button for a pending assessment and routes the click", async () => {
    const user = userEvent.setup();
    const onRescore = vi.fn();
    const view = adaptAssessmentOverview(overview, { aiConnected: true, openAppeals: 0 });
    expect(view.pending[0]?.canRescore).toBe(true);
    render(<OperatorDashboard view={view} actions={{
      onResolveTopicReport: vi.fn(), onApprovePlacement: vi.fn(), onViewTest: vi.fn(), onRescore,
      onDeleteLearner: vi.fn(), onApproveLevelRequest: vi.fn(), onRejectLevelRequest: vi.fn(), onViewChallenge: vi.fn(),
      onDemote: vi.fn(), onChangeLevel: vi.fn(), onEditGoal: vi.fn(), onViewProfile: vi.fn(), onSetLevelDirect: vi.fn(),
      onOpenAppeals: vi.fn(), onOpenSettings: vi.fn(), onOpenWeeks: vi.fn(), onOpenLevelForms: vi.fn()
    }} />);
    await user.click(screen.getByRole("button", { name: "Chấm lại bằng AI" }));
    expect(onRescore).toHaveBeenCalledWith("attempt-1");
  });

  it("shows a retryable AI failure instead of pretending the attempt was never scored", () => {
    const view = adaptAssessmentOverview(overview, { aiConnected: true, openAppeals: 0 });
    Object.assign(view.pending[0]!, { aiScoringStatus: "failed", aiScoringErrorCode: "AI_OUTPUT_INVALID" });
    render(<OperatorDashboard view={view} actions={{
      onResolveTopicReport: vi.fn(), onApprovePlacement: vi.fn(), onViewTest: vi.fn(), onRescore: vi.fn(),
      onDeleteLearner: vi.fn(), onApproveLevelRequest: vi.fn(), onRejectLevelRequest: vi.fn(), onViewChallenge: vi.fn(),
      onDemote: vi.fn(), onChangeLevel: vi.fn(), onEditGoal: vi.fn(), onViewProfile: vi.fn(), onSetLevelDirect: vi.fn(),
      onOpenAppeals: vi.fn(), onOpenSettings: vi.fn(), onOpenWeeks: vi.fn(), onOpenLevelForms: vi.fn()
    }} />);
    expect(screen.getByText("AI chấm lỗi — có thể thử lại")).toBeInTheDocument();
    expect(screen.queryByText("Chưa chấm AI")).not.toBeInTheDocument();
  });
});
