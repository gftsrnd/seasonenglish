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
  month: "2026-11", currentMonth: "2026-11", availableMonths: ["2026-11", "2026-10"],
  monthSummary: { frameworks: 3, approvedFrameworks: 2, publishedFrameworks: 1, lessons: 40, approvedLessons: 15, failedLessons: 1 },
  operators: [{
    operatorId: "op-1", operatorName: "Thư Demo",
    resourcePools: [
      { cefr: "A2", status: "approved", createdByOperator: true, approvedByOperator: true, published: true },
      { cefr: "B1", status: "draft", createdByOperator: true, approvedByOperator: false, published: false }
    ],
    poolsCreated: 2, poolsApproved: 1, lessonsDrafted: 18, lessonsResaved: 3, lessonsApproved: 15, lessonsPublished: 12, correctionsRequested: 1,
    averageDraftToApprovalHours: 5.5, finalsGenerated: 2, finalGenerationFailures: 1, finalsPublished: 1,
    completions: 1, averageScore: 80, firstTryPercent: 75, failedPercent: 0, averageAttempts: 1.2, approvals: 1, averageApprovalHours: 2, reviewedSubmissions: 1, reviewedCoachTurns: 2
  }]
};

function renderRewards() {
  return render(<MemoryRouter><ManagerRewards /></MemoryRouter>);
}

describe("new Manager app branch", () => {
  it("exports every visible monthly progress column and status", () => {
    const csv = buildManagerProgressCsv({
      ...progress,
      learners: [{ ...progress.learners[0]!, weeklyPracticeStatus: "scored", weeklyPracticeScore: 88 }]
    });

    expect(csv.split("\r\n")[0]).toBe('"Tên học viên","Mức hiện tại","Tình trạng học","Mức rủi ro","Số ngày không học","Hoạt động gần nhất","Số buổi gần đây","Bài hoàn thành tháng","Tổng bài tháng","Lượt AI Coach","Trạng thái đánh giá","Điểm đánh giá","Trạng thái bài đầu vào","Cách chấm đầu vào","Điểm đầu vào","Điểm thưởng","Huy hiệu"');
    expect(csv).toContain('"Học viên Demo","A2","Đang học","Bình thường","0","14/10/2026 09:00","3","1","5","2","Đã chấm","88","Không rõ","Không rõ","52","20","first"');
  });

  it("uses the M-004 risk thresholds and exports never-started learners clearly", () => {
    const idle = { ...progress.learners[0]!, sessionsThisWeek: 0, missedDays: 0, lastActivityAt: null };
    expect(managerLearnerStatus(idle, "2026-10-26", new Date("2026-10-27T12:00:00Z"))).toBe("Đang học");
    expect(managerLearnerStatus(idle, "2026-10-26", new Date("2026-10-28T12:00:00Z"))).toBe("Chưa có hoạt động gần đây");
    expect(managerLearnerStatus({ ...idle, missedDays: 2 }, "2026-10-26", new Date("2026-10-28T12:00:00Z"))).toBe("Bỏ 2 ngày");
    const csv = buildManagerProgressCsv({ ...progress, weekStartDate: "2026-10-26", learners: [idle] }, new Date("2026-10-28T12:00:00Z"));
    expect(csv).toContain('"Chưa vào học"');
    expect(csv).toContain('"Chưa có hoạt động gần đây"');
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
    const openProfile = vi.fn(); const remove = vi.fn();
    const { container } = render(<ManagerProgress view={progress} onOpenLearnerProfile={openProfile} onDeleteLearner={remove} />);
    const headings = [...container.querySelectorAll("h1,h3")].map((node) => node.textContent);
    expect(headings).toEqual(["Tiến độ nhóm", "Đang học (1)", "Đã nộp, chờ duyệt mức (1)", "Đang làm test (1)", "Chưa làm test (1)"]);
    expect(screen.getByText("Duy trì nhịp học")).toBeInTheDocument();
    await userEvent.setup().click(screen.getByRole("button", { name: "Hồ sơ Học viên Demo" }));
    expect(openProfile).toHaveBeenCalledWith("learner-1");
    expect(screen.queryByRole("button", { name: "Giao bài tuần cho Học viên Demo" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Hồ sơ Đang thi" })).toBeInTheDocument();
    expect(screen.getByText("Bài test đang được thực hiện, chưa thể chấm điểm.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Hồ sơ Đã nộp" })).toBeInTheDocument();
    expect(screen.getByText("AI chấm")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Hồ sơ Chưa thi" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Xoá/ })).not.toBeInTheDocument();
    expect(remove).not.toHaveBeenCalled();
  });

  it.each([false, true])("shows monthly absence allowance and appeal status with compact layout %s", (compact) => {
    vi.stubGlobal("matchMedia", vi.fn(() => ({ matches: compact, addEventListener: vi.fn(), removeEventListener: vi.fn() })));
    render(<ManagerProgress view={progress} monthly={{
      organizationName: "GFT Demo", month: "2026-12", currentMonth: "2026-12", cefr: null, generatedAt: "2026-12-31",
      survey: { submissions: 0, ratingResponses: 0, withoutRatingQuestion: 0, unansweredRating: 0, average: null },
      learners: [{
        learnerId: "learner-1", learnerName: "Học viên Demo", email: null, cefr: "A2", state: "active", lastActivityAt: null,
        attendedDays: 0, elapsedDays: 8, absenceDays: 8, maxAbsences: 5, consecutiveAbsences: 0,
        lessons: { completed: 0, scheduled: 9 }, reviews: { completed: 0, scheduled: 3 }, season: { turns: 0, target: 78 },
        exam: { status: "not_started", scores: { listening: null, reading: null, writing: null, speaking: null }, total: null },
        levelCriteria: null, complaintCount: 0, attendanceEligible: false, attendanceAppealRequired: true,
        onTrack: false, completedToDate: false, lessonsToDate: { completed: 0, expected: 9 }, atRisk: true
      }]
    }} />);
    const row = screen.getByRole("row", { name: /Học viên Demo/ });
    expect(within(row).getByText("Vắng 8/5")).toBeInTheDocument();
    expect(within(row).getAllByText("Cần kháng nghị").length).toBeGreaterThan(0);
    if (compact) {
      expect(within(row).getByText("Điểm danh").parentElement).toHaveTextContent("Điểm danhVắng 8/5");
      expect(within(row).getByText("Thi tháng").parentElement).toHaveTextContent("Thi thángCần kháng nghị");
      expect(within(row).getByText("Season").parentElement).toHaveTextContent("Season0 /78");
    }
    vi.unstubAllGlobals();
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

  it("shows each Operator's monthly content output instead of the retired weekly table", () => {
    render(<ManagerOperations view={operations} deleteRequestCounts={{ "op-1": 2 }} />);
    expect(screen.getByRole("heading", { name: "Người vận hành · Tháng 11/2026" })).toBeInTheDocument();
    expect(screen.getByLabelText("Tổng quan tháng")).toHaveTextContent("2/3 bộ tài nguyên đã duyệt · 1 đã phát hành · 15/40 bài đã duyệt · 1 bài đang sinh lỗi");
    const summary = screen.getByText("Thư Demo").closest("summary")!;
    expect(summary).toHaveTextContent("2 bộ tài nguyên · 18 bài");
    expect(summary).toHaveTextContent("15 bài đã duyệt");
    expect(summary).toHaveTextContent("1 duyệt mức · 2 đề thi sinh · 1 hoàn thành");
    const pools = screen.getByRole("table", { name: "Bộ tài nguyên của Thư Demo" });
    expect(within(pools).getAllByRole("row")).toHaveLength(3);
    expect(within(pools).getByText("B1").closest("tr")).toHaveTextContent("B1Bản nhápCó——");
    expect(screen.getByText("Bài đã phát hành cho học viên").parentElement).toHaveTextContent("12");
    expect(screen.getByText("Bài đã lưu nhiều bản nháp (sinh lại hoặc sửa tay)").parentElement).toHaveTextContent("3");
    expect(screen.getByText("Thời gian trung bình từ soạn đến duyệt").parentElement).toHaveTextContent("5.5 giờ");
    expect(screen.getByText("Lượt sinh đề bị lỗi").parentElement).toHaveTextContent("1");
    expect(screen.getByText("Đề đã phát hành").parentElement).toHaveTextContent("1");
    expect(screen.queryByText(/Số bài soạn theo tuần/)).not.toBeInTheDocument();
    expect(screen.queryByText(/4 kỹ năng \+ 3 thành phần/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Bài đã sửa tay sau khi AI sinh/)).not.toBeInTheDocument();
    expect(screen.getByText("Yêu cầu xoá tài khoản đã gửi").parentElement).toHaveTextContent("2");
  });

  it("switches the monthly performance view through the month picker", async () => {
    const user = userEvent.setup();
    const select = vi.fn();
    render(<ManagerOperations view={operations} onSelectMonth={select} />);
    const picker = screen.getByRole("combobox", { name: "Chọn tháng" });
    expect(picker).toHaveValue("2026-11");
    expect(within(picker).getByRole("option", { name: "Tháng 11/2026 (hiện tại)" })).toBeInTheDocument();
    await user.selectOptions(picker, "2026-10");
    expect(select).toHaveBeenCalledWith("2026-10");
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
    expect(screen.getByRole("button", { name: "Gửi Base.vn" })).toBeDisabled();
    expect(screen.getByText("Email")).toBeInTheDocument();
    expect(screen.getByText("Vắng 5 ngày")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Lịch sử nhắc" })).toBeInTheDocument();
    expect(screen.getByText(/14[-/]10/)).toBeInTheDocument();
    expect(screen.getAllByRole("columnheader").map((header) => header.textContent)).toEqual(["Ngày", "Người học", "Nơi nhận", "Kênh", "Bỏ", "Kết quả"]);
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
    expect(within(firstActions).getByRole("button", { name: "Gửi Base.vn" })).toBeDisabled();
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

    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "Copy bản chữ" }));

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
    const user = userEvent.setup();
    const cases = screen.getByRole("combobox", { name: "Tình huống mẫu" });
    expect(within(cases).getAllByRole("option")).toHaveLength(9);
    await user.selectOptions(cases, "Cấp cao nhất");
    expect(screen.getByRole("status")).toHaveTextContent("Cấp 4/4 · Mùa đông – vững vàng · A1");
    expect(screen.getByRole("link", { name: "Xem trước chứng nhận" })).toHaveAttribute("href", "/reward/preview?points=5600&level=A1");
    await user.selectOptions(screen.getByRole("combobox", { name: "Trình độ" }), "B1");
    expect(screen.getByRole("status")).toHaveTextContent("Cấp 4/4 · Mùa đông – vững vàng · B1");
    expect(screen.getByTestId("season-ladder-title")).toHaveTextContent("Mùa đông · B1");
    const custom = screen.getByRole("button", { name: "Tùy chỉnh điểm và huy hiệu" });
    expect(custom).toHaveAttribute("aria-expanded", "false");
    await user.click(custom);
    expect(custom).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByRole("button", { name: "Khởi đầu" })).toHaveAttribute("aria-pressed", "true");
    await user.selectOptions(cases, "Thiếu huy hiệu cấp dưới");
    expect(screen.getByRole("status")).toHaveTextContent("Cấp 1/4 · Mùa xuân – gieo hạt");
  });

  it("edits reward points without a leading zero and reveals the badge group being changed", async () => {
    renderRewards();
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "Tùy chỉnh điểm và huy hiệu" }));
    const points = screen.getByLabelText("Điểm trong trình độ (0–6.000)");
    await user.clear(points);
    expect(points).toHaveValue("");
    await user.type(points, "006");
    expect(points).toHaveValue("6");
    const preview = screen.getByRole("region", { name: "Xem trước hồ sơ học viên" });
    expect(within(preview).getByText("6 / 500")).toBeVisible();
    await user.clear(points);
    await user.type(points, "99999");
    expect(points).toHaveValue("6000");
    await user.clear(points);
    await user.type(points, "6");

    const badge = screen.getByRole("button", { name: "Thợ chữ" });
    expect(within(preview).queryByText("Thợ chữ")).not.toBeInTheDocument();
    await user.click(badge);
    const card = within(preview).getByText("Thợ chữ").closest("article")!;
    expect(within(card).getByRole("img", { name: "Đã đạt" })).toBeVisible();
    expect(within(preview).getByRole("button", { name: "Xem tất cả huy hiệu" })).toHaveAttribute("aria-expanded", "false");
    await user.click(badge);
    expect(within(card).getByRole("img", { name: "Chưa đạt" })).toBeVisible();
  });

  it("exposes reward promotion previews as dismissible modal dialogs", async () => {
    const user = userEvent.setup();
    renderRewards();
    const trigger = screen.getByRole("button", { name: "Xem lên cấp 2" });
    await user.click(trigger);

    const dialog = screen.getByRole("dialog", { name: "Bạn đã lên cấp Mùa 2" });
    expect(dialog).toHaveAttribute("aria-modal", "true");
    expect(document.body).toHaveClass("app-modal-open");
    expect(dialog).toHaveTextContent("Mô phỏng");
    expect(dialog).toHaveTextContent("Mùa hạ · A1");
    expect(within(dialog).getByRole("heading", { name: "Bạn đã lên cấp Mùa 2" })).toBeVisible();
    expect(within(dialog).getByRole("button", { name: "Đóng hộp thoại" })).toBeVisible();
    expect(dialog).toHaveFocus();
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("dialog", { name: "Bạn đã lên cấp Mùa 2" })).not.toBeInTheDocument();
    expect(document.body).not.toHaveClass("app-modal-open");
    expect(trigger).toHaveFocus();

    await user.click(trigger);
    const backdrop = screen.getByRole("dialog", { name: "Bạn đã lên cấp Mùa 2" }).parentElement!;
    await user.click(backdrop);
    expect(screen.queryByRole("dialog", { name: "Bạn đã lên cấp Mùa 2" })).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
  });

  it("keeps milestone previews beside the learner preview", () => {
    renderRewards();
    const preview = screen.getByRole("region", { name: "Xem trước hồ sơ học viên" });
    const actions = within(preview).getByRole("group", { name: "Xem thông báo lên cấp" });
    expect(within(actions).getByRole("button", { name: "Xem lên cấp 2" })).toBeVisible();
    expect(within(actions).getByRole("button", { name: "Xem lên cấp 3" })).toBeVisible();
    expect(within(preview).getByRole("link", { name: "Xem trước chứng nhận" })).toBeVisible();
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
