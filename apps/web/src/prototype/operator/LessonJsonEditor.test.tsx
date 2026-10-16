// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ContentLessonDraftInput, LessonPartCode } from "@e4s/contracts";
import { LessonJsonEditor } from "./LessonJsonEditor.js";
import { Badge, Banner, Button, LevelChip } from "./primitives.js";

afterEach(cleanup);

const partCodes: LessonPartCode[] = [
  "objective", "instruction", "vocabulary", "grammar", "pronunciation",
  "listening", "reading", "writing", "speaking"
];

function lesson(): ContentLessonDraftInput {
  return {
    dayNumber: 1,
    title: "Opening a meeting",
    durationMinutes: 10,
    parts: partCodes.map(code => ({ code, title: code, content: { text: code } }))
  };
}

describe("LessonJsonEditor", () => {
  it("keeps the prototype wide JSON modal keyboard-safe and saves the complete lesson payload", async () => {
    const user = userEvent.setup();
    const onSave = vi.fn();
    const onCancel = vi.fn();
    render(<LessonJsonEditor lesson={lesson()} onSave={onSave} onCancel={onCancel} />);

    const dialog = screen.getByRole("dialog", { name: "JSON bài học" });
    expect(dialog).toHaveClass("dialog", "wide");
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "Đóng" }));
    expect(screen.getByRole("textbox", { name: "Nội dung JSON bài học" })).toHaveValue(JSON.stringify(lesson(), null, 2));

    await user.click(screen.getByRole("button", { name: "Lưu JSON" }));
    expect(onSave).toHaveBeenCalledWith(lesson());

    fireEvent.keyDown(dialog, { key: "Escape" });
    fireEvent.click(dialog.parentElement as HTMLElement);
    expect(onCancel).toHaveBeenCalledTimes(2);
  });

  it("blocks malformed JSON and contract-invalid parts with visible errors", async () => {
    const user = userEvent.setup();
    const onSave = vi.fn();
    render(<LessonJsonEditor lesson={lesson()} onSave={onSave} onCancel={vi.fn()} />);
    const editor = screen.getByRole("textbox", { name: "Nội dung JSON bài học" });

    fireEvent.change(editor, { target: { value: JSON.stringify({ dayNumber: 0, title: "", durationMinutes: 0, parts: [{ code: "objective", title: "", content: [] }] }) } });
    await user.click(screen.getByRole("button", { name: "Lưu JSON" }));

    expect(screen.getByRole("alert")).toHaveTextContent(/durationMinutes|thời lượng/i);
    expect(screen.getByRole("alert")).toHaveTextContent(/phần bắt buộc|parts/i);
    expect(onSave).not.toHaveBeenCalled();
  });

  it("keeps the modal visible but locks edits for Manager and reports loading", () => {
    render(<LessonJsonEditor lesson={lesson()} onSave={vi.fn()} onCancel={vi.fn()} readOnly busy />);

    expect(screen.getByRole("textbox", { name: "Nội dung JSON bài học" })).toHaveAttribute("readonly");
    expect(screen.getByRole("button", { name: /Đang lưu/ })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Huỷ" })).toBeDisabled();
    expect(screen.getByRole("status")).toHaveTextContent("Đang lưu");
  });

  it("keeps prototype primitive states accessible", () => {
    render(<><Button busy primary>Lưu</Button><Banner tone="danger">Không lưu được</Banner><Badge tone="warn">Bản nháp</Badge><LevelChip level="A2" /></>);

    const button = screen.getByRole("button", { name: /Lưu/ });
    expect(button).toBeDisabled();
    expect(button).toHaveAttribute("aria-busy", "true");
    expect(button.querySelector(".spinner")).not.toBeNull();
    expect(screen.getByRole("alert")).toHaveTextContent("Không lưu được");
    expect(screen.getByText("A2")).toHaveClass("badge", "lvl", "lvl-A2");
  });
});
