// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { WeeklyReviewSessionView } from "@e4s/contracts";
import { LearnerHome } from "./Home.js";
import { LearnerLesson } from "./Learning.js";
import type { LearnerHomeView } from "./contracts.js";

afterEach(cleanup);

const sections = [
  { code: "listening" as const, title: "Nghe & nhận biết từ", totalItems: 2, correctItems: 2, completed: true },
  { code: "word_use" as const, title: "Word use", totalItems: 1, correctItems: 0, completed: false }
];

function session(overrides: Partial<WeeklyReviewSessionView> = {}): WeeklyReviewSessionView {
  return {
    lessonId: "review-1",
    warmup: { status: "skipped", cards: [{ word: "deadline", meaning: "hạn chót" }] },
    sections,
    currentSectionCode: "word_use",
    currentQuestion: { sectionCode: "word_use", itemId: "u1", variantId: "u1", retry: false, prompt: "The ___ is Friday.", options: ["deadline", "budget"], freeResponse: false, acceptsAudio: false },
    completed: false,
    completedAt: null,
    ...overrides
  };
}

const reviewLesson = {
  id: "review-1", title: "Bài ôn tuần 1", dayNumber: 5, weekNumber: 0, weekTopic: "Handover", durationMinutes: 15, cefr: "A2", kind: "review",
  content: { parts: [] }, progress: { status: "in_progress", completedPartCodes: [], evidence: {} }
} as any;

describe("weekly review runner", () => {
  it("plays listen-and-choose words and records the read-aloud sentence instead of typing it", async () => {
    const user = userEvent.setup();
    const speak = vi.fn();
    const listening = session({ currentSectionCode: "listening", currentQuestion: { sectionCode: "listening", itemId: "l1", variantId: "l1", retry: false, prompt: "Nghe và chọn nghĩa đúng", audioText: "deadline", options: ["hạn chót", "ngân sách"], freeResponse: false, acceptsAudio: false } });
    const first = render(<LearnerLesson view={{ lesson: reviewLesson, lock: null }} actions={{ navigate: vi.fn(), speak, saveLessonProgress: vi.fn(), getWeeklyReviewSession: vi.fn().mockResolvedValue(listening) } as any} />);
    await user.click(await screen.findByRole("button", { name: /Nghe/ }));
    expect(speak).toHaveBeenCalledWith("deadline");
    expect(screen.queryByText("deadline")).not.toBeInTheDocument();
    first.unmount();

    const readAloud = session({ currentSectionCode: "speaking", currentQuestion: { sectionCode: "speaking", itemId: "s3", variantId: "s3", retry: false, prompt: "Đọc to câu sau", passage: "The key cost can change.", freeResponse: true, acceptsAudio: true } });
    render(<LearnerLesson view={{ lesson: reviewLesson, lock: null }} actions={{ navigate: vi.fn(), speak, saveLessonProgress: vi.fn(), getWeeklyReviewSession: vi.fn().mockResolvedValue(readAloud), uploadAssessmentAudio: vi.fn(), answerWeeklyReview: vi.fn() } as any} />);
    expect(await screen.findByText(/Ghi âm khi bạn đọc to câu ở trên/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Nộp bản ghi âm" })).toBeDisabled();
    expect(screen.queryByRole("button", { name: "Kiểm tra" })).not.toBeInTheDocument();
  });

  it("resumes at the first unfinished section and keeps finished sections marked", async () => {
    const getWeeklyReviewSession = vi.fn().mockResolvedValue(session());
    render(<LearnerLesson view={{ lesson: reviewLesson, lock: null }} actions={{ navigate: vi.fn(), speak: vi.fn(), saveLessonProgress: vi.fn(), getWeeklyReviewSession } as any} />);
    expect(await screen.findByText("The ___ is Friday.")).toBeInTheDocument();
    const list = screen.getByRole("list", { name: "Các phần bài ôn" });
    expect(within(list).getByText(/Nghe & nhận biết từ · 2\/2/)).toBeInTheDocument();
    expect(within(list).getByText(/Word use · 0\/1/).closest("li")).toHaveAttribute("aria-current", "step");
    expect(getWeeklyReviewSession).toHaveBeenCalledTimes(1);
  });

  it("explains a wrong answer and shows the item again as a retry", async () => {
    const user = userEvent.setup();
    const retry = session({ currentQuestion: { sectionCode: "word_use", itemId: "u1", variantId: "u1-a", retry: true, prompt: "We must meet the ___.", options: ["deadline", "budget"], freeResponse: false, acceptsAudio: false } });
    const answerWeeklyReview = vi.fn().mockResolvedValue({ correct: false, feedback: "Hạn chót dùng deadline.", willRetry: true, session: retry });
    render(<LearnerLesson view={{ lesson: reviewLesson, lock: null }} actions={{ navigate: vi.fn(), speak: vi.fn(), saveLessonProgress: vi.fn(), getWeeklyReviewSession: vi.fn().mockResolvedValue(session()), answerWeeklyReview } as any} />);
    await user.click(await screen.findByRole("button", { name: "budget" }));
    expect(answerWeeklyReview).toHaveBeenCalledWith({ sectionCode: "word_use", itemId: "u1", answer: "budget" });
    expect(await screen.findByRole("status")).toHaveTextContent("Hạn chót dùng deadline. Câu này sẽ quay lại ở cuối phần.");
    expect(screen.getByText("We must meet the ___.")).toBeInTheDocument();
    expect(screen.getByText("Làm lại")).toBeInTheDocument();
  });

  it("offers an optional warm-up that can be skipped", async () => {
    const user = userEvent.setup();
    const setWeeklyReviewWarmup = vi.fn().mockResolvedValue(session());
    render(<LearnerLesson view={{ lesson: reviewLesson, lock: null }} actions={{ navigate: vi.fn(), speak: vi.fn(), saveLessonProgress: vi.fn(), getWeeklyReviewSession: vi.fn().mockResolvedValue(session({ warmup: { status: "pending", cards: [{ word: "deadline", meaning: "hạn chót" }] } })), setWeeklyReviewWarmup } as any} />);
    await user.click(await screen.findByRole("button", { name: "hạn chót" }));
    expect(screen.getByRole("button", { name: "deadline" })).toHaveAttribute("aria-pressed", "true");
    await user.click(screen.getByRole("button", { name: "Bỏ qua" }));
    expect(setWeeklyReviewWarmup).toHaveBeenCalledWith("skipped");
    expect(await screen.findByText("The ___ is Friday.")).toBeInTheDocument();
  });
});

describe("locked Monday after an unfinished review", () => {
  const lock = { reason: "review" as const, message: "Hoàn thành bài ôn tuần 1 để mở bài này.", dayNumber: 6, totalLessons: 20, reviewWeekNumber: 1, blocker: { id: "review-1", dayNumber: 5, title: "Bài ôn tuần 1" } };

  it("tells the learner which weekly review opens the lesson", () => {
    const lesson = { ...reviewLesson, id: "lesson-6", dayNumber: 6, kind: "new", title: "Monday lesson" };
    render(<LearnerLesson view={{ lesson, lock }} actions={{ navigate: vi.fn(), speak: vi.fn(), saveLessonProgress: vi.fn() } as any} />);
    expect(screen.getByRole("heading", { name: "Hoàn thành bài ôn tuần 1 để mở bài này" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Làm bài ôn tuần 1" })).toHaveAttribute("href", "/lesson/review-1");
  });

  it("shows the review gate on the home primary card", () => {
    const next = { id: "lesson-6", dayNumber: 6, title: "Monday lesson", status: "not_started" as const, lock, lessonDate: "2026-11-09", kind: "new" as const };
    const view = {
      onboardingRequired: false, learner: { displayName: "Học viên", cefr: "A2" }, program: null, week: null,
      month: { month: "2026-11", themeTitle: "Handover", themeBrief: "", communicationGoal: "", examDate: "2026-11-30", systemDate: "2026-11-09" },
      lessons: [next], nextLesson: next,
      metrics: { completedLessons: 4, totalLessons: 16, studyDays: 4, streakDays: 0, points: 0, completedReviews: 0, totalReviews: 4 },
      schedule: { daysPerWeek: 5, lessonMinutes: 10, days: [] },
      coach: { turnsThisWeek: 0, targetTurns: 30, href: "/coach" },
      levelReadiness: { targetLevel: "B1", windowDays: 14, eligible: false, examAvailable: false, criteria: [] }
    } as unknown as LearnerHomeView;
    render(<LearnerHome view={view} actions={{ navigate: vi.fn() } as any} />);
    const primary = document.querySelector<HTMLElement>('[data-home-block="primary"]')!;
    expect(within(primary).getByRole("heading", { name: "Hoàn thành bài ôn tuần 1 để mở bài này" })).toBeInTheDocument();
    expect(within(primary).getByRole("link", { name: "Làm bài ôn tuần 1" })).toHaveAttribute("href", "/lesson/review-1");
  });
});
