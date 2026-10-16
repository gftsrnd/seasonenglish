// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { LessonPart } from "@e4s/contracts";
import { PrototypeLesson } from "../src/prototype/learner/Learning.js";
import type { LearnerPrototypeCallbacks, LessonPrototypeView } from "../src/prototype/learner/contracts.js";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  Reflect.deleteProperty(window, "speechSynthesis");
});

const callbacks = (overrides: Partial<LearnerPrototypeCallbacks> = {}) => ({
  navigate: vi.fn(), saveProfileDraft: vi.fn(), saveProfile: vi.fn(), startAssessment: vi.fn(), saveAssessmentResponse: vi.fn(),
  completeAssessmentSection: vi.fn(), submitAssessment: vi.fn(), uploadAssessmentAudio: vi.fn(), recordAssessmentAudioPlay: vi.fn(),
  createAssessmentAppeal: vi.fn(), saveLessonProgress: vi.fn(), submitMicroAnswer: vi.fn(), completeMicroLesson: vi.fn(),
  regenerateMicroLesson: vi.fn(), sendCoachMessage: vi.fn(), changeCoachPersona: vi.fn(), startNewCoachChat: vi.fn(),
  sendChallengeMessage: vi.fn(), submitWeeklyPractice: vi.fn(), submitSurvey: vi.fn(), saveAvatar: vi.fn(), printReward: vi.fn(),
  speak: vi.fn(), generateGameSet: vi.fn(), useWeeklyGameSet: vi.fn(), deleteGameSet: vi.fn(), finishGame: vi.fn(), resetGameResult: vi.fn(),
  resolveGameWordImage: vi.fn(), createDuel: vi.fn(), ...overrides
} as unknown as LearnerPrototypeCallbacks);

const parts: LessonPart[] = [
  { code: "objective", title: "Mục tiêu", content: { text: "Mục tiêu" } },
  { code: "listening", title: "Nghe", content: { prompt: "Chọn A", answer: "A", options: ["A", "B"] } },
  { code: "reading", title: "Đọc", content: { prompt: "Chọn B", answer: "B", options: ["A", "B"] } },
  { code: "writing", title: "Viết", content: { prompt: "Viết câu" } },
  { code: "speaking", title: "Nói", content: { prompt: "Ghi âm" } }
];

const lesson = {
  id: "00000000-0000-4000-8000-000000000201", title: "Bài 2", dayNumber: 2, durationMinutes: 10, cefr: "A2" as const,
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

describe("prototype lesson evidence states", () => {
  it("keeps a lesson save unavailable until the learner chooses or enters an answer", async () => {
    const user = userEvent.setup();
    render(<PrototypeLesson view={{ lesson }} actions={callbacks({ submitLessonPartAttempt: vi.fn() })} />);

    await openPractice(user);
    const listening = screen.getAllByTestId("prototype-lesson-part").find((part) => part.dataset.part === "listening");
    const save = within(listening as HTMLElement).getByRole("button", { name: /nộp bài/i });

    expect(save).toBeDisabled();
    await user.click(within(listening as HTMLElement).getByRole("radio", { name: "A" }));
    expect(save).toBeEnabled();
  });

  it("shows a pending state and prevents duplicate part submissions", async () => {
    let resolveSubmit!: (value: { lessonId: string; partCode: "listening"; evidence: { attempts: number; status: "correct"; answer: string }; progress: typeof lesson.progress }) => void;
    const submit = vi.fn(() => new Promise<{ lessonId: string; partCode: "listening"; evidence: { attempts: number; status: "correct"; answer: string }; progress: typeof lesson.progress }>((resolve) => { resolveSubmit = resolve; }));
    const user = userEvent.setup();
    render(<PrototypeLesson view={{ lesson }} actions={callbacks({ submitLessonPartAttempt: submit })} />);
    await openPractice(user);
    const listening = screen.getAllByTestId("prototype-lesson-part").find((part) => part.dataset.part === "listening");

    await user.click(within(listening as HTMLElement).getByRole("radio", { name: "A" }));
    await user.click(within(listening as HTMLElement).getByRole("button", { name: /nộp bài/i }));

    expect(within(listening as HTMLElement).getByRole("button", { name: "Đang lưu…" })).toBeDisabled();
    expect(submit).toHaveBeenCalledOnce();
    resolveSubmit({ lessonId: lesson.id, partCode: "listening", evidence: { attempts: 1, status: "correct", answer: "A" }, progress: lesson.progress });
  });

  it("keeps a part submission recoverable after a server error", async () => {
    const user = userEvent.setup();
    const submit = vi.fn().mockRejectedValueOnce(new Error("SUBMIT_FAILED"));
    render(<PrototypeLesson view={{ lesson }} actions={callbacks({ submitLessonPartAttempt: submit })} />);
    await openPractice(user);
    const listening = screen.getAllByTestId("prototype-lesson-part").find((part) => part.dataset.part === "listening");

    await user.click(within(listening as HTMLElement).getByRole("radio", { name: "A" }));
    await user.click(within(listening as HTMLElement).getByRole("button", { name: /nộp bài/i }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Chưa lưu được câu trả lời");
    expect(within(listening as HTMLElement).getByRole("button", { name: /nộp bài/i })).toBeEnabled();
  });

  it("shows a pending state while confirming the study step", async () => {
    let resolveSave!: () => void;
    const save = vi.fn(() => new Promise<void>((resolve) => { resolveSave = resolve; }));
    const user = userEvent.setup();
    render(<PrototypeLesson view={{ lesson }} actions={callbacks({ saveLessonProgress: save })} />);

    await user.click(screen.getByRole("button", { name: /đã học xong.*làm bài tập/i }));

    expect(screen.getByRole("button", { name: "Đang lưu…" })).toBeDisabled();
    expect(save).toHaveBeenCalledOnce();
    resolveSave();
  });

  it("renders ordered instruction steps inside the existing study card", () => {
    const instructionLesson: typeof lesson = {
      ...lesson,
      content: {
        parts: [
          { code: "objective", title: "Mục tiêu", content: { text: "Mục tiêu" } },
          { code: "instruction", title: "Hướng dẫn làm bài", content: { steps: ["Học nội dung", "Làm lần lượt các bài tập", "Xem phản hồi và làm lại"] } }
        ]
      }
    };
    render(<PrototypeLesson view={{ lesson: instructionLesson }} actions={callbacks()} />);

    const instruction = screen.getAllByTestId("prototype-lesson-part").find((part) => part.dataset.part === "instruction");
    expect(instruction).toBeDefined();
    expect(within(instruction as HTMLElement).getByRole("heading", { name: "Hướng dẫn làm bài" })).toBeInTheDocument();
    expect(within(instruction as HTMLElement).getByRole("list")).toHaveClass("lesson-instruction-list");
    // The prototype keeps the three authored guidance steps and appends the
    // two lifecycle gates that explain how the learner unlocks and completes
    // the practice step.
    expect(within(instruction as HTMLElement).getAllByRole("listitem")).toHaveLength(5);
    expect(within(instruction as HTMLElement).getByText("Làm lần lượt các bài tập")).toBeInTheDocument();
    expect(within(instruction as HTMLElement).getByText(/Đã học xong.*mở phần Bài tập/)).toBeInTheDocument();
    expect(within(instruction as HTMLElement).getByText(/Xong hết các phần.*Hoàn thành bài/)).toBeInTheDocument();
  });

  it("keeps exercises locked until the learner confirms the study step", async () => {
    const user = userEvent.setup();
    render(<PrototypeLesson view={{ lesson }} actions={callbacks()} />);

    const practiceTab = screen.getByRole("tab", { name: /2\. bài tập/i });
    expect(practiceTab).toBeDisabled();
    expect(screen.queryByRole("radio", { name: "A" })).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /đã học xong.*làm bài tập/i }));

    expect(practiceTab).toBeEnabled();
    expect(practiceTab).toHaveAttribute("aria-selected", "true");
    expect(screen.getAllByRole("radio", { name: "A" }).length).toBeGreaterThan(0);
    expect(screen.getByRole("button", { name: /hoàn thành bài/i })).toBeDisabled();
  });

  it("renders listening and reading content with prototype-native choice controls", async () => {
    const user = userEvent.setup();
    const submit = vi.fn().mockResolvedValue({
      evidence: { attempts: 1, status: "correct", answer: "Nice to meet you.", score: 100 },
      progress: lesson.progress
    });
    render(<PrototypeLesson view={{ lesson: {
      ...lesson,
      content: { parts: [
        { code: "listening", title: "Nghe", content: {
          script: "Hello, I am new here.", prompt: "What does the speaker say?",
          answer: "Nice to meet you.", options: ["Goodbye.", "Nice to meet you.", "See you yesterday.", "No answer."]
        } },
        { code: "reading", title: "Đọc", content: {
          text: "Lan is new to the product team.", prompt: "Which team is Lan in?",
          answer: "The product team.", options: ["The sales team.", "The product team.", "The finance team.", "No team."]
        } }
      ] }
    } }} actions={callbacks({ submitLessonPartAttempt: submit })} />);

    await openPractice(user);
    expect(screen.getByRole("button", { name: /nghe đoạn nghe/i })).toBeInTheDocument();
    expect(screen.getByText("Lan is new to the product team.")).toBeInTheDocument();
    await user.click(screen.getByRole("radio", { name: "Nice to meet you." }));
    const listening = screen.getAllByTestId("prototype-lesson-part").find((part) => part.dataset.part === "listening");
    await user.click(within(listening as HTMLElement).getByRole("button", { name: /nộp bài/i }));
    expect(submit).toHaveBeenCalledWith("listening", { answer: "Nice to meet you." });
  });

  it("keeps lesson speech playback single-flight and announces its loading state", async () => {
    Object.defineProperty(window, "speechSynthesis", { configurable: true, value: {} });
    vi.stubGlobal("SpeechSynthesisUtterance", class {});
    let reportStatus!: (status: "started" | "ended" | "error" | "unsupported") => void;
    const speak = vi.fn((_text: string, _language?: string, options?: { onStatus?: typeof reportStatus }) => {
      reportStatus = options?.onStatus as typeof reportStatus;
    });
    const user = userEvent.setup();
    render(<PrototypeLesson view={{ lesson: {
      ...lesson,
      content: { parts: [{ code: "listening", title: "Nghe", content: { script: "The meeting starts at nine.", prompt: "Chọn ý chính." } }] }
    } }} actions={callbacks({ speak })} />);

    await openPractice(user);
    await user.click(screen.getByRole("button", { name: "Nghe đoạn nghe" }));
    expect(speak).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("button", { name: "Đang phát…" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Đang phát…" })).toHaveAttribute("aria-busy", "true");

    reportStatus("ended");
    await waitFor(() => expect(screen.getByRole("button", { name: "Nghe đoạn nghe" })).toBeEnabled());
    expect(screen.getByText("Đã phát xong.")).toBeInTheDocument();
  });

  it("submits part evidence and exposes server-returned retry feedback", async () => {
    const user = userEvent.setup();
    const submit = vi.fn().mockResolvedValue({ evidence: { attempts: 1, status: "wrong_retry", answer: "B", score: 0 }, progress: lesson.progress });
    render(<PrototypeLesson view={{ lesson }} actions={callbacks({ submitLessonPartAttempt: submit })} />);
    await openPractice(user);
    const listening = screen.getAllByTestId("prototype-lesson-part").find((part) => part.dataset.part === "listening");
    expect(listening).toBeDefined();
    await user.click(within(listening as HTMLElement).getByRole("radio", { name: "B" }));
    await user.click(within(listening as HTMLElement).getByRole("button", { name: /nộp bài/i }));
    expect(submit).toHaveBeenCalledWith("listening", { answer: "B" });
  });

  it("renders exhausted, translated and appealed states from persisted evidence", async () => {
    const actions = callbacks({ submitLessonPartAttempt: vi.fn(), appealLessonPart: vi.fn() });
    render(<PrototypeLesson view={{ lesson: {
      ...lesson,
      progress: {
        status: "in_progress", completedPartCodes: ["reading"], evidence: {
          reading: { attempts: 2, status: "wrong_exhausted", answer: "A", score: 0, feedback: "Hãy xem lại đáp án." }
        }
      }
    } }} actions={actions} />);
    expect(screen.getByText(/đã hết lượt thử/i)).toBeInTheDocument();
    await openPractice(userEvent.setup());
    expect(screen.getByRole("button", { name: /xem bản dịch/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /gửi kháng nghị/i })).toBeInTheDocument();
  });

  it("keeps an appeal recoverable while it is pending and after it fails", async () => {
    let rejectAppeal!: (reason?: unknown) => void;
    const appeal = vi.fn(() => new Promise<never>((_, reject) => { rejectAppeal = reject; }));
    const user = userEvent.setup();
    const actions = callbacks({ submitLessonPartAttempt: vi.fn(), appealLessonPart: appeal });
    render(<PrototypeLesson view={{ lesson: {
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
    expect(screen.getByRole("button", { name: "Đang gửi…" })).toBeDisabled();

    rejectAppeal(new Error("APPEAL_FAILED"));
    expect(await screen.findByRole("alert")).toHaveTextContent("Chưa gửi được kháng nghị");
    expect(screen.getByRole("button", { name: /gửi kháng nghị/i })).toBeEnabled();
  });

  it("keeps lesson audio and speaking evidence recoverable when playback, mic or upload is unavailable", async () => {
    const user = userEvent.setup();
    const speech = vi.fn();
    const upload = vi.fn()
      .mockRejectedValueOnce(new Error("UPLOAD_FAILED"))
      .mockResolvedValue("lesson-audio/learner-1/speaking.webm");
    const submit = vi.fn().mockResolvedValue({
      evidence: { attempts: 1, status: "correct", answer: "I present the update.", artifactKey: "lesson-audio/learner-1/speaking.webm" },
      progress: lesson.progress
    });
    const mediaLesson: LessonPrototypeView["lesson"] = {
      ...lesson,
      content: {
        parts: [
          { code: "listening", title: "Nghe", content: { script: "The meeting starts at nine.", prompt: "Chọn ý chính." } },
          { code: "speaking", title: "Nói", content: { prompt: "Nói câu trả lời ngắn." } }
        ]
      }
    };

    render(<PrototypeLesson view={{ lesson: mediaLesson }} actions={callbacks({
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

    await user.type(screen.getByLabelText(/câu trả lời speaking/i), "I present the update.");
    const speaking = screen.getAllByTestId("prototype-lesson-part").find((part) => part.dataset.part === "speaking");
    await user.click(within(speaking as HTMLElement).getByRole("button", { name: /nộp bài/i }));
    expect(submit).toHaveBeenCalledWith("speaking", {
      answer: "I present the update.",
      artifactKey: "lesson-audio/learner-1/speaking.webm"
    });

    await user.click(screen.getByRole("button", { name: /nghe đoạn nghe/i }));
    expect(screen.getByText(/không phát được âm thanh|không hỗ trợ đọc văn bản/i)).toBeInTheDocument();
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
    const lifecycleLesson: LessonPrototypeView["lesson"] = {
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

    render(<PrototypeLesson view={{ lesson: lifecycleLesson }} actions={callbacks({ saveLessonProgress: save, submitLessonPartAttempt: submit })} />);
    await openPractice(user);

    const speaking = screen.getAllByTestId("prototype-lesson-part").find((part) => part.dataset.part === "speaking");
    await user.click(within(speaking as HTMLElement).getByRole("button", { name: /nộp bài/i }));
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
    render(<PrototypeLesson view={{ lesson: {
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
