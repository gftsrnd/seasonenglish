// @vitest-environment jsdom
import { cleanup, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { LearnerHome } from "./Home.js";
import type { LearnerCallbacks, LearnerHomeView } from "./contracts.js";
import { findSteps } from "../shared/AppGuide.js";
import { guideDefinitions } from "../shared/app-guide-steps.js";

beforeEach(() => {
  vi.spyOn(HTMLElement.prototype, "getClientRects").mockImplementation(function (this: HTMLElement) {
    return (this.closest("[hidden]") ? [] : [{}]) as unknown as DOMRectList;
  });
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

const actions = { navigate: vi.fn() } as unknown as LearnerCallbacks;
const month = { month: "2026-11", themeTitle: "Customer handover", themeBrief: "Prepare a handover.", communicationGoal: "Explain risks.", examDate: "2026-11-30", systemDate: "2026-11-05" };
const lessons = [
  { id: "lesson-1", dayNumber: 1, title: "Handover basics", status: "completed" as const, lock: null, lessonDate: "2026-11-02", kind: "new" as const },
  { id: "lesson-2", dayNumber: 2, title: "Clarify a request", status: "in_progress" as const, lock: null, lessonDate: "2026-11-03", kind: "new" as const },
  { id: "review-1", dayNumber: 3, title: "Weekly review", status: "not_started" as const, lock: null, lessonDate: "2026-11-06", kind: "review" as const }
];
const monthlyPolicy = {
  requiredMonths: 6, eligibleMonths: 1, finalPasses: 1, finalPassesRequired: 4, finalAverage: 72, finalAverageTarget: 70,
  seasonMonths: 0, seasonMonthsRequired: 4, latestFinalPassed: true, absenceCap: 20, absenceRate: 10, reasons: []
};

function view(overrides: Partial<LearnerHomeView> = {}): LearnerHomeView {
  return {
    onboardingRequired: false, learner: { displayName: "Học viên Demo", cefr: "A2" }, program: null, week: null, month,
    monthlyPreparation: false,
    monthlyEligibility: { month: "2026-11", systemDate: "2026-11-05", examDate: "2026-11-30", effectiveDays: 15, attendedDays: 0, absenceDays: 3, maxAbsences: 4, attendanceEligible: true, accessState: "tracking", opensAt: "2026-11-30T00:00:00", closesAt: null },
    monthlyExam: { status: "locked", completedLessons: 1, totalLessons: 2, remainingLessons: 1, requirement: "Hoàn thành 1 bài còn lại để mở bài thi tháng.", certificateEligible: false },
    lessons, nextLesson: lessons[1],
    metrics: { completedLessons: 1, totalLessons: 2, studyDays: 1, streakDays: 0, points: 60, nextPointsTier: 180, completedReviews: 0, totalReviews: 1, monthlyExamStatus: "locked" },
    schedule: { daysPerWeek: 5, lessonMinutes: 10, days: [] },
    coach: { turnsToday: 0, turnsThisWeek: 2, targetTurns: 30, href: "/coach" }, practice: { status: "locked", detail: "", href: "/practice" },
    levelReadiness: { targetLevel: "B1", windowDays: 30, eligible: false, examAvailable: false, criteria: [], monthlyPolicy },
    aiAvailable: true, ...overrides
  } as LearnerHomeView;
}

const legacyReadiness = { targetLevel: "B1" as const, windowDays: 14, eligible: false, examAvailable: false, criteria: [
  { key: "lessonCompletion", label: "Bài học hoàn thành", current: 33, target: 80, display: "1/3 bài", met: false },
  { key: "coachRubric", label: "Rubric Season trong tháng", current: 0, target: 3, display: "0/5", met: false }
] };

/** Every state Home can be in, so each declared step has a home where it applies. */
const fixtures: Record<string, LearnerHomeView> = {
  activeMonth: view(),
  legacyReadiness: view({ levelReadiness: legacyReadiness as LearnerHomeView["levelReadiness"] }),
  lessonsLocked: view({ monthlyLessonsLocked: true }),
  preparation: view({ month: null, monthlyPreparation: true, lessons: [], nextLesson: null }),
  onboardingProfile: view({ onboardingRequired: true, learner: { displayName: "Học viên mới", cefr: null } }),
  onboardingTest: view({ learner: { displayName: "Học viên mới", cefr: null } }),
  onboardingApproval: view({ learner: { displayName: "Học viên mới", cefr: null }, approvalPending: true })
};

function resolvedTitles(home: LearnerHomeView) {
  const { unmount } = render(<LearnerHome view={home} actions={actions} />);
  const titles = findSteps(guideDefinitions("learner", "/home")!, document).map((step) => step.title);
  unmount();
  return titles;
}

describe("learner home guide", () => {
  it("walks the active month home with one step per card", () => {
    expect(resolvedTitles(fixtures.activeMonth!)).toEqual([
      "Bài học hôm nay",
      "Tiến độ học tập",
      "Lịch học tháng",
      "Season và bài tháng",
      "Đường lên mức",
      "Hồ sơ và đầu vào"
    ]);
  });

  it("resolves every declared learner home step against a rendered home", () => {
    const resolved = new Set(Object.values(fixtures).flatMap(resolvedTitles));
    const declared = guideDefinitions("learner", "/home")!.map(([, title]) => title);
    expect(declared.filter((title) => !resolved.has(title))).toEqual([]);
  });
});
