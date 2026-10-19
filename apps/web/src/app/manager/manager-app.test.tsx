// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
import type { ComponentProps } from "react";
import { userEvent } from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ManagerAccountsView, ManagerOperationsView, ManagerProgressView, ManagerRemindersView, ManagerReportView } from "@e4s/contracts";
import {
  ManagerOperations,
  ManagerProgress,
  ManagerReminders,
  ManagerReport,
  ManagerRewards
} from "./index.js";
import { OperationalCards, PageTitle } from "./shared.js";

afterEach(cleanup);

const progress: ManagerProgressView = {
  organizationName: "GFT Demo", currentWeek: 1, pilotWeeks: 2,
  summary: { learnerCount: 2, activeLearnersThisWeek: 1, completedLessons: 1, pendingAssessments: 0, completedLearners: 0, comparableLearners: 0, improvedLearners: 0, surveyCount: 0, satisfactionAverage: null },
  regularByWeek: [{ week: 1, regularLearners: 1, totalLearners: 1, percent: 100 }],
  activityByDay: [{ date: "2026-10-14", activeLearners: 1, sessions: 1, minutes: 10 }],
  learners: [
    { learnerId: "learner-1", learnerName: "Học viên Demo", cefr: "A2", completedLessons: 1, totalLessonsThisWeek: 5, sessionsThisWeek: 3, coachTurnsThisWeek: 2, weeklyPracticeScore: null, weeklyPracticeStatus: "not_submitted", rewardPoints: 20, earnedBadges: ["first"], placementScore: 52, finalScore: null, missedDays: 0, lastActivityAt: "2026-10-14T09:00:00.000Z" },
    { learnerId: "learner-2", learnerName: "Chờ duyệt", cefr: null, completedLessons: 0, totalLessonsThisWeek: 0, sessionsThisWeek: 0, coachTurnsThisWeek: 0, weeklyPracticeScore: null, weeklyPracticeStatus: "not_submitted", rewardPoints: 0, earnedBadges: [], placementScore: 40, finalScore: null, missedDays: 3, lastActivityAt: null }
  ]
};

const operations: ManagerOperationsView = {
  organizationName: "GFT Demo", currentWeek: 1, pilotWeeks: 2,
  content: { draft: 1, inReview: 0, published: 1 }, queues: { assessmentReview: 0, practiceReview: 0 }, automation: { pendingJobs: 0, aiFailures: 0 }, recentActivity: [],
  readiness: { requiredSets: 2, readySets: 1, missing: [{ week: 1, cefr: "B1", state: "missing" }], orphanLegacySets: 1 },
  operators: [{ operatorId: "op-1", operatorName: "Thư Demo", byWeek: [{ week: 1, sets: 1, lessons: 5, approved: 1 }], sets: 1, lessons: 5, published: 1, fullLessons: 5, editedLessons: 1, completions: 1, averageScore: 80, firstTryPercent: 75, failedPercent: 0, averageAttempts: 1.2, approvals: 1, averageApprovalHours: 2, reviewedSubmissions: 1, reviewedCoachTurns: 2 }]
};

describe("new Manager app branch", () => {
  it("preserves progress block order and wires learner actions", async () => {
    const openProfile = vi.fn(); const remove = vi.fn();
    const { container } = render(<ManagerProgress view={progress} onOpenLearnerProfile={openProfile} onDeleteLearner={remove} />);
    const headings = [...container.querySelectorAll("h1,h3")].map((node) => node.textContent);
    expect(headings).toEqual(["Tiến độ nhóm", "Từng người học", "Chưa vào học"]);
    expect(screen.getByText("Học đều (≥3 buổi/tuần)")).toBeInTheDocument();
    await userEvent.setup().click(screen.getByRole("button", { name: "Hồ sơ Học viên Demo" }));
    expect(openProfile).toHaveBeenCalledWith("learner-1");
    await userEvent.setup().click(screen.getByRole("button", { name: "Xoá Học viên Demo" }));
    expect(remove).toHaveBeenCalledWith("learner-1");
  });

  it("renders the real weekly attendance strip without expanding badge prose in the compact table", () => {
    const enriched = {
      ...progress,
      weekStartDate: "2026-10-12",
      learners: [{
        ...progress.learners[0]!,
        activityDatesThisWeek: ["2026-10-12", "2026-10-14"],
        earnedBadgeDetails: [{ key: "starter", label: "Khởi động", description: "Hoàn thành bài học đầu tiên" }]
      }, progress.learners[1]!]
    } as ManagerProgressView;
    render(<ManagerProgress view={enriched} />);
    expect(screen.getByLabelText("Điểm danh tuần này")).toBeInTheDocument();
    expect(screen.getByLabelText("T2: đã học")).toBeInTheDocument();
    expect(screen.getByLabelText("T3: chưa học")).toBeInTheDocument();
    expect(screen.queryByText("Khởi động")).not.toBeInTheDocument();
    expect(screen.queryByText("Hoàn thành bài học đầu tiên")).not.toBeInTheDocument();
    expect(screen.getByTitle(/Khởi động: Hoàn thành bài học đầu tiên/)).toBeInTheDocument();
  });

  it("renders the Manager PIN disclosure accordion from safe account data", () => {
    const accounts: ManagerAccountsView = {
      organizationName: "GFT Demo",
      accounts: [{ id: "learner-1", displayName: "Học viên Demo", email: "learner@e4s.local", role: "learner", status: "active", createdAt: "2026-10-01T09:00:00.000Z" }]
    };
    const props = { view: progress, pinDirectory: accounts } as ComponentProps<typeof ManagerProgress>;
    render(<ManagerProgress {...props} />);
    expect(screen.getByRole("heading", { name: "Mã PIN" })).toBeInTheDocument();
    expect(screen.getByText("Tất cả mã PIN trong hệ thống (chỉ Quản lý xem được)")).toBeInTheDocument();
    expect(screen.getAllByText("Học viên Demo").length).toBeGreaterThanOrEqual(2);
    expect(screen.getByText("Không hiển thị")).toBeInTheDocument();
    expect(screen.queryByText("learner-pass")).not.toBeInTheDocument();
  });

  it("uses backend readiness instead of deriving fake set counts", () => {
    render(<ManagerOperations view={operations} deleteRequestCounts={{ "op-1": 2 }} />);
    expect(screen.getByText("Bạn thấy đúng những gì vận hành thấy, ở chế độ chỉ xem.")).toBeInTheDocument();
    expect(screen.getByRole("navigation", { name: "Màn hình vận hành (chỉ xem)" })).toHaveAttribute("data-read-only-preview", "true");
    expect(screen.getByRole("link", { name: "Chủ đề tuần" })).toHaveAttribute("href", "/op/weeks");
    expect(screen.getByRole("link", { name: "Prompt" })).toHaveAttribute("href", "/op/prompts");
    expect(screen.getByRole("heading", { name: "Bộ bài đã sẵn sàng đến tuần 1" })).toBeInTheDocument();
    expect(screen.getByText("1/2 bộ đã duyệt")).toBeInTheDocument();
    expect(screen.getByText(/Tuần 1 · B1 \(chưa sinh\)/)).toBeInTheDocument();
    expect(screen.getByText(/1 bộ bài cũ chưa có thông tin người soạn/)).toBeInTheDocument();
    expect(screen.getByText("Yêu cầu xoá tài khoản đã gửi").parentElement).toHaveTextContent("2");
    expect(screen.getByRole("link", { name: "Đề lên mức" })).toHaveAttribute("href", "/op/levelforms");
  });

  it("keeps the operations introduction concise while retaining both metrics", () => {
    render(<ManagerOperations view={operations} />);
    expect(screen.getByText("Tuần 1/2 · 1 người vận hành. Số bài soạn/tuần; chất lượng qua kết quả học viên.")).toBeInTheDocument();
  });

  it("shows webhook state, exact missed days and audited reminder history", async () => {
    const send = vi.fn(); const dismiss = vi.fn(); const copy = vi.fn();
    const reminders: ManagerRemindersView = {
      organizationName: "GFT Demo", inactiveDays: 2, webhookConfigured: false,
      candidates: [{ learnerId: "learner-3", learnerName: "Cần nhắc", cefr: "A2", lastActivityAt: null, missedDays: 5 }],
      history: [{ reminderId: "r-1", learnerId: "learner-1", learnerName: "Học viên Demo", missedDays: 3, status: "queued", deliveryStatus: "queued", provider: "local_queue", createdAt: "2026-10-14T09:00:00.000Z", attemptedAt: "2026-10-14T09:00:01.000Z" }]
    };
    Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText: vi.fn().mockResolvedValue(undefined) } });
    render(<ManagerReminders view={reminders} onSend={send} onDismiss={dismiss} onCopy={copy} />);
    expect(screen.getByText("Tự phát hiện người bỏ ≥2 ngày liên tiếp. Gửi qua Base Message webhook hoặc copy tin nhắn để gửi tay.")).toBeInTheDocument();
    expect(screen.getByRole("note")).toHaveTextContent("Chưa có webhook Base.vn");
    expect(screen.getByRole("note")).toHaveTextContent("trong Cài đặt, hoặc dùng nút Copy để gửi tay");
    expect(screen.getByRole("button", { name: /Gửi tất cả \(1\)/ })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Gửi qua Base.vn" })).toHaveAttribute("title", "Chưa cấu hình webhook");
    expect(screen.getByText("bỏ 5 ngày")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Lịch sử nhắc" })).toBeInTheDocument();
    expect(screen.getByText(/14[-/]10/)).toBeInTheDocument();
    expect(screen.getAllByRole("columnheader").map((header) => header.textContent)).toEqual(["Ngày", "Người học", "Bỏ", "Kết quả"]);
    await userEvent.setup().click(screen.getByRole("button", { name: "Đã nhắc cách khác" }));
    expect(dismiss).toHaveBeenCalledWith("learner-3");
    await userEvent.setup().click(screen.getByRole("button", { name: "Copy tin nhắn" }));
    await vi.waitFor(() => expect(copy).toHaveBeenCalledWith("learner-3"));
  });

  it("sends all reminders sequentially and exposes a responsive action group", async () => {
    let releaseFirst!: () => void;
    const firstRequest = new Promise<void>((resolve) => { releaseFirst = resolve; });
    const send = vi.fn((learnerId: string) => learnerId === "learner-1" ? firstRequest : Promise.resolve());
    const reminders: ManagerRemindersView = {
      organizationName: "GFT Demo", inactiveDays: 2, webhookConfigured: true,
      candidates: [
        { learnerId: "learner-1", learnerName: "Cần nhắc một", cefr: "A2", lastActivityAt: null, missedDays: 3 },
        { learnerId: "learner-2", learnerName: "Cần nhắc hai", cefr: "B1", lastActivityAt: null, missedDays: 4 }
      ], history: []
    };
    render(<ManagerReminders view={reminders} onSend={send} />);
    const firstActions = screen.getByRole("group", { name: "Thao tác nhắc học cho Cần nhắc một" });
    expect(firstActions).toHaveClass("manager-reminder-actions");
    expect(firstActions).toHaveStyle({ marginTop: "8px" });
    await userEvent.setup().click(screen.getByRole("button", { name: "Gửi tất cả (2)" }));
    await vi.waitFor(() => expect(send).toHaveBeenCalledTimes(1));
    releaseFirst();
    await vi.waitFor(() => expect(send).toHaveBeenCalledTimes(2));
    expect(send.mock.calls.map(([learnerId]) => learnerId)).toEqual(["learner-1", "learner-2"]);
  });

  it("renders all five report sections from real report fields", () => {
    const report: ManagerReportView = {
      organizationName: "GFT Demo", generatedAt: "2026-10-14T09:00:00.000Z", currentWeek: 1, pilotWeeks: 2,
      progress: progress.summary, learners: progress.learners, activityByDay: progress.activityByDay, regularByWeek: progress.regularByWeek,
      levelDistribution: [{ cefr: "A2", learners: 1 }], totals: { approvedLessonSets: 1, approvedLessons: 5, coachTurns: 2, practiceSubmissions: 1, reviewedPracticeSubmissions: 1, reminders: 1, appeals: 1, pendingAppeals: 1 },
      surveyResponses: [{ learnerId: "learner-1", learnerName: "Học viên Demo", rating: 5, comment: "Ổn", studyTime: "work", submittedAt: "2026-10-14T09:00:00.000Z" }],
      operations: { content: operations.content, queues: operations.queues, automation: operations.automation }
    };
    render(<ManagerReport view={report} webhookConfigured aiProvider="Groq" aiModel="qwen/qwen3.8-27b" courseTheme="Tiếng Anh giao tiếp công sở" pilotStartDate="2026-10-12" managerName="Quản lý Demo" />);
    expect(screen.getByText("Tổng hợp tự động theo bốn chỉ số của PRD. Bấm In để in hoặc lưu thành PDF.")).toBeInTheDocument();
    for (const title of ["1. Bốn chỉ số của pilot", "2. Quy mô và hoạt động", "3. Từng học viên", "4. Phản hồi khảo sát", "5. Việc cần làm tiếp"]) expect(screen.getByRole("heading", { name: title })).toBeInTheDocument();
    expect(screen.getByText("1 đã nộp · 1 đã đọc mẫu")).toBeInTheDocument();
    expect(screen.getAllByText(/Học viên Demo/).length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText("Chủ đề khoá: Tiếng Anh giao tiếp công sở")).toBeInTheDocument();
    expect(screen.getByText(/Giai đoạn: tuần 1\/2 \(từ 12\/10\)/)).toBeInTheDocument();
    expect(screen.getByText(/Người lập: Quản lý Demo/)).toBeInTheDocument();
    expect(screen.getByRole("columnheader", { name: "Cấp ngỗng" })).toBeInTheDocument();
    expect(screen.getByText(/Không có học viên nào bỏ từ 2 ngày trở lên\./)).toBeInTheDocument();
    expect(screen.getByRole("progressbar", { name: "Mức đạt Học đều" })).toHaveClass("ok");
    expect(screen.getByRole("progressbar", { name: "Mức đạt Học đến cuối" })).toHaveClass("danger");
    const reportKpi = screen.getAllByText("100%").find((element) => element.tagName === "B" && element.getAttribute("style")?.includes("1.25rem"));
    expect(reportKpi).toBeDefined();
    expect(reportKpi!).toHaveAttribute("style", expect.stringContaining("font-family: var(--font-display)"));
    expect(reportKpi!).toHaveAttribute("style", expect.stringContaining("font-size: 1.25rem"));
  });

  it("announces the report copy result after the export action", async () => {
    const copy = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", { configurable: true, writable: true, value: { writeText: copy } });
    const report: ManagerReportView = {
      organizationName: "GFT Demo", generatedAt: "2026-10-14T09:00:00.000Z", currentWeek: 1, pilotWeeks: 2,
      progress: progress.summary, learners: progress.learners, activityByDay: progress.activityByDay, regularByWeek: progress.regularByWeek,
      levelDistribution: [{ cefr: "A2", learners: 1 }], totals: { approvedLessonSets: 1, approvedLessons: 5, coachTurns: 2, practiceSubmissions: 1, reviewedPracticeSubmissions: 1, reminders: 1, appeals: 1, pendingAppeals: 1 },
      surveyResponses: [], operations: { content: operations.content, queues: operations.queues, automation: operations.automation }
    };
    render(<ManagerReport view={report} webhookConfigured={false} aiProvider="Groq" aiModel="qwen/qwen3.8-27b" />);

    await userEvent.setup().click(screen.getByRole("button", { name: "Copy bản chữ" }));

    await vi.waitFor(() => expect(screen.getByRole("status", { name: "Trạng thái xuất báo cáo" })).toHaveTextContent("Đã sao chép báo cáo."));
  });

  it("keeps the nine reward cases and changes simulation state", async () => {
    render(<ManagerRewards />);
    const quickCases = screen.getByRole("group", { name: "Chọn nhanh một trường hợp" });
    expect(within(quickCases).getAllByRole("button")).toHaveLength(9);
    await userEvent.setup().click(within(quickCases).getByRole("button", { name: "Cấp cao nhất" }));
    expect(screen.getByText("Kết quả: cấp 4/4 · Mùa đông – vững vàng")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "4 mùa học" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "🐣 Khởi động" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "📅 Tuần trọn vẹn" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "🌟 Chuỗi 5 ngày" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "🌱 Bước đầu" })).not.toBeInTheDocument();
    await userEvent.setup().click(within(quickCases).getByRole("button", { name: "Có huy hiệu cấp cao nhưng thiếu cấp dưới" }));
    expect(screen.getByText("Kết quả: cấp 1/4 · Mùa xuân – gieo hạt")).toBeInTheDocument();
  });

  it("exposes reward promotion previews as dismissible modal dialogs", async () => {
    const user = userEvent.setup();
    render(<ManagerRewards />);
    const trigger = screen.getAllByRole("button", { name: "Xem màn lên cấp" })[0]!;
    await user.click(trigger);

    const dialog = screen.getByRole("dialog", { name: "Màn chúc mừng lên cấp" });
    expect(dialog).toHaveAttribute("aria-modal", "true");
    expect(document.body).toHaveClass("app-modal-open");
    expect(dialog).toHaveTextContent("Bạn đã đủ 60 điểm");
    expect(dialog).toHaveTextContent("Cấp tiếp theo: Mùa thu – gặt hái");
    expect(within(dialog).getByRole("button", { name: "Đóng màn chúc mừng" })).toHaveFocus();
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("dialog", { name: "Màn chúc mừng lên cấp" })).not.toBeInTheDocument();
    expect(document.body).not.toHaveClass("app-modal-open");
    expect(trigger).toHaveFocus();

    await user.click(trigger);
    const backdrop = screen.getByRole("dialog", { name: "Màn chúc mừng lên cấp" }).parentElement!;
    await user.click(backdrop);
    expect(screen.queryByRole("dialog", { name: "Màn chúc mừng lên cấp" })).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
  });

  it("keeps the reward table in its own horizontal scroll flow", () => {
    render(<ManagerRewards />);
    expect(document.querySelector("[data-manager-action-table]")).not.toHaveClass("manager-action-table");
  });

  it("keeps Manager title and operational cards on stable spacing hooks", () => {
    render(<>
      <PageTitle actions={<button type="button">Tác vụ</button>}><h1>Tiến độ nhóm</h1><p>Mô tả</p></PageTitle>
      <OperationalCards pinReports={[{ id: "pin-1", title: "Học viên Demo", detail: "Đang chờ" }]} />
    </>);

    expect(screen.getByRole("heading", { name: "Tiến độ nhóm" }).parentElement).toHaveClass("manager-page-title__content");
    expect(screen.getByRole("button", { name: "Tác vụ" }).parentElement).toHaveClass("manager-page-title__actions");
    expect(screen.getByRole("heading", { name: /^Mã PIN/ }).closest("section")).toHaveClass("manager-section-card");
  });
});
