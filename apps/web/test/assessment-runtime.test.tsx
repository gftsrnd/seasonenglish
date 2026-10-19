// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AssessmentRuntimeView, AssessmentSectionCode } from "@e4s/contracts";
import type { AssessmentView, LearnerCallbacks } from "../src/app/learner/contracts.js";
import { LearnerAssessment } from "../src/app/learner/Assessment.js";

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

const runtime = (overrides: Partial<AssessmentRuntimeView> = {}): AssessmentRuntimeView => ({
  remainingSeconds: 299,
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

const baseView = (runtimeState = runtime()): AssessmentView => ({
  definition: {
    key: "placement-a", kind: "placement", title: "Workplace English CEFR Placement Test", version: 1,
    totalMinutes: 75, totalScore: 100,
    sections: [
      { code: "listening", title: "Nghe", durationMinutes: 15, maxScore: 20, instructions: [], groups: [{ key: "LA", title: "Part A", instruction: "Nghe tối đa hai lần.", maxPlays: 2, stimulus: { type: "audio_script", lines: [{ speaker: "Manager", text: "Hello." }] }, tasks: [] }] },
      { code: "reading", title: "Đọc", durationMinutes: 25, maxScore: 40, instructions: [], groups: [] },
      { code: "writing", title: "Viết", durationMinutes: 20, maxScore: 20, instructions: [], groups: [] },
      { code: "speaking", title: "Nói", durationMinutes: 15, maxScore: 20, instructions: [], groups: [] }
    ]
  },
  screenState: "listening",
  attempt: {
    id: "00000000-0000-4000-8000-000000009901", status: "in_progress", currentSection: "listening",
    startedAt: "2026-10-15T10:00:00.000Z", sectionEndsAt: "2026-10-15T10:15:00.000Z", responses: [],
    sectionStatuses: { listening: "in_progress", reading: "locked", writing: "locked", speaking: "locked" }, audioPlayCounts: {}, runtime: runtimeState
  },
  runtime: runtimeState
});

function callbacks(overrides: Partial<LearnerCallbacks> = {}): LearnerCallbacks {
  return {
    navigate: vi.fn(), saveProfileDraft: vi.fn(), saveProfile: vi.fn(), startAssessment: vi.fn(), saveAssessmentResponse: vi.fn(),
    completeAssessmentSection: vi.fn(), submitAssessment: vi.fn(), uploadAssessmentAudio: vi.fn(async () => "audio/key"),
    recordAssessmentAudioPlay: vi.fn(async () => ({ playCount: 1, remaining: 1 })), createAssessmentAppeal: vi.fn(), saveLessonProgress: vi.fn(),
    submitMicroAnswer: vi.fn(), completeMicroLesson: vi.fn(), regenerateMicroLesson: vi.fn(), sendCoachMessage: vi.fn(), changeCoachPersona: vi.fn(),
    startNewCoachChat: vi.fn(), sendChallengeMessage: vi.fn(), submitWeeklyPractice: vi.fn(), submitSurvey: vi.fn(), saveAvatar: vi.fn(), printReward: vi.fn(),
    speak: vi.fn(), generateGameSet: vi.fn(), useWeeklyGameSet: vi.fn(), deleteGameSet: vi.fn(), finishGame: vi.fn(), resetGameResult: vi.fn(), resolveGameWordImage: vi.fn(async () => null), createDuel: vi.fn(),
    ...overrides
  };
}

describe("app assessment runtime", () => {
  beforeEach(() => {
    vi.spyOn(Date, "now").mockReturnValue(new Date("2026-10-15T10:10:01.000Z").getTime());
  });

  it("shows the server-owned timer and five-minute warning state", () => {
    render(<LearnerAssessment view={baseView(runtime({ remainingSeconds: 300 }))} actions={callbacks()} />);
    expect(screen.getByRole("timer")).toHaveTextContent("05:00");
    expect(screen.getByText(/còn 5 phút/i)).toBeInTheDocument();
  });

  it("shows the one-minute warning from the server runtime", () => {
    render(<LearnerAssessment view={baseView(runtime({ remainingSeconds: 60 }))} actions={callbacks()} />);
    expect(screen.getByRole("timer")).toHaveTextContent("01:00");
    expect(screen.getByText(/còn 1 phút/i)).toBeInTheDocument();
  });

  it("records a visibility violation and shows the app warning modal", async () => {
    const recordViolation = vi.fn(async () => runtime({ violationCount: 1 }));
    render(<LearnerAssessment view={baseView()} actions={callbacks({ recordAssessmentViolation: recordViolation })} />);
    const audioTrigger = screen.getByRole("button", { name: /nghe \(còn 2 lần\)/i });
    audioTrigger.focus();
    Object.defineProperty(document, "hidden", { configurable: true, value: true });
    await act(async () => { document.dispatchEvent(new Event("visibilitychange")); });
    expect(recordViolation).toHaveBeenCalledWith(baseView().attempt!.id, expect.objectContaining({ reason: "visibility_hidden" }));
    const dialog = await screen.findByRole("dialog");
    expect(dialog).toHaveTextContent(/cảnh báo 1\/3/i);
    expect(dialog).toHaveFocus();
    expect(screen.getByRole("button", { name: /đã hiểu, tiếp tục/i })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /đã hiểu, tiếp tục/i }));
    expect(screen.getByRole("button", { name: /nghe \(còn 2 lần\)/i })).toHaveFocus();
  });

  it("shows the auto-submit countdown when the server reports the violation limit crossed", async () => {
    const recordViolation = vi.fn(async () => runtime({ violationCount: 4, submitReason: "violations", status: "pending_review", currentSection: null, autoSubmitted: true }));
    render(<LearnerAssessment view={baseView()} actions={callbacks({ recordAssessmentViolation: recordViolation })} />);
    Object.defineProperty(document, "hidden", { configurable: true, value: true });
    await act(async () => { document.dispatchEvent(new Event("visibilitychange")); });
    expect(await screen.findByRole("dialog")).toHaveTextContent(/tự động nộp/i);
    expect(screen.getByText("5")).toBeInTheDocument();
  });

  it("explains unsupported microphone capability while keeping file upload available", () => {
    const speaking = baseView(runtime({ currentSection: "speaking" }));
    speaking.screenState = "speaking";
    speaking.attempt!.currentSection = "speaking";
    speaking.attempt!.sectionStatuses = { listening: "completed", reading: "completed", writing: "completed", speaking: "in_progress" };
    speaking.definition.sections[3]!.groups = [{ key: "S", title: "Speaking", instruction: "Nộp bằng chứng nói.", tasks: [{ key: "S1", prompt: "Introduce yourself.", responseType: "speaking_evidence", maxScore: 20 }] }];
    render(<LearnerAssessment view={speaking} actions={callbacks()} />);
    expect(screen.getByText(/trình duyệt này không ghi âm được/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/tải file ghi âm/i)).toBeInTheDocument();
  });

  it("uploads speaking evidence through the existing artifact callback and saves its evidence key", async () => {
    const speaking = baseView(runtime({ currentSection: "speaking" }));
    speaking.screenState = "speaking";
    speaking.attempt!.currentSection = "speaking";
    speaking.attempt!.sectionStatuses = { listening: "completed", reading: "completed", writing: "completed", speaking: "in_progress" };
    speaking.definition.sections[3]!.groups = [{ key: "S", title: "Speaking", instruction: "Nộp bằng chứng nói.", tasks: [{ key: "S1", prompt: "Introduce yourself.", responseType: "speaking_evidence", maxScore: 20 }] }];
    const upload = vi.fn(async () => "assessment-audio/runtime/voice.webm");
    const save = vi.fn();
    render(<LearnerAssessment view={speaking} actions={callbacks({ uploadAssessmentAudio: upload, saveAssessmentResponse: save })} />);
    fireEvent.change(screen.getByLabelText(/tải file ghi âm/i), { target: { files: [new File(["voice"], "voice.webm", { type: "audio/webm" })] } });
    await waitFor(() => expect(upload).toHaveBeenCalledWith(expect.any(File), "voice.webm"));
    await waitFor(() => expect(save).toHaveBeenCalledWith("speaking", "S1", { value: "File ghi âm đã nộp", evidenceType: "audio", artifactKey: "assessment-audio/runtime/voice.webm" }));
  });

  it("disables file upload while saving and reports audio replay failures", async () => {
    const speaking = baseView(runtime({ currentSection: "speaking" }));
    speaking.screenState = "speaking";
    speaking.attempt!.currentSection = "speaking";
    speaking.attempt!.sectionStatuses = { listening: "completed", reading: "completed", writing: "completed", speaking: "in_progress" };
    speaking.definition.sections[3]!.groups = [{ key: "S", title: "Speaking", instruction: "Nộp bằng chứng nói.", tasks: [{ key: "S1", prompt: "Introduce yourself.", responseType: "speaking_evidence", maxScore: 20 }] }];
    let resolveUpload!: (key: string) => void;
    const upload = vi.fn(() => new Promise<string>((resolve) => { resolveUpload = resolve; }));
    const audioPlay = vi.fn().mockRejectedValue(new Error("blocked"));
    vi.stubGlobal("Audio", class { play = audioPlay; });
    render(<LearnerAssessment view={speaking} actions={callbacks({ uploadAssessmentAudio: upload })} />);

    const file = new File(["voice"], "voice.webm", { type: "audio/webm" });
    fireEvent.change(screen.getByLabelText(/tải file ghi âm/i), { target: { files: [file] } });
    expect(screen.getByRole("button", { name: /tải file ghi âm/i })).toBeDisabled();
    resolveUpload("assessment-audio/runtime/voice.webm");
    await waitFor(() => expect(screen.getByRole("button", { name: /nghe lại ghi âm/i })).toBeEnabled());

    fireEvent.click(screen.getByRole("button", { name: /nghe lại ghi âm/i }));
    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent(/không phát lại được/i));
    expect(audioPlay).toHaveBeenCalledOnce();
  });

  it("keeps a recoverable error after section submission fails", async () => {
    const complete = vi.fn(async () => { throw new Error("network"); });
    vi.useFakeTimers();
    render(<LearnerAssessment view={baseView()} actions={callbacks({ completeAssessmentSection: complete })} />);
    fireEvent.click(screen.getByRole("button", { name: /nộp phần nghe/i }));
    fireEvent.click(screen.getByRole("button", { name: /nộp phần này/i }));
    expect(screen.getByText(/nộp phần này sau 5 giây/i)).toBeInTheDocument();
    for (let tick = 0; tick < 5; tick += 1) {
      await act(async () => {
        vi.advanceTimersByTime(1_000);
        await Promise.resolve();
      });
    }
    await act(async () => { await Promise.resolve(); });
    expect(screen.getByRole("alert")).toHaveTextContent(/không thể nộp phần này/i);
    expect(complete).toHaveBeenCalledWith("listening");
    expect(screen.getByRole("button", { name: /nộp phần nghe/i })).not.toBeDisabled();
  });
});
