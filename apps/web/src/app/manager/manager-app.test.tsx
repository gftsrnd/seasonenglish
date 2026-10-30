// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter } from "react-router";
import type { ManagerOperationsView, ManagerProgressView, ManagerRemindersView, ManagerReportView } from "@e4s/contracts";
import {
  ManagerOperations,
  ManagerProgress,
  ManagerReminders,
  ManagerReport,
  ManagerRewards
} from "./index.js";
import { buildManagerProgressCsv, managerLearnerStatus } from "./Progress.js";
import { OperationalCards, PageTitle } from "./shared.js";
import { buildManagerReportText } from "./Report.js";

afterEach(cleanup);

const progress: ManagerProgressView = {
  organizationName: "GFT Demo", currentWeek: 1, pilotWeeks: 2,
  summary: { learnerCount: 4, activeLearnersThisWeek: 1, completedLessons: 1, pendingAssessments: 2, completedLearners: 0, surveyCount: 0, satisfactionAverage: null },
  regularByWeek: [{ week: 1, regularLearners: 1, totalLearners: 1, percent: 100 }],
  activityByDay: [{ date: "2026-10-14", activeLearners: 1, sessions: 1, minutes: 10 }],
  learners: [
    { learnerId: "learner-1", learnerName: "Học viên Demo", cefr: "A2", completedLessons: 1, totalLessonsThisWeek: 5, sessionsThisWeek: 3, coachTurnsThisWeek: 2, weeklyPracticeScore: null, weeklyPracticeStatus: "not_submitted", rewardPoints: 20, earnedBadges: ["first"], placementScore: 52, missedDays: 0, lastActivityAt: "2026-10-14T09:00:00.000Z" },
    { learnerId: "learner-2", learnerName: "Đã nộp", cefr: null, completedLessons: 0, totalLessonsThisWeek: 0, sessionsThisWeek: 0, coachTurnsThisWeek: 0, weeklyPracticeScore: null, weeklyPracticeStatus: "not_submitted", rewardPoints: 0, earnedBadges: [], placementScore: 40, placementStatus: "submitted", placementScoring: "ai", missedDays: 3, lastActivityAt: null },
    { learnerId: "learner-3", learnerName: "Chưa thi", cefr: null, completedLessons: 0, totalLessonsThisWeek: 0, sessionsThisWeek: 0, coachTurnsThisWeek: 0, weeklyPracticeScore: null, weeklyPracticeStatus: "not_submitted", rewardPoints: 0, earnedBadges: [], placementScore: null, placementStatus: "not_started", missedDays: null, lastActivityAt: null },
    { learnerId: "learner-4", learnerName: "Đang thi", cefr: null, completedLessons: 0, totalLessonsThisWeek: 0, sessionsThisWeek: 0, coachTurnsThisWeek: 0, weeklyPracticeScore: null, weeklyPracticeStatus: "not_submitted", rewardPoints: 0, earnedBadges: [], placementScore: null, placementStatus: "in_progress", missedDays: null, lastActivityAt: "2026-10-23T09:00:00.000Z" }
  ]
};

const operations: ManagerOperationsView = {
  organizationName: "GFT Demo", currentWeek: 1, pilotWeeks: 2,
  content: { draft: 1, inReview: 0, published: 1 }, queues: { assessmentReview: 0, practiceReview: 0 }, automation: { pendingJobs: 0, aiFailures: 0 }, recentActivity: [],
  readiness: { requiredSets: 2, readySets: 1, missing: [{ week: 1, cefr: "B1", state: "missing" }], orphanLegacySets: 1 },
  operators: [{ operatorId: "op-1", operatorName: "Thư Demo", byWeek: [{ week: 1, sets: 1, lessons: 5, approved: 1 }], sets: 1, lessons: 5, published: 1, fullLessons: 5, editedLessons: 1, completions: 1, averageScore: 80, firstTryPercent: 75, failedPercent: 0, averageAttempts: 1.2, approvals: 1, averageApprovalHours: 2, reviewedSubmissions: 1, reviewedCoachTurns: 2 }]
};

function renderRewards() {
  return render(<MemoryRouter><ManagerRewards /></MemoryRouter>);
}

describe("new Manager app branch", () => {
  it("exports every visible progress column, including Friday practice and status", () => {
    const csv = buildManagerProgressCsv({
      ...progress,
      learners: [{ ...progress.learners[0]!, weeklyPracticeStatus: "scored", weeklyPracticeScore: 88 }]
    });

    expect(csv.split("\r\n")[0]).toBe('"Tên học viên","Mức hiện tại","Tình trạng học","Mức rủi ro","Số ngày không học","Hoạt động gần nhất","Số buổi tuần này","Bài hoàn thành","Tổng bài trong tuần","Lượt AI Coach","Trạng thái bài cuối tuần","Điểm bài cuối tuần","Trạng thái bài đầu vào","Cách chấm đầu vào","Điểm đầu vào","Điểm thưởng","Huy hiệu"');
    expect(csv).toContain('"Học viên Demo","A2","Đang học","Bình thường","0","14/10/2026 09:00","3","1","5","2","Đã chấm","88","Không rõ","Không rõ","52","20","first"');
  });

  it("uses the M-004 risk thresholds and exports never-started learners clearly", () => {
    const idle = { ...progress.learners[0]!, sessionsThisWeek: 0, missedDays: 0, lastActivityAt: null };
    expect(managerLearnerStatus(idle, "2026-10-26", new Date("2026-10-27T12:00:00Z"))).toBe("Đang học");
    expect(managerLearnerStatus(idle, "2026-10-26", new Date("2026-10-28T12:00:00Z"))).toBe("Chưa học tuần này");
    expect(managerLearnerStatus({ ...idle, missedDays: 2 }, "2026-10-26", new Date("2026-10-28T12:00:00Z"))).toBe("Bỏ 2 ngày");
    const csv = buildManagerProgressCsv({ ...progress, weekStartDate: "2026-10-26", learners: [idle] }, new Date("2026-10-28T12:00:00Z"));
    expect(csv).toContain('"Chưa vào học"');
    expect(csv).toContain('"Chưa học tuần này"');
    expect(csv).toContain('"Trung bình"');
  });

  it("includes each learner's dropout state in both the printable report and text export", () => {
    const report: ManagerReportView = {
      organizationName: "GFT Demo", generatedAt: "2026-10-28T09:00:00.000Z", currentWeek: 1, pilotWeeks: 2,
      progress: progress.summary,
      learners: [{ ...progress.learners[0]!, learnerName: "Người cần nhắc", missedDays: 4, sessionsThisWeek: 0 }],
      activityByDay: [], regularByWeek: [], levelDistribution: [{ cefr: "A2", learners: 1 }],
      totals: { approvedLessonSets: 1, approvedLessons: 5, coachTurns: 2, practiceSubmissions: 0, reviewedPracticeSubmissions: 0, reminders: 0, appeals: 0, pendingAppeals: 0 },
      surveyResponses: [], operations: { content: operations.content, queues: operations.queues, automation: operations.automation }
    };

    render(<ManagerReport view={report} />);

    expect(buildManagerReportText(report)).toContain("Tình trạng: Bỏ 4 ngày");
    const learnerTable = screen.getByRole("table", { name: "Tình trạng từng học viên" });
    expect(within(learnerTable).getByText("Bỏ 4 ngày")).toBeInTheDocument();
    expect(learnerTable).toHaveClass("manager-report-learner-table");
  });

  it("groups Manager progress like Operator and exposes profile-only learner actions", async () => {
    const openProfile = vi.fn(); const remove = vi.fn(); const assignWeeklyPractice = vi.fn();
    const { container } = render(<ManagerProgress view={progress} onOpenLearnerProfile={openProfile} onAssignWeeklyPractice={assignWeeklyPractice} onDeleteLearner={remove} />);
    const headings = [...container.querySelectorAll("h1,h3")].map((node) => node.textContent);
    expect(headings).toEqual(["Tiến độ nhóm", "Đang học (1)", "Đã nộp, chờ duyệt mức (1)", "Đang làm test (1)", "Chưa làm test (1)"]);
    expect(screen.getByText("Học đều (≥3 buổi/tuần)")).toBeInTheDocument();
    await userEvent.setup().click(screen.getByRole("button", { name: "Hồ sơ Học viên Demo" }));
    expect(openProfile).toHaveBeenCalledWith("learner-1");
    await userEvent.setup().click(screen.getByRole("button", { name: "Giao bài tuần cho Học viên Demo" }));
    expect(assignWeeklyPractice).toHaveBeenCalledWith("learner-1");
    expect(screen.getByRole("button", { name: "Hồ sơ Đang thi" })).toBeInTheDocument();
    expect(screen.getByText("Bài test đang được thực hiện, chưa thể chấm điểm.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Hồ sơ Đã nộp" })).toBeInTheDocument();
    expect(screen.getByText("AI chấm")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Hồ sơ Chưa thi" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Xoá/ })).not.toBeInTheDocument();
    expect(remove).not.toHaveBeenCalled();
  });

  it("shows Managers when a placement was scored manually", () => {
    const manual = {
      ...progress,
      learners: progress.learners.map((learner) => learner.learnerId === "learner-2" ? { ...learner, placementScoring: "human" as const } : learner)
    };
    render(<ManagerProgress view={manual} />);
    expect(screen.getByText("Đã chấm tay")).toBeInTheDocument();
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

  it("does not expose PIN data on the Manager progress screen", () => {
    render(<ManagerProgress view={progress} />);
    expect(screen.queryByRole("heading", { name: /Mã PIN/ })).not.toBeInTheDocument();
    expect(screen.queryByText(/PIN trong hệ thống/)).not.toBeInTheDocument();
  });

  it("uses backend readiness instead of deriving fake set counts", () => {
    render(<ManagerOperations view={operations} deleteRequestCounts={{ "op-1": 2 }} />);
    expect(screen.getByRole("heading", { name: "Người vận hành" })).toBeInTheDocument();
    expect(screen.getByText("Theo dõi nhanh người soạn/duyệt và chất lượng đầu ra. Danh sách này chỉ gồm tài khoản vận hành, không trộn vào bảng học viên.")).toBeInTheDocument();
    expect(screen.getByText("Thư Demo")).toBeInTheDocument();
    expect(screen.getByText("Thư Demo").closest("summary")).toHaveTextContent("1 bộ · 5 bài");
    expect(screen.getByText("Thư Demo").closest("summary")).toHaveTextContent("1 duyệt · 1 bài đọc · 1 hoàn thành");
    expect(screen.queryByRole("navigation", { name: "Màn hình vận hành" })).not.toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Bộ bài cần xử lý" })).toBeInTheDocument();
    expect(screen.getByText("1 bộ")).toBeInTheDocument();
    expect(screen.getByText(/Tuần 1 · B1: chưa sinh/)).toBeInTheDocument();
    expect(screen.queryByRole("region", { name: "Thao tác vận hành của Quản lý" })).not.toBeInTheDocument();
    expect(screen.getByText(/1 bộ bài cũ chưa có thông tin người soạn/)).toBeInTheDocument();
    expect(screen.getByText("Yêu cầu xoá tài khoản đã gửi").parentElement).toHaveTextContent("2");
  });

  it("keeps the operations introduction concise while retaining both metrics", () => {
    render(<ManagerOperations view={operations} />);
    expect(screen.getByText("Tuần 1/2 · 1 người vận hành. Số bài soạn/tuần; chất lượng qua kết quả học viên.")).toBeInTheDocument();
  });

  it("shows webhook state, exact missed days and audited reminder history", async () => {
    const send = vi.fn(); const dismiss = vi.fn(); const copy = vi.fn();
    const reminders: ManagerRemindersView = {
      organizationName: "GFT Demo", inactiveDays: 2, webhookConfigured: false, emailConfigured: true,
      candidates: [{ learnerId: "learner-3", learnerName: "Cần nhắc", learnerEmail: "can.nhac@example.com", cefr: "A2", lastActivityAt: null, missedDays: 5 }],
      history: [{ reminderId: "r-1", learnerId: "learner-1", learnerName: "Học viên Demo", missedDays: 3, status: "queued", deliveryStatus: "queued", provider: "resend", createdAt: "2026-10-14T09:00:00.000Z", attemptedAt: "2026-10-14T09:00:01.000Z" }]
    };
    Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText: vi.fn().mockResolvedValue(undefined) } });
    render(<ManagerReminders view={reminders} onSend={send} onDismiss={dismiss} onCopy={copy} />);
    expect(screen.getByText(/Email được gửi riêng/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Gửi email" })).toBeEnabled();
    expect(screen.queryByRole("button", { name: "Gửi Base.vn" })).not.toBeInTheDocument();
    expect(screen.getByText("Email")).toBeInTheDocument();
    expect(screen.getByText("bỏ 5 ngày")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Lịch sử nhắc" })).toBeInTheDocument();
    expect(screen.getByText(/14[-/]10/)).toBeInTheDocument();
    expect(screen.getAllByRole("columnheader").map((header) => header.textContent)).toEqual(["Ngày", "Người học", "Email nhận", "Kênh", "Bỏ", "Kết quả"]);
    await userEvent.setup().click(screen.getByRole("button", { name: "Đã nhắc qua kênh khác" }));
    expect(dismiss).toHaveBeenCalledWith("learner-3");
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
    await userEvent.setup().click(screen.getByRole("button", { name: "Copy tin nhắn" }));
    await vi.waitFor(() => expect(copy).toHaveBeenCalledWith("learner-3"));
  });

  it("only offers direct delivery when the learner recipient is known", async () => {
    const send = vi.fn().mockResolvedValue(undefined);
    const reminders: ManagerRemindersView = {
      organizationName: "GFT Demo", inactiveDays: 2, webhookConfigured: true,
      candidates: [
        { learnerId: "learner-1", learnerName: "Cần nhắc một", learnerEmail: "mot@example.com", cefr: "A2", lastActivityAt: null, missedDays: 3 },
        { learnerId: "learner-2", learnerName: "Cần nhắc hai", learnerEmail: "hai@example.com", cefr: "B1", lastActivityAt: null, missedDays: 4 }
      ], history: []
    };
    render(<ManagerReminders view={reminders} onSend={send} />);
    const firstActions = screen.getByRole("group", { name: "Thao tác nhắc học cho Cần nhắc một" });
    expect(firstActions).toHaveClass("manager-reminder-actions");
    expect(firstActions.closest("section")).toHaveClass("manager-reminder-card");
    expect(firstActions.previousElementSibling).toHaveClass("manager-reminder-message");
    const user = userEvent.setup();
    await user.click(within(firstActions).getByRole("button", { name: "Gửi email" }));
    await user.click(within(screen.getByRole("dialog", { name: "Xác nhận gửi email" })).getByRole("button", { name: "Xác nhận gửi email" }));
    expect(send).toHaveBeenNthCalledWith(1, "learner-1", "email");
    expect(within(firstActions).queryByRole("button", { name: "Gửi Base.vn" })).not.toBeInTheDocument();
  });

  it("renders all five report sections from real report fields", () => {
    const report: ManagerReportView = {
      organizationName: "GFT Demo", generatedAt: "2026-10-14T09:00:00.000Z", currentWeek: 1, pilotWeeks: 2,
      progress: progress.summary, learners: progress.learners, activityByDay: progress.activityByDay, regularByWeek: progress.regularByWeek,
      levelDistribution: [{ cefr: "A2", learners: 1 }], totals: { approvedLessonSets: 1, approvedLessons: 5, coachTurns: 2, practiceSubmissions: 1, reviewedPracticeSubmissions: 1, reminders: 1, appeals: 1, pendingAppeals: 1 },
      surveyResponses: [{ learnerId: "learner-1", learnerName: "Học viên Demo", rating: 5, comment: "Ổn", studyTime: "work", submittedAt: "2026-10-14T09:00:00.000Z" }],
      operations: { content: operations.content, queues: operations.queues, automation: operations.automation }
    };
    render(<ManagerReport view={report} courseTheme="Tiếng Anh giao tiếp công sở" pilotStartDate="2026-10-12" managerName="Quản lý Demo" />);
    expect(screen.getByText("Tổng hợp tự động theo ba chỉ số của PRD. Bấm In để in hoặc lưu thành PDF.")).toBeInTheDocument();
    for (const title of ["1. Ba chỉ số của pilot", "2. Quy mô và hoạt động", "3. Từng học viên", "4. Phản hồi khảo sát", "5. Việc cần làm tiếp"]) expect(screen.getByRole("heading", { name: title })).toBeInTheDocument();
    expect(screen.queryByText(/cuối kỳ/i)).not.toBeInTheDocument();
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
    expect(screen.queryByRole("heading", { name: "Câu hỏi mở từ PRD" })).not.toBeInTheDocument();
    expect(screen.getByRole("list", { name: "Việc cần làm tiếp" })).toBeInTheDocument();
    expect(screen.getByText("Theo dõi duyệt trình độ")).toBeInTheDocument();
    expect(screen.getByText("Theo dõi xử lý kháng nghị")).toBeInTheDocument();
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
    render(<ManagerReport view={report} />);

    await userEvent.setup().click(screen.getByRole("button", { name: "Copy bản chữ" }));

    await vi.waitFor(() => expect(screen.getByRole("status", { name: "Trạng thái xuất báo cáo" })).toHaveTextContent("Đã sao chép báo cáo."));
    const exported = buildManagerReportText(report);
    for (const section of ["1. BA CHỈ SỐ CỦA PILOT", "2. QUY MÔ VÀ HOẠT ĐỘNG", "3. TỪNG HỌC VIÊN", "4. PHẢN HỒI KHẢO SÁT", "5. VIỆC CẦN LÀM TIẾP"]) {
      expect(exported).toContain(section);
    }
    expect(exported).not.toMatch(/cuối kỳ|cuối khóa/i);
    expect(exported).toContain("Bộ bài đã duyệt: 1 bộ · 5 bài");
    expect(exported).toContain("Chưa có phản hồi.");
    expect(exported).toContain("1 kháng nghị chấm điểm chờ Vận hành xử lý.");
  });

  it("keeps the nine reward cases and changes simulation state", async () => {
    renderRewards();
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
    renderRewards();
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
    renderRewards();
    expect(document.querySelector("[data-manager-action-table]")).not.toHaveClass("manager-action-table");
  });

  it("keeps Manager title and operational cards on stable spacing hooks", () => {
    render(<>
      <PageTitle actions={<button type="button">Tác vụ</button>}><h1>Tiến độ nhóm</h1><p>Mô tả</p></PageTitle>
      <OperationalCards deleteRequests={[{ id: "delete-1", title: "Học viên Demo", detail: "Đang chờ" }]} />
    </>);

    expect(screen.getByRole("heading", { name: "Tiến độ nhóm" }).parentElement).toHaveClass("manager-page-title__content");
    expect(screen.getByRole("button", { name: "Tác vụ" }).parentElement).toHaveClass("manager-page-title__actions");
    expect(screen.getByRole("heading", { name: /^Yêu cầu xoá tài khoản/ }).closest("section")).toHaveClass("manager-section-card");
  });
});
