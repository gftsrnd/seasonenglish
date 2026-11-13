// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { MemoryRouter } from "react-router";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { SessionView } from "@e4s/contracts";
import { ToastProvider } from "../shared/design-system.js";
import { ApiError } from "../../api/runtime.js";
import { OperatorRouteController } from "./OperatorRouteController.js";

afterEach(cleanup);

const operator = { role: "operator", user: { id: "op", displayName: "Operator", email: null }, permissions: ["content:operate", "assessment:review", "prompt:manage"] } as SessionView;

const reading = { text: "The cost is high.", prompt: "Đọc và chọn: What is high?", options: ["The cost", "The room", "The plan", "The date"], answer: "The cost" };
const severeFinding = { severity: "severe", code: "MONTHLY_EXERCISE_TRANSLATION", component: "reading", dayNumber: 3, message: "Add questionTranslation and answerTranslation (short natural Vietnamese, A1-A2 only; a one-word answer such as isn't keeps answerTranslation equal to the answer) to every exercise question that has an answer: reading.questionTranslation must be a short Vietnamese translation of the question" };
/** 4175 A1 2026-12 day 13 ("Bài 11", 17/12): grammar practice question 4 answers "his" with options my/mine/me/I. */
const grammarFinding = { severity: "severe", code: "MONTHLY_DAILY_GRAMMAR_QUESTION", component: "grammar", dayNumber: 3, message: "Every grammar question needs a prompt, 4 distinct options, an answer copied from them, and an explanation" };
const grammarIntegrity = [{ component: "grammar", message: "Ngữ pháp: câu luyện 4 có đáp án không nằm trong các lựa chọn", item: 4 }];
const friendly = "Không duyệt vượt được: câu ngữ pháp 4 có đáp án không nằm trong các lựa chọn. Mở Sửa tay để sửa câu này.";
const day = (severe: unknown[], status: string, extra: Record<string, unknown> = {}) => ({
  lessonNumber: 3, lessonDate: "2026-12-03", kind: "new", status, scopeHash: "scope", locked: false, correctionCount: 0,
  content: { title: "Bài 3", parts: [{ code: "objective", content: { text: "Talk about costs." } }, { code: "reading", content: reading }] },
  quality: { severe, light: [] },
  ...extra
});
const overview = (lesson: ReturnType<typeof day>) => ({
  systemDate: "2026-11-12", monthWindow: { previous: "2026-11", current: "2026-11", next: "2026-12", writable: true },
  brief: { month: "2026-12", title: "Reports", brief: "Reports", context: "Office", communicationGoal: "Report", version: 1, status: "approved" },
  calendar: [{ date: "2026-12-03", kind: "new", lessonNumber: 3, newLessonNumber: 3 }],
  frameworks: [{ id: "framework-A1", cefr: "A1", version: 1, status: "approved", scopeHash: "scope", lessons: [lesson], quality: { severe: [], light: [] }, resources: { coreTerms: [], supportTerms: [], grammarTopics: [], sounds: [] }, publication: { ready: false, publishedOn: null } }]
});

function renderDay(lesson: ReturnType<typeof day>) {
  const client = {
    getContentMonth: vi.fn().mockResolvedValue(overview(lesson)), getContentMonthResourceCheckpoint: vi.fn().mockResolvedValue(undefined),
    approveContentMonthDay: vi.fn().mockResolvedValue(undefined), acknowledgeContentMonthQuality: vi.fn(), saveContentMonthDay: vi.fn(), uploadContentMedia: vi.fn()
  };
  render(<ToastProvider><MemoryRouter initialEntries={["/op/months/lesson/framework-A1/3?month=2026-12"]}><OperatorRouteController session={operator} client={client as any} /></MemoryRouter></ToastProvider>);
  return client;
}

describe("approve a monthly day despite severe findings (13/11)", () => {
  it("keeps the normal approval blocked and approves with the override only after the warning is confirmed", async () => {
    const user = userEvent.setup();
    const client = renderDay(day([severeFinding], "failed"));
    const anyway = await screen.findByRole("button", { name: "Vẫn duyệt (còn 1 lỗi nặng)" });
    expect(screen.queryByRole("button", { name: "Duyệt bài" })).not.toBeInTheDocument();
    expect(anyway).toHaveClass("btn-danger");

    await user.click(anyway);
    const dialog = await screen.findByRole("dialog", { name: "Vẫn duyệt bài học?" });
    const findings = within(dialog).getByTestId("monthly-approve-anyway-findings");
    expect(findings).toHaveTextContent("Bài còn 1 lỗi nặng");
    expect(findings).toHaveTextContent("Đọc");
    expect(findings).toHaveTextContent("Học viên sẽ thấy bài như hiện tại. Các lỗi trên chưa được sửa.");

    await user.click(within(dialog).getByRole("button", { name: "Quay lại sửa" }));
    expect(client.approveContentMonthDay).not.toHaveBeenCalled();

    await user.click(screen.getByRole("button", { name: "Vẫn duyệt (còn 1 lỗi nặng)" }));
    await user.click(within(await screen.findByRole("dialog", { name: "Vẫn duyệt bài học?" })).getByRole("button", { name: "Vẫn duyệt" }));
    await waitFor(() => expect(client.approveContentMonthDay).toHaveBeenCalledWith("framework-A1", 3, { acknowledgeSevereFindings: true }));
  });

  it("offers the same override from the manual editor", async () => {
    const user = userEvent.setup();
    const client = renderDay(day([severeFinding], "failed"));
    await user.click(await screen.findByRole("button", { name: "Sửa tay" }));
    const editor = await screen.findByRole("dialog", { name: /Soạn bài ngày 03\/12/u });
    await user.click(within(editor).getByRole("button", { name: "Vẫn duyệt (còn 1 lỗi nặng)" }));
    await user.click(within(await screen.findByRole("dialog", { name: "Vẫn duyệt bài học?" })).getByRole("button", { name: "Vẫn duyệt" }));
    await waitFor(() => expect(client.approveContentMonthDay).toHaveBeenCalledWith("framework-A1", 3, { acknowledgeSevereFindings: true }));
  });

  it("shows no override for a clean draft, which keeps the ordinary approval", async () => {
    const user = userEvent.setup();
    const client = renderDay(day([], "draft"));
    const approve = await screen.findByRole("button", { name: "Duyệt bài" });
    expect(screen.queryByRole("button", { name: /Vẫn duyệt/u })).toBeNull();
    await user.click(approve);
    await user.click(within(await screen.findByRole("dialog", { name: "Duyệt bài học" })).getByRole("button", { name: "Duyệt bài" }));
    await waitFor(() => expect(client.approveContentMonthDay).toHaveBeenCalledWith("framework-A1", 3));
  });

  it("replaces \"Vẫn duyệt\" with the explanation and \"Sửa tay\" when the draft has structural problems", async () => {
    const user = userEvent.setup();
    const client = renderDay(day([grammarFinding], "failed", { integrityIssues: grammarIntegrity }));
    const note = await screen.findByTestId("monthly-approve-blocked-note-3");
    expect(note).toHaveTextContent(friendly);
    expect(screen.queryByRole("button", { name: /Vẫn duyệt/u })).toBeNull();
    expect(screen.getByTestId("monthly-integrity-3")).toHaveTextContent(/Ngữ pháp · câu 4.*Có đáp án không nằm trong các lựa chọn./u);
    await user.click(within(note).getByRole("button", { name: "Sửa tay" }));
    const editor = await screen.findByRole("dialog", { name: /Soạn bài ngày 03\/12/u });
    expect(within(editor).queryByRole("button", { name: /Vẫn duyệt/u })).toBeNull();
    expect(within(editor).getByRole("note")).toHaveTextContent(friendly);
    expect(client.approveContentMonthDay).not.toHaveBeenCalled();
  });

  it("explains a refused override in Vietnamese, never with the raw code, and offers the editor", async () => {
    const user = userEvent.setup();
    const client = renderDay(day([severeFinding], "failed"));
    client.approveContentMonthDay.mockRejectedValue(new ApiError("MONTHLY_DAY_INTEGRITY_BLOCKED", "http", 409, { code: "MONTHLY_DAY_INTEGRITY_BLOCKED", message: "Không thể duyệt", issues: grammarIntegrity }));
    await user.click(await screen.findByRole("button", { name: "Vẫn duyệt (còn 1 lỗi nặng)" }));
    await user.click(within(await screen.findByRole("dialog", { name: "Vẫn duyệt bài học?" })).getByRole("button", { name: "Vẫn duyệt" }));
    const blocked = await screen.findByRole("dialog", { name: "Chưa duyệt vượt được" });
    expect(within(blocked).getByTestId("monthly-integrity-blocked")).toHaveTextContent(friendly);
    expect(document.body).not.toHaveTextContent("MONTHLY_DAY_INTEGRITY_BLOCKED");
    await user.click(within(blocked).getByRole("button", { name: "Sửa tay" }));
    expect(await screen.findByRole("dialog", { name: /Soạn bài ngày 03\/12/u })).toBeInTheDocument();
  });
});
