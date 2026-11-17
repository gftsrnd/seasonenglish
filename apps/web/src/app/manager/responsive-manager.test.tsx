// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ManagerProgressView, ManagerRemindersView } from "@e4s/contracts";
import { ManagerProgress } from "./Progress.js";
import { ManagerReminders } from "./Reminders.js";

/** Phone viewport: every media query up to 600px matches. */
function phoneViewport() {
  vi.stubGlobal("matchMedia", (query: string) => {
    const max = /max-width:\s*(\d+)px/.exec(query);
    return { matches: max ? 390 <= Number(max[1]) : false, addEventListener: vi.fn(), removeEventListener: vi.fn() };
  });
}

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

const base = { completedLessons: 0, totalLessonsThisWeek: 0, sessionsThisWeek: 0, coachTurnsThisWeek: 0, weeklyPracticeScore: null, weeklyPracticeStatus: "not_submitted", rewardPoints: 0, earnedBadges: [], lastActivityAt: null } as const;
const learner = (id: number, extra: Partial<ManagerProgressView["learners"][number]>): ManagerProgressView["learners"][number] => ({ ...base, learnerId: `l-${id}`, learnerName: `Học viên ${id}`, cefr: null, placementScore: null, missedDays: 0, ...extra });
const progress: ManagerProgressView = {
  organizationName: "GFT Demo", currentWeek: 1, pilotWeeks: 2,
  summary: { learnerCount: 9, activeLearnersThisWeek: 0, completedLessons: 0, pendingAssessments: 0, completedLearners: 0, surveyCount: 0, satisfactionAverage: null },
  regularByWeek: [], activityByDay: [],
  learners: [
    ...Array.from({ length: 7 }, (_, index) => learner(index + 1, { cefr: "A2", missedDays: index })),
    ...Array.from({ length: 5 }, (_, index) => learner(20 + index, { placementStatus: "submitted", placementScoring: "ai", placementScore: 40 })),
    learner(30, { placementStatus: "in_progress" }),
    learner(31, { placementStatus: "not_started" })
  ]
};

describe("Manager phone layout", () => {
  it("pages the learners and merges the waiting lists into one tabbed card without repeated helper text", async () => {
    phoneViewport();
    const user = userEvent.setup();
    render(<ManagerProgress view={progress} onOpenLearnerProfile={vi.fn()} />);
    // 7 active learners → 5 on the first phone page, with the shared pager.
    expect(within(screen.getByRole("table", { name: "Tiến độ người học" })).getAllByRole("article", { name: /^Học viên/u })).toHaveLength(5);
    expect(screen.getByRole("navigation", { name: "Trang danh sách người học đang học" })).toHaveTextContent("Trang 1/2");
    // Page actions are icon squares with an accessible name.
    expect(screen.getByRole("button", { name: "Xuất CSV" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Giả lập phần thưởng" })).toBeInTheDocument();
    // Waiting learners: one card with three tabs, no per-row "Bài test đã nộp…" sentence.
    const tabs = screen.getByRole("tablist", { name: "Trạng thái bài test đầu vào" });
    expect(within(tabs).getByRole("tab", { name: /Đã nộp/ })).toHaveAttribute("aria-selected", "true");
    expect(screen.queryByText(/đang chờ Người vận hành duyệt mức/)).not.toBeInTheDocument();
    expect(within(screen.getByRole("tabpanel")).getAllByRole("button", { name: /^Hồ sơ/ })).toHaveLength(4);
    await user.click(within(tabs).getByRole("tab", { name: /Đang làm/ }));
    expect(within(screen.getByRole("tabpanel")).getByRole("button", { name: "Hồ sơ Học viên 30" })).toBeInTheDocument();
  });

  it("pages the reminder history with the delete button on the same line", () => {
    phoneViewport();
    const history = Array.from({ length: 9 }, (_, index) => ({ reminderId: `r-${index}`, learnerId: `l-${index}`, learnerName: `Học viên ${index}`, recipient: null, missedDays: 3, status: "sent", deliveryStatus: "sent", provider: "base_webhook", createdAt: "2026-11-12T09:00:00.000Z", attemptedAt: null })) as NonNullable<ManagerRemindersView["history"]>;
    render(<ManagerReminders view={{ organizationName: "GFT Demo", inactiveDays: 3, emailConfigured: true, candidates: [], history }} onSend={vi.fn()} onDeleteHistory={vi.fn()} />);
    const list = screen.getByRole("list", { name: "Lịch sử nhắc học" });
    expect(within(list).getAllByRole("listitem")).toHaveLength(6);
    expect(screen.queryByRole("button", { name: /Xem thêm/ })).not.toBeInTheDocument();
    const first = within(list).getAllByRole("listitem")[0]!;
    expect(first.querySelector(".manager-reminder-history-heading .manager-reminder-history-delete")).not.toBeNull();
    // The explanation moved into the ⓘ next to the empty-state title.
    expect(screen.getByRole("button", { name: "Không ai cần nhắc hôm nay: giải thích" })).toHaveAttribute("title", "Mọi người học đều có hoạt động trong 3 ngày gần đây.");
  });
});
