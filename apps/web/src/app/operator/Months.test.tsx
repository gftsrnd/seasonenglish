// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { userEvent } from "@testing-library/user-event";
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

  it("shows proposed resource counts as read-only and lets the operator approve a generated resource set", async () => {
    const user = userEvent.setup();
    const onApproveFramework = vi.fn();
    render(<ToastProvider><OperatorMonths
      month="2026-11"
      todayMonth="2026-11"
      overview={{ brief: { month: "2026-11", title: "Customer handover", brief: "Prepare a handover.", context: "Customer success", communicationGoal: "Explain risks", version: 1, status: "approved" }, frameworks: [{
        id: "framework-a1", cefr: "A1", version: 1, status: "draft", scopeHash: "scope", lessons: [], quality: { severe: [], light: [] }, resources: {
          coreTerms: [], supportTerms: [], grammarTopics: [], sounds: []
        }
      }] }}
      cefr="A1"
      busy={false}
      actions={{
        onSelectMonth: vi.fn(), onSelectLevel: vi.fn(), onSuggestBrief: vi.fn(), onSaveBrief: vi.fn(), onApproveBrief: vi.fn(), onGenerateFramework: vi.fn(), onSaveFramework: vi.fn(), onApproveFramework,
        onSaveDay: vi.fn(), onGenerateDay: vi.fn(), onAcknowledge: vi.fn(), onApproveDay: vi.fn(), onCreateCorrection: vi.fn(), onSaveCorrection: vi.fn(),
        onAcknowledgeCorrection: vi.fn(), onApproveCorrection: vi.fn(), onComposeDay: vi.fn()
      }}
    /></ToastProvider>);

    expect(screen.queryByRole("spinbutton")).not.toBeInTheDocument();
    expect(screen.getByText("Số lượng đề xuất theo lịch học")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Duyệt tài nguyên" }));
    expect(onApproveFramework).toHaveBeenCalledWith("framework-a1");
  });

  it("uses the review action on Fridays and keeps approved daily lessons view-only", () => {
    render(<ToastProvider><OperatorMonths
      month="2026-11"
      todayMonth="2026-11"
      overview={{ brief: { month: "2026-11", title: "Customer handover", brief: "Prepare a handover.", context: "Customer success", communicationGoal: "Explain risks", version: 1, status: "approved" }, frameworks: [{
        id: "framework-a1", cefr: "A1", version: 1, status: "approved", scopeHash: "scope", quality: { severe: [], light: [] }, resources: {
          coreTerms: [], supportTerms: [], grammarTopics: [], sounds: []
        }, lessons: [
          { lessonNumber: 1, lessonDate: "2026-11-02", kind: "new", status: "approved", scopeHash: "scope", locked: true, correctionCount: 0, quality: { severe: [], light: [] } },
          { lessonNumber: 5, lessonDate: "2026-11-06", kind: "review", status: "pending", scopeHash: "scope", locked: false, correctionCount: 0, quality: { severe: [], light: [] } }
        ]
      }] }}
      cefr="A1"
      busy={false}
      actions={{
        onSelectMonth: vi.fn(), onSelectLevel: vi.fn(), onSuggestBrief: vi.fn(), onSaveBrief: vi.fn(), onApproveBrief: vi.fn(), onGenerateFramework: vi.fn(), onSaveFramework: vi.fn(), onApproveFramework: vi.fn(),
        onSaveDay: vi.fn(), onGenerateDay: vi.fn(), onAcknowledge: vi.fn(), onApproveDay: vi.fn(), onCreateCorrection: vi.fn(), onSaveCorrection: vi.fn(),
        onAcknowledgeCorrection: vi.fn(), onApproveCorrection: vi.fn(), onComposeDay: vi.fn(), onViewDay: vi.fn()
      }}
    /></ToastProvider>);

    expect(screen.getByRole("button", { name: "Xem bài 1" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Sinh bài ôn" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Soạn tay bài ôn" })).not.toBeInTheDocument();
  });
});
