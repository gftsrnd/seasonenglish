// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { LearnerHome, LearnerMonthly } from "./Home.js";
import type { LearnerCallbacks, LearnerHomeView } from "./contracts.js";

afterEach(cleanup);
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
    coach: { turnsToday: 0, turnsThisWeek: 2, targetTurns: 50, href: "/coach" }, practice: { status: "locked", detail: "Monthly review is scheduled.", href: "/practice" },
    levelReadiness: { targetLevel: "B1", windowDays: 14, eligible: false, examAvailable: false, criteria: [{ key: "lessonCompletion", label: "Bài học hoàn thành", current: 33, target: 80, display: "1/3 bài", met: false }, { key: "firstTryAccuracy", label: "Đúng ngay lần đầu", current: 0, target: 80, display: "0/0", met: false }, { key: "weeklyPractice", label: "Bài thi tháng", current: 0, target: 80, display: "Chưa có bài được chấm", met: false }, { key: "coachRubric", label: "Rubric Season trong tháng", current: 0, target: 3, display: "0/5", met: false }] },
    aiAvailable: true, ...overrides
  } as LearnerHomeView;
}

describe("monthly learner home", () => {
  it("renders monthly counters, calendar, monthly exam, and no retired weekly/pilot UI", () => {
    render(<LearnerHome view={view()} actions={actions} />);
    expect(screen.getAllByText("Bài tháng").length).toBeGreaterThan(0);
    expect(screen.getByText("Bài ôn")).toBeInTheDocument();
    expect(screen.getByText("Điểm danh")).toBeInTheDocument();
    expect(screen.getByRole("grid", { name: "Lịch học tháng 11/2026" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Bài thángXem lịch/ })).toHaveAttribute("href", "/monthly");
    expect(screen.getByRole("region", { name: "Bài thi tháng" })).toHaveTextContent("Hoàn thành 2 bài còn lại");
    expect(screen.getByRole("region", { name: "Nhịp học tháng này" })).toHaveTextContent("Bài 1");
    expect(screen.getByRole("region", { name: "Nhịp học tháng này" })).toHaveTextContent("02-11");
    expect(screen.getByRole("region", { name: "Tiến độ hiện tại" })).toHaveTextContent("1/20");
    for (const retired of ["Chặng 1", "Chặng 2", "Bài tuần", "Khảo sát cuối pilot", "E4S Pilot"]) expect(screen.queryByText(retired)).not.toBeInTheDocument();
  });

  it("keeps real date locking and the actual daily lesson action", () => {
    const locked = { ...lessons[1]!, lock: { reason: "date" as const, message: "Chưa đến ngày mở", dayNumber: 2, totalLessons: 3, opensAt: "2026-11-04" } };
    render(<LearnerHome view={view({ lessons: [lessons[0]!, locked, lessons[2]!], nextLesson: locked })} actions={actions} />);
    const primary = document.querySelector<HTMLElement>('[data-home-block="primary"]')!;
    expect(within(primary).getByRole("heading", { name: /Bài này mở vào/ })).toBeInTheDocument();
    expect(within(primary).queryByRole("link", { name: /Học bài/ })).not.toBeInTheDocument();
  });

  it("shows preparation only when the real monthly framework is absent", () => {
    render(<LearnerHome view={view({ month: null, monthlyPreparation: true, lessons: [], nextLesson: null, metrics: { completedLessons: 0, totalLessons: 0, studyDays: 0, streakDays: 0, points: 0 } })} actions={actions} />);
    expect(screen.getByRole("heading", { name: "Lộ trình tháng đang được chuẩn bị" })).toBeInTheDocument();
    expect(document.querySelector('[data-home-block="metrics"]')).not.toBeInTheDocument();
    expect(document.querySelector('[data-home-block="readiness"]')).not.toBeInTheDocument();
    const learnerRecord = screen.getByRole("region", { name: "Hồ sơ và đánh giá đầu vào" });
    expect(learnerRecord).toHaveTextContent("Trình độ đã duyệt: A2");
    expect(within(learnerRecord).getByRole("link", { name: "Hồ sơ học tập" })).toHaveAttribute("href", "/profile");
    expect(within(learnerRecord).getByRole("link", { name: "Kết quả đầu vào" })).toHaveAttribute("href", "/profile");
  });

  it("opens a dedicated monthly screen from the same approved month contract", () => {
    render(<LearnerMonthly view={view()} actions={actions} />);
    expect(screen.getByRole("heading", { name: "Bài thi tháng" })).toBeInTheDocument();
    const landing = screen.getByRole("region", { name: "Bài thi tháng" });
    expect(landing).toHaveTextContent("Ngày hệ thống");
    expect(landing).toHaveTextContent("Điểm danh");
    expect(landing).toHaveTextContent("Form đề đang được chuẩn bị");
    expect(screen.queryByRole("grid", { name: "Lịch học tháng 11/2026" })).not.toBeInTheDocument();
  });

  it("keeps the monthly entry truthful before a framework exists", () => {
    render(<LearnerMonthly view={view({ month: null, monthlyPreparation: true, lessons: [], nextLesson: null, monthlyExam: null })} actions={actions} />);
    const pending = screen.getByRole("region", { name: "Bài thi tháng" });
    expect(pending).toHaveTextContent("Đề chưa phát hành");
    expect(pending).toHaveTextContent("Form đề đang được chuẩn bị");
    expect(screen.queryByText("Chặng 1")).not.toBeInTheDocument();
    const eligibility = screen.getByLabelText("Điều kiện vào bài thi tháng");
    expect(eligibility).toHaveTextContent("1/6");
    expect(eligibility).toHaveTextContent("Hoàn thành ít nhất một bài trong ngày");
  });});





