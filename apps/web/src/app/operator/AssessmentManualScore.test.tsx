// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AssessmentManualScore } from "./AssessmentManualScore.js";

afterEach(cleanup);

describe("AssessmentManualScore", () => {
  it("shows the prototype rubric and converts writing criteria to 20 points", () => {
    const onSave = vi.fn();
    render(<AssessmentManualScore writingTasks={[]} speakingTasks={[]} comment="" onSave={onSave} saving={false} />);

    expect(screen.getByText("Viết · Chờ chấm")).toBeInTheDocument();
    expect(screen.getByText(/Task 1 – Phản hồi nhanh/)).toBeInTheDocument();
    expect(screen.getByText(/Task 2 – Báo cáo \/ đề xuất/)).toBeInTheDocument();
    expect(screen.getByText(/Mỗi task có rubric riêng/)).toBeInTheDocument();
    expect(screen.getByText("Nói · Chờ chấm")).toBeInTheDocument();
    expect(screen.getByText(/MVP không chấm phát âm/)).toBeInTheDocument();
    expect(screen.getByLabelText("W1 · Workplace communication")).toBeInTheDocument();
    expect(screen.getByText("Task 1 – Phản hồi nhanh")).toBeInTheDocument();
    expect(screen.getByText("(7 phút · 7 điểm · A2–B1 · 50–80 từ)")).toBeInTheDocument();
    expect(screen.getByText("Task 4 – Monologue")).toBeInTheDocument();
    expect(screen.getAllByText(/4 phút · B2–C1/)).toHaveLength(2);

    const inputs = screen.getAllByRole("spinbutton");
    expect(inputs).toHaveLength(26);
    inputs.slice(0, 5).forEach(input => fireEvent.change(input, { target: { value: "4" } }));
    expect(screen.getByText("Viết · 7/20 (đang nhập)")).toBeInTheDocument();
    expect(onSave).not.toHaveBeenCalled();
  });

  it("requires confirmation before saving a complete rubric", () => {
    const onSave = vi.fn();
    render(<AssessmentManualScore writingTasks={[]} speakingTasks={[]} comment="" onSave={onSave} saving={false} />);
    screen.getAllByRole("spinbutton").forEach(input => fireEvent.change(input, { target: { value: "3" } }));
    fireEvent.change(screen.getByLabelText("Nhận xét"), { target: { value: "Cần luyện thêm." } });
    fireEvent.click(screen.getByRole("button", { name: "Lưu điểm chấm tay" }));
    expect(screen.getByRole("dialog", { name: "Xác nhận lưu điểm" })).toBeInTheDocument();
    expect(onSave).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Xác nhận" }));
    expect(onSave).toHaveBeenCalledWith(expect.objectContaining({
      comment: "Cần luyện thêm.",
      writingTasks: expect.arrayContaining([expect.objectContaining({ taskKey: "W1" }), expect.objectContaining({ taskKey: "W2" })]),
      speakingTasks: expect.arrayContaining([expect.objectContaining({ taskKey: "S1" }), expect.objectContaining({ taskKey: "S4" })])
    }));
  });
});
