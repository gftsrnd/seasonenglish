// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { LessonPart, LessonView } from "@e4s/contracts";
import { PrototypeLesson } from "../src/prototype/learner/Learning.js";
import type { LearnerPrototypeCallbacks } from "../src/prototype/learner/contracts.js";

afterEach(cleanup);

const actions = (): LearnerPrototypeCallbacks => ({
  navigate: vi.fn(), saveProfileDraft: vi.fn(), saveProfile: vi.fn(), startAssessment: vi.fn(),
  saveAssessmentResponse: vi.fn(), completeAssessmentSection: vi.fn(), submitAssessment: vi.fn(),
  uploadAssessmentAudio: vi.fn(async () => "artifact"), recordAssessmentAudioPlay: vi.fn(async () => ({ playCount: 1, remaining: 1 })),
  createAssessmentAppeal: vi.fn(), saveLessonProgress: vi.fn(), submitMicroAnswer: vi.fn(), completeMicroLesson: vi.fn(),
  regenerateMicroLesson: vi.fn(), sendCoachMessage: vi.fn(), changeCoachPersona: vi.fn(), startNewCoachChat: vi.fn(),
  sendChallengeMessage: vi.fn(), submitWeeklyPractice: vi.fn(), submitSurvey: vi.fn(), saveAvatar: vi.fn(), printReward: vi.fn(),
  speak: vi.fn(), generateGameSet: vi.fn(), useWeeklyGameSet: vi.fn(), deleteGameSet: vi.fn(), finishGame: vi.fn(), resetGameResult: vi.fn(),
  resolveGameWordImage: vi.fn(async () => null), createDuel: vi.fn()
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
  it.each([
    ["Xem họ từ", "modal.vocab-family", "Họ từ", "collegial"],
    ["Xem tất cả từ đồng nghĩa", "modal.vocab-all-synonyms", "Tất cả từ đồng nghĩa", "associate"],
    ["Từ bao quát", "modal.vocab-umbrella", "Từ bao quát", "people at work"]
  ])("opens the %s modal from server-provided vocabulary metadata", async (buttonLabel, testId, title, expected) => {
    const user = userEvent.setup();
    render(<PrototypeLesson view={{ lesson }} actions={actions()} />);
    await user.click(screen.getByRole("button", { name: new RegExp(buttonLabel, "i") }));
    const modal = screen.getByTestId(testId);
    expect(modal).toBeInTheDocument();
    expect(within(modal).getByRole("heading", { name: new RegExp(title, "i") })).toBeInTheDocument();
    expect(modal).toHaveTextContent(expected);
    expect(within(modal).getAllByRole("button", { name: /nghe/i }).length).toBeGreaterThan(0);
  });

  it("opens reusable lexical detail cards for synonym, antonym, slang and poetic relations", async () => {
    const user = userEvent.setup();
    render(<PrototypeLesson view={{ lesson }} actions={actions()} />);
    const card = screen.getByRole("article", { name: /colleague/i });
    await user.click(within(card).getByRole("button", { name: /coworker/i }));
    const modal = screen.getByTestId("modal.vocab-lexical-detail");
    expect(modal).toHaveTextContent(/đồng nghĩa/i);
    expect(modal).toHaveTextContent("a person you work with");
    expect(modal).toHaveTextContent("My coworker joined the call.");
    await user.click(within(modal).getAllByRole("button", { name: /đóng/i })[0]!);
    expect(screen.queryByTestId("modal.vocab-lexical-detail")).not.toBeInTheDocument();
  });

  it("shows an explicit empty lexical detail state when the server has no detail", async () => {
    const user = userEvent.setup();
    const emptyLesson = {
      ...lesson,
      content: { parts: [{ ...vocabularyPart, content: { items: [{ word: "role", meaning: "vai trò", lexicalDetails: [] }] } }] }
    } as LessonView;
    render(<PrototypeLesson view={{ lesson: emptyLesson }} actions={actions()} />);
    await user.click(screen.getByRole("button", { name: /chi tiết từ liên quan/i }));
    expect(screen.getByTestId("modal.vocab-lexical-detail")).toHaveTextContent(/chưa có chi tiết/i);
  });
});
