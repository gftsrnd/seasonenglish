// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
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
    taskPrompts: [
      { section: "writing", taskKey: "W1", title: "Task 1 – Phản hồi nhanh", prompt: "Write a short reply." },
      { section: "writing", taskKey: "W2", title: "Task 2 – Báo cáo / đề xuất", prompt: "Write a formal email." },
      { section: "speaking", taskKey: "S1", title: "Task 1 – Warm-up", prompt: "Answer the questions."
      }
    ],
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
    counts: { subs: 1, coach: 0, weekly: 0, appeals: 0, attempts: 0, tests: 0 },
    submissions: [{
      id: "submission-1", learnerName: "Lan", week: 1, type: "writing", submittedAt: "15/10/2026 08:00",
      operatorChecked: false, task: "Write a short email.", text: "Hello", total: null, rubric: null, aiGraded: false,
      feedback: "", suggestions: []
    }],
    coachTurns: [],
    weeklyPractices: [],
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
    onGradeAi: vi.fn(),
    onGradeManual: vi.fn(),
    onDecideAppeal: vi.fn(),
    onViewTest: vi.fn(),
    ...overrides
  };
}

describe("Operator assessment audio playback", () => {
  it("shows CEFR and actual duration columns with a total row", () => {
    const detail = assessmentDetail();
    detail.totalScore = 75;
    detail.overallCefr = "B1";
    detail.totalTimeSeconds = 3_600;
    detail.totalTimeLimitMinutes = 70;
    detail.sections = [
      { section: "listening", label: "Nghe", maxScore: 20, durationMinutes: 15, actualSeconds: 900, score: 18, cefr: "B2", source: "deterministic", criteria: {}, state: "scored", groups: [] },
      { section: "reading", label: "Đọc", maxScore: 40, durationMinutes: 20, actualSeconds: 1_200, score: 32, cefr: "B2", source: "deterministic", criteria: {}, state: "scored", groups: [] },
      { section: "writing", label: "Viết", maxScore: 20, durationMinutes: 20, actualSeconds: 900, score: 12, cefr: "A2", source: "human", criteria: {}, state: "scored", groups: [] },
      { section: "speaking", label: "Nói", maxScore: 20, durationMinutes: 15, actualSeconds: 600, score: 13, cefr: "B1", source: "human", criteria: {}, state: "scored", groups: [] }
    ];

    render(<OperatorReviewAssessmentDetail detail={detail} onClose={vi.fn()} />);

    expect(screen.getByText("CEFR")).toBeInTheDocument();
    expect(screen.getByText("Thời gian làm")).toBeInTheDocument();
    expect(screen.getByText("Tổng")).toBeInTheDocument();
    expect(screen.getByText("1:00:00 / 70 phút")).toBeInTheDocument();
    expect(screen.getByText("A2")).toHaveClass("badge", "lvl", "lvl-A2");
    expect(screen.queryByText("deterministic")).not.toBeInTheDocument();
    expect(screen.queryByText("human")).not.toBeInTheDocument();
  });

  it("keeps the prototype score shape for sections that still need manual scoring", () => {
    const detail = assessmentDetail();
    detail.totalScore = null;
    detail.sections = [
      { section: "listening", label: "Nghe", maxScore: 20, durationMinutes: 15, actualSeconds: null, score: null, cefr: null, source: null, criteria: {}, state: "not_scored", groups: [] },
      { section: "reading", label: "Đọc", maxScore: 40, durationMinutes: 20, actualSeconds: null, score: null, cefr: null, source: null, criteria: {}, state: "not_scored", groups: [] },
      { section: "writing", label: "Viết", maxScore: 20, durationMinutes: 20, actualSeconds: null, score: null, cefr: null, source: null, criteria: {}, state: "not_scored", groups: [] },
      { section: "speaking", label: "Nói", maxScore: 20, durationMinutes: 15, actualSeconds: null, score: null, cefr: null, source: null, criteria: {}, state: "not_scored", groups: [] }
    ];

    const { container } = render(<OperatorReviewAssessmentDetail detail={detail} onClose={vi.fn()} />);

    expect(screen.getAllByText("Chờ chấm")).toHaveLength(4);
    expect(screen.getByText("Chờ đủ 4 kỹ năng")).toBeInTheDocument();
    expect(screen.getByText(/Tổng điểm: Chờ đủ 4 kỹ năng/)).toBeInTheDocument();
  });

  it("renders persisted signed audio as a playable control", () => {
    render(<OperatorReviewAssessmentDetail detail={assessmentDetail()} onClose={vi.fn()} />);

    expect(screen.getByLabelText("Phát audio S1")).toHaveAttribute(
      "src",
      "https://audio.example.test/speaking.wav?signature=short-lived"
    );
  });

  it("shows all four S3 recordings as one non-roleplay refund task for manual review", () => {
    const detail = assessmentDetail();
    detail.sections = [{
      section: "speaking", label: "Nói", maxScore: 20, durationMinutes: 15, actualSeconds: null, score: null, cefr: null, source: null, criteria: {}, state: "not_scored",
      groups: [{ key: "S3", label: "Task 3 – Customer refund questions (B2–C1)", tasks: [
        { taskKey: "S3_Q1", prompt: "How would you acknowledge the customer's frustration?", answer: "I understand your frustration.", maxScore: 0 },
        { taskKey: "S3_Q2", prompt: "What technical issue has delayed the refund?", answer: "A technical issue delayed it.", maxScore: 0 },
        { taskKey: "S3_Q3", prompt: "What clear next step would you propose?", answer: "I will escalate it.", maxScore: 0 },
        { taskKey: "S3_Q4", prompt: "When can the customer expect a follow-up?", answer: "Within 24 hours.", maxScore: 0 }
      ] }]
    }];
    detail.answers = ["S3_Q1", "S3_Q2", "S3_Q3", "S3_Q4"].map((taskKey) => ({
      section: "speaking" as const, taskKey, value: "audio evidence", evidenceType: "audio" as const,
      audioArtifact: { artifactKey: `assessment-audio/${taskKey}.webm`, mimeType: "audio/webm", sizeBytes: 42, signedUrl: `https://audio.example.test/${taskKey}.webm`, expiresAt: "2026-10-15T08:35:00.000Z" }
    }));

    render(<OperatorReviewAssessmentDetail detail={detail} onClose={vi.fn()} />);

    expect(screen.getByText(/Câu 1\. How would you acknowledge the customer's frustration\?/)).toBeInTheDocument();
    expect(screen.getByText(/When can the customer expect a follow-up\?/)).toBeInTheDocument();
    expect(screen.getByLabelText("Phát audio S3_Q1")).toBeInTheDocument();
    expect(screen.getByLabelText("Phát audio S3_Q4")).toBeInTheDocument();
    expect(screen.queryByText(/Khách hàng mở đầu/)).not.toBeInTheDocument();
    expect(screen.queryByText(/^3\. How would you acknowledge/)).not.toBeInTheDocument();
  });

  it("flags typed speaking proxy evidence for mandatory manual review", () => {
    const detail = assessmentDetail();
    detail.answers = [{
      section: "speaking",
      taskKey: "S1",
      value: "I work in sales.",
      evidenceType: "typed_proxy"
    }];

    render(<OperatorReviewAssessmentDetail detail={detail} onClose={vi.fn()} />);

    expect(screen.getByText("Câu trả lời văn bản thay thế")).toBeInTheDocument();
    expect(screen.getByRole("alert")).toHaveTextContent(/phải chấm tay/i);
    expect(screen.getByRole("alert")).toHaveTextContent(/không xác minh phát âm/i);
    expect(screen.getByRole("alert")).toHaveTextContent(/độ trôi chảy/i);
    expect(screen.getByRole("alert")).toHaveTextContent(/tương tác theo thời gian thực/i);
  });

  it("shows playback feedback when persisted audio fails to load", () => {
    render(<OperatorReviewAssessmentDetail detail={assessmentDetail()} onClose={vi.fn()} />);

    fireEvent.error(screen.getByLabelText("Phát audio S1"));

    expect(screen.getByRole("alert")).toHaveTextContent("Không phát được audio");
  });

  it("offers deletion only for eligible artifacts and keeps the transcript after the confirmed callback", async () => {
    const detail = assessmentDetail();
    detail.answers[0]!.audioArtifact = {
      ...detail.answers[0]!.audioArtifact!,
      fileId: "file-1",
      retentionUntil: "2026-09-30T00:00:00.000Z",
      cleanupEligible: true,
      transcript: "Persisted transcript"
    };
    const onDeleteAudio = vi.fn().mockResolvedValue(undefined);
    render(<OperatorReviewAssessmentDetail detail={detail} onClose={vi.fn()} onDeleteAudio={onDeleteAudio} />);

    fireEvent.click(screen.getByRole("button", { name: "Xoá bản ghi âm" }));
    expect(onDeleteAudio).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Xác nhận xoá bản ghi âm" }));
    await waitFor(() => expect(onDeleteAudio).toHaveBeenCalledWith(expect.objectContaining({ fileId: "file-1", cleanupEligible: true })));
    expect(screen.getByText("audio evidence")).toBeInTheDocument();
  });

  it("keeps the delete action disabled before the 60-day cleanup window", () => {
    const detail = assessmentDetail();
    detail.answers[0]!.audioArtifact = { ...detail.answers[0]!.audioArtifact!, fileId: "file-1", cleanupEligible: false };
    render(<OperatorReviewAssessmentDetail detail={detail} onClose={vi.fn()} onDeleteAudio={vi.fn()} />);
    expect(screen.getByRole("button", { name: "Xoá bản ghi âm" })).toBeDisabled();
  });

  it("plays normalized Season and weekly audio in the operator review cards", () => {
    const onDeleteAudio = vi.fn();
    const { rerender } = render(<OperatorReview
      view={reviewView({
        counts: { ...reviewView().counts, coach: 1 },
        submissions: [{ ...reviewView().submissions[0]!, audioArtifact: { fileId: "weekly-file", artifactKey: "audio/weekly.webm", signedUrl: "/audio/weekly.webm", transcript: "Weekly transcript" } }],
        coachTurns: [{ id: "turn-1", sessionId: "session-1", learnerName: "Lan", at: "28/10/2026 08:00", checked: false, userText: "Season answer", reply: "Season reply", audioArtifact: { fileId: "season-file", artifactKey: "audio/season.webm", signedUrl: "/audio/season.webm", transcript: "Season transcript" } }]
      })}
      actions={reviewActions({ onDeleteAudio })}
    />);

    expect(screen.getByLabelText("Phát Bản ghi âm bài nộp của Lan")).toHaveAttribute("src", "/audio/weekly.webm");
    rerender(<OperatorReview
      view={reviewView({
        activeTab: "coach",
        counts: { ...reviewView().counts, coach: 1 },
        coachTurns: [{ id: "turn-1", sessionId: "session-1", learnerName: "Lan", at: "28/10/2026 08:00", checked: false, userText: "Season answer", reply: "Season reply", audioArtifact: { fileId: "season-file", artifactKey: "audio/season.webm", signedUrl: "/audio/season.webm", transcript: "Season transcript" } }]
      })}
      actions={reviewActions({ onDeleteAudio })}
    />);
    expect(screen.getByLabelText("Phát Bản ghi âm Season của Lan")).toHaveAttribute("src", "/audio/season.webm");
    expect(onDeleteAudio).toBeDefined();
  });

  it("shows every task and marks missing answers instead of hiding the task", () => {
    const { container } = render(<OperatorReviewAssessmentDetail detail={assessmentDetail()} onClose={vi.fn()} />);

    expect(screen.getByText(/Task 1 – Phản hồi nhanh/)).toBeInTheDocument();
    expect(screen.getByText(/Task 2 – Báo cáo \/ đề xuất/)).toBeInTheDocument();
    expect(screen.getAllByText("(không có bài viết)")).toHaveLength(2);
    expect(container.querySelectorAll("[data-assessment-section]")).toHaveLength(4);
  });

  it("keeps listening parts collapsed by default with their score visible", () => {
    const detail = assessmentDetail();
    detail.taskPrompts = [{ section: "listening", taskKey: "LA_0", title: "Part A", prompt: "What time is the meeting?" }];
    detail.sections = [{
      section: "listening", label: "Nghe", maxScore: 20, durationMinutes: 15, actualSeconds: 600,
      score: 2, cefr: "A1", source: "deterministic", criteria: {}, state: "scored",
      groups: [{ key: "part-a", label: "Part A – Thông báo của quản lý", tasks: [{ taskKey: "LA_0", title: "Part A", prompt: "What time is the meeting?", answer: null, maxScore: 5 }] }]
    }];

    const { container } = render(<OperatorReviewAssessmentDetail detail={detail} onClose={vi.fn()} />);

    const part = screen.getByText(/Part A – Thông báo của quản lý/).closest("details");
    const listening = container.querySelector('[data-assessment-section="listening"]');
    expect(part).not.toBeNull();
    expect(listening).toHaveAttribute("open");
    expect(part).not.toHaveAttribute("open");
    expect(within(part!).getByText(/0\/5 điểm/)).toBeInTheDocument();
    expect(screen.getByText(/What time is the meeting\?/)).not.toBeVisible();
    fireEvent.click(within(part!).getByText(/Part A – Thông báo của quản lý/));
    expect(screen.getByText(/What time is the meeting\?/)).toBeVisible();
    expect(screen.getByText("bỏ qua")).toBeVisible();
  });

  it("keeps objective section lists open and manual scoring sections collapsed", () => {
    const detail = assessmentDetail();
    detail.sections = [
      { section: "listening", label: "Nghe", maxScore: 20, durationMinutes: 15, actualSeconds: 600, score: 2, cefr: "A1", source: "deterministic", criteria: {}, state: "scored", groups: [] },
      { section: "reading", label: "Đọc", maxScore: 40, durationMinutes: 20, actualSeconds: 600, score: 1, cefr: "A1", source: "deterministic", criteria: {}, state: "scored", groups: [] },
      { section: "writing", label: "Viết", maxScore: 20, durationMinutes: 20, actualSeconds: 10, score: 0, cefr: "A1", source: "human", criteria: {}, state: "scored", groups: [] },
      { section: "speaking", label: "Nói", maxScore: 20, durationMinutes: 15, actualSeconds: 20, score: 0, cefr: "A1", source: "human", criteria: {}, state: "scored", groups: [] }
    ];

    const { container } = render(<OperatorReviewAssessmentDetail detail={detail} onClose={vi.fn()} onSaveManualScore={vi.fn()} />);

    for (const section of ["listening", "reading", "writing", "speaking"]) {
      const panel = container.querySelector(`[data-assessment-section="${section}"]`);
      expect(panel?.tagName).toBe("DETAILS");
    }
    expect(container.querySelector('[data-assessment-section="listening"]')).toHaveAttribute("open");
    expect(container.querySelector('[data-assessment-section="reading"]')).toHaveAttribute("open");
    expect(container.querySelector('[data-assessment-section="writing"]')).not.toHaveAttribute("open");
    expect(container.querySelector('[data-assessment-section="speaking"]')).not.toHaveAttribute("open");
    expect(screen.getByText("Viết · 0/20")).toBeVisible();

    fireEvent.click(screen.getByText("Viết · 0/20"));

    expect(container.querySelector('[data-assessment-section="writing"]')).toHaveAttribute("open");
    expect(screen.getByLabelText("W1 · Task completion")).toBeVisible();
  });

  it("uses the prototype document flow instead of separate evidence and grading cards", () => {
    const detail = assessmentDetail();
    detail.sections = [
      { section: "listening", label: "Nghe", maxScore: 20, durationMinutes: 15, actualSeconds: 600, score: 2, cefr: "A1", source: "deterministic", criteria: {}, state: "scored", groups: [] },
      { section: "reading", label: "Đọc", maxScore: 40, durationMinutes: 20, actualSeconds: 600, score: 1, cefr: "A1", source: "deterministic", criteria: {}, state: "scored", groups: [] },
      { section: "writing", label: "Viết", maxScore: 20, durationMinutes: 20, actualSeconds: 10, score: null, cefr: "A1", source: null, criteria: {}, state: "not_scored", groups: [] },
      { section: "speaking", label: "Nói", maxScore: 20, durationMinutes: 15, actualSeconds: 20, score: null, cefr: "A1", source: null, criteria: {}, state: "not_scored", groups: [] }
    ];

    const { container } = render(<OperatorReviewAssessmentDetail detail={detail} onClose={vi.fn()} onSaveManualScore={vi.fn()} />);

    expect(container.querySelector(".operator-evidence-panel")).not.toBeInTheDocument();
    expect(container.querySelector(".operator-grading-panel")).not.toBeInTheDocument();
    const writing = container.querySelector('[data-assessment-section="writing"]');
    const speaking = container.querySelector('[data-assessment-section="speaking"]');
    expect(writing).toContainElement(container.querySelector('[data-manual-rubric="writing"]'));
    expect(speaking).toContainElement(container.querySelector('[data-manual-rubric="speaking"]'));
    expect(screen.getByRole("heading", { name: "Nhận xét", level: 4 })).toHaveClass("operator-detail-section-title");
    expect(screen.getByRole("heading", { name: "Nhận xét" }).compareDocumentPosition(speaking!) & Node.DOCUMENT_POSITION_PRECEDING).toBeTruthy();
  });

  it("keeps the anti-cheat log collapsed and translates technical events for operators", () => {
    const detail = assessmentDetail();
    detail.integrityEvents = [{ reason: "window_blur", occurredAt: "2026-10-15T08:32:05.780Z", violationCount: 1, requestId: "secret-request-id" }];

    render(<OperatorReviewAssessmentDetail detail={detail} onClose={vi.fn()} />);

    const summary = screen.getByText(/Nhật ký cảnh báo/);
    const log = summary.closest("details");
    const processingLog = screen.getByText(/Nhật ký xử lý/).closest("details");
    expect(log).not.toBeNull();
    expect(processingLog?.parentElement).toBe(log?.parentElement);
    expect(log?.parentElement).toHaveClass("operator-log-group");
    expect(log).not.toHaveAttribute("open");
    expect(within(log!).getByText(/Rời khỏi cửa sổ bài test/)).toBeInTheDocument();
    expect(screen.queryByText(/secret-request-id|recordedAt|violationCount/)).not.toBeInTheDocument();
    const evidenceHeading = screen.getByRole("heading", { name: "Bài làm và bằng chứng" });
    expect(log!.compareDocumentPosition(evidenceHeading) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
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
