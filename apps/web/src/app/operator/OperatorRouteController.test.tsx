// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { Link, MemoryRouter, useLocation } from "react-router";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ContentLessonMatrixView, ContentLessonSetVersionView, ContentReviewAssessmentDetailView, ContentReviewView, SessionView } from "@e4s/contracts";
import { ApiError } from "../../api/runtime.js";
import { AppGuide } from "../shared/AppGuide.js";
import { ToastProvider } from "../shared/design-system.js";
import { monthlyFinalView } from "../../../test/support/monthly-final-view.js";
import { OperatorRouteController } from "./OperatorRouteController.js";
import { buildMonthlyCalendar, monthlyDayKind, monthlyNewLessonOrdinal } from "@e4s/domain/monthly";

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

describe("OperatorRouteController", () => {
  it("keeps page scroll position while loading a different month-resource level", async () => {
    const user = userEvent.setup();
    const overview = { systemDate: "2026-11-03", monthWindow: { previous: "2026-10", current: "2026-11", next: "2026-12", writable: true }, brief: null, frameworks: [] };
    const client = { getContentMonth: vi.fn().mockResolvedValue(overview), getContentMonthResourceCheckpoint: vi.fn().mockResolvedValue(undefined) };
    let scrollY = 0;
    Object.defineProperty(window, "scrollY", { configurable: true, get: () => scrollY });
    vi.spyOn(window, "scrollTo").mockImplementation((_x, y) => { scrollY = Number(y); });
    render(<ToastProvider><MemoryRouter initialEntries={["/op/months"]}><OperatorRouteController session={operator} client={client as any} /></MemoryRouter></ToastProvider>);

    await screen.findByRole("heading", { name: /^Tài nguyên tháng/ });
    scrollY = 420;
    await user.click(screen.getByRole("tab", { name: "A2" }));
    await waitFor(() => expect(client.getContentMonthResourceCheckpoint).toHaveBeenLastCalledWith(expect.any(String), "A2"));
    await waitFor(() => expect(scrollY).toBe(420));
    expect(window.scrollTo).toHaveBeenCalledWith(0, 420);
  });

  it("opens the manual monthly editor with the calendar's lesson label as the default title", async () => {
    const user = userEvent.setup();
    const calendar = buildMonthlyCalendar("2026-11");
    const firstReview = calendar.effectiveDays.findIndex((_date, index) => monthlyDayKind(index + 1, calendar) === "review") + 1;
    const afterReview = firstReview + 1;
    const ordinal = monthlyNewLessonOrdinal(afterReview, calendar)!;
    const overview = {
      systemDate: "2026-11-03", monthWindow: { previous: "2026-10", current: "2026-11", next: "2026-12", writable: true },
      brief: { month: "2026-11", title: "Updates", brief: "Project updates", context: "Office", communicationGoal: "Report", version: 1, status: "approved" },
      calendar: calendar.effectiveDays.map((date, index) => ({ date, kind: monthlyDayKind(index + 1, calendar), lessonNumber: index + 1, ...(monthlyDayKind(index + 1, calendar) === "new" ? { newLessonNumber: monthlyNewLessonOrdinal(index + 1, calendar)! } : { reviewWeekNumber: 1 }) })),
      frameworks: (["A1", "A2", "B1", "B2", "C1"] as const).map((cefr) => ({ id: `framework-${cefr}`, cefr, version: 1, status: "approved", scopeHash: "scope", lessons: [], quality: { severe: [], light: [] }, resources: { coreTerms: [], supportTerms: [], grammarTopics: [], sounds: [] }, publication: { ready: false, publishedOn: null } }))
    };
    const client = { getContentMonth: vi.fn().mockResolvedValue(overview), getContentMonthResourceCheckpoint: vi.fn().mockResolvedValue(undefined), saveContentMonthDay: vi.fn(), uploadContentMedia: vi.fn() };
    const { container } = render(<ToastProvider><MemoryRouter initialEntries={["/op/months"]}><OperatorRouteController session={operator} client={client as any} /></MemoryRouter></ToastProvider>);
    await screen.findByRole("heading", { name: /^Tài nguyên tháng/ });

    const newCell = await waitFor(() => container.querySelector<HTMLElement>(`#monthly-day-${calendar.effectiveDays[afterReview - 1]}`)!);
    await user.click(within(newCell).getByRole("button", { name: `Soạn tay bài ${ordinal}` }));
    expect(await screen.findByLabelText("Tiêu đề bài")).toHaveValue(`Bài ${ordinal}`);
    expect(screen.getByLabelText("Tiêu đề bài")).not.toHaveValue(`Bài T${afterReview}`);
    await user.click(screen.getByRole("button", { name: /Hủy|Đóng/ }));

    const reviewCell = container.querySelector<HTMLElement>(`#monthly-day-${calendar.effectiveDays[firstReview - 1]}`)!;
    await user.click(within(reviewCell).getByRole("button", { name: "Soạn tay bài ôn" }));
    expect(await screen.findByLabelText("Tiêu đề bài")).toHaveValue("Bài ôn tuần 1");
  });

  it("shows a saved raw-slot title 'Bài N' with the calendar's new-lesson number when editing a draft", async () => {
    const user = userEvent.setup();
    const calendar = buildMonthlyCalendar("2026-11");
    const firstReview = calendar.effectiveDays.findIndex((_date, index) => monthlyDayKind(index + 1, calendar) === "review") + 1;
    const afterReview = firstReview + 1;
    const ordinal = monthlyNewLessonOrdinal(afterReview, calendar)!;
    const date = calendar.effectiveDays[afterReview - 1]!;
    const draft = { lessonNumber: afterReview, lessonDate: date, kind: "new", status: "draft", scopeHash: "scope", locked: false, correctionCount: 0, quality: { severe: [], light: [] }, content: { title: `Bài ${afterReview}`, parts: [{ code: "instruction", title: "Hướng dẫn", content: {} }] } };
    const overview = {
      systemDate: "2026-11-03", monthWindow: { previous: "2026-10", current: "2026-11", next: "2026-12", writable: true },
      brief: { month: "2026-11", title: "Updates", brief: "Project updates", context: "Office", communicationGoal: "Report", version: 1, status: "approved" },
      calendar: calendar.effectiveDays.map((day, index) => ({ date: day, kind: monthlyDayKind(index + 1, calendar), lessonNumber: index + 1, ...(monthlyDayKind(index + 1, calendar) === "new" ? { newLessonNumber: monthlyNewLessonOrdinal(index + 1, calendar)! } : { reviewWeekNumber: 1 }) })),
      frameworks: (["A1", "A2", "B1", "B2", "C1"] as const).map((cefr) => ({ id: `framework-${cefr}`, cefr, version: 1, status: "approved", scopeHash: "scope", lessons: cefr === "A1" ? [draft] : [], quality: { severe: [], light: [] }, resources: { coreTerms: [], supportTerms: [], grammarTopics: [], sounds: [] }, publication: { ready: false, publishedOn: null } }))
    };
    const client = { getContentMonth: vi.fn().mockResolvedValue(overview), getContentMonthResourceCheckpoint: vi.fn().mockResolvedValue(undefined), saveContentMonthDay: vi.fn(), uploadContentMedia: vi.fn() };
    const { container } = render(<ToastProvider><MemoryRouter initialEntries={["/op/months"]}><OperatorRouteController session={operator} client={client as any} /></MemoryRouter></ToastProvider>);
    await screen.findByRole("heading", { name: /^Tài nguyên tháng/ });
    const cell = await waitFor(() => container.querySelector<HTMLElement>(`#monthly-day-${date}`)!);
    await user.click(within(cell).getByRole("button", { name: `Soạn tay bài ${ordinal}` }));
    expect(await screen.findByLabelText("Tiêu đề bài")).toHaveValue(`Bài ${ordinal}`);
  });

  it("defaults a B1 monthly day to an English title the B1+ title gate accepts", async () => {
    const user = userEvent.setup();
    const calendar = buildMonthlyCalendar("2026-11");
    const firstReview = calendar.effectiveDays.findIndex((_date, index) => monthlyDayKind(index + 1, calendar) === "review") + 1;
    const afterReview = firstReview + 1;
    const ordinal = monthlyNewLessonOrdinal(afterReview, calendar)!;
    const overview = {
      systemDate: "2026-11-03", monthWindow: { previous: "2026-10", current: "2026-11", next: "2026-12", writable: true },
      brief: { month: "2026-11", title: "Updates", brief: "Project updates", context: "Office", communicationGoal: "Report", version: 1, status: "approved" },
      calendar: calendar.effectiveDays.map((date, index) => ({ date, kind: monthlyDayKind(index + 1, calendar), lessonNumber: index + 1, ...(monthlyDayKind(index + 1, calendar) === "new" ? { newLessonNumber: monthlyNewLessonOrdinal(index + 1, calendar)! } : { reviewWeekNumber: 1 }) })),
      frameworks: (["A1", "A2", "B1", "B2", "C1"] as const).map((cefr) => ({ id: `framework-${cefr}`, cefr, version: 1, status: "approved", scopeHash: "scope", lessons: [], quality: { severe: [], light: [] }, resources: { coreTerms: [], supportTerms: [], grammarTopics: [], sounds: [] }, publication: { ready: false, publishedOn: null } }))
    };
    const client = { getContentMonth: vi.fn().mockResolvedValue(overview), getContentMonthResourceCheckpoint: vi.fn().mockResolvedValue(undefined), saveContentMonthDay: vi.fn(), uploadContentMedia: vi.fn() };
    const { container } = render(<ToastProvider><MemoryRouter initialEntries={["/op/months"]}><OperatorRouteController session={operator} client={client as any} /></MemoryRouter></ToastProvider>);
    await screen.findByRole("heading", { name: /^Tài nguyên tháng/ });
    await user.click(screen.getByRole("tab", { name: "B1" }));

    const reviewCell = await waitFor(() => container.querySelector<HTMLElement>(`#monthly-day-${calendar.effectiveDays[firstReview - 1]}`)!);
    await user.click(within(reviewCell).getByRole("button", { name: "Soạn tay bài ôn" }));
    expect(await screen.findByLabelText("Tiêu đề bài")).toHaveValue("Week 1 review");
    await user.click(screen.getByRole("button", { name: /Hủy|Huỷ/ }));

    const newCell = container.querySelector<HTMLElement>(`#monthly-day-${calendar.effectiveDays[afterReview - 1]}`)!;
    await user.click(within(newCell).getByRole("button", { name: `Soạn tay bài ${ordinal}` }));
    expect(await screen.findByLabelText("Tiêu đề bài")).toHaveValue(`Lesson ${ordinal}`);
  });

  it("reopens a saved B1 review draft with the saved title and edits, not the failed AI candidate or the calendar default", async () => {
    const user = userEvent.setup();
    const date = "2026-11-06";
    const steps = (items: string[]) => ({ code: "instruction", title: "Hướng dẫn", content: { steps: items } });
    let lesson: Record<string, unknown> = {
      lessonNumber: 5, lessonDate: date, kind: "review", status: "pending", scopeHash: "scope", locked: false, correctionCount: 0, quality: { severe: [], light: [] },
      generationFailure: { failedAt: "2026-11-05T12:00:00.000Z", attempts: 3, report: { severe: [{ severity: "severe", code: "MONTHLY_ENGLISH_ONLY", component: "title", dayNumber: 5, message: "B1+ requires the learner-facing lesson title to be in English." }], light: [] }, candidate: { title: "Bài ôn tuần 1", parts: [steps(["AI step"])] } }
    };
    const overview = () => ({
      systemDate: "2026-11-03", monthWindow: { previous: "2026-10", current: "2026-11", next: "2026-12", writable: true },
      brief: { month: "2026-11", title: "Updates", brief: "Project updates", context: "Office", communicationGoal: "Report", version: 1, status: "approved" },
      calendar: [{ date, kind: "review", lessonNumber: 5, reviewWeekNumber: 1 }],
      frameworks: (["A1", "B1"] as const).map((cefr) => ({ id: `framework-${cefr}`, cefr, version: 1, status: "approved", scopeHash: "scope", lessons: cefr === "B1" ? [lesson] : [], quality: { severe: [], light: [] }, resources: { coreTerms: [], supportTerms: [], grammarTopics: [], sounds: [] }, publication: { ready: false, publishedOn: null } }))
    });
    // The API stores the draft (title included) and drops the failed candidate once a draft is saved.
    const saveContentMonthDay = vi.fn(async (_id: string, _day: number, input: { title: string; parts: unknown[] }) => {
      lesson = { ...lesson, status: "draft", content: { title: input.title, parts: input.parts }, generationFailure: undefined };
      return { severe: [], light: [], contractVersion: 1 };
    });
    const client = { getContentMonth: vi.fn(async () => overview()), getContentMonthResourceCheckpoint: vi.fn().mockResolvedValue(undefined), saveContentMonthDay, uploadContentMedia: vi.fn() };
    render(<ToastProvider><MemoryRouter initialEntries={["/op/months/lesson/framework-B1/5?month=2026-11"]}><OperatorRouteController session={operator} client={client as any} /></MemoryRouter></ToastProvider>);

    await user.click(await screen.findByRole("button", { name: "Sửa tay" }));
    const title = await screen.findByLabelText("Tiêu đề bài");
    expect(title).toHaveValue("Bài ôn tuần 1");
    await user.clear(title);
    await user.type(title, "Week 1 review: project updates");
    const save = async () => {
      await user.click(screen.getByRole("button", { name: "Kiểm tra & lưu" }));
      if (screen.queryByRole("button", { name: "Lưu dù còn thiếu" })) await user.click(screen.getByRole("button", { name: "Lưu dù còn thiếu" }));
      const dialog = await screen.findByRole("dialog", { name: /Lưu tạm bài học\?|Kiểm tra và lưu bài\?/ });
      await user.click(within(dialog).getByRole("button", { name: /Lưu tạm|Kiểm tra & lưu/ }));
      await waitFor(() => expect(screen.queryByLabelText("Tiêu đề bài")).not.toBeInTheDocument());
    };
    await save();
    expect(saveContentMonthDay).toHaveBeenLastCalledWith("framework-B1", 5, expect.objectContaining({ title: "Week 1 review: project updates" }));

    // Second fix in another field: the first fix (title) must still be there.
    await user.click(await screen.findByRole("button", { name: "Sửa tay" }));
    expect(await screen.findByLabelText("Tiêu đề bài")).toHaveValue("Week 1 review: project updates");
    await save();
    expect(saveContentMonthDay).toHaveBeenCalledTimes(2);
    expect(saveContentMonthDay).toHaveBeenLastCalledWith("framework-B1", 5, expect.objectContaining({ title: "Week 1 review: project updates" }));
  });


  it("does not render the manual Duyệt trình độ back link in Operator level forms", async () => {
    const client = { getAssessmentLevelForms: vi.fn().mockResolvedValue([]), getSystemCapabilities: vi.fn().mockResolvedValue({ ai: true }) };
    render(<MemoryRouter initialEntries={["/op/levelforms"]}><OperatorRouteController session={operator} client={client as any} /></MemoryRouter>);

    expect(await screen.findByRole("heading", { name: "Kết quả bài thi" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Đề lên mức" })).toHaveAttribute("aria-selected", "true");
    expect(screen.queryByRole("heading", { name: "Đề thi lên mức" })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "← Duyệt trình độ" })).not.toBeInTheDocument();
  });

  it("does not render Prompt & rubric for an Operator even when the controller receives its direct URL", async () => {
    const client = { getContentPrompts: vi.fn().mockResolvedValue({ groups: [
      { key: "system_rules", label: "Quy tắc chung", content: "current", defaultContent: "default", version: 1, status: "active" }
    ] }) };
    render(<MemoryRouter initialEntries={["/settings/prompts"]}><OperatorRouteController session={operator} client={client as any} /></MemoryRouter>);

    expect(await screen.findByRole("heading", { name: "Không tìm thấy trang" })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Prompt & rubric" })).not.toBeInTheDocument();
    expect(client.getContentPrompts).not.toHaveBeenCalled();
  });

  it("saves a level draft and publishes only from inside the editor after confirmation", async () => {
    const user = userEvent.setup();
    const detail = {
      definitionId: "definition-1", versionId: "version-1", title: "Đề B1", version: 1, publishedAt: null,
      listeningTaskCount: 1, readingTaskCount: 0, attemptCount: 0, status: "draft", targetLevel: "B1", publicationReady: true,
      sections: [
        { code: "listening", title: "Nghe", durationMinutes: 8, maxScore: 25, instructions: ["Nghe"], groups: [{ key: "L", title: "Nghe", instruction: "Nghe", tasks: [{ key: "L1", prompt: "Old prompt", responseType: "single_choice", maxScore: 5, options: [{ value: "A", label: "Yes" }], correctAnswer: "A" }] }] },
        { code: "reading", title: "Đọc", durationMinutes: 13, maxScore: 25, instructions: ["Đọc"], groups: [{ key: "R", title: "Đọc", instruction: "Đọc", tasks: [{ key: "R1", prompt: "Read", responseType: "single_choice", maxScore: 5, options: [{ value: "A", label: "Yes" }], correctAnswer: "A" }] }] },
        { code: "writing", title: "Viết", durationMinutes: 10, maxScore: 25, instructions: ["Viết"], groups: [{ key: "W", title: "Viết", instruction: "Viết", tasks: [{ key: "W1", prompt: "Write", responseType: "long_text", maxScore: 25 }] }] },
        { code: "speaking", title: "Nói", durationMinutes: 7, maxScore: 25, instructions: ["Nói"], groups: [{ key: "S", title: "Nói", instruction: "Nói", tasks: [{ key: "S1", prompt: "Speak", responseType: "speaking_evidence", maxScore: 25 }] }] }
      ], warnings: [], versions: [], deletable: true, deleteReason: null
    } as any;
    const updateAssessmentLevelForm = vi.fn().mockImplementation(async (_id, input) => ({ ...detail, title: input.title, sections: input.sections }));
    let published = false;
    const publishAssessmentLevelForm = vi.fn().mockImplementation(async () => { published = true; });
    const client = {
      getAssessmentLevelForms: vi.fn().mockImplementation(async () => [{ targetLevel: "B1", publishedForm: published ? { ...detail, status: "published" } : null, draftForm: published ? null : detail }]),
      getAssessmentLevelForm: vi.fn().mockResolvedValue(detail), updateAssessmentLevelForm, publishAssessmentLevelForm,
      getSystemCapabilities: vi.fn().mockResolvedValue({ ai: true })
    };
    render(<MemoryRouter initialEntries={["/op/levelforms"]}><OperatorRouteController session={operator} client={client as any} /></MemoryRouter>);

    const edit = await screen.findByRole("button", { name: "Sửa đề" });
    expect(screen.queryByRole("button", { name: "Duyệt & phát hành" })).not.toBeInTheDocument();
    await user.click(edit);
    const editor = await screen.findByRole("dialog", { name: "Chi tiết Đề B1" });
    const header = editor.querySelector<HTMLElement>(".operator-level-form-dialog-header")!;
    // The header holds only the close button; edit actions sit in the sticky footer (owner 18/11).
    expect(within(header).getAllByRole("button").map(button => button.textContent)).toEqual(["Đóng"]);
    const footer = editor.querySelector<HTMLElement>(".operator-level-form-dialog-footer")!;
    expect(within(footer).getAllByRole("button").map(button => button.textContent)).toEqual(["Hủy", "Lưu bản nháp"]);
    const status = within(editor).getByRole("region", { name: "Trạng thái đề lên mức" });
    const publish = within(status).getByRole("button", { name: "Duyệt & phát hành" });
    expect(publish).toBeDisabled();
    await user.click(within(status).getByRole("checkbox", { name: "Tôi đã đọc lại đáp án từng câu" }));
    expect(publish).toBeEnabled();
    const prompt = await screen.findByRole("textbox", { name: "Nội dung L1" });
    await user.clear(prompt);
    await user.type(prompt, "Updated prompt");
    expect(publish).toBeDisabled();
    expect(status).toHaveTextContent("Lưu các thay đổi trước khi phát hành.");
    await user.click(within(editor).getByRole("button", { name: "Đóng" }));
    const discard = await screen.findByRole("dialog", { name: "Bỏ thay đổi chưa lưu?" });
    await user.click(within(discard).getByRole("button", { name: "Sửa tiếp" }));
    expect(prompt).toHaveValue("Updated prompt");
    await user.click(screen.getByRole("button", { name: "Lưu bản nháp" }));

    await waitFor(() => expect(updateAssessmentLevelForm).toHaveBeenCalledWith("version-1", expect.objectContaining({ sections: expect.any(Array) })));
    expect(updateAssessmentLevelForm.mock.calls[0]?.[1].sections[0].groups[0].tasks[0].prompt).toBe("Updated prompt");
    await user.click(within(status).getByRole("checkbox", { name: "Tôi đã đọc lại đáp án từng câu" }));
    await waitFor(() => expect(publish).toBeEnabled());
    await user.click(publish);
    const confirmation = await screen.findByRole("dialog", { name: "Duyệt và phát hành đề lên mức?" });
    expect(publishAssessmentLevelForm).not.toHaveBeenCalled();
    await user.click(within(confirmation).getByRole("button", { name: "Duyệt & phát hành" }));
    await waitFor(() => expect(publishAssessmentLevelForm).toHaveBeenCalledWith("version-1", { answersReviewed: true }));
    expect(await screen.findByRole("button", { name: "Chỉnh sửa" })).toBeInTheDocument();
    expect(screen.queryByRole("dialog", { name: "Chi tiết Đề B1" })).not.toBeInTheDocument();
  });

  it("opens four work areas under the review heading", async () => {
    const review = {
      tabs: [
        { key: "submissions", label: "Bài nộp", count: 0, unreadCount: 0 },
        { key: "coach", label: "Phản hồi coach", count: 0 },
        { key: "weekly_practices", label: "Bài cuối tuần", count: 1 },
        { key: "micro", label: "Bài siêu ngắn", count: 0 },
        { key: "appeals", label: "Kháng nghị", count: 0 },
        { key: "attempts", label: "Số lần làm bài", count: 0 },
        { key: "assessments", label: "Bài test", count: 0 }
      ],
      submissions: [], coachSamples: [], microLessons: [], appeals: [], lessonAttempts: [], assessments: [],
      weeklyPractices: [{ versionId: "v1", weekNumber: 1, cefr: "A2", topic: "Directions", status: "draft", version: 1, task: "Write three sentences.", guidance: "Use weekly words.", requiredVocabulary: ["left"] }]
    } as ContentReviewView;

    render(<ToastProvider><MemoryRouter initialEntries={["/op/review"]}><OperatorRouteController session={operator} client={{ getContentReview: vi.fn().mockResolvedValue(review) } as any} /></MemoryRouter></ToastProvider>);

    const navigation = screen.getByRole("navigation", { name: "Phản hồi & yêu cầu" });
    expect(within(navigation).getAllByRole("link").map(link => link.textContent)).toEqual(["Phản hồi Season", "Kháng nghị học viên", "Yêu cầu đã gửi", "Cảnh báo bài tập"]);
    expect(within(navigation).getByRole("link", { name: "Phản hồi Season" })).toHaveAttribute("aria-current", "page");
    expect(await screen.findByText("Chưa có lượt luyện nào.")).toBeInTheDocument();
  });

  it.each([
    ["coach", "Chưa có lượt luyện nào.", "Phản hồi Season"],
    ["appeals", "Chưa có kháng nghị.", "Lọc theo trạng thái"],
    ["sent", "Chưa có yêu cầu gửi Quản lý.", "Yêu cầu đã gửi"],
    ["attempts", "Chưa có câu bài ngày sai cả hai lượt.", "Cảnh báo bài tập"]
  ])("guides the active %s review tab even when its list is empty", async (tab, empty, heading) => {
    const layout = vi.spyOn(HTMLElement.prototype, "getClientRects").mockImplementation(function (this: HTMLElement) {
      return (this.closest("[hidden]") ? [] : [new DOMRect(20, 60, 260, 50)]) as unknown as DOMRectList;
    });
    try {
      const client = {
        getContentReview: vi.fn().mockResolvedValue({
          tabs: [], submissions: [], coachSamples: [], microLessons: [], weeklyPractices: [], appeals: [],
          lessonAttempts: [], exerciseWarnings: [], assessments: []
        }),
        getContentReviewAppeals: vi.fn().mockResolvedValue({ appeals: [], hasMore: false }),
        getOwnReopenRequests: vi.fn().mockResolvedValue({ requests: [] }),
        getOwnDeletionRequests: vi.fn().mockResolvedValue({ requests: [] })
      };
      render(<ToastProvider><MemoryRouter initialEntries={[`/op/review?tab=${tab}`]}>
        <AppGuide role="operator" pathname="/op/review" compact={false} />
        <OperatorRouteController session={operator} client={client as any} />
      </MemoryRouter></ToastProvider>);
      await screen.findByText(empty);
      fireEvent.click(screen.getByRole("button", { name: "Hướng dẫn sử dụng" }));
      const guide = screen.getByRole("dialog", { name: "Hướng dẫn sử dụng" });
      fireEvent.click(within(guide).getByRole("button", { name: "Tiếp theo" }));
      expect(within(guide).getByRole("heading", { name: heading })).toBeInTheDocument();
    } finally {
      layout.mockRestore();
    }
  });

  it("switches Bài kiểm tra between recap result categories in the shared result shell", async () => {
    const user = userEvent.setup();
    const review = {
      tabs: [{ key: "assessments", label: "Bài test", count: 1 }], submissions: [], coachSamples: [], microLessons: [], weeklyPractices: [], appeals: [], lessonAttempts: [],
      assessments: [{ id: "a1", learnerId: "u1", learnerName: "Lan", kind: "placement", title: "Bài đầu vào", submittedAt: "2026-10-21T08:00:00.000Z", totalScore: 72, status: "submitted" }]
    } as any;
    const preview = (kind: "placement" | "level_up" | "final" | "pass_course") => ({ kind, forms: [{
      definitionId: `${kind}-definition`, versionId: `${kind}-version`, kind,
      title: kind === "placement" ? "Đề đầu vào thực" : kind === "final" ? "Bài thi tháng thực" : kind === "level_up" ? "Đề lên mức thực" : "Pass Course – Form A",
      version: 1, status: "published" as const, publishedAt: "2026-11-01T00:00:00.000Z", targetLevel: kind === "level_up" ? "B1" : null,
      totalMinutes: 90, totalScore: 100, audioConfigured: true, editable: false,
      sections: ["listening", "reading", "writing", "speaking"].map((code, index) => ({
        code, title: ["Nghe", "Đọc", "Viết", "Nói"][index]!, durationMinutes: 20, maxScore: 25, instructions: ["Hướng dẫn thật"],
        groups: [{ key: `${code}-group`, title: `${code} group`, instruction: "Nội dung thật", stimulus: code === "listening" ? { type: "audio_script" as const, audioSrc: "/audio/real.mp3" } : undefined, tasks: [{ key: `${code}-1`, prompt: `${kind} actual ${code} prompt`, responseType: code === "speaking" ? "speaking_evidence" as const : code === "writing" ? "long_text" as const : "single_choice" as const, maxScore: 25 }] }]
      }))
    }] });
    const promotionForm = { ...preview("level_up").forms[0]!, listeningTaskCount: 1, readingTaskCount: 1, attemptCount: 0 };
    const levelFormDetail = { ...promotionForm, warnings: [{ code: "missing_audio", message: "Cần thêm audio nhóm 2.", severity: "error" }], versions: [], deletable: false, deleteReason: "Đã phát hành" };
    const client = {
      getContentReview: vi.fn().mockResolvedValue(review),
      getAssessmentFormPreviews: vi.fn().mockImplementation(async (kind) => preview(kind)),
      getAssessmentLevelForms: vi.fn().mockResolvedValue([{ targetLevel: "B1", publishedForm: promotionForm, draftForm: null }]),
      getAssessmentLevelForm: vi.fn().mockResolvedValue(levelFormDetail),
      getSystemCapabilities: vi.fn().mockResolvedValue({ ai: true })
    };
    render(<MemoryRouter initialEntries={["/op/tests"]}><OperatorRouteController session={operator} client={client as any} /></MemoryRouter>);

    expect(await screen.findByRole("heading", { name: "Kết quả bài thi" })).toBeInTheDocument();
    const navigation = screen.getByRole("tablist", { name: "Loại bài kiểm tra" });
    expect(within(navigation).getAllByRole("tab").map(tab => tab.textContent)).toEqual(["Đề đầu vào", "Bài thi tháng", "Đề lên mức", "Đề đầu ra"]);
    expect(await screen.findByText("Lan")).toBeInTheDocument();
    expect(screen.queryByText("placement actual listening prompt")).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Xem Đề đầu vào thực" }));
    const placementDialog = await screen.findByRole("dialog", { name: "Xem đề Đề đầu vào thực" });
    await user.click(within(placementDialog).getByRole("button", { name: /Nghe.*1 câu/ }));
    expect(placementDialog).toHaveTextContent("placement actual listening prompt");
    await user.click(screen.getByRole("button", { name: "Đóng" }));

    await user.click(within(navigation).getByRole("tab", { name: "Bài thi tháng" }));
    expect(within(navigation).getByRole("tab", { name: "Bài thi tháng" })).toHaveAttribute("aria-selected", "true");
    await user.click(await screen.findByRole("button", { name: "Xem Bài thi tháng thực" }));
    const monthlyDialog = await screen.findByRole("dialog", { name: "Xem đề Bài thi tháng thực" });
    await user.click(within(monthlyDialog).getByRole("button", { name: /Nghe.*1 câu/ }));
    expect(monthlyDialog).toHaveTextContent("final actual listening prompt");
    await user.click(screen.getByRole("button", { name: "Đóng" }));
    expect(screen.getByText("Chưa có bài test.")).toBeInTheDocument();

    await user.click(within(navigation).getByRole("tab", { name: "Đề lên mức" }));
    expect(within(navigation).getByRole("tab", { name: "Đề lên mức" })).toHaveAttribute("aria-selected", "true");
    await user.click(await screen.findByRole("button", { name: "Xem" }));
    const levelDialog = await screen.findByRole("dialog", { name: "Xem đề Đề lên mức thực" });
    expect(within(levelDialog).getByRole("table", { name: "Cấu trúc bài thi" })).toBeInTheDocument();
    expect(levelDialog).not.toHaveTextContent("Cần thêm audio nhóm 2.");
    expect(within(levelDialog).queryByRole("region", { name: "Cảnh báo kiểm tra đề" })).not.toBeInTheDocument();
    expect(within(levelDialog).queryByRole("heading", { name: "Lịch sử phiên bản" })).not.toBeInTheDocument();
    await user.click(within(levelDialog).getByRole("button", { name: /Nghe.*1 câu/ }));
    expect(levelDialog).toHaveTextContent("level_up actual listening prompt");
    await user.click(screen.getByRole("button", { name: "Đóng" }));
    expect(screen.getByText("Chưa có bài test.")).toBeInTheDocument();

    await user.click(within(navigation).getByRole("tab", { name: "Đề đầu ra" }));
    expect(within(navigation).getByRole("tab", { name: "Đề đầu ra" })).toHaveAttribute("aria-selected", "true");
    await user.click(await screen.findByRole("button", { name: "Xem Pass Course – Form A" }));
    const exitDialog = await screen.findByRole("dialog", { name: "Xem đề Pass Course – Form A" });
    await user.click(within(exitDialog).getByRole("button", { name: /Nghe.*1 câu/ }));
    expect(exitDialog).toHaveTextContent("pass_course actual listening prompt");
  });

  it("shows the placement retake form as its own card in Đề đầu vào, between the versions and the results, and not under Đề lên mức", async () => {
    const user = userEvent.setup();
    const generateAssessmentLevelForm = vi.fn();
    let finishGeneration: () => void = () => { throw new Error("Generation did not start"); };
    const retakeDraft = { definitionId: "retake-def", versionId: "retake-v1", title: "Đề thi lại nháp", version: 1, publishedAt: null, listeningTaskCount: 15, readingTaskCount: 40, attemptCount: 0, status: "draft" as const, publicationReady: true };
    let retakeSlot: { targetLevel: "placement-retake"; publishedForm: null; draftForm: typeof retakeDraft | null } = { targetLevel: "placement-retake", publishedForm: null, draftForm: null };
    const client = {
      getContentReview: vi.fn().mockResolvedValue({ tabs: [], submissions: [], coachSamples: [], microLessons: [], appeals: [], lessonAttempts: [], assessments: [], weeklyPractices: [] }),
      getAssessmentFormPreviews: vi.fn().mockImplementation(async (kind) => ({ kind, forms: [] })),
      getAssessmentLevelForms: vi.fn().mockImplementation(async () => [{ targetLevel: "B1", publishedForm: null, draftForm: null }, retakeSlot]),
      getAssessmentLevelForm: vi.fn(),
      generateAssessmentLevelForm: generateAssessmentLevelForm.mockImplementation(() => new Promise<void>(resolve => {
        finishGeneration = () => { retakeSlot = { ...retakeSlot, draftForm: retakeDraft }; resolve(); };
      })),
      getSystemCapabilities: vi.fn().mockResolvedValue({ ai: true })
    };
    function TestNavigation() {
      const { pathname } = useLocation();
      return pathname === "/settings" ? <Link to="/op/tests">Quay lại bài thi QA</Link>
        : <><Link to="/settings">Cài đặt QA</Link><OperatorRouteController session={operator} client={client as any} /></>;
    }
    render(<ToastProvider><MemoryRouter initialEntries={["/op/tests"]}><TestNavigation /></MemoryRouter></ToastProvider>);

    const navigation = await screen.findByRole("tablist", { name: "Loại bài kiểm tra" });
    expect(within(navigation).getByRole("tab", { name: "Đề đầu vào" })).toHaveAttribute("aria-selected", "true");
    const retakeCard = await screen.findByRole("region", { name: "Đề thi lại" });
    expect(within(retakeCard).getByRole("heading", { name: "Đề thi lại" })).toBeInTheDocument();
    expect(within(retakeCard).getByText("Chưa có đề")).toBeInTheDocument();
    expect(within(retakeCard).queryByRole("heading", { name: "Mức đích B1" })).not.toBeInTheDocument();
    // Between the "Đề đầu vào" versions card and the learners' results.
    const versionsCard = screen.getByRole("region", { name: "Chưa có nội dung đề thi" });
    expect(versionsCard.compareDocumentPosition(retakeCard) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    const results = await screen.findByText("Chưa có bài test.");
    expect(retakeCard.compareDocumentPosition(results) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();

    await waitFor(() => expect(within(retakeCard).getByRole("button", { name: "Sinh đề bằng AI" })).toBeEnabled());
    await user.click(within(retakeCard).getByRole("button", { name: "Sinh đề bằng AI" }));
    expect(generateAssessmentLevelForm).toHaveBeenCalledWith("placement-retake");
    await user.click(within(navigation).getByRole("tab", { name: "Bài thi tháng" }));
    await user.click(within(navigation).getByRole("tab", { name: "Đề đầu vào" }));
    const generatingCard = await screen.findByRole("region", { name: "Đề thi lại" });
    const pending = within(generatingCard).getByRole("button", { name: "Đang sinh…" });
    expect(pending).toBeDisabled();
    await user.click(pending);
    expect(generateAssessmentLevelForm).toHaveBeenCalledTimes(1);
    await user.click(within(navigation).getByRole("tab", { name: "Bài thi tháng" }));
    await user.click(screen.getByRole("link", { name: "Cài đặt QA" }));
    finishGeneration();
    await user.click(screen.getByRole("link", { name: "Quay lại bài thi QA" }));
    const refreshed = await screen.findByRole("region", { name: "Đề thi lại" });
    expect(await within(refreshed).findByText("Đề thi lại nháp")).toBeInTheDocument();
    expect(within(refreshed).getByRole("button", { name: "Xem Đề thi lại nháp" })).toBeEnabled();
    expect(within(refreshed).getByRole("button", { name: "Sửa & phát hành" })).toBeEnabled();

    await user.click(screen.getByRole("tab", { name: "Đề lên mức" }));
    const levelCard = await screen.findByRole("region", { name: "Phiên bản đề lên mức" });
    expect(within(levelCard).getByRole("heading", { name: "Mức đích B1" })).toBeInTheDocument();
    expect(levelCard).not.toHaveTextContent("Đề thi lại");
    expect(screen.queryByRole("region", { name: "Đề thi lại" })).not.toBeInTheDocument();
  });


  it("opens the submitted attempt from a manual-grading notification in the monthly exam tab", async () => {
    const attemptId = "dd8828fc-27c5-4321-8876-515725d2569a";
    const getContentReviewAssessment = vi.fn().mockResolvedValue({
      attemptId, learnerId: "u1", learnerName: "Lan", kind: "final", title: "Bài thi tháng",
      status: "pending_review", startedAt: "2026-11-09T08:00:00.000Z", submittedAt: "2026-11-09T08:30:00.000Z",
      totalScore: null, taskPrompts: [], answers: [], scores: [], integrityEvents: [], decision: null, appeal: null
    });
    const client = {
      getContentReview: vi.fn().mockResolvedValue({ tabs: [], submissions: [], coachSamples: [], microLessons: [], appeals: [], lessonAttempts: [], assessments: [], weeklyPractices: [] }),
      getAssessmentFormPreviews: vi.fn().mockResolvedValue({ kind: "final", forms: [] }),
      getContentReviewAssessment
    };
    render(<ToastProvider><MemoryRouter initialEntries={[`/op/tests?tab=monthly&attemptId=${attemptId}`]}><OperatorRouteController session={operator} client={client as any} /></MemoryRouter></ToastProvider>);
    expect(await screen.findByRole("dialog", { name: "Chi tiết bài test của Lan" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Bài thi tháng" })).toHaveAttribute("aria-selected", "true");
    expect(getContentReviewAssessment).toHaveBeenCalledWith(attemptId);
  });

  it("opens the exact monthly draft in the exam tab and refreshes its shared saved preview", async () => {
    const user = userEvent.setup();
    let draft = monthlyFinalView({ status: "READY", audio: true, reviewed: true });
    const getMonthlyFinal = vi.fn().mockImplementation(async () => draft);
    const updateMonthlyFinal = vi.fn().mockImplementation(async (_versionId, blueprint) => {
      draft = { ...draft, blueprint };
      return draft;
    });
    const publishMonthlyFinal = vi.fn().mockImplementation(async () => {
      draft = { ...draft, status: "published", editable: false };
    });
    const client = {
      getContentReview: vi.fn().mockResolvedValue({ tabs: [], submissions: [], coachSamples: [], microLessons: [], appeals: [], lessonAttempts: [], assessments: [], weeklyPractices: [] }),
      getAssessmentFormPreviews: vi.fn().mockImplementation(async kind => ({
        kind,
        forms: kind === "final" ? [{ ...draft, title: draft.blueprint.title, sections: draft.blueprint.sections, kind, monthlyFrameworkId: "framework-b1", targetLevel: "B1", totalMinutes: 30, totalScore: 100, audioConfigured: true }] : []
      })),
      getMonthlyFinal, updateMonthlyFinal, publishMonthlyFinal
    };
    render(<MemoryRouter initialEntries={["/op/tests"]}><OperatorRouteController session={operator} client={client as any} /></MemoryRouter>);

    const monthlyTab = screen.getByRole("tab", { name: "Bài thi tháng" });
    await user.click(monthlyTab);
    getMonthlyFinal.mockResolvedValueOnce({ ...draft, versionId: "final-v2" });
    await user.click(await screen.findByRole("button", { name: "Sửa đề" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Phiên bản đề thi tháng đã thay đổi");
    expect(screen.queryByRole("dialog", { name: "Bản nháp đề thi tháng" })).not.toBeInTheDocument();

    await user.click(await screen.findByRole("button", { name: "Xem Monthly Test – Project updates" }));
    const preview = await screen.findByRole("dialog", { name: "Xem đề Monthly Test – Project updates" });
    await user.click(within(preview).getByRole("button", { name: "Sửa đề" }));
    let editor = await screen.findByRole("dialog", { name: "Bản nháp đề thi tháng" });
    expect(getMonthlyFinal).toHaveBeenCalledWith("framework-b1");
    expect(monthlyTab).toHaveAttribute("aria-selected", "true");
    expect(preview).not.toBeInTheDocument();
    await user.click(within(editor).getByText("Listening", { selector: "summary b" }));
    const prompt = within(editor).getByRole("textbox", { name: "Nội dung L01" });
    fireEvent.change(prompt, { target: { value: "What is the confirmed deadline?" } });
    await user.click(within(editor).getByRole("button", { name: "Lưu bản nháp" }));
    await waitFor(() => expect(updateMonthlyFinal).toHaveBeenCalledWith("final-v1", expect.objectContaining({ sections: expect.any(Array) })));
    await user.click(within(editor).getByRole("button", { name: "Đóng" }));
    await user.click(screen.getByRole("button", { name: "Xem Monthly Test – Project updates" }));
    const updatedPreview = await screen.findByRole("dialog", { name: "Xem đề Monthly Test – Project updates" });
    await user.click(within(updatedPreview).getByRole("button", { name: /Listening.*1 câu/ }));
    expect(updatedPreview).toHaveTextContent("What is the confirmed deadline?");
    await user.click(within(updatedPreview).getByRole("button", { name: "Đóng" }));

    await user.click(screen.getByRole("button", { name: "Sửa đề" }));
    editor = await screen.findByRole("dialog", { name: "Bản nháp đề thi tháng" });
    await user.click(within(editor).getByRole("button", { name: "Duyệt & phát hành" }));
    const publication = await screen.findByRole("dialog", { name: "Duyệt và phát hành đề tháng?" });
    await user.click(within(publication).getByRole("button", { name: "Duyệt & phát hành" }));
    await waitFor(() => expect(publishMonthlyFinal).toHaveBeenCalledWith("final-v1"));
    expect(await screen.findByText(/Phiên bản 1 · Đã phát hành/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Sửa đề" })).not.toBeInTheDocument();
  });

  it("deletes the confirmed monthly draft and keeps the published form", async () => {
    const user = userEvent.setup();
    const draft = monthlyFinalView();
    const form = { ...draft, title: "Bài thi tháng 11/2026 · B1", kind: "final", monthlyFrameworkId: "framework-b1", totalMinutes: 30, totalScore: 100, sections: draft.blueprint.sections };
    const published = { ...form, versionId: "published-v1", status: "published", editable: false };
    let forms = [form, published];
    const deleteMonthlyFinal = vi.fn(async () => { forms = [published]; });
    const client = {
      getContentReview: vi.fn().mockResolvedValue({ tabs: [], submissions: [], coachSamples: [], microLessons: [], appeals: [], lessonAttempts: [], assessments: [], weeklyPractices: [] }),
      getAssessmentFormPreviews: vi.fn().mockImplementation(async kind => ({ kind, forms: kind === "final" ? forms : [] })),
      deleteMonthlyFinal
    };
    render(<MemoryRouter initialEntries={["/op/tests"]}><OperatorRouteController session={operator} client={client as any} /></MemoryRouter>);
    await user.click(screen.getByRole("tab", { name: "Bài thi tháng" }));
    await user.click(await screen.findByRole("button", { name: "Xoá" }));
    const confirm = await screen.findByRole("dialog", { name: "Xoá bản nháp đề thi tháng?" });
    expect(confirm).toHaveTextContent(form.title);
    expect(deleteMonthlyFinal).not.toHaveBeenCalled();
    await user.click(within(confirm).getByRole("button", { name: "Huỷ" }));
    expect(deleteMonthlyFinal).not.toHaveBeenCalled();
    await user.click(screen.getByRole("button", { name: "Xoá" }));
    await user.click(within(await screen.findByRole("dialog", { name: "Xoá bản nháp đề thi tháng?" })).getByRole("button", { name: "Xoá bản nháp" }));
    expect(await screen.findByText("Đã xoá bản nháp đề thi tháng.")).toBeInTheDocument();
    expect(deleteMonthlyFinal).toHaveBeenCalledExactlyOnceWith(form.versionId);
    expect(screen.queryByRole("button", { name: "Xoá" })).not.toBeInTheDocument();
    expect(screen.getByText(/Phiên bản 1 · Đã phát hành/)).toBeInTheDocument();
  });













  it("keeps Manager review read-only and omits the retired super-short lesson", async () => {
    const review = {
      tabs: [
        { key: "submissions", label: "Bài nộp", count: 0 },
        { key: "coach", label: "Phản hồi coach", count: 0 },
        { key: "micro", label: "Bài siêu ngắn", count: 2 },
        { key: "appeals", label: "Kháng nghị", count: 0 },
        { key: "attempts", label: "Số lần làm bài", count: 0 },
        { key: "assessments", label: "Bài test", count: 0 }
      ],
      submissions: [],
      coachSamples: [{
        id: "turn-1", learnerName: "Lan", cefr: "A2", weekNumber: 2,
        createdAt: "2026-11-06T09:00:00.000Z", checked: false, learnerText: "I can send the report.", coachText: "Good.",
        scores: { meaning: 4, vocabulary: 4, grammar: 4 }, suggestions: []
      }],
      microLessons: [], appeals: [], lessonAttempts: [], assessments: []
    } as ContentReviewView;
    render(<MemoryRouter initialEntries={["/mgr/ops/review"]}><OperatorRouteController session={manager} client={{ getContentReview: vi.fn().mockResolvedValue(review) } as any} basePath="/mgr/ops" /></MemoryRouter>);

    expect(await screen.findByRole("heading", { name: "Chấm & Kháng nghị" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: /Phản hồi Season/ })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByText("Lan")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Đánh dấu đã kiểm", hidden: true })).toBeDisabled();
    expect(screen.queryByRole("tab", { name: /bài siêu ngắn|bài nộp/i })).not.toBeInTheDocument();
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

  it("closes the placement approval prompt on cancel or Escape without an error toast", async () => {
    const user = userEvent.setup();
    const overview = {
      placementTrial: { month: "2026-11", countsFrom: "2026-12-01", levels: ["B1"] },
      pendingAssessments: [{ attemptId: "a1", learnerId: "u1", learnerName: "Lan", kind: "placement", title: "Đầu vào", submittedAt: "2026-10-14", sectionScores: { listening: 70 }, suggestedLevel: "B1" }],
      pendingLevelUp: [], approvedLearners: [{ learnerId: "already-approved", learnerName: "Học viên học thử", currentLevel: "B1", trialCountsFrom: "2026-12-01" }], unassessedLearners: [],
      levelSignals: { windowDays: 14, ready: [], weak: [] }, topicReports: []
    };
    const decideAssessment = vi.fn().mockResolvedValue({});
    render(<MemoryRouter initialEntries={["/op"]}><OperatorRouteController session={operator} client={{ getAssessmentReviewOverview: vi.fn().mockResolvedValue(overview), decideAssessment } as any} /></MemoryRouter>);

    expect(await screen.findByText("Học thử · tính từ 01/12")).toBeInTheDocument();
    await user.selectOptions(await screen.findByRole("combobox", { name: "Mức duyệt cho Lan" }), "B1");
    await user.click(screen.getByRole("button", { name: "Duyệt mức" }));
    const approval = screen.getByRole("dialog", { name: "Duyệt mức đầu vào" });
    expect(approval).toHaveTextContent(/học thử tháng 11.*xét lên mức bắt đầu tính từ 01\/12/iu);
    const heading = within(approval).getByRole("heading", { name: "Duyệt mức đầu vào" });
    const close = within(approval).getByRole("button", { name: "Đóng hộp thoại" });
    expect(close.parentElement).toBe(heading.parentElement);
    expect(within(approval).getByLabelText("Lý do")).toHaveFocus();
    await user.click(close);
    expect(decideAssessment).not.toHaveBeenCalled();
    await user.click(screen.getByRole("button", { name: "Duyệt mức" }));
    await user.click(within(screen.getByRole("dialog", { name: "Duyệt mức đầu vào" })).getByRole("button", { name: /Huỷ|Hủy/ }));
    await user.click(screen.getByRole("button", { name: "Duyệt mức" }));
    screen.getByRole("dialog", { name: "Duyệt mức đầu vào" });
    await user.keyboard("{Escape}");

    await waitFor(() => expect(screen.queryByRole("dialog", { name: "Duyệt mức đầu vào" })).not.toBeInTheDocument());
    expect(screen.queryByText(/Lý do duyệt mức là bắt buộc/)).not.toBeInTheDocument();
    expect(decideAssessment).not.toHaveBeenCalled();
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

  it("shows the persisted monthly goal and signal window on the level dashboard", async () => {
    const client = {
      getAssessmentReviewOverview: vi.fn().mockResolvedValue({
        pendingAssessments: [], pendingLevelUp: [],
        approvedLearners: [{ learnerId: "u5", learnerName: "Vy", currentLevel: "A2", placementScore: 81, monthlyGoal: "Email khách hàng" }],
        unassessedLearners: [], levelSignals: { windowDays: 21, ready: [], weak: [] }, topicReports: []
      })
    };
    render(<MemoryRouter initialEntries={["/op"]}><OperatorRouteController session={operator} client={client as any} /></MemoryRouter>);

    expect(await screen.findByText("1 người học đang hoạt động.")).toBeInTheDocument();
    expect(within(screen.getByTestId("approved-u5")).getByText("Email khách hàng")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: /Tín hiệu đổi mức/ })).toHaveTextContent("21 ngày gần nhất");
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
    await user.click(within(screen.getByRole("dialog", { name: "Chấm lại bằng AI?" })).getByRole("button", { name: "Chấm lại" }));
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
    render(<ToastProvider><MemoryRouter initialEntries={["/op"]}><OperatorRouteController session={operator} client={{ getAssessmentReviewOverview: vi.fn().mockResolvedValue(overview), rescoreAssessment } as any} /></MemoryRouter></ToastProvider>);

    await user.click(await screen.findByRole("button", { name: "Chấm lại bằng AI" }));
    await user.click(within(screen.getByRole("dialog", { name: "Chấm lại bằng AI?" })).getByRole("button", { name: "Chấm lại" }));
    // An unknown code never reaches the screen: the generic text shows, the code stays in the tooltip.
    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("Có lỗi xảy ra, vui lòng thử lại."));
    expect(screen.getByRole("alert")).toHaveAttribute("title", "Mã lỗi: ASSESSMENT_RESCORE_FAILED");
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

    const openEvidenceStep = async () => {
      await user.click(await screen.findByRole("button", { name: "Đổi level" }));
      await user.type(screen.getByLabelText("Mức CEFR (A1/A2/B1/B2/C1)"), "B1");
      await user.click(screen.getByRole("button", { name: "Tiếp tục" }));
      await user.type(await screen.findByLabelText("Lý do"), "Đã sẵn sàng");
      await user.click(screen.getByRole("button", { name: "Tiếp tục" }));
    };
    await openEvidenceStep();
    await user.click(within(screen.getByRole("dialog", { name: "Bằng chứng thay đổi mức" })).getByRole("button", { name: "Huỷ" }));
    expect(changeAssessmentReviewLearnerLevel).not.toHaveBeenCalled();
    await openEvidenceStep();
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
    expect(screen.getByText("2,5%")).toBeInTheDocument();
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

  it("opens Season for a retired weekly-submission entry without showing the legacy rows", async () => {
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

    expect(await screen.findByText("Chưa có lượt luyện nào.")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Phản hồi Season" })).toHaveAttribute("aria-current", "page");
    expect(screen.queryByText("I work in product.")).not.toBeInTheDocument();
    expect(screen.queryByText("Viết email xin dời lịch họp theo chủ đề Meetings.")).not.toBeInTheDocument();
  });

  it("resolves Season audio by the artifact key persisted on the review item", async () => {
    const review: ContentReviewView = {
      tabs: [
        { key: "submissions", label: "Bài nộp", count: 1, unreadCount: 1 },
        { key: "coach", label: "Phản hồi coach", count: 1 },
        { key: "micro", label: "Bài siêu ngắn", count: 0 },
        { key: "appeals", label: "Kháng nghị", count: 0 },
        { key: "attempts", label: "Số lần làm bài", count: 0 },
        { key: "assessments", label: "Bài test", count: 0 }
      ],
      submissions: [],
      coachSamples: [{
        id: "turn-1", learnerName: "Lan", cefr: "A2", weekNumber: 2,
        createdAt: "2026-10-14T09:00:00.000Z", checked: false, learnerText: "Season transcript", coachText: "Good.",
        scores: { meaning: null, vocabulary: null, grammar: null }, suggestions: [],
        audioArtifact: { artifactKey: "audio/season-current.webm" }
      }],
      microLessons: [], appeals: [], lessonAttempts: [], assessments: []
    };
    const listAssessmentAudio = vi.fn().mockResolvedValue({ items: [
      { fileId: "current-season", artifactKey: "audio/season-current.webm", sourceFlow: "season", sourceEntityId: "turn-1", signedUrl: "/audio/season-current.webm" },
      { fileId: "old-season", artifactKey: "audio/season-old.webm", sourceFlow: "season", sourceEntityId: "turn-1", signedUrl: "/audio/season-old.webm" }
    ] });
    render(<MemoryRouter initialEntries={["/op/review?tab=coach"]}><OperatorRouteController session={operator} client={{ getContentReview: vi.fn().mockResolvedValue(review), listAssessmentAudio } as any} /></MemoryRouter>);
    expect(await screen.findByLabelText("Phát Bản ghi âm Season của Lan")).toHaveAttribute("src", "/audio/season-current.webm");
  });

  it("does not request the assessment audio list when object storage is not configured", async () => {
    const review = {
      tabs: [{ key: "coach", label: "Phản hồi coach", count: 1 }],
      submissions: [],
      coachSamples: [{
        id: "turn-1", learnerName: "Lan", cefr: "A2", weekNumber: 2,
        createdAt: "2026-10-14T09:00:00.000Z", checked: false, learnerText: "Season transcript", coachText: "Good.",
        scores: { meaning: null, vocabulary: null, grammar: null }, suggestions: []
      }],
      microLessons: [], appeals: [], lessonAttempts: [], assessments: []
    } as unknown as ContentReviewView;
    const listAssessmentAudio = vi.fn().mockRejectedValue(new ApiError("NOT_FOUND", "http", 404));
    const getSystemCapabilities = vi.fn().mockResolvedValue({ api: true, database: true, ai: false, objectStorage: false, maintenance: false, imageProviders: { pexels: false, pixabay: false } });
    render(<ToastProvider><MemoryRouter initialEntries={["/op/review?tab=coach"]}><OperatorRouteController session={operator} client={{ getContentReview: vi.fn().mockResolvedValue(review), listAssessmentAudio, getSystemCapabilities } as any} /></MemoryRouter></ToastProvider>);

    expect(await screen.findByText("Season transcript")).toBeInTheDocument();
    expect(listAssessmentAudio).not.toHaveBeenCalled();
  });

  it("keeps the current review navigation available when a retired tab is requested by URL", async () => {
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
    render(<ToastProvider><MemoryRouter initialEntries={["/op/review?tab=subs"]}><OperatorRouteController session={operator} client={{ getContentReview: vi.fn().mockResolvedValue(review) } as any} /></MemoryRouter></ToastProvider>);

    expect(await screen.findByText("Chưa có lượt luyện nào.")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Kháng nghị học viên" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Yêu cầu đã gửi" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Cảnh báo bài tập" })).toBeInTheDocument();
  });


  it("labels the status of finished monthly and pass-course rows in the results table", async () => {
    const user = userEvent.setup();
    const assessment = (id: string, learnerName: string, kind: "final" | "pass_course", status: string) => ({ id, learnerName, kind, title: kind, status, submittedAt: "2026-11-06T08:00:00.000Z", totalScore: 80 });
    const review = {
      tabs: [{ key: "assessments", label: "Bài test", count: 4 }],
      coachSamples: [], submissions: [], microLessons: [], appeals: [], lessonAttempts: [],
      assessments: [assessment("m-1", "Lan", "final", "completed"), assessment("m-2", "Hoa", "final", "approved"), assessment("p-1", "Minh", "pass_course", "completed"), assessment("p-2", "Nam", "pass_course", "needs_retry")]
    };
    const client = { getContentReview: vi.fn().mockResolvedValue(review), getAssessmentFormPreviews: vi.fn().mockResolvedValue({ forms: [] }) };
    render(<ToastProvider><MemoryRouter initialEntries={["/op/tests"]}><OperatorRouteController session={operator} client={client as any} /></MemoryRouter></ToastProvider>);

    await user.click(screen.getByRole("tab", { name: "Bài thi tháng" }));
    let table = await screen.findByRole("table", { name: "Lượt làm bài thi" });
    expect(within(within(table).getByRole("row", { name: /Lan/ })).getByText("· Đã hoàn thành")).toBeInTheDocument();
    expect(within(within(table).getByRole("row", { name: /Hoa/ })).getByText("· Đã duyệt")).toBeInTheDocument();
    await user.click(screen.getByRole("tab", { name: "Đề đầu ra" }));
    table = await screen.findByRole("table", { name: "Lượt làm bài thi" });
    expect(within(within(table).getByRole("row", { name: /Minh/ })).getByText("· Đã hoàn thành")).toBeInTheDocument();
    expect(within(within(table).getByRole("row", { name: /Nam/ })).getByText("· Cần làm lại")).toBeInTheDocument();
  });

  it("shows monthly assessment rows and uses a neutral fallback before scoring", async () => {
    const user = userEvent.setup();
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
      assessments: [
        { id: "attempt-1", learnerName: "Vy", kind: "placement", title: "Đầu vào", status: "pending_review", submittedAt: "2026-11-05T08:00:00.000Z", totalScore: null },
        { id: "attempt-2", learnerName: "Lan", kind: "final", title: "Bài thi tháng", status: "pending_review", submittedAt: "2026-11-06T08:00:00.000Z", totalScore: null }
      ]
    };
    const client = {
      getContentReview: vi.fn().mockResolvedValue(review),
      getAssessmentFormPreviews: vi.fn().mockResolvedValue({ forms: [] })
    };
    render(<MemoryRouter initialEntries={["/op/tests"]}><OperatorRouteController session={operator} client={client as any} /></MemoryRouter>);

    const monthlyTab = screen.getByRole("tab", { name: "Bài thi tháng" });
    await user.click(monthlyTab);
    const table = await screen.findByRole("table", { name: "Lượt làm bài thi" });
    const row = within(table).getByRole("row", { name: /Lan.*Bài thi tháng/ });
    expect(monthlyTab).toHaveAttribute("aria-selected", "true");
    expect(within(row).getAllByText("—")).toHaveLength(3);
    expect(within(table).queryByText("Vy")).not.toBeInTheDocument();
    expect(client.getAssessmentFormPreviews).toHaveBeenCalledWith("final");
  });













});

