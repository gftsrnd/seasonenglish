// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { LearnerHome } from "./Home.js";
import type { LearnerHomeView, LearnerCallbacks } from "./contracts.js";

afterEach(() => { cleanup(); window.localStorage.clear(); });

const actions = { navigate: vi.fn() } as unknown as LearnerCallbacks;

function lesson(dayNumber: number, title: string, status: "completed" | "in_progress" | "not_started" = "not_started") {
  return { id: `lesson-${dayNumber}`, dayNumber, title, status, lock: null };
}

function makeView(overrides: Partial<LearnerHomeView> = {}) {
  const lessons = [
    lesson(0, "I work in… as…", "completed"),
    lesson(1, "Past simple: I joined…", "in_progress"),
    lesson(2, "What do you do?"),
    lesson(3, "I am working on…"),
    lesson(4, "be going to + verb")
  ];
  return {
    onboardingRequired: false,
    learner: { displayName: "Học viên Demo", cefr: "A2" },
    program: { name: "E4S Pilot", weekCount: 2 },
    week: { id: "week-1", weekNumber: 1, topic: "Introducing yourself & your job", description: "", objectives: [] },
    lessons,
    nextLesson: lessons[1],
    metrics: { completedLessons: 1, totalLessons: 5, studyDays: 2, streakDays: 0, points: 50 },
    schedule: {
      daysPerWeek: 5,
      lessonMinutes: 10,
      days: [
        { label: "T2", date: "2026-10-12", status: "attended" },
        { label: "T3", date: "2026-10-13", status: "upcoming" },
        { label: "T4", date: "2026-10-14", status: "attended" },
        { label: "T5", date: "2026-10-15", status: "today" },
        { label: "T6", date: "2026-10-16", status: "upcoming" }
      ]
    },
    coach: { turnsToday: 0, turnsThisWeek: 8, targetTurns: 2, href: "/coach" as const },
    practice: { status: "reviewed" as const, detail: "Bài đã được phản hồi theo rubric.", href: "/practice" as const },
    levelReadiness: {
      targetLevel: "B1" as const,
      windowDays: 14,
      eligible: false,
      examAvailable: false,
      criteria: [
        { key: "lessonCompletion" as const, label: "Bài học hoàn thành", current: 1, target: 5, display: "1/5 bài", met: false },
        { key: "firstTryAccuracy" as const, label: "Phần bài đúng ngay lần đầu", current: 4, target: 6, display: "4/6 phần", met: false },
        { key: "weeklyPractice" as const, label: "Bài thực hành tuần gần nhất", current: 86, target: 80, display: "86/100", met: true },
        { key: "coachRubric" as const, label: "Rubric khi luyện với Season", current: 4.3, target: 5, display: "4.3/5 · 8 lượt", met: false }
      ]
    },
    aiAvailable: true,
    pilotPhase: "in_pilot" as const,
    ...overrides
  } as LearnerHomeView;
}

describe("learner Home parity", () => {
  it("removes the obsolete programme card and highlights today's learning prompt", () => {
    render(<LearnerHome view={makeView()} actions={actions} />);

    expect(screen.queryByText("Chủ đề lớn của khoá")).not.toBeInTheDocument();
    expect(screen.queryByText("E4S Pilot")).not.toBeInTheDocument();
    expect(screen.queryByText("Chủ đề tuần 1")).not.toBeInTheDocument();
    expect(document.querySelector('[data-home-block="context"]')).not.toBeInTheDocument();
    expect(screen.getByText("Hôm nay học gì nào?")).toHaveClass("home-today-heading");
  });
  it("does not expose the retired micro-lesson feature", () => {
    render(<LearnerHome view={makeView({ microLesson: { id: "micro-1", topic: "Legacy", durationMinutes: 3, completed: false } })} actions={actions} />);

    expect(screen.queryByText(/bài (học )?siêu ngắn/i)).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Học ngay" })).not.toHaveAttribute("href", "/micro/micro-1");
  });

  it("shows a short fireworks celebration after a completed assessment", () => {
    window.sessionStorage.setItem("e4s:assessment-complete-celebration", "1");
    render(<LearnerHome view={makeView()} actions={actions} />);

    const fireworks = screen.getByTestId("assessment-celebration-fireworks");
    expect(fireworks).toBeInTheDocument();
    expect(fireworks).toHaveAttribute("aria-label", "Chúc mừng bạn đã hoàn thành bài kiểm tra");
    expect(window.sessionStorage.getItem("e4s:assessment-complete-celebration")).toBeNull();
  });

  it("traps focus and closes the level-up celebration with Escape", async () => {
    const user = userEvent.setup();
    const acknowledgeRewardAnnouncement = vi.fn();
    const callback = { ...actions, acknowledgeRewardAnnouncement } as unknown as LearnerCallbacks;
    render(<LearnerHome view={makeView({ rewardAnnouncement: {
      kind: "new-level-announcement", points: 180, nextPoints: 360, seasonName: "Mùa thu – gặt hái", level: "B1", announcementId: "announcement-1", source: "genuine"
    } })} actions={callback} />);

    const dialog = screen.getByRole("dialog", { name: "Chúc mừng lên mức" });
    const first = within(dialog).getAllByRole("button", { name: "Đóng" })[0]!;
    const last = within(dialog).getByRole("button", { name: "Tiếp tục học" });
    expect(first).toHaveFocus();

    last.focus();
    await user.tab();
    expect(first).toHaveFocus();
    await user.keyboard("{Escape}");
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "Chúc mừng lên mức" })).not.toBeInTheDocument());
    expect(acknowledgeRewardAnnouncement).toHaveBeenCalledWith("announcement-1");
  });

  it("keeps the canonical block order and omits pilot, reward, and early-final extras", () => {
    render(<LearnerHome view={makeView()} actions={actions} />);

    expect(screen.queryByText("Đang trong giai đoạn pilot")).not.toBeInTheDocument();
    expect(screen.queryByText("Mùa học")).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Làm bài cuối kỳ" })).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Đã đạt mục tiêu tuần/ })).toHaveClass("tile", "peach");

    expect([...document.querySelectorAll<HTMLElement>("[data-home-block]")].map((element) => element.dataset.homeBlock)).toEqual([
      "primary", "metrics", "week-path", "attendance", "activities", "readiness"
    ]);
  });

  it("highlights Season in leaf green after a real turn today", () => {
    render(<LearnerHome view={makeView({ coach: { turnsToday: 1, turnsThisWeek: 2, targetTurns: 2, href: "/coach" } })} actions={actions} />);
    expect(screen.getByRole("link", { name: /Đã luyện hôm nay/ })).toHaveClass("tile", "mint");
  });

  it("uses the canonical readiness heading, criteria, and level-up CTA", () => {
    render(<LearnerHome view={makeView({ levelReadiness: { ...makeView().levelReadiness, eligible: true, examAvailable: true, criteria: makeView().levelReadiness.criteria.map((criterion) => ({ ...criterion, met: true })) } })} actions={actions} />);

    const readiness = document.querySelector<HTMLElement>('[data-home-block="readiness"]');
    expect(readiness).not.toBeNull();
    expect(within(readiness!).getByRole("heading", { name: "Sẵn sàng thi lên B1" })).toBeInTheDocument();
    expect(within(readiness!).getByText("14 ngày gần nhất")).toBeInTheDocument();
    expect(within(readiness!).getByRole("link", { name: "Thi lên mức" })).toHaveAttribute("href", "/test/level-up");
    expect(within(readiness!).getByText("Bài học hoàn thành", { exact: false })).toBeInTheDocument();
  });

  it("separates readiness progress from the actual evidence shown below each bar", () => {
    render(<LearnerHome view={makeView({ levelReadiness: {
      ...makeView().levelReadiness,
      criteria: [
        { key: "lessonCompletion", label: "Bài học hoàn thành", current: 20, target: 90, display: "1/5 bài", met: false },
        { key: "firstTryAccuracy", label: "Phần bài đúng ngay lần đầu", current: 67, target: 75, display: "4/6 phần", met: false },
        { key: "weeklyPractice", label: "Bài thực hành tuần gần nhất", current: 86, target: 80, display: "86/100", met: true },
        { key: "coachRubric", label: "Rubric khi luyện với Season", current: 4.3, target: 4, display: "4.3/5 · 8 lượt", met: true }
      ]
    } })} actions={actions} />);

    const readiness = document.querySelector<HTMLElement>('[data-home-block="readiness"]')!;
    const lessons = readiness.querySelector<HTMLElement>('[data-readiness-key="lessonCompletion"]')!;
    const firstTry = readiness.querySelector<HTMLElement>('[data-readiness-key="firstTryAccuracy"]')!;
    const practice = readiness.querySelector<HTMLElement>('[data-readiness-key="weeklyPractice"]')!;
    const coach = readiness.querySelector<HTMLElement>('[data-readiness-key="coachRubric"]')!;

    expect(within(lessons).getByText("20%", { exact: true })).toHaveClass("readiness-current");
    expect(within(lessons).getByText("1/5 bài", { exact: true })).toHaveClass("readiness-actual");
    expect(within(lessons).getByRole("progressbar", { name: "Bài học hoàn thành" })).toHaveAttribute("aria-valuemax", "100");
    expect(within(practice).getByText("86%", { exact: true })).toBeInTheDocument();
    expect(within(coach).getByText("4.3/5", { exact: true })).toBeInTheDocument();
    expect(within(lessons).getByTestId("readiness-target")).toHaveStyle({ left: "90%" });
    expect(within(firstTry).getByTestId("readiness-target")).toHaveStyle({ left: "75%" });
    expect(within(practice).getByTestId("readiness-target")).toHaveStyle({ left: "80%" });
    expect(within(coach).getByRole("progressbar", { name: "Rubric khi luyện với Season" })).toHaveAttribute("aria-valuemax", "5");
    expect(within(coach).getByTestId("readiness-target")).toHaveStyle({ left: "80%" });
    expect(readiness.querySelector(".readiness-label svg")).not.toBeInTheDocument();
  });

  it("keeps the program status as a softly tinted card separated from today's lesson", () => {
    render(<LearnerHome view={makeView({ monthlyGoal: "Tự tin góp ý trong công việc" })} actions={actions} />);

    const lifecycle = document.querySelector<HTMLElement>('[data-home-block="lifecycle"]')!;
    const primary = document.querySelector<HTMLElement>('[data-home-block="primary"]')!;
    expect(lifecycle).toHaveClass("home-lifecycle-card");
    expect(lifecycle.nextElementSibling).toBe(primary);
  });

  it("frames the active lesson card with matching left and right accents", () => {
    render(<LearnerHome view={makeView()} actions={actions} />);

    expect(document.querySelector('[data-home-block="primary"]')).toHaveClass("home-primary-lesson");
  });

  it("does not render a dead week path when the learner has no lessons", () => {
    render(<LearnerHome view={makeView({ week: null, lessons: [], nextLesson: null })} actions={actions} />);

    expect(screen.getByRole("heading", { name: "Tuần này chưa có bài" })).toBeInTheDocument();
    expect(document.querySelector('[data-home-block="week-path"]')).not.toBeInTheDocument();
  });

  it("keeps a date-locked next lesson as a non-actionable completion state", () => {
    const view = makeView();
    render(<LearnerHome view={{ ...view, nextLesson: { ...view.nextLesson!, lock: { reason: "date", message: "Chưa đến ngày mở", dayNumber: 2, totalLessons: 5, opensAt: "2026-10-16" } } }} actions={actions} />);

    const primary = document.querySelector<HTMLElement>('[data-home-block="primary"]');
    expect(primary).not.toBeNull();
    expect(within(primary!).getByRole("heading", { name: "Xong bài hôm nay rồi!" })).toBeInTheDocument();
    expect(within(primary!).queryByRole("link", { name: "Luyện với Season" })).not.toBeInTheDocument();
  });

  it("does not expose a final-assessment CTA in the final program week", () => {
    render(<LearnerHome view={makeView({ week: { ...makeView().week!, weekNumber: 2 } })} actions={actions} />);

    expect(screen.queryByRole("link", { name: "Làm bài cuối kỳ" })).not.toBeInTheDocument();
    expect(document.querySelector('[data-home-block="final"]')).not.toBeInTheDocument();
  });

  it("uses lucide icons for generic learner activity and timing cues", () => {
    render(<LearnerHome view={makeView()} actions={actions} />);

    expect(screen.getByRole("link", { name: /Luyện với Season/ }).querySelector("svg.lucide-message-circle")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Bài thực hành cuối tuần/ }).querySelector("svg.lucide-pen-line")).toBeInTheDocument();
    expect(document.querySelector('[data-home-block="primary"] svg.lucide-clock-3')).toBeInTheDocument();
  });

  it("renders locked and completed week states with standard status icons", () => {
    const view = makeView({
      lessons: [
        { ...lesson(0, "Bài đã xong", "completed"), lock: null },
        { ...lesson(1, "Bài bị khoá"), lock: { reason: "prior", message: "Xong bài trước", dayNumber: 1, totalLessons: 5, blocker: { id: "lesson-1", dayNumber: 1, title: "Bài đã xong" } } }
      ],
      nextLesson: null
    });
    render(<LearnerHome view={view} actions={actions} />);

    const path = document.querySelector('[data-home-block="week-path"]');
    expect(path?.querySelector("svg.lucide-check")).toBeInTheDocument();
    expect(path?.querySelector("svg.lucide-lock-keyhole")).toBeInTheDocument();
    expect(path).not.toHaveTextContent("🔒");
    expect(within(path as HTMLElement).getByRole("link", { name: /Bài bị khoá · Chưa mở/ })).toHaveAttribute("aria-disabled", "true");
  });

  it("labels an overdue in-progress lesson as make-up instead of today", () => {
    render(<LearnerHome view={makeView()} actions={actions} />);

    const path = document.querySelector<HTMLElement>('[data-home-block="week-path"]');
    const primary = document.querySelector<HTMLElement>('[data-home-block="primary"]');

    expect(path).not.toBeNull();
    expect(within(path!).getByRole("link", { name: /T2 · học bù/ })).toBeInTheDocument();
    expect(within(path!).queryByText("T2 · hôm nay")).not.toBeInTheDocument();
    expect(primary).not.toBeNull();
    expect(within(primary!).getByText(/Bài học bù · T2 · Tuần 1/)).toBeInTheDocument();
  });

  it("labels an overdue not-started next lesson as make-up", () => {
    const view = makeView();
    const overdue = lesson(1, "Bài bị lỡ", "not_started");
    render(<LearnerHome view={{
      ...view,
      lessons: [view.lessons[0]!, overdue, ...view.lessons.slice(2)],
      nextLesson: overdue,
      schedule: { ...view.schedule, days: [
        { label: "T2", date: "2026-10-12", status: "missed" },
        { label: "T3", date: "2026-10-13", status: "today" },
        ...view.schedule.days.slice(2)
      ] }
    }} actions={actions} />);

    const primary = document.querySelector<HTMLElement>('[data-home-block="primary"]');
    expect(primary).not.toBeNull();
    expect(within(primary!).getByText(/Bài học bù · T2 · Tuần 1/)).toBeInTheDocument();
  });

  it("exposes prototype attendance states and separates the fixed-schedule note", () => {
    const view = makeView();
    render(<LearnerHome view={{ ...view, schedule: { ...view.schedule, days: [
      { label: "T2", date: "2026-10-12", status: "missed" },
      { label: "T3", date: "2026-10-13", status: "missed" },
      { label: "T4", date: "2026-10-14", status: "attended" },
      { label: "T5", date: "2026-10-15", status: "today" },
      { label: "T6", date: "2026-10-16", status: "upcoming" }
    ] } }} actions={actions} />);

    const attendance = document.querySelector<HTMLElement>('[data-home-block="attendance"]');
    expect(attendance).not.toBeNull();
    expect(within(attendance!).getByText("T2").closest("li")?.querySelector("i")).toHaveClass("miss");
    expect(within(attendance!).getByText("T4").closest("li")?.querySelector("i")).toHaveClass("on");
    expect(within(attendance!).getByText("T5").closest("li")?.querySelector("i")).toHaveClass("today");
    expect(within(attendance!).getByText(/Lịch cố định/)).toHaveClass("attendance-schedule-note");
  });

  it("shows a real onboarding placement-pending state without inviting a duplicate test", () => {
    render(<LearnerHome view={makeView({
      onboardingRequired: true,
      learner: { displayName: "Học viên Demo", cefr: null },
      approvalPending: true,
      placementDraft: false
    })} actions={actions} />);

    const setup = screen.getByRole("heading", { name: "3 bước để bắt đầu học" }).closest("section");
    expect(setup).not.toBeNull();
    expect(within(setup!).getByText("Đang chờ duyệt")).toBeInTheDocument();
    expect(within(setup!).getByText(/bạn không cần làm gì thêm/i)).toBeInTheDocument();
    expect(within(setup!).queryByRole("link", { name: /test đầu vào/i })).not.toBeInTheDocument();
    expect(within(setup!).getAllByText("Đã xong")).toHaveLength(2);
  });

  it("offers to continue a saved onboarding draft", () => {
    window.localStorage.setItem("e4s:learner-onboard-draft", JSON.stringify({ fullName: "Học viên Demo" }));
    render(<LearnerHome view={makeView({ onboardingRequired: true, learner: { displayName: "Học viên Demo", cefr: null } })} actions={actions} />);

    expect(screen.getByRole("link", { name: "Tiếp tục phần đã lưu" })).toHaveAttribute("href", "/onboard");
    expect(screen.queryByRole("link", { name: /Điền hồ sơ/ })).not.toBeInTheDocument();
  });

  it("exposes the next action for an in-progress level-up lifecycle", () => {
    const view = makeView({
      levelUpPhase: "testing",
      levelReadiness: { ...makeView().levelReadiness, eligible: false, examAvailable: false }
    });
    render(<LearnerHome view={view} actions={actions} />);

    const readiness = document.querySelector<HTMLElement>('[data-home-block="readiness"]');
    expect(within(readiness!).getByText("Bài kiểm tra lên mức đang diễn ra.")).toBeInTheDocument();
    expect(within(readiness!).getByRole("link", { name: "Tiếp tục bài thi" })).toHaveAttribute("href", "/test/level-up");
  });

  it("opens the level-up challenge after the assessment is graded", () => {
    render(<LearnerHome view={makeView({ levelUpPhase: "challenge" })} actions={actions} />);

    const readiness = document.querySelector<HTMLElement>('[data-home-block="readiness"]');
    expect(within(readiness!).getByRole("link", { name: "Mở thử thách" })).toHaveAttribute("href", "/challenge");
  });

  it("labels a locked weekend practice entry while preserving its route", () => {
    render(<LearnerHome view={makeView({ practice: { status: "locked", detail: "Mở sau khi hoàn thành đủ bài.", href: "/practice" } })} actions={actions} />);

    const practice = screen.getByRole("link", { name: /Bài thực hành cuối tuần/ });
    expect(practice).toHaveAttribute("href", "/practice");
    expect(practice).toHaveTextContent("Chưa mở");
  });
});
