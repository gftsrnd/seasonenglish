// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { LearnerHome, LearnerMonthly } from "./Home.js";
import type { LearnerCallbacks, LearnerHomeView } from "./contracts.js";

afterEach(cleanup);

const lessonOne = { id: "lesson-1", dayNumber: 1, newLessonNumber: 1, teachingLabel: "Bài 1", title: "Our team meets on Monday", status: "not_started" as const, lock: null, lessonDate: "2026-11-02", kind: "new" as const };

/** A learner approved on 12/11 (after 25% of November's school days): học thử, counting from 01/12. */
function homeView(overrides: Partial<LearnerHomeView> = {}): LearnerHomeView {
  return {
    onboardingRequired: false, learner: { displayName: "Học viên", cefr: "A1" }, program: null, week: null,
    month: { month: "2026-11", themeTitle: "Team meetings", themeBrief: "", communicationGoal: "", examDate: "2026-11-30", systemDate: "2026-11-12" },
    lessons: [lessonOne], nextLesson: lessonOne,
    metrics: { completedLessons: 0, totalLessons: 16, studyDays: 0, streakDays: 0, points: 0, completedReviews: 0, totalReviews: 4 },
    schedule: { daysPerWeek: 5, lessonMinutes: 10, days: [] },
    coach: { turnsThisWeek: 0, targetTurns: 30, href: "/coach" }, practice: { status: "locked", detail: "", href: "/practice" },
    levelReadiness: { targetLevel: "A2", windowDays: 14, eligible: false, examAvailable: false, criteria: [] },
    monthlyUncounted: { countsFrom: "2026-12-01" },
    ...overrides
  } as unknown as LearnerHomeView;
}

const actions = { navigate: () => undefined } as unknown as LearnerCallbacks;

describe("uncounted (học thử) month on Home", () => {
  it("keeps trial lessons in the calendar and the announcement in the bell", () => {
    render(<LearnerHome view={homeView()} actions={actions} />);
    expect(screen.queryByText(/Tháng này bạn học thử để làm quen/)).not.toBeInTheDocument();
    expect(screen.queryByRole("region", { name: "Tiến độ tháng" })).not.toBeInTheDocument();
    expect(screen.getByText(/Gợi ý học thử/)).toBeInTheDocument();
    // The learner is not told to wait: lesson 1 is offered as a catch-up lesson.
    expect(screen.queryByText(/Bạn sẽ bắt đầu học từ ngày/)).not.toBeInTheDocument();
    expect(document.querySelector('[data-home-block="primary"] a[href="/lesson/lesson-1"]')).not.toBeNull();
    // No attendance or absence counting is shown.
    expect(document.querySelector('[data-home-metric="absence"]')).toBeNull();
    expect(screen.getByRole("gridcell", { name: "2026-11-30" })).toHaveTextContent("Miễn thi");
    expect(screen.queryByRole("link", { name: "Bài thi tháng" })).toBeNull();
  });

  it("shows the exam exemption on the monthly landing page", () => {
    render(<LearnerMonthly view={homeView()} actions={actions} />);
    expect(screen.getByText("Tháng học thử không có bài thi.")).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Vào bài thi" })).toBeNull();
  });

  it("shows no notice in a counted month", () => {
    const { monthlyUncounted: _trial, ...counted } = homeView();
    render(<LearnerHome view={counted} actions={actions} />);
    expect(screen.queryByText(/học thử/)).not.toBeInTheDocument();
    expect(screen.getByRole("region", { name: "Tiến độ tháng" })).toBeInTheDocument();
  });
});
