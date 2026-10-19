// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { act, cleanup, render, screen } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { AssessmentRuntimeView, AssessmentSectionCode, AssessmentSectionView } from "@e4s/contracts";
import { LearnerAssessment } from "./Assessment.js";
import { AssessmentRuntime } from "./AssessmentRuntime.js";
import type { AssessmentView, LearnerCallbacks } from "./contracts.js";

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

const sections = (Object.entries({
  listening: { title: "Nghe", instruction: "Chọn đáp án đúng." },
  reading: { title: "Đọc", instruction: "Đọc đoạn văn." },
  writing: { title: "Viết", instruction: "Viết câu trả lời." },
  speaking: { title: "Nói", instruction: "Nói về công việc." }
}) as Array<[AssessmentSectionCode, { title: string; instruction: string }]>).map(([code, meta]) => ({
  code,
  title: meta.title,
  durationMinutes: 5,
  maxScore: 25,
  instructions: [meta.instruction],
  groups: [{
    key: `${code}-group`,
    title: `Nhóm ${meta.title}`,
    instruction: meta.instruction,
    tasks: [{
      key: `${code}-task`,
      prompt: `Câu hỏi ${meta.title}`,
      responseType: code === "listening" || code === "reading" ? "single_choice" : code === "speaking" ? "speaking_evidence" : "long_text",
      maxScore: 25,
      ...(code === "listening" || code === "reading" ? { options: [{ value: "a", label: "A" }, { value: "b", label: "B" }] } : {}),
      ...(code === "writing" ? { minWords: 5, maxWords: 20 } : {})
    }]
  }]
})) as AssessmentSectionView[];

function makeRuntime(overrides: Partial<AssessmentRuntimeView> = {}): AssessmentRuntimeView {
  return {
    remainingSeconds: 120,
    violationCount: 0,
    violationLimit: 3,
    submitReason: null,
    status: "in_progress",
    currentSection: "listening",
    audioPlayCounts: {},
    deviceEvidence: { microphoneSupported: true, microphoneState: "idle", soundCheck: "unknown" },
    mediaEvidence: { recordings: {}, uploads: [] },
    ...overrides
  };
}

function makeView(overrides: Partial<AssessmentView> = {}): AssessmentView {
  return {
    definition: { key: "placement", kind: "placement", title: "Test đầu vào", version: 1, totalMinutes: 20, totalScore: 100, sections },
    screenState: "listening",
    attempt: {
      id: "attempt-1",
      status: "in_progress",
      currentSection: "listening",
      startedAt: "2026-10-15T00:00:00.000Z",
      sectionEndsAt: "2026-10-15T00:05:00.000Z",
      responses: [],
      sectionStatuses: { listening: "in_progress", reading: "locked", writing: "locked", speaking: "locked" },
      audioPlayCounts: {},
      runtime: makeRuntime()
    },
    runtime: makeRuntime(),
    ...overrides
  };
}

function makeActions(overrides: Partial<LearnerCallbacks> = {}) {
  return {
    navigate: vi.fn(),
    saveProfileDraft: vi.fn(),
    saveProfile: vi.fn(),
    startAssessment: vi.fn(),
    saveAssessmentResponse: vi.fn(),
    completeAssessmentSection: vi.fn(),
    submitAssessment: vi.fn(),
    uploadAssessmentAudio: vi.fn(),
    recordAssessmentAudioPlay: vi.fn(),
    createAssessmentAppeal: vi.fn(),
    saveLessonProgress: vi.fn(),
    submitMicroAnswer: vi.fn(),
    completeMicroLesson: vi.fn(),
    regenerateMicroLesson: vi.fn(),
    sendCoachMessage: vi.fn(),
    changeCoachPersona: vi.fn(),
    startNewCoachChat: vi.fn(),
    sendChallengeMessage: vi.fn(),
    submitWeeklyPractice: vi.fn(),
    submitSurvey: vi.fn(),
    saveAvatar: vi.fn(),
    printReward: vi.fn(),
    speak: vi.fn(),
    generateGameSet: vi.fn(),
    useWeeklyGameSet: vi.fn(),
    deleteGameSet: vi.fn(),
    finishGame: vi.fn(),
    resetGameResult: vi.fn(),
    resolveGameWordImage: vi.fn(),
    createDuel: vi.fn(),
    ...overrides
  } as unknown as LearnerCallbacks;
}

describe("assessment HCI states", () => {
  it("warns about unanswered questions before section submission and restores focus after Escape", async () => {
    const user = userEvent.setup();
    const view = makeView();
    render(<LearnerAssessment view={view} actions={makeActions()} />);

    const submit = screen.getByRole("button", { name: /nộp phần nghe/i });
    await user.click(submit);

    expect(screen.getByRole("dialog")).toHaveTextContent("Còn 1 câu chưa trả lời.");
    expect(screen.getByRole("button", { name: "Huỷ" })).toHaveFocus();
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(submit).toHaveFocus();
  });

  it("keeps the preparation table inside the mobile card", () => {
    const { container } = render(<LearnerAssessment view={makeView({ screenState: "preparation", attempt: null })} actions={makeActions()} />);
    expect(screen.getByRole("table", { name: "Cấu trúc bài test" })).toHaveStyle({ width: "100%", tableLayout: "fixed" });
    expect(screen.getByText("Bắt buộc").closest("article")?.querySelector("svg.lucide-circle-check-big, svg.lucide-check-circle-2")).toBeInTheDocument();
    expect(screen.getByText("Không được phép").closest("article")?.querySelector("svg.lucide-ban")).toBeInTheDocument();
    const equipment = screen.getByRole("group", { name: "Cần chuẩn bị: tai nghe hoặc loa, và micro" });
    expect(equipment.querySelector("svg.lucide-headphones")).toBeInTheDocument();
    expect(equipment.querySelector("svg.lucide-mic")).toBeInTheDocument();
    expect(container).not.toHaveTextContent(/✅|⛔|🎧|🎙/u);
  });

  it("uses a warning icon while keeping the integrity warning in accessible text", async () => {
    const recordAssessmentViolation = vi.fn().mockResolvedValue({
      ...makeRuntime(), violationCount: 1, violationLimit: 3
    });
    render(<AssessmentRuntime view={makeView()} actions={makeActions({ recordAssessmentViolation })}>{(state) => <span>{state.formattedTime}</span>}</AssessmentRuntime>);

    await act(async () => {
      window.dispatchEvent(new Event("blur"));
      await Promise.resolve();
    });

    const heading = await screen.findByRole("heading", { name: "Cảnh báo 1/3" });
    expect(heading.querySelector("svg.lucide-triangle-alert")).toBeInTheDocument();
    expect(heading).not.toHaveTextContent("⚠️");
  });

  it("uses a clock icon for automatic submission", async () => {
    const runtime = makeRuntime({ status: "submitted", autoSubmitted: true, submitReason: "timeout", remainingSeconds: 0 });
    render(<AssessmentRuntime view={makeView({ runtime, attempt: { ...makeView().attempt!, status: "submitted", runtime } })} actions={makeActions()}>{(state) => <span>{state.formattedTime}</span>}</AssessmentRuntime>);

    const heading = await screen.findByRole("heading", { name: "Tự động nộp bài" });
    expect(heading.querySelector("svg.lucide-clock-3")).toBeInTheDocument();
    expect(heading).not.toHaveTextContent("⏰");
  });

  it("offers a retry when an integrity warning cannot be recorded", async () => {
    const recordViolation = vi.fn().mockRejectedValueOnce(new Error("offline"));
    const actions = makeActions({ recordAssessmentViolation: recordViolation });
    const view = makeView();
    render(<AssessmentRuntime view={view} actions={actions}>{(state) => <span>{state.formattedTime}</span>}</AssessmentRuntime>);

    await act(async () => {
      window.dispatchEvent(new Event("blur"));
      await Promise.resolve();
    });
    expect(screen.getByRole("button", { name: "Thử lại" })).toBeInTheDocument();
    expect(screen.getByRole("alert")).toHaveTextContent("Không ghi nhận được cảnh báo");
  });

  it("explains the level-up preparation rules before the learner starts", () => {
    render(<LearnerAssessment view={makeView({
      definition: { ...makeView().definition, key: "level-up-B1", kind: "level-up", title: "Bài thi lên mức B1" },
      targetLevel: "B1",
      screenState: "preparation",
      attempt: null
    })} actions={makeActions()} />);

    expect(screen.getByText(/6 lượt thử thách với Season/i)).toBeInTheDocument();
    expect(screen.getByText(/14 ngày/i)).toBeInTheDocument();
  });

  it("keeps final and level-up submitted states distinguishable", () => {
    const base = makeView();
    const levelUp = {
      ...base,
      definition: { ...base.definition, key: "level-up-B1", kind: "level-up" as const, title: "Bài thi lên mức B1" },
      targetLevel: "B1",
      screenState: "pending" as const,
      attempt: { ...base.attempt!, status: "pending_review" as const, totalScore: null }
    };
    const { unmount } = render(<LearnerAssessment view={levelUp} actions={makeActions()} />);
    expect(screen.getByRole("heading", { name: "Bài thi lên mức B1" })).toBeInTheDocument();
    expect(screen.getByText(/bài thi lên mức B1 đang chờ chấm/i)).toBeInTheDocument();

    unmount();
    render(<LearnerAssessment view={{
      ...base,
      definition: { ...base.definition, kind: "final", title: "Bài kiểm tra cuối kỳ" },
      screenState: "pending",
      attempt: { ...base.attempt!, status: "submitted", totalScore: null }
    }} actions={makeActions()} />);
    expect(screen.getByText(/bài kiểm tra cuối kỳ đã được nộp/i)).toBeInTheDocument();
  });
});
