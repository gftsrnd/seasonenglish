// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { LessonPart, LessonView, LessonVocabularyLexicalDetail } from "@e4s/contracts";
import { LearnerLesson } from "./Learning.js";
import type { LearnerCallbacks } from "./contracts.js";

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

const VIETNAMESE = /[ăâđêôơưạảấầẩẫậắằẳẵặẹẻẽếềểễệỉĩịọỏốồổỗộớờởỡợụủũứừửữựỳỵỷỹàáèéìíòóùúý]/iu;

function lessonWith(word: string, details: LessonVocabularyLexicalDetail[], cefr: LessonView["cefr"] = "B1"): LessonView {
  const part: LessonPart = {
    code: "vocabulary",
    title: "Vocabulary",
    content: { items: [{ word, type: "noun", pronunciation: "/ˈmɔːnɪŋ/", meaning: "the early part of the day", examples: [`See you in the ${word}.`], family: [{ word: "mornings", type: "noun", meaning: "more than one morning" }, { word: "morningtide", type: "noun", meaning: "the morning" }], lexicalDetails: details }] }
  };
  return {
    id: "00000000-0000-4000-8000-000000000301", title: "Plans", dayNumber: 1, durationMinutes: 10, cefr,
    weekNumber: 1, weekTopic: "Plans",
    content: { parts: [part] },
    progress: { status: "not_started", completedPartCodes: [], evidence: {} },
    lock: null
  };
}

const slang: LessonVocabularyLexicalDetail = { kind: "slang", word: "a.m.", ipa: "/ˌeɪ ˈem/", type: "noun", definition: "the hours before midday", usage: "Fine in quick chats and texts; do not use it in formal letters." };
const poetic: LessonVocabularyLexicalDetail = { kind: "poetic", word: "morn", ipa: "/mɔːn/", type: "noun", definition: "the early part of the day", source: "Common in older poetry, Shakespeare and the King James Bible." };

describe("slang / poetic synonyms (12/11)", () => {
  it("tinted SLANG / POETIC chips sit after synonyms and before Word family, and open a modal (not a popup)", async () => {
    const user = userEvent.setup();
    const callbacks = actions();
    render(<LearnerLesson view={{ lesson: lessonWith("morning", [slang, poetic]) }} actions={callbacks} />);
    const card = screen.getByRole("article", { name: /morning/i });
    const slangChip = within(card).getByRole("button", { name: "Slang: a.m." });
    const poeticChip = within(card).getByRole("button", { name: "Poetic: morn" });
    expect(slangChip).toHaveClass("register");
    expect(slangChip).toHaveTextContent("Slang");
    expect(poeticChip).toHaveTextContent("Poetic");
    const family = within(card).getByRole("button", { name: /Word family/i });
    expect(slangChip.compareDocumentPosition(family) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();

    await user.click(poeticChip);
    expect(callbacks.speak).not.toHaveBeenCalled();
    const modal = screen.getByTestId("modal.vocab-register");
    expect(modal.parentElement?.parentElement).toBe(document.body);
    expect(within(modal).getByRole("heading", { name: "Slang & poetic" })).toBeInTheDocument();
    const cards = within(modal).getAllByRole("article");
    // The clicked word first, one card per word.
    expect(cards.map((entry) => entry.getAttribute("data-register-kind"))).toEqual(["poetic", "slang"]);
    expect(cards[0]).toHaveTextContent("morn");
    expect(cards[0]).toHaveTextContent("· noun");
    expect(cards[0]).toHaveTextContent("/mɔːn/");
    expect(cards[0]).toHaveTextContent("the early part of the day");
    expect(cards[0]).toHaveTextContent("Found in: Common in older poetry, Shakespeare and the King James Bible.");
    expect(cards[1]).toHaveTextContent("/ˌeɪ ˈem/");
    expect(cards[1]).toHaveTextContent("When to use: Fine in quick chats and texts; do not use it in formal letters.");
    expect(modal.textContent ?? "").not.toMatch(VIETNAMESE);
    await user.click(within(cards[0]!).getByRole("button", { name: "Listen poetic: morn" }));
    expect(callbacks.speak).toHaveBeenLastCalledWith("morn");
  });

  it("old stored data still renders: legacy poetic (formal) keeps the Formal label and its register note", async () => {
    const user = userEvent.setup();
    const legacy: LessonVocabularyLexicalDetail = { kind: "poetic", word: "commence", definition: "begin, in formal writing", context: "Formal: formal or literary writing" };
    render(<LearnerLesson view={{ lesson: lessonWith("morning", [legacy]) }} actions={actions()} />);
    const chip = screen.getByRole("button", { name: "Formal: commence" });
    expect(chip).toHaveTextContent("Formal");
    await user.click(chip);
    const modal = screen.getByTestId("modal.vocab-register");
    expect(modal).toHaveTextContent("commence");
    expect(modal).toHaveTextContent("begin, in formal writing");
    expect(modal).toHaveTextContent("Formal: formal or literary writing");
    expect(modal).not.toHaveTextContent("Found in");
  });

  it("A1–A2 never show slang / poetic chips", () => {
    render(<LearnerLesson view={{ lesson: lessonWith("morning", [slang, poetic], "A2") }} actions={actions()} />);
    expect(screen.queryByRole("button", { name: /Slang|Poetic|Khẩu ngữ|Văn chương/u })).not.toBeInTheDocument();
  });
});
