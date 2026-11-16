// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { StrictMode } from "react";
import { MemoryRouter } from "react-router";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { SessionView } from "@e4s/contracts";
import { ApiError } from "../../api/runtime.js";
import { LearnerLesson } from "../learner/Learning.js";
import { OperatorRouteController } from "../operator/OperatorRouteController.js";
import { ToastProvider, useToast } from "./design-system.js";
import { errorFeedback, errorMessage, GENERIC_ERROR_MESSAGE } from "./error-message.js";
import { ModalProvider } from "./ModalProvider.js";

afterEach(cleanup);

const toasts = () => Array.from(document.querySelectorAll(".ds-toast-viewport .ds-toast"));
const operator = { role: "operator", user: { id: "op", displayName: "Operator", email: null }, permissions: ["content:operate", "assessment:review", "prompt:manage"] } as SessionView;
const http500 = () => new ApiError("HTTP_500", "http", 500);

function renderOperator(path: string, client: Record<string, unknown>) {
  render(<StrictMode><ToastProvider><MemoryRouter initialEntries={[path]}><ModalProvider><OperatorRouteController session={operator} client={client as any} /></ModalProvider></MemoryRouter></ToastProvider></StrictMode>);
}

describe("errorFeedback: never a raw code", () => {
  it("HTTP_500 shows the generic Vietnamese text, with the code kept for the tooltip only", () => {
    expect(errorFeedback(http500())).toEqual({ message: GENERIC_ERROR_MESSAGE, code: "HTTP_500" });
    expect(errorMessage(new Error("HTTP_500"))).toBe("Có lỗi xảy ra, vui lòng thử lại.");
  });

  it("uses the server's Vietnamese message when it is user-safe, and ignores a technical one", () => {
    expect(errorMessage(new ApiError("LEARNER_LOCKED", "http", 409, { code: "LEARNER_LOCKED", message: "Tài khoản đang bị khoá." }))).toBe("Tài khoản đang bị khoá.");
    expect(errorMessage(new ApiError("SOME_CODE", "http", 400, { code: "SOME_CODE", message: "body/name must be string" }))).toBe(GENERIC_ERROR_MESSAGE);
    expect(errorMessage(new ApiError("INTERNAL_ERROR", "http", 500, { code: "INTERNAL_ERROR", message: GENERIC_ERROR_MESSAGE }))).toBe(GENERIC_ERROR_MESSAGE);
  });

  it("maps known codes, prefers the screen's own table, and accepts a screen fallback", () => {
    expect(errorMessage(new ApiError("NETWORK_UNAVAILABLE", "network"))).toMatch(/Không thể kết nối/u);
    expect(errorMessage(new ApiError("HTTP_429", "http", 429))).toMatch(/quá nhiều yêu cầu/u);
    expect(errorMessage(new Error("MY_CODE"), { MY_CODE: "Lỗi riêng của màn hình." })).toBe("Lỗi riêng của màn hình.");
    expect(errorMessage(new Error("UNKNOWN_CODE"), undefined, "Không công bố được tháng.")).toBe("Không công bố được tháng.");
    expect(errorMessage(new Error("Không gửi được yêu cầu."))).toBe("Không gửi được yêu cầu.");
    expect(errorMessage(new Error("Failed to fetch"))).toBe(GENERIC_ERROR_MESSAGE);
  });
});

describe("ToastProvider: one message is one toast", () => {
  function Show({ inputs }: { inputs: Array<Parameters<ReturnType<typeof useToast>["show"]>[0]> }) {
    const toast = useToast();
    return <button type="button" onClick={() => inputs.forEach((input) => toast.show(input))}>show</button>;
  }

  it("de-dupes on tone + normalised text, including ReactNode messages", async () => {
    render(<ToastProvider><Show inputs={[
      { message: <span>Đã <b>lưu</b>.</span>, tone: "ok" },
      { message: "  Đã   lưu . ", tone: "ok" },
      { message: "Đã lưu.", tone: "ok" },
      { message: "Đã lưu.", tone: "danger" }
    ]} /></ToastProvider>);
    await userEvent.setup().click(screen.getByRole("button", { name: "show" }));
    expect(toasts()).toHaveLength(3);
    expect(toasts().filter((item) => item.classList.contains("ds-toast--ok"))).toHaveLength(2);
  });

  it("de-dupes ReactNode messages that share an explicit key", async () => {
    render(<ToastProvider><Show inputs={[
      { message: <span>Bài 3</span>, key: "approve:3", tone: "ok" },
      { message: <span>Bài 3 (lần 2)</span>, key: "approve:3", tone: "ok" }
    ]} /></ToastProvider>);
    await userEvent.setup().click(screen.getByRole("button", { name: "show" }));
    expect(toasts()).toHaveLength(1);
  });

  it("renders the learner variant in the learner pill (#toast) and the detail only as a tooltip", async () => {
    render(<ToastProvider><Show inputs={[{ message: "Đã gửi khiếu nại.", tone: "ok", variant: "learner" }, { message: GENERIC_ERROR_MESSAGE, tone: "danger", detail: "Mã lỗi: HTTP_500" }]} /></ToastProvider>);
    await userEvent.setup().click(screen.getByRole("button", { name: "show" }));
    expect(document.querySelector("#toast .toast.ok")).toHaveTextContent("Đã gửi khiếu nại.");
    const error = toasts()[0]!;
    expect(error).toHaveTextContent(GENERIC_ERROR_MESSAGE);
    expect(error).not.toHaveTextContent("HTTP_500");
    expect(error).toHaveAttribute("title", "Mã lỗi: HTTP_500");
  });
});

describe("operator Dashboard: one toast per action", () => {
  const overview = {
    pendingAssessments: [{ attemptId: "a1", learnerId: "u1", learnerName: "Lan", kind: "placement", title: "Đầu vào", submittedAt: "2026-10-14", sectionScores: { listening: 70 }, suggestedLevel: "A2" }],
    pendingLevelUp: [], approvedLearners: [], unassessedLearners: [],
    levelSignals: { windowDays: 14, ready: [], weak: [] }, topicReports: []
  };
  const rescore = async (beforeConfirm?: () => void) => {
    const user = userEvent.setup();
    await user.click(await screen.findByRole("button", { name: "Chấm lại bằng AI" }));
    beforeConfirm?.();
    await user.click(within(screen.getByRole("dialog", { name: "Chấm lại bằng AI?" })).getByRole("button", { name: "Chấm lại" }));
  };

  it("a successful action shows one success toast, even when the refresh after it fails", async () => {
    let refreshFails = false;
    let failedRefreshes = 0;
    const getAssessmentReviewOverview = vi.fn(async () => { if (refreshFails) { failedRefreshes += 1; throw http500(); } return overview; });
    const rescoreAssessment = vi.fn().mockResolvedValue({});
    renderOperator("/op", { getAssessmentReviewOverview, rescoreAssessment });
    await rescore(() => { refreshFails = true; });
    await waitFor(() => expect(rescoreAssessment).toHaveBeenCalled());
    await waitFor(() => expect(toasts()).toHaveLength(1));
    // The refresh after the action ran and failed.
    await waitFor(() => expect(failedRefreshes).toBeGreaterThanOrEqual(1));
    expect(toasts()).toHaveLength(1);
    expect(toasts()[0]).toHaveTextContent("Đã chấm lại bài bằng AI.");
    expect(toasts()[0]).toHaveClass("ds-toast--ok");
    // The page stays; the failed refresh is retried quietly instead of turning the success into an error.
    expect(screen.getByRole("heading", { name: "Duyệt trình độ" })).toBeInTheDocument();
    expect(screen.queryByText(/Không tải được duyệt trình độ/u)).toBeNull();
  });

  it("a failed action (HTTP 500) shows one error toast with the generic Vietnamese text", async () => {
    renderOperator("/op", { getAssessmentReviewOverview: vi.fn().mockResolvedValue(overview), rescoreAssessment: vi.fn().mockRejectedValue(http500()) });
    await rescore();
    await waitFor(() => expect(toasts()).toHaveLength(1));
    expect(toasts()[0]).toHaveTextContent(GENERIC_ERROR_MESSAGE);
    expect(toasts()[0]).toHaveClass("ds-toast--danger");
    expect(document.body).not.toHaveTextContent("HTTP_500");
    expect(screen.getAllByRole("alert")).toHaveLength(1);
  });
});

describe("operator LevelForms: one toast per action", () => {
  const review = { tabs: [], submissions: [], coachSamples: [], microLessons: [], appeals: [], lessonAttempts: [], assessments: [], weeklyPractices: [] };
  const capabilities = { ai: true, aiConfigured: true };
  const generateFirst = async () => {
    const buttons = await screen.findAllByRole("button", { name: "Sinh đề bằng AI" });
    await userEvent.setup().click(buttons[0]!);
  };

  it("a successful generation shows one success toast", async () => {
    const generateAssessmentLevelForm = vi.fn().mockResolvedValue({});
    renderOperator("/op/levelforms", { getAssessmentLevelForms: vi.fn().mockResolvedValue([{ targetLevel: "B1", publishedForm: null, draftForm: null }]), getContentReview: vi.fn().mockResolvedValue(review), getSystemCapabilities: vi.fn().mockResolvedValue(capabilities), generateAssessmentLevelForm });
    await generateFirst();
    await waitFor(() => expect(generateAssessmentLevelForm).toHaveBeenCalled());
    await waitFor(() => expect(toasts()).toHaveLength(1));
    expect(toasts()[0]).toHaveTextContent(/Đã sinh bản nháp đề thi lên mức/u);
  });

  it("a failed generation shows one error toast and keeps the page (no page-wide error)", async () => {
    renderOperator("/op/levelforms", { getAssessmentLevelForms: vi.fn().mockResolvedValue([{ targetLevel: "B1", publishedForm: null, draftForm: null }]), getContentReview: vi.fn().mockResolvedValue(review), getSystemCapabilities: vi.fn().mockResolvedValue(capabilities), generateAssessmentLevelForm: vi.fn().mockRejectedValue(http500()) });
    await generateFirst();
    await waitFor(() => expect(toasts()).toHaveLength(1));
    expect(toasts()[0]).toHaveTextContent(GENERIC_ERROR_MESSAGE);
    expect(screen.queryByText(/Không tải được đề thi lên mức/u)).toBeNull();
    expect(screen.getAllByRole("button", { name: "Sinh đề bằng AI" }).length).toBeGreaterThan(0);
  });
});

describe("learner lesson submit: one feedback", () => {
  const lesson = () => ({
    id: "monthly-A2", kind: "new", exerciseVersionId: "v1", title: "Reports", dayNumber: 1, weekNumber: 0, weekTopic: "Reports", durationMinutes: 10, cefr: "A2",
    content: { parts: [
      { code: "objective", title: "Mục tiêu", content: { text: "Report progress." } },
      { code: "listening", title: "Nghe", content: { script: "The report is ready.", prompt: "Nghe và chọn: Is it ready?", options: ["Yes", "No", "Maybe", "Later"], answer: "Yes" } }
    ] },
    progress: { status: "in_progress", completedPartCodes: ["objective"], evidence: {} }
  }) as any;
  const submit = async (submitLessonPartAttempt: ReturnType<typeof vi.fn>) => {
    render(<StrictMode><ToastProvider><LearnerLesson view={{ lesson: lesson(), lock: null }} actions={{ navigate: vi.fn(), speak: vi.fn(), submitLessonPartAttempt } as any} /></ToastProvider></StrictMode>);
    fireEvent.click(screen.getByRole("tab", { name: /2\. bài tập/i }));
    await userEvent.setup().click(screen.getByRole("radio", { name: /Yes/ }));
    fireEvent.click(screen.getByRole("button", { name: "Nộp bài" }));
  };
  const anyToast = () => document.querySelectorAll(".ds-toast, #toast .toast, .assessment-toast");

  it("a successful submit shows its result once and no toast", async () => {
    const submitLessonPartAttempt = vi.fn().mockResolvedValue({
      lessonId: "monthly-A2", partCode: "listening",
      evidence: { attempts: 1, status: "correct", answer: "Yes", feedback: "Đúng rồi." },
      progress: { status: "in_progress", completedPartCodes: ["objective", "listening"], evidence: { listening: { attempts: 1, status: "correct", answer: "Yes", feedback: "Đúng rồi." } } }
    });
    await submit(submitLessonPartAttempt);
    expect(await screen.findAllByText("Đúng rồi.")).toHaveLength(1);
    expect(anyToast()).toHaveLength(0);
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("a failed submit (HTTP 500) shows one inline alert, no toast, and never the code", async () => {
    await submit(vi.fn().mockRejectedValue(http500()));
    await waitFor(() => expect(screen.getAllByRole("alert")).toHaveLength(1));
    expect(anyToast()).toHaveLength(0);
    expect(document.body).not.toHaveTextContent("HTTP_500");
  });
});
