// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { emptyLesson, LessonFormEditor } from "./LessonFormEditor.js";

afterEach(cleanup);

describe("operator granular lesson editor", () => {
  it("matches the prototype field groups and requires a deliberate force-save for incomplete lessons", async () => {
    const user = userEvent.setup();
    const onSave = vi.fn();
    render(<LessonFormEditor weekNumber={2} cefr="A2" initial={emptyLesson(1)} onSave={onSave} onCancel={() => undefined} />);
    const editorDialog = screen.getByRole("dialog", { name: "Soạn bài T2 · Tuần 2 · A2" });
    expect(editorDialog).toHaveClass("dialog");
    expect(editorDialog.parentElement).toHaveClass("modal-backdrop");
    ["Chung", "Ngữ pháp", "Từ vựng (3 từ)", "Phát âm", "Nghe", "Đọc", "Viết", "Nói"].forEach((name) => {
      expect(screen.getByText(name, { selector: "legend" })).toBeInTheDocument();
    });
    expect(screen.getByLabelText("Nghe – Lựa chọn 4")).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Biểu mẫu" })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByRole("tab", { name: "JSON nâng cao" })).toHaveAttribute("aria-selected", "false");

    await user.clear(screen.getByLabelText("Tiêu đề bài"));
    await user.type(screen.getByLabelText("Tiêu đề bài"), "Emails and rescheduling");
    await user.click(screen.getByRole("button", { name: "Kiểm tra & lưu" }));
    expect(onSave).not.toHaveBeenCalled();
    expect(screen.getByRole("alert")).toHaveTextContent("mục cần bổ sung");
    await user.click(screen.getByRole("button", { name: "Lưu dù còn thiếu" }));
    expect(onSave).toHaveBeenCalledWith(expect.objectContaining({ dayNumber: 1, title: "Emails and rescheduling", parts: expect.any(Array) }));
  });

  it("keeps form and JSON tabs keyboard-safe while pending and supports modal close controls", async () => {
    const user = userEvent.setup();
    const onSave = vi.fn();
    const onCancel = vi.fn();
    render(<LessonFormEditor weekNumber={2} cefr="A2" initial={emptyLesson(1)} onSave={onSave} onCancel={onCancel} />);

    const dialog = screen.getByRole("dialog", { name: "Soạn bài T2 · Tuần 2 · A2" });
    const close = screen.getByRole("button", { name: "Đóng" });
    expect(document.activeElement).toBe(close);

    await user.click(screen.getByRole("tab", { name: "JSON nâng cao" }));
    expect(screen.getByRole("textbox", { name: "Nội dung JSON bài học" })).toBeInTheDocument();
    await user.click(screen.getByRole("tab", { name: "Biểu mẫu" }));
    expect(screen.getByLabelText("Tiêu đề bài")).toBeInTheDocument();

    const save = screen.getByRole("button", { name: "Kiểm tra & lưu" });
    save.focus();
    fireEvent.keyDown(save, { key: "Tab" });
    expect(document.activeElement).toBe(close);
    fireEvent.keyDown(dialog, { key: "Escape" });
    fireEvent.click(dialog.parentElement as HTMLElement);
    expect(onCancel).toHaveBeenCalledTimes(2);

    cleanup();
    render(<LessonFormEditor weekNumber={2} cefr="A2" initial={emptyLesson(1)} onSave={onSave} onCancel={onCancel} busy />);
    const pendingDialog = screen.getByRole("dialog", { name: "Soạn bài T2 · Tuần 2 · A2" });
    expect(pendingDialog).toHaveAttribute("aria-busy", "true");
    expect(screen.getByLabelText("Tiêu đề bài")).toBeDisabled();
    expect(screen.getByRole("button", { name: /Đang lưu/ })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Đóng" })).toBeDisabled();
    expect(screen.getByRole("status")).toHaveTextContent("Đang lưu");
  });
});
