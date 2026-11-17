// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { AssessmentSectionView } from "@e4s/contracts";
import { LearnerAssessment } from "./Assessment.js";
import type { AssessmentView, LearnerCallbacks } from "./contracts.js";

afterEach(() => cleanup());

const sections = (["listening", "reading", "writing", "speaking"] as const).map((code) => ({
  code, title: code, durationMinutes: 5, maxScore: 25, instructions: ["x"],
  groups: [{ key: `${code}-g`, title: code, instruction: "x", tasks: [{ key: `${code}-t`, prompt: "Câu hỏi", responseType: code === "writing" ? "long_text" : code === "speaking" ? "speaking_evidence" : "single_choice", maxScore: 25 }] }]
})) as AssessmentSectionView[];

const definition = { key: "placement-retake", kind: "placement" as const, title: "Test đầu vào – đề thi lại", version: 1, totalMinutes: 75, totalScore: 100, sections };
const actions = { navigate: vi.fn(), startAssessment: vi.fn(), createAssessmentAppeal: vi.fn() } as unknown as LearnerCallbacks;
const grantedAt = "2026-11-16T02:00:00.000Z";

function submittedAttempt(id: string, status: "pending_review" | "needs_retry") {
  return {
    id, status, currentSection: null, startedAt: grantedAt, sectionEndsAt: null, responses: [],
    sectionStatuses: { listening: "completed", reading: "completed", writing: "completed", speaking: "completed" } as const, audioPlayCounts: {}
  };
}

describe("placement retake notice", () => {
  it("tells the learner the one retake was granted before they start the new form", () => {
    const view: AssessmentView = {
      definition, screenState: "preparation", attempt: null,
      placementRetake: { status: "granted", reason: "Kết quả phần Nói chưa phản ánh đúng.", grantedAt, usedAt: null, retakeAttemptId: null }
    };
    render(<LearnerAssessment view={view} actions={actions} />);
    expect(screen.getByText(/Đã duyệt thi lại\./)).toBeInTheDocument();
    expect(screen.getByText(/Vận hành sẽ xếp lớp sau khi bạn nộp bài/)).toBeInTheDocument();
    expect(screen.getByText("Kết quả phần Nói chưa phản ánh đúng.")).toBeInTheDocument();
  });

  it("says the operator will place the learner once the retake is used", () => {
    const view: AssessmentView = {
      definition, screenState: "pending", attempt: submittedAttempt("retake-attempt", "pending_review"),
      placementRetake: { status: "used", reason: "r", grantedAt, usedAt: grantedAt, retakeAttemptId: "retake-attempt" }
    };
    render(<LearnerAssessment view={view} actions={actions} />);
    expect(screen.getByRole("heading", { name: "Bài thi lại đã được nộp" })).toBeInTheDocument();
    expect(screen.getByText(/Vận hành sẽ xem kết quả và xếp lớp cho bạn/)).toBeInTheDocument();
    expect(screen.queryByText(/không cần làm lại/i)).not.toBeInTheDocument();
  });

  it("does not tell a sent-back learner that no retake is needed", () => {
    const view: AssessmentView = { definition: { ...definition, key: "placement-a" }, screenState: "pending", attempt: submittedAttempt("old", "needs_retry") };
    render(<LearnerAssessment view={view} actions={actions} />);
    expect(screen.getByRole("heading", { name: "Test đầu vào chưa đủ để duyệt mức" })).toBeInTheDocument();
    expect(screen.queryByText(/không cần làm lại/i)).not.toBeInTheDocument();
  });
});
