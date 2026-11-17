// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { AssessmentLevelUpOverrideSummary, AssessmentReviewOverviewView } from "@e4s/contracts";
import { OperatorDashboard } from "./Dashboard.js";
import { adaptAssessmentOverview } from "./adapters.js";
import type { OperatorDashboardActions } from "./types.js";

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

const overview = (levelUpOverride: AssessmentLevelUpOverrideSummary | null, currentLevel: "A2" | "C1" = "A2") => ({
  pendingAssessments: [],
  pendingLevelUp: [],
  approvedLearners: [{ learnerId: "learner-1", learnerName: "Lan", currentLevel, placementScore: 62, monthlyGoal: null, levelUpOverride }],
  unassessedLearners: [],
  levelSignals: { windowDays: 14, ready: [], weak: [], inFlow: [] },
  topicReports: []
}) satisfies AssessmentReviewOverviewView;

const actions = (onToggleLevelUpOverride = vi.fn()): OperatorDashboardActions => ({
  onApprovePlacement: vi.fn(), onViewTest: vi.fn(), onRescore: vi.fn(),
  onDeleteLearner: vi.fn(), onApproveLevelRequest: vi.fn(), onRejectLevelRequest: vi.fn(), onViewChallenge: vi.fn(),
  onDemote: vi.fn(), onChangeLevel: vi.fn(), onEditGoal: vi.fn(), onViewProfile: vi.fn(), onSetLevelDirect: vi.fn(),
  onOpenAppeals: vi.fn(), onOpenSettings: vi.fn(), onOpenWeeks: vi.fn(), onOpenLevelForms: vi.fn(),
  onToggleLevelUpOverride
});

const granted = { targetLevel: "B1" as const, reason: "Kiểm thử", grantedBy: "Hà", grantedAt: "2026-11-12T08:00:00.000Z" };

describe("Operator approved learner: level-up exception", () => {
  it.each([false, true])("shows the monthly goal beside the edit action in the approved list, compact %s", async (compact) => {
    vi.stubGlobal("matchMedia", vi.fn(() => ({ matches: compact, addEventListener: vi.fn(), removeEventListener: vi.fn() })));
    const user = userEvent.setup();
    const callbacks = actions();
    const data = overview(null);
    const source = { ...data, approvedLearners: data.approvedLearners.map(learner => ({ ...learner, monthlyGoal: "Luyện họp nhóm" })) };
    render(<OperatorDashboard view={adaptAssessmentOverview(source, { aiConnected: true, openAppeals: 0 })} actions={callbacks} />);
    const row = within(screen.getByTestId("approved-learner-1"));
    if (compact) await user.click(row.getByText("Thao tác", { exact: true }));
    if (!compact) expect(screen.getByRole("columnheader", { name: "Mục tiêu tháng" })).toBeInTheDocument();
    expect(row.getByText("Luyện họp nhóm")).toBeVisible();
    await user.click(row.getByRole("button", { name: /^Mục tiêu$/u }));
    expect(callbacks.onEditGoal).toHaveBeenCalledWith("learner-1");
    expect(row.getByRole("button", { name: "Hồ sơ" })).toBeVisible();
  });

  it("offers a short 'Thi lên mức' button next to 'Đổi level' when not yet allowed", async () => {
    const user = userEvent.setup();
    const onToggle = vi.fn();
    render(<OperatorDashboard view={adaptAssessmentOverview(overview(null), { aiConnected: true, openAppeals: 0 })} actions={actions(onToggle)} />);
    const row = screen.getByTestId("approved-learner-1");
    const button = within(row).getByRole("button", { name: "Cho phép thi lên mức" });
    expect(button).toHaveTextContent(/^Thi lên mức$/);
    expect(button).toHaveAttribute("title", "Cho phép thi lên mức");
    expect(button.previousElementSibling).toHaveTextContent("Đổi level");
    expect(within(row).queryByText("Đã mở thi")).not.toBeInTheDocument();
    await user.click(button);
    expect(onToggle).toHaveBeenCalledWith("learner-1", true);
  });

  it("shows the 'Đã mở thi' badge and a 'Huỷ mở thi' button once allowed", async () => {
    const user = userEvent.setup();
    const onToggle = vi.fn();
    render(<OperatorDashboard view={adaptAssessmentOverview(overview(granted), { aiConnected: true, openAppeals: 0 })} actions={actions(onToggle)} />);
    const row = screen.getByTestId("approved-learner-1");
    expect(within(row).getByText("Đã mở thi").closest("[title]")).toHaveAttribute("title", "Đã mở thi lên mức cho học viên này");
    expect(within(row).queryByRole("button", { name: "Cho phép thi lên mức" })).not.toBeInTheDocument();
    const revoke = within(row).getByRole("button", { name: "Huỷ cho phép thi lên mức" });
    expect(revoke).toHaveTextContent(/^Huỷ mở thi$/);
    await user.click(revoke);
    expect(onToggle).toHaveBeenCalledWith("learner-1", false);
  });

  it("disables the button for C1 learners", () => {
    render(<OperatorDashboard view={adaptAssessmentOverview(overview(null, "C1"), { aiConnected: true, openAppeals: 0 })} actions={actions()} />);
    expect(screen.getByRole("button", { name: "Cho phép thi lên mức" })).toBeDisabled();
  });

  it("is view-only for read-only (Manager) screens: badge, no toggle", () => {
    render(<OperatorDashboard readOnly view={adaptAssessmentOverview(overview(granted), { aiConnected: true, openAppeals: 0 })} actions={actions()} />);
    const row = screen.getByTestId("approved-learner-1");
    expect(within(row).getByText("Đã mở thi")).toBeInTheDocument();
    expect(within(row).queryByRole("button", { name: /thi lên mức/i })).not.toBeInTheDocument();
  });
});
