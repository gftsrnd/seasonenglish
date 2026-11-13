// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { StrictMode } from "react";
import { MemoryRouter } from "react-router";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { SessionView } from "@e4s/contracts";
import { ToastProvider, useToast } from "../shared/design-system.js";
import { ModalProvider } from "../shared/ModalProvider.js";
import { OperatorRouteController } from "./OperatorRouteController.js";

afterEach(cleanup);

const operator = { role: "operator", user: { id: "op", displayName: "Operator", email: null }, permissions: ["content:operate", "assessment:review", "prompt:manage"] } as SessionView;
const reading = { text: "The cost is high.", prompt: "Đọc và chọn: What is high?", options: ["The cost", "The room", "The plan", "The date"], answer: "The cost" };
const lesson = {
  lessonNumber: 3, lessonDate: "2026-11-03", kind: "new", status: "draft", scopeHash: "scope", locked: false, correctionCount: 0,
  content: { title: "Bài 3", parts: [{ code: "objective", content: { text: "Talk about costs." } }, { code: "reading", content: reading }] },
  quality: { severe: [], light: [] }
};
const overview = (frameworkStatus: "draft" | "approved") => ({
  systemDate: "2026-11-06", monthWindow: { previous: "2026-10", current: "2026-11", next: "2026-12", writable: true },
  brief: { month: "2026-11", title: "Reports", brief: "Reports", context: "Office", communicationGoal: "Report", version: 1, status: "approved" },
  calendar: [{ date: "2026-11-03", kind: "new", lessonNumber: 3, newLessonNumber: 3 }],
  frameworks: [{ id: "framework-A1", cefr: "A1", version: 1, status: frameworkStatus, scopeHash: "scope", lessons: [lesson], quality: { severe: [], light: [] }, resources: { coreTerms: [], supportTerms: [], grammarTopics: [], sounds: [] }, publication: { ready: true, publishedOn: "2026-11-13" } }]
});

/** The app's real provider stack (main.tsx + App.tsx): StrictMode, one ToastProvider, one ModalProvider around the routes. */
function renderRoute(path: string, frameworkStatus: "draft" | "approved" = "approved") {
  const client = {
    getContentMonth: vi.fn().mockResolvedValue(overview(frameworkStatus)), getContentMonthResourceCheckpoint: vi.fn().mockResolvedValue(undefined),
    approveContentMonthDay: vi.fn().mockResolvedValue(undefined), acknowledgeContentMonthQuality: vi.fn().mockResolvedValue(undefined),
    saveContentMonthDay: vi.fn().mockResolvedValue({ severe: [], light: [] }), uploadContentMedia: vi.fn(),
    approveContentMonthFramework: vi.fn().mockResolvedValue({}), saveContentMonthBrief: vi.fn().mockResolvedValue({}), approveContentMonthBrief: vi.fn().mockResolvedValue({}),
    previewContentMonthRepublication: vi.fn().mockResolvedValue({ publishedOn: "2026-11-13", republishOn: "2026-11-06", needed: true, ready: true, missingDays: [], affectedLearners: 12, shiftedLearners: 0 }),
    republishContentMonth: vi.fn().mockResolvedValue({})
  };
  render(<StrictMode><ToastProvider><MemoryRouter initialEntries={[path]}><ModalProvider><OperatorRouteController session={operator} client={client as any} /></ModalProvider></MemoryRouter></ToastProvider></StrictMode>);
  return client;
}
const toasts = () => Array.from(document.querySelectorAll(".ds-toast-viewport .ds-toast"));
const confirmDialog = async (name: string | RegExp, button: string) => {
  const user = userEvent.setup();
  await user.click(within(await screen.findByRole("dialog", { name })).getByRole("button", { name: button }));
};

describe("a confirmed action shows exactly one toast", () => {
  it("approving a monthly day", async () => {
    const user = userEvent.setup();
    const client = renderRoute("/op/months/lesson/framework-A1/3?month=2026-11");
    await user.click(await screen.findByRole("button", { name: "Duyệt bài" }));
    await confirmDialog("Duyệt bài học", "Duyệt bài");
    await waitFor(() => expect(client.approveContentMonthDay).toHaveBeenCalled());
    await waitFor(() => expect(toasts()).toHaveLength(1));
    expect(toasts()[0]).toHaveTextContent("Đã duyệt bài 3.");
  });

  it("republishing a month (Công bố lại)", async () => {
    const user = userEvent.setup();
    const client = renderRoute("/op/months?month=2026-11");
    await user.click(await screen.findByRole("button", { name: "Công bố lại" }));
    await confirmDialog(/Công bố lại tháng/u, "Công bố lại");
    await waitFor(() => expect(client.republishContentMonth).toHaveBeenCalled());
    await waitFor(() => expect(toasts()).toHaveLength(1));
    expect(toasts()[0]).toHaveTextContent("Đã công bố lại theo ngày hệ thống.");
  });

  it("approving the month resources", async () => {
    const user = userEvent.setup();
    const client = renderRoute("/op/months?month=2026-11", "draft");
    await user.click(await screen.findByRole("button", { name: "Duyệt tài nguyên" }));
    await confirmDialog("Duyệt tài nguyên tháng?", "Duyệt tài nguyên");
    await waitFor(() => expect(client.approveContentMonthFramework).toHaveBeenCalled());
    await waitFor(() => expect(toasts()).toHaveLength(1));
    expect(toasts()[0]).toHaveTextContent("Đã duyệt tài nguyên tháng.");
  });

  it("a failed confirmed action shows one error toast and no success toast", async () => {
    const user = userEvent.setup();
    const client = renderRoute("/op/months?month=2026-11", "draft");
    client.approveContentMonthFramework.mockRejectedValue(new Error("MONTHLY_FRAMEWORK_STALE"));
    await user.click(await screen.findByRole("button", { name: "Duyệt tài nguyên" }));
    await confirmDialog("Duyệt tài nguyên tháng?", "Duyệt tài nguyên");
    await waitFor(() => expect(toasts()).toHaveLength(1));
    expect(toasts()[0]).toHaveTextContent("Không duyệt được tài nguyên tháng. Hãy thử lại.");
    expect(document.body).not.toHaveTextContent("Đã duyệt tài nguyên tháng.");
  });

  it("saving a day in Sửa tay", async () => {
    const user = userEvent.setup();
    const client = renderRoute("/op/months/lesson/framework-A1/3?month=2026-11");
    await user.click(await screen.findByRole("button", { name: "Sửa tay" }));
    const editor = await screen.findByRole("dialog", { name: /Soạn bài ngày 03\/11/u });
    const save = () => user.click(within(editor).getByRole("button", { name: /Kiểm tra & lưu|Lưu dù còn thiếu/u }));
    await save();
    // An incomplete lesson first lists what is missing; the second press saves anyway.
    const confirmSave = /^(Lưu tạm bài học|Kiểm tra và lưu bài)\?$/u;
    if (!screen.queryByRole("dialog", { name: confirmSave })) await save();
    const dialog = await screen.findByRole("dialog", { name: confirmSave });
    await user.click(within(dialog).getByRole("button", { name: /^(Lưu tạm|Kiểm tra & lưu)$/u }));
    await waitFor(() => expect(client.saveContentMonthDay).toHaveBeenCalled());
    await waitFor(() => expect(toasts()).toHaveLength(1));
    expect(toasts()[0]).toHaveTextContent("Đã lưu bản nháp bài 3.");
  });
});

describe("ToastProvider safety net", () => {
  function Twice({ message }: { message: string }) {
    const toast = useToast();
    return <button type="button" onClick={() => { toast.show({ message, tone: "ok" }); toast.show({ message, tone: "ok" }); toast.show({ message: "Khác", tone: "ok" }); }}>show</button>;
  }

  it("does not stack the same text toast shown twice in a row", async () => {
    const user = userEvent.setup();
    render(<ToastProvider><Twice message="Đã lưu." /></ToastProvider>);
    await user.click(screen.getByRole("button", { name: "show" }));
    expect(toasts().map((toast) => toast.querySelector(".ds-toast__message")?.textContent)).toEqual(["Đã lưu.", "Khác"]);
  });
});
