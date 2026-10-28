// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { LearnerChallenge, LearnerCoach, LearnerPractice } from "./CoachPractice.js";
import type { LearnerCallbacks, PracticeView } from "./contracts.js";

afterEach(() => {
  cleanup();
  Reflect.deleteProperty(window, "SpeechRecognition");
  Reflect.deleteProperty(window, "webkitSpeechRecognition");
  Reflect.deleteProperty(navigator, "mediaDevices");
  Reflect.deleteProperty(globalThis, "MediaRecorder");
  vi.restoreAllMocks();
});

const actions = () => ({
  sendCoachMessage: vi.fn(),
  changeCoachPersona: vi.fn(),
  startNewCoachChat: vi.fn(),
  sendChallengeMessage: vi.fn(),
  submitWeeklyPractice: vi.fn(),
  speak: vi.fn()
} as unknown as LearnerCallbacks);

const coach = {
  sessionId: "session-1", topic: "Meetings", cefr: "A2", persona: "informal", aiAvailable: true,
  daily: { used: 0, limit: 30 }, weekly: { turns: 0, target: 50 }, messages: [], vocabulary: [],
  levelApproved: true
} as any;

const practice = {
  state: "open", weekId: "week-1", weekNumber: 1, topic: "Meetings", completedLessons: 5, totalLessons: 5,
  task: "Introduce your role.", guidance: "Use at least eight words.", submission: null
} as PracticeView;

let latestRecognition: FakeSpeechRecognition | undefined;

class FakeSpeechRecognition {
  lang = "";
  interimResults = false;
  maxAlternatives = 0;
  onresult: ((event: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null = null;
  onerror: (() => void) | null = null;
  onend: (() => void) | null = null;
  start = vi.fn();
  stop = vi.fn(() => this.onend?.());

  constructor() {
    latestRecognition = this;
  }
}

class FakeMediaRecorder {
  mimeType = "audio/webm;codecs=opus";
  ondataavailable: ((event: { data: Blob }) => void) | null = null;
  onerror: (() => void) | null = null;
  onstop: (() => void) | null = null;
  start = vi.fn();
  stop = vi.fn(() => {
    this.ondataavailable?.({ data: new Blob(["recorded voice"], { type: "audio/webm;codecs=opus" }) });
    this.onstop?.();
  });
  constructor(_stream: MediaStream) {}
}

function enableSpeechRecognition() {
  Object.defineProperty(window, "SpeechRecognition", {
    configurable: true,
    value: FakeSpeechRecognition
  });
}

describe("app coach and weekly practice speech input", () => {
  it("normalizes Season audioArtifact responses into a playable recording beside the transcript", () => {
    render(<LearnerCoach view={{ ...coach, messages: [{ id: "turn-1", speaker: "learner", text: "I can help", createdAt: "2026-10-28T00:00:00.000Z", audioArtifact: { fileId: "season-file", artifactKey: "audio/season.webm", signedUrl: "/audio/season.webm" } }] }} actions={actions()} />);
    expect(screen.getByLabelText("Phát Bản ghi âm câu trả lời")).toHaveAttribute("src", "/audio/season.webm");
    expect(screen.getAllByText("I can help").length).toBeGreaterThanOrEqual(2);
  });

  it("normalizes weekly submission audioArtifact responses while retaining feedback", () => {
    render(<LearnerPractice view={{ ...practice, state: "submitted", submission: {
      id: "submission-1", status: "submitted", text: "I coordinate the weekly project meeting every Monday morning.", submittedAt: "2026-10-28T00:00:00.000Z", score: null,
      feedback: "Result kept after playback", suggestions: [], correctedText: "", audioArtifact: { fileId: "weekly-file", artifactKey: "audio/weekly.webm", signedUrl: "/audio/weekly.webm" }
    } }} actions={actions()} />);
    expect(screen.getByLabelText("Phát Bản ghi âm bài thực hành")).toHaveAttribute("src", "/audio/weekly.webm");
    expect(screen.getByText("Result kept after playback")).toBeInTheDocument();
  });

  it("shows weekly-practice unlock progress against the fixed five-lesson requirement", () => {
    render(<LearnerPractice view={{ ...practice, state: "locked", completedLessons: 0, totalLessons: 0 }} actions={actions()} />);

    expect(screen.getByText("0/5 bài đã hoàn thành")).toBeInTheDocument();
    expect(screen.queryByText("0/0 bài đã hoàn thành")).not.toBeInTheDocument();
    expect(screen.getByRole("progressbar", { name: "Tiến độ mở bài thực hành" })).toHaveAttribute("aria-valuemax", "5");
  });

  it("keeps clear-chat focus inside the confirmation dialog", async () => {
    const user = userEvent.setup();
    const callback = actions();
    render(<LearnerCoach view={coach} actions={callback} />);

    await user.click(screen.getByRole("button", { name: "Xoá chat" }));
    const dialog = screen.getByRole("dialog", { name: "Xoá đoạn chat này?" });
    const cancel = within(dialog).getByRole("button", { name: "Huỷ" });
    const confirm = within(dialog).getByRole("button", { name: "Xoá chat" });
    expect(cancel).toHaveFocus();

    await user.tab();
    expect(confirm).toHaveFocus();
    await user.tab();
    expect(cancel).toHaveFocus();
    await user.keyboard("{Shift>}{Tab}{/Shift}");
    expect(confirm).toHaveFocus();
  });

  it("matches the canonical Coach header, counters, cap state, and clear-chat confirmation", async () => {
    const callback = actions();
    const user = userEvent.setup();
    const { rerender } = render(<LearnerCoach view={{ ...coach, weekly: { turns: 1, target: 50 } }} actions={callback} />);

    expect(screen.getByRole("heading", { name: "Season" })).toBeInTheDocument();
    expect(screen.getByText("Meetings · A2")).toBeInTheDocument();
    expect(screen.getByText("Hôm nay 0/30 lượt")).toBeInTheDocument();
    expect(screen.getByText("Tuần này 1 lượt · mục tiêu ≥50")).toBeInTheDocument();
    expect(screen.getByText("Giới hạn chat hoạt động thế nào?")).toBeInTheDocument();
    expect(document.querySelector(".coach-brand-icon")).toBeInTheDocument();
    expect(screen.getByTestId("season-mark")).toHaveClass("coach-season-mark");
    const personaSwitch = screen.getByRole("switch", { name: "Phong cách của Season" });
    expect(personaSwitch).toHaveAttribute("aria-checked", "false");
    expect(personaSwitch.querySelector(".coach-persona-indicator")).not.toBeInTheDocument();
    await user.click(personaSwitch);
    expect(callback.changeCoachPersona).toHaveBeenCalledWith("formal");
    expect(screen.getByRole("button", { name: "Xoá chat" })).toHaveClass("btn-danger");

    await user.click(screen.getByRole("button", { name: "Xoá chat" }));
    const dialog = screen.getByRole("dialog", { name: "Xoá đoạn chat này?" });
    expect(dialog).toHaveTextContent(/không khôi phục lại được/i);
    expect(dialog).not.toHaveTextContent(/ô từ đã mở sẽ biến mất/i);
    await user.click(within(dialog).getByRole("button", { name: "Xoá chat" }));
    expect(callback.startNewCoachChat).toHaveBeenCalledTimes(1);

    rerender(<LearnerCoach view={{ ...coach, daily: { used: 30, limit: 30 } }} actions={callback} />);
    expect(screen.getByText(/đã dùng hết 30 lượt chat hôm nay/i)).toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: "Tin nhắn cho Season" })).toBeDisabled();
  });

  it("keeps the chat-limit summary fixed while its explanation expands below", async () => {
    const user = userEvent.setup();
    render(<LearnerCoach view={coach} actions={actions()} />);
    const summary = screen.getByText("Giới hạn chat hoạt động thế nào?");
    const details = summary.closest("details");
    expect(details).not.toHaveAttribute("open");
    await user.click(summary);
    expect(details).toHaveAttribute("open");
    expect(document.querySelector(".coach-limit-copy")).toHaveClass("coach-limit-copy--full");
    expect(document.querySelector(".coach-limit-copy")).toHaveClass("coach-limit-copy--plain");
    await user.click(summary);
    expect(details).not.toHaveAttribute("open");
  });

  it("sends with Enter and lets Shift+Enter grow the composer onto a new line", async () => {
    const callback = actions();
    render(<LearnerCoach view={coach} actions={callback} />);
    const composer = screen.getByRole("textbox", { name: "Tin nhắn cho Season" });

    fireEvent.change(composer, { target: { value: "First line\nSecond line" } });
    Object.defineProperty(composer, "scrollHeight", { configurable: true, value: 84 });
    fireEvent.keyDown(composer, { key: "Enter", code: "Enter", shiftKey: true });
    fireEvent.change(composer, { target: { value: "First line\nSecond line\n" } });
    expect(callback.sendCoachMessage).not.toHaveBeenCalled();
    expect(composer).toHaveStyle({ height: "84px" });

    fireEvent.change(composer, { target: { value: "Send this" } });
    fireEvent.keyDown(composer, { key: "Enter", code: "Enter" });
    await waitFor(() => expect(callback.sendCoachMessage).toHaveBeenCalledWith("Send this"));
  });

  it("renders concise Season feedback with a plain next question and readable details", () => {
    render(<LearnerCoach view={{ ...coach, messages: [{
      id: "coach-structured", speaker: "coach", text: "Thanks. Could you shorten the bullet points?", createdAt: "2026-10-22T00:00:00.000Z",
      feedback: {
        relevant: true, relevanceNote: "", evaluation: { status: "valid", result: "partially_correct", countsTowardGoal: true, noteVi: "Đúng trọng tâm." },
        seasonReply: "Thanks for the clear answer.", seasonReplyTranslation: "Cảm ơn câu trả lời rõ ràng.",
        nextQuestion: "Could you shorten the bullet points?", nextQuestionTranslation: "Bạn có thể rút ngắn các gạch đầu dòng không?",
        rubric: {
          meaning: { score: 4, evidence: "The slide is clearly identified.", improvement: "Add the reason." },
          vocabulary: { score: 3, evidence: "Uses slide and text.", improvement: "Try bullet points." },
          grammar: { score: 3, evidence: "The subject is singular.", improvement: "Use has, not have." }
        },
        corrections: [{ original: "The slide have", corrected: "The slide has", translation: "Trang chiếu có", reason: "Use has with a singular subject." }],
        correctedText: "The slide has too much text.",
        suggestedAnswer: { text: "I can shorten the bullet points.", translation: "Tôi có thể rút ngắn các gạch đầu dòng." }
      }
    }] }} actions={actions()} />);
    const feedback = screen.getByRole("region", { name: "Phản hồi của Season" });
    expect(feedback.querySelector(".coach-feedback-summary")).not.toBeNull();
    expect(feedback.querySelectorAll(".coach-feedback-score")).toHaveLength(3);
    expect(within(feedback).getByRole("heading", { name: "Câu bạn nên nói tiếp" })).toBeInTheDocument();
    expect(within(feedback).getByText("Could you shorten the bullet points?")).toBeInTheDocument();
    const seasonHeading = within(feedback).getByRole("heading", { name: "Câu Season trả lời" });
    const evaluationHeading = within(feedback).getByRole("heading", { name: "Nhận xét câu trả lời của bạn" });
    const correctionHeading = within(feedback).getByRole("heading", { name: "Câu sửa" });
    const nextQuestion = within(feedback).getByText("Could you shorten the bullet points?");
    expect(seasonHeading.compareDocumentPosition(evaluationHeading) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(evaluationHeading.compareDocumentPosition(correctionHeading) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(within(feedback).getByLabelText("Câu Season trả lời")).not.toContainElement(nextQuestion);
    expect(within(feedback).getByLabelText("Câu bạn nên nói tiếp")).toContainElement(nextQuestion);
    expect(within(feedback).getByText("Kết quả: Đúng một phần")).toBeInTheDocument();
    expect(within(feedback).getByLabelText("Nhận xét câu trả lời của bạn")).not.toHaveTextContent("Thanks for the clear answer.");
    expect(within(feedback).queryByText("Ý nghĩa ba điểm")).not.toBeInTheDocument();
    expect(within(feedback).getByRole("heading", { name: "Gợi ý trả lời câu tiếp theo" })).toBeInTheDocument();
    const details = within(feedback).getByText("Xem giải thích và gợi ý").closest("details");
    expect(details).not.toHaveAttribute("open");
    expect(feedback.querySelectorAll("details")).toHaveLength(1);
    expect(feedback.querySelectorAll(".coach-feedback-section")).toHaveLength(3);
    expect(feedback.querySelectorAll(".coach-feedback-criterion-card")).toHaveLength(3);
    expect(within(feedback).getByText("Cảm ơn câu trả lời rõ ràng.")).toBeInTheDocument();
    expect(within(feedback).getByText("Bạn có thể rút ngắn các gạch đầu dòng không?")).toBeInTheDocument();
    expect(within(feedback).getByText(/The slide is clearly identified\./)).toBeInTheDocument();
    expect(within(feedback).getByText(/Use has, not have\./)).toBeInTheDocument();
    expect(within(feedback).getByText("I can shorten the bullet points.")).toBeInTheDocument();
    expect(within(feedback).getByText("Tôi có thể rút ngắn các gạch đầu dòng.")).toBeInTheDocument();
  });

  it("does not claim there is nothing to fix when rubric improvements exist", () => {
    render(<LearnerCoach view={{ ...coach, messages: [{
      id: "coach-no-correction", speaker: "coach", text: "Good start. Where is the meeting room?", createdAt: "2026-10-22T00:00:00.000Z",
      feedback: {
        relevant: true, relevanceNote: "", evaluation: { status: "valid", result: "partially_correct", countsTowardGoal: true, noteVi: "Câu đúng nhưng có thể rõ hơn." },
        seasonReply: "Good start.", seasonReplyTranslation: "Khởi đầu tốt.",
        nextQuestion: "Where is the meeting room?", nextQuestionTranslation: "Phòng họp ở đâu?",
        rubric: {
          meaning: { score: 4, evidence: "The answer is relevant.", improvement: "Add the location." },
          vocabulary: { score: 4, evidence: "Uses workplace words.", improvement: "Use meeting room." },
          grammar: { score: 5, evidence: "The sentence is grammatical.", improvement: "Keep this structure." }
        },
        corrections: [], correctedText: "", suggestedAnswer: { text: "The meeting room is on the second floor.", translation: "Phòng họp ở tầng hai." }
      }
    }] }} actions={actions()} />);

    const correction = screen.getByLabelText("Câu sửa");
    expect(correction).toHaveTextContent("Không có lỗi cần sửa trực tiếp. Xem gợi ý cải thiện trong phần giải thích.");
    expect(correction).not.toHaveTextContent("Không có lỗi cần sửa.");
  });

  it("keeps secret words locked until used and offers TTS for every Coach turn", async () => {
    enableSpeechRecognition();
    const callback = actions();
    const user = userEvent.setup();
    render(<LearnerCoach view={{ ...coach, messages: [{ id: "coach-1", speaker: "coach", text: "What is on the agenda?", createdAt: "now" }], vocabulary: [
      { word: "agenda", meaning: "chương trình họp", opened: false },
      { word: "deadline", meaning: "hạn chót", opened: true }
    ] }} actions={callback} />);

    expect(screen.queryByRole("button", { name: "Mở từ bí mật 1" })).not.toBeInTheDocument();
    expect(screen.getByText("Gợi ý: chương trình họp")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Nghe từ deadline: hạn chót" })).toHaveClass("coach-word-chip");
    await user.click(screen.getByRole("button", { name: "Nghe câu của Season" }));
    expect(callback.speak).toHaveBeenCalledWith("What is on the agenda?", "en-US");
    expect(screen.getByRole("button", { name: "Nói" })).toHaveClass("coach-compose-icon");
    expect(screen.getByRole("button", { name: "Gửi" })).toHaveClass("coach-send");
    expect(screen.getByRole("button", { name: "Gửi" }).querySelector("svg")).toBeInTheDocument();
  });

  it("reads only the English Coach reply and question after structured feedback", async () => {
    const callback = actions();
    const user = userEvent.setup();
    render(<LearnerCoach view={{ ...coach, messages: [{
      id: "coach-insufficient", speaker: "coach", text: "Hãy viết một câu tiếng Anh đầy đủ.", createdAt: "now",
      feedback: {
        relevant: false, relevanceNote: "", evaluation: { status: "insufficient", result: "missing_information", countsTowardGoal: false, noteVi: "Câu trả lời chưa đủ ý." },
        seasonReply: "Please write a complete English sentence.", seasonReplyTranslation: "Hãy viết một câu tiếng Anh đầy đủ.",
        nextQuestion: "What would you say first?", nextQuestionTranslation: "Bạn sẽ nói gì trước tiên?",
        rubric: {
          meaning: { score: 0, evidence: "Chưa đủ ý.", improvement: "Viết một câu đầy đủ." },
          vocabulary: { score: 0, evidence: "Chưa đủ từ.", improvement: "Dùng từ đúng chủ đề." },
          grammar: { score: 0, evidence: "Chưa đủ câu.", improvement: "Thêm chủ ngữ và động từ." }
        },
        corrections: [], correctedText: "", suggestedAnswer: { text: "", translation: "" }
      }
    }] }} actions={callback} />);

    await user.click(screen.getByRole("button", { name: "Nghe câu của Season" }));
    expect(callback.speak).toHaveBeenCalledWith("Please write a complete English sentence.", "en-US");
    expect(callback.speak).not.toHaveBeenCalledWith(expect.stringContaining("Hãy"), expect.anything());
  });

  it("labels a repeated question as a retry instead of a new next sentence", () => {
    render(<LearnerCoach view={{ ...coach, messages: [{
      id: "coach-retry", speaker: "coach", text: "Please try again.", createdAt: "now",
      feedback: {
        relevant: false, relevanceNote: "", evaluation: { status: "insufficient", result: "missing_information", countsTowardGoal: false, noteVi: "Câu trả lời chưa đủ ý." },
        seasonReply: "Please write a complete English sentence.", seasonReplyTranslation: "Hãy viết một câu tiếng Anh đầy đủ.",
        nextQuestion: "What would you say first?", nextQuestionTranslation: "Bạn sẽ nói gì trước tiên?",
        rubric: {
          meaning: { score: 0, evidence: "Chưa đủ ý.", improvement: "Viết một câu đầy đủ." },
          vocabulary: { score: 0, evidence: "Chưa đủ từ.", improvement: "Dùng từ đúng chủ đề." },
          grammar: { score: 0, evidence: "Chưa đủ câu.", improvement: "Thêm chủ ngữ và động từ." }
        },
        corrections: [], correctedText: "", suggestedAnswer: { text: "", translation: "" }
      }
    }] }} actions={actions()} />);

    expect(screen.getByRole("heading", { name: "Câu cần trả lời lại" })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Câu bạn nên nói tiếp" })).not.toBeInTheDocument();
    expect(screen.getByText("Hãy trả lời lại câu hỏi Season vừa hỏi bằng một câu tiếng Anh đầy đủ.")).toBeInTheDocument();
    expect(screen.queryByText("What would you say first?")).not.toBeInTheDocument();
  });

  it("drops sentence-like secret-word data before it can overflow the vocabulary row", () => {
    render(<LearnerCoach view={{ ...coach, vocabulary: [
      { word: "company", meaning: "công ty", opened: true },
      { word: "dùng khi chào hỏi đặc biệt khi bắt đầu một cuộc trò chuyện dài", meaning: "mẫu", opened: true },
      { word: "late delivery", meaning: "sự giao hàng trễ", opened: false }
    ] }} actions={actions()} />);

    expect(screen.getByRole("button", { name: "Nghe từ company: công ty" })).toBeInTheDocument();
    expect(screen.getByText("Gợi ý: sự giao hàng trễ")).toBeInTheDocument();
    expect(screen.queryByText(/dùng khi chào hỏi/i)).not.toBeInTheDocument();
  });

  it("QA Đợt 4 L-054/A-030 reads the English Season reply instead of Vietnamese fallback text", async () => {
    const callback = actions();
    const user = userEvent.setup();
    render(<LearnerCoach view={{ ...coach, messages: [{
      id: "coach-insufficient", speaker: "coach",
      text: "Hãy viết một câu tiếng Anh đầy đủ để Season hiểu câu trả lời của bạn.", createdAt: "now",
      feedback: {
        relevant: true, relevanceNote: "",
        evaluation: { status: "insufficient", result: "missing_information", countsTowardGoal: false, noteVi: "Hãy viết một câu đầy đủ." },
        seasonReply: "Please write a complete English sentence so I can understand your answer.",
        seasonReplyTranslation: "Hãy viết một câu tiếng Anh đầy đủ để Season hiểu câu trả lời của bạn.",
        nextQuestion: "What would you say first?", nextQuestionTranslation: "Bạn sẽ nói gì trước tiên?",
        rubric: {
          meaning: { score: 0, evidence: "Chưa đủ thông tin.", improvement: "Viết câu đầy đủ." },
          vocabulary: { score: 0, evidence: "Chưa đủ nội dung.", improvement: "Dùng từ liên quan." },
          grammar: { score: 0, evidence: "Chưa đủ câu.", improvement: "Viết câu hoàn chỉnh." }
        },
        corrections: [], correctedText: "", suggestedAnswer: { text: "", translation: "" }
      }
    }] }} actions={callback} />);

    await user.click(screen.getByRole("button", { name: "Nghe câu của Season" }));
    expect(callback.speak).toHaveBeenCalledWith(
      "Please write a complete English sentence so I can understand your answer.",
      "en-US"
    );
  });

  it("matches the canonical active challenge header, threshold copy, and daily-cap state", () => {
    render(<LearnerChallenge view={{
      sessionId: "challenge-1", assessmentAttemptId: "attempt-1", targetLevel: "B1", aiAvailable: true,
      daily: { used: 20, limit: 20 }, progress: { completedTurns: 2, requiredTurns: 6, average: 3.5, offTopic: 1, complete: false, passed: false },
      messages: [], phase: "resume"
    }} actions={actions()} />);

    expect(screen.getByRole("heading", { name: "Thử thách lên mức B1" })).toBeInTheDocument();
    expect(screen.getByText("Season nói ở mức B1 · lượt 2/6")).toBeInTheDocument();
    expect(screen.getByText("TB 3.5/5 · lạc đề 1")).toBeInTheDocument();
    expect(screen.getByText("3.5/5")).toBeInTheDocument();
    expect(screen.getByText(/đã dùng hết 20 lượt chat hôm nay/i)).toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: "Câu trả lời thử thách" })).toBeDisabled();
  });

  it("keeps assistant bubbles distinct and removes the empty challenge spacer", () => {
    render(<LearnerCoach view={{ ...coach, messages: [{ id: "coach-1", speaker: "coach", text: "Try again.", createdAt: "now" }, { id: "learner-1", speaker: "learner", text: "I will.", createdAt: "now" }] }} actions={actions()} />);
    expect(screen.getByText("Try again.").closest("article")).toHaveClass("msg", "ai");
    expect(screen.getByText("I will.").closest("article")).toHaveClass("msg", "user");

    const { unmount } = render(<LearnerChallenge view={{
      sessionId: "challenge-1", assessmentAttemptId: "attempt-1", targetLevel: "B1", aiAvailable: true,
      daily: { used: 0, limit: 20 }, progress: { completedTurns: 0, requiredTurns: 6, average: 0, offTopic: 0, complete: false, passed: false },
      messages: [], phase: "new"
    }} actions={actions()} />);
    expect(screen.getByRole("region", { name: "Cuộc trò chuyện thử thách" })).toHaveStyle({ minHeight: "0px" });
    unmount();
  });

  it("focuses the clear-chat dialog and restores focus after cancel", async () => {
    const callback = actions();
    const user = userEvent.setup();
    render(<LearnerCoach view={coach} actions={callback} />);
    const clearButton = screen.getByRole("button", { name: "Xoá chat" });

    await user.click(clearButton);
    const dialog = screen.getByRole("dialog", { name: "Xoá đoạn chat này?" });
    expect(dialog).toHaveAttribute("aria-describedby");
    expect(screen.getByRole("button", { name: "Huỷ" })).toHaveFocus();

    await user.click(screen.getByRole("button", { name: "Huỷ" }));
    expect(clearButton).toHaveFocus();
  });

  it("prevents duplicate challenge sends while the callback is pending", async () => {
    let resolveSend!: () => void;
    const sendChallengeMessage = vi.fn(() => new Promise<void>((resolve) => { resolveSend = resolve; }));
    const callback = { ...actions(), sendChallengeMessage } as unknown as LearnerCallbacks;
    const user = userEvent.setup();
    render(<LearnerChallenge view={{
      sessionId: "challenge-1", assessmentAttemptId: "attempt-1", targetLevel: "B1", aiAvailable: true,
      daily: { used: 0, limit: 20 }, progress: { completedTurns: 0, requiredTurns: 6, average: 0, offTopic: 0, complete: false, passed: false },
      messages: [], phase: "new"
    }} actions={callback} />);

    const input = screen.getByRole("textbox", { name: "Câu trả lời thử thách" });
    await user.type(input, "Answer");
    await user.click(screen.getByRole("button", { name: "Gửi lượt này" }));
    expect(input).toBeDisabled();
    expect(screen.getByRole("button", { name: "Gửi lượt này" })).toBeDisabled();
    expect(input.closest("form")).toHaveAttribute("aria-busy", "true");
    expect(sendChallengeMessage).toHaveBeenCalledTimes(1);

    resolveSend();
    await waitFor(() => expect(input).not.toBeDisabled());
  });

  it("keeps the challenge draft and announces a send failure", async () => {
    let rejectSend!: (reason?: unknown) => void;
    const sendChallengeMessage = vi.fn(() => new Promise<never>((_, reject) => { rejectSend = reject; }));
    const callback = { ...actions(), sendChallengeMessage } as unknown as LearnerCallbacks;
    const user = userEvent.setup();
    render(<LearnerChallenge view={{
      sessionId: "challenge-1", assessmentAttemptId: "attempt-1", targetLevel: "B1", aiAvailable: true,
      daily: { used: 0, limit: 20 }, progress: { completedTurns: 0, requiredTurns: 6, average: 0, offTopic: 0, complete: false, passed: false },
      messages: [], phase: "new"
    }} actions={callback} />);

    const input = screen.getByRole("textbox", { name: "Câu trả lời thử thách" });
    await user.type(input, "Answer");
    await user.click(screen.getByRole("button", { name: "Gửi lượt này" }));
    rejectSend(new Error("CHALLENGE_SEND_FAILED"));

    expect(await screen.findByRole("alert")).toHaveTextContent("Chưa gửi được lượt này");
    await waitFor(() => expect(input).not.toBeDisabled());
    expect(input).toHaveValue("Answer");
    expect(screen.getByRole("button", { name: "Gửi lượt này" })).toBeEnabled();
  });

  it("keeps the Coach draft recoverable when sending fails", async () => {
    let rejectSend!: (reason?: unknown) => void;
    const sendCoachMessage = vi.fn(() => new Promise<never>((_, reject) => { rejectSend = reject; }));
    const callback = { ...actions(), sendCoachMessage } as unknown as LearnerCallbacks;
    const user = userEvent.setup();
    render(<LearnerCoach view={coach} actions={callback} />);

    const draft = screen.getByRole("textbox", { name: "Tin nhắn cho Season" });
    await user.type(draft, "I coordinate the weekly meeting.");
    await user.click(screen.getByRole("button", { name: "Gửi" }));

    expect(screen.getByRole("button", { name: "Đang gửi…" })).toBeDisabled();
    expect(draft).toBeDisabled();
    expect(draft).toHaveValue("I coordinate the weekly meeting.");
    expect(screen.getByLabelText("Tin nhắn đang gửi")).toHaveTextContent("I coordinate the weekly meeting.");
    expect(sendCoachMessage).toHaveBeenCalledWith("I coordinate the weekly meeting.");

    rejectSend(new Error("COACH_SEND_FAILED"));
    const error = await screen.findByRole("alert");
    expect(error).toHaveTextContent("Chưa gửi được tin nhắn");
    expect(error.parentElement).toHaveClass("coach-error-row");
    expect(screen.queryByLabelText("Tin nhắn đang gửi")).not.toBeInTheDocument();
    await waitFor(() => expect(draft).toHaveValue("I coordinate the weekly meeting."));
    expect(screen.getByRole("button", { name: "Gửi" })).toBeEnabled();
    expect(draft).toBeEnabled();
  });

  it("only renders the Coach microphone when Web Speech API is available", () => {
    render(<LearnerCoach view={coach} actions={actions()} />);
    expect(screen.queryByRole("button", { name: "Nói" })).not.toBeInTheDocument();

    enableSpeechRecognition();
    render(<LearnerCoach view={coach} actions={actions()} />);
    const microphone = screen.getByRole("button", { name: "Nói" });
    expect(microphone).toBeInTheDocument();
    expect(microphone.querySelector("svg.lucide-mic")).toBeInTheDocument();
  });

  it("uses a standard lock icon for unopened vocabulary", () => {
    render(<LearnerCoach view={{ ...coach, vocabulary: [{ word: "colleague", meaning: "đồng nghiệp", opened: false }, { word: "colleague", meaning: "đồng nghiệp", opened: false }] }} actions={actions()} />);
    const lockedWord = screen.getByLabelText("Từ bí mật 1 chưa mở");
    expect(lockedWord.querySelector("svg.lucide-lock-keyhole")).toBeInTheDocument();
    expect(lockedWord).not.toHaveTextContent("🔒");
    expect(lockedWord).toHaveTextContent("Gợi ý: đồng nghiệp");
    expect(screen.getAllByLabelText(/Từ bí mật .* chưa mở/)).toHaveLength(1);
  });

  it("keeps the message composer to one compact line", () => {
    render(<LearnerCoach view={coach} actions={actions()} />);
    expect(screen.getByRole("textbox", { name: "Tin nhắn cho Season" })).toHaveAttribute("rows", "1");
  });

  it("starts and stops recognition and appends Coach transcripts to the draft", async () => {
    enableSpeechRecognition();
    const user = userEvent.setup();
    render(<LearnerCoach view={coach} actions={actions()} />);
    const draft = screen.getByRole("textbox", { name: "Tin nhắn cho Season" });
    await user.type(draft, "Hello");

    await user.click(screen.getByRole("button", { name: "Nói" }));
    expect(latestRecognition?.start).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("button", { name: "Đang nghe" })).toBeInTheDocument();
    latestRecognition?.onresult?.({ results: [[{ transcript: "from the meeting" }]] });
    await waitFor(() => expect(draft).toHaveValue("Hello from the meeting"));
    latestRecognition?.onresult?.({ results: [[{ transcript: "from the meeting today" }]] });
    await waitFor(() => expect(draft).toHaveValue("Hello from the meeting today"));
    expect(draft).not.toHaveValue("Hello from the meeting from the meeting today");

    await user.click(screen.getByRole("button", { name: "Đang nghe" }));
    expect(latestRecognition?.stop).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("button", { name: "Nói" })).toBeInTheDocument();
  });

  it("QA Đợt 4 A-032 sends a recognized microphone transcript through the same Coach callback as typed text", async () => {
    enableSpeechRecognition();
    const sendCoachMessage = vi.fn().mockResolvedValue(undefined);
    const user = userEvent.setup();
    render(<LearnerCoach view={coach} actions={{ ...actions(), sendCoachMessage }} />);

    await user.click(screen.getByRole("button", { name: "Nói" }));
    latestRecognition?.onresult?.({ results: [[{ transcript: "I reported the safety issue immediately" }]] });
    await waitFor(() => expect(screen.getByRole("textbox", { name: "Tin nhắn cho Season" }))
      .toHaveValue("I reported the safety issue immediately"));
    await user.click(screen.getByRole("button", { name: "Đang nghe" }));
    await user.click(screen.getByRole("button", { name: "Gửi" }));

    expect(sendCoachMessage).toHaveBeenCalledWith("I reported the safety issue immediately");
  });

  it("A-032 preserves the Season recording beside its transcript and sends both through the adapter", async () => {
    enableSpeechRecognition();
    vi.stubGlobal("MediaRecorder", FakeMediaRecorder);
    Object.defineProperty(navigator, "mediaDevices", {
      configurable: true,
      value: { getUserMedia: vi.fn().mockResolvedValue({ getTracks: () => [{ stop: vi.fn() }] }) }
    });
    const sendCoachMessage = vi.fn().mockResolvedValue(undefined);
    const uploadAssessmentAudio = vi.fn().mockResolvedValue("audio/season-1.webm");
    const user = userEvent.setup();
    render(<LearnerCoach view={coach} actions={{ ...actions(), sendCoachMessage, uploadAssessmentAudio } as unknown as LearnerCallbacks} />);

    await user.click(screen.getByRole("button", { name: "Nói" }));
    latestRecognition?.onresult?.({ results: [[{ transcript: "I reported the issue" }]] });
    await waitFor(() => expect(screen.getByRole("textbox", { name: "Tin nhắn cho Season" })).toHaveValue("I reported the issue"));
    await user.click(screen.getByRole("button", { name: "Đang nghe" }));
    expect(uploadAssessmentAudio).toHaveBeenCalledTimes(1);
    expect(await screen.findByText(/bản ghi âm đã lưu/i)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Gửi" }));

    expect(sendCoachMessage).toHaveBeenCalledWith("I reported the issue", expect.objectContaining({ artifactKey: "audio/season-1.webm" }));
  });

  it("keeps the Season draft when microphone permission fails", async () => {
    enableSpeechRecognition();
    vi.stubGlobal("MediaRecorder", FakeMediaRecorder);
    Object.defineProperty(navigator, "mediaDevices", {
      configurable: true,
      value: { getUserMedia: vi.fn().mockRejectedValue(new Error("permission denied")) }
    });
    const user = userEvent.setup();
    render(<LearnerCoach view={coach} actions={actions()} />);
    const draft = screen.getByRole("textbox", { name: "Tin nhắn cho Season" });
    await user.type(draft, "Keep this typed draft");
    await user.click(screen.getByRole("button", { name: "Nói" }));

    expect(draft).toHaveValue("Keep this typed draft");
    expect(await screen.findByRole("alert")).toHaveTextContent(/micro/i);
  });

  it("keeps Practice write/dialogue mode and exposes the microphone only when supported", async () => {
    const user = userEvent.setup();
    const { rerender } = render(<LearnerPractice view={{ ...practice, inputMode: "write", speechSupported: false }} actions={actions()} />);
    expect(screen.getByLabelText("Bài làm")).toHaveAttribute("data-input-mode", "write");
    expect(screen.queryByRole("button", { name: "Nói" })).not.toBeInTheDocument();

    enableSpeechRecognition();
    rerender(<LearnerPractice view={{ ...practice, inputMode: "dialogue", speechSupported: true }} actions={actions()} />);
    const dialogueDraft = screen.getByLabelText("Câu trả lời hội thoại");
    expect(dialogueDraft).toHaveAttribute("data-input-mode", "dialogue");
    await user.click(screen.getByRole("button", { name: "Nói" }));
    latestRecognition?.onresult?.({ results: [[{ transcript: "Please reschedule" }]] });
    await waitFor(() => expect(dialogueDraft).toHaveValue("Please reschedule"));
    await user.click(screen.getByRole("button", { name: "Đang nghe" }));
    expect(latestRecognition?.stop).toHaveBeenCalledTimes(1);
  });

  it("L-060 preserves the weekly-practice recording with the submitted transcript", async () => {
    enableSpeechRecognition();
    vi.stubGlobal("MediaRecorder", FakeMediaRecorder);
    Object.defineProperty(navigator, "mediaDevices", {
      configurable: true,
      value: { getUserMedia: vi.fn().mockResolvedValue({ getTracks: () => [{ stop: vi.fn() }] }) }
    });
    const submitWeeklyPractice = vi.fn().mockResolvedValue(undefined);
    const uploadAssessmentAudio = vi.fn().mockResolvedValue("audio/practice-1.webm");
    const user = userEvent.setup();
    render(<LearnerPractice view={practice} actions={{ ...actions(), submitWeeklyPractice, uploadAssessmentAudio } as unknown as LearnerCallbacks} />);

    await user.click(screen.getByRole("button", { name: "Nói" }));
    latestRecognition?.onresult?.({ results: [[{ transcript: "I coordinate the weekly project meeting every Monday morning" }]] });
    await waitFor(() => expect(screen.getByRole("textbox", { name: "Bài làm" })).toHaveValue("I coordinate the weekly project meeting every Monday morning"));
    await user.click(screen.getByRole("button", { name: "Đang nghe" }));
    expect(uploadAssessmentAudio).toHaveBeenCalledTimes(1);
    expect(await screen.findByText(/bản ghi âm đã lưu/i)).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Nộp bài" }));
    expect(submitWeeklyPractice).toHaveBeenCalledWith("I coordinate the weekly project meeting every Monday morning", expect.objectContaining({ artifactKey: "audio/practice-1.webm" }));
  });

  it("keeps a weekly practice submission single-flight and restores the draft after failure", async () => {
    let rejectSubmit!: (reason?: unknown) => void;
    const submitWeeklyPractice = vi.fn(() => new Promise<never>((_, reject) => { rejectSubmit = reject; }));
    const callback = { ...actions(), submitWeeklyPractice } as unknown as LearnerCallbacks;
    const user = userEvent.setup();
    render(<LearnerPractice view={practice} actions={callback} />);

    const draft = screen.getByRole("textbox", { name: "Bài làm" });
    await user.type(draft, "I coordinate the weekly project meeting every Monday morning.");
    await user.click(screen.getByRole("button", { name: "Nộp bài" }));

    expect(screen.getByRole("button", { name: "Đang nộp…" })).toBeDisabled();
    expect(draft.closest("form")).toHaveAttribute("aria-busy", "true");
    expect(submitWeeklyPractice).toHaveBeenCalledTimes(1);

    rejectSubmit(new Error("SUBMIT_FAILED"));
    expect(await screen.findByRole("alert")).toHaveTextContent("Chưa nộp được bài");
    await waitFor(() => expect(draft).toHaveFocus());
    expect(draft).toHaveValue("I coordinate the weekly project meeting every Monday morning.");
    expect(screen.getByRole("button", { name: "Nộp bài" })).toBeEnabled();
  });

  it("requires at least eight words before enabling weekly-practice submission", async () => {
    const user = userEvent.setup();
    render(<LearnerPractice view={practice} actions={actions()} />);

    const draft = screen.getByRole("textbox", { name: "Bài làm" });
    await user.type(draft, "one two three four five six seven");
    expect(screen.getByText("7/8 từ tối thiểu")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Nộp bài" })).toBeDisabled();

    await user.type(draft, " eight");
    expect(screen.getByText("8/8 từ tối thiểu")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Nộp bài" })).toBeEnabled();
  });

  it("shows prior weekly-practice history and hides appeal after manual grading", () => {
    const reviewed: PracticeView = {
      ...practice,
      state: "reviewed",
      submission: {
        id: "submission-1", status: "reviewed", text: "My submitted answer has enough words.", submittedAt: "2026-10-15T08:00:00.000Z",
        score: { total: 82, rubric: { meaning: 4, vocabulary: 4, grammar: 3 } }, reviewState: "graded-manual",
        gradingSource: "manual", feedback: "Checked by an operator.", suggestions: [], correctedText: "Corrected answer."
      },
      history: [{
        id: "history-1", weekId: "week-0", weekNumber: 0, topic: "Introductions", task: "Introduce yourself.",
        submittedAt: "2026-10-08T08:00:00.000Z", score: { total: 75, rubric: { meaning: 4, vocabulary: 3, grammar: 3 } }
      }]
    };

    render(<LearnerPractice view={reviewed} actions={actions()} />);
    expect(screen.getByRole("heading", { name: "Lịch sử bài tuần" })).toBeInTheDocument();
    expect(screen.getByText(/Tuần 0 · Introductions/)).toBeInTheDocument();
    expect(screen.queryByRole("textbox", { name: "Lý do kháng nghị" })).not.toBeInTheDocument();
    expect(screen.getByText(/đã được chấm tay/i)).toBeInTheDocument();
  });

  it("keeps a weekly-practice appeal pending, recoverable, and clear of the bottom navigation", async () => {
    let rejectAppeal!: (reason?: unknown) => void;
    const appealWeeklyPractice = vi.fn(() => new Promise<never>((_, reject) => { rejectAppeal = reject; }));
    const callback = { ...actions(), appealWeeklyPractice } as unknown as LearnerCallbacks;
    const reviewed: PracticeView = {
      ...practice,
      state: "reviewed",
      submission: {
        id: "submission-1", status: "reviewed", text: "My submitted answer.", submittedAt: "2026-10-15T08:00:00.000Z",
        score: { total: 82, rubric: { meaning: 4, vocabulary: 4, grammar: 3 } }, reviewState: "graded-ai",
        feedback: "Good structure.", suggestions: [], correctedText: ""
      }
    };
    const user = userEvent.setup();
    const { container } = render(<LearnerPractice view={reviewed} actions={callback} />);

    const reason = screen.getByRole("textbox", { name: "Lý do kháng nghị" });
    const submitAppeal = screen.getByRole("button", { name: "Gửi kháng nghị" });
    await user.type(reason, "abcd");
    expect(submitAppeal).toBeDisabled();
    await user.type(reason, "e");
    expect(submitAppeal).toBeEnabled();
    await user.click(submitAppeal);

    expect(screen.getByRole("button", { name: "Đang gửi…" })).toBeDisabled();
    expect(appealWeeklyPractice).toHaveBeenCalledWith("submission-1", "abcde");
    expect((container.firstElementChild as HTMLElement).style.paddingBottom).toBe("calc(88px + env(safe-area-inset-bottom))");

    rejectAppeal(new Error("APPEAL_FAILED"));
    expect(await screen.findByRole("alert")).toHaveTextContent("Chưa gửi được kháng nghị");
    await waitFor(() => expect(reason).toHaveFocus());
    expect(reason).toHaveValue("abcde");
  });
});
