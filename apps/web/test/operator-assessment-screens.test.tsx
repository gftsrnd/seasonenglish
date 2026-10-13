// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { AssessmentLevelFormSlotView, AssessmentReviewOverviewView } from "@e4s/contracts";
import { LevelApproval, LevelForms } from "../src/pages/operator/index.js";

afterEach(cleanup);

const overview: AssessmentReviewOverviewView = {
  pendingAssessments: [{
    attemptId: "attempt-final", learnerId: "learner-1", learnerName: "Học viên F", kind: "final",
    title: "Bài kiểm tra cuối kỳ", submittedAt: "2026-10-13T10:00:00.000Z",
    sectionScores: { listening: 12, reading: 15, writing: 11, speaking: 10 }, suggestedLevel: "B1"
  }],
  pendingLevelUp: [{
    attemptId: "attempt-level", learnerId: "learner-2", learnerName: "Học viên D", kind: "level-up",
    title: "Đề thi lên mức C1", submittedAt: "2026-10-13T11:00:00.000Z",
    sectionScores: { listening: 20, reading: 19, writing: 18, speaking: 17 }, suggestedLevel: "C1"
  }],
  approvedLearners: [{
    learnerId: "learner-3", learnerName: "Học viên A", currentLevel: "A2", placementScore: 55,
    monthlyGoal: "Viết email ngắn xin dời lịch họp."
  }],
  unassessedLearners: [{ learnerId: "learner-4", learnerName: "Học viên G", profileComplete: false }]
};

const levelForms: AssessmentLevelFormSlotView[] = [
  { targetLevel: "A2", publishedForm: null },
  { targetLevel: "B1", publishedForm: {
    definitionId: "definition-b1", versionId: "version-b1", title: "Đề thi lên mức B1", version: 1,
    publishedAt: "2026-10-13T09:00:00.000Z", listeningTaskCount: 5, readingTaskCount: 5, attemptCount: 1
  } },
  { targetLevel: "B2", publishedForm: null },
  { targetLevel: "C1", publishedForm: null }
];

describe("operator assessment screens preserve Thu's visible structure", () => {
  it("keeps the approval groups and submits a human decision", async () => {
    const user = userEvent.setup();
    const onDecision = vi.fn().mockResolvedValue(undefined);
    render(<LevelApproval overview={overview} readOnly={false} onDecision={onDecision} />);

    expect(screen.getByRole("heading", { name: "Duyệt trình độ" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Chờ duyệt (1)" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Yêu cầu lên mức chờ duyệt (1)" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: /Tín hiệu đổi mức/ })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Đã duyệt (1)" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Chưa làm test (1)" })).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Duyệt mức cho Học viên F" }));
    expect(onDecision).toHaveBeenCalledWith("attempt-final", { status: "approved", approvedLevel: "B1", reason: "Đã kiểm tra evidence và rubric." });
  });

  it("keeps manager review read-only", () => {
    render(<LevelApproval overview={overview} readOnly onDecision={() => undefined} />);
    expect(screen.getByRole("button", { name: "Duyệt mức cho Học viên F" })).toBeDisabled();
    expect(screen.getByText(/quản lý đang xem ở chế độ chỉ đọc/i)).toBeInTheDocument();
  });

  it("keeps one level-form block per target level and does not fake AI availability", () => {
    render(<LevelForms slots={levelForms} aiAvailable={false} />);
    expect(screen.getByRole("heading", { name: "Đề thi lên mức" })).toBeInTheDocument();
    for (const level of ["A2", "B1", "B2", "C1"]) {
      expect(screen.getByRole("heading", { name: new RegExp(`Mức đích ${level}`) })).toBeInTheDocument();
    }
    expect(screen.getByText("Đề thi lên mức B1")).toBeInTheDocument();
    expect(screen.getByText(/5 câu nghe · 5 câu đọc · 1 lượt thi/i)).toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: "Sinh đề bằng AI" })).toHaveLength(4);
    for (const button of screen.getAllByRole("button", { name: "Sinh đề bằng AI" })) expect(button).toBeDisabled();
  });
});
