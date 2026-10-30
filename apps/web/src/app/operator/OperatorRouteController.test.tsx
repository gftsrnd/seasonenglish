// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { MemoryRouter } from "react-router";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ContentLessonMatrixView, ContentLessonSetVersionView, ContentReviewAssessmentDetailView, ContentReviewView, SessionView } from "@e4s/contracts";
import { ApiError } from "../../api/runtime.js";
import { OperatorRouteController } from "./OperatorRouteController.js";

afterEach(cleanup);

const operator = { role: "operator", user: { id: "op", displayName: "Operator", email: null }, permissions: ["content:operate", "assessment:review", "prompt:manage"] } as SessionView;
const manager = { role: "manager", user: { id: "mgr", displayName: "Manager", email: null }, permissions: ["content:operate", "assessment:review", "prompt:manage"] } as SessionView;

const lessonSet = (status: ContentLessonSetVersionView["status"]): ContentLessonSetVersionView => ({
  lessonSetId: "ls", versionId: "v1", version: 1, status, weekNumber: 2, topic: "Meetings", cefr: "A2",
  explanationLanguage: "Tiếng Việt", createdBy: "op", approvedBy: status === "published" ? "op" : null,
  createdAt: "2026-10-14", publishedAt: status === "published" ? "2026-10-15" : null,
  weeklyPractice: {
    task: "Write 3–5 sentences about meetings.",
    guidance: "Use at least 3 words from this week's lessons.",
    inputMode: "text_or_dictation",
    requiredVocabulary: ["agenda", "minutes", "deadline"]
  },
  lessons: [{ id: "lesson-1", dayNumber: 1, title: "Mở đầu cuộc họp", durationMinutes: 10, practiceLabel: "điền từ", parts: [] }]
});

const monthsOverview = {
  today: "2026-11-10",
  months: [
    { month: "2026-10", label: "Tháng 10/2026", examDate: "2026-10-30", lessonCount: 21, studyDayCount: 22, editable: false, levels: [{ cefr: "A2", frameworkStatus: "missing", approvedLessons: 0, totalLessons: 21, examStatus: "none", readyForLearners: false }] },
    { month: "2026-11", label: "Tháng 11/2026", examDate: "2026-11-30", lessonCount: 20, studyDayCount: 21, editable: true, levels: [{ cefr: "A2", frameworkStatus: "missing", approvedLessons: 0, totalLessons: 20, examStatus: "none", readyForLearners: false }] },
    { month: "2026-12", label: "Tháng 12/2026", examDate: "2026-12-31", lessonCount: 22, studyDayCount: 23, editable: true, levels: [{ cefr: "A2", frameworkStatus: "missing", approvedLessons: 0, totalLessons: 22, examStatus: "none", readyForLearners: false }] }
  ],
  activeLevels: ["A2"],
  settings: { vocabularyCount: 60, grammarTopicCount: 3, soundCount: 4, examDurationMinutes: 30 },
  aiConnected: false
};
const monthFramework = {
  id: null, month: "2026-11", cefr: "A2", status: "missing", version: 0, source: null, generationError: null, approvedAt: null, approvedBy: null,
  vocabulary: [], grammarTopics: [], sounds: [], firstReviewLesson: null, lessons: [], lessonSetVersionId: null,
  exam: { status: "none", error: null, assessmentVersionId: null, approvedAt: null }, readyForLearners: false, editable: true
};

describe("OperatorRouteController", () => {
  it("uses the sidebar without repeating an operational navigation bar on Operator screens", async () => {
    const client = { getContentMonths: vi.fn().mockResolvedValue(monthsOverview), getContentMonthFramework: vi.fn().mockResolvedValue(monthFramework) };
    render(<MemoryRouter initialEntries={["/op/months"]}><OperatorRouteController session={operator} client={client as any} /></MemoryRouter>);

    expect(await screen.findByRole("heading", { name: "Khung tháng & bài ngày" })).toBeInTheDocument();
    expect(screen.queryByRole("navigation", { name: "Điều hướng màn vận hành" })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "← Vận hành" })).not.toBeInTheDocument();
  });

  it("does not render the manual Duyệt trình độ back link in Operator level forms", async () => {
    const client = { getAssessmentLevelForms: vi.fn().mockResolvedValue([]), getSystemCapabilities: vi.fn().mockResolvedValue({ ai: true }) };
    render(<MemoryRouter initialEntries={["/op/levelforms"]}><OperatorRouteController session={operator} client={client as any} /></MemoryRouter>);

    expect(await screen.findByRole("heading", { name: "Bài kiểm tra" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Đề lên mức" })).toHaveAttribute("aria-selected", "true");
    expect(screen.queryByRole("heading", { name: "Đề thi lên mức" })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "← Duyệt trình độ" })).not.toBeInTheDocument();
  });

  it("does not render Prompt & rubric for an Operator even when the controller receives its direct URL", async () => {
    const client = { getContentPrompts: vi.fn().mockResolvedValue({ groups: [
      { key: "system_rules", label: "Quy tắc chung", content: "current", defaultContent: "default", version: 1, status: "active" }
    ] }) };
    render(<MemoryRouter initialEntries={["/settings/prompts"]}><OperatorRouteController session={operator} client={client as any} /></MemoryRouter>);

    expect(await screen.findByText("Đường dẫn vận hành không tồn tại.")).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Prompt & rubric" })).not.toBeInTheDocument();
    expect(client.getContentPrompts).not.toHaveBeenCalled();
  });

  it("persists an Operator draft edit from the level-form workspace", async () => {
    const user = userEvent.setup();
    const detail = {
      definitionId: "definition-1", versionId: "version-1", title: "Đề B1", version: 1, publishedAt: null,
      listeningTaskCount: 1, readingTaskCount: 0, attemptCount: 0, status: "draft", targetLevel: "B1",
      sections: [
        { code: "listening", title: "Nghe", durationMinutes: 8, maxScore: 25, instructions: ["Nghe"], groups: [{ key: "L", title: "Nghe", instruction: "Nghe", tasks: [{ key: "L1", prompt: "Old prompt", responseType: "single_choice", maxScore: 5, options: [{ value: "A", label: "Yes" }], correctAnswer: "A" }] }] },
        { code: "reading", title: "Đọc", durationMinutes: 13, maxScore: 25, instructions: ["Đọc"], groups: [{ key: "R", title: "Đọc", instruction: "Đọc", tasks: [{ key: "R1", prompt: "Read", responseType: "single_choice", maxScore: 5, options: [{ value: "A", label: "Yes" }], correctAnswer: "A" }] }] },
        { code: "writing", title: "Viết", durationMinutes: 10, maxScore: 25, instructions: ["Viết"], groups: [{ key: "W", title: "Viết", instruction: "Viết", tasks: [{ key: "W1", prompt: "Write", responseType: "long_text", maxScore: 25 }] }] },
        { code: "speaking", title: "Nói", durationMinutes: 7, maxScore: 25, instructions: ["Nói"], groups: [{ key: "S", title: "Nói", instruction: "Nói", tasks: [{ key: "S1", prompt: "Speak", responseType: "speaking_evidence", maxScore: 25 }] }] }
      ], warnings: [], versions: [], deletable: true, deleteReason: null
    } as any;
    const updateAssessmentLevelForm = vi.fn().mockImplementation(async (_id, input) => ({ ...detail, title: input.title, sections: input.sections }));
    const client = {
      getAssessmentLevelForms: vi.fn().mockResolvedValue([{ targetLevel: "B1", publishedForm: null, draftForm: { definitionId: "definition-1", versionId: "version-1", title: "Đề B1", version: 1, publishedAt: null, listeningTaskCount: 1, readingTaskCount: 0, attemptCount: 0, status: "draft" } }]),
      getAssessmentLevelForm: vi.fn().mockResolvedValue(detail), updateAssessmentLevelForm,
      getSystemCapabilities: vi.fn().mockResolvedValue({ ai: true })
    };
    render(<MemoryRouter initialEntries={["/op/levelforms"]}><OperatorRouteController session={operator} client={client as any} /></MemoryRouter>);

    await user.click(await screen.findByRole("button", { name: "Sửa" }));
    const prompt = await screen.findByRole("textbox", { name: "Nội dung L1" });
    await user.clear(prompt);
    await user.type(prompt, "Updated prompt");
    await user.click(screen.getByRole("button", { name: "Lưu bản nháp" }));

    await waitFor(() => expect(updateAssessmentLevelForm).toHaveBeenCalledWith("version-1", expect.objectContaining({ sections: expect.any(Array) })));
    expect(updateAssessmentLevelForm.mock.calls[0]?.[1].sections[0].groups[0].tasks[0].prompt).toBe("Updated prompt");
  });

  it("switches Bài kiểm tra between placement reviews and level-form management", async () => {
    const user = userEvent.setup();
    const review = {
      tabs: [{ key: "assessments", label: "Bài test", count: 1 }], submissions: [], coachSamples: [], microLessons: [], weeklyPractices: [], appeals: [], lessonAttempts: [],
      assessments: [{ id: "a1", learnerId: "u1", learnerName: "Lan", kind: "placement", title: "Bài đầu vào", submittedAt: "2026-10-21T08:00:00.000Z", totalScore: 72, status: "submitted" }]
    } as any;
    const client = { getContentReview: vi.fn().mockResolvedValue(review), getAssessmentLevelForms: vi.fn().mockResolvedValue([]), getSystemCapabilities: vi.fn().mockResolvedValue({ ai: true }) };
    render(<MemoryRouter initialEntries={["/op/tests"]}><OperatorRouteController session={operator} client={client as any} /></MemoryRouter>);

    expect(await screen.findByRole("heading", { name: "Bài kiểm tra" })).toBeInTheDocument();
    const navigation = screen.getByRole("tablist", { name: "Loại bài kiểm tra" });
    expect(within(navigation).getAllByRole("tab").map(tab => tab.textContent)).toEqual(["Đề đầu vào", "Đề lên mức"]);
    expect(await screen.findByText("Lan")).toBeInTheDocument();

    await user.click(within(navigation).getByRole("tab", { name: "Đề lên mức" }));
    expect(within(navigation).getByRole("tab", { name: "Đề lên mức" })).toHaveAttribute("aria-selected", "true");
    expect(screen.queryByRole("heading", { name: "Đề thi lên mức" })).not.toBeInTheDocument();
    expect(client.getAssessmentLevelForms).toHaveBeenCalled();
  });

  it("lets Manager edit Prompt & rubric from its Settings area", async () => {
    const client = { getContentPrompts: vi.fn().mockResolvedValue({ groups: [
      { key: "system_rules", label: "Quy tắc chung", content: "current", defaultContent: "default", version: 1, status: "active" },
      { key: "assessment_scoring", label: "Chấm test", content: "score", defaultContent: "score default", version: 1, status: "active" }
    ] }) };
    render(<MemoryRouter initialEntries={["/settings/prompts"]}><OperatorRouteController session={manager} client={client as any} basePath="/mgr/ops" /></MemoryRouter>);
    expect(await screen.findByRole("heading", { name: "Prompt & rubric" })).toBeInTheDocument();
    screen.getAllByRole("button", { name: "Về mặc định" }).forEach(button => expect(button).toBeEnabled());
    expect(screen.getByRole("button", { name: "Lưu prompt" })).toBeEnabled();
    expect(screen.getByRole("textbox", { name: "Quy tắc chung" })).not.toHaveAttribute("readonly");
    expect(screen.queryByText(/bài siêu ngắn/i)).not.toBeInTheDocument();
  });

  it("keeps the Manager Prompt settings editable without an operations inspection banner", async () => {
    const client = { getContentPrompts: vi.fn().mockResolvedValue({ groups: [
      { key: "system_rules", label: "Quy tắc chung", content: "current", defaultContent: "default", version: 1, status: "active" }
    ] }), saveContentPrompts: vi.fn() };
    render(<MemoryRouter initialEntries={["/settings/prompts"]}><OperatorRouteController session={manager} client={client as any} basePath="/mgr/ops" /></MemoryRouter>);

    expect(await screen.findByRole("heading", { name: "Prompt & rubric" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Lưu prompt" })).toBeEnabled();
    expect(screen.queryByText(/chế độ chỉ đọc/i)).not.toBeInTheDocument();
    expect(client.saveContentPrompts).not.toHaveBeenCalled();
  });

  it("disables dashboard actions whose backend endpoint is absent and explains why", async () => {
    const client = { getAssessmentReviewOverview: vi.fn().mockResolvedValue({
      pendingAssessments: [{ attemptId: "a1", learnerId: "u1", learnerName: "Lan", kind: "placement", title: "Đầu vào", submittedAt: "2026-10-14", sectionScores: { listening: 70 }, suggestedLevel: "A2" }],
      pendingLevelUp: [{ attemptId: "a2", learnerId: "u2", learnerName: "Minh", kind: "level_up", title: "Lên mức", submittedAt: "2026-10-14", sectionScores: { reading: 80 }, suggestedLevel: "B1" }], approvedLearners: [], unassessedLearners: [],
      levelSignals: { windowDays: 14, ready: [], weak: [] }, topicReports: []
    }) };
    render(<MemoryRouter initialEntries={["/op"]}><OperatorRouteController session={operator} client={client as any} /></MemoryRouter>);
    const unavailable = await screen.findByRole("button", { name: "Xem bài làm" });
    expect(unavailable).toBeDisabled();
    expect(unavailable).not.toHaveAttribute("title");
    expect(screen.getByRole("button", { name: "Duyệt mức" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Duyệt mức" })).not.toHaveAttribute("title");
    expect(screen.getByRole("button", { name: "Duyệt lên mức" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Từ chối" })).toBeDisabled();
    expect(screen.queryByText(/Một số thao tác hiện chưa khả dụng/i)).not.toBeInTheDocument();
  });

  it("uses the learner id when deleting a learner from a pending assessment card", async () => {
    const user = userEvent.setup();
    const requestAssessmentReviewLearnerDeletion = vi.fn().mockResolvedValue({});
    const overview = {
      pendingAssessments: [{ attemptId: "attempt-1", learnerId: "learner-1", learnerName: "Lan", kind: "placement", title: "Đầu vào", submittedAt: "2026-10-14", sectionScores: { listening: 70 }, suggestedLevel: "A2" }],
      pendingLevelUp: [], approvedLearners: [], unassessedLearners: [],
      levelSignals: { windowDays: 14, ready: [], weak: [] }, topicReports: []
    };
    render(<MemoryRouter initialEntries={["/op"]}><OperatorRouteController session={operator} client={{ getAssessmentReviewOverview: vi.fn().mockResolvedValue(overview), requestAssessmentReviewLearnerDeletion } as any} /></MemoryRouter>);

    await user.click(await screen.findByRole("button", { name: "Xoá học viên" }));
    const dialog = screen.getByRole("dialog", { name: "Yêu cầu xoá học viên" });
    await user.type(within(dialog).getByRole("textbox", { name: "Lý do" }), "Tài khoản trùng");
    await user.click(within(dialog).getByRole("button", { name: "Gửi yêu cầu" }));

    await waitFor(() => expect(requestAssessmentReviewLearnerDeletion).toHaveBeenCalledWith("learner-1", "Tài khoản trùng"));
    const pendingDelete = await screen.findByRole("button", { name: "Chờ Quản lý duyệt xoá" });
    expect(pendingDelete).toBeDisabled();
    expect(screen.queryByRole("button", { name: "Xoá học viên" })).not.toBeInTheDocument();
  });

  it("restores the pending deletion button state from the server after reload", async () => {
    const overview = {
      pendingAssessments: [{ attemptId: "attempt-1", learnerId: "learner-1", learnerName: "Lan", kind: "placement", title: "Đầu vào", submittedAt: "2026-10-14", sectionScores: {}, suggestedLevel: "A2" }],
      pendingLevelUp: [], approvedLearners: [], unassessedLearners: [],
      levelSignals: { windowDays: 14, ready: [], weak: [] }, topicReports: []
    };
    const getAssessmentReviewLearner = vi.fn().mockResolvedValue({
      learner: { id: "learner-1", displayName: "Lan", email: null, status: "active", createdAt: "2026-10-01", currentLevel: null, cefrApproved: false, pendingLevel: null },
      profile: {}, monthlyGoal: null, levelHistory: [], attempts: [],
      deletionRequests: [{ id: "delete-1", learnerId: "learner-1", learnerName: "Lan", reason: "Tài khoản trùng", status: "pending", requestedBy: "operator-1", requestedAt: "2026-10-23T10:00:00.000Z" }]
    });
    render(<MemoryRouter initialEntries={["/op"]}><OperatorRouteController session={operator} client={{ getAssessmentReviewOverview: vi.fn().mockResolvedValue(overview), getAssessmentReviewLearner, requestAssessmentReviewLearnerDeletion: vi.fn() } as any} /></MemoryRouter>);

    expect(await screen.findByRole("button", { name: "Chờ Quản lý duyệt xoá" })).toBeDisabled();
    expect(getAssessmentReviewLearner).toHaveBeenCalledWith("learner-1");
  });

  it("does not expose transport placeholders when the optional week context is unavailable", async () => {
    const client = { getAssessmentReviewOverview: vi.fn().mockResolvedValue({
      pendingAssessments: [], pendingLevelUp: [], approvedLearners: [], unassessedLearners: [],
      levelSignals: { windowDays: 14, ready: [], weak: [] }, topicReports: []
    }) };
    render(<MemoryRouter initialEntries={["/op"]}><OperatorRouteController session={operator} client={client as any} /></MemoryRouter>);

    expect(await screen.findByRole("heading", { name: "Duyệt trình độ" })).toBeInTheDocument();
    expect(screen.queryByText("Tuần: API chưa cung cấp")).not.toBeInTheDocument();
  });

  it("uses neutral fallbacks when assessment totals or level targets are absent", async () => {
    const client = { getAssessmentReviewOverview: vi.fn().mockResolvedValue({
      pendingAssessments: [{ attemptId: "a1", learnerId: "u1", learnerName: "Lan", kind: "placement", title: "Đầu vào", submittedAt: "2026-10-14", sectionScores: { listening: 70 }, suggestedLevel: null }],
      pendingLevelUp: [{ attemptId: "a2", learnerId: "u2", learnerName: "Minh", kind: "level_up", title: "Lên mức", submittedAt: "2026-10-14", sectionScores: { reading: 62 }, suggestedLevel: null }],
      approvedLearners: [], unassessedLearners: [],
      levelSignals: { windowDays: 14, ready: [], weak: [] }, topicReports: []
    }) };
    render(<MemoryRouter initialEntries={["/op"]}><OperatorRouteController session={operator} client={client as any} /></MemoryRouter>);

    expect(await screen.findByText(/nộp 14\/10 \d{2}:\d{2} · tổng —/)).toBeInTheDocument();
    expect(screen.getByText(/mức hiện tại: —/)).toBeInTheDocument();
    expect(screen.getByText(/mức đích: —/)).toBeInTheDocument();
    expect(screen.queryByText(/tổng API chưa cung cấp/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/mức hiện tại: API chưa cung cấp/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/mức đích: API chưa cung cấp/i)).not.toBeInTheDocument();
    expect(screen.getAllByText("Chờ chấm")).toHaveLength(3);
  });

  it("uses the app prompt modal when rejecting a level request", async () => {
    const user = userEvent.setup();
    const overview = {
      pendingAssessments: [],
      pendingLevelUp: [{ attemptId: "a2", learnerId: "u2", learnerName: "Minh", kind: "level_up", title: "Lên mức", submittedAt: "2026-10-14", sectionScores: { reading: 62 }, suggestedLevel: "B1" }],
      approvedLearners: [], unassessedLearners: [],
      levelSignals: { windowDays: 14, ready: [], weak: [] }, topicReports: []
    };
    const decideAssessment = vi.fn().mockResolvedValue({});
    const client = { getAssessmentReviewOverview: vi.fn().mockResolvedValue(overview), decideAssessment };
    render(<MemoryRouter initialEntries={["/op"]}><OperatorRouteController session={operator} client={client as any} /></MemoryRouter>);

    await user.click(await screen.findByRole("button", { name: "Từ chối" }));
    const dialog = screen.getByRole("dialog", { name: "Từ chối yêu cầu lên mức" });
    await user.type(within(dialog).getByRole("textbox", { name: "Lý do từ chối" }), "Cần bổ sung bằng chứng");
    await user.click(within(dialog).getByRole("button", { name: "Từ chối" }));

    await waitFor(() => expect(decideAssessment).toHaveBeenCalledWith("a2", { status: "needs_retry", reason: "Cần bổ sung bằng chứng" }));
  });

  it("hydrates dashboard week context and signal window from the persisted contracts", async () => {
    const client = {
      getAssessmentReviewOverview: vi.fn().mockResolvedValue({
        pendingAssessments: [], pendingLevelUp: [], approvedLearners: [], unassessedLearners: [],
        levelSignals: { windowDays: 14, ready: [], weak: [] }, topicReports: []
      }),
      getContentWeeks: vi.fn().mockResolvedValue({
        pilot: { startDate: "2026-10-05", weekCount: 2 },
        weeks: [
          { id: "w1", weekNumber: 1, startDate: "2026-10-05", endDate: "2026-10-11", current: false, topic: "Giới thiệu", description: "", objectives: "", keyVocabHint: "" },
          { id: "w2", weekNumber: 2, startDate: "2026-10-12", endDate: "2026-10-18", current: true, topic: "Meetings", description: "", objectives: "", keyVocabHint: "" }
        ]
      })
    };
    render(<MemoryRouter initialEntries={["/op"]}><OperatorRouteController session={operator} client={client as any} /></MemoryRouter>);

    expect(await screen.findByText("Tuần 2/2 · Meetings · 0 người học đang hoạt động")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: /Tín hiệu đổi mức/ })).toHaveTextContent("14 ngày gần nhất");
  });

  it("renders persisted level-up flow signals with real test and challenge actions", async () => {
    const user = userEvent.setup();
    const overview = {
      pendingAssessments: [], pendingLevelUp: [], approvedLearners: [], unassessedLearners: [],
      levelSignals: {
        windowDays: 14, ready: [], weak: [],
        inFlow: [{
          learnerId: "u1", learnerName: "Lan", currentLevel: "A2", targetLevel: "B1",
          phase: "challenge", metrics: "đang thử thách Season (2/6)",
          assessmentAttemptId: "attempt-1", challengeAttemptId: "attempt-1"
        }]
      }, topicReports: []
    };
    const getAssessmentReviewChallenge = vi.fn().mockResolvedValue({
      sessionId: "session-1", assessmentAttemptId: "attempt-1", targetLevel: "B1", status: "active",
      progress: { completedTurns: 2, requiredTurns: 6, average: 4, offTopic: 0, complete: false, passed: false }, turns: []
    });
    const getContentReviewAssessment = vi.fn().mockResolvedValue({
      attemptId: "attempt-1", learnerId: "u1", learnerName: "Lan", kind: "level_up", title: "Lên mức B1",
      status: "pending_review", startedAt: "2026-10-14T08:00:00.000Z", submittedAt: "2026-10-14T08:30:00.000Z", totalScore: null,
      answers: [], scores: [], integrityEvents: [], decision: null, appeal: null
    });
    render(<MemoryRouter initialEntries={["/op"]}><OperatorRouteController session={operator} client={{ getAssessmentReviewOverview: vi.fn().mockResolvedValue(overview), getAssessmentReviewChallenge, getContentReviewAssessment } as any} /></MemoryRouter>);

    expect(await screen.findByRole("heading", { name: "Đang trong luồng lên mức (1)" })).toBeInTheDocument();
    expect(screen.getByText("đang thử thách Season (2/6)")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Bài thi" }));
    await waitFor(() => expect(getContentReviewAssessment).toHaveBeenCalledWith("attempt-1"));
    expect(await screen.findByRole("dialog", { name: "Chi tiết bài test của Lan" })).toBeInTheDocument();
  });

  it("wires the rescore action for both Operator and Manager operations", async () => {
    const user = userEvent.setup();
    const overview = {
      pendingAssessments: [{ attemptId: "a1", learnerId: "u1", learnerName: "Lan", kind: "placement", title: "Đầu vào", submittedAt: "2026-10-14", sectionScores: { listening: 70 }, suggestedLevel: "A2" }],
      pendingLevelUp: [], approvedLearners: [], unassessedLearners: [],
      levelSignals: { windowDays: 14, ready: [], weak: [] }, topicReports: []
    };
    const getAssessmentReviewOverview = vi.fn().mockResolvedValue(overview);
    const rescoreAssessment = vi.fn().mockResolvedValue({ id: "a1", learnerName: "Lan" });
    const client = {
      getAssessmentReviewOverview,
      getSystemCapabilities: vi.fn().mockResolvedValue({ ai: true }),
      rescoreAssessment
    };
    render(<MemoryRouter initialEntries={["/op"]}><OperatorRouteController session={operator} client={client as any} /></MemoryRouter>);
    const button = await screen.findByRole("button", { name: "Chấm lại bằng AI" });
    await user.click(button);
    await waitFor(() => expect(rescoreAssessment).toHaveBeenCalledWith("a1", expect.any(String)));
    await waitFor(() => expect(getAssessmentReviewOverview).toHaveBeenCalledTimes(2));

    cleanup();
    render(<MemoryRouter initialEntries={["/op"]}><OperatorRouteController session={manager} client={client as any} /></MemoryRouter>);
    expect(await screen.findByRole("heading", { name: "Duyệt trình độ" })).toBeInTheDocument();
    const managerButton = screen.getByRole("button", { name: "Chấm lại bằng AI" });
    expect(managerButton).toBeDisabled();
    await user.click(managerButton);
    expect(rescoreAssessment).toHaveBeenCalledTimes(1);
  });

  it("keeps the dashboard visible when a rescore request fails", async () => {
    const user = userEvent.setup();
    const overview = {
      pendingAssessments: [{ attemptId: "a1", learnerId: "u1", learnerName: "Lan", kind: "placement", title: "Đầu vào", submittedAt: "2026-10-14", sectionScores: { listening: 70 }, suggestedLevel: "A2" }],
      pendingLevelUp: [], approvedLearners: [], unassessedLearners: [],
      levelSignals: { windowDays: 14, ready: [], weak: [] }, topicReports: []
    };
    const rescoreAssessment = vi.fn().mockRejectedValue(new Error("ASSESSMENT_RESCORE_FAILED"));
    render(<MemoryRouter initialEntries={["/op"]}><OperatorRouteController session={operator} client={{ getAssessmentReviewOverview: vi.fn().mockResolvedValue(overview), rescoreAssessment } as any} /></MemoryRouter>);

    await user.click(await screen.findByRole("button", { name: "Chấm lại bằng AI" }));
    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("ASSESSMENT_RESCORE_FAILED"));
    expect(screen.getByRole("heading", { name: "Duyệt trình độ" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Chấm lại bằng AI" })).toBeInTheDocument();
  });

  it("opens the persisted assessment detail modal with evidence for Operator and Manager", async () => {
    const user = userEvent.setup();
    const overview = {
      pendingAssessments: [{ attemptId: "a1", learnerId: "u1", learnerName: "Lan", kind: "placement", title: "Đầu vào", submittedAt: "2026-10-14", sectionScores: { listening: 70 }, suggestedLevel: "A2" }],
      pendingLevelUp: [], approvedLearners: [], unassessedLearners: [],
      levelSignals: { windowDays: 14, ready: [], weak: [] }, topicReports: []
    };
    const detail: ContentReviewAssessmentDetailView = {
      attemptId: "a1", learnerId: "u1", learnerName: "Lan", kind: "placement", title: "Bài test đầu vào",
      status: "pending_review", startedAt: "2026-10-14T08:00:00.000Z", submittedAt: "2026-10-14T08:30:00.000Z", totalScore: 70,
      answers: [
        { section: "writing", taskKey: "W1", value: "I can cover the inbox.", evidenceType: "text", prompt: "Viết email xác nhận." },
        { section: "speaking", taskKey: "S1", value: "audio evidence", evidenceType: "audio", prompt: "Giới thiệu công việc.", audioArtifact: {
          artifactKey: "assessment-audio/u1/s1.wav", mimeType: "audio/wav", sizeBytes: 42,
          signedUrl: "https://audio.example.test/s1.wav?signature=short-lived", expiresAt: "2026-10-14T08:35:00.000Z"
        } }
      ],
      scores: [{ section: "writing", score: 18, source: "ai", criteria: { rationale: "Rõ ý" } }],
      sections: [
        { section: "writing", label: "Viết", maxScore: 20, score: 18, source: "ai", criteria: { rationale: "Rõ ý" }, state: "scored", groups: [{ key: "writing", label: "Viết", tasks: [{ taskKey: "W1", prompt: "Viết email xác nhận.", answer: "I can cover the inbox.", maxScore: 20 }] }] },
        { section: "speaking", label: "Nói", maxScore: 20, score: null, source: null, criteria: {}, state: "not_scored", groups: [{ key: "speaking", label: "Nói", tasks: [{ taskKey: "S1", prompt: "Giới thiệu công việc.", answer: "audio evidence", maxScore: 20 }] }] }
      ],
      integrityEvents: [{ reason: "window_blur", occurredAt: "2026-10-14T08:10:00.000Z" }],
      decision: null, appeal: null
    };
    const getAssessmentReviewOverview = vi.fn().mockResolvedValue(overview);
    const getContentReviewAssessment = vi.fn().mockResolvedValue(detail);
    const client = { getAssessmentReviewOverview, getContentReviewAssessment };
    render(<MemoryRouter initialEntries={["/op"]}><OperatorRouteController session={operator} client={client as any} /></MemoryRouter>);
    await user.click(await screen.findByRole("button", { name: "Xem bài làm" }));
    const detailDialog = await screen.findByRole("dialog", { name: "Chi tiết bài test của Lan" });
    expect(detailDialog).toBeInTheDocument();
    expect(detailDialog).toHaveAttribute("aria-modal", "true");
    expect(detailDialog).toHaveClass("dialog");
    expect(detailDialog.parentElement).toHaveClass("modal-backdrop");
    expect(screen.getByText(/Bài test đầu vào · Chờ duyệt/)).toBeInTheDocument();
    expect(screen.getByText("I can cover the inbox.")).toBeInTheDocument();
    expect(screen.getByText(/Rời khỏi cửa sổ bài test/)).toBeInTheDocument();
    expect(screen.queryByText(/window_blur/)).not.toBeInTheDocument();
    expect(within(detailDialog).queryByText("ai")).not.toBeInTheDocument();
    expect(within(detailDialog).getByLabelText("Phát audio S1")).toHaveAttribute("src", detail.answers[1]!.audioArtifact!.signedUrl!);
    expect(getContentReviewAssessment).toHaveBeenCalledWith("a1");

    cleanup();
    render(<MemoryRouter initialEntries={["/op"]}><OperatorRouteController session={manager} client={client as any} /></MemoryRouter>);
    await user.click(await screen.findByRole("button", { name: "Xem bài làm" }));
    expect(await screen.findByRole("dialog", { name: "Chi tiết bài test của Lan" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Duyệt mức" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Chấm lại bằng AI" })).toBeDisabled();
  });

  it("opens the pending learner profile inline inside the assessment card", async () => {
    const user = userEvent.setup();
    const overview = {
      pendingAssessments: [{ attemptId: "attempt-1", learnerId: "u1", learnerName: "Lan", kind: "placement", title: "Bài test đầu vào", submittedAt: "2026-10-21T08:00:00.000Z", sectionScores: {}, suggestedLevel: null, profileComplete: true }], pendingLevelUp: [], approvedLearners: [],
      unassessedLearners: [],
      levelSignals: { windowDays: 14, ready: [], weak: [] }, topicReports: []
    };
    const getAssessmentReviewLearner = vi.fn().mockResolvedValue({
      learner: { id: "u1", displayName: "Lan", email: null, status: "active", createdAt: "2026-10-01", currentLevel: "A2", cefrApproved: true, pendingLevel: null },
      profile: { position: "QA", email: "lan@example.com" }, monthlyGoal: "Email khách hàng", levelHistory: [], attempts: [], deletionRequests: []
    });
    render(<MemoryRouter initialEntries={["/op"]}><OperatorRouteController session={operator} client={{ getAssessmentReviewOverview: vi.fn().mockResolvedValue(overview), getAssessmentReviewLearner } as any} /></MemoryRouter>);
    const profileButton = await screen.findByRole("button", { name: /Hồ sơ:/i });
    expect(screen.queryByRole("button", { name: "Hồ sơ" })).not.toBeInTheDocument();
    await user.click(profileButton);

    const profile = await screen.findByRole("region", { name: "Hồ sơ cá nhân" });
    expect(profile).toHaveTextContent("lan@example.com");
    expect(getAssessmentReviewLearner).toHaveBeenCalledWith("u1");
    expect(screen.queryByRole("dialog", { name: "Hồ sơ · Lan" })).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /Hồ sơ:/i }));
    expect(screen.queryByRole("region", { name: "Hồ sơ cá nhân" })).not.toBeInTheDocument();
  });

  it("connects approved-learner level, goal, and profile buttons to their APIs", async () => {
    const user = userEvent.setup();
    const overview = {
      pendingAssessments: [], pendingLevelUp: [], unassessedLearners: [], topicReports: [],
      approvedLearners: [{ learnerId: "u5", learnerName: "Vy", currentLevel: "A2", placementScore: 81, monthlyGoal: "Email khách hàng" }],
      levelSignals: { windowDays: 14, ready: [], weak: [] }
    };
    const getAssessmentReviewOverview = vi.fn().mockResolvedValue(overview);
    const changeAssessmentReviewLearnerLevel = vi.fn().mockResolvedValue({});
    const updateAssessmentReviewMonthlyGoal = vi.fn().mockResolvedValue({});
    const getAssessmentReviewLearner = vi.fn().mockResolvedValue({
      learner: { id: "u5", displayName: "Vy", email: "vy@example.com", status: "active", createdAt: "2026-10-01", currentLevel: "A2", cefrApproved: true, pendingLevel: null },
      profile: { position: "Tester" }, monthlyGoal: "Email khách hàng", levelHistory: [], attempts: [], deletionRequests: []
    });
    const client = { getAssessmentReviewOverview, changeAssessmentReviewLearnerLevel, updateAssessmentReviewMonthlyGoal, getAssessmentReviewLearner };
    render(<MemoryRouter initialEntries={["/op"]}><OperatorRouteController session={operator} client={client as any} /></MemoryRouter>);

    await user.click(await screen.findByRole("button", { name: "Đổi level" }));
    await user.type(screen.getByLabelText("Mức CEFR (A1/A2/B1/B2/C1)"), "B1");
    await user.click(screen.getByRole("button", { name: "Tiếp tục" }));
    await user.type(await screen.findByLabelText("Lý do"), "Đã sẵn sàng");
    await user.click(screen.getByRole("button", { name: "Tiếp tục" }));
    await user.type(await screen.findByLabelText("Bằng chứng / ghi chú"), "Kết quả học tập");
    await user.click(screen.getByRole("button", { name: "Xác nhận" }));
    await waitFor(() => expect(changeAssessmentReviewLearnerLevel).toHaveBeenCalledWith("u5", {
      mode: "direct", targetLevel: "B1", reason: "Đã sẵn sàng", evidence: "Kết quả học tập"
    }));

    await user.click(screen.getByRole("button", { name: "Mục tiêu" }));
    await user.type(await screen.findByLabelText("Mục tiêu tháng mới"), "Luyện họp ngắn");
    await user.click(screen.getByRole("button", { name: "Lưu" }));
    await waitFor(() => expect(updateAssessmentReviewMonthlyGoal).toHaveBeenCalledWith("u5", "Luyện họp ngắn"));

    await user.click(screen.getByRole("button", { name: "Hồ sơ" }));
    expect(await screen.findByRole("dialog", { name: "Hồ sơ · Vy" })).toHaveTextContent("vy@example.com");
    expect(getAssessmentReviewLearner).toHaveBeenCalledWith("u5");
  });

  it("hydrates a pending card from the persisted attempt and learner profile", async () => {
    const overview = {
      pendingAssessments: [{ attemptId: "attempt-1", learnerId: "learner-1", learnerName: "Media GFT", kind: "placement", title: "Bài test đầu vào", submittedAt: "2026-10-21T08:57:43.626Z", sectionScores: {}, suggestedLevel: "A1", profileComplete: true }],
      pendingLevelUp: [], approvedLearners: [], unassessedLearners: [],
      levelSignals: { windowDays: 14, ready: [], weak: [] }, topicReports: []
    };
    const detail: ContentReviewAssessmentDetailView = {
      attemptId: "attempt-1", learnerId: "learner-1", learnerName: "Media GFT", kind: "placement", title: "Bài test đầu vào",
      status: "pending_review", startedAt: "2026-10-21T08:31:32.829Z", submittedAt: "2026-10-21T08:57:43.626Z", totalScore: 3, overallCefr: "A1",
      answers: [{ section: "writing", taskKey: "W1", value: "A real saved answer", evidenceType: "text" }],
      sections: [
        { section: "listening", label: "Nghe", maxScore: 20, score: 2, source: "deterministic", criteria: {}, state: "scored" },
        { section: "reading", label: "Đọc", maxScore: 40, score: 1, source: "deterministic", criteria: {}, state: "scored" },
        { section: "writing", label: "Viết", maxScore: 20, score: 0, source: "ai", criteria: { rationale: "Nhận xét thật từ lần chấm AI", monthlyGoal: "Luyện email công việc" }, state: "scored" },
        { section: "speaking", label: "Nói", maxScore: 20, score: 0, source: "ai", criteria: {}, state: "scored" }
      ],
      scores: [{ section: "writing", score: 0, source: "ai", criteria: { rationale: "Nhận xét thật từ lần chấm AI", monthlyGoal: "Luyện email công việc" } }],
      integrityEvents: [], decision: null, appeal: null
    };
    const profile = {
      learner: { id: "learner-1", displayName: "Media GFT", email: "gfts.aimedia@gmail.com", status: "active", createdAt: "2026-10-01", currentLevel: "A1", cefrApproved: false, pendingLevel: null },
      profile: { selfLevel: "unknown", learningStyles: ["reading"] }, monthlyGoal: "Luyện email công việc", levelHistory: [], attempts: [], deletionRequests: []
    };
    const getContentReviewAssessment = vi.fn().mockResolvedValue(detail);
    const getAssessmentReviewLearner = vi.fn().mockResolvedValue(profile);

    render(<MemoryRouter initialEntries={["/op"]}><OperatorRouteController session={operator} client={{ getAssessmentReviewOverview: vi.fn().mockResolvedValue(overview), getContentReviewAssessment, getAssessmentReviewLearner } as any} /></MemoryRouter>);

    expect(await screen.findByText(/tổng 3\/100/)).toBeInTheDocument();
    expect(screen.getByText("10%")).toBeInTheDocument();
    expect(screen.getByText("2.5%")).toBeInTheDocument();
    expect(screen.getByText("Nhận xét thật từ lần chấm AI")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Hồ sơ:.*Không rõ.*Đọc và ghi chú/i })).toBeInTheDocument();
    expect(getContentReviewAssessment).toHaveBeenCalledWith("attempt-1");
    expect(getAssessmentReviewLearner).toHaveBeenCalledWith("learner-1");
  });

  it("opens persisted level-up challenge evidence instead of hiding the action", async () => {
    const user = userEvent.setup();
    const overview = {
      pendingAssessments: [], pendingLevelUp: [{ attemptId: "a2", learnerId: "u2", learnerName: "Minh", kind: "level_up", title: "Lên mức", submittedAt: "2026-10-14", sectionScores: { reading: 80 }, suggestedLevel: "B1", challenge: { completedTurns: 2, requiredTurns: 6, average: 4, offTopic: 0, complete: false, passed: false } }],
      approvedLearners: [], unassessedLearners: [], levelSignals: { windowDays: 14, ready: [], weak: [] }, topicReports: []
    };
    const getAssessmentReviewChallenge = vi.fn().mockResolvedValue({
      sessionId: "session-1", assessmentAttemptId: "a2", targetLevel: "B1", status: "active",
      progress: { completedTurns: 2, requiredTurns: 6, average: 4, offTopic: 0, complete: false, passed: false },
      turns: [{ id: "turn-1", turnNumber: 1, speaker: "learner", text: "I can explain the project.", coachText: "Tell me about the deadline.", feedback: { relevant: true }, createdAt: "2026-10-14T08:00:00.000Z" }]
    });
    render(<MemoryRouter initialEntries={["/op"]}><OperatorRouteController session={operator} client={{ getAssessmentReviewOverview: vi.fn().mockResolvedValue(overview), getAssessmentReviewChallenge } as any} /></MemoryRouter>);
    await user.click(await screen.findByRole("button", { name: "Thử thách" }));

    const dialog = await screen.findByRole("dialog", { name: "Thử thách · B1 · Minh" });
    expect(dialog).toHaveClass("wide");
    expect(within(dialog).getByRole("heading", { name: "Thử thách lên mức B1 – Minh" })).toBeInTheDocument();
    expect(within(dialog).getByText(/Tiến độ thử thách/)).toBeInTheDocument();
    expect(within(dialog).getByText("I can explain the project.")).toBeInTheDocument();
    expect(within(dialog).getByText("Tell me about the deadline.")).toBeInTheDocument();
    expect(getAssessmentReviewChallenge).toHaveBeenCalledWith("a2");
  });

  it("renders persisted weekly-practice type and task instead of API placeholders", async () => {
    const review: ContentReviewView = {
      tabs: [
        { key: "submissions", label: "Bài nộp", count: 1, unreadCount: 1 },
        { key: "coach", label: "Phản hồi coach", count: 0 },
        { key: "micro", label: "Bài siêu ngắn", count: 0 },
        { key: "appeals", label: "Kháng nghị", count: 0 },
        { key: "attempts", label: "Số lần làm bài", count: 0 },
        { key: "assessments", label: "Bài test", count: 0 }
      ],
      coachSamples: [],
      submissions: [{
        id: "submission-1", learnerName: "Lan", cefr: "A2", weekNumber: 2,
        submittedAt: "2026-10-14T08:00:00.000Z", checked: false, text: "I work in product.",
        total: null, rubric: { meaning: null, vocabulary: null, grammar: null }, feedback: "", suggestions: [],
        type: "writing", task: "Viết email xin dời lịch họp theo chủ đề Meetings."
      }],
      microLessons: [], appeals: [], lessonAttempts: [], assessments: []
    };
    const getContentReview = vi.fn().mockResolvedValue(review);
    render(<MemoryRouter initialEntries={[{ pathname: "/op/review", state: { reviewTab: "subs" } }]}><OperatorRouteController session={operator} client={{ getContentReview } as any} /></MemoryRouter>);

    expect(await screen.findByText(/Viết · 14\/10 \d{2}:\d{2}/)).toBeInTheDocument();
    const taskSection = screen.getByText("Đề bài").closest("section");
    expect(taskSection).not.toBeNull();
    expect(within(taskSection!).getByText("Viết email xin dời lịch họp theo chủ đề Meetings.")).toBeInTheDocument();
    expect(screen.queryByText(/loại bài chưa có trong API/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/API chưa cung cấp nội dung đề/i)).not.toBeInTheDocument();
  });

  it("resolves Season and weekly audio by the artifact key persisted on each review item", async () => {
    const user = userEvent.setup();
    const review: ContentReviewView = {
      tabs: [
        { key: "submissions", label: "Bài nộp", count: 1, unreadCount: 1 },
        { key: "coach", label: "Phản hồi coach", count: 1 },
        { key: "micro", label: "Bài siêu ngắn", count: 0 },
        { key: "appeals", label: "Kháng nghị", count: 0 },
        { key: "attempts", label: "Số lần làm bài", count: 0 },
        { key: "assessments", label: "Bài test", count: 0 }
      ],
      submissions: [{
        id: "submission-1", learnerName: "Lan", cefr: "A2", weekNumber: 2,
        submittedAt: "2026-10-14T08:00:00.000Z", checked: false, text: "Weekly transcript",
        total: null, rubric: { meaning: null, vocabulary: null, grammar: null }, feedback: "", suggestions: [],
        audioArtifact: { artifactKey: "audio/weekly-current.webm" }
      }],
      coachSamples: [{
        id: "turn-1", learnerName: "Lan", cefr: "A2", weekNumber: 2,
        createdAt: "2026-10-14T09:00:00.000Z", checked: false, learnerText: "Season transcript", coachText: "Good.",
        scores: { meaning: null, vocabulary: null, grammar: null }, suggestions: [],
        audioArtifact: { artifactKey: "audio/season-current.webm" }
      }],
      microLessons: [], appeals: [], lessonAttempts: [], assessments: []
    };
    const listAssessmentAudio = vi.fn().mockResolvedValue({ items: [
      { fileId: "current-weekly", artifactKey: "audio/weekly-current.webm", sourceFlow: "weekly_practice", sourceEntityId: "submission-1", signedUrl: "/audio/weekly-current.webm" },
      { fileId: "old-weekly", artifactKey: "audio/weekly-old.webm", sourceFlow: "weekly_practice", sourceEntityId: "submission-1", signedUrl: "/audio/weekly-old.webm" },
      { fileId: "current-season", artifactKey: "audio/season-current.webm", sourceFlow: "season", sourceEntityId: "turn-1", signedUrl: "/audio/season-current.webm" },
      { fileId: "old-season", artifactKey: "audio/season-old.webm", sourceFlow: "season", sourceEntityId: "turn-1", signedUrl: "/audio/season-old.webm" }
    ] });
    render(<MemoryRouter initialEntries={[{ pathname: "/op/review", state: { reviewTab: "subs" } }]}><OperatorRouteController session={operator} client={{ getContentReview: vi.fn().mockResolvedValue(review), listAssessmentAudio } as any} /></MemoryRouter>);

    expect(await screen.findByLabelText("Phát Bản ghi âm bài nộp của Lan")).toHaveAttribute("src", "/audio/weekly-current.webm");
    await user.click(screen.getByRole("tab", { name: "Phản hồi AI Coach (1)" }));
    expect(await screen.findByLabelText("Phát Bản ghi âm Season của Lan")).toHaveAttribute("src", "/audio/season-current.webm");
  });

  it("keeps review metadata honest when an older submission has no type or task", async () => {
    const review: ContentReviewView = {
      tabs: [
        { key: "submissions", label: "Bài nộp", count: 1, unreadCount: 1 },
        { key: "coach", label: "Phản hồi coach", count: 0 },
        { key: "micro", label: "Bài siêu ngắn", count: 0 },
        { key: "appeals", label: "Kháng nghị", count: 0 },
        { key: "attempts", label: "Số lần làm bài", count: 0 },
        { key: "assessments", label: "Bài test", count: 0 }
      ],
      coachSamples: [],
      submissions: [{
        id: "legacy-submission", learnerName: "Lan", cefr: "A2", weekNumber: 2,
        submittedAt: "2026-10-14T08:00:00.000Z", checked: false, text: "I work in product.",
        total: null, rubric: { meaning: null, vocabulary: null, grammar: null }, feedback: "", suggestions: []
      }],
      microLessons: [], appeals: [], lessonAttempts: [], assessments: []
    };
    render(<MemoryRouter initialEntries={[{ pathname: "/op/review", state: { reviewTab: "subs" } }]}><OperatorRouteController session={operator} client={{ getContentReview: vi.fn().mockResolvedValue(review) } as any} /></MemoryRouter>);

    expect(await screen.findByText(/Tuần 2 · — ·/)).toBeInTheDocument();
    const taskSection = screen.getByText("Đề bài").closest("section");
    expect(taskSection).not.toBeNull();
    expect(within(taskSection!).getByText("—")).toBeInTheDocument();
    expect(screen.queryByText(/loại bài chưa có trong API/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/API chưa cung cấp nội dung đề/i)).not.toBeInTheDocument();
  });

  it("uses a neutral raw-level fallback for assessments without persisted scoring", async () => {
    const review: ContentReviewView = {
      tabs: [
        { key: "submissions", label: "Bài nộp", count: 0, unreadCount: 0 },
        { key: "coach", label: "Phản hồi coach", count: 0 },
        { key: "micro", label: "Bài siêu ngắn", count: 0 },
        { key: "appeals", label: "Kháng nghị", count: 0 },
        { key: "attempts", label: "Số lần làm bài", count: 0 },
        { key: "assessments", label: "Bài test", count: 1 }
      ],
      coachSamples: [], submissions: [], microLessons: [], appeals: [], lessonAttempts: [],
      assessments: [{ id: "attempt-1", learnerName: "Lan", kind: "placement", title: "Đầu vào", status: "pending_review", submittedAt: "2026-10-14T08:00:00.000Z", totalScore: null }]
    };
    render(<MemoryRouter initialEntries={["/op/tests"]}><OperatorRouteController session={operator} client={{ getContentReview: vi.fn().mockResolvedValue(review) } as any} /></MemoryRouter>);

    expect(await screen.findByText("Lan")).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Đề đầu vào" })).toHaveAttribute("aria-selected", "true");
    expect(screen.getAllByText("—").length).toBeGreaterThan(0);
    expect(screen.queryByText("API chưa cung cấp")).not.toBeInTheDocument();
  });

});
