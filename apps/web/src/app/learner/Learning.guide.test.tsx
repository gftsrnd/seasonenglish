// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { WeeklyReviewSessionView } from "@e4s/contracts";
import { LearnerLesson } from "./Learning.js";
import { findSteps } from "../shared/AppGuide.js";
import { guideDefinitions } from "../shared/app-guide-steps.js";

beforeEach(() => {
  window.localStorage.clear();
  window.sessionStorage.clear();
  vi.spyOn(HTMLElement.prototype, "getClientRects").mockImplementation(function (this: HTMLElement) {
    return (this.closest("[hidden]") ? [] : [{}]) as unknown as DOMRectList;
  });
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

const studyDone = ["objective", "instruction", "vocabulary", "grammar", "pronunciation"];
const practiceCodes = ["listening", "reading", "writing", "word_class", "word_use", "speaking"];

/** A monthly lesson with every study and practice card; A2 carries the Vietnamese translate icons, B1 does not. */
function monthlyLesson(cefr: "A2" | "B1", progress: { completedPartCodes?: string[]; evidence?: Record<string, unknown> } = {}) {
  const a2 = cefr === "A2";
  const umbrella = { word: "work event", meaning: "sự kiện công việc", siblings: [{ word: "workshop" }] };
  return {
    id: `lesson-guide-${cefr}`, title: "Present Simple", dayNumber: 3, weekNumber: 1, weekTopic: "Team work", durationMinutes: 15, cefr, kind: "new", exerciseVersionId: "exercise-version-1",
    content: { parts: [
      { code: "objective", content: { items: ["Nói về lịch họp của nhóm."] } },
      { code: "instruction", content: { steps: ["Học từ vựng.", "Làm bài tập.", "Nói."] } },
      { code: "vocabulary", content: { items: [
        { word: "meeting", type: "noun", pronunciation: "/ˈmiːtɪŋ/", meaning: "cuộc họp", umbrella,
          collocations: ["team meeting"], ...(a2 ? { collocationTranslations: ["cuộc họp nhóm"] } : {}),
          synonyms: [{ word: "session", level: cefr, ...(a2 ? { note: "buổi làm việc" } : {}) }],
          antonyms: [{ word: "break", level: cefr }],
          family: [{ word: "meet" }],
          ...(a2 ? {} : { lexicalDetails: [{ kind: "slang", word: "huddle", usage: "Informal team chat." }] }) },
        { word: "agenda", type: "noun", pronunciation: "/əˈdʒendə/", meaning: "chương trình họp", umbrella },
        { word: "deadline", type: "noun", pronunciation: "/ˈdedlaɪn/", meaning: "hạn chót",
          umbrella: { word: "time limit", meaning: "giới hạn thời gian", siblings: [{ word: "due date" }] } }
      ] } },
      { code: "grammar", content: { formula: "S + V(s/es)", usage: "Dùng để nói về thói quen.", examples: ["The team meets every Monday."],
        ...(a2 ? { exampleTranslations: ["Nhóm họp mỗi thứ Hai."] } : {}) } },
      { code: "pronunciation", content: { focus: "/m/", objective: "Nghe và tập tạo âm mục tiêu",
        words: [{ word: "meeting", ipa: "/ˈmiːtɪŋ/" }, { word: "email", ipa: "/ˈiːmeɪl/" }, { word: "manager", ipa: "/ˈmænɪdʒə/" }] } },
      { code: "listening", content: { script: "The report is ready.", prompt: "Is it ready?", options: ["It is ready.", "No."], answer: "It is ready.",
        questionTranslation: "Nó đã sẵn sàng chưa?", answerTranslation: "Nó đã sẵn sàng." } },
      { code: "reading", content: { text: "The design file is not complete.", prompt: "Is it complete?", options: ["Yes", "No"], answer: "No" } },
      { code: "writing", content: { prompt: "Write one sentence about your team." } },
      { code: "word_class", content: { prompt: "The ____ is happy.", options: ["client", "clients"], answer: "client" } },
      { code: "word_use", content: { prompt: "___ a problem", options: ["fix", "make"], answer: "fix" } },
      { code: "speaking", content: { prompt: "Nói về lịch họp hàng tuần.", sample: "Our team has a meeting every Monday." } }
    ] },
    progress: { status: "in_progress", completedPartCodes: progress.completedPartCodes ?? [], evidence: progress.evidence ?? {} }
  } as any;
}

const actions = (extra: Record<string, unknown> = {}) => ({
  navigate: vi.fn(), speak: vi.fn(), saveLessonProgress: vi.fn(), completeLessonStudy: vi.fn(), ...extra
}) as any;

/** Selectors that resolved on any rendered lesson so far (the coverage test resets it). */
const resolvedSelectors = new Set<string>();
function titles() {
  const steps = findSteps(guideDefinitions("learner", "/lesson/lesson-1")!, document);
  steps.forEach((step) => resolvedSelectors.add(step.selector));
  return steps.map((step) => step.title);
}

function renderLesson(lesson: any, tab: "study" | "practice", extra: Record<string, unknown> = {}) {
  render(<LearnerLesson view={{ lesson, lock: null }} actions={actions(extra)} />);
  if (tab === "practice") fireEvent.click(screen.getByRole("tab", { name: /^2\./ }));
  return titles();
}

const listeningCorrect = { listening: { status: "correct", answer: "It is ready.", attempts: 1 } };

const reviewLesson = {
  id: "review-1", title: "Bài ôn tuần 1", dayNumber: 5, weekNumber: 1, weekTopic: "Team work", durationMinutes: 15, cefr: "A2", kind: "review",
  content: { parts: [] }, progress: { status: "in_progress", completedPartCodes: [], evidence: {} }
} as any;
const reviewSections = [
  { code: "listening" as const, title: "Nghe & nhận biết từ", totalItems: 2, correctItems: 2, completed: true },
  { code: "word_use" as const, title: "Dùng từ", totalItems: 1, correctItems: 0, completed: false }
];
function reviewSession(overrides: Partial<WeeklyReviewSessionView> = {}): WeeklyReviewSessionView {
  return {
    lessonId: "review-1", warmup: { status: "skipped", cards: [{ word: "deadline", meaning: "hạn chót" }] }, sections: reviewSections, currentSectionCode: "word_use",
    currentQuestion: { sectionCode: "word_use", itemId: "u1", variantId: "u1", retry: false, prompt: "The ___ is Friday.", options: ["deadline", "budget"], freeResponse: false, acceptsAudio: false },
    completed: false, completedAt: null, ...overrides
  };
}
async function renderReview(session: WeeklyReviewSessionView, extra: Record<string, unknown> = {}) {
  render(<LearnerLesson view={{ lesson: reviewLesson, lock: null }} actions={actions({ getWeeklyReviewSession: vi.fn().mockResolvedValue(session), ...extra })} />);
  await screen.findByRole("list", { name: "Các phần bài ôn" }).catch(() => screen.findByRole("button", { name: "Vào phần 1" }));
  return titles();
}

describe("learner lesson guide", () => {
  it("walks the A2 study tab through its main cards only", () => {
    expect(renderLesson(monthlyLesson("A2"), "study")).toEqual([
      "Đầu bài học", "Từ vựng", "Ngữ pháp", "Phát âm", "Xong phần Học", "Hoàn thành bài"
    ]);
  });

  it("walks the A2 practice tab, from the speaking lock note to the bottom bar", () => {
    expect(renderLesson(monthlyLesson("A2", { completedPartCodes: [...studyDone, "listening"], evidence: listeningCorrect }), "practice", { appealLessonPart: vi.fn() })).toEqual([
      "Đầu bài học", "Trả lời và nộp", "Mở phần Nói", "Hoàn thành bài"
    ]);
    const answer = findSteps(guideDefinitions("learner", "/lesson/1")!, document).find((step) => step.title === "Trả lời và nộp");
    expect(answer?.text).toMatch(/Báo lỗi câu này/);
  });

  it("jumps to the report form when the learner opens it", () => {
    renderLesson(monthlyLesson("A2", { completedPartCodes: studyDone }), "practice", { appealLessonPart: vi.fn() });
    fireEvent.click(screen.getAllByRole("button", { name: "Báo lỗi câu này" })[0]!);
    expect(titles()).toContain("Báo lỗi phần bài");
  });

  it("walks a B1 lesson without translate icons and with Speaking unlocked", () => {
    expect(renderLesson(monthlyLesson("B1"), "study")).toEqual([
      "Đầu bài học", "Từ vựng", "Ngữ pháp", "Phát âm", "Xong phần Học", "Hoàn thành bài"
    ]);
    const steps = findSteps(guideDefinitions("learner", "/lesson/1")!, document);
    expect(steps.filter((step) => /biểu tượng dịch/.test(step.text))).toEqual([]);
    cleanup();
    expect(renderLesson(monthlyLesson("B1", { completedPartCodes: [...studyDone, ...practiceCodes] }), "practice")).toEqual([
      "Đầu bài học", "Trả lời và nộp", "Nói", "Hoàn thành bài"
    ]);
  });

  it("explains a locked lesson", () => {
    render(<LearnerLesson view={{ lesson: monthlyLesson("A2"), lock: { reason: "date", message: "Bài mở vào thứ Tư.", dayNumber: 3, totalLessons: 20, opensAt: "2026-11-18" } as any }} actions={actions()} />);
    expect(titles()).toEqual(["Bài chưa mở"]);
  });

  it("walks the weekly review: warm-up, question with its translation, and the finished review", async () => {
    expect(await renderReview(reviewSession({ warmup: { status: "pending", cards: [{ word: "deadline", meaning: "hạn chót" }] } }))).toEqual(["Bài ôn thứ Sáu", "Khởi động lật thẻ"]);
    cleanup();

    const answerWeeklyReview = vi.fn().mockResolvedValue({ correct: true, feedback: "Đúng rồi!", willRetry: false,
      translation: { question: "Hạn chót là thứ Sáu.", answer: "hạn chót" },
      session: reviewSession({ currentQuestion: { sectionCode: "word_use", itemId: "u2", variantId: "u2", retry: false, prompt: "Send the ___.", options: ["report", "budget"], freeResponse: false, acceptsAudio: false } }) });
    expect(await renderReview(reviewSession(), { answerWeeklyReview })).toEqual(["Bài ôn thứ Sáu", "Các phần bài ôn", "Câu đang làm"]);
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: "deadline" })); });
    await screen.findByText("Send the ___.");
    expect(titles()).toEqual(["Bài ôn thứ Sáu", "Các phần bài ôn", "Câu đang làm"]);
    cleanup();

    expect(await renderReview(reviewSession({ completed: true, currentQuestion: null }))).toEqual(["Bài ôn thứ Sáu", "Các phần bài ôn", "Đã xong bài ôn"]);
  });

  it("resolves every declared /lesson/* step on at least one rendered lesson", async () => {
    resolvedSelectors.clear();
    const collect = (_titles: string[]) => cleanup();
    collect(renderLesson(monthlyLesson("A2"), "study"));
    collect(renderLesson(monthlyLesson("A2", { completedPartCodes: [...studyDone, "listening"], evidence: listeningCorrect }), "practice", { appealLessonPart: vi.fn() }));
    collect(renderLesson(monthlyLesson("B1"), "study"));
    collect(renderLesson(monthlyLesson("B1", { completedPartCodes: [...studyDone, ...practiceCodes] }), "practice"));
    renderLesson(monthlyLesson("A2", { completedPartCodes: studyDone }), "practice", { appealLessonPart: vi.fn() });
    fireEvent.click(screen.getAllByRole("button", { name: "Báo lỗi câu này" })[0]!);
    collect(titles());
    render(<LearnerLesson view={{ lesson: monthlyLesson("A2"), lock: { reason: "date", message: "Bài mở vào thứ Tư.", dayNumber: 3, totalLessons: 20 } as any }} actions={actions()} />);
    collect(titles());
    collect(await renderReview(reviewSession({ warmup: { status: "pending", cards: [{ word: "deadline", meaning: "hạn chót" }] } })));
    const answerWeeklyReview = vi.fn().mockResolvedValue({ correct: true, feedback: "Đúng rồi!", willRetry: false, translation: { question: "Câu hỏi", answer: "Đáp án" }, session: reviewSession() });
    await renderReview(reviewSession(), { answerWeeklyReview });
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: "deadline" })); });
    await screen.findByTestId("review-exercise-translation");
    collect(titles());
    collect(await renderReview(reviewSession({ completed: true, currentQuestion: null })));
    // Phones and tablets split the study tab into steps.
    const matchMedia = window.matchMedia;
    window.matchMedia = ((query: string) => ({ matches: true, media: query, onchange: null, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {}, dispatchEvent: () => false })) as typeof window.matchMedia;
    try { collect(renderLesson(monthlyLesson("A2"), "study")); } finally { window.matchMedia = matchMedia; }
    // Each variant (with or without translate icons, report button, speaking lock) counts separately.
    const missing = guideDefinitions("learner", "/lesson/1")!.filter(([selector]) => !resolvedSelectors.has(selector)).map(([selector, title]) => `${title}: ${selector}`);
    expect(missing).toEqual([]);
  });
});
