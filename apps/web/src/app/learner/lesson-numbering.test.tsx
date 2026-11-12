// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { LearnerHome } from "./Home.js";
import { LearnerLesson } from "./Learning.js";
import type { LearnerHomeView } from "./contracts.js";
import { learnerLessonPhrase } from "./ui.js";

afterEach(cleanup);

// 2026-11: slot 5 (06/11) is the Friday review, so slot 6 (09/11) is "Bài 5" and slot 7 is "Bài 6".
const blocker = { id: "lesson-6", dayNumber: 6, title: "Can you check it?", label: "Bài 5" };
const lock = { reason: "prior" as const, message: "Bạn chưa hoàn thành bài 5 · Can you check it?.", dayNumber: 7, totalLessons: 20, blocker };

function homeView(next: Record<string, unknown>): LearnerHomeView {
  return {
    onboardingRequired: false, learner: { displayName: "Học viên", cefr: "A1" }, program: null, week: null,
    month: { month: "2026-11", themeTitle: "Handover", themeBrief: "", communicationGoal: "", examDate: "2026-11-30", systemDate: "2026-11-10" },
    lessons: [next], nextLesson: next,
    metrics: { completedLessons: 4, totalLessons: 16, studyDays: 4, streakDays: 0, points: 0, completedReviews: 1, totalReviews: 4 },
    schedule: { daysPerWeek: 5, lessonMinutes: 10, days: [] },
    coach: { turnsThisWeek: 0, targetTurns: 30, href: "/coach" }, practice: { status: "locked", detail: "", href: "/practice" },
    levelReadiness: { targetLevel: "A2", windowDays: 14, eligible: false, examAvailable: false, criteria: [] }
  } as unknown as LearnerHomeView;
}

describe("learner lesson numbering (new lessons only, Friday reviews not counted)", () => {
  it("phrases labels for use inside a sentence", () => {
    expect(learnerLessonPhrase("Bài 5")).toBe("bài 5");
    expect(learnerLessonPhrase("Ôn tuần 1")).toBe("bài ôn tuần 1");
  });

  it("names the blocking lesson by its new-lesson number on the locked lesson page", () => {
    const lesson = { id: "lesson-7", title: "Bài 6", dayNumber: 7, newLessonNumber: 6, teachingLabel: "Bài 6", kind: "new", weekNumber: 0, weekTopic: "Handover", durationMinutes: 10, cefr: "A1", content: { parts: [] }, progress: { status: "not_started", completedPartCodes: [], evidence: {} } } as any;
    render(<LearnerLesson view={{ lesson, lock }} actions={{ navigate: vi.fn(), speak: vi.fn(), saveLessonProgress: vi.fn() } as any} />);
    expect(screen.getByRole("link", { name: "Học bài 5 ngay" })).toHaveAttribute("href", "/lesson/lesson-6");
    expect(screen.queryByText(/Bài 7\//)).not.toBeInTheDocument();
    expect(screen.getByText(/Bài 6 · chưa mở/)).toBeInTheDocument();
  });

  it("uses the same number on the home primary card for a locked lesson and for catch-up", () => {
    const locked = { id: "lesson-7", dayNumber: 7, newLessonNumber: 6, teachingLabel: "Bài 6", title: "Bài 6", status: "not_started" as const, lock, lessonDate: "2026-11-10", kind: "new" as const };
    render(<LearnerHome view={homeView(locked)} actions={{ navigate: vi.fn() } as any} />);
    const primary = document.querySelector<HTMLElement>('[data-home-block="primary"]')!;
    expect(within(primary).getByRole("link", { name: "Học bài 5 ngay" })).toHaveAttribute("href", "/lesson/lesson-6");
    cleanup();

    const catchUp = { id: "lesson-6", dayNumber: 6, newLessonNumber: 5, teachingLabel: "Bài 5", title: "Can you check it?", status: "not_started" as const, lock: null, lessonDate: "2026-11-09", kind: "new" as const };
    render(<LearnerHome view={{ ...homeView(catchUp), month: { ...homeView(catchUp).month!, systemDate: "2026-11-10" } } as LearnerHomeView} actions={{ navigate: vi.fn() } as any} />);
    const card = document.querySelector<HTMLElement>('[data-home-block="primary"]')!;
    expect(within(card).queryByText(/bài 6/i)).not.toBeInTheDocument();
    expect(within(card).getAllByText(/Bài 5|bài 5/).length).toBeGreaterThan(0);
  });
});
