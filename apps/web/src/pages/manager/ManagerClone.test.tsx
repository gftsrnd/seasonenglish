// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ManagerOperationsView, ManagerProgressView, ManagerRemindersView, ManagerReportView } from "@e4s/contracts";
import { ManagerOperations } from "./Operations.js";
import { ManagerProgress } from "./Progress.js";
import { ManagerReminders } from "./Reminders.js";
import { ManagerReport } from "./Report.js";
import { ManagerRewardPreview } from "./Rewards.js";

afterEach(cleanup);

const progress: ManagerProgressView = {
  organizationName: "GFT Demo", currentWeek: 1, pilotWeeks: 2,
  summary: { learnerCount: 1, activeLearnersThisWeek: 1, completedLessons: 1, pendingAssessments: 0, completedLearners: 1, comparableLearners: 0, improvedLearners: 0, surveyCount: 0, satisfactionAverage: null },
  learners: [{ learnerId: "learner-1", learnerName: "Học viên Demo", cefr: "A2", completedLessons: 1, totalLessonsThisWeek: 5, sessionsThisWeek: 3, coachTurnsThisWeek: 2, weeklyPracticeScore: null, weeklyPracticeStatus: "not_submitted", rewardPoints: 20, earnedBadges: ["first"], placementScore: 52, finalScore: null, missedDays: 0, lastActivityAt: "2026-10-14T09:00:00.000Z" }]
};

const operations: ManagerOperationsView = {
  organizationName: "GFT Demo", currentWeek: 1, pilotWeeks: 2,
  content: { draft: 0, inReview: 0, published: 1 }, queues: { assessmentReview: 0, practiceReview: 0 }, automation: { pendingJobs: 0, aiFailures: 0 }, recentActivity: [],
  operators: [{ operatorId: "op-1", operatorName: "Vận hành Demo", byWeek: [{ week: 1, sets: 1, lessons: 5, approved: 1 }], sets: 1, lessons: 5, published: 1, fullLessons: 5, editedLessons: 0, completions: 1, averageScore: 80, firstTryPercent: 75, failedPercent: 0, averageAttempts: 1.2, approvals: 1, averageApprovalHours: 2, reviewedSubmissions: 1, reviewedCoachTurns: 2 }]
};

describe("Manager prototype clone", () => {
  it("keeps the full progress dashboard blocks and learner columns", () => {
    render(<ManagerProgress view={progress} />);
    expect(screen.getByRole("heading", { name: "Tiến độ nhóm" })).toBeInTheDocument();
    expect(screen.getByText("Học đều (≥3 buổi/tuần)")).toBeInTheDocument();
    expect(screen.getByText("Hài lòng")).toBeInTheDocument();
    expect(screen.getByRole("columnheader", { name: "Điểm thưởng" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Giả lập phần thưởng" })).toHaveAttribute("href", "/mgr/rewards");
  });

  it("keeps the operator preview, readiness and quality sections", () => {
    render(<ManagerOperations view={operations} />);
    expect(screen.getByRole("heading", { name: "Tổng quan vận hành" })).toHaveTextContent("Hiệu suất vận hành");
    expect(screen.getByRole("heading", { name: "Xem màn hình của Người vận hành" })).toBeInTheDocument();
    expect(screen.getByText("1/1 bộ đã duyệt")).toBeInTheDocument();
    expect(screen.getByText("Chất lượng qua kết quả học viên")).toBeInTheDocument();
  });

  it("keeps reminder message actions from the prototype", async () => {
    const send = vi.fn();
    const reminders: ManagerRemindersView = { organizationName: "GFT Demo", inactiveDays: 2, candidates: [{ learnerId: "learner-2", learnerName: "Học viên Cần nhắc", cefr: "A2", lastActivityAt: null }] };
    render(<ManagerReminders view={reminders} onSend={send} />);
    expect(screen.getByRole("note")).toHaveTextContent("Base.vn");
    expect(screen.getByRole("button", { name: "Copy tin nhắn" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Đã nhắc cách khác" })).toBeInTheDocument();
    await userEvent.setup().click(screen.getByRole("button", { name: "Gửi qua Base.vn" }));
    expect(send).toHaveBeenCalledWith("learner-2");
  });

  it("keeps the complete report outline and open PRD questions", () => {
    const report: ManagerReportView = { organizationName: "GFT Demo", generatedAt: "2026-10-14T09:00:00.000Z", currentWeek: 1, pilotWeeks: 2, progress: progress.summary, learners: progress.learners, operations: { content: operations.content, queues: operations.queues, automation: operations.automation } };
    render(<ManagerReport view={report} />);
    expect(screen.getByRole("heading", { name: "Báo cáo tổ chức" })).toHaveTextContent("Báo cáo tổng kết");
    expect(screen.getByRole("heading", { name: "1. Bốn chỉ số của pilot" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "5. Việc cần làm tiếp" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Câu hỏi mở từ PRD" })).toBeInTheDocument();
  });

  it("keeps all reward simulator controls and learner preview", async () => {
    render(<ManagerRewardPreview view={progress} />);
    expect(screen.getByRole("heading", { name: "Giả lập phần thưởng" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Chọn nhanh một trường hợp" })).toBeInTheDocument();
    await userEvent.setup().click(screen.getByRole("button", { name: "Cấp cao nhất" }));
    expect(screen.getByText("Mùa đông – vững vàng")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "4 mùa học" })).toBeInTheDocument();
  });
});
