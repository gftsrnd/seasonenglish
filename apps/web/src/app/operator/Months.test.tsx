// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { describe, expect, it, vi } from "vitest";
import { OperatorMonths } from "./Months.js";
import { ToastProvider } from "../shared/design-system.js";

describe("Operator monthly planner", () => {
  it("shows the complete Monday-to-Sunday calendar for the selected month", () => {
    render(<ToastProvider><OperatorMonths
      month="2026-11"
      todayMonth="2026-11"
      overview={{ brief: null, frameworks: [] }}
      cefr="A1"
      busy={false}
      actions={{
        onSelectMonth: vi.fn(), onSelectLevel: vi.fn(), onSuggestBrief: vi.fn(), onSaveBrief: vi.fn(), onApproveBrief: vi.fn(), onGenerateFramework: vi.fn(), onSaveFramework: vi.fn(), onApproveFramework: vi.fn(),
        onSaveDay: vi.fn(), onGenerateDay: vi.fn(), onAcknowledge: vi.fn(), onApproveDay: vi.fn(), onCreateCorrection: vi.fn(), onSaveCorrection: vi.fn(),
        onAcknowledgeCorrection: vi.fn(), onApproveCorrection: vi.fn(), onComposeDay: vi.fn()
      }}
    /></ToastProvider>);

    expect(screen.getByRole("grid", { name: "Lịch tháng 11/2026" })).toBeInTheDocument();
    expect(screen.getAllByRole("gridcell")).toHaveLength(42);
    expect(screen.getAllByRole("columnheader")).toHaveLength(7);
    expect(screen.getByRole("tab", { name: /tháng 10 năm 2026/ })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "tháng 11 năm 2026" })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByRole("tab", { name: "tháng 12 năm 2026" })).toBeInTheDocument();
    expect(screen.getByRole("gridcell", { name: /30.*Bài thi/ })).toBeInTheDocument();
  });
});
