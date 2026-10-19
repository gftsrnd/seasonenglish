// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { MemoryRouter } from "react-router";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ContentLessonMatrixView, ContentLessonSetVersionView, ContentReviewAssessmentDetailView, ContentReviewView, SessionView } from "@e4s/contracts";
import { OperatorRouteController } from "./OperatorRouteController.js";

afterEach(cleanup);

const operator = { role: "operator", user: { id: "op", displayName: "Operator", email: null }, permissions: ["content:operate", "assessment:review", "prompt:manage"] } as SessionView;
const manager = { role: "manager", user: { id: "mgr", displayName: "Manager", email: null }, permissions: ["content:operate", "assessment:review", "prompt:manage"] } as SessionView;

describe("OperatorRouteController", () => {
  it("loads the real week contract for /op/weeks and persists edited frames", async () => {
    const user = userEvent.setup();
    const weeks = { pilot: { startDate: "2026-10-05", weekCount: 1 }, weeks: [{ id: "w1", weekNumber: 1, startDate: "2026-10-05", endDate: "2026-10-11", current: true, topic: "Meetings", description: "", objectives: "", keyVocabHint: "" }] };
    const client = { getContentWeeks: vi.fn().mockResolvedValue(weeks), saveContentWeeks: vi.fn().mockResolvedValue(weeks), suggestContentWeeks: vi.fn() };
    render(<MemoryRouter initialEntries={["/op/weeks"]}><OperatorRouteController session={operator} client={client as any} /></MemoryRouter>);
    expect(await screen.findByRole("heading", { name: "Khung chủ đề tuần" })).toBeInTheDocument();
    expect(screen.getByText(/Pilot: 1 tuần, từ 05\/10\./)).toBeInTheDocument();
    expect(screen.getByText(/05\/10 – 11\/10/)).toBeInTheDocument();
    await user.clear(screen.getByLabelText("Chủ đề *"));
    await user.type(screen.getByLabelText("Chủ đề *"), "Customer calls");
    await user.click(screen.getByRole("button", { name: "Lưu khung chủ đề" }));
    await waitFor(() => expect(client.saveContentWeeks).toHaveBeenCalledWith([{ weekNumber: 1, topic: "Customer calls", description: "", objectives: "", keyVocabHint: "" }]));
  });

  it("renders the same prompt controls for Manager but keeps every mutation disabled", async () => {
    const client = { getContentPrompts: vi.fn().mockResolvedValue({ groups: [
      { key: "system_rules", label: "Quy tắc chung", content: "current", defaultContent: "default", version: 1, status: "active" },
      { key: "assessment_scoring", label: "Chấm test", content: "score", defaultContent: "score default", version: 1, status: "active" }
    ] }) };
    render(<MemoryRouter initialEntries={["/op/prompts"]}><OperatorRouteController session={manager} client={client as any} /></MemoryRouter>);
    expect(await screen.findByRole("heading", { name: "Prompt & rubric" })).toBeInTheDocument();
    screen.getAllByRole("button", { name: "Về mặc định" }).forEach(button => expect(button).toBeDisabled());
    expect(screen.getByRole("button", { name: "Lưu prompt" })).toBeDisabled();
    expect(screen.getByRole("textbox", { name: "Quy tắc chung (mọi lời gọi trừ sinh bài siêu ngắn)" })).toHaveAttribute("readonly");
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
    expect(unavailable).toHaveAttribute("title", expect.stringMatching(/API/i));
    expect(screen.getByRole("button", { name: "Duyệt mức" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Duyệt mức" })).toHaveAttribute("title", expect.stringMatching(/API/i));
    expect(screen.getByRole("button", { name: "Duyệt lên mức" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Từ chối" })).toBeDisabled();
    expect(screen.getByText(/Một số thao tác đang khóa vì API/i)).toBeInTheDocument();
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

  it("wires the Operator rescore action to the real client and keeps Manager read-only", async () => {
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
    expect(screen.getByRole("button", { name: "Chấm lại bằng AI" })).toBeDisabled();
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
    expect(screen.getByText(/Bài test đầu vào · placement · pending_review/)).toBeInTheDocument();
    expect(screen.getByText(/Viết email xác nhận\./)).toBeInTheDocument();
    expect(screen.getByText(/window_blur/)).toBeInTheDocument();
    expect(within(detailDialog).getByText("ai")).toBeInTheDocument();
    expect(within(detailDialog).getByLabelText("Phát audio S1")).toHaveAttribute("src", detail.answers[1]!.audioArtifact!.signedUrl!);
    expect(getContentReviewAssessment).toHaveBeenCalledWith("a1");

    cleanup();
    render(<MemoryRouter initialEntries={["/op"]}><OperatorRouteController session={manager} client={client as any} /></MemoryRouter>);
    await user.click(await screen.findByRole("button", { name: "Xem bài làm" }));
    expect(await screen.findByRole("dialog", { name: "Chi tiết bài test của Lan" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Duyệt mức" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Chấm lại bằng AI" })).toBeDisabled();
  });

  it("opens profile evidence in the app modal layer", async () => {
    const user = userEvent.setup();
    const overview = {
      pendingAssessments: [], pendingLevelUp: [], approvedLearners: [],
      unassessedLearners: [{ learnerId: "u1", learnerName: "Lan", profileComplete: true }],
      levelSignals: { windowDays: 14, ready: [], weak: [] }, topicReports: []
    };
    const getAssessmentReviewLearner = vi.fn().mockResolvedValue({
      learner: { id: "u1", displayName: "Lan", email: null, status: "active", createdAt: "2026-10-01", currentLevel: "A2", cefrApproved: true, pendingLevel: null },
      profile: { position: "QA" }, monthlyGoal: "Email khách hàng", levelHistory: [], attempts: [], deletionRequests: []
    });
    render(<MemoryRouter initialEntries={["/op"]}><OperatorRouteController session={operator} client={{ getAssessmentReviewOverview: vi.fn().mockResolvedValue(overview), getAssessmentReviewLearner } as any} /></MemoryRouter>);
    const profileButton = await screen.findByRole("button", { name: "Hồ sơ" });
    await user.click(profileButton);

    const dialog = await screen.findByRole("dialog", { name: "Hồ sơ · Lan" });
    expect(dialog).toHaveClass("dialog");
    expect(dialog).not.toHaveClass("wide");
    expect(dialog.parentElement).toHaveClass("modal-backdrop");
    expect(within(dialog).getByRole("heading", { name: "Lan" })).toBeInTheDocument();
    expect(within(dialog).getByText(/QA/)).toBeInTheDocument();
    expect(getAssessmentReviewLearner).toHaveBeenCalledWith("u1");
    expect(within(dialog).getByRole("button", { name: "Đóng" })).toHaveFocus();

    await user.keyboard("{Escape}");

    expect(screen.queryByRole("dialog", { name: "Hồ sơ · Lan" })).not.toBeInTheDocument();
    expect(profileButton).toHaveFocus();
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
    render(<MemoryRouter initialEntries={["/op/review"]}><OperatorRouteController session={operator} client={{ getContentReview } as any} /></MemoryRouter>);

    expect(await screen.findByText(/Viết · 14\/10 \d{2}:\d{2}/)).toBeInTheDocument();
    expect(screen.getByText("Đề: Viết email xin dời lịch họp theo chủ đề Meetings.")).toBeInTheDocument();
    expect(screen.queryByText(/loại bài chưa có trong API/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/API chưa cung cấp nội dung đề/i)).not.toBeInTheDocument();
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
    render(<MemoryRouter initialEntries={["/op/review"]}><OperatorRouteController session={operator} client={{ getContentReview: vi.fn().mockResolvedValue(review) } as any} /></MemoryRouter>);

    expect(await screen.findByText(/Tuần 2 · — ·/)).toBeInTheDocument();
    expect(screen.getByText("Đề: —")).toBeInTheDocument();
    expect(screen.queryByText(/loại bài chưa có trong API/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/API chưa cung cấp nội dung đề/i)).not.toBeInTheDocument();
  });

  it("formats persisted lesson-matrix timestamps like the app", async () => {
    const matrix: ContentLessonMatrixView = {
      levels: [{ cefr: "A2", learnerCount: 1 }],
      weeks: [{
        weekNumber: 1, topic: "Meetings", cells: [{
          cefr: "A2", status: "published", versionId: "version-1", version: 1, updatedAt: "2026-10-14T08:00:00.000Z", lessons: []
        }]
      }]
    };
    render(<MemoryRouter initialEntries={["/op/lessons"]}><OperatorRouteController session={operator} client={{ getContentLessonMatrix: vi.fn().mockResolvedValue(matrix), getSystemCapabilities: vi.fn().mockResolvedValue({ ai: false }) } as any} /></MemoryRouter>);

    expect(await screen.findByText(/0 bài · 14\/10 \d{2}:\d{2}/)).toBeInTheDocument();
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
    render(<MemoryRouter initialEntries={[{ pathname: "/op/review", state: { reviewTab: "tests" } }]}><OperatorRouteController session={operator} client={{ getContentReview: vi.fn().mockResolvedValue(review) } as any} /></MemoryRouter>);

    expect(await screen.findByText("Lan")).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Bài test (1)" })).toHaveAttribute("aria-selected", "true");
    expect(screen.getAllByText("—").length).toBeGreaterThan(0);
    expect(screen.queryByText("API chưa cung cấp")).not.toBeInTheDocument();
  });

  it("reads lesson-detail route params and fetches the matching real lesson set", async () => {
    const client = { getContentLessonSet: vi.fn().mockResolvedValue({ lessonSetId: "ls", versionId: "v1", version: 1, status: "draft", weekNumber: 2, topic: "Meetings", cefr: "A2", explanationLanguage: "Tiếng Việt", createdBy: "op", approvedBy: null, createdAt: "2026-10-14", publishedAt: null, lessons: [] }) };
    render(<MemoryRouter initialEntries={["/op/lessons/2/A2"]}><OperatorRouteController session={operator} client={client as any} /></MemoryRouter>);
    expect(await screen.findByRole("heading", { name: /Tuần 2 · Mức A2/ })).toBeInTheDocument();
    expect(client.getContentLessonSet).toHaveBeenCalledWith(2, "A2");
  });

  it("renders the persisted lesson practice answer instead of a transport placeholder", async () => {
    const client = { getContentLessonSet: vi.fn().mockResolvedValue({
      lessonSetId: "ls", versionId: "v1", version: 1, status: "draft", weekNumber: 2, topic: "Meetings", cefr: "A2", explanationLanguage: "Tiếng Việt", createdBy: "op", approvedBy: null, createdAt: "2026-10-14", publishedAt: null,
      lessons: [{ id: "lesson-1", dayNumber: 1, title: "Mở đầu cuộc họp", durationMinutes: 10, practiceLabel: "điền từ · đáp án: start", parts: [] }]
    }) };
    render(<MemoryRouter initialEntries={["/op/lessons/2/A2"]}><OperatorRouteController session={operator} client={client as any} /></MemoryRouter>);

    expect(await screen.findByText("điền từ · đáp án: start")).toBeInTheDocument();
    expect(screen.queryByText(/API chưa cung cấp/i)).not.toBeInTheDocument();
  });

  it("exposes persisted lesson enrichment actions to Operator and keeps them read-only for Manager", async () => {
    const user = userEvent.setup();
    const detail: ContentLessonSetVersionView = {
      lessonSetId: "ls", versionId: "v1", version: 1, status: "draft", weekNumber: 2, topic: "Meetings", cefr: "A2",
      explanationLanguage: "Tiếng Việt", createdBy: "op", approvedBy: null, createdAt: "2026-10-14", publishedAt: null,
      lessons: [{
        id: "lesson-1", dayNumber: 1, title: "Mở đầu cuộc họp", durationMinutes: 10, practiceLabel: "điền từ",
        parts: [
          { code: "objective", title: "Mục tiêu", content: { text: "Mục tiêu" } },
          { code: "instruction", title: "Hướng dẫn", content: { text: "Hướng dẫn" } },
          { code: "vocabulary", title: "Từ vựng", content: { items: [{ word: "agenda", examples: ["the agenda"] }] } },
          { code: "grammar", title: "Ngữ pháp", content: { formula: "We have..." } },
          { code: "pronunciation", title: "Phát âm", content: { focus: "/æ/" } },
          { code: "listening", title: "Nghe", content: { prompt: "Which meeting?", options: ["A", "B", "C"], answer: "A" } },
          { code: "reading", title: "Đọc", content: { prompt: "Which room?", options: ["A", "B", "C"], answer: "A" } },
          { code: "writing", title: "Viết", content: { prompt: "Write one line." } },
          { code: "speaking", title: "Nói", content: { prompt: "Introduce the meeting." } }
        ]
      }]
    };
    const getContentLessonSet = vi.fn().mockResolvedValue(detail);
    const getSystemCapabilities = vi.fn().mockResolvedValue({ ai: true });
    const fillContentLessonPhrases = vi.fn().mockResolvedValue(detail);
    const enrichContentLessonDraft = vi.fn().mockResolvedValue(detail);
    const client = { getContentLessonSet, getSystemCapabilities, fillContentLessonPhrases, enrichContentLessonDraft };
    render(<MemoryRouter initialEntries={["/op/lessons/2/A2"]}><OperatorRouteController session={operator} client={client as any} /></MemoryRouter>);
    expect(await screen.findByRole("heading", { name: /Tuần 2 · Mức A2/ })).toBeInTheDocument();
    const fillButton = await screen.findByRole("button", { name: /Bổ sung cụm từ bằng AI/ });
    const enrichButton = screen.getByRole("button", { name: /Bổ sung bằng AI/ });
    expect(fillButton).toBeEnabled();
    expect(enrichButton).toBeEnabled();
    await user.click(fillButton);
    await waitFor(() => expect(fillContentLessonPhrases).toHaveBeenCalledWith(2, "A2", 1));
    await user.click(enrichButton);
    await waitFor(() => expect(enrichContentLessonDraft).toHaveBeenCalledWith(2, "A2", 1));

    cleanup();
    render(<MemoryRouter initialEntries={["/op/lessons/2/A2"]}><OperatorRouteController session={manager} client={client as any} /></MemoryRouter>);
    expect(await screen.findByRole("heading", { name: /Tuần 2 · Mức A2/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Bổ sung cụm từ bằng AI/ })).toBeDisabled();
    expect(screen.getByRole("button", { name: /Bổ sung bằng AI/ })).toBeDisabled();
  });

  it("renders structured lesson content instead of transport JSON", async () => {
    const detail: ContentLessonSetVersionView = {
      lessonSetId: "ls", versionId: "v1", version: 1, status: "draft", weekNumber: 2, topic: "Meetings", cefr: "A2",
      explanationLanguage: "Tiếng Việt", createdBy: "op", approvedBy: null, createdAt: "2026-10-14", publishedAt: null,
      lessons: [{ id: "lesson-1", dayNumber: 1, title: "Opening a meeting", durationMinutes: 10, practiceLabel: "điền từ · đáp án: start", parts: [
        { code: "objective", title: "Mục tiêu", content: { text: "Mở đầu cuộc họp rõ ràng." } },
        { code: "vocabulary", title: "Từ vựng", content: { items: [{ word: "agenda", pronunciation: "/əˈdʒendə/", meaning: "chương trình", examples: ["share the agenda", "review the agenda", "meeting agenda"] }] } },
        { code: "listening", title: "Nghe", content: { script: "Let's start.", prompt: "What starts?", options: ["The meeting", "Lunch", "A call", "A break"], answer: "The meeting" } }
      ] }]
    };
    render(<MemoryRouter initialEntries={["/op/lessons/2/A2"]}><OperatorRouteController session={operator} client={{ getContentLessonSet: vi.fn().mockResolvedValue(detail) } as any} /></MemoryRouter>);
    expect(await screen.findByText("Mở đầu cuộc họp rõ ràng.")).toBeInTheDocument();
    expect(screen.getByText("agenda")).toBeInTheDocument();
    const correctOption = screen.getByText("The meeting", { exact: true }).closest("li");
    expect(correctOption?.querySelector("svg.lucide-check")).not.toBeNull();
    expect(screen.queryByText(/\"script\":/)).not.toBeInTheDocument();
  });
});
