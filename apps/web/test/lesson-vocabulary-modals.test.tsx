// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { LessonPart, LessonView } from "@e4s/contracts";
import { LearnerLesson } from "../src/app/learner/Learning.js";
import type { LearnerCallbacks } from "../src/app/learner/contracts.js";

afterEach(cleanup);

const actions = (): LearnerCallbacks => ({
  navigate: vi.fn(), saveProfileDraft: vi.fn(), saveProfile: vi.fn(), startAssessment: vi.fn(),
  saveAssessmentResponse: vi.fn(), completeAssessmentSection: vi.fn(), submitAssessment: vi.fn(),
  uploadAssessmentAudio: vi.fn(async () => "artifact"), recordAssessmentAudioPlay: vi.fn(async () => ({ playCount: 1, remaining: 1 })),
  createAssessmentAppeal: vi.fn(), completeLessonStudy: vi.fn(), saveLessonProgress: vi.fn(), submitMicroAnswer: vi.fn(), completeMicroLesson: vi.fn(),
  regenerateMicroLesson: vi.fn(), sendCoachMessage: vi.fn(), changeCoachPersona: vi.fn(), startNewCoachChat: vi.fn(),
  sendChallengeMessage: vi.fn(), submitWeeklyPractice: vi.fn(), submitSurvey: vi.fn(), saveAvatar: vi.fn(), printReward: vi.fn(),
  speak: vi.fn(), generateGameSet: vi.fn(), useWeeklyGameSet: vi.fn(), deleteGameSet: vi.fn(), finishGame: vi.fn(), resetGameResult: vi.fn(),
  resolveGameWordImage: vi.fn(async () => ({ status: "unavailable" as const })), createDuel: vi.fn()
});

const vocabularyPart: LessonPart = {
  code: "vocabulary",
  title: "Từ vựng",
  content: {
    items: [{
      word: "colleague",
      type: "danh từ",
      pronunciation: "/ˈkɒliːɡ/",
      meaning: "đồng nghiệp",
      examples: ["I work with my colleagues."],
      family: [
        { word: "colleague", type: "noun", meaning: "đồng nghiệp" },
        { word: "collegial", type: "adjective", meaning: "thân thiện như đồng nghiệp" }
      ],
      synonyms: [
        { word: "coworker", level: "A2", note: "dùng trong giao tiếp công việc" },
        { word: "associate", level: "B1", note: "trang trọng hơn" }
      ],
      antonyms: [{ word: "competitor", level: "B1", note: "đối lập trong ngữ cảnh kinh doanh" }],
      umbrella: {
        word: "people at work",
        meaning: "những người trong môi trường làm việc",
        siblings: [{ word: "manager", meaning: "quản lý" }, { word: "client", meaning: "khách hàng" }]
      },
      lexicalDetails: [
        { kind: "synonym", word: "coworker", definition: "a person you work with", example: "My coworker joined the call.", context: "workplace", note: "common", source: "lesson" },
        { kind: "antonym", word: "competitor", definition: "a person or company competing with you", example: "The competitor launched a new service.", context: "business", note: "contrast", source: "lesson" },
        { kind: "slang", word: "workmate", definition: "a colleague", context: "informal", source: "lesson" },
        { kind: "poetic", word: "fellow worker", definition: "a person sharing your work", note: "literary", source: "lesson" }
      ]
    }]
  }
};

const lesson: LessonView = {
  id: "00000000-0000-4000-8000-000000000201", title: "I work in…", dayNumber: 1, durationMinutes: 10, cefr: "A2",
  content: { parts: [vocabularyPart] },
  progress: { status: "not_started", completedPartCodes: [], evidence: {} },
  lock: null
};

describe("lesson vocabulary relation modals", () => {
  it("opens only the umbrella modal with playable related words", async () => {
    const user = userEvent.setup();
    render(<LearnerLesson view={{ lesson }} actions={actions()} />);
    await user.click(screen.getByRole("button", { name: /Từ bao trùm: people at work/i }));
    const modal = screen.getByTestId("modal.vocab-umbrella");
    expect(modal).toBeInTheDocument();
    expect(within(modal).getByRole("heading", { name: /Từ bao quát/i })).toBeInTheDocument();
    expect(modal).toHaveTextContent("people at work");
    expect(within(modal).getByRole("article", { name: "Từ bao quát people at work" })).toHaveClass("vocabulary-umbrella-summary");
    expect(within(modal).getAllByRole("button", { name: /nghe/i }).length).toBeGreaterThan(0);
  });

  it("speaks synonym and antonym directly while keeping the family table centered", async () => {
    const user = userEvent.setup();
    const callbacks = actions();
    render(<LearnerLesson view={{ lesson }} actions={callbacks} />);
    const card = screen.getByRole("article", { name: /colleague/i });
    await user.click(within(card).getByRole("button", { name: "Nghe từ đồng nghĩa: coworker" }));
    expect(callbacks.speak).toHaveBeenLastCalledWith("coworker");
    expect(screen.queryByTestId("modal.vocab-all-synonyms")).not.toBeInTheDocument();
    await user.click(within(card).getByRole("button", { name: "Nghe từ trái nghĩa: competitor" }));
    expect(callbacks.speak).toHaveBeenLastCalledWith("competitor");
    expect(screen.queryByTestId("modal.vocab-antonyms")).not.toBeInTheDocument();
    await user.click(within(card).getByRole("button", { name: "Word family (2)" }));
    const modal = screen.getByTestId("modal.vocab-family");
    expect(modal.parentElement?.parentElement).toBe(document.body);
    expect(within(modal).getByText("collegial")).toBeInTheDocument();
    await user.click(within(modal).getAllByRole("button", { name: /Nghe/i })[0]!);
    expect(callbacks.speak).toHaveBeenCalled();
  });

  it("does not render a misleading related-word chip when the server has no detail", () => {
    const emptyLesson = {
      ...lesson,
      content: { parts: [{ ...vocabularyPart, content: { items: [{ word: "role", meaning: "vai trò", lexicalDetails: [] }] } }] }
    } as LessonView;
    render(<LearnerLesson view={{ lesson: emptyLesson }} actions={actions()} />);
    expect(screen.queryByRole("button", { name: /chi tiết từ liên quan/i })).not.toBeInTheDocument();
  });
});
