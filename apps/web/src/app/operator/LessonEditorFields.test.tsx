// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ModalProvider } from "../shared/ModalProvider.js";
import { Field, LineField, OptionFields } from "./LessonEditorFields.js";
import { emptyLesson, LessonFormEditor } from "./LessonFormEditor.js";

afterEach(() => { cleanup(); vi.restoreAllMocks(); });

function Controlled({ initial = "" }: { initial?: string }) {
  const [value, setValue] = useState(initial);
  return <Field label="Câu hỏi"><LineField aria-label="Câu hỏi" value={value} onChange={event => setValue(event.target.value)} /></Field>;
}

describe("LessonEditorFields LineField", () => {
  it("is a one-row textarea that grows to fit its text", () => {
    vi.spyOn(HTMLTextAreaElement.prototype, "scrollHeight", "get").mockReturnValue(62);
    render(<Controlled initial={"Yes, they will publish the report next week because the client asked for it."} />);
    const field = screen.getByLabelText("Câu hỏi");
    expect(field.tagName).toBe("TEXTAREA");
    expect(field).toHaveAttribute("rows", "1");
    expect(field).toHaveClass("line-field");
    expect(field.style.height).toMatch(/^\d+(\.\d+)?px$/);
    expect(parseFloat(field.style.height)).toBeGreaterThanOrEqual(62);
  });

  it("keeps the value on one line: Enter is blocked and pasted line breaks become spaces", () => {
    render(<Controlled initial="Where" />);
    const field = screen.getByLabelText("Câu hỏi");
    const enter = fireEvent.keyDown(field, { key: "Enter" });
    expect(enter).toBe(false);
    expect(fireEvent.keyDown(field, { key: "a" })).toBe(true);
    fireEvent.change(field, { target: { value: "Where do\nthey\r\nwork?" } });
    expect(field).toHaveValue("Where do they work?");
  });

  it("with grow={false} keeps the surrounding box size but still keeps one line", () => {
    vi.spyOn(HTMLTextAreaElement.prototype, "scrollHeight", "get").mockReturnValue(62);
    const onChange = vi.fn();
    render(<label>Tiêu đề<LineField grow={false} value="Tháng 1" onChange={onChange} /></label>);
    const field = screen.getByLabelText("Tiêu đề");
    expect(field.tagName).toBe("TEXTAREA");
    expect(field).not.toHaveClass("line-field");
    expect(field).not.toHaveAttribute("rows");
    expect(field.style.height).toBe("");
    expect(fireEvent.keyDown(field, { key: "Enter" })).toBe(false);
    fireEvent.change(field, { target: { value: "Tháng\n1" } });
    expect(onChange.mock.calls[0]?.[0].target.value).toBe("Tháng 1");
  });

  it("renders answer choices as growing fields with their labels and option index", () => {
    const onChange = vi.fn();
    render(<OptionFields prefix="Đọc" options={["Yes, they will publish it.", "No, they won't publish it."]} onChange={onChange} />);
    const first = screen.getByLabelText("Đọc – Lựa chọn 1");
    expect(first.tagName).toBe("TEXTAREA");
    expect(first).toHaveAttribute("data-option-index", "0");
    expect(first).toHaveValue("Yes, they will publish it.");
    fireEvent.change(screen.getByLabelText("Đọc – Lựa chọn 2"), { target: { value: "No,\nnever." } });
    expect(onChange).toHaveBeenCalledWith(["Yes, they will publish it.", "No, never.", "", ""]);
  });

  it("uses growing fields for the short text fields of the lesson editor", () => {
    render(<ModalProvider><LessonFormEditor weekNumber={2} cefr="A2" initial={emptyLesson(1)} onSave={() => undefined} onCancel={() => undefined} /></ModalProvider>);
    for (const label of ["Tiêu đề bài", "Đọc – Câu hỏi", "Đọc – Lựa chọn 1", "Nghe – Câu hỏi", "Nghe – Lựa chọn 4", "Yêu cầu", "Âm mục tiêu", "Mẹo phát âm"]) {
      expect(screen.getByLabelText(label).tagName, label).toBe("TEXTAREA");
      expect(screen.getByLabelText(label), label).toHaveClass("line-field");
    }
  });
});
