// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { LessonPart } from "@e4s/contracts";
import { LearnerLesson } from "../src/app/learner/Learning.js";
import type { LearnerCallbacks, LessonView } from "../src/app/learner/contracts.js";

afterEach(() => {
  cleanup();
  window.sessionStorage.clear();
  window.localStorage.clear();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  Reflect.deleteProperty(window, "speechSynthesis");
});

const callbacks = (overrides: Partial<LearnerCallbacks> = {}) => ({
  navigate: vi.fn(), saveProfileDraft: vi.fn(), saveProfile: vi.fn(), startAssessment: vi.fn(), saveAssessmentResponse: vi.fn(),
  completeAssessmentSection: vi.fn(), submitAssessment: vi.fn(), uploadAssessmentAudio: vi.fn(), recordAssessmentAudioPlay: vi.fn(),
  createAssessmentAppeal: vi.fn(), completeLessonStudy: vi.fn(), saveLessonProgress: vi.fn(), submitMicroAnswer: vi.fn(), completeMicroLesson: vi.fn(),
  regenerateMicroLesson: vi.fn(), sendCoachMessage: vi.fn(), changeCoachPersona: vi.fn(), startNewCoachChat: vi.fn(),
  sendChallengeMessage: vi.fn(), submitWeeklyPractice: vi.fn(), submitSurvey: vi.fn(), saveAvatar: vi.fn(), printReward: vi.fn(),
  speak: vi.fn(), generateGameSet: vi.fn(), useWeeklyGameSet: vi.fn(), deleteGameSet: vi.fn(), finishGame: vi.fn(), resetGameResult: vi.fn(),
  appealMonthlyExam: vi.fn(), resolveGameWordImage: vi.fn(), ...overrides
} as unknown as LearnerCallbacks);

const parts: LessonPart[] = [
  { code: "objective", title: "Mục tiêu", content: { text: "Mục tiêu" } },
  { code: "listening", title: "Nghe", content: { prompt: "Chọn A", answer: "A", options: ["A", "B"] } },
  { code: "reading", title: "Đọc", content: { prompt: "Chọn B", answer: "B", options: ["A", "B"] } },
  { code: "writing", title: "Viết", content: { prompt: "Viết câu" } },
  { code: "speaking", title: "Nói", content: { prompt: "Ghi âm" } }
];

const lesson = {
  id: "00000000-0000-4000-8000-000000000201", title: "Bài 2", dayNumber: 2, durationMinutes: 10, cefr: "A2" as const,
  weekNumber: 1, weekTopic: "Introducing yourself & your job",
  content: { parts }, progress: { status: "in_progress" as const, completedPartCodes: [], evidence: {} }
};

async function openPractice(user: ReturnType<typeof userEvent.setup>) {
  const practiceTab = screen.getByRole("tab", { name: /2\. bài tập/i });
  if (practiceTab.hasAttribute("disabled")) {
    await user.click(screen.getByRole("button", { name: /đã học xong.*làm bài tập/i }));
    return;
  }
  await user.click(practiceTab);
}

describe("app lesson evidence states", () => {
  it("keeps a lesson save unavailable until the learner chooses or enters an answer", async () => {
    const user = userEvent.setup();
    render(<LearnerLesson view={{ lesson }} actions={callbacks({ submitLessonPartAttempt: vi.fn() })} />);

    await openPractice(user);
    const listening = screen.getAllByTestId("app-lesson-part").find((part) => part.dataset.part === "listening");
    const save = within(listening as HTMLElement).getByRole("button", { name: /nộp bài/i });

    expect(save).toBeDisabled();
    await user.click(within(listening as HTMLElement).getByRole("radio", { name: /^A\. A$/ }));
    expect(save).toBeEnabled();
  });

  it("shows a pending state and prevents duplicate part submissions", async () => {
    let resolveSubmit!: (value: { lessonId: string; partCode: "listening"; evidence: { attempts: number; status: "correct"; answer: string }; progress: typeof lesson.progress }) => void;
    const submit = vi.fn(() => new Promise<{ lessonId: string; partCode: "listening"; evidence: { attempts: number; status: "correct"; answer: string }; progress: typeof lesson.progress }>((resolve) => { resolveSubmit = resolve; }));
    const user = userEvent.setup();
    render(<LearnerLesson view={{ lesson }} actions={callbacks({ submitLessonPartAttempt: submit })} />);
    await openPractice(user);
    const listening = screen.getAllByTestId("app-lesson-part").find((part) => part.dataset.part === "listening");

    await user.click(within(listening as HTMLElement).getByRole("radio", { name: /^A\. A$/ }));
    await user.click(within(listening as HTMLElement).getByRole("button", { name: /nộp bài/i }));

    expect(within(listening as HTMLElement).getByRole("button", { name: "Đang lưu…" })).toBeDisabled();
    expect(submit).toHaveBeenCalledOnce();
    resolveSubmit({ lessonId: lesson.id, partCode: "listening", evidence: { attempts: 1, status: "correct", answer: "A" }, progress: lesson.progress });
  });

  it("keeps a part submission recoverable after a server error", async () => {
    const user = userEvent.setup();
    const submit = vi.fn().mockRejectedValueOnce(new Error("SUBMIT_FAILED"));
    render(<LearnerLesson view={{ lesson }} actions={callbacks({ submitLessonPartAttempt: submit })} />);
    await openPractice(user);
    const listening = screen.getAllByTestId("app-lesson-part").find((part) => part.dataset.part === "listening");

    await user.click(within(listening as HTMLElement).getByRole("radio", { name: /^A\. A$/ }));
    await user.click(within(listening as HTMLElement).getByRole("button", { name: /nộp bài/i }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Chưa lưu được câu trả lời");
    expect(within(listening as HTMLElement).getByRole("button", { name: /nộp bài/i })).toBeEnabled();
  });

  it("shows a pending state while confirming the study step", async () => {
    let resolveSave!: () => void;
    const save = vi.fn(() => new Promise<void>((resolve) => { resolveSave = resolve; }));
    const user = userEvent.setup();
    render(<LearnerLesson view={{ lesson }} actions={callbacks({ completeLessonStudy: save })} />);

    await user.click(screen.getByRole("button", { name: /đã học xong.*làm bài tập/i }));

    expect(screen.getByRole("button", { name: "Đang lưu…" })).toBeDisabled();
    expect(save).toHaveBeenCalledOnce();
    resolveSave();
  });

  it("renders ordered instruction steps at the start of the practice tab", async () => {
    const user = userEvent.setup();
    const instructionLesson: LessonView["lesson"] = {
      ...lesson,
      content: {
        parts: [
          { code: "objective", title: "Mục tiêu", content: { text: "Mục tiêu" } },
          { code: "instruction", title: "Hướng dẫn làm bài", content: { steps: ["Nội dung cũ không được dùng để suy ra phần bài tập."] } },
          { code: "pronunciation", title: "Phát âm", content: { focus: "/iː/", words: ["team"] } },
          { code: "listening", title: "Nghe", content: { prompt: "Nghe và chọn đáp án." } },
          { code: "reading", title: "Đọc", content: { prompt: "Đọc và chọn đáp án." } },
          { code: "speaking", title: "Nói", content: { prompt: "Ghi âm câu trả lời." } }
        ]
      },
      progress: { ...lesson.progress, status: "in_progress", completedPartCodes: ["objective", "pronunciation"] }
    };
    render(<LearnerLesson view={{ lesson: instructionLesson }} actions={callbacks()} />);

    expect(screen.getByRole("heading", { name: /hướng dẫn làm bài/i })).toBeInTheDocument();
    expect(screen.getAllByTestId("app-lesson-part").map((part) => part.dataset.part)).toEqual(["objective", "instruction", "pronunciation"]);
    await user.click(screen.getByRole("tab", { name: /2\. bài tập/i }));

    const instruction = screen.getAllByTestId("app-lesson-part").find((part) => part.dataset.part === "instruction");
    expect(instruction).toBeDefined();
    expect(within(instruction as HTMLElement).getByRole("heading", { name: /hướng dẫn làm bài/i })).toBeInTheDocument();
    expect(within(instruction as HTMLElement).getByRole("list")).toHaveClass("lesson-instruction-list");
    expect(within(instruction as HTMLElement).getAllByRole("listitem")).toHaveLength(3);
    expect(within(instruction as HTMLElement).getByText("Làm lần lượt 3 phần: Nghe → Đọc → Nói.")).toBeInTheDocument();
    expect(within(instruction as HTMLElement).queryByText("Nội dung cũ không được dùng để suy ra phần bài tập.")).not.toBeInTheDocument();
  });

  it("keeps exercises locked until the learner confirms the study step", async () => {
    const user = userEvent.setup();
    render(<LearnerLesson view={{ lesson }} actions={callbacks()} />);

    const practiceTab = screen.getByRole("tab", { name: /2\. bài tập/i });
    expect(practiceTab).toBeDisabled();
    expect(screen.queryByRole("radio", { name: /^A\. A$/ })).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /đã học xong.*làm bài tập/i }));

    expect(practiceTab).toBeEnabled();
    expect(practiceTab).toHaveAttribute("aria-selected", "true");
    expect(screen.getAllByRole("radio", { name: /^A\. A$/ }).length).toBeGreaterThan(0);
    expect(screen.getByRole("button", { name: /hoàn thành bài/i })).toBeDisabled();
  });

  it("renders listening and reading content with app-native choice controls", async () => {
    const user = userEvent.setup();
    const submit = vi.fn().mockResolvedValue({
      evidence: { attempts: 1, status: "correct", answer: "Nice to meet you.", score: 100 },
      progress: lesson.progress
    });
    render(<LearnerLesson view={{ lesson: {
      ...lesson,
      content: { parts: [
        { code: "listening", title: "Nghe", content: {
          audioUrl: "/audio/listening.mp3", prompt: "What does the speaker say?",
          answer: "Nice to meet you.", options: ["Goodbye.", "Nice to meet you.", "See you yesterday.", "No answer."]
        } },
        { code: "reading", title: "Đọc", content: {
          text: "Lan is new to the product team.", prompt: "Which team is Lan in?",
          answer: "The product team.", options: ["The sales team.", "The product team.", "The finance team.", "No team."]
        } }
      ] }
    } }} actions={callbacks({ submitLessonPartAttempt: submit })} />);

    await openPractice(user);
    expect(screen.getByLabelText(/nghe audio phần listening/i)).toHaveAttribute("src", "/audio/listening.mp3");
    expect(screen.getByText("Lan is new to the product team.")).toHaveClass("lesson-reading-passage");
    await user.click(screen.getByRole("radio", { name: /^B\. Nice to meet you\.$/ }));
    const listening = screen.getAllByTestId("app-lesson-part").find((part) => part.dataset.part === "listening");
    await user.click(within(listening as HTMLElement).getByRole("button", { name: /nộp bài/i }));
    expect(submit).toHaveBeenCalledWith("listening", { answer: "Nice to meet you." });
  });

  it("restores Listening TTS when only a transcript exists", async () => {
    const user = userEvent.setup();
    const speak = vi.fn();
    render(<LearnerLesson view={{ lesson: {
      ...lesson,
      content: { parts: [{ code: "listening", title: "Nghe", content: { script: "The meeting starts at nine.", prompt: "Chọn ý chính." } }] }
    } }} actions={callbacks({ speak })} />);

    await openPractice(user);
    const listeningAudio = screen.getByRole("button", { name: "Nghe nội dung phần Listening" });
    expect(listeningAudio).toHaveClass("lesson-audio-primary", "lesson-listening-audio-button");
    await user.click(listeningAudio);
    expect(speak).toHaveBeenCalledWith("The meeting starts at nine.", "en-US", { rate: 0.85 });
  });

  it("submits part evidence and exposes server-returned retry feedback", async () => {
    const user = userEvent.setup();
    const submit = vi.fn().mockResolvedValue({ evidence: { attempts: 1, status: "wrong_retry", answer: "B", score: 0 }, progress: lesson.progress });
    render(<LearnerLesson view={{ lesson }} actions={callbacks({ submitLessonPartAttempt: submit })} />);
    await openPractice(user);
    const listening = screen.getAllByTestId("app-lesson-part").find((part) => part.dataset.part === "listening");
    expect(listening).toBeDefined();
    await user.click(within(listening as HTMLElement).getByRole("radio", { name: /^B\. B$/ }));
    await user.click(within(listening as HTMLElement).getByRole("button", { name: /nộp bài/i }));
    expect(submit).toHaveBeenCalledWith("listening", { answer: "B" });
  });

  it("renders exhausted, translated and appealed states from persisted evidence", async () => {
    const actions = callbacks({ submitLessonPartAttempt: vi.fn(), appealLessonPart: vi.fn() });
    render(<LearnerLesson view={{ lesson: {
      ...lesson,
      progress: {
        status: "in_progress", completedPartCodes: ["reading"], evidence: {
          reading: { attempts: 2, status: "wrong_exhausted", answer: "A", score: 0, feedback: "Hãy xem lại đáp án." }
        }
      }
    } }} actions={actions} />);
    const user = userEvent.setup();
    await openPractice(user);
    const reading = screen.getAllByTestId("app-lesson-part").find((part) => part.dataset.part === "reading");
    expect(within(reading as HTMLElement).getByText("Đã hết lượt thử")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /xem bản dịch/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /gửi kháng nghị/i })).toBeInTheDocument();
  });

  it("keeps terminal feedback in its own card, counts an appeal, and excludes pending speaking review", async () => {
    const user = userEvent.setup();
    const sixPartLesson: LessonView["lesson"] = {
      ...lesson,
      content: { parts: [
        { code: "objective", title: "Mục tiêu", content: { text: "Mục tiêu" } },
        { code: "listening", title: "Nghe", content: { prompt: "Nghe", answer: "A", options: ["A", "B"] } },
        { code: "reading", title: "Đọc", content: { prompt: "Đọc", answer: "A", options: ["A", "B"] } },
        { code: "writing", title: "Viết", content: { prompt: "Viết" } },
        { code: "word_class", title: "Từ loại", content: { prompt: "Từ loại", answer: "Noun", options: ["Noun", "Verb"] } },
        { code: "word_use", title: "Dùng từ", content: { prompt: "Dùng từ", answer: "Use", options: ["Use", "Uses"] } },
        { code: "speaking", title: "Nói", content: { prompt: "Nói" } }
      ] },
      progress: {
        status: "in_progress",
        completedPartCodes: ["listening", "reading", "writing", "word_class", "speaking"],
        evidence: {
          listening: { attempts: 1, status: "correct", answer: "A" },
          reading: { attempts: 2, status: "appealed", answer: "B", feedback: "Kháng nghị đã được gửi tới người vận hành." },
          writing: { attempts: 2, status: "wrong_exhausted", answer: "Sai", feedback: "Đã hết lượt thử." },
          word_class: { attempts: 1, status: "correct", answer: "Noun" },
          word_use: { attempts: 1, status: "submitted", answer: "Use", feedback: "Đã gửi để kiểm tra." },
          speaking: { attempts: 1, status: "correct", artifactKey: "lesson-audio/speaking.webm" }
        }
      }
    };

    render(<LearnerLesson view={{ lesson: sixPartLesson }} actions={callbacks()} />);
    await openPractice(user);

    expect(screen.getByRole("tab", { name: /2\. bài tập 5\/6/i })).toBeInTheDocument();
    expect(screen.queryByLabelText("Trạng thái bài tập")).not.toBeInTheDocument();
    const reading = screen.getAllByTestId("app-lesson-part").find((part) => part.dataset.part === "reading");
    const writing = screen.getAllByTestId("app-lesson-part").find((part) => part.dataset.part === "writing");
    const wordUse = screen.getAllByTestId("app-lesson-part").find((part) => part.dataset.part === "word_use");
    expect(within(reading as HTMLElement).getByText("Đã gửi kháng nghị")).toBeInTheDocument();
    expect(within(writing as HTMLElement).getByText("Đã hết lượt thử")).toBeInTheDocument();
    expect(within(wordUse as HTMLElement).getByText("Đã gửi để kiểm tra")).toBeInTheDocument();
    expect(screen.getByText(/đã xong 5\/6 phần/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Hoàn thành bài" })).toBeDisabled();
  });

  it("keeps an appeal recoverable while it is pending and after it fails", async () => {
    let rejectAppeal!: (reason?: unknown) => void;
    const appeal = vi.fn(() => new Promise<never>((_, reject) => { rejectAppeal = reject; }));
    const user = userEvent.setup();
    const actions = callbacks({ submitLessonPartAttempt: vi.fn(), appealLessonPart: appeal });
    render(<LearnerLesson view={{ lesson: {
      ...lesson,
      progress: {
        status: "in_progress", completedPartCodes: [], evidence: {
          listening: { attempts: 2, status: "wrong_exhausted", answer: "A", score: 0, feedback: "Hãy xem lại đáp án." }
        }
      }
    } }} actions={actions} />);

    await openPractice(user);
    const appealButton = screen.getByRole("button", { name: /gửi kháng nghị/i });
    await user.click(appealButton);
    await user.type(screen.getByLabelText(/lý do kháng nghị phần nghe/i), "Đáp án cần được xem lại.");
    await user.click(screen.getByRole("button", { name: /xác nhận gửi kháng nghị/i }));
    expect(screen.getByRole("button", { name: "Đang gửi…" })).toBeDisabled();

    rejectAppeal(new Error("APPEAL_FAILED"));
    expect(await screen.findByRole("alert")).toHaveTextContent("Chưa gửi được kháng nghị");
    expect(screen.getByRole("button", { name: /^gửi kháng nghị$/i })).toBeEnabled();
  });

  it("keeps lesson audio and speaking evidence recoverable when playback, mic or upload is unavailable", async () => {
    const user = userEvent.setup();
    const speech = vi.fn();
    const upload = vi.fn()
      .mockRejectedValueOnce(new Error("UPLOAD_FAILED"))
      .mockResolvedValue("lesson-audio/learner-1/speaking.webm");
    const submit = vi.fn().mockResolvedValue({
      evidence: { attempts: 1, status: "correct", artifactKey: "lesson-audio/learner-1/speaking.webm", feedback: "Đã nhận và chấm bản ghi âm." },
      progress: {
        ...lesson.progress,
        evidence: { speaking: { attempts: 1, status: "correct", artifactKey: "lesson-audio/learner-1/speaking.webm", feedback: "Đã nhận và chấm bản ghi âm." } }
      }
    });
    const mediaLesson: LessonView["lesson"] = {
      ...lesson,
      content: {
        parts: [
          { code: "listening", title: "Nghe", content: { script: "The meeting starts at nine.", prompt: "Chọn ý chính." } },
          { code: "speaking", title: "Nói", content: { prompt: "Nói câu trả lời ngắn." } }
        ]
      }
    };

    render(<LearnerLesson view={{ lesson: mediaLesson }} actions={callbacks({
      speak: speech,
      uploadAssessmentAudio: upload,
      submitLessonPartAttempt: submit
    })} />);

    await openPractice(user);
    expect(screen.getByText(/trình duyệt này không ghi âm được/i)).toBeInTheDocument();
    const file = new File(["audio"], "answer.webm", { type: "audio/webm" });
    await user.upload(screen.getByLabelText(/tải file ghi âm speaking/i), file);
    expect(await screen.findByText(/không tải được file ghi âm/i)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /thử lại tải file/i }));
    expect(upload).toHaveBeenCalledTimes(2);
    expect(await screen.findByText(/đã tải file ghi âm/i)).toBeInTheDocument();

    const speaking = screen.getAllByTestId("app-lesson-part").find((part) => part.dataset.part === "speaking");
    const checkSpeaking = within(speaking as HTMLElement).getByRole("button", { name: /kiểm tra nói/i });
    expect(checkSpeaking).toBeEnabled();
    await user.click(checkSpeaking);
    expect(submit).toHaveBeenCalledWith("speaking", {
      answer: "",
      artifactKey: "lesson-audio/learner-1/speaking.webm"
    });
    expect(await screen.findByText("Đã nhận và chấm bản ghi âm.")).toBeInTheDocument();

    expect(screen.getByRole("button", { name: "Nghe nội dung phần Listening" })).toBeInTheDocument();
  });

  it("enables speaking grading after recording directly and displays returned feedback", async () => {
    const user = userEvent.setup();
    const track = { stop: vi.fn() };
    const getUserMedia = vi.fn().mockResolvedValue({ getTracks: () => [track] });
    vi.stubGlobal("navigator", { ...navigator, mediaDevices: { getUserMedia } });

    class FakeMediaRecorder {
      static instance: FakeMediaRecorder | undefined;
      mimeType = "audio/webm";
      ondataavailable: ((event: { data: Blob }) => void) | null = null;
      onerror: (() => void) | null = null;
      onstop: (() => void) | null = null;
      constructor() { FakeMediaRecorder.instance = this; }
      start() {}
      stop() {
        this.ondataavailable?.({ data: new Blob(["voice"], { type: "audio/webm" }) });
        this.onstop?.();
      }
    }
    vi.stubGlobal("MediaRecorder", FakeMediaRecorder);
    vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:lesson-speaking");
    vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => undefined);

    const artifactKey = "lesson-audio/learner-1/direct-recording.webm";
    const upload = vi.fn().mockResolvedValue(artifactKey);
    const gradedProgress = {
      ...lesson.progress,
      evidence: { speaking: { attempts: 1, status: "correct" as const, artifactKey, feedback: "Phần nói đã được chấm." } }
    };
    const submit = vi.fn().mockResolvedValue({
      lessonId: lesson.id,
      partCode: "speaking",
      evidence: gradedProgress.evidence.speaking,
      progress: gradedProgress
    });

    render(<LearnerLesson view={{ lesson: {
      ...lesson,
      content: { parts: [{ code: "speaking", title: "Nói", content: { prompt: "Ghi âm câu trả lời." } }] }
    } }} actions={callbacks({ uploadAssessmentAudio: upload, submitLessonPartAttempt: submit })} />);

    await openPractice(user);
    await user.click(screen.getByRole("button", { name: "Ghi âm" }));
    expect(screen.getByRole("button", { name: "Dừng ghi" })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Dừng ghi" }));
    await waitFor(() => expect(upload).toHaveBeenCalledOnce());

    const checkSpeaking = screen.getByRole("button", { name: "Kiểm tra nói" });
    expect(checkSpeaking).toBeEnabled();
    await user.click(checkSpeaking);

    expect(submit).toHaveBeenCalledWith("speaking", { answer: "", artifactKey });
    expect(await screen.findByText("Phần nói đã được chấm.")).toBeInTheDocument();
    expect(track.stop).toHaveBeenCalled();
  });

  it("carries the latest speaking evidence into the final lesson completion payload", async () => {
    const user = userEvent.setup();
    const speakingArtifact = "assessment-audio/learner-1/speaking.webm";
    const speakingAnswer = "I present the update.";
    const initialEvidence = {
      listening: { attempts: 1, status: "correct" as const, answer: "A" },
      reading: { attempts: 1, status: "correct" as const, answer: "B" },
      writing: { attempts: 1, status: "correct" as const, answer: "Writing" },
      word_class: { attempts: 1, status: "correct" as const, answer: "Noun" },
      word_use: { attempts: 1, status: "correct" as const, answer: "Use" },
      speaking: { attempts: 0, status: "unanswered" as const, answer: speakingAnswer, artifactKey: speakingArtifact }
    };
    const completeEvidence = {
      ...initialEvidence,
      speaking: { attempts: 1, status: "correct" as const, answer: speakingAnswer, artifactKey: speakingArtifact }
    };
    const lifecycleLesson: LessonView["lesson"] = {
      ...lesson,
      content: { parts: [
        { code: "objective", title: "Mục tiêu", content: { text: "Mục tiêu" } },
        { code: "listening", title: "Nghe", content: { prompt: "Chọn A", answer: "A", options: ["A", "B"] } },
        { code: "reading", title: "Đọc", content: { prompt: "Chọn B", answer: "B", options: ["A", "B"] } },
        { code: "writing", title: "Viết", content: { prompt: "Viết câu" } },
        { code: "word_class", title: "Từ loại", content: { prompt: "Chọn từ loại" } },
        { code: "word_use", title: "Dùng từ", content: { prompt: "Dùng từ" } },
        { code: "speaking", title: "Nói", content: { prompt: "Ghi âm" } }
      ] },
      progress: {
        status: "in_progress",
        completedPartCodes: ["listening", "reading", "writing", "word_class", "word_use"],
        evidence: initialEvidence
      }
    };
    const submit = vi.fn().mockResolvedValue({
      evidence: completeEvidence.speaking,
      progress: {
        ...lifecycleLesson.progress,
        completedPartCodes: [...lifecycleLesson.progress.completedPartCodes, "speaking"],
        evidence: completeEvidence
      }
    });
    const save = vi.fn().mockResolvedValue(undefined);

    render(<LearnerLesson view={{ lesson: lifecycleLesson }} actions={callbacks({ saveLessonProgress: save, submitLessonPartAttempt: submit })} />);
    await openPractice(user);

    const speaking = screen.getAllByTestId("app-lesson-part").find((part) => part.dataset.part === "speaking");
    await user.click(within(speaking as HTMLElement).getByRole("button", { name: /kiểm tra nói/i }));
    expect(await screen.findByText(/đủ các phần rồi/i)).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /hoàn thành bài/i }));
    await waitFor(() => expect(save).toHaveBeenCalledWith(expect.objectContaining({
      status: "completed",
      completedPartCodes: expect.arrayContaining(["listening", "reading", "writing", "word_class", "word_use", "speaking"]),
      evidence: expect.objectContaining({ speaking: expect.objectContaining({ attempts: 1, status: "correct", artifactKey: speakingArtifact }) })
    })));
  });

  it("reloads a persisted speaking recording through an owner-scoped signed URL", async () => {
    const artifactKey = "assessment-audio/learner-1/speaking.webm";
    const getAudio = vi.fn().mockResolvedValue({
      url: "https://audio.example.test/speaking.webm",
      expiresAt: "2026-10-15T12:05:00.000Z"
    });
    render(<LearnerLesson view={{ lesson: {
      ...lesson,
      content: { parts: [{ code: "speaking", title: "Nói", content: { prompt: "Ghi âm" } }] },
      progress: {
        status: "in_progress",
        completedPartCodes: [],
        evidence: { speaking: { attempts: 1, answer: "Hello", artifactKey } }
      }
    } }} actions={callbacks({ getAssessmentAudioReadUrl: getAudio })} />);

    await openPractice(userEvent.setup());
    await waitFor(() => expect(getAudio).toHaveBeenCalledWith(artifactKey));
    expect(screen.getByLabelText(/nghe lại file ghi âm/i)).toHaveAttribute(
      "src",
      "https://audio.example.test/speaking.webm"
    );
  });
});
