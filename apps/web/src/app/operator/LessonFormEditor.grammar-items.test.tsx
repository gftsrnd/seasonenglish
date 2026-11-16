// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ContentLessonDraftInput } from "@e4s/contracts";
import { ModalProvider } from "../shared/ModalProvider.js";
import { LessonFormEditor } from "./LessonFormEditor.js";
import { describeMonthlyFindings } from "./monthly-failure-findings.js";
import { a1Day13GrammarAnswer as day13 } from "./fixtures/a1-2026-12-day13-grammar-answer.js";

afterEach(cleanup);

/** Read-only copy of the 4175 A1 2026-12 day 13 draft (17/12, "Bài 11"): grammar question 4 answers "his" with options my/mine/me/I. */
const initial = (): ContentLessonDraftInput => ({ dayNumber: 12, title: "Bài 11", durationMinutes: 10, parts: structuredClone(day13.content.parts) as ContentLessonDraftInput["parts"] });
type Item = { id: string; options: string[]; answer: string; answerTranslation?: string };

describe("daily grammar practice in the manual editor (4175 A1 day 13)", () => {
  it("shows the stored answer that is not an option, lets the Operator fix question 4 and saves it with every other field kept", async () => {
    const user = userEvent.setup();
    const onSave = vi.fn();
    render(<ModalProvider><LessonFormEditor weekNumber={0} cefr="A1" monthly initial={initial()} onSave={onSave} onCancel={() => undefined} /></ModalProvider>);
    const question = screen.getByRole("group", { name: "Câu luyện tập 4" });
    expect(question).toHaveAttribute("data-daily-item", "4");
    expect(within(question).getByRole("note")).toHaveTextContent("Đáp án đang lưu “his” không nằm trong 4 lựa chọn");
    expect(within(question).getByLabelText("Câu 4 – Câu hỏi")).toHaveValue("Chọn câu đúng: Whose detail is this? It is ____ detail.");
    expect(within(question).getByLabelText("Câu 4 – Giải thích")).toHaveValue("Trước danh từ detail cần tính từ sở hữu his. Mine không đi với danh từ.");

    const first = within(question).getByLabelText("Câu 4 – Lựa chọn 1");
    await user.clear(first);
    await user.type(first, "his");
    await user.selectOptions(within(question).getByLabelText("Câu 4 – Đáp án đúng"), "his");
    expect(within(question).queryByRole("note")).toBeNull();

    await user.click(screen.getByRole("button", { name: "Kiểm tra & lưu" }));
    await user.click(screen.getAllByRole("button", { name: "Kiểm tra & lưu" }).at(-1)!);
    expect(onSave).toHaveBeenCalledTimes(1);
    const saved = onSave.mock.calls[0]![0] as ContentLessonDraftInput;
    const items = saved.parts.find((part) => part.code === "grammar")!.content.items as Item[];
    expect(items[3]).toMatchObject({ id: "b5-4", options: ["his", "mine", "me", "I"], answer: "his" });
    expect(items.every((item) => item.options.includes(item.answer))).toBe(true);
    // Fields the form does not show (A1 translations) survive the edit.
    expect(items[0]).toMatchObject({ id: "b5-1", answerTranslation: "Bàn của Anna" });
  });

  it("keeps the generated example marks on a save that leaves the examples alone, and drops them once an example is edited", async () => {
    // This day has two grammar steps, so the view (and the editor) show one block per step with its own marks.
    const marked = (): ContentLessonDraftInput => {
      const lesson = initial();
      const grammar = lesson.parts.find((part) => part.code === "grammar")!;
      const examples = (grammar.content.examples as string[]);
      const steps = (grammar.content.steps as Array<Record<string, unknown>>).map((step) => ({ ...step, exampleMarks: (step.examples as string[]).map(() => ({ row: 1, marks: ["is"] })) }));
      grammar.content = { ...grammar.content, steps, exampleMarks: examples.map(() => ({ row: 1, marks: ["is"] })) };
      return lesson;
    };
    const save = async (edit: boolean) => {
      const user = userEvent.setup();
      const onSave = vi.fn();
      render(<ModalProvider><LessonFormEditor weekNumber={0} cefr="A1" monthly initial={marked()} onSave={onSave} onCancel={() => undefined} /></ModalProvider>);
      if (edit) { const first = screen.getByLabelText("Điểm 1 – câu ví dụ 1"); await user.clear(first); await user.type(first, "This is my new desk."); }
      const question = screen.getByRole("group", { name: "Câu luyện tập 4" });
      const option = within(question).getByLabelText("Câu 4 – Lựa chọn 1");
      await user.clear(option); await user.type(option, "his");
      await user.selectOptions(within(question).getByLabelText("Câu 4 – Đáp án đúng"), "his");
      await user.click(screen.getByRole("button", { name: "Kiểm tra & lưu" }));
      await user.click(screen.getAllByRole("button", { name: "Kiểm tra & lưu" }).at(-1)!);
      const saved = onSave.mock.calls[0]![0] as ContentLessonDraftInput;
      cleanup();
      return saved.parts.find((part) => part.code === "grammar")!.content;
    };
    const kept = await save(false);
    expect(kept.steps).toEqual(marked().parts.find((part) => part.code === "grammar")!.content.steps);
    expect(kept).toHaveProperty("exampleMarks");
    const edited = await save(true);
    const [first, second] = edited.steps as Array<Record<string, unknown>>;
    // Only the edited point loses its marks (its highlight falls back to the formula); the other point and the top level keep theirs.
    expect(first!.examples).toEqual(["This is my new desk.", "He is my team leader."]);
    expect(first).not.toHaveProperty("exampleMarks");
    expect(second).toHaveProperty("exampleMarks");
    expect(edited).toHaveProperty("exampleMarks");
  });

  it("names the question in the findings strip once the gate reports it", () => {
    const lines = describeMonthlyFindings([{ severity: "severe", code: "MONTHLY_DAILY_GRAMMAR_QUESTION", component: "grammar", dayNumber: 13, message: 'Every grammar question needs a prompt, 4 distinct options, an answer copied from them, and an explanation. grammar item 4: answer "his" is not one of the options' }], { kind: "new", parts: initial().parts });
    expect(lines).toEqual([expect.objectContaining({ where: "Ngữ pháp · câu 4", item: 4, what: "Đáp án “his” không nằm trong 4 lựa chọn; sửa câu này trong Sửa tay." })]);
  });
});
