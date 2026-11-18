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
  onboardingApproval: view({ learner: { displayName: "Học viên mới", cefr: null }, approvalPending: true }),
  onboardingTestDraft: view({ learner: { displayName: "Học viên mới", cefr: null }, placementDraft: true }),
  today: view({ nextLesson: { ...lessons[1]!, lessonDate: "2026-11-05" } }),
  allDone: view({ nextLesson: null }),
  reviewGate: view({ nextLesson: { ...lessons[2]!, lock: { reason: "review", reviewWeekNumber: 1, blocker: { id: "review-1", dayNumber: 3 } } } } as unknown as Partial<LearnerHomeView>),
  trial: view({ monthlyUncounted: { countsFrom: "2026-11-17" }, monthlyEligibility: undefined, monthlyExam: null } as unknown as Partial<LearnerHomeView>),
  trialAllDone: view({ monthlyUncounted: { countsFrom: "2026-11-17" }, monthlyEligibility: undefined, monthlyExam: null, nextLesson: null } as unknown as Partial<LearnerHomeView>),
  startDate: view({ monthlyStartDate: "2026-11-24" } as Partial<LearnerHomeView>),
  placementRetake: view({ placementRetake: "granted" } as Partial<LearnerHomeView>),
  passCourse: view({ learner: { displayName: "Học viên C1", cefr: "C1" }, passCourse: { status: "available" } } as unknown as Partial<LearnerHomeView>),
  levelUpReady: view({ levelReadiness: { targetLevel: "B1", windowDays: 30, eligible: true, examAvailable: true, criteria: [], monthlyPolicy } as LearnerHomeView["levelReadiness"] })
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
      "Bài học bù",
      "Tiến độ học tập",
      "Lịch học tháng",
      "Season và bài tháng",
      "Đường lên mức",
      "Bài thi tháng",
      "Hồ sơ và đầu vào"
    ]);
    expect(resolvedTitles(fixtures.today!)[0]).toBe("Bài học hôm nay");
  });

  it("gives the trial month its own steps, without exam or attendance claims", () => {
    expect(resolvedTitles(fixtures.trial!)).toEqual([
      "Bài học thử", "Tiến độ học thử", "Lịch học thử", "Season và bài tháng", "Đường lên mức", "Hồ sơ và đầu vào"
    ]);
    const texts = findSteps(guideDefinitions("learner", "/home")!, (render(<LearnerHome view={fixtures.trial!} actions={actions} />), document)).map((step) => step.text).join(" ");
    expect(texts).not.toMatch(/Điểm danh\*\* quyết định|ngày thi và điều kiện|Bài thi tháng\*\* để xem điều kiện/);
    expect(texts).toMatch(/không có bài thi/);
  });

  /** Title and target of each step; a target is the onboarding card number, the block heading or the support card. */
  function resolvedWalk(home: LearnerHomeView) {
    const { unmount } = render(<LearnerHome view={home} actions={actions} />);
    const steps = findSteps(guideDefinitions("learner", "/home")!, document);
    const walk = steps.map(({ title, target }) => [title,
      target.dataset.onboardingStep ? `card ${target.dataset.onboardingStep}`
        : target.matches(".onboarding-steps > h2") ? "heading"
          : target.matches(".learner-support-entry") ? "support" : target.className] as const);
    const distinct = new Set(steps.map(({ target }) => target)).size;
    unmount();
    return { walk, distinct };
  }

  it.each([
    ["onboardingProfile", ["Ba bước bắt đầu", "Điền hồ sơ", "Test đầu vào", "Vận hành duyệt mức"]],
    ["onboardingTest", ["Ba bước bắt đầu", "Hồ sơ đã lưu", "Làm test đầu vào", "Vận hành duyệt mức"]],
    ["onboardingApproval", ["Ba bước bắt đầu", "Hồ sơ đã lưu", "Đã nộp test", "Chờ duyệt mức"]]
  ] as const)("walks the %s home card by card, never returning to card 1", (fixture, titles) => {
    const { walk, distinct } = resolvedWalk(fixtures[fixture]!);
    expect(walk).toEqual([
      [titles[0], "heading"], [titles[1], "card 1"], [titles[2], "card 2"], [titles[3], "card 3"]
    ]);
    expect(distinct).toBe(walk.length);
  });

  it("resolves every declared learner home step against a rendered home", () => {
    const resolved = new Set(Object.values(fixtures).flatMap(resolvedTitles));
    const declared = guideDefinitions("learner", "/home")!.map(([, title]) => title);
    expect(declared.filter((title) => !resolved.has(title))).toEqual([]);
  });
});
