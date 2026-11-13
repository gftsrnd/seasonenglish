// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { afterEach, describe, expect, it, vi } from "vitest";
import { EditorFindingsStrip, MonthlyFindingsPanel } from "./MonthlyFindingsPanel.js";
import type { MonthlyFindingLine } from "./monthly-failure-findings.js";

afterEach(cleanup);

const lines: MonthlyFindingLine[] = [
  { key: "a", code: "MONTHLY_REVIEW_INSTRUCTION_LANGUAGE", component: "grammar", severity: "severe", where: "Phần 4 · Ngữ pháp", what: "Viết lại bằng tiếng Anh." },
  { key: "b", code: "MONTHLY_ANSWER_LONGEST_OPTION", component: "grammar", severity: "light", where: "Phần 4 · Ngữ pháp", what: "Đáp án đúng thường là lựa chọn dài nhất; viết các lựa chọn dài gần bằng nhau." }
];

describe("findings layout: the section label never wraps word by word (13/11)", () => {
  it("day page: chip + section form one non-shrinking label, the message follows it", () => {
    render(<MonthlyFindingsPanel label="Cảnh báo" title="Cảnh báo chất lượng" lines={lines} onEditLine={vi.fn()} />);
    const row = screen.getByText("Đáp án đúng thường là lựa chọn dài nhất; viết các lựa chọn dài gần bằng nhau.").closest("li")!;
    const label = row.querySelector(".operator-monthly-finding-label")!;
    expect(within(label as HTMLElement).getByText("Nhẹ")).toBeInTheDocument();
    expect(label.querySelector(".operator-monthly-finding-where")).toHaveTextContent("Phần 4 · Ngữ pháp:");
    expect(row.querySelector(".operator-monthly-finding-text")).toHaveTextContent(/^Đáp án đúng/u);
  });

  it("editor strip: each item button holds the section label and the message as separate flex items", () => {
    const onSelect = vi.fn();
    render(<EditorFindingsStrip lines={lines} onSelect={onSelect} />);
    fireEvent.click(screen.getByRole("button", { name: "Mở danh sách cảnh báo" }));
    const item = screen.getAllByRole("button", { name: /^Phần 4 · Ngữ pháp: Đáp án đúng/u })[0]!;
    expect(item).toHaveClass("operator-editor-finding-item");
    expect(item.querySelector(".operator-monthly-finding-where")).toHaveTextContent("Phần 4 · Ngữ pháp:");
    fireEvent.click(item);
    expect(onSelect).toHaveBeenCalledWith(lines[1]);
  });
});
