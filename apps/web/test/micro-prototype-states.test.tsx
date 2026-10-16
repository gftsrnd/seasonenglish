// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { MicroLessonView } from "@e4s/contracts";
import { PrototypeMicro } from "../src/prototype/learner/Learning.js";
import type { LearnerPrototypeCallbacks } from "../src/prototype/learner/contracts.js";

afterEach(cleanup);
beforeEach(() => vi.clearAllMocks());

const actions = {
  navigate: vi.fn(),
  speak: vi.fn(),
  submitMicroAnswer: vi.fn(),
  completeMicroLesson: vi.fn(),
  regenerateMicroLesson: vi.fn()
} as unknown as LearnerPrototypeCallbacks;

const base: MicroLessonView = {
  id: "micro-1",
  topic: "Could we move the meeting?",
  cefr: "B1",
  durationMinutes: 5,
  theory: "Use Could we… to make a polite suggestion.",
  vocabulary: ["reschedule"],
  practice: { prompt: "Choose the polite suggestion.", type: "mcq", options: ["Could we move it?", "Move it now."] }
};

describe("prototype micro lesson terminal state", () => {
  it("shows a pending state and prevents duplicate answer submissions", async () => {
    let resolveSubmit!: () => void;
    const submit = vi.fn(() => new Promise<void>((resolve) => { resolveSubmit = resolve; }));
    const user = (await import("@testing-library/user-event")).userEvent.setup();
    render(<PrototypeMicro view={base} actions={{ ...actions, submitMicroAnswer: submit } as unknown as LearnerPrototypeCallbacks} />);

    await user.click(screen.getByRole("radio", { name: "Could we move it?" }));
    await user.click(screen.getByRole("button", { name: "Kiểm tra" }));

    expect(screen.getByRole("button", { name: "Đang kiểm tra…" })).toBeDisabled();
    expect(submit).toHaveBeenCalledOnce();
    resolveSubmit();
  });

  it("keeps the micro answer action recoverable after a server error", async () => {
    const user = (await import("@testing-library/user-event")).userEvent.setup();
    const submit = vi.fn().mockRejectedValueOnce(new Error("SUBMIT_FAILED"));
    render(<PrototypeMicro view={base} actions={{ ...actions, submitMicroAnswer: submit } as unknown as LearnerPrototypeCallbacks} />);

    await user.click(screen.getByRole("radio", { name: "Could we move it?" }));
    await user.click(screen.getByRole("button", { name: "Kiểm tra" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Chưa kiểm tra được câu trả lời");
    expect(screen.getByRole("button", { name: "Kiểm tra" })).toBeEnabled();
  });

  it("shows a pending state while completing the micro lesson", async () => {
    let resolveComplete!: () => void;
    const complete = vi.fn(() => new Promise<void>((resolve) => { resolveComplete = resolve; }));
    const user = (await import("@testing-library/user-event")).userEvent.setup();
    render(<PrototypeMicro view={{ ...base, feedback: { status: "ready", message: "Đúng rồi." } }} actions={{ ...actions, completeMicroLesson: complete } as unknown as LearnerPrototypeCallbacks} />);

    await user.click(screen.getByRole("button", { name: "Hoàn thành" }));

    expect(screen.getByRole("button", { name: "Đang lưu…" })).toBeDisabled();
    expect(complete).toHaveBeenCalledOnce();
    resolveComplete();
  });

  it("keeps completion locked until feedback is ready", () => {
    render(<PrototypeMicro view={base} actions={actions} />);

    expect(screen.getByRole("button", { name: "Hoàn thành" })).toBeDisabled();
    expect(actions.completeMicroLesson).not.toHaveBeenCalled();
  });

  it("refreshes the answer affordance when the server returns a saved micro answer", () => {
    const { rerender } = render(<PrototypeMicro view={base} actions={actions} />);

    rerender(<PrototypeMicro view={{ ...base, attempt: { answer: "Could we move it?", attempts: 1, correct: true } }} actions={actions} />);

    expect(screen.getByRole("radio", { name: "Could we move it?" })).toBeChecked();
  });

  it("shows a pending state while regenerating the micro lesson", async () => {
    let resolveRegenerate!: () => void;
    const regenerate = vi.fn(() => new Promise<void>((resolve) => { resolveRegenerate = resolve; }));
    const user = (await import("@testing-library/user-event")).userEvent.setup();
    render(<PrototypeMicro view={{ ...base, regenerateAvailable: true }} actions={{ ...actions, regenerateMicroLesson: regenerate } as unknown as LearnerPrototypeCallbacks} />);

    await user.click(screen.getByRole("button", { name: "Tạo lại bài" }));

    expect(screen.getByRole("button", { name: "Đang tạo bài…" })).toBeDisabled();
    expect(regenerate).toHaveBeenCalledOnce();
    resolveRegenerate();
  });

  it("does not reopen a completed micro lesson", () => {
    render(<PrototypeMicro view={{ ...base, completedAt: "2026-10-15T10:00:00.000Z", attempt: { answer: "Could we move it?", attempts: 1, correct: true, score: 10 }, feedback: { status: "ready", message: "Đúng rồi." } }} actions={actions} />);

    expect(screen.getByText(/xong rồi/i)).toBeInTheDocument();
    expect(screen.getByText(/đã hoàn thành/i)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Kiểm tra" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Hoàn thành" })).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: /luyện thêm với season/i })).toHaveAttribute("href", "/coach");
  });

  it("offers a different lesson from the completed state when the server enables regeneration", () => {
    render(<PrototypeMicro view={{ ...base, completedAt: "2026-10-15T10:00:00.000Z", regenerateAvailable: true }} actions={actions} />);

    fireEvent.click(screen.getByRole("button", { name: "Tạo bài khác" }));

    expect(actions.regenerateMicroLesson).toHaveBeenCalledTimes(1);
  });

  it("keeps a regeneration error visible after a completed lesson", () => {
    render(<PrototypeMicro view={{ ...base, completedAt: "2026-10-15T10:00:00.000Z", regenerateAvailable: true, regenerateError: "Chưa tạo được bài mới." }} actions={actions} />);

    expect(screen.getByRole("alert")).toHaveTextContent("Chưa tạo được bài mới.");
  });

  it("keeps the regenerate action visible but disabled when the server says AI is unavailable", () => {
    render(<PrototypeMicro view={{ ...base, regenerateAvailable: false }} actions={actions} />);

    expect(screen.getByRole("button", { name: "Tạo lại bài" })).toBeDisabled();
  });

  it("starts a server-backed regeneration when the server enables it", () => {
    render(<PrototypeMicro view={{ ...base, regenerateAvailable: true }} actions={actions} />);

    fireEvent.click(screen.getByRole("button", { name: "Tạo lại bài" }));

    expect(actions.regenerateMicroLesson).toHaveBeenCalledTimes(1);
  });
});
