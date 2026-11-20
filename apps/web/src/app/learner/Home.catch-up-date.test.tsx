// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { LearnerHome } from "./Home.js";
import { LearnerLesson } from "./Learning.js";
import type { LearnerHomeView } from "./contracts.js";

afterEach(cleanup);

/** December 2026 re-run N5: on 01/12 (a Tuesday) the A1 home showed lesson 1 as "Bài học bù". */
function homeView(next: Record<string, unknown>, systemDate: string): LearnerHomeView {
  return {
    onboardingRequired: false, learner: { displayName: "Học viên", cefr: "A1" }, program: null, week: null,
    month: { month: "2026-12", themeTitle: "Team meetings", themeBrief: "", communicationGoal: "", examDate: "2026-12-31", systemDate },
    lessons: [next], nextLesson: next,
    metrics: { completedLessons: 0, totalLessons: 16, studyDays: 0, streakDays: 0, points: 0, completedReviews: 0, totalReviews: 4 },
    schedule: { daysPerWeek: 5, lessonMinutes: 10, days: [
      { label: "T2", date: "2026-11-30", status: "upcoming" }, { label: "T3", date: "2026-12-01", status: systemDate === "2026-12-01" ? "today" : "missed" },
      { label: "T4", date: "2026-12-02", status: "upcoming" }, { label: "T5", date: "2026-12-03", status: "upcoming" }, { label: "T6", date: "2026-12-04", status: "upcoming" }
    ] },
    coach: { turnsThisWeek: 0, targetTurns: 30, href: "/coach" },
    levelReadiness: { targetLevel: "A2", windowDays: 14, eligible: false, examAvailable: false, criteria: [] }
  } as unknown as LearnerHomeView;
}

const lessonOne = (status: "not_started" | "in_progress") => ({ id: "lesson-1", dayNumber: 1, newLessonNumber: 1, teachingLabel: "Bài 1", title: "Our team meets on Monday", status, lock: null, lessonDate: "2026-12-01", kind: "new" as const });
const primary = () => document.querySelector<HTMLElement>('[data-home-block="primary"]')!;

describe("make-up lesson label follows the lesson date (December 2026 N5)", () => {
  it("shows lesson 1 on its own date as today's lesson, started or not", () => {
    for (const status of ["not_started", "in_progress"] as const) {
      render(<LearnerHome view={homeView(lessonOne(status), "2026-12-01")} actions={{ navigate: vi.fn() } as never} />);
      expect(within(primary()).queryByText(/Bài học bù/u)).not.toBeInTheDocument();
      expect(within(primary()).getByText(/Bài hôm nay/u)).toBeInTheDocument();
      cleanup();
    }
  });

  it("calls a lesson make-up only once its date is before the learner's current (simulated) date", () => {
    render(<LearnerHome view={homeView(lessonOne("not_started"), "2026-12-02")} actions={{ navigate: vi.fn() } as never} />);
    expect(within(primary()).getByText(/Bài học bù/u)).toBeInTheDocument();
  });
});

describe("learner lesson header has no roadmap step label (December 2026 #15)", () => {
  it("shows the lesson title without the 'Cấu trúc' label", () => {
    const lesson = { id: "lesson-1", title: "Our team meets on Monday", dayNumber: 1, newLessonNumber: 1, teachingLabel: "Bài 1", kind: "new", weekNumber: 0, weekTopic: "Team meetings", durationMinutes: 10, cefr: "A1",
      content: { parts: [{ code: "grammar", title: "Ngữ pháp", content: { formula: "Subject + am/is/are", text: "Nhận biết động từ to be.", examples: ["I am Lan."] } }] },
      progress: { status: "not_started", completedPartCodes: [], evidence: {} } } as never;
    render(<LearnerLesson view={{ lesson }} actions={{ navigate: vi.fn(), speak: vi.fn(), saveLessonProgress: vi.fn() } as never} />);
    expect(document.querySelector("[data-lesson-structure]")).toHaveTextContent("Our team meets on Monday");
    expect(screen.queryByText(/^Cấu trúc$/u)).not.toBeInTheDocument();
  });
});
