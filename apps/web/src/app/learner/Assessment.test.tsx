// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { AssessmentRuntimeView, AssessmentSectionCode, AssessmentSectionView } from "@e4s/contracts";
import { LearnerAssessment } from "./Assessment.js";
import { AssessmentRuntime } from "./AssessmentRuntime.js";
import type { AssessmentView, LearnerCallbacks } from "./contracts.js";

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  Reflect.deleteProperty(navigator, "mediaDevices");
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

async function finishSubmitCountdown() {
  for (let second = 0; second < 6; second += 1) {
    await act(async () => { await vi.advanceTimersByTimeAsync(1_000); });
  }
}

describe("assessment HCI states", () => {
  it("warns about unanswered questions before section submission and restores focus after Escape", async () => {
    const user = userEvent.setup();
    const view = makeView();
    render(<LearnerAssessment view={view} actions={makeActions()} />);

    const submit = screen.getByRole("button", { name: /nộp phần nghe/i });
    await user.click(submit);

    const dialog = screen.getByRole("dialog");
    expect(dialog).toHaveTextContent("Còn 1 câu chưa trả lời.");
    expect(dialog.querySelector(".banner.warn")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Huỷ" })).toHaveFocus();
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(submit).toHaveFocus();
  });

  it("does not show a word-count warning when submitting speaking", async () => {
    const user = userEvent.setup();
    const view = makeView({ screenState: "speaking" });
    view.attempt!.currentSection = "speaking";
    view.attempt!.sectionStatuses = { listening: "completed", reading: "completed", writing: "completed", speaking: "in_progress" };
    render(<LearnerAssessment view={view} actions={makeActions()} />);

    await user.click(screen.getByRole("button", { name: "Nộp bài" }));

    const dialog = screen.getByRole("dialog");
    expect(dialog).toHaveTextContent("Chưa có nội dung trả lời.");
    expect(dialog).toHaveTextContent("Còn 1 task chưa có câu trả lời.");
    expect(dialog).not.toHaveTextContent("Chưa đủ số từ.");
  });

  it("keeps the preparation table inside the mobile card", () => {
    const { container } = render(<LearnerAssessment view={makeView({ screenState: "preparation", attempt: null })} actions={makeActions()} />);
    expect(screen.getByRole("table", { name: "Cấu trúc bài test" })).toHaveStyle({ width: "100%", tableLayout: "fixed" });
    expect(screen.getByText("Bắt buộc").closest("article")?.querySelector("svg.lucide-circle-check-big, svg.lucide-check-circle-2")).toBeInTheDocument();
    expect(screen.getByText("Không được phép").closest("article")?.querySelector("svg.lucide-ban")).toBeInTheDocument();
    const equipment = screen.getByRole("group", { name: "Cần chuẩn bị: tai nghe hoặc loa, và micro, kể cả mic trên tai nghe" });
    expect(equipment.querySelector("svg.lucide-headphones")).toBeInTheDocument();
    expect(equipment.querySelector("svg.lucide-mic")).toBeInTheDocument();
    expect(container).not.toHaveTextContent(/✅|⛔|🎧|🎙/u);
  });

  it("uses truthful text-only equipment checks and reflects speech playback status", async () => {
    const user = userEvent.setup();
    const speak = vi.fn();
    render(<LearnerAssessment view={makeView({ screenState: "preparation", attempt: null })} actions={makeActions({ speak })} />);

    const soundButton = screen.getByRole("button", { name: "Nghe thử" });
    const microphoneButton = screen.getByRole("button", { name: "Kiểm tra micro" });
    const equipment = screen.getByRole("group", { name: "Cần chuẩn bị: tai nghe hoặc loa, và micro, kể cả mic trên tai nghe" });
    expect(soundButton.querySelector("svg")).not.toBeInTheDocument();
    expect(microphoneButton.querySelector("svg")).not.toBeInTheDocument();

    await user.click(soundButton);
    expect(speak).toHaveBeenCalledWith(
      "Xin chào. Đây là câu kiểm tra âm thanh. Tai nghe đang hoạt động tốt.",
      "vi-VN",
      expect.objectContaining({ audioSrc: "/media/audio/sound-check-vi.mp3", onStatus: expect.any(Function) })
    );

    const onStatus = speak.mock.calls[0]![2].onStatus as (status: "started" | "ended" | "error" | "unsupported") => void;
    act(() => onStatus("started"));
    expect(screen.getByRole("status", { name: "Trạng thái âm thanh" })).toHaveTextContent("Đang phát…");
    act(() => onStatus("ended"));
    expect(screen.getByRole("status", { name: "Trạng thái âm thanh" })).toHaveTextContent("Đã phát xong ✓");
    expect(equipment.querySelector('[data-equipment="sound"]')).toHaveClass("is-ready");
  });

  it("requires confirmation before starting the assessment", async () => {
    const user = userEvent.setup();
    const actions = makeActions();
    render(<LearnerAssessment view={makeView({ screenState: "preparation", attempt: null })} actions={actions} />);

    const startButton = screen.getByRole("button", { name: "Bắt đầu phần Nghe" });
    expect(startButton).toHaveClass("assessment-start-primary");
    expect(screen.getByRole("link", { name: /Quay lại hồ sơ/i })).not.toHaveClass("assessment-start-primary");
    await user.click(startButton);

    const dialog = screen.getByRole("dialog", { name: "Bắt đầu bài test?" });
    expect(dialog).toHaveClass("assessment-start-dialog");
    expect(actions.startAssessment).not.toHaveBeenCalled();
    expect(dialog.querySelectorAll("p")).toHaveLength(1);
    expect(dialog.querySelector(".assessment-start-copy")).toHaveTextContent("không lưu tạm hay tạm dừng");
    expect(dialog.querySelector(".assessment-start-copy")).toHaveTextContent("Đồng hồ chạy liên tục");
    expect(dialog.querySelector(".assessment-start-copy")).toHaveTextContent("20 phút");
    expect(dialog.querySelectorAll(".assessment-start-keyword")).toHaveLength(3);
    expect(dialog.querySelector(".assessment-start-keyword")).toHaveTextContent("không lưu tạm hay tạm dừng");
    expect(dialog.querySelector("[role='note']")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Đóng hộp thoại" })).toHaveClass("modal-close-button");
    expect(screen.getByRole("dialog", { name: "Bắt đầu bài test?" })).toHaveTextContent(/tối đa 20 phút/i);

    await user.click(screen.getByRole("button", { name: "Tôi đã sẵn sàng, bắt đầu" }));
    expect(actions.startAssessment).toHaveBeenCalledOnce();
  });

  it("marks selected assessment answers for neutral choice styling", async () => {
    const user = userEvent.setup();
    render(<LearnerAssessment view={makeView()} actions={makeActions()} />);

    const answer = screen.getByRole("radio", { name: "A" });
    await user.click(answer);

    expect(answer).toHaveClass("assessment-choice-input");
    expect(answer.closest("label")).toHaveClass("assessment-choice");
  });

  it("persists every visible answer again before advancing the section", async () => {
    vi.useFakeTimers();
    const saveAssessmentResponse = vi.fn().mockResolvedValue(undefined);
    const completeAssessmentSection = vi.fn().mockResolvedValue(undefined);
    render(<LearnerAssessment view={makeView()} actions={makeActions({ saveAssessmentResponse, completeAssessmentSection })} />);

    fireEvent.click(screen.getByRole("radio", { name: "A" }));
    fireEvent.click(screen.getByRole("button", { name: /nộp phần nghe/i }));
    fireEvent.click(screen.getByRole("button", { name: "Nộp phần này" }));
    await finishSubmitCountdown();

    expect(saveAssessmentResponse).toHaveBeenLastCalledWith("listening", "listening-task", { value: "a", evidenceType: "choice" });
    expect(saveAssessmentResponse).toHaveBeenCalledTimes(2);
    expect(completeAssessmentSection).toHaveBeenCalledWith("listening");
  });

  it("stays in the section when the final persistence check fails", async () => {
    vi.useFakeTimers();
    const saveAssessmentResponse = vi.fn()
      .mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce(new Error("offline"));
    const completeAssessmentSection = vi.fn();
    render(<LearnerAssessment view={makeView()} actions={makeActions({ saveAssessmentResponse, completeAssessmentSection })} />);

    fireEvent.click(screen.getByRole("radio", { name: "A" }));
    fireEvent.click(screen.getByRole("button", { name: /nộp phần nghe/i }));
    fireEvent.click(screen.getByRole("button", { name: "Nộp phần này" }));
    await finishSubmitCountdown();

    expect(completeAssessmentSection).not.toHaveBeenCalled();
    expect(screen.getByRole("alert")).toHaveTextContent("Không lưu đủ câu trả lời");
  });

  it("renders speaking as four prototype task sections with a data table", () => {
    const speaking = sections.find((section) => section.code === "speaking")!;
    speaking.groups = [
      { key: "S1", title: "Task 1 – Warm-up (3 phút · A1–A2)", instruction: "The examiner asks:", tasks: [{ key: "S1", prompt: "1. What do you do?\n2. What are your main responsibilities?\n3. What English do you use at work?\n4. What is one situation in which you find English difficult?", responseType: "speaking_evidence", maxScore: 5, hint: "Trả lời lần lượt 4 câu hỏi, mỗi câu 2–4 câu nói." }] },
      { key: "S2", title: "Task 2 – Data description (4 phút · B1–B2)", instruction: "You are in a team meeting. Speak for 1–2 minutes after looking at the data.", stimulus: { type: "table", headers: ["Quarter", "Total complaints", "Most common issue"], rows: [["Q1", "120", "Delayed shipping"], ["Q2", "115", "Delayed shipping"], ["Q3", "280", "Software bugs"]] }, tasks: [{ key: "S2", prompt: "1. Summarise the main trend in the numbers.\n2. Point out the biggest change in Q3.\n3. Suggest one short-term action the team should take to deal with the Q3 problem.", responseType: "speaking_evidence", maxScore: 5, hint: "Dùng từ vựng mô tả số liệu: increase, decrease, remain stable, the biggest change…" }] },
      { key: "S3", title: "Task 3 – Roleplay (4 phút · B2–C1)", instruction: "You are a Customer Care Specialist. The examiner plays a customer who is very upset.", tasks: [{ key: "S3", prompt: "The refund has not arrived, although the customer was told it would arrive within five days. Apologise, explain the accounting system error and clearly commit to a solution.", responseType: "speaking_evidence", maxScore: 5, hint: "Giao tiếp trực tiếp như đang nói với khách hàng." }] },
      { key: "S4", title: "Task 4 – Monologue (4 phút · B2–C1)", instruction: "Give a short presentation to your team.", tasks: [{ key: "S4", prompt: "Present the benefits and challenges of a centralised internal knowledge platform. Include examples and a conclusion.", responseType: "speaking_evidence", maxScore: 5, hint: "Nêu ít nhất hai lợi ích và hai thách thức." }] }
    ];
    const view = makeView({
      screenState: "speaking",
      attempt: { ...makeView().attempt!, currentSection: "speaking", sectionStatuses: { listening: "completed", reading: "completed", writing: "completed", speaking: "in_progress" } }
    });
    view.definition.sections[3] = speaking;

    const { container } = render(<LearnerAssessment view={view} actions={makeActions()} />);

    expect(container.querySelectorAll(".assessment-task-group-speaking")).toHaveLength(4);
    expect(screen.getByRole("heading", { name: /Task 1 – Warm-up \(3 phút · A1–A2\)/ })).toBeInTheDocument();
    expect(screen.getByText("The examiner asks:")).toBeInTheDocument();
    expect(screen.getByRole("table", { name: "Dữ liệu khiếu nại theo quý" })).toBeInTheDocument();
    expect(screen.getAllByLabelText("Tải file ghi âm")).toHaveLength(4);
    expect(screen.queryByText("Speaking tasks")).not.toBeInTheDocument();
  });

  it("shows one clear microphone permission message", async () => {
    const user = userEvent.setup();
    Object.defineProperty(navigator, "mediaDevices", {
      configurable: true,
      value: { getUserMedia: vi.fn().mockRejectedValue(new Error("permission denied")) }
    });
    render(<LearnerAssessment view={makeView({ screenState: "preparation", attempt: null })} actions={makeActions()} />);

    await user.click(screen.getByRole("button", { name: "Kiểm tra micro" }));

    expect(screen.getAllByRole("alert")).toHaveLength(1);
    expect(screen.getByRole("alert")).toHaveTextContent("Chưa truy cập được micro. Hãy cấp quyền rồi thử lại.");
  });

  it("marks the microphone ready after permission succeeds", async () => {
    const user = userEvent.setup();
    const stop = vi.fn();
    Object.defineProperty(navigator, "mediaDevices", {
      configurable: true,
      value: { getUserMedia: vi.fn().mockResolvedValue({ getAudioTracks: () => [{ stop }], getTracks: () => [{ stop }] }) }
    });
    render(<LearnerAssessment view={makeView({ screenState: "preparation", attempt: null })} actions={makeActions()} />);

    await user.click(screen.getByRole("button", { name: "Kiểm tra micro" }));

    expect(screen.getByRole("status", { name: "Trạng thái micro" })).toHaveTextContent("Micro sẵn sàng ✓");
    expect(screen.getByRole("group", { name: "Cần chuẩn bị: tai nghe hoặc loa, và micro, kể cả mic trên tai nghe" }).querySelector('[data-equipment="microphone"]')).toHaveClass("is-ready");
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(stop).toHaveBeenCalledTimes(1);
  });

  it("tries an available headset input when the default input is unavailable", async () => {
    const user = userEvent.setup();
    const stop = vi.fn();
    const getUserMedia = vi.fn()
      .mockRejectedValueOnce(new DOMException("No default input", "NotFoundError"))
      .mockResolvedValueOnce({ getAudioTracks: () => [{ stop }], getTracks: () => [{ stop }] });
    Object.defineProperty(navigator, "mediaDevices", {
      configurable: true,
      value: {
        getUserMedia,
        enumerateDevices: vi.fn().mockResolvedValue([{ kind: "audioinput", deviceId: "headset-mic", label: "Headset Microphone" }])
      }
    });
    render(<LearnerAssessment view={makeView({ screenState: "preparation", attempt: null })} actions={makeActions()} />);

    await user.click(screen.getByRole("button", { name: "Kiểm tra micro" }));

    expect(getUserMedia).toHaveBeenNthCalledWith(2, { audio: { deviceId: { exact: "headset-mic" } } });
    expect(screen.getByRole("status", { name: "Trạng thái micro" })).toHaveTextContent("Micro sẵn sàng ✓");
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
