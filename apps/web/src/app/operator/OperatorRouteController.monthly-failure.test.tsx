// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { MemoryRouter } from "react-router";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { SessionView } from "@e4s/contracts";
import { ToastProvider } from "../shared/design-system.js";
import { OperatorRouteController } from "./OperatorRouteController.js";

afterEach(cleanup);

const operator = { role: "operator", user: { id: "op", displayName: "Operator", email: null }, permissions: ["content:operate", "assessment:review", "prompt:manage"] } as SessionView;

const wordUse = { prompt: "Choose the sentence that uses the word correctly.", options: ["My colleague sent me the client report.", "My colleague made me the client report.", "My colleague was colleagueing me with the client report.", "My colleague report me the client."], answer: "My colleague sent me the client report." };
const failedDay = {
  lessonNumber: 3, lessonDate: "2026-12-03", kind: "new", status: "pending", scopeHash: "scope", locked: false, correctionCount: 0,
  quality: { severe: [], light: [] },
  generationFailure: {
    failedAt: "2026-11-12T12:00:00.000Z", attempts: 3,
    report: { severe: [{ severity: "severe", code: "MONTHLY_INVENTED_WORD_FORM", component: "word_use", dayNumber: 3, message: "Every option must be a real, correctly formed English word or phrase; replace invented forms such as sended/maked/feedbacked with real forms (sent, made, gave feedback). Fix: word_use (colleagueing)" }], light: [] },
    candidate: { title: "Lesson 3: report, client", parts: [
      { code: "instruction", content: {} },
      { code: "listening", content: { script: "Hi.", prompt: "What?", options: ["a", "b"], answer: "a" } },
      { code: "word_use", content: wordUse }
    ] }
  }
};
const overview = {
  systemDate: "2026-11-12", monthWindow: { previous: "2026-11", current: "2026-11", next: "2026-12", writable: true },
  brief: { month: "2026-12", title: "Reports", brief: "Reports", context: "Office", communicationGoal: "Report", version: 1, status: "approved" },
  calendar: [{ date: "2026-12-03", kind: "new", lessonNumber: 3, newLessonNumber: 3 }],
  frameworks: (["A1", "A2"] as const).map((cefr) => ({ id: `framework-${cefr}`, cefr, version: 1, status: "approved", scopeHash: "scope", lessons: cefr === "A2" ? [failedDay] : [], quality: { severe: [], light: [] }, resources: { coreTerms: [], supportTerms: [], grammarTopics: [], sounds: [] }, publication: { ready: false, publishedOn: null } }))
};

describe("Operator monthly day with a failed AI candidate", () => {
  it("opens the manual editor prefilled with the candidate, at the day's own level", async () => {
    const user = userEvent.setup();
    const client = { getContentMonth: vi.fn().mockResolvedValue(overview), getContentMonthResourceCheckpoint: vi.fn().mockResolvedValue(undefined), saveContentMonthDay: vi.fn(), uploadContentMedia: vi.fn() };
    render(<ToastProvider><MemoryRouter initialEntries={["/op/months/lesson/framework-A2/3?month=2026-12"]}><OperatorRouteController session={operator} client={client as any} /></MemoryRouter></ToastProvider>);

    const failure = await screen.findByRole("region", { name: "Lần sinh AI chưa đạt" });
    expect(failure).toHaveTextContent("Câu 2 · Dùng từ: Lựa chọn C dùng từ không có thật “colleagueing”; thay bằng một từ tiếng Anh có thật.");
    expect(failure).toHaveTextContent("Bấm Sửa bản AI này, sửa các mục được báo, lưu rồi duyệt.");
    await user.click(screen.getByRole("button", { name: "Sửa bản AI này" }));

    // The preview route starts at the months page's default level (A1); the heading must name the day's framework level.
    expect(await screen.findByText("Soạn bài ngày 03/12 · A2")).toBeInTheDocument();
    expect(screen.queryByText("Soạn bài ngày 03/12 · A1")).not.toBeInTheDocument();
    expect(screen.getByLabelText("Tiêu đề bài")).toHaveValue("Lesson 3: report, client");
    expect(screen.getByDisplayValue("My colleague was colleagueing me with the client report.")).toBeInTheDocument();
  });
});
