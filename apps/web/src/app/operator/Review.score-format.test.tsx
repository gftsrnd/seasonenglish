// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ContentReviewAssessmentDetailView } from "@e4s/contracts";
import { OperatorReview, OperatorReviewAssessmentDetail } from "./Review.js";
import type { OperatorReviewActions, OperatorReviewView } from "./types.js";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

function monthlyFinalDetail(): ContentReviewAssessmentDetailView {
  const groupTask = (taskKey: string, maxScore: number, correctAnswer: string) => ({ taskKey, prompt: `Question ${taskKey}`, maxScore, options: [{ value: "A", label: "Yes" }, { value: "B", label: "No" }], correctAnswer });
  return {
    attemptId: "attempt-final",
    learnerId: "learner-1",
    learnerName: "Kiểm thử monthly ready",
    kind: "final",
    title: "Bài thi tháng",
    status: "completed",
    startedAt: "2026-10-15T08:00:00.000Z",
    submittedAt: "2026-10-15T08:30:00.000Z",
    totalScore: 18.766666666666666,
    taskPrompts: [],
    answers: [
      { section: "reading", taskKey: "R1", value: "A" },
      { section: "reading", taskKey: "R2", value: "B" }
    ],
    scores: [],
    sections: [
      { section: "listening", label: "Nghe", maxScore: 25, durationMinutes: 15, actualSeconds: 600, score: 7.352941176470589, cefr: null, source: "deterministic", criteria: {}, state: "scored", groups: [] },
      {
        section: "reading", label: "Đọc", maxScore: 25, durationMinutes: 20, actualSeconds: 900, score: 4.411764705882353, cefr: null, source: "deterministic", criteria: {}, state: "scored",
        groups: [{ key: "RA", label: "Tin nhắn A", tasks: [groupTask("R1", 4.411764705882353, "A"), groupTask("R2", 11.764705882352944, "A")] }]
      },
      { section: "writing", label: "Viết", maxScore: 25, durationMinutes: 20, actualSeconds: 900, score: 7, cefr: null, source: "ai", criteria: {}, state: "scored", groups: [] },
      { section: "speaking", label: "Nói", maxScore: 25, durationMinutes: 10, actualSeconds: 400, score: 0, cefr: null, source: "ai", criteria: {}, state: "scored", groups: [] }
    ],
    integrityEvents: [],
    decision: null,
    appeal: null
  } as ContentReviewAssessmentDetailView;
}

function actions(): OperatorReviewActions {
  return { onTabChange: vi.fn(), onMarkSubmission: vi.fn(), onMarkCoachTurn: vi.fn(), onGradeAi: vi.fn(), onGradeManual: vi.fn(), onDecideAppeal: vi.fn(), onViewTest: vi.fn() };
}

describe("Operator score display formatting", () => {
  it("formats fractional section, group and total scores with at most two decimals", () => {
    const { container } = render(<OperatorReviewAssessmentDetail detail={monthlyFinalDetail()} onClose={vi.fn()} />);
    const table = screen.getByRole("table");

    expect(within(table).getByText("7,35/25")).toBeInTheDocument();
    expect(within(table).getByText("4,41/25")).toBeInTheDocument();
    expect(screen.getByText("Tin nhắn A · 4,41/16,18 điểm")).toBeInTheDocument();
    expect(screen.getByText("Đọc · 4,41/25")).toBeInTheDocument();
    expect(screen.getByText(/Tổng điểm: 18,77\/100/)).toBeInTheDocument();
    expect(container.textContent).not.toMatch(/\d\.\d{3,}|\d,\d{3,}/);

    const totalRow = container.querySelector("tr.operator-total-row");
    expect(totalRow).not.toBeNull();
    expect(within(totalRow as HTMLElement).getByText("18,77/100")).toBeInTheDocument();
  });

  it("shows the exam list total with its maximum and without the empty level columns", () => {
    const view = {
      activeTab: "tests", counts: { subs: 0, coach: 0, weekly: 0, appeals: 0, attempts: 0, tests: 2 },
      submissions: [], coachTurns: [], weeklyPractices: [], appeals: [], attempts: [],
      tests: [
        { id: "t1", learnerName: "Kiểm thử monthly ready", kind: "final", status: "completed", submittedAt: "15/10/2026 08:30", total: 18.766666666666666 },
        { id: "t2", learnerName: "Lan", kind: "placement", status: "submitted", submittedAt: "15/10/2026 09:00" }
      ],
      aiConnected: true
    } as unknown as OperatorReviewView;
    render(<OperatorReview mode="assessment" embedded view={view} actions={actions()} />);

    const headers = screen.getAllByRole("columnheader").map(header => header.textContent);
    expect(headers).toEqual(["Người học", "Loại", "Nộp", "Tổng", ""]);
    expect(screen.getByText("18,77/100")).toBeInTheDocument();
    expect(screen.queryByText("Mức thô")).not.toBeInTheDocument();
    expect(screen.queryByText("AI")).not.toBeInTheDocument();
  });
});
