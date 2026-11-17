// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { LearnerHome, LearnerMonthly } from "./Home.js";
import type { LearnerCallbacks, LearnerHomeView } from "./contracts.js";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});
const actions = { navigate: vi.fn() } as unknown as LearnerCallbacks;
const month = { month: "2026-11", themeTitle: "Customer handover", themeBrief: "Prepare a handover.", communicationGoal: "Explain risks.", examDate: "2026-11-30", systemDate: "2026-11-03" };
const lessons = [
  { id: "lesson-1", dayNumber: 1, title: "Handover basics", status: "completed" as const, lock: null, lessonDate: "2026-11-02", kind: "new" as const },
  { id: "lesson-2", dayNumber: 2, title: "Clarify a request", status: "in_progress" as const, lock: null, lessonDate: "2026-11-03", kind: "new" as const },
  { id: "review-1", dayNumber: 3, title: "Weekly review", status: "not_started" as const, lock: { reason: "date" as const, message: "Mở vào ngày học", dayNumber: 3, totalLessons: 3, opensAt: "2026-11-06" }, lessonDate: "2026-11-06", kind: "review" as const }
];
function view(overrides: Partial<LearnerHomeView> = {}): LearnerHomeView {
  return {
    onboardingRequired: false, learner: { displayName: "Học viên Demo", cefr: "A2" }, program: null, week: null, month,
    monthlyPreparation: false, monthlyEligibility: { month: "2026-11", systemDate: "2026-11-03", examDate: "2026-11-30", effectiveDays: 20, attendedDays: 1, absenceDays: 1, maxAbsences: 6, attendanceEligible: true, accessState: "tracking", opensAt: "2026-11-30T00:00:00", closesAt: null }, monthlyExam: { status: "locked", completedLessons: 1, totalLessons: 3, remainingLessons: 2, requirement: "Hoàn thành 2 bài còn lại để mở bài thi tháng.", certificateEligible: false },
    lessons, nextLesson: lessons[1], metrics: { completedLessons: 1, totalLessons: 3, studyDays: 1, streakDays: 1, points: 0, completedReviews: 0, totalReviews: 1, monthlyExamStatus: "locked" },
    schedule: { daysPerWeek: 5, lessonMinutes: 10, days: [{ label: "T2", date: "2026-11-02", status: "attended" }, { label: "T3", date: "2026-11-03", status: "today" }, { label: "T4", date: "2026-11-04", status: "upcoming" }, { label: "T5", date: "2026-11-05", status: "upcoming" }, { label: "T6", date: "2026-11-06", status: "upcoming" }] },
    coach: { turnsToday: 0, turnsThisWeek: 2, targetTurns: 30, href: "/coach" }, practice: { status: "locked", detail: "Monthly review is scheduled.", href: "/practice" },
    levelReadiness: { targetLevel: "B1", windowDays: 14, eligible: false, examAvailable: false, criteria: [{ key: "lessonCompletion", label: "Bài học hoàn thành", current: 33, target: 80, display: "1/3 bài", met: false }, { key: "firstTryAccuracy", label: "Đúng ngay lần đầu", current: 0, target: 80, display: "0/0", met: false }, { key: "weeklyPractice", label: "Bài thi tháng", current: 0, target: 80, display: "Chưa có bài được chấm", met: false }, { key: "coachRubric", label: "Rubric Season trong tháng", current: 0, target: 3, display: "0/5", met: false }] },
    aiAvailable: true, ...overrides
  } as LearnerHomeView;
}

describe("monthly learner home", () => {
  it("shows no learning-support card before the level is approved", () => {
    render(<LearnerHome view={view({ learner: { displayName: "Học viên mới", cefr: null } })} actions={actions} />);
    expect(screen.queryByRole("link", { name: "Hỗ trợ học tập" })).not.toBeInTheDocument();
    expect(screen.queryByText(/kháng nghị/i)).not.toBeInTheDocument();
  });

  it("offers the Pass Course entry only when the server says it is ready", () => {
    const learner = { displayName: "Học viên C1", cefr: "C1" as const };
    const { rerender } = render(<LearnerHome view={view({ learner })} actions={actions} />);
    expect(screen.queryByRole("link", { name: "Thi Pass Course" })).not.toBeInTheDocument();
    rerender(<LearnerHome view={view({ learner, passCourse: { status: "ready" } })} actions={actions} />);
    expect(screen.getByRole("link", { name: "Thi Pass Course" })).toHaveAttribute("href", "/test/pass-course");
    rerender(<LearnerHome view={view({ learner, passCourse: { status: "ready" } })} actions={actions} courseCompleted />);
    expect(screen.queryByRole("region", { name: "Bài thi đầu ra" })).not.toBeInTheDocument();
  });

  it("keeps absence and content notices in the bell and shows a compact banner only on the last day before the lock", () => {
    const { rerender, container } = render(<LearnerHome view={view({ inactivityReminder: { inactiveDays: 3 } })} actions={actions} />);
    expect(screen.queryByText(/ngày học liên tiếp/)).not.toBeInTheDocument();
    expect(screen.queryByRole("region", { name: "Thông báo mới" })).not.toBeInTheDocument();
    expect(container.querySelector(".home-blocking-banner")).toBeNull();
    rerender(<LearnerHome view={view({ inactivityReminder: { inactiveDays: 4 } })} actions={actions} />);
    expect(screen.getByRole("alert")).toHaveTextContent("Vắng thêm 1 ngày học sẽ bị khóa tài khoản.");
    expect(container.querySelectorAll(".home-blocking-banner")).toHaveLength(1);
  });

  it("shows attendance over the days so far and absences as a separate toned chip", () => {
    const eligibility = { month: "2026-11", systemDate: "2026-11-06", examDate: "2026-11-30", effectiveDays: 15, attendedDays: 0, absenceDays: 3, maxAbsences: 4, attendanceEligible: true, accessState: "tracking" as const, opensAt: "2026-11-30T00:00:00", closesAt: null };
    const { container, rerender } = render(<LearnerHome view={view({ monthlyEligibility: eligibility })} actions={actions} />);
    const attendance = container.querySelector<HTMLElement>('[data-home-metric="attendance"]')!;
    expect(attendance).toHaveTextContent("0/3Điểm danh");
    expect(attendance.querySelector(".metric-secondary")).toBeNull();
    expect(attendance).toHaveAttribute("data-percent", "0");
    const chip = container.querySelector<HTMLElement>('[data-home-metric="absence"]')!;
    expect(chip).toHaveTextContent("Vắng 3/4 ngày cho phép");
    expect(chip).toHaveClass("warn");
    rerender(<LearnerHome view={view({ monthlyEligibility: { ...eligibility, attendedDays: 3, absenceDays: 1 } })} actions={actions} />);
    expect(container.querySelector('[data-home-metric="attendance"]')).toHaveAttribute("data-percent", "75");
    rerender(<LearnerHome view={view({ monthlyEligibility: { ...eligibility, attendedDays: 2, absenceDays: 0 } })} actions={actions} />);
    expect(container.querySelector('[data-home-metric="absence"]')).toHaveClass("ok");
    rerender(<LearnerHome view={view({ monthlyEligibility: { ...eligibility, absenceDays: 5 } })} actions={actions} />);
    expect(container.querySelector('[data-home-metric="absence"]')).toHaveClass("danger");
    for (const card of container.querySelectorAll(".monthly-home-metrics .stat")) expect(card.querySelectorAll(".lbl")).toHaveLength(1);
  });

  it("fills the badge-points ring toward the next Season tier and shows a plain number after the last tier", () => {
    const metrics = { completedLessons: 1, totalLessons: 3, studyDays: 1, streakDays: 1, points: 60, completedReviews: 0, totalReviews: 1 };
    const { container, rerender } = render(<LearnerHome view={view({ metrics: { ...metrics, nextPointsTier: 180 } })} actions={actions} />);
    const points = () => container.querySelector<HTMLElement>('[data-home-metric="points"]')!;
    expect(points()).toHaveTextContent("60Điểm huy hiệu · mốc 180");
    expect(points()).toHaveAttribute("data-percent", "33");
    expect(points().querySelector(".ring")).toHaveStyle({ "--p": "33" });
    rerender(<LearnerHome view={view({ metrics: { ...metrics, points: 420, nextPointsTier: null } })} actions={actions} />);
    expect(points()).toHaveTextContent("420Điểm huy hiệu");
    expect(points().querySelector(".ring")).toBeNull();
    expect(points()).toHaveClass("is-plain");
    const lessons = container.querySelector<HTMLElement>('[data-home-metric="lessons"]')!;
    expect(lessons).toHaveAttribute("data-percent", "33");
  });

  it("fills the badge-points ring with the points earned in the current level toward the next Season threshold", () => {
    const metrics = { completedLessons: 1, totalLessons: 3, studyDays: 1, streakDays: 1, points: 12_345, completedReviews: 0, totalReviews: 1 };
    const { container, rerender } = render(<LearnerHome view={view({ metrics: { ...metrics, seasonPoints: 1250, nextPointsTier: 2000 } })} actions={actions} />);
    const points = () => container.querySelector<HTMLElement>('[data-home-metric="points"]')!;
    expect(points()).toHaveTextContent("1.250Điểm huy hiệu · mốc 2.000");
    expect(points()).toHaveAttribute("data-percent", "63");
    expect(points().getAttribute("title")).toMatch(/1\.250 điểm trong .* · tổng tích lũy 12\.345 · còn 750 điểm/);
    // After Mùa đông of the level: a plain tile with the points of the level.
    rerender(<LearnerHome view={view({ metrics: { ...metrics, seasonPoints: 5300, nextPointsTier: null } })} actions={actions} />);
    expect(points()).toHaveTextContent("5.300Điểm huy hiệu");
    expect(points()).toHaveClass("is-plain");
    expect(points().querySelector(".ring")).toBeNull();
  });

  it("renders monthly counters, calendar, monthly exam, and no retired weekly/pilot UI", () => {
    render(<LearnerHome view={view()} actions={actions} />);
    expect(screen.getAllByText("Bài tháng").length).toBeGreaterThan(0);
    expect(screen.getByText("Bài ôn")).toBeInTheDocument();
    expect(screen.getByText("Điểm danh")).toBeInTheDocument();
    expect(screen.getByRole("grid", { name: "Lịch học tháng 11/2026" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Bài thángXem lịch/ })).toHaveAttribute("href", "/monthly");
    expect(screen.getByRole("region", { name: "Bài thi tháng" })).toHaveTextContent("Hoàn thành 2 bài còn lại");
    expect(screen.queryByRole("region", { name: "Nhịp học tháng này" })).not.toBeInTheDocument();
    const calendar = screen.getByRole("grid", { name: "Lịch học tháng 11/2026" });
    expect(within(calendar).getByRole("gridcell", { name: "2026-10-26" })).toHaveClass("outside-month");
    const lastPreviousDay = within(calendar).getByRole("gridcell", { name: "2026-10-31" });
    expect(lastPreviousDay).toHaveTextContent("31");
    expect(within(lastPreviousDay).queryByRole("link")).not.toBeInTheDocument();
    expect(within(calendar).getByRole("gridcell", { name: "2026-12-06" })).toHaveClass("outside-month");
    expect(within(calendar).getAllByRole("gridcell")).toHaveLength(42);
    expect(within(calendar).getByRole("gridcell", { name: "2026-11-02" })).toHaveClass("lesson");
    expect(within(calendar).getByRole("gridcell", { name: "2026-11-02" })).toHaveTextContent("Đã học");
    expect(within(calendar).getByRole("gridcell", { name: "2026-11-04" })).toHaveTextContent("Chưa có bài");
    expect(within(calendar).getByRole("gridcell", { name: "2026-11-06" })).toHaveClass("review");
    expect(within(calendar).getByRole("gridcell", { name: "2026-11-06" })).toHaveTextContent("Ôn tập");
    expect(within(calendar).getByRole("gridcell", { name: "2026-11-06" })).toHaveTextContent("Chưa mở");
    expect(within(calendar).getByRole("gridcell", { name: "2026-11-08" })).toHaveClass("rest");
    expect(within(calendar).getByRole("gridcell", { name: "2026-11-08" })).toHaveTextContent("Nghỉ");
    expect(within(calendar).getByRole("gridcell", { name: "2026-11-24" })).toHaveClass("holiday");
    expect(within(calendar).getByRole("gridcell", { name: "2026-11-30" })).toHaveClass("exam");
    expect(within(calendar).getByRole("gridcell", { name: "2026-11-30" })).toHaveTextContent("Bài thi tháng");
    expect(screen.getByRole("region", { name: "Tiến độ tháng" })).toHaveTextContent("1/3");
    expect(within(screen.getByRole("region", { name: "Tiến độ tháng" })).getByText("Điểm huy hiệu")).toBeInTheDocument();
    for (const retired of ["Chặng 1", "Chặng 2", "Bài tuần", "Khảo sát cuối pilot", "E4S Pilot"]) expect(screen.queryByText(retired)).not.toBeInTheDocument();
  });

  it("keeps real date locking and the actual daily lesson action", () => {
    const locked = { ...lessons[1]!, lock: { reason: "date" as const, message: "Chưa đến ngày mở", dayNumber: 2, totalLessons: 3, opensAt: "2026-11-04" } };
    render(<LearnerHome view={view({ lessons: [lessons[0]!, locked, lessons[2]!], nextLesson: locked })} actions={actions} />);
    const primary = document.querySelector<HTMLElement>('[data-home-block="primary"]')!;
    expect(within(primary).getByRole("heading", { name: /Bài này mở vào/ })).toBeInTheDocument();
    expect(within(primary).queryByRole("link", { name: /Học bài/ })).not.toBeInTheDocument();
  });

  it("opens the current week on a phone and keeps the whole month reachable", () => {
    vi.stubGlobal("matchMedia", () => ({ matches: true, addEventListener: vi.fn(), removeEventListener: vi.fn() }));
    render(<LearnerHome view={view()} actions={actions} />);
    const calendar = screen.getByRole("region", { name: "Lịch học tháng 11/2026" });
    expect(within(calendar).queryByRole("grid")).not.toBeInTheDocument();
    expect(within(calendar).getAllByRole("listitem")).toHaveLength(7);
    const today = within(calendar).getByRole("listitem", { name: "2026-11-03" });
    expect(today).toHaveAttribute("aria-current", "date");
    expect(within(today).getByRole("link", { name: "Bài 2" })).toHaveAttribute("href", "/lesson/lesson-2");
    const locked = within(calendar).getByRole("listitem", { name: "2026-11-06" });
    expect(locked).toHaveTextContent("Chưa mở");
    expect(within(locked).queryByRole("link")).not.toBeInTheDocument();
    fireEvent.click(within(calendar).getByRole("button", { name: "Tuần trước" }));
    expect(within(calendar).getByRole("listitem", { name: "2026-10-26" })).toHaveClass("outside-month");
    expect(within(calendar).getByRole("button", { name: "Tuần trước" })).toBeDisabled();
    const next = within(calendar).getByRole("button", { name: "Tuần sau" });
    for (let week = 0; week < 5; week++) fireEvent.click(next);
    expect(next).toBeDisabled();
    expect(within(calendar).getByRole("listitem", { name: "2026-12-06" })).toHaveClass("outside-month");
    expect(within(calendar).getByRole("link", { name: "Bài thi tháng" })).toHaveAttribute("href", "/monthly");
  });

  it("shows preparation only when the real monthly framework is absent", () => {
    render(<LearnerHome view={view({ month: null, monthlyPreparation: true, lessons: [], nextLesson: null, metrics: { completedLessons: 0, totalLessons: 0, studyDays: 0, streakDays: 0, points: 0 } })} actions={actions} />);
    expect(screen.getByRole("heading", { name: "Lộ trình tháng đang được chuẩn bị" })).toBeInTheDocument();
    expect(document.querySelector('[data-home-block="metrics"]')).not.toBeInTheDocument();
    expect(document.querySelector('[data-home-block="readiness"]')).not.toBeInTheDocument();
    const learnerRecord = screen.getByRole("region", { name: "Hồ sơ và đánh giá đầu vào" });
    expect(learnerRecord).toHaveTextContent("Trình độ đã duyệt: A2");
    expect(within(learnerRecord).getByRole("link", { name: "Hồ sơ học tập & đầu vào" })).toHaveAttribute("href", "/profile");
  });

  it("opens a dedicated monthly screen from the same approved month contract", () => {
    render(<LearnerMonthly view={view()} actions={actions} />);
    expect(screen.getByRole("heading", { name: "Bài thi tháng" })).toBeInTheDocument();
    const landing = screen.getByRole("region", { name: "Bài thi tháng" });
    expect(landing).not.toHaveTextContent("Ngày hệ thống");
    expect(landing).toHaveTextContent("Điểm danh");
    expect(landing).toHaveTextContent("Hoàn thành 2 bài còn lại");
    expect(landing).not.toHaveTextContent("ngày đến lịch thi");
    expect(within(landing).getAllByRole("article")).toHaveLength(3);
    expect(screen.queryByRole("grid", { name: "Lịch học tháng 11/2026" })).not.toBeInTheDocument();
  });

  it("shows actual missed dates and the stable allowance in monthly attendance", () => {
    const current = view();
    const eligibility = { ...current.monthlyEligibility!, effectiveDays: 17, attendedDays: 0,
      attendanceDaysSoFar: 2, absenceDays: 2, maxAbsences: 5, missedDates: ["2026-11-09", "2026-11-12"] };
    render(<LearnerMonthly view={view({ monthlyEligibility: eligibility })} actions={actions} />);
    const summary = screen.getByRole("region", { name: "Điều kiện vào bài thi tháng" });
    expect(summary).toHaveTextContent("0/2Điểm danhVắng 2/5");
    expect(summary).toHaveTextContent("17 ngày hiệu lực");
    fireEvent.click(within(summary).getByText("Ngày vắng (2)"));
    expect(summary).toHaveTextContent("09/11, 12/11");
  });

  it("shows only today's Season quota on the home card", () => {
    render(<LearnerHome view={view({ coach: { turnsToday: 7, turnsThisWeek: 22, targetTurns: 60, href: "/coach" } })} actions={actions} />);
    const card = screen.getByRole("link", { name: /Season AI Coach/i });
    expect(card).toHaveTextContent("Lượt hợp lệ hôm nay 7/60");
    expect(card).not.toHaveTextContent("22");
  });

  it("keeps the monthly entry truthful before a framework exists", () => {
    render(<LearnerMonthly view={view({ month: null, monthlyPreparation: true, lessons: [], nextLesson: null, monthlyExam: null })} actions={actions} />);
    const pending = screen.getByRole("region", { name: "Bài thi tháng" });
    expect(pending).toHaveTextContent("Đề chưa phát hành");
    expect(pending).toHaveTextContent("Đề đang được chuẩn bị cho trình độ của bạn");
    expect(screen.queryByText("Chặng 1")).not.toBeInTheDocument();
    const eligibility = screen.getByLabelText("Điều kiện vào bài thi tháng");
    expect(eligibility).toHaveTextContent("1/6");
    expect(eligibility).toHaveTextContent("Hoàn thành ít nhất một bài trong ngày");
  });});





