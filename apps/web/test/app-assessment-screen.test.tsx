// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { AssessmentRuntimeView } from "@e4s/contracts";
import type { AssessmentView, LearnerCallbacks } from "../src/app/learner/contracts.js";
import { LearnerAssessment } from "../src/app/learner/Assessment.js";

afterEach(cleanup);

const runtime = (overrides: Partial<AssessmentRuntimeView> = {}): AssessmentRuntimeView => ({
  remainingSeconds: 900,
  violationCount: 0,
  violationLimit: 3,
  submitReason: null,
  status: "in_progress",
  currentSection: "listening",
  audioPlayCounts: {},
  deviceEvidence: { microphoneSupported: false, microphoneState: "unsupported", soundCheck: "unknown" },
  mediaEvidence: { recordings: {}, uploads: [] },
  ...overrides
});

const actions = (overrides: Partial<LearnerCallbacks> = {}) => ({
  navigate: vi.fn(),
  saveProfileDraft: vi.fn(),
  saveProfile: vi.fn(),
  startAssessment: vi.fn(),
  saveAssessmentResponse: vi.fn(),
  completeAssessmentSection: vi.fn(),
  submitAssessment: vi.fn(),
  uploadAssessmentAudio: vi.fn(async () => "audio/key"),
  recordAssessmentAudioPlay: vi.fn(async () => ({ playCount: 1, remaining: 1 })),
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
  resolveGameWordImage: vi.fn(async () => ({ status: "unavailable" as const })),
  createDuel: vi.fn(),
  ...overrides
}) as unknown as LearnerCallbacks;

function view(overrides: Partial<AssessmentView> = {}): AssessmentView {
  const runtimeState = runtime();
  return {
    definition: {
      key: "placement-a",
      kind: "placement",
      title: "Workplace English CEFR Placement Test",
      version: 1,
      totalMinutes: 70,
      totalScore: 100,
      sections: [
        { code: "listening", title: "Nghe", durationMinutes: 15, maxScore: 20, instructions: [], groups: [] },
        { code: "reading", title: "Đọc, Ngữ pháp & Từ vựng", durationMinutes: 20, maxScore: 40, instructions: [], groups: [] },
        { code: "writing", title: "Viết", durationMinutes: 20, maxScore: 20, instructions: [], groups: [] },
        { code: "speaking", title: "Nói", durationMinutes: 15, maxScore: 20, instructions: [], groups: [] }
      ]
    },
    screenState: "listening",
    attempt: {
      id: "00000000-0000-4000-8000-000000009901",
      status: "in_progress",
      currentSection: "listening",
      startedAt: "2026-10-15T10:00:00.000Z",
      sectionEndsAt: "2026-10-15T10:15:00.000Z",
      responses: [],
      sectionStatuses: { listening: "in_progress", reading: "locked", writing: "locked", speaking: "locked" },
      audioPlayCounts: {},
      runtime: runtimeState
    },
    runtime: runtimeState,
    ...overrides
  };
}

describe("app assessment screen affordances", () => {
  it("shows the active section in progress and exposes named answer controls", () => {
    const active = view();
    active.screenState = "reading";
    active.runtime = runtime({ currentSection: "reading" });
    active.attempt = { ...active.attempt!, currentSection: "reading", runtime: active.runtime, sectionStatuses: { listening: "completed", reading: "in_progress", writing: "locked", speaking: "locked" } };
    active.definition.sections[1]!.groups = [{
      key: "R1",
      title: "Đọc hiểu",
      instruction: "Chọn một đáp án.",
      tasks: [
        { key: "R1-Q1", prompt: "Choose the best answer.", responseType: "single_choice", maxScore: 10, options: [{ value: "a", label: "Answer A" }, { value: "b", label: "Answer B" }] },
        { key: "R1-Q2", prompt: "Explain your answer.", responseType: "long_text", maxScore: 10, minWords: 10 }
      ]
    }];

    render(<LearnerAssessment view={active} actions={actions()} />);

    const progress = screen.getByRole("progressbar", { name: "Tiến độ bài thi" });
    expect(progress).toHaveAttribute("aria-valuenow", "2");
    expect(progress.querySelectorAll("i.is-complete")).toHaveLength(1);
    expect(progress.querySelectorAll("i.is-active")).toHaveLength(1);
    expect(progress.querySelectorAll("i.is-upcoming")).toHaveLength(2);
    expect(screen.getByRole("group", { name: /choose the best answer/i })).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: "Answer A" })).toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: /explain your answer/i })).toHaveAttribute("aria-describedby", "assessment-task-R1-Q2-hint");
  });

  it("disables the preparation CTA while starting and recovers with an error", async () => {
    let rejectStart!: (reason?: unknown) => void;
    const startAssessment = vi.fn(() => new Promise<void>((_, reject) => { rejectStart = reject; }));
    const startActions = actions({ startAssessment });
    render(<LearnerAssessment view={view({ screenState: "preparation", attempt: null })} actions={startActions} />);

    const button = screen.getByRole("button", { name: /bắt đầu phần nghe/i });
    fireEvent.click(button);
    fireEvent.click(screen.getByRole("button", { name: "Tôi đã sẵn sàng, bắt đầu" }));
    expect(button).toBeDisabled();
    expect(button).toHaveAttribute("aria-busy", "true");

    rejectStart(new Error("network"));
    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent(/không thể bắt đầu bài test/i));
    expect(button).toBeEnabled();
  });

  it("focuses the safe modal action and restores focus after cancelling submission", () => {
    render(<LearnerAssessment view={view()} actions={actions()} />);
    const submit = screen.getByRole("button", { name: /nộp phần nghe/i });
    submit.focus();
    fireEvent.click(submit);

    const cancel = screen.getByRole("button", { name: "Huỷ" });
    expect(cancel).toHaveFocus();
    fireEvent.click(cancel);
    expect(submit).toHaveFocus();
  });
});
