// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { describe, expect, it, vi } from "vitest";
import { OperatorMonths } from "./Months.js";

describe("Operator monthly planner", () => {
  it("shows the complete Monday-to-Sunday calendar for the selected month", () => {
    render(<OperatorMonths
      month="2026-11"
      todayMonth="2026-11"
      overview={{ brief: null, frameworks: [] }}
      cefr="A1"
      busy={false}
      actions={{
        onSelectMonth: vi.fn(), onSelectLevel: vi.fn(), onSaveBrief: vi.fn(), onApproveBrief: vi.fn(), onSaveFramework: vi.fn(), onApproveFramework: vi.fn(),
        onSaveDay: vi.fn(), onGenerateDay: vi.fn(), onAcknowledge: vi.fn(), onApproveDay: vi.fn(), onCreateCorrection: vi.fn(), onSaveCorrection: vi.fn(),
        onAcknowledgeCorrection: vi.fn(), onApproveCorrection: vi.fn()
      }}
    />);

    expect(screen.getByRole("grid", { name: "Lịch tháng 11/2026" })).toBeInTheDocument();
    expect(screen.getAllByRole("gridcell")).toHaveLength(30);
    expect(screen.getAllByRole("columnheader")).toHaveLength(7);
    expect(screen.getByRole("button", { name: "Tháng trước" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Tháng hiện tại" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Tháng sau" })).toBeInTheDocument();
  });
});
