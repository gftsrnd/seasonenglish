// @vitest-environment jsdom
import { ApiError } from "../../api/runtime.js";
import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  OperatorDashboard,
  OperatorLevelForms,
  OperatorReview
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

  it("collapses pending learners by name until their review is opened", async () => {
    const user = userEvent.setup();
    render(<OperatorDashboard view={{
      week: {}, aiConnected: true, openAppeals: 0, levelRequests: [], ready: [], weak: [], inFlow: [], approved: [], inProgress: [], retry: [], unassessed: [],
      pending: [
        { id: "u1", name: "Lan", submittedAt: "14/10/2026", total: 72, rawLevel: "A2", aiScored: true, humanScored: false, sectionScores: [{ label: "Nghe", percent: 75 }], suggestedLevel: "A2", levels: ["A1", "A2"] },
        { id: "u2", name: "Minh", submittedAt: "14/10/2026", total: null, rawLevel: null, aiScored: false, humanScored: false, sectionScores: [], suggestedLevel: null, levels: ["A1", "A2"] }
      ]
    } as any} actions={{ onApprovePlacement: vi.fn(), onViewTest: vi.fn(), onRescore: vi.fn(), onDeleteLearner: vi.fn(), onApproveLevelRequest: vi.fn(), onRejectLevelRequest: vi.fn(), onViewChallenge: vi.fn(), onDemote: vi.fn(), onChangeLevel: vi.fn(), onEditGoal: vi.fn(), onViewProfile: vi.fn(), onSetLevelDirect: vi.fn(), onOpenAppeals: vi.fn(), onOpenSettings: vi.fn(), onOpenWeeks: vi.fn(), onOpenLevelForms: vi.fn() }} />);

    const lan = screen.getByRole("group", { name: /Lan/ });
    const minh = screen.getByRole("group", { name: /Minh/ });
    expect(lan).not.toHaveAttribute("open");
    expect(minh).not.toHaveAttribute("open");

    await user.click(within(lan).getByText("Lan"));
    expect(lan).toHaveAttribute("open");
    expect(minh).not.toHaveAttribute("open");
    expect(within(lan).getByText("75%")).toBeInTheDocument();
    expect(within(lan).getByRole("button", { name: "Duyệt mức" })).toBeInTheDocument();
  });

  it("preserves every dashboard block and routes visible actions to callbacks", async () => {
    const user = userEvent.setup();
    const onApprovePlacement = vi.fn();
    const onChangeLevel = vi.fn();
    render(<OperatorDashboard view={{
      week: { current: 2, total: 5, topic: "Workplace communication" },
      aiConnected: false,
      openAppeals: 2,
      topicReports: [{ id: "r1", learnerName: "Lan", at: "14/10/2026 08:00", inputs: [{ input: "casino", reason: "Chủ đề không phù hợp" }] }],
      pending: [{ id: "u1", kind: "placement", name: "Lan", submittedAt: "14/10/2026 07:30", total: 72, rawLevel: "A2", aiSuggestedCefr: "B1", aiScored: true, humanScored: true, sectionScores: [{ label: "Nghe", percent: 75 }], suggestedLevel: "B1", levels: ["A1", "A2", "B1"], profileSummary: "Tester · QA", monthlyGoal: "Thuyết trình ngắn" }],
      levelRequests: [{ id: "q1", learnerName: "Minh", from: "A2", to: "B1", sentAt: "14/10/2026", testSummary: "80/100", challengeSummary: "4/5" }],
      ready: [{ id: "u2", name: "Hoa", cefr: "A2", metrics: "bài 12 · đúng lần 1 86%" }],
      weak: [{ id: "u3", name: "Nam", cefr: "B1", metrics: "tuần 1: 72% sai" }],
      inFlow: [{ id: "u4", name: "An", cefr: "A2", target: "B1", detail: "đang làm bài thi" }],
      approved: [{ id: "u5", name: "Vy", cefr: "B1", placementScore: 81, monthlyGoal: "Email khách hàng" }],
      inProgress: [{ id: "u7", name: "Mai", profileSummary: "Đã điền hồ sơ" }],
      unassessed: [{ id: "u6", name: "Long", profileSummary: "Chưa điền hồ sơ" }]
    } as any} actions={{
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
    expect(screen.getByText("AI chấm")).toBeInTheDocument();
    expect(screen.getByText("Đã chấm tay")).toBeInTheDocument();
    expect(screen.queryByText(/kháng nghị chấm điểm đang chờ duyệt tay/i)).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Mở tab Kháng nghị" })).not.toBeInTheDocument();
    // Mini game topic reports live in the notification bell only.
    expect(screen.queryByRole("heading", { name: /Báo cáo nhập chủ đề mini game/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Đã xử lý" })).not.toBeInTheDocument();
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
    expect(inProgressSection?.querySelector(".operator-bounded-list")).not.toBeNull();
    const unassessedSection = screen.getByRole("heading", { name: /Chưa làm test/ }).closest("section");
    expect(unassessedSection?.querySelector(".operator-bounded-list")).not.toBeNull();
    expect(screen.getByRole("option", { name: "A1 – Mới bắt đầu" })).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /Chưa có API key/ })).not.toBeInTheDocument();
    expect(screen.queryByText(/Một số thao tác có thể bị khóa vì chức năng tương ứng/i)).not.toBeInTheDocument();
    // The retired "Ngưỡng xét lên / hạ mức" Settings card is gone, so the header no longer links to it.
    expect(screen.queryByRole("link", { name: "ngưỡng" })).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "đề thi lên mức" })).toHaveAttribute("href", "/op/levelforms");
    await user.selectOptions(screen.getByLabelText("Mức duyệt cho Lan"), "A2");
    await user.click(screen.getByRole("button", { name: "Duyệt mức" }));
    expect(onApprovePlacement).toHaveBeenCalledWith("u1", "A2");
    await user.click(within(screen.getByTestId("approved-u5")).getByRole("button", { name: "Đổi level" }));
    expect(onChangeLevel).toHaveBeenCalledWith("u5");
    // Weekly practice assignment ("Giao bài tuần") was removed with the weekly content flow.
    expect(within(screen.getByTestId("approved-u5")).queryByRole("button", { name: "Giao bài tuần" })).not.toBeInTheDocument();
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
    ] } as any} actions={{ onBack: vi.fn(), onOpenSettings: vi.fn(), onGenerate: vi.fn(), onView, onEdit: vi.fn(), onDelete: vi.fn() }} />);
    expect(screen.getByText(/Chưa có bản nháp/)).toBeInTheDocument();
    expect(screen.getByText("ngắn")).toBeInTheDocument();
    expect(screen.getAllByText("Đã duyệt").length).toBeGreaterThan(0);
    expect(screen.getAllByRole("button", { name: "Sinh đề bằng AI" })).toHaveLength(1);
    screen.getAllByRole("button", { name: "Sinh đề bằng AI" }).forEach(button => expect(button).toBeDisabled());
    expect(screen.queryByRole("button", { name: "Duyệt & phát hành" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Sửa đề" })).toBeDisabled();
    expect(screen.getAllByRole("button", { name: "Xoá" })[0]).toBeDisabled();
    await user.click(screen.getAllByRole("button", { name: "Xem" })[0]!);
    expect(onView).toHaveBeenCalledWith("f1");
  });

  it("does not repeat the bold level-form title when the screen is embedded in Bài kiểm tra", () => {
    render(<OperatorLevelForms embedded view={{ aiConnected: true, generatingTarget: null, targets: [{ target: "B1", forms: [] }] } as any} actions={{ onBack: vi.fn(), onOpenSettings: vi.fn(), onGenerate: vi.fn(), onView: vi.fn(), onDelete: vi.fn() }} />);

    expect(screen.queryByRole("heading", { name: "Đề thi lên mức" })).not.toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Mức đích B1" })).toBeInTheDocument();
  });

  it("opens a real manual-authoring action for an empty target level", async () => {
    const user = userEvent.setup();
    const onCreateManual = vi.fn();
    render(<OperatorLevelForms embedded view={{ aiConnected: true, generatingTarget: null, targets: [{ target: "A2", forms: [] }] } as any} actions={{ onBack: vi.fn(), onOpenSettings: vi.fn(), onGenerate: vi.fn(), onCreateManual, onView: vi.fn(), onDelete: vi.fn() }} />);

    expect(screen.getByText(/4 kỹ năng, 75 phút, 100 điểm/)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Soạn tay" }));
    expect(onCreateManual).toHaveBeenCalledWith("A2");
  });

  it("lets Operator edit a draft before approving and publishing it", async () => {
    const user = userEvent.setup();
    const onEdit = vi.fn();
    render(<OperatorLevelForms view={{ aiConnected: true, generatingTarget: null, targets: [{ target: "B1", forms: [{ id: "draft-1", title: "Đề B1", status: "draft", createdAt: "14/10/2026", byName: "Operator", listeningQuestions: 5, readingQuestions: 5, attempts: 0 }] }] } as any} actions={{ onBack: vi.fn(), onOpenSettings: vi.fn(), onGenerate: vi.fn(), onView: vi.fn(), onEdit, onDelete: vi.fn() }} />);

    await user.click(screen.getByRole("button", { name: "Sửa đề" }));
    expect(onEdit).toHaveBeenCalledWith("draft-1", false);
    expect(screen.queryByRole("button", { name: "Duyệt & phát hành" })).not.toBeInTheDocument();
  });

  it("offers an editable successor for a published level form", async () => {
    const user = userEvent.setup();
    const onEdit = vi.fn();
    render(<OperatorLevelForms view={{ aiConnected: true, generatingTarget: null, targets: [{ target: "B1", forms: [{ id: "published-1", title: "Đề B1", status: "approved", createdAt: "14/10/2026", byName: "Operator", listeningQuestions: 5, readingQuestions: 5, attempts: 2 }] }] } as any} actions={{ onBack: vi.fn(), onOpenSettings: vi.fn(), onGenerate: vi.fn(), onView: vi.fn(), onEdit, onDelete: vi.fn() }} />);

    await user.click(screen.getByRole("button", { name: "Chỉnh sửa" }));
    expect(onEdit).toHaveBeenCalledWith("published-1", true);
  });

  it("renders level-form loading, empty, draft, published and unavailable action states", async () => {
    const user = userEvent.setup();
    const onGenerate = vi.fn();
    const onView = vi.fn();
    const onDelete = vi.fn();
    const actions = { onBack: vi.fn(), onOpenSettings: vi.fn(), onGenerate, onView, onDelete };

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
    expect(screen.getAllByText("Đã duyệt").length).toBeGreaterThan(0);
    expect(screen.getByText("đang dùng")).toBeInTheDocument();
    expect(screen.getByText(/Chưa có bản nháp/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Đang sinh…" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Duyệt & phát hành" })).not.toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: "Xem" })).toHaveLength(2);
    expect(screen.getAllByRole("button", { name: "Xem" })[0]).not.toHaveAttribute("title");
    expect(screen.getAllByRole("button", { name: "Xoá" })[0]).toBeDisabled();
    expect(screen.getAllByRole("button", { name: "Xoá" })[0]).not.toHaveAttribute("title");

    cleanup();
    render(<OperatorLevelForms readOnly view={{ aiConnected: true, generatingTarget: null, targets: [{ target: "A2", forms: [{ id: "draft-2", title: "Bản nháp A2", status: "draft", createdAt: "14/10/2026", byName: "AI", listeningQuestions: 5, readingQuestions: 5, attempts: 0 }] }] } as any} actions={actions} />);
    expect(screen.queryByText(/màn hình đang ở chế độ chỉ đọc/i)).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Duyệt & phát hành" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Xoá" })).toBeDisabled();
    await user.click(screen.getByRole("button", { name: "Xem" }));
    expect(onView).toHaveBeenCalledWith("draft-2");
    expect(onGenerate).not.toHaveBeenCalled();
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

    render(<OperatorLevelForms view={view} actions={{ onBack: vi.fn(), onOpenSettings: vi.fn(), onGenerate: vi.fn(), onView: vi.fn(), onDelete: vi.fn() }} />);

    expect(screen.getByText(/13\/10 \d{2}:\d{2} · Đã phát hành · 5 câu nghe/)).toBeInTheDocument();
    expect(screen.queryByText(/2026-10-13T10:59:45\.548Z/)).not.toBeInTheDocument();
  });

  it("shows only one active promotion form per level and prefers the editable draft", () => {
    const view = adaptLevelForms([{
      targetLevel: "B1",
      publishedForm: { versionId: "published-1", title: "Đề thi lên mức B1", version: 1, status: "published", publishedAt: "2026-10-13T10:59:45.548Z", listeningTaskCount: 5, readingTaskCount: 5, attemptCount: 2 },
      draftForm: { versionId: "draft-2", title: "Đề thi lên mức B1", version: 2, status: "draft", publishedAt: null, listeningTaskCount: 5, readingTaskCount: 5, attemptCount: 0 }
    }] as any, { aiConnected: true });

    expect(view.targets[0]?.forms).toHaveLength(1);
    expect(view.targets[0]?.forms[0]?.id).toBe("draft-2");
  });

  it("shows publication blockers on the draft card", () => {
    render(<OperatorLevelForms view={{ aiConnected: true, generatingTarget: null, targets: [{ target: "A2", forms: [{ id: "draft-a2", title: "Đề A2", status: "draft", createdAt: "v1", byName: "Bản nháp", listeningQuestions: 20, readingQuestions: 40, attempts: 0, publicationReady: false, publicationBlockerCount: 7 }] }] }} actions={{ onBack: vi.fn(), onOpenSettings: vi.fn(), onGenerate: vi.fn(), onView: vi.fn(), onDelete: vi.fn() }} />);

    expect(screen.getByText("Chờ hoàn thiện 7 mục trước khi phát hành.")).toBeInTheDocument();
  });



  it("does not render a generic unavailable-actions banner on the level review screen", () => {
    render(<OperatorDashboard unavailable={{ viewTest: "Không có endpoint" }} view={{
      week: { current: 1, total: 2, topic: "Introducing yourself & your job" }, aiConnected: false, openAppeals: 0, topicReports: [],
      pending: [], levelRequests: [], ready: [], weak: [], inFlow: [], approved: [], inProgress: [], retry: [], unassessed: [], windowDays: 14
    } as any} actions={{} as any} />);
    expect(screen.queryByText("Một số thao tác hiện chưa khả dụng.")).not.toBeInTheDocument();
  });







  it("shows a server-owned AI fallback on level-form generation", () => {
    const onOpenSettings = vi.fn();
    render(<OperatorLevelForms view={{ aiConnected: false, generatingTarget: null, targets: [{ target: "B1", forms: [] }] } as any} actions={{ onBack: vi.fn(), onOpenSettings, onGenerate: vi.fn(), onView: vi.fn(), onDelete: vi.fn() }} />);

    expect(screen.getByRole("note")).toHaveTextContent("AI hệ thống tạm chưa sẵn sàng");
    expect(screen.queryByText(/API key/i)).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /Cài đặt/i })).not.toBeInTheDocument();
    expect(onOpenSettings).not.toHaveBeenCalled();
  });

  it("shows Coach conversations without the removed review checkbox", async () => {
    const user = userEvent.setup();
    render(<OperatorReview view={{
      activeTab: "coach", counts: { subs: 0, coach: 1, weekly: 0, appeals: 0, attempts: 0, tests: 0 },
      submissions: [], weeklyPractices: [], appeals: [], attempts: [], tests: [],
      coachTurns: [{ id: "coach-1", learnerName: "Lan", cefr: "B1", week: 2, at: "28/10/2026", checked: false, userText: "Could you help me?", reply: "Of course.", rubric: null, suggestions: [] }]
    } as any} actions={{ onTabChange: vi.fn(), onMarkSubmission: vi.fn(), onMarkCoachTurn: vi.fn(), onGradeAi: vi.fn(), onGradeManual: vi.fn(), onDecideAppeal: vi.fn(), onViewTest: vi.fn() } as any} />);

    expect(screen.getByText("1 phản hồi")).toBeInTheDocument();
    const group = screen.getAllByText("Lan")[0]!.closest("details")!;
    await user.click(group.querySelector("summary")!);
    expect(screen.getByText("Could you help me?")).toBeInTheDocument();
    expect(screen.getByText("Of course.")).toBeInTheDocument();
    expect(screen.queryByRole("checkbox", { name: "Đã kiểm" })).not.toBeInTheDocument();
  });

  it("presents a lesson-part appeal as a readable review card", () => {
    render(<OperatorReview view={{
      activeTab: "appeals", counts: { subs: 0, coach: 0, weekly: 0, appeals: 1, attempts: 0, tests: 0 },
      submissions: [], coachTurns: [], weeklyPractices: [], attempts: [], tests: [],
      appeals: [{
        id: "appeal-reading", learnerName: "Media GFT", cefr: "A1", title: "Tuần 1 · T2 · Reporting a safety incident",
        part: "reading", kind: "part", attempts: 2, at: "27/10 19:14", status: "pending",
        question: "What happened?", options: ["He fell", "He ran"], answer: "He fell",
        key: "He fell", aiFeedback: "Câu trả lời đúng ý.", reason: "Tôi muốn kiểm tra lại."
      }]
    } as any} actions={{ onTabChange: vi.fn(), onMarkSubmission: vi.fn(), onMarkCoachTurn: vi.fn(), onGradeAi: vi.fn(), onGradeManual: vi.fn(), onDecideAppeal: vi.fn(), onViewTest: vi.fn() } as any} />);

    const appeal = screen.getByRole("article", { name: "Kháng nghị phần Đọc của Media GFT" });
    expect(within(appeal).getByRole("heading", { name: "Tuần 1 · T2 · Reporting a safety incident" })).toBeInTheDocument();
    expect(within(appeal).getByText("Phần Đọc")).toBeInTheDocument();
    expect(within(appeal).getByText("Bài làm của học viên")).toBeInTheDocument();
    expect(within(appeal).getByText("Lý do kháng nghị")).toBeInTheDocument();
    expect(within(appeal).getByRole("button", { name: "Chấp nhận kháng nghị" })).toBeInTheDocument();
  });

  it("keeps review test actions discoverable in the responsive action table", () => {
    render(<OperatorReview mode="assessment" view={{ activeTab: "tests", counts: { subs: 0, coach: 0, appeals: 0, attempts: 0, tests: 1 }, submissions: [], coachTurns: [], appeals: [], attempts: [], tests: [{ id: "test-1", learnerName: "Lan", kind: "placement", submittedAt: "15/10/2026", total: 78, rawLevel: "B1", aiSuggestedCefr: "B1" }] } as any} actions={{ onTabChange: vi.fn(), onMarkSubmission: vi.fn(), onMarkCoachTurn: vi.fn(), onGradeAi: vi.fn(), onGradeManual: vi.fn(), onDecideAppeal: vi.fn(), onViewTest: vi.fn() }} />);

    expect(screen.getByRole("table")).toHaveClass("operator-action-table");
    // The results table lays out phone rows with a grid on named cells instead of data-label captions.
    expect(screen.getByRole("columnheader", { name: "Thao tác" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Xem" }).closest("td")).toHaveClass("operator-result-action");
  });

  it("groups lesson attempts by learner instead of repeating learner rows", async () => {
    const user = userEvent.setup();
    render(<OperatorReview view={{
      activeTab: "attempts", counts: { subs: 0, coach: 0, weekly: 0, appeals: 0, attempts: 3, tests: 0 },
      submissions: [], coachTurns: [], weeklyPractices: [], appeals: [], tests: [],
      attempts: [
        { id: "a1", learnerId: "learner-1", learnerName: "Lan", cefr: "A2", lesson: "Bài học tháng · Bài 1 · Directions", listening: "1", reading: "1", writing: "1", wordClass: "1", wordUse: "1", speaking: "1", total: 6 },
        { id: "a2", learnerId: "learner-1", learnerName: "Lan", cefr: "A2", lesson: "Bài học tháng · Bài 2 · Places", listening: "2", reading: "chưa làm", writing: "chưa làm", wordClass: "chưa làm", wordUse: "chưa làm", speaking: "chưa làm", total: 2 },
        { id: "a3", learnerId: "learner-2", learnerName: "Minh", cefr: "B1", lesson: "Bài học tháng · Bài 1 · Work", listening: "1", reading: "1", writing: "1", wordClass: "1", wordUse: "1", speaking: "1", total: 6 }
      ]
    } as any} actions={{ onTabChange: vi.fn(), onMarkSubmission: vi.fn(), onMarkCoachTurn: vi.fn(), onGradeAi: vi.fn(), onGradeManual: vi.fn(), onDecideAppeal: vi.fn(), onViewTest: vi.fn() }} />);

    const groups = screen.getAllByTestId("attempt-learner-group");
    expect(groups).toHaveLength(2);
    expect(within(groups[0]!).getByText("2 bài · 8 lượt")).toBeInTheDocument();
    await user.click(within(groups[0]!).getByText("Lan"));
    expect(within(groups[0]!).getAllByRole("row")).toHaveLength(3);
    expect(within(groups[0]!).getByRole("columnheader", { name: "Từ loại" })).toBeInTheDocument();
    expect(within(groups[0]!).getByRole("columnheader", { name: "Dùng từ" })).toBeInTheDocument();
    expect(screen.getByText(/Mỗi kỹ năng tối đa 2 lượt/u)).toBeInTheDocument();
    expect(within(groups[0]!).queryByRole("columnheader", { name: "Người học" })).not.toBeInTheDocument();
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

  it("keeps level-form skill sections closed until the operator opens one", async () => {
    const user = userEvent.setup();
    render(<OperatorLevelFormDetail detail={{
      definitionId: "definition-1", versionId: "version-1", title: "Đề B1", version: 1, publishedAt: null,
      listeningTaskCount: 1, readingTaskCount: 0, attemptCount: 0, status: "draft", targetLevel: "B1",
      sections: [{ code: "listening", title: "Nghe", durationMinutes: 7, maxScore: 25, instructions: ["Nghe và chọn đáp án."], groups: [{ key: "L", title: "Thông báo", instruction: "Nghe một lần", tasks: [{ key: "L1", prompt: "Where is the meeting?", responseType: "single_choice", maxScore: 5, options: [{ value: "A", label: "Room 1" }, { value: "B", label: "Room 2" }], correctAnswer: "B" }] }] }],
      warnings: [], versions: [], deletable: true, deleteReason: null
    } as any} onClose={vi.fn()} />);

    const listeningSummary = screen.getByText("Nghe").closest("summary");
    expect(listeningSummary?.closest("details")).not.toHaveAttribute("open");
    await user.click(listeningSummary!);
    expect(listeningSummary?.closest("details")).toHaveAttribute("open");
    expect(screen.getByRole("list", { name: "Câu hỏi phần Nghe" })).toBeInTheDocument();
    expect(screen.getByText("Câu 1")).toBeInTheDocument();
    expect(screen.getByText("Đáp án B")).toBeInTheDocument();
    await user.click(listeningSummary!);
    expect(listeningSummary?.closest("details")).not.toHaveAttribute("open");
  });

  it("summarizes level-form draft validation by action instead of exposing raw warning codes", () => {
    render(<OperatorLevelFormDetail detail={{
      definitionId: "definition-1", versionId: "version-1", title: "Đề A2", version: 1, publishedAt: null,
      listeningTaskCount: 20, readingTaskCount: 40, attemptCount: 0, status: "draft", targetLevel: "A2",
      sections: [], warnings: [
        { code: "missing_answer_key", message: "Phần Nghe: 20 câu chưa chọn đáp án.", severity: "error" },
        { code: "missing_answer_key", message: "Phần Đọc: 40 câu chưa chọn đáp án.", severity: "error" },
        { code: "missing_task_prompt", message: "Phần Viết: 2 câu chưa có đề bài. (W1, W2)", severity: "error" },
        { code: "missing_task_prompt", message: "Phần Nói: 4 câu chưa có đề bài. (S1, S2, S3, S4)", severity: "error" },
        { code: "missing_audio", message: "Phần Nghe chưa có audio.", severity: "error" }
      ], versions: [], deletable: true, deleteReason: null
    } as any} onClose={vi.fn()} />);

    const validation = screen.getByRole("region", { name: "Cảnh báo kiểm tra đề" });
    expect(validation).toHaveTextContent("Cần hoàn thiện trước khi phát hành");
    expect(validation).toHaveTextContent("5 mục");
    expect(within(validation).getAllByText("Đáp án")).toHaveLength(2);
    expect(within(validation).getAllByText("Đề bài")).toHaveLength(2);
    expect(within(validation).getByText("Audio")).toBeInTheDocument();
    expect(validation).not.toHaveTextContent("missing_answer_key");
  });

  it("lets Operator edit prompts, choices and answer keys before saving a level form", async () => {
    const user = userEvent.setup();
    const onSave = vi.fn();
    const uploadAudio = vi.fn().mockResolvedValue({ url: "/api/v1/files/content-media/read?artifactKey=level-b1.mp3" });
    render(<OperatorLevelFormDetail editing uploadAudio={uploadAudio} detail={{
      definitionId: "definition-1", versionId: "version-1", title: "Đề B1", version: 1, publishedAt: null,
      listeningTaskCount: 1, readingTaskCount: 0, attemptCount: 0, status: "draft", targetLevel: "B1",
      sections: [{ code: "listening", title: "Nghe", durationMinutes: 7, maxScore: 25, instructions: ["Nghe và chọn đáp án."], groups: [{ key: "L", title: "Thông báo", instruction: "Nghe một lần", stimulus: { type: "audio_script", lines: [{ speaker: "Manager", text: "The meeting starts at nine." }] }, tasks: [{ key: "L1", prompt: "Where is the meeting?", responseType: "single_choice", maxScore: 5, options: [{ value: "A", label: "Room 1" }, { value: "B", label: "Room 2" }], correctAnswer: "B" }] }] }],
      warnings: [], versions: [], deletable: true, deleteReason: null
    } as any} onClose={vi.fn()} onSave={onSave} />);

    expect(screen.queryByLabelText("Tên đề")).not.toBeInTheDocument();
    expect(screen.getByText("Đề B1")).toBeInTheDocument();
    expect(screen.getByText("Chưa có audio nghe")).toBeInTheDocument();
    const audioFile = new File(["audio"], "b1.mp3", { type: "audio/mpeg" });
    await user.upload(screen.getByLabelText("Tải audio cho Thông báo"), audioFile);
    await waitFor(() => expect(uploadAudio).toHaveBeenCalledWith(audioFile, "b1.mp3"));
    await user.clear(screen.getByLabelText("Nội dung L1"));
    await user.type(screen.getByLabelText("Nội dung L1"), "Where will the meeting happen?");
    await user.clear(screen.getByLabelText("Lựa chọn A của L1"));
    await user.type(screen.getByLabelText("Lựa chọn A của L1"), "Main office");
    await user.selectOptions(screen.getByLabelText("Đáp án đúng của L1"), "A");
    await user.click(screen.getByRole("button", { name: "Lưu bản nháp" }));

    expect(onSave).toHaveBeenCalledWith(expect.objectContaining({
      title: "Đề B1",
      sections: [expect.objectContaining({ groups: [expect.objectContaining({ stimulus: expect.objectContaining({ audioSrc: "/api/v1/files/content-media/read?artifactKey=level-b1.mp3" }), tasks: [expect.objectContaining({
        prompt: "Where will the meeting happen?",
        options: [expect.objectContaining({ value: "A", label: "Main office" }), expect.any(Object)],
        correctAnswer: "A"
      })] })] })]
    }));
  });

  it("creates Edge TTS audio for a level-form listening script and stores it before saving", async () => {
    const user = userEvent.setup();
    const onSave = vi.fn();
    const synthesizeEdgeTts = vi.fn().mockRejectedValueOnce(new ApiError("EDGE_TTS_UNAVAILABLE", "http", 503)).mockResolvedValue({ filename: "level-a2.mp3", mimeType: "audio/mpeg", base64: "YXVkaW8=" });
    const uploadAudio = vi.fn().mockResolvedValue({ url: "/api/v1/files/content-media/read?artifactKey=level-a2.mp3" });
    render(<OperatorLevelFormDetail editing synthesizeEdgeTts={synthesizeEdgeTts} uploadAudio={uploadAudio} onSave={onSave} detail={{
      definitionId: "definition-1", versionId: "version-1", title: "Đề A2", version: 1, publishedAt: null,
      listeningTaskCount: 1, readingTaskCount: 0, attemptCount: 0, status: "draft", targetLevel: "A2",
      sections: [{ code: "listening", title: "Nghe", durationMinutes: 15, maxScore: 20, instructions: ["Nghe và chọn đáp án."], groups: [{ key: "L", title: "Thông báo", instruction: "Nghe một lần", stimulus: { type: "audio_script", lines: [{ speaker: "Narrator", text: "The meeting starts at nine." }] }, tasks: [{ key: "L1", prompt: "Where is the meeting?", responseType: "single_choice", maxScore: 5, options: [{ value: "A", label: "Room 1" }, { value: "B", label: "Room 2" }], correctAnswer: "B" }] }] }],
      warnings: [], versions: [], deletable: true, deleteReason: null
    } as any} onClose={vi.fn()} />);

    await user.click(screen.getByText("Nghe"));
    expect(screen.queryByText("AI/provider audio chưa khả dụng")).not.toBeInTheDocument();
    const generate = screen.getByRole("button", { name: "Sinh audio Edge TTS" });
    await user.click(generate);
    const error = await screen.findByRole("alert");
    expect(error).toHaveTextContent("Máy chủ chưa bật Edge TTS");
    expect(error).toHaveClass("operator-level-audio-error");
    expect(uploadAudio).not.toHaveBeenCalled();
    await user.click(screen.getByRole("button", { name: "Sinh audio Edge TTS" }));
    await waitFor(() => expect(synthesizeEdgeTts).toHaveBeenCalledWith({ text: "Narrator: The meeting starts at nine.", voice: "en-US-AvaMultilingualNeural" }));
    await waitFor(() => expect(uploadAudio).toHaveBeenCalledWith(expect.any(Blob), "level-a2.mp3"));
    await user.click(screen.getByRole("button", { name: "Lưu bản nháp" }));
    expect(onSave).toHaveBeenCalledWith(expect.objectContaining({ sections: [expect.objectContaining({ groups: [expect.objectContaining({ stimulus: expect.objectContaining({ audioSrc: "/api/v1/files/content-media/read?artifactKey=level-a2.mp3" }) })] })] }));
  });




});
