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

  it("shows week save feedback as a toast instead of below the topic instructions", async () => {
    const user = userEvent.setup();
    const weeks = { pilot: { startDate: "2026-10-05", weekCount: 1 }, weeks: [{ id: "w1", weekNumber: 1, startDate: "2026-10-05", endDate: "2026-10-11", current: true, topic: "Meetings", description: "", objectives: "", keyVocabHint: "" }] };
    const client = { getContentWeeks: vi.fn().mockResolvedValue(weeks), saveContentWeeks: vi.fn().mockResolvedValue(weeks), suggestContentWeeks: vi.fn() };
    render(<MemoryRouter initialEntries={["/op/weeks"]}><OperatorRouteController session={operator} client={client as any} /></MemoryRouter>);

    await user.click(await screen.findByRole("button", { name: "Lưu khung chủ đề" }));

    const feedback = await screen.findByText("Đã lưu khung chủ đề.");
    expect(feedback.closest(".operator-toast")).not.toBeNull();
    expect(document.querySelector(".operator-status-message")).toBeNull();
  });

  it("persists the confirmed five-day plan with the week frame", async () => {
    const user = userEvent.setup();
    const weeks = { pilot: { startDate: "2026-10-05", weekCount: 1 }, weeks: [{ id: "w1", weekNumber: 1, startDate: "2026-10-05", endDate: "2026-10-11", current: true, topic: "", description: "", objectives: "", keyVocabHint: "" }] };
    const plan = { A2: ["Mon", "Tue", "Wed", "Thu", "Fri"] };
    const saveContentWeeks = vi.fn().mockResolvedValue(weeks);
    const client = {
      getContentWeeks: vi.fn().mockResolvedValue(weeks),
      saveContentWeeks,
      suggestContentWeeks: vi.fn().mockResolvedValue({ weeks: [{ weekNumber: 1, levels: ["A2"], options: [{ topic: "Meetings", description: "Lịch họp", objectives: "Xác nhận lịch", keyVocabHint: "schedule", plan }] }] }),
      getSystemCapabilities: vi.fn().mockResolvedValue({ ai: true })
    };
    render(<MemoryRouter initialEntries={["/op/weeks"]}><OperatorRouteController session={operator} client={client as any} /></MemoryRouter>);

    await user.click(await screen.findByRole("button", { name: "Gợi ý" }));
    await user.click(await screen.findByRole("button", { name: "Xác nhận phương án này" }));

    await waitFor(() => expect(saveContentWeeks).toHaveBeenCalledWith([{ weekNumber: 1, topic: "Meetings", description: "Lịch họp", objectives: "Xác nhận lịch", keyVocabHint: "schedule", plan }]));
  });

  it("generates every level sequentially after confirming a week", async () => {
    const user = userEvent.setup();
    const weeks = { pilot: { startDate: "2026-10-05", weekCount: 1 }, weeks: [{ id: "w1", weekNumber: 1, startDate: "2026-10-05", endDate: "2026-10-11", current: true, topic: "", description: "", objectives: "", keyVocabHint: "" }] };
    const plan = { A1: ["Hello", "Name", "Job", "Ask", "Goodbye"], A2: ["Meet", "Role", "Team", "Ask", "Close"] };
    let running = 0;
    let maxRunning = 0;
    const order: string[] = [];
    const generateContentLessonDraft = vi.fn(async (_week: number, cefr: string) => {
      running += 1;
      maxRunning = Math.max(maxRunning, running);
      order.push(`start-${cefr}`);
      await Promise.resolve();
      order.push(`end-${cefr}`);
      running -= 1;
      return {};
    });
    const client = {
      getContentWeeks: vi.fn().mockResolvedValue(weeks),
      saveContentWeeks: vi.fn().mockResolvedValue(weeks),
      suggestContentWeeks: vi.fn().mockResolvedValue({ weeks: [{ weekNumber: 1, levels: ["A1", "A2"], options: [{ topic: "Meetings", description: "Lịch họp", objectives: "Xác nhận lịch", keyVocabHint: "schedule", plan }] }] }),
      generateContentLessonDraft,
      getContentLessonMatrix: vi.fn().mockResolvedValue({ levels: [{ cefr: "A1", learnerCount: 0 }, { cefr: "A2", learnerCount: 0 }], weeks: [{ weekNumber: 1, topic: "Meetings", cells: [] }] }),
      getSystemCapabilities: vi.fn().mockResolvedValue({ ai: true })
    };
    render(<MemoryRouter initialEntries={["/op/weeks"]}><OperatorRouteController session={operator} client={client as any} /></MemoryRouter>);

    await user.click(await screen.findByRole("button", { name: "Gợi ý" }));
    await user.click(await screen.findByRole("button", { name: "Xác nhận phương án này" }));

    await waitFor(() => expect(generateContentLessonDraft).toHaveBeenCalledTimes(2));
    expect(maxRunning).toBe(1);
    expect(order).toEqual(["start-A1", "end-A1", "start-A2", "end-A2"]);
  });

  it("does not let an older week save overwrite a newer save", async () => {
    const user = userEvent.setup();
    const weeks = { pilot: { startDate: "2026-10-05", weekCount: 1 }, weeks: [{ id: "w1", weekNumber: 1, startDate: "2026-10-05", endDate: "2026-10-11", current: true, topic: "Old topic", description: "", objectives: "", keyVocabHint: "" }] };
    const firstWeek = weeks.weeks[0]!;
    let resolveFirstSave!: (value: typeof weeks) => void;
    const saveContentWeeks = vi.fn((payload: Array<{ weekNumber: number; topic: string; description: string; objectives: string; keyVocabHint: string }>) => {
      if (saveContentWeeks.mock.calls.length === 1) {
        return new Promise<typeof weeks>(resolve => { resolveFirstSave = resolve; });
      }
      return Promise.resolve({ ...weeks, weeks: [{ ...firstWeek, topic: payload[0]!.topic }] });
    });
    const client = { getContentWeeks: vi.fn().mockResolvedValue(weeks), saveContentWeeks, suggestContentWeeks: vi.fn() };
    render(<MemoryRouter initialEntries={["/op/weeks"]}><OperatorRouteController session={operator} client={client as any} /></MemoryRouter>);

    const topic = await screen.findByLabelText("Chủ đề *");
    await user.clear(topic);
    await user.type(topic, "New topic");
    await user.click(screen.getByRole("button", { name: "Lưu khung chủ đề" }));
    await user.clear(topic);
    await user.type(topic, "Latest topic");
    await user.click(screen.getByRole("button", { name: "Lưu khung chủ đề" }));
    expect(saveContentWeeks).toHaveBeenCalledTimes(1);

    resolveFirstSave({ ...weeks, weeks: [{ ...firstWeek, topic: "New topic" }] });
    await waitFor(() => expect(saveContentWeeks).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(screen.getByLabelText("Chủ đề *")).toHaveValue("Latest topic"));
  });

  it("keeps the lesson matrix open when AI generation returns invalid structured output", async () => {
    const user = userEvent.setup();
    const client = {
      getContentLessonMatrix: vi.fn().mockResolvedValue({ levels: [{ cefr: "A2", learnerCount: 1 }], weeks: [{ weekNumber: 1, topic: "Meetings", cells: [] }] }),
      getSystemCapabilities: vi.fn().mockResolvedValue({ ai: true }),
      generateContentLessonDraft: vi.fn().mockRejectedValue(new Error("AI_OUTPUT_INVALID"))
    };
    render(<MemoryRouter initialEntries={["/op/lessons"]}><OperatorRouteController session={operator} client={client as any} /></MemoryRouter>);

    await user.click(await screen.findByRole("button", { name: "Sinh" }));

    expect(await screen.findByText("AI trả về nội dung không đúng định dạng.")).toHaveClass("operator-toast");
    expect(screen.getByRole("heading", { name: "Sinh & duyệt bài học" })).toBeInTheDocument();
  });

  it("renders prompt controls that Manager can mutate in the owned operations area", async () => {
    const client = { getContentPrompts: vi.fn().mockResolvedValue({ groups: [
      { key: "system_rules", label: "Quy tắc chung", content: "current", defaultContent: "default", version: 1, status: "active" },
      { key: "assessment_scoring", label: "Chấm test", content: "score", defaultContent: "score default", version: 1, status: "active" }
    ] }) };
    render(<MemoryRouter initialEntries={["/mgr/ops/prompts"]}><OperatorRouteController session={manager} client={client as any} basePath="/mgr/ops" /></MemoryRouter>);
    expect(await screen.findByRole("heading", { name: "Prompt & rubric" })).toBeInTheDocument();
    screen.getAllByRole("button", { name: "Về mặc định" }).forEach(button => expect(button).toBeEnabled());
    expect(screen.getByRole("button", { name: "Lưu prompt" })).toBeEnabled();
    expect(screen.getByRole("textbox", { name: "Quy tắc chung (mọi lời gọi trừ sinh bài siêu ngắn)" })).not.toHaveAttribute("readonly");
  });

  it("renders Manager-owned routes without an inspection banner", async () => {
    const client = { getContentPrompts: vi.fn().mockResolvedValue({ groups: [
      { key: "system_rules", label: "Quy tắc chung", content: "current", defaultContent: "default", version: 1, status: "active" }
    ] }), saveContentPrompts: vi.fn() };
    render(<MemoryRouter initialEntries={["/mgr/ops/prompts"]}><OperatorRouteController session={manager} client={client as any} basePath="/mgr/ops" /></MemoryRouter>);

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
    expect(managerButton).toBeEnabled();
    await user.click(managerButton);
    await waitFor(() => expect(rescoreAssessment).toHaveBeenCalledWith("a1", expect.any(String)));
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
          cefr: "A2", status: "missing", versionId: null, version: null, updatedAt: null, plan: ["Ask the time", "Confirm the time", "Name the room", "Invite a colleague", "Close the meeting"], lessons: []
        }]
      }]
    };
    render(<MemoryRouter initialEntries={["/op/lessons"]}><OperatorRouteController session={operator} client={{ getContentLessonMatrix: vi.fn().mockResolvedValue(matrix), getSystemCapabilities: vi.fn().mockResolvedValue({ ai: false }) } as any} /></MemoryRouter>);

    expect(await screen.findByText("Ask the time (kế hoạch)")).toBeInTheDocument();
    expect(screen.getByText("Close the meeting (kế hoạch)")).toBeInTheDocument();
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

  it("exposes persisted lesson enrichment actions to both Operator and Manager", async () => {
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
    expect(screen.getByRole("button", { name: /Bổ sung cụm từ bằng AI/ })).toBeEnabled();
    expect(screen.getByRole("button", { name: /Bổ sung bằng AI/ })).toBeEnabled();
    await user.click(screen.getByRole("button", { name: /Bổ sung cụm từ bằng AI/ }));
    await waitFor(() => expect(fillContentLessonPhrases).toHaveBeenCalledWith(2, "A2", 1));
    await user.click(screen.getByRole("button", { name: /Bổ sung bằng AI/ }));
    await waitFor(() => expect(enrichContentLessonDraft).toHaveBeenCalledWith(2, "A2", 1));
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
