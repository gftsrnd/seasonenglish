// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AssessmentManualScore } from "./AssessmentManualScore.js";

afterEach(cleanup);

describe("AssessmentManualScore", () => {
  it("shows the prototype rubric and converts writing criteria to 20 points", () => {
    const onSave = vi.fn();
    render(<AssessmentManualScore writingCriteria={{}} speakingCriteria={{}} comment="" onSave={onSave} saving={false} />);

    expect(screen.getByText("Viết · 0/20")).toBeInTheDocument();
    expect(screen.getByText(/Task 1 – Phản hồi nhanh/)).toBeInTheDocument();
    expect(screen.getByText(/Task 2 – Báo cáo \/ đề xuất/)).toBeInTheDocument();
    expect(screen.getByText(/Một rubric cho cả phần Viết/)).toBeInTheDocument();
    expect(screen.getByText("Nói · 0/20")).toBeInTheDocument();
    expect(screen.getByText(/Phát âm không chấm được/)).toBeInTheDocument();
    expect(screen.getByLabelText("Workplace communication")).toBeInTheDocument();
    expect(screen.getByText("Task 1 – Phản hồi nhanh")).toBeInTheDocument();
    expect(screen.getByText("(7 phút · 7 điểm · A2–B1) (0 từ · yêu cầu 50–80)")).toBeInTheDocument();
    expect(screen.getByText("Task 4 – Monologue")).toBeInTheDocument();
    expect(screen.getByText(/4 phút · B2–C2/)).toBeInTheDocument();

    const inputs = screen.getAllByRole("spinbutton");
    inputs.slice(0, 5).forEach((input, index) => fireEvent.change(input, { target: { value: String(index + 1) } }));
    expect(screen.getByText("Viết · 12/20")).toBeInTheDocument();
    expect(onSave).not.toHaveBeenCalled();
  });

  it("requires confirmation before saving a complete rubric", () => {
    const onSave = vi.fn();
    render(<AssessmentManualScore writingCriteria={{}} speakingCriteria={{}} comment="" onSave={onSave} saving={false} />);
    screen.getAllByRole("spinbutton").forEach(input => fireEvent.change(input, { target: { value: "3" } }));
    fireEvent.change(screen.getByLabelText("Nhận xét"), { target: { value: "Cần luyện thêm." } });
    fireEvent.click(screen.getByRole("button", { name: "Lưu điểm chấm tay" }));
    expect(screen.getByRole("dialog", { name: "Xác nhận lưu điểm" })).toBeInTheDocument();
    expect(onSave).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Xác nhận" }));
    expect(onSave).toHaveBeenCalledWith(expect.objectContaining({ comment: "Cần luyện thêm." }));
  });
});
