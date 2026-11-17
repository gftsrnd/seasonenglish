// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { MemoryRouter } from "react-router";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { AssessmentPlacementRetakeRequestView, InboxNotificationView } from "@e4s/contracts";
import { learnerApiClient } from "../../api/learner.js";
import { LearnerRequestHistory } from "./LearnerRequestHistory.js";
import { PlacementRetakeRequest } from "./PlacementRetakeRequest.js";
import { notificationContent } from "../shared/NotificationBell.js";
import { AppealReviewCard } from "../operator/Review.js";
import { adaptReviewAppeal } from "../operator/adapters.js";

afterEach(() => { cleanup(); vi.restoreAllMocks(); });

const notification = (kind: string, context: string) => ({ id: "n1", kind, context, createdAt: "2026-11-16T03:00:00.000Z", readAt: null }) as unknown as InboxNotificationView;
const view = (overrides: Partial<AssessmentPlacementRetakeRequestView>): AssessmentPlacementRetakeRequestView => ({ original: null, target: null, request: null, retake: "not_granted", ...overrides });
const renderRequest = (api: NonNullable<Parameters<typeof PlacementRetakeRequest>[0]["api"]>) => render(<MemoryRouter><PlacementRetakeRequest api={api} /></MemoryRouter>);

describe("placement retake request: bell → support page → 'Xin thi lại' → Operator decision", () => {
  it("sends the placement result bell to the support page, and the request bells to the Operator and back", () => {
    expect(notificationContent(notification("assessment_result", "placement"))).toEqual(expect.objectContaining({ path: "/support?tab=appeals", description: expect.stringContaining("72 giờ") }));
    expect(notificationContent(notification("assessment_retry", "placement")).path).toBe("/support?tab=appeals");
    expect(notificationContent(notification("appeal_received", "retake"))).toEqual(expect.objectContaining({ title: "Yêu cầu thi lại", path: "/op/review?tab=appeals" }));
    expect(notificationContent(notification("appeal_rejected", "retake")).title).toBe("Yêu cầu thi lại bị từ chối");
    expect(notificationContent(notification("retake_granted", "placement")).path).toBe("/test/placement");
    expect(notificationContent(notification("assessment_result", "placement_retake"))).toMatchObject({ title: "Đã xếp lớp sau bài thi lại", path: "/profile" });
  });

  it("requires a reason and sends only after confirmation", async () => {
    const user = userEvent.setup();
    const createPlacementRetakeRequest = vi.fn(async () => view({ request: { id: "r1", status: "pending", resolution: null, createdAt: "2026-11-16T03:00:00.000Z", resolvedAt: null } }));
    renderRequest({ getPlacementRetakeRequest: async () => view({ target: { attemptId: "a1", title: "Test đầu vào", availableUntil: "2026-11-19T02:00:00.000Z" } }), createPlacementRetakeRequest });
    await user.click(await screen.findByRole("button", { name: "Xin thi lại" }));
    expect(screen.getByRole("button", { name: "Gửi yêu cầu" })).toBeDisabled();
    await user.type(screen.getByRole("textbox", { name: /Lý do/ }), "   ");
    expect(screen.getByRole("button", { name: "Gửi yêu cầu" })).toBeDisabled();
    await user.type(screen.getByRole("textbox", { name: /Lý do/ }), "Tôi muốn thử lại.  ");
    const confirmation = screen.getByRole("dialog", { name: "Gửi yêu cầu thi lại?" });
    expect(within(confirmation).getByRole("heading", { name: "Gửi yêu cầu thi lại?" })).toBeInTheDocument();
    expect(confirmation).toHaveTextContent("Bạn chỉ được thi lại một lần. Kết quả thi lại là kết quả cuối cùng.");
    await user.click(screen.getByRole("button", { name: "Hủy" }));
    expect(createPlacementRetakeRequest).not.toHaveBeenCalled();
    await user.click(screen.getByRole("button", { name: "Xin thi lại" }));
    await user.click(screen.getByRole("button", { name: "Gửi yêu cầu" }));
    expect(createPlacementRetakeRequest).toHaveBeenCalledExactlyOnceWith("Tôi muốn thử lại.");
    await vi.waitFor(() => expect(screen.queryByRole("heading", { name: "Test đầu vào" })).not.toBeInTheDocument());
    expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Xin thi lại" })).not.toBeInTheDocument();
  });

  it("shows nothing once the 72 h window has expired without a request", async () => {
    const getPlacementRetakeRequest = vi.fn(async () => view({}));
    const { container } = renderRequest({ getPlacementRetakeRequest });
    await vi.waitFor(() => expect(getPlacementRetakeRequest).toHaveBeenCalled());
    expect(container).toBeEmptyDOMElement();
  });

  const original: NonNullable<AssessmentPlacementRetakeRequestView["original"]> = {
    feedback: "Hãy luyện thêm kỹ năng nghe.",
    attempt: { id: "a1", status: "approved", currentSection: null, startedAt: "2026-11-16T03:00:00Z", sectionEndsAt: null,
      responses: [{ section: "writing", taskKey: "writing", evidenceType: "text", value: "The submitted essay." }],
      sectionStatuses: { listening: "completed", reading: "completed", writing: "completed", speaking: "completed" }, audioPlayCounts: {} },
    definition: { key: "placement-a", kind: "placement", title: "Test đầu vào", version: 1, totalMinutes: 75, totalScore: 100,
      sections: (["listening", "reading", "writing", "speaking"] as const).map(code => ({
        code, title: code, durationMinutes: 10, maxScore: 20, instructions: [],
        groups: [{ key: code, title: `Group ${code}`, instruction: "Answer the question.", tasks: [
          { key: code, prompt: `Prompt ${code}`, maxScore: 20, responseType: code === "writing" ? "long_text" : code === "speaking" ? "speaking_evidence" : "single_choice" }
        ] }]
      })) }
  };
  const mockHistory = (initial: AssessmentPlacementRetakeRequestView) => {
    vi.spyOn(learnerApiClient, "getPlacementRetakeRequest").mockResolvedValue(initial);
    vi.spyOn(learnerApiClient, "getLearnerComplaints").mockResolvedValue({ complaints: [] });
    vi.spyOn(learnerApiClient, "getLearnerAppeals").mockResolvedValue({ appeals: [] });
    vi.spyOn(learnerApiClient, "getAppealableAssessments").mockResolvedValue({ results: [] });
    vi.spyOn(learnerApiClient, "getProgress").mockResolvedValue({ learner: { cefr: "A2" } } as Awaited<ReturnType<typeof learnerApiClient.getProgress>>);
    render(<MemoryRouter initialEntries={["/support?tab=appeals"]}><LearnerRequestHistory /></MemoryRouter>);
  };

  it("moves a sent request to the existing history and opens the original four-part popup there", async () => {
    const user = userEvent.setup();
    mockHistory(view({ original, target: { attemptId: "a1", title: "Test đầu vào", availableUntil: null } }));
    vi.spyOn(learnerApiClient, "createPlacementRetakeRequest").mockResolvedValue(view({ original, request: {
      id: "r1", reason: "Tôi muốn thử lại.", status: "pending", resolution: null, createdAt: "2026-11-16T03:00:00Z", resolvedAt: null
    } }));
    expect(await screen.findByRole("heading", {name:"Test đầu vào"})).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Xin thi lại" }));
    await user.type(screen.getByRole("textbox", { name: /Lý do/ }), "Tôi muốn thử lại.");
    await user.click(screen.getByRole("button", { name: "Gửi yêu cầu" }));
    expect(await screen.findAllByText("Yêu cầu thi lại", { exact: true })).toHaveLength(1);
    expect(screen.queryByRole("heading", { name: "Test đầu vào" })).not.toBeInTheDocument();
    expect(screen.getByText("Chờ xử lý")).toHaveClass("warn");
    expect(screen.getByText(/Phản hồi bài đầu vào: Hãy luyện thêm kỹ năng nghe/)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Xem bài làm" }));
    const dialog = screen.getByRole("dialog", { name: "Bài đầu vào đã nộp" });
    expect(within(dialog).getByText("Hãy luyện thêm kỹ năng nghe.")).toBeInTheDocument();
    for (const name of ["Nghe", "Đọc", "Viết", "Nói"]) await user.click(within(dialog).getByText(new RegExp(`^${name} ·`)));
    await user.click(within(dialog).getByText("Group listening", { exact: true }));
    expect(within(dialog).getAllByText("Chưa trả lời")[0]).toBeVisible();
    expect(within(dialog).getByText("The submitted essay.")).toBeVisible();
    expect(within(dialog).getByText("(không có file ghi âm)")).toBeVisible();
  });

  it.each([false, true])("shows inline skill scores and listening playback with transcript, compact %s", async (compact) => {
    const user = userEvent.setup();
    vi.stubGlobal("matchMedia", vi.fn(() => ({ matches: compact, addEventListener: vi.fn(), removeEventListener: vi.fn() })));
    try {
      const listening = original.definition.sections.find(section => section.code === "listening")!;
      const withListening: NonNullable<AssessmentPlacementRetakeRequestView["original"]> = {
        ...original,
        definition: { ...original.definition, sections: original.definition.sections.map(section => section.code === "listening" ? {
          ...section, groups: [{ ...listening.groups[0]!, stimulus: { type: "audio_script", audioSrc: "/recording.wav", lines: [{ speaker: "Anna", text: "The office closes at noon." }] } }]
        } : section) }
      };
      mockHistory(view({ original: withListening, target: { attemptId: "a1", title: "Test đầu vào", availableUntil: null } }));
      await user.click(await screen.findByRole("button", { name: "Xem bài làm" }));
      const dialogElement = screen.getByRole("dialog", { name: "Bài đầu vào đã nộp" });
      const dialog = within(dialogElement);
      expect(dialog.queryByRole("heading", { name: "Điểm theo 4 kỹ năng" })).not.toBeInTheDocument();
      expect(dialog.getByText(/^Nghe ·/u)).toBeVisible();
      expect(dialog.queryByText(/Nhật ký xử lý|Nhật ký cảnh báo|Chấm lại/u)).not.toBeInTheDocument();
      await user.click(dialog.getByText(/^Nghe ·/u));
      await user.click(dialog.getByText("Group listening", { exact: true }));
      expect(dialogElement.querySelector("audio[controls]")).toHaveAttribute("src", "/recording.wav");
      expect(dialog.getByText(/The office closes at noon/u)).toBeVisible();
    } finally { vi.unstubAllGlobals(); }
  });

  it.each(["A", "B", "Legacy text"])("marks saved answer %s on the matching choice, or preserves unmatched text", async (value) => {
    const user = userEvent.setup();
    const reading = original.definition.sections.find(section => section.code === "reading")!;
    const task = reading.groups[0]!.tasks[0]!;
    const reviewed: NonNullable<AssessmentPlacementRetakeRequestView["original"]> = {
      ...original,
      objectiveAnswerKeys: { reading: { [task.key]: "B" } },
      attempt: { ...original.attempt, responses: [...original.attempt.responses, { section: "reading", taskKey: task.key, value, evidenceType: "text", savedAt: "2026-11-16T03:00:00Z" }] },
      definition: { ...original.definition, sections: original.definition.sections.map(section => section.code === "reading" ? {
        ...section, groups: [{ ...reading.groups[0]!, tasks: [{ ...task, options: [{ value: "A", label: "First choice" }, { value: "B", label: "Second choice" }] }] }]
      } : section) }
    };
    mockHistory(view({ original: reviewed, target: { attemptId: "a1", title: "Test đầu vào", availableUntil: null } }));
    await user.click(await screen.findByRole("button", { name: "Xem bài làm" }));
    const dialog = within(screen.getByRole("dialog", { name: "Bài đầu vào đã nộp" }));
    await user.click(dialog.getByText(/^Đọc ·/u));
    await user.click(dialog.getByText("Group reading", { exact: true }));
    const first = dialog.getByText("A. First choice").closest("li")!;
    const second = dialog.getByText("B. Second choice").closest("li")!;
    expect(within(second).getByText("Đáp án đúng")).toBeVisible();
    if (value === "Legacy text") {
      expect(dialog.getByText("Legacy text")).toBeVisible();
      expect(dialog.queryByText("Bạn đã chọn", { exact: true })).not.toBeInTheDocument();
    } else {
      expect(within(value === "A" ? first : second).getByText("Bạn đã chọn", { exact: true })).toBeVisible();
      expect(dialog.queryByText(/Bạn đã chọn:/u)).not.toBeInTheDocument();
    }
  });

  it("shows the review answer key and keeps an aggregate-only reading score without inventing skipped items", async () => {
    const user = userEvent.setup();
    const reading = original.definition.sections.find(section => section.code === "reading")!;
    const task = reading.groups[0]!.tasks[0]!;
    const reviewed = {
      ...original,
      objectiveAnswerKeys: { reading: { [task.key]: "B" } },
      attempt: { ...original.attempt, totalScore: 55, sectionScores: { ...original.attempt.sectionScores, reading: 16 } },
      definition: { ...original.definition, sections: original.definition.sections.map(section => section.code === "reading" ? {
        ...section, maxScore: 40, groups: [{ ...reading.groups[0]!, tasks: [{ ...task, options: [{ value: "A", label: "First choice" }, { value: "B", label: "Second choice" }] }] }]
      } : section) }
    };
    mockHistory(view({ original: reviewed, target: { attemptId: "a1", title: "Test đầu vào", availableUntil: null } }));
    await user.click(await screen.findByRole("button", { name: "Xem bài làm" }));
    const dialog = within(screen.getByRole("dialog", { name: "Bài đầu vào đã nộp" }));
    expect(dialog.getByText(/Tổng điểm: 55\/100/u)).toBeVisible();
    await user.click(dialog.getByText("Đọc · 16/40", { exact: true }));
    expect(dialog.getByText(/Chưa có chi tiết từng câu/u)).toBeVisible();
    await user.click(dialog.getByText("Group reading", { exact: true }));
    expect(dialog.getByText("A. First choice")).toBeVisible();
    expect(dialog.getByText("B. Second choice").parentElement).toHaveTextContent("Đáp án đúng");
    const section = dialog.getByText("Đọc · 16/40").closest("details")!;
    expect(within(section).queryByText("Chưa trả lời")).not.toBeInTheDocument();
    expect(within(section).queryByText(/Bạn đã chọn/)).not.toBeInTheDocument();
    expect(within(section).queryByText(/20đ/u)).not.toBeInTheDocument();
  });

  it.each([["accepted","Đã duyệt","ok"],["rejected","Đã từ chối","danger"]] as const)("shows a %s request only in history", async (status, label, tone) => {
    mockHistory(view({ original, request: { id: "r1", status, resolution: "Kết quả xử lý.", createdAt: "2026-11-16T03:00:00Z", resolvedAt: "2026-11-16T04:00:00Z" } }));
    expect(await screen.findByText(label)).toHaveClass(tone);
    expect(screen.getByText("Phản hồi yêu cầu: Kết quả xử lý.")).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Test đầu vào" })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Mở bài thi lại" }) !== null).toBe(status === "accepted");
  });

  it("lets the Operator approve or reject the request from the appeal queue", async () => {
    const user = userEvent.setup();
    const onDecision = vi.fn();
    const item = adaptReviewAppeal({
      id: "r1", learnerName: "Lan", reason: "Xin thi lại bài đầu vào", status: "pending", createdAt: "2026-11-16T03:00:00.000Z", resolution: "",
      kind: "assessment", requestKind: "retake", submissionId: null, attemptId: "a1", currentScore: null, lessonTitle: "Test đầu vào", scope: null, hasEvidence: false
    } as Parameters<typeof adaptReviewAppeal>[0]);
    render(<AppealReviewCard item={item} readOnly={false} busy={() => false} itemBusy={false} onDecision={onDecision} />);
    expect(screen.getByRole("heading", { name: "Yêu cầu thi lại bài đầu vào" })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Duyệt cho thi lại" }));
    await user.click(screen.getByRole("button", { name: "Từ chối" }));
    expect(onDecision.mock.calls).toEqual([[true], [false]]);
  });
});
