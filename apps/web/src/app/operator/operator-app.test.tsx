// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  OperatorDashboard,
  OperatorLessonSet,
  OperatorLessons,
  OperatorLevelForms,
  OperatorPrompts,
  OperatorReview,
  OperatorWeeks
} from "./index.js";
import { adaptAssessmentOverview, adaptLevelForms } from "./adapters.js";
import { OperatorLevelFormDetail } from "./LevelForms.js";

afterEach(cleanup);

describe("Operator app rebuild", () => {
  it("carries completed profile state into the pending assessment card", () => {
    const view = adaptAssessmentOverview({
      pendingAssessments: [{
        attemptId: "attempt-1", learnerId: "learner-1", learnerName: "Media GFT", kind: "placement",
        title: "Bài test đầu vào", submittedAt: "2026-10-21T08:00:00.000Z", sectionScores: {}, suggestedLevel: null,
        profileComplete: true
      }],
      pendingLevelUp: [], approvedLearners: [], unassessedLearners: [], inProgressLearners: [], retryLearners: [],
      levelSignals: { windowDays: 14, ready: [], weak: [], inFlow: [] }, topicReports: []
    }, { aiConnected: false, openAppeals: 0 });

    expect(view.pending[0]?.profileSummary).toBe("Đã điền hồ sơ");
  });

  it("preserves every dashboard block and routes visible actions to callbacks", async () => {
    const user = userEvent.setup();
    const onResolveTopicReport = vi.fn();
    const onApprovePlacement = vi.fn();
    const onChangeLevel = vi.fn();
    render(<OperatorDashboard view={{
      week: { current: 2, total: 5, topic: "Workplace communication" },
      aiConnected: false,
      openAppeals: 2,
      topicReports: [{ id: "r1", learnerName: "Lan", at: "14/10/2026 08:00", inputs: [{ input: "casino", reason: "Chủ đề không phù hợp" }] }],
      pending: [{ id: "u1", name: "Lan", submittedAt: "14/10/2026 07:30", total: 72, rawLevel: "A2", aiSuggestedCefr: "B1", sectionScores: [{ label: "Nghe", percent: 75 }], suggestedLevel: "B1", levels: ["A1", "A2", "B1"], profileSummary: "Tester · QA", monthlyGoal: "Thuyết trình ngắn" }],
      levelRequests: [{ id: "q1", learnerName: "Minh", from: "A2", to: "B1", sentAt: "14/10/2026", testSummary: "80/100", challengeSummary: "4/5" }],
      ready: [{ id: "u2", name: "Hoa", cefr: "A2", metrics: "bài 12 · đúng lần 1 86%" }],
      weak: [{ id: "u3", name: "Nam", cefr: "B1", metrics: "tuần 1: 72% sai" }],
      inFlow: [{ id: "u4", name: "An", cefr: "A2", target: "B1", detail: "đang làm bài thi" }],
      approved: [{ id: "u5", name: "Vy", cefr: "B1", placementScore: 81, monthlyGoal: "Email khách hàng" }],
      inProgress: [{ id: "u7", name: "Mai", profileSummary: "Đã điền hồ sơ" }],
      unassessed: [{ id: "u6", name: "Long", profileSummary: "Chưa điền hồ sơ" }]
    } as any} actions={{
      onResolveTopicReport,
      onApprovePlacement,
      onViewTest: vi.fn(),
      onRescore: vi.fn(),
      onDeleteLearner: vi.fn(),
      onApproveLevelRequest: vi.fn(),
      onRejectLevelRequest: vi.fn(),
      onViewChallenge: vi.fn(),
      onDemote: vi.fn(),
      onChangeLevel,
      onEditGoal: vi.fn(),
      onViewProfile: vi.fn(),
      onSetLevelDirect: vi.fn(),
      onOpenAppeals: vi.fn(),
      onOpenSettings: vi.fn(),
      onOpenWeeks: vi.fn(),
      onOpenLevelForms: vi.fn()
    }} />);

    expect(screen.getByRole("heading", { name: "Duyệt trình độ" })).toBeInTheDocument();
    expect(screen.getByText(/kháng nghị chấm điểm đang chờ duyệt tay/i)).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: /Báo cáo nhập chủ đề mini game/ })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: /Chờ duyệt/ })).toBeInTheDocument();
    const noAiNote = screen.getByText("Không có nhận xét AI. Xem bài làm để quyết định.");
    const profileSummary = screen.getByRole("button", { name: /Hồ sơ: Tester · QA/ });
    expect(noAiNote.closest(".grid.cols-2")).toBeNull();
    expect(profileSummary.compareDocumentPosition(noAiNote) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(screen.getByRole("heading", { name: /Yêu cầu lên mức chờ duyệt/ })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: /Tín hiệu đổi mức/ })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: /Đã duyệt/ })).toBeInTheDocument();
    const inProgressSection = screen.getByRole("heading", { name: /Đang làm test/ }).closest("section");
    expect(inProgressSection).not.toBeNull();
    expect(inProgressSection?.querySelector(".card")).toBeNull();
    expect(screen.getByRole("heading", { name: /Chưa làm test/ })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "A1 – Mới bắt đầu" })).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /Chưa có API key/ })).not.toBeInTheDocument();
    expect(screen.queryByText(/Một số thao tác có thể bị khóa vì chức năng tương ứng/i)).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "ngưỡng" })).toHaveAttribute("href", "/settings");
    expect(screen.getByRole("link", { name: "đề thi lên mức" })).toHaveAttribute("href", "/op/levelforms");
    await user.click(screen.getByRole("button", { name: "Đã xử lý" }));
    expect(onResolveTopicReport).toHaveBeenCalledWith("r1");
    await user.selectOptions(screen.getByLabelText("Mức duyệt cho Lan"), "A2");
    await user.click(screen.getByRole("button", { name: "Duyệt mức" }));
    expect(onApprovePlacement).toHaveBeenCalledWith("u1", "A2");
    await user.click(within(screen.getByTestId("approved-u5")).getByRole("button", { name: "Đổi level" }));
    expect(onChangeLevel).toHaveBeenCalledWith("u5");
    expect(screen.getByRole("table")).toHaveClass("operator-action-table");
    expect(within(screen.getByTestId("approved-u5")).getByText("Vy").closest("td")).toHaveAttribute("data-label", "Người học");
    expect(within(screen.getByTestId("approved-u5")).getByRole("button", { name: "Đổi level" }).closest("td")).toHaveAttribute("data-label", "Thao tác");
    expect(within(screen.getByTestId("approved-u5")).queryByRole("button", { name: "Xoá" })).not.toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: "Xoá học viên" })).toHaveLength(1);
    expect(screen.queryByRole("button", { name: "Đánh giá thủ công" })).not.toBeInTheDocument();
  });

  it("keeps the complete level-form screen visible but disables mutations in read-only mode", async () => {
    const user = userEvent.setup();
    const onView = vi.fn();
    render(<OperatorLevelForms readOnly view={{ aiConnected: true, generatingTarget: null, targets: [
      { target: "A2", forms: [] },
      { target: "B1", forms: [{ id: "f1", title: "B1 Promotion", status: "draft", short: true, createdAt: "14/10/2026", byName: "AI", listeningQuestions: 5, readingQuestions: 5, attempts: 0 }] },
      { target: "B2", forms: [{ id: "f2", title: "B2 Promotion", status: "approved", createdAt: "14/10/2026", byName: "Thư", listeningQuestions: 5, readingQuestions: 5, attempts: 3 }] }
    ] } as any} actions={{ onBack: vi.fn(), onOpenSettings: vi.fn(), onGenerate: vi.fn(), onView, onApprove: vi.fn(), onDelete: vi.fn() }} />);
    expect(screen.getAllByText("chưa có đề duyệt")).toHaveLength(2);
    expect(screen.getByText("ngắn")).toBeInTheDocument();
    expect(screen.getByText("Đã duyệt")).toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: "Sinh đề bằng AI" })).toHaveLength(3);
    screen.getAllByRole("button", { name: "Sinh đề bằng AI" }).forEach(button => expect(button).toBeDisabled());
    expect(screen.getByRole("button", { name: "Duyệt" })).toBeDisabled();
    expect(screen.getAllByRole("button", { name: "Xoá" })[0]).toBeDisabled();
    await user.click(screen.getAllByRole("button", { name: "Xem" })[0]!);
    expect(onView).toHaveBeenCalledWith("f1");
  });

  it("renders level-form loading, empty, draft, published and unavailable action states", async () => {
    const user = userEvent.setup();
    const onGenerate = vi.fn();
    const onView = vi.fn();
    const onApprove = vi.fn();
    const onDelete = vi.fn();
    const actions = { onBack: vi.fn(), onOpenSettings: vi.fn(), onGenerate, onView, onApprove, onDelete };

    render(<OperatorLevelForms view={{ aiConnected: true, generatingTarget: null, targets: [], loading: true } as any} actions={actions} />);
    expect(screen.getByRole("status", { name: /đang tải đề thi lên mức/i })).toBeInTheDocument();

    cleanup();
    render(<OperatorLevelForms view={{ aiConnected: true, generatingTarget: null, targets: [] } as any} actions={actions} />);
    expect(screen.getByRole("status", { name: /chưa có mức đích/i })).toBeInTheDocument();

    cleanup();
    render(<OperatorLevelForms view={{ aiConnected: true, generatingTarget: "B1", generateState: "loading", targets: [
      { target: "A2", forms: [] },
      { target: "B1", forms: [{ id: "draft-1", title: "Bản nháp B1", status: "draft", createdAt: "14/10/2026", byName: "AI", listeningQuestions: 5, readingQuestions: 5, attempts: 0 }] },
      { target: "B2", forms: [{ id: "published-1", title: "Đề B2", status: "approved", createdAt: "14/10/2026", byName: "Operator", listeningQuestions: 5, readingQuestions: 5, attempts: 0, inUse: true }] }
    ] } as any} actions={actions} unavailable={{ view: "Không có endpoint xem", delete: "Không có endpoint xoá" }} />);

    expect(screen.getByText("Bản nháp")).toBeInTheDocument();
    expect(screen.getByText("Đã duyệt")).toBeInTheDocument();
    expect(screen.getByText("đang dùng")).toBeInTheDocument();
    expect(screen.getByText("Chưa có đề.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Đang sinh…" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Duyệt" })).toBeDisabled();
    expect(screen.getAllByRole("button", { name: "Xem" })).toHaveLength(2);
    expect(screen.getAllByRole("button", { name: "Xem" })[0]).not.toHaveAttribute("title");
    expect(screen.getAllByRole("button", { name: "Xoá" })[0]).toBeDisabled();
    expect(screen.getAllByRole("button", { name: "Xoá" })[0]).not.toHaveAttribute("title");

    cleanup();
    render(<OperatorLevelForms readOnly view={{ aiConnected: true, generatingTarget: null, targets: [{ target: "A2", forms: [{ id: "draft-2", title: "Bản nháp A2", status: "draft", createdAt: "14/10/2026", byName: "AI", listeningQuestions: 5, readingQuestions: 5, attempts: 0 }] }] } as any} actions={actions} />);
    expect(screen.getByText(/màn hình đang ở chế độ chỉ đọc/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Duyệt" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Xoá" })).toBeDisabled();
    await user.click(screen.getByRole("button", { name: "Xem" }));
    expect(onView).toHaveBeenCalledWith("draft-2");
    expect(onGenerate).not.toHaveBeenCalled();
    expect(onApprove).not.toHaveBeenCalled();
    expect(onDelete).not.toHaveBeenCalled();
  });

  it("keeps persisted level-form timestamps compact like the app", () => {
    const view = adaptLevelForms([{
      targetLevel: "B1",
      publishedForm: {
        versionId: "published-1",
        title: "Đề thi lên mức B1",
        version: 1,
        status: "published",
        publishedAt: "2026-10-13T10:59:45.548Z",
        listeningTaskCount: 5,
        readingTaskCount: 5,
        attemptCount: 0
      },
      draftForm: null
    }] as any, { aiConnected: true });

    render(<OperatorLevelForms view={view} actions={{ onBack: vi.fn(), onOpenSettings: vi.fn(), onGenerate: vi.fn(), onView: vi.fn(), onApprove: vi.fn(), onDelete: vi.fn() }} />);

    expect(screen.getByText(/13\/10 \d{2}:\d{2} · Đã phát hành · 5 câu nghe/)).toBeInTheDocument();
    expect(screen.queryByText(/2026-10-13T10:59:45\.548Z/)).not.toBeInTheDocument();
  });

  it("preserves week suggestions, five-day plans and confirm/reopen behavior", async () => {
    const user = userEvent.setup();
    const onConfirmSuggestion = vi.fn();
    const onReopenSuggestion = vi.fn();
    render(<OperatorWeeks view={{ pilotStartDate: "05/10/2026", pilotWeeks: 1, aiConnected: true, status: "", weeks: [{
      number: 1, dateRange: "05/10/2026 – 11/10/2026", current: true, topic: "", description: "", objectives: "", keyVocabHint: "",
      suggestion: { state: "options", levels: ["A2"], options: [{ topic: "Meetings", description: "Lịch họp", keyVocabHint: "schedule", objectives: "Xác nhận lịch", plan: { A2: ["Mon", "Tue", "Wed", "Thu", "Fri"] } }] }
    }] } as any} actions={{ onSuggestAll: vi.fn(), onSuggestWeek: vi.fn(), onCloseSuggestion: vi.fn(), onConfirmSuggestion, onReopenSuggestion, onChangeWeek: vi.fn(), onSave: vi.fn(), onOpenLessons: vi.fn() }} />);
    expect(screen.getByText(/kế hoạch 5 ngày T2–T6 cho từng mức/)).toBeInTheDocument();
    ["T2", "T3", "T4", "T5", "T6"].forEach(day => expect(screen.getByRole("columnheader", { name: day })).toBeInTheDocument());
    expect(screen.getByRole("button", { name: "Xác nhận phương án này" }).closest(".operator-card-header")).not.toBeNull();
    await user.click(screen.getByRole("button", { name: "Xác nhận phương án này" }));
    expect(onConfirmSuggestion).toHaveBeenCalledWith(1, 0);

    cleanup();
    render(<OperatorWeeks view={{ pilotStartDate: "05/10/2026", pilotWeeks: 1, aiConnected: true, status: "", weeks: [{ number: 1, dateRange: "05/10/2026 – 11/10/2026", current: true, topic: "Meetings", description: "", objectives: "", keyVocabHint: "", suggestion: { state: "confirmed", topic: "Meetings" } }] } as any} actions={{ onSuggestAll: vi.fn(), onSuggestWeek: vi.fn(), onCloseSuggestion: vi.fn(), onConfirmSuggestion: vi.fn(), onReopenSuggestion, onChangeWeek: vi.fn(), onSave: vi.fn(), onOpenLessons: vi.fn() }} />);
    expect(screen.queryByText(/Đã xác nhận và lưu chủ đề/)).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Xem lại các phương án" })).not.toBeInTheDocument();
  });

  it("keeps the topic guidance explicit and makes saving visibly primary", () => {
    render(<OperatorWeeks view={{ pilotStartDate: "12/10/2026", pilotWeeks: 2, aiConnected: true, status: "", weeks: [{ number: 1, dateRange: "12/10/2026 – 18/10/2026", current: true, topic: "Meetings", description: "", objectives: "", keyVocabHint: "" }] } as any} actions={{ onSuggestAll: vi.fn(), onSuggestWeek: vi.fn(), onCloseSuggestion: vi.fn(), onConfirmSuggestion: vi.fn(), onReopenSuggestion: vi.fn(), onChangeWeek: vi.fn(), onSave: vi.fn(), onOpenLessons: vi.fn() }} />);
    expect(screen.getByRole("note")).toHaveTextContent(/3 phương án/);
    expect(screen.getByRole("note")).toHaveTextContent(/kế hoạch 5 ngày T2–T6 cho từng mức/);
    expect(screen.getByRole("button", { name: "Lưu khung chủ đề" })).toHaveClass("btn-primary");
  });

  it("does not render a generic unavailable-actions banner on the level review screen", () => {
    render(<OperatorDashboard unavailable={{ viewTest: "Không có endpoint" }} view={{
      week: { current: 1, total: 2, topic: "Introducing yourself & your job" }, aiConnected: false, openAppeals: 0, topicReports: [],
      pending: [], levelRequests: [], ready: [], weak: [], inFlow: [], approved: [], inProgress: [], retry: [], unassessed: [], windowDays: 14
    } as any} actions={{} as any} />);
    expect(screen.queryByText("Một số thao tác hiện chưa khả dụng.")).not.toBeInTheDocument();
  });

  it("renders matrix states and the complete lesson-set review workflow", async () => {
    const user = userEvent.setup();
    const onOpenSet = vi.fn();
    render(<OperatorLessons view={{ aiConnected: false, extraLevels: ["B1"], levels: [{ cefr: "A2", learnerCount: 2 }], weeks: [{ number: 1, topic: "Meetings", cells: [{ cefr: "A2", status: "draft", generatedAt: "14/10/2026", incomplete: true, lessons: 4, days: [{ day: "T2", title: "Opening" }, { day: "T3", title: "—" }, { day: "T4", title: "—" }, { day: "T5", title: "—" }, { day: "T6", title: "—" }] }] }] } as any} actions={{ onOpenSettings: vi.fn(), onAddLevel: vi.fn(), onGenerate: vi.fn(), onCreateManual: vi.fn(), onOpenSet }} />);
    expect(screen.getByText(/Chưa có API key nên không sinh bài được/)).toBeInTheDocument();
    expect(screen.getByText("chưa đủ 4 kỹ năng")).toBeInTheDocument();
    expect(screen.getByRole("table")).toHaveClass("operator-lesson-matrix");
    expect(screen.getByRole("table").parentElement).toHaveClass("table-wrap");
    expect(screen.getByText("chưa đủ 4 kỹ năng").closest("td")).toHaveAttribute("data-label", "A2 · 2 học viên");
    await user.click(screen.getByRole("button", { name: "Xem / duyệt" }));
    expect(onOpenSet).toHaveBeenCalledWith(1, "A2");

    cleanup();
    const onApprove = vi.fn();
    render(<OperatorLessonSet view={{ week: 1, cefr: "A2", status: "draft", topic: "Meetings", explanationLanguage: "tiếng Việt", aiConnected: true, warnings: { incomplete: 1, level: ["T2: vượt mức"], phrases: 1, details: 1 }, lessons: [{ id: "l1", day: 1, dayLabel: "T2", title: "Opening a meeting", durationMin: 10, practiceKind: "điền từ", practiceAnswer: "start", manual: true, complete: false, intro: "Mở đầu cuộc họp", content: <p>Nội dung thật từ API</p> }] } as any} actions={{ onBack: vi.fn(), onApprove, onUnapprove: vi.fn(), onRegenerate: vi.fn(), onDeleteSet: vi.fn(), onFillPhrases: vi.fn(), onEnrich: vi.fn(), onEditLesson: vi.fn(), onDeleteLesson: vi.fn(), onComposeDay: vi.fn() }} />);
    expect(screen.getByText(/Checklist duyệt/)).toBeInTheDocument();
    expect(screen.getByText(/thiếu thành phần bắt buộc/)).toBeInTheDocument();
    expect(screen.getByText(/chưa đủ 3 cụm từ/)).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: /Soạn bài trực tiếp/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Duyệt bộ bài" }).parentElement).toHaveClass("operator-page-title-actions");
    expect(screen.getByRole("heading", { name: /Opening a meeting/ }).closest(".operator-card-header")).not.toBeNull();
    await user.click(screen.getByRole("button", { name: "Duyệt bộ bài" }));
    expect(onApprove).toHaveBeenCalledTimes(1);
  });

  it("keeps the add-level control in a dedicated page-title action group", () => {
    render(<OperatorLessons view={{ aiConnected: true, extraLevels: ["B1"], levels: [], weeks: [] } as any} actions={{ onOpenSettings: vi.fn(), onAddLevel: vi.fn(), onGenerate: vi.fn(), onCreateManual: vi.fn(), onOpenSet: vi.fn() }} />);

    expect(screen.getByLabelText("Mức cần thêm").parentElement).toHaveClass("operator-page-title-actions");
  });

  it("uses links for AI setup shortcuts in unavailable states", async () => {
    const user = userEvent.setup();
    const onOpenSettings = vi.fn();
    render(<OperatorLessons view={{ aiConnected: false, extraLevels: [], levels: [], weeks: [] } as any} actions={{ onOpenSettings, onAddLevel: vi.fn(), onGenerate: vi.fn(), onCreateManual: vi.fn(), onOpenSet: vi.fn() }} />);
    const lessonsSettings = screen.getByRole("link", { name: "Cài đặt" });
    expect(lessonsSettings).toHaveAttribute("href", "/settings");
    await user.click(lessonsSettings);
    expect(onOpenSettings).toHaveBeenCalledTimes(1);

    cleanup();
    render(<OperatorLevelForms view={{ aiConnected: false, generatingTarget: null, targets: [] } as any} actions={{ onBack: vi.fn(), onOpenSettings, onGenerate: vi.fn(), onView: vi.fn(), onApprove: vi.fn(), onDelete: vi.fn() }} />);
    const formsSettings = screen.getByRole("link", { name: /Chưa có API key/ });
    expect(formsSettings).toHaveAttribute("href", "/settings");
    await user.click(formsSettings);
    expect(onOpenSettings).toHaveBeenCalledTimes(2);
  });

  it("shows an actionable no-AI fallback on level-form generation", async () => {
    const user = userEvent.setup();
    const onOpenSettings = vi.fn();
    render(<OperatorLevelForms view={{ aiConnected: false, generatingTarget: null, targets: [{ target: "B1", forms: [] }] } as any} actions={{ onBack: vi.fn(), onOpenSettings, onGenerate: vi.fn(), onView: vi.fn(), onApprove: vi.fn(), onDelete: vi.fn() }} />);

    expect(screen.getByRole("note")).toHaveTextContent("AI chưa kết nối");
    const settingsLink = screen.getByRole("link", { name: "Mở Cài đặt AI" });
    expect(settingsLink).toHaveAttribute("href", "/settings");
    await user.click(settingsLink);
    expect(onOpenSettings).toHaveBeenCalledTimes(1);
  });

  it("keeps all six review tabs and all seven prompt editors wired", async () => {
    const user = userEvent.setup();
    const onTabChange = vi.fn();
    render(<OperatorReview view={{ activeTab: "subs", counts: { subs: 1, coach: 2, micro: 3, appeals: 1, attempts: 0, tests: 4 }, submissions: [], coachTurns: [], microLessons: [], appeals: [], attempts: [], tests: [] } as any} actions={{ onTabChange, onMarkSubmission: vi.fn(), onMarkCoachTurn: vi.fn(), onDeleteMicroLesson: vi.fn(), onGradeAi: vi.fn(), onGradeManual: vi.fn(), onDecideAppeal: vi.fn(), onViewTest: vi.fn() }} />);
    expect(screen.getByText("Kiểm tra bài nộp thứ Sáu, phản hồi của AI coach và các bài test.")).toBeInTheDocument();
    expect(screen.getAllByRole("tab")).toHaveLength(6);
    expect(screen.getByRole("tab", { name: "Số lần làm bài" })).toBeInTheDocument();
    expect(screen.queryByRole("tab", { name: "Số lần làm bài (0)" })).not.toBeInTheDocument();
    await user.click(screen.getByRole("tab", { name: /Kháng nghị/ }));
    expect(onTabChange).toHaveBeenCalledWith("appeals");

    cleanup();
    const onReset = vi.fn();
    const onSave = vi.fn();
    render(<OperatorPrompts view={{ prompts: [
      ["base", "Quy tắc chung (mọi lời gọi trừ sinh bài siêu ngắn)", "base"],
      ["placement", "Chấm test & xếp trình độ", "placement"],
      ["lesson", "Sinh 5 bài siêu ngắn cho tuần", "lesson"],
      ["weeks", "Gợi ý khung chủ đề tuần", "weeks"],
      ["mgrade", "Chấm bài thực hành siêu ngắn", "mgrade"],
      ["coach", "AI coach hội thoại", "coach"],
      ["grade", "Chấm bài thực hành thứ Sáu", "grade"]
    ] } as any} actions={{ onBack: vi.fn(), onReset, onSave }} />);
    expect(screen.getAllByRole("textbox")).toHaveLength(7);
    await user.click(screen.getAllByRole("button", { name: "Về mặc định" })[0]!);
    expect(onReset).toHaveBeenCalledWith("base");
    await user.click(screen.getByRole("button", { name: "Lưu prompt" }));
    expect(onSave).toHaveBeenCalledWith(expect.objectContaining({ base: "base", grade: "grade" }));
  });

  it("keeps review test actions discoverable in the responsive action table", () => {
    render(<OperatorReview view={{ activeTab: "tests", counts: { subs: 0, coach: 0, micro: 0, appeals: 0, attempts: 0, tests: 1 }, submissions: [], coachTurns: [], microLessons: [], appeals: [], attempts: [], tests: [{ id: "test-1", learnerName: "Lan", kind: "placement", submittedAt: "15/10/2026", total: 78, rawLevel: "B1", aiSuggestedCefr: "B1" }] } as any} actions={{ onTabChange: vi.fn(), onMarkSubmission: vi.fn(), onMarkCoachTurn: vi.fn(), onDeleteMicroLesson: vi.fn(), onGradeAi: vi.fn(), onGradeManual: vi.fn(), onDecideAppeal: vi.fn(), onViewTest: vi.fn() }} />);

    expect(screen.getByRole("table")).toHaveClass("operator-action-table");
    expect(screen.getByRole("button", { name: "Xem" }).closest("td")).toHaveAttribute("data-label", "Thao tác");
  });

  it("moves focus into level-form details and supports Escape", async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    render(<OperatorLevelFormDetail detail={{
      definitionId: "definition-1", versionId: "version-1", title: "Đề B1", version: 1, publishedAt: null,
      listeningTaskCount: 5, readingTaskCount: 5, attemptCount: 0, status: "draft", targetLevel: "B1",
      sections: [], warnings: [], versions: [], deletable: true, deleteReason: null
    }} onClose={onClose} />);

    expect(screen.getByRole("button", { name: "Đóng" })).toHaveClass("btn-sm");
    expect(screen.getByRole("button", { name: "Đóng" })).toHaveFocus();
    await user.keyboard("{Escape}");
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("uses semantic app back links while preserving callback navigation", async () => {
    const user = userEvent.setup();
    const onBack = vi.fn();
    render(<OperatorPrompts view={{ prompts: [["base", "Quy tắc chung", "base"]] } as any} actions={{ onBack, onReset: vi.fn(), onSave: vi.fn() }} />);
    const promptBack = screen.getByRole("link", { name: "← Cài đặt" });
    expect(promptBack).toHaveAttribute("href", "/settings");
    await user.click(promptBack);
    expect(onBack).toHaveBeenCalledTimes(1);

    cleanup();
    render(<OperatorLevelForms view={{ aiConnected: true, generatingTarget: null, targets: [] } as any} actions={{ onBack, onOpenSettings: vi.fn(), onGenerate: vi.fn(), onView: vi.fn(), onApprove: vi.fn(), onDelete: vi.fn() }} />);
    const levelFormsBack = screen.getByRole("link", { name: "← Duyệt trình độ" });
    expect(levelFormsBack).toHaveAttribute("href", "/op");
    await user.click(levelFormsBack);
    expect(onBack).toHaveBeenCalledTimes(2);

    cleanup();
    render(<OperatorLessonSet view={{ week: 1, cefr: "A2", status: "draft", topic: "Meetings", explanationLanguage: "tiếng Việt", aiConnected: true, warnings: { incomplete: 0, level: [], phrases: 0, details: 0 }, lessons: [] } as any} actions={{ onBack, onApprove: vi.fn(), onUnapprove: vi.fn(), onRegenerate: vi.fn(), onDeleteSet: vi.fn(), onFillPhrases: vi.fn(), onEnrich: vi.fn(), onEditLesson: vi.fn(), onDeleteLesson: vi.fn(), onComposeDay: vi.fn() }} />);
    const lessonSetBack = screen.getByRole("link", { name: "← Ma trận bài học" });
    expect(lessonSetBack).toHaveAttribute("href", "/op/lessons");
    await user.click(lessonSetBack);
    expect(onBack).toHaveBeenCalledTimes(3);
  });

  it("keeps app controls visible and disabled across read-only operator screens", () => {
    render(<OperatorWeeks readOnly view={{ pilotStartDate: "05/10", pilotWeeks: 1, aiConnected: true, status: "", weeks: [{ number: 1, dateRange: "05/10 – 11/10", current: true, topic: "Meetings", description: "", objectives: "", keyVocabHint: "" }] } as any} actions={{ onSuggestAll: vi.fn(), onSuggestWeek: vi.fn(), onCloseSuggestion: vi.fn(), onConfirmSuggestion: vi.fn(), onReopenSuggestion: vi.fn(), onChangeWeek: vi.fn(), onSave: vi.fn(), onOpenLessons: vi.fn() }} />);
    expect(screen.getByRole("button", { name: "Gợi ý các tuần còn trống" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Gợi ý" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Lưu khung chủ đề" })).toBeDisabled();
    cleanup();

    render(<OperatorPrompts readOnly view={{ prompts: [["base", "Quy tắc chung", "base"]] } as any} actions={{ onBack: vi.fn(), onReset: vi.fn(), onSave: vi.fn() }} />);
    expect(screen.getByRole("button", { name: "Về mặc định" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Lưu prompt" })).toBeDisabled();
  });

  it("keeps week suggestion decisions visible but disabled in read-only mode", () => {
    render(<OperatorWeeks readOnly view={{ pilotWeeks: 2, pilotStartDate: "05/10", aiConnected: true, weeks: [{ number: 1, dateRange: "05/10 – 11/10", current: true, topic: "Meetings", description: "", objectives: "", keyVocabHint: "", suggestion: { state: "options", levels: ["A2"], options: [{ topic: "Meetings", description: "Daily meetings", objectives: "", keyVocabHint: "agenda", plan: { A2: ["T2", "T3", "T4", "T5", "T6"] } }] } }] } as any} actions={{ onChangeWeek: vi.fn(), onSuggestAll: vi.fn(), onSuggestWeek: vi.fn(), onCloseSuggestion: vi.fn(), onConfirmSuggestion: vi.fn(), onReopenSuggestion: vi.fn(), onSave: vi.fn(), onOpenLessons: vi.fn() }} />);
    expect(screen.getByRole("button", { name: "Bỏ gợi ý" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Xác nhận phương án này" })).toBeDisabled();
  });

  it("marks operator card headers for wrap-safe title and control spacing", () => {
    render(<OperatorWeeks view={{ pilotStartDate: "05/10", pilotWeeks: 1, aiConnected: true, status: "", weeks: [{ number: 1, dateRange: "05/10 – 11/10", current: true, topic: "Meetings", description: "", objectives: "", keyVocabHint: "" }] } as any} actions={{ onSuggestAll: vi.fn(), onSuggestWeek: vi.fn(), onCloseSuggestion: vi.fn(), onConfirmSuggestion: vi.fn(), onReopenSuggestion: vi.fn(), onChangeWeek: vi.fn(), onSave: vi.fn(), onOpenLessons: vi.fn() }} />);
    expect(screen.getByRole("heading", { name: /Tuần 1/ }).closest(".operator-card-header")).not.toBeNull();
  });
});
