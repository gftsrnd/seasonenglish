// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { LearnerChallenge, LearnerCoach, LearnerPractice } from "./CoachPractice.js";
import type { LearnerCallbacks, PracticeView } from "./contracts.js";

afterEach(() => {
  cleanup();
  Reflect.deleteProperty(window, "SpeechRecognition");
  Reflect.deleteProperty(window, "webkitSpeechRecognition");
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
  daily: { used: 0, limit: 20 }, weekly: { turns: 0, target: 2 }, messages: [], vocabulary: [],
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

function enableSpeechRecognition() {
  Object.defineProperty(window, "SpeechRecognition", {
    configurable: true,
    value: FakeSpeechRecognition
  });
}

describe("app coach and weekly practice speech input", () => {
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
    const { rerender } = render(<LearnerCoach view={{ ...coach, weekly: { turns: 1, target: 2 } }} actions={callback} />);

    expect(screen.getByRole("heading", { name: "Season" })).toBeInTheDocument();
    expect(screen.getByText("Meetings · A2")).toBeInTheDocument();
    expect(screen.getByText("Hôm nay 0/20 lượt")).toBeInTheDocument();
    expect(screen.getByText("Tuần này 1 lượt · mục tiêu ≥2")).toBeInTheDocument();
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

    rerender(<LearnerCoach view={{ ...coach, daily: { used: 20, limit: 20 } }} actions={callback} />);
    expect(screen.getByText(/đã dùng hết 20 lượt chat hôm nay/i)).toBeInTheDocument();
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

  it("separates coach feedback into a note, three /5 scores, and readable suggestions", () => {
    render(<LearnerCoach view={{ ...coach, messages: [{
      id: "coach-feedback", speaker: "coach", text: "Please try again.", createdAt: "2026-10-22T00:00:00.000Z",
      feedback: {
        relevant: false,
        relevanceNote: "Lời chào chưa trả lời câu hỏi của Season. Hãy thử nói về slide.",
        rubric: { meaning: 1, vocabulary: 1, grammar: 3 },
        suggestions: [{ original: "hello", corrected: "The slide has too much text.", explanation: "Trả lời đúng chủ đề." }],
        correctedText: "The slide has too much text."
      }
    }] }} actions={actions()} />);

    const feedback = screen.getByRole("region", { name: "Phản hồi của Season" });
    expect(feedback).not.toHaveClass("correction");
    expect(feedback).toHaveClass("coach-feedback-flat");
    expect(within(feedback).queryByText("Lời chào chưa trả lời câu hỏi của Season.")).not.toBeInTheDocument();
    expect(within(feedback).queryByText("Hãy thử nói về slide.")).not.toBeInTheDocument();
    expect(feedback.querySelectorAll(".coach-feedback-score")).toHaveLength(3);
    expect(feedback.querySelectorAll(".coach-feedback-score svg")).toHaveLength(3);
    const summary = feedback.querySelector(".coach-feedback-summary");
    expect(summary).toContainElement(within(feedback).getByText("Hãy quay lại chủ đề nhé"));
    expect(summary?.querySelector(".coach-feedback-scores")).not.toBeNull();
    expect(within(feedback).getByText("Ý nghĩa").closest(".coach-feedback-score")).toHaveTextContent("Ý nghĩa1/5");
    expect(within(feedback).getByText("Từ vựng").closest(".coach-feedback-score")).toHaveTextContent("Từ vựng1/5");
    expect(within(feedback).getByText("Ngữ pháp").closest(".coach-feedback-score")).toHaveTextContent("Ngữ pháp3/5");
    expect(within(feedback).queryByText("Điểm cho biết: đúng câu hỏi · dùng từ phù hợp · cấu trúc chính xác.")).not.toBeInTheDocument();
    const meaningAndTranslation = within(feedback).getByText("Ý nghĩa & bản dịch").closest("details");
    expect(feedback.querySelectorAll("details")).toHaveLength(1);
    expect(meaningAndTranslation).not.toHaveAttribute("open");
    expect(meaningAndTranslation).toContainElement(within(feedback).getByText("Đúng câu hỏi và diễn đạt rõ ý"));
    expect(meaningAndTranslation).toContainElement(within(feedback).getByText("Dùng từ đúng và phù hợp với trình độ"));
    expect(meaningAndTranslation).toContainElement(within(feedback).getByText("Cấu trúc câu và độ chính xác"));
    expect(feedback).toContainElement(within(feedback).getByText("hello"));
    const correction = within(feedback).getByText("The slide has too much text.");
    expect(meaningAndTranslation).not.toContainElement(correction);
    expect(correction).toHaveClass("coach-feedback-correction");
    expect(within(feedback).queryByText("Trả lời đúng chủ đề.")).not.toBeInTheDocument();
  });

  it("does not repeat the AI relevance explanation for an on-topic answer", () => {
    render(<LearnerCoach view={{ ...coach, messages: [{
      id: "coach-relevant", speaker: "coach", text: "Good suggestion.", createdAt: "2026-10-22T00:00:00.000Z",
      feedback: {
        relevant: true,
        relevanceNote: "The learner is on topic and answers the question clearly.",
        rubric: { meaning: 4, vocabulary: 3, grammar: 4 }, suggestions: [], correctedText: ""
      }
    }] }} actions={actions()} />);

    expect(screen.queryByText("The learner is on topic and answers the question clearly.")).not.toBeInTheDocument();
  });

  it("presents a high-scoring rewrite as an optional phrasing improvement instead of an error", () => {
    render(<LearnerCoach view={{ ...coach, messages: [{
      id: "coach-refinement", speaker: "coach", text: "That is a clear request.", createdAt: "2026-10-22T00:00:00.000Z",
      feedback: {
        relevant: true,
        relevanceNote: "",
        rubric: { meaning: 4, vocabulary: 3, grammar: 4 },
        suggestions: [{
          original: "The slide has too much text. Could we make it shorter?",
          corrected: "Could we make the text on the slide shorter?",
          explanation: "A more direct alternative."
        }, {
          original: "The slide has too much text. Could we make it shorter?",
          corrected: "Could we make the text on the slide shorter?",
          explanation: "Duplicate provider suggestion."
        }],
        correctedText: ""
      }
    }] }} actions={actions()} />);

    const feedback = screen.getByRole("region", { name: "Phản hồi của Season" });
    expect(within(feedback).getByText("Câu bạn nên nói tiếp")).toBeInTheDocument();
    expect(within(feedback).getByText("Ý nghĩa & bản dịch")).toBeInTheDocument();
    expect(within(feedback).getByText("The slide has too much text. Could we make it shorter?")).toBeInTheDocument();
    expect(within(feedback).getAllByText("Could we make the text on the slide shorter?")).toHaveLength(1);
    expect(within(feedback).queryByText("A more direct alternative.")).not.toBeInTheDocument();
    expect(within(feedback).getByText("Season vừa nói")).toBeInTheDocument();
    expect(within(feedback).queryByText("Vì sao cần sửa")).not.toBeInTheDocument();
  });

  it("shows corrections and translations in one compact disclosure", () => {
    render(<LearnerCoach view={{ ...coach, messages: [{
      id: "coach-translated", speaker: "coach", text: "Could you shorten the bullet points?", createdAt: "2026-10-22T00:00:00.000Z",
      feedback: {
        relevant: true,
        relevanceNote: "",
        replyTranslation: "Bạn có thể rút ngắn các gạch đầu dòng không?",
        rubric: { meaning: 3, vocabulary: 3, grammar: 3 },
        suggestions: [{
          original: "The slide have too much text.",
          corrected: "The slide has too much text.",
          translation: "Trang chiếu có quá nhiều chữ.",
          explanation: "Use has with the singular subject slide."
        }, {
          original: "The slide have too much text.",
          corrected: "The slide has too much text.",
          translation: "Trang chiếu có quá nhiều chữ.",
          explanation: "Duplicate provider suggestion."
        }],
        correctedText: "The slide has too much text."
      }
    }] }} actions={actions()} />);

    const feedback = screen.getByRole("region", { name: "Phản hồi của Season" });
    const message = feedback.closest("article")!;
    const nextQuestion = within(message).getByText("Could you shorten the bullet points?");
    const feedbackHeading = within(feedback).getByText("Phản hồi");
    const nextSentenceHeading = within(feedback).getByText("Câu bạn nên nói tiếp");
    const meaningHeading = within(feedback).getByText("Ý nghĩa & bản dịch");
    expect(nextQuestion.compareDocumentPosition(feedbackHeading) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(feedbackHeading.compareDocumentPosition(nextSentenceHeading) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(nextSentenceHeading.compareDocumentPosition(meaningHeading) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(feedback.querySelectorAll("details")).toHaveLength(1);
    expect(within(feedback).getByText("Câu bạn nên nói tiếp")).toBeInTheDocument();
    expect(within(feedback).getByText("Ý nghĩa & bản dịch")).toBeInTheDocument();
    expect(within(feedback).getByText("Season vừa nói")).toBeInTheDocument();
    expect(within(feedback).queryByText("Bạn có thể nói tiếp")).not.toBeInTheDocument();
    expect(within(feedback).queryByText("Vì sao cần sửa")).not.toBeInTheDocument();
    expect(within(feedback).getByText("Bạn có thể rút ngắn các gạch đầu dòng không?")).toBeInTheDocument();
    expect(within(feedback).getByText("Season vừa nói")).toBeInTheDocument();
    expect(within(feedback).getByText("Bản dịch câu bạn nên nói tiếp")).toBeInTheDocument();
    expect(within(feedback).getAllByText("The slide has too much text.")).toHaveLength(1);
    expect(within(feedback).getAllByText("Trang chiếu có quá nhiều chữ.")).toHaveLength(1);
    expect(within(feedback).getAllByText("The slide have too much text.")).toHaveLength(1);
    expect(within(feedback).queryByText("Use has with the singular subject slide.")).not.toBeInTheDocument();
    expect(within(feedback).queryByText("Duplicate provider suggestion.")).not.toBeInTheDocument();
  });

  it("labels missing translations explicitly for a legacy Coach turn", () => {
    render(<LearnerCoach view={{ ...coach, messages: [{
      id: "coach-legacy", speaker: "coach", text: "Legacy reply.", createdAt: "2026-10-22T00:00:00.000Z",
      feedback: {
        relevant: true, relevanceNote: "", rubric: { meaning: 3, vocabulary: 3, grammar: 3 },
        suggestions: [{ original: "old", corrected: "older", explanation: "Legacy reason." }], correctedText: "older"
      }
    }] }} actions={actions()} />);

    const feedback = screen.getByRole("region", { name: "Phản hồi của Season" });
    expect(within(feedback).getByText("Bản dịch chưa có cho lượt chat cũ này.")).toBeInTheDocument();
    expect(within(feedback).getByText("Bản dịch gợi ý chưa có cho lượt chat cũ này.")).toBeInTheDocument();
  });

  it("uses compact vocabulary and rounded icon controls", () => {
    enableSpeechRecognition();
    render(<LearnerCoach view={{ ...coach, vocabulary: [{ word: "agenda", meaning: "chương trình họp", opened: false }] }} actions={actions()} />);

    expect(screen.getByRole("button", { name: "Mở từ bí mật 1" })).toHaveClass("coach-word-chip");
    expect(screen.getByRole("button", { name: "Nói" })).toHaveClass("coach-compose-icon");
    expect(screen.getByRole("button", { name: "Gửi" })).toHaveClass("coach-send");
    expect(screen.getByRole("button", { name: "Gửi" }).querySelector("svg")).toBeInTheDocument();
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
    const button = screen.getByRole("button", { name: "Mở từ bí mật 1" });
    expect(button.querySelector("svg.lucide-lock-keyhole")).toBeInTheDocument();
    expect(button).not.toHaveTextContent("🔒");
    expect(button).not.toHaveTextContent("Mở từ");
    expect(screen.getAllByRole("button", { name: /Mở từ bí mật/ })).toHaveLength(1);
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

    await user.click(screen.getByRole("button", { name: "Đang nghe" }));
    expect(latestRecognition?.stop).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("button", { name: "Nói" })).toBeInTheDocument();
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

  it("keeps a weekly practice submission single-flight and restores the draft after failure", async () => {
    let rejectSubmit!: (reason?: unknown) => void;
    const submitWeeklyPractice = vi.fn(() => new Promise<never>((_, reject) => { rejectSubmit = reject; }));
    const callback = { ...actions(), submitWeeklyPractice } as unknown as LearnerCallbacks;
    const user = userEvent.setup();
    render(<LearnerPractice view={practice} actions={callback} />);

    const draft = screen.getByRole("textbox", { name: "Bài làm" });
    await user.type(draft, "I coordinate the weekly meeting.");
    await user.click(screen.getByRole("button", { name: "Nộp bài" }));

    expect(screen.getByRole("button", { name: "Đang nộp…" })).toBeDisabled();
    expect(draft.closest("form")).toHaveAttribute("aria-busy", "true");
    expect(submitWeeklyPractice).toHaveBeenCalledTimes(1);

    rejectSubmit(new Error("SUBMIT_FAILED"));
    expect(await screen.findByRole("alert")).toHaveTextContent("Chưa nộp được bài");
    await waitFor(() => expect(draft).toHaveFocus());
    expect(draft).toHaveValue("I coordinate the weekly meeting.");
    expect(screen.getByRole("button", { name: "Nộp bài" })).toBeEnabled();
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
    await user.type(reason, "Xin xem lại phần ngữ pháp.");
    await user.click(screen.getByRole("button", { name: "Gửi kháng nghị" }));

    expect(screen.getByRole("button", { name: "Đang gửi…" })).toBeDisabled();
    expect(appealWeeklyPractice).toHaveBeenCalledWith("submission-1", "Xin xem lại phần ngữ pháp.");
    expect((container.firstElementChild as HTMLElement).style.paddingBottom).toBe("calc(88px + env(safe-area-inset-bottom))");

    rejectAppeal(new Error("APPEAL_FAILED"));
    expect(await screen.findByRole("alert")).toHaveTextContent("Chưa gửi được kháng nghị");
    await waitFor(() => expect(reason).toHaveFocus());
    expect(reason).toHaveValue("Xin xem lại phần ngữ pháp.");
  });
});
