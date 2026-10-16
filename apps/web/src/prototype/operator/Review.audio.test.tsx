// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ContentReviewAssessmentDetailView } from "@e4s/contracts";
import { OperatorReview, OperatorReviewAssessmentDetail } from "./Review.js";
import type { OperatorReviewActions, OperatorReviewView } from "./types.js";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

function assessmentDetail(): ContentReviewAssessmentDetailView {
  return {
    attemptId: "attempt-1",
    learnerId: "learner-1",
    learnerName: "Lan",
    kind: "placement",
    title: "Bài test đầu vào",
    status: "submitted",
    startedAt: "2026-10-15T08:00:00.000Z",
    submittedAt: "2026-10-15T08:30:00.000Z",
    totalScore: 75,
    answers: [{
      section: "speaking",
      taskKey: "S1",
      value: "audio evidence",
      evidenceType: "audio",
      artifactKey: "assessment-audio/learner-1/speaking.wav",
      audioArtifact: {
        artifactKey: "assessment-audio/learner-1/speaking.wav",
        mimeType: "audio/wav",
        sizeBytes: 42,
        signedUrl: "https://audio.example.test/speaking.wav?signature=short-lived",
        expiresAt: "2026-10-15T08:35:00.000Z"
      }
    }],
    scores: [],
    integrityEvents: [],
    decision: null,
    appeal: null
  };
}

function reviewView(overrides: Partial<OperatorReviewView> = {}): OperatorReviewView {
  return {
    activeTab: "subs",
    counts: { subs: 1, coach: 0, micro: 0, appeals: 0, attempts: 0, tests: 0 },
    submissions: [{
      id: "submission-1", learnerName: "Lan", week: 1, type: "writing", submittedAt: "15/10/2026 08:00",
      operatorChecked: false, task: "Write a short email.", text: "Hello", total: null, rubric: null, aiGraded: false,
      feedback: "", suggestions: []
    }],
    coachTurns: [],
    microLessons: [],
    appeals: [],
    attempts: [],
    tests: [],
    aiConnected: true,
    ...overrides
  };
}

function reviewActions(overrides: Partial<OperatorReviewActions> = {}): OperatorReviewActions {
  return {
    onTabChange: vi.fn(),
    onMarkSubmission: vi.fn(),
    onMarkCoachTurn: vi.fn(),
    onDeleteMicroLesson: vi.fn(),
    onGradeAi: vi.fn(),
    onGradeManual: vi.fn(),
    onDecideAppeal: vi.fn(),
    onViewTest: vi.fn(),
    ...overrides
  };
}

describe("Operator assessment audio playback", () => {
  it("renders persisted signed audio as a playable control", () => {
    render(<OperatorReviewAssessmentDetail detail={assessmentDetail()} onClose={vi.fn()} />);

    expect(screen.getByLabelText("Phát audio S1")).toHaveAttribute(
      "src",
      "https://audio.example.test/speaking.wav?signature=short-lived"
    );
  });

  it("shows playback feedback when persisted audio fails to load", () => {
    render(<OperatorReviewAssessmentDetail detail={assessmentDetail()} onClose={vi.fn()} />);

    fireEvent.error(screen.getByLabelText("Phát audio S1"));

    expect(screen.getByRole("alert")).toHaveTextContent("Không phát được audio");
  });

  it("focuses the modal, closes with Escape, and restores the opener focus", () => {
    const opener = document.createElement("button");
    document.body.appendChild(opener);
    opener.focus();
    const onClose = vi.fn();

    render(<OperatorReviewAssessmentDetail detail={assessmentDetail()} onClose={onClose} />);

    expect(screen.getByRole("button", { name: "Đóng" })).toHaveClass("btn-sm");
    expect(screen.getByRole("button", { name: "Đóng" })).toHaveFocus();
    fireEvent.keyDown(document, { key: "Escape" });
    expect(onClose).toHaveBeenCalledTimes(1);

    cleanup();
    expect(opener).toHaveFocus();
    opener.remove();
  });
});

describe("Operator review action states", () => {
  it("keeps AI grading disabled while pending and reports a rejected action", async () => {
    const user = userEvent.setup();
    let reject!: (reason: Error) => void;
    const onGradeAi = vi.fn(() => new Promise<void>((_, nextReject) => { reject = nextReject; }));

    render(<OperatorReview view={reviewView()} actions={reviewActions({ onGradeAi })} />);

    const button = screen.getByRole("button", { name: "Chấm bằng AI" });
    await user.click(button);
    expect(screen.getByRole("button", { name: "Đang chấm bằng AI…" })).toBeDisabled();

    reject(new Error("AI đang bận"));

    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("AI đang bận"));
    expect(screen.getByRole("button", { name: "Chấm bằng AI" })).not.toBeDisabled();
  });
});
