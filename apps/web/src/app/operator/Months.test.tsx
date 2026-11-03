// @vitest-environment jsdom
import { render, screen, waitFor, within } from "@testing-library/react";
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
      overview={{ systemDate: "2026-11-03", monthWindow: { previous: "2026-10", current: "2026-11", next: "2026-12", writable: true }, brief: null, frameworks: [] }}
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
      overview={{ systemDate: "2026-11-03", monthWindow: { previous: "2026-10", current: "2026-11", next: "2026-12", writable: true }, brief: { month: "2026-11", title: "Customer handover", brief: "Prepare a handover.", context: "Customer success", communicationGoal: "Explain risks", version: 1, status: "approved" }, frameworks: [{
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
      overview={{ systemDate: "2026-11-03", monthWindow: { previous: "2026-10", current: "2026-11", next: "2026-12", writable: true }, brief: { month: "2026-11", title: "Customer handover", brief: "Prepare a handover.", context: "Customer success", communicationGoal: "Explain risks", version: 1, status: "approved" }, frameworks: [{
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
    expect(screen.getByRole("button", { name: "Soạn tay bài ôn" })).toBeInTheDocument();
  });

  it("uses the dedicated Friday review endpoint after the operator confirms generation", async () => {
    const user = userEvent.setup();
    const onGenerateReview = vi.fn().mockResolvedValue({ lesson: { title: "Ôn tập", parts: [] }, report: { severe: [], light: [], contractVersion: 1 } });
    const onGenerateDay = vi.fn();
    const { container } = render(<ToastProvider><OperatorMonths
      month="2026-11"
      todayMonth="2026-11"
      overview={{ systemDate: "2026-11-03", monthWindow: { previous: "2026-10", current: "2026-11", next: "2026-12", writable: true }, brief: { month: "2026-11", title: "Customer handover", brief: "Prepare a handover.", context: "Customer success", communicationGoal: "Explain risks", version: 1, status: "approved" }, frameworks: [{
        id: "framework-a1", cefr: "A1", version: 1, status: "approved", scopeHash: "scope", quality: { severe: [], light: [] }, resources: { coreTerms: [], supportTerms: [], grammarTopics: [], sounds: [] }, lessons: [
          { lessonNumber: 5, lessonDate: "2026-11-06", kind: "review", status: "pending", scopeHash: "scope", locked: false, correctionCount: 0, quality: { severe: [], light: [] } }
        ]
      }] }}
      cefr="A1"
      busy={false}
      actions={{ onSelectMonth: vi.fn(), onSelectLevel: vi.fn(), onSuggestBrief: vi.fn(), onSaveBrief: vi.fn(), onApproveBrief: vi.fn(), onGenerateFramework: vi.fn(), onSaveFramework: vi.fn(), onApproveFramework: vi.fn(), onSaveDay: vi.fn(), onGenerateDay, onGenerateReview, onAcknowledge: vi.fn(), onApproveDay: vi.fn(), onCreateCorrection: vi.fn(), onSaveCorrection: vi.fn(), onAcknowledgeCorrection: vi.fn(), onApproveCorrection: vi.fn() }}
    /></ToastProvider>);

    const reviewCell = Array.from(container.querySelectorAll<HTMLElement>("[role='gridcell']")).find((cell) => cell.getAttribute("aria-label") === "06, Ôn tập")!;
    await user.click(within(reviewCell).getByRole("button", { name: "Sinh bài ôn" }));
    const dialog = screen.getByRole("dialog", { name: "Tài nguyên cho bài ôn" });
    expect(dialog).toBeInTheDocument();
    await user.click(within(dialog).getByRole("button", { name: "Sinh bài ôn" }));

    expect(onGenerateReview).toHaveBeenCalledWith("framework-a1", 5);
    expect(onGenerateDay).not.toHaveBeenCalled();
  });

  it("sends a locked day reopen request with the operator reason instead of exposing direct editing", async () => {
    const user = userEvent.setup();
    const onCreateCorrection = vi.fn().mockResolvedValue("correction-1");
    const { container } = render(<ToastProvider><OperatorMonths
      month="2026-11"
      todayMonth="2026-11"
      overview={{ systemDate: "2026-11-03", monthWindow: { previous: "2026-10", current: "2026-11", next: "2026-12", writable: true }, brief: { month: "2026-11", title: "Customer handover", brief: "Prepare a handover.", context: "Customer success", communicationGoal: "Explain risks", version: 1, status: "approved" }, frameworks: [{
        id: "framework-a1", cefr: "A1", version: 1, status: "approved", scopeHash: "scope", quality: { severe: [], light: [] }, resources: { coreTerms: [], supportTerms: [], grammarTopics: [], sounds: [] }, lessons: [
          { lessonNumber: 1, lessonDate: "2026-11-02", kind: "new", status: "approved", scopeHash: "scope", locked: true, correctionCount: 0, quality: { severe: [], light: [] } }
        ]
      }] }}
      cefr="A1"
      busy={false}
      actions={{ onSelectMonth: vi.fn(), onSelectLevel: vi.fn(), onSuggestBrief: vi.fn(), onSaveBrief: vi.fn(), onApproveBrief: vi.fn(), onGenerateFramework: vi.fn(), onSaveFramework: vi.fn(), onApproveFramework: vi.fn(), onSaveDay: vi.fn(), onGenerateDay: vi.fn(), onAcknowledge: vi.fn(), onApproveDay: vi.fn(), onCreateCorrection, onSaveCorrection: vi.fn(), onAcknowledgeCorrection: vi.fn(), onApproveCorrection: vi.fn(), onViewDay: vi.fn() }}
    /></ToastProvider>);

    const approvedCell = Array.from(container.querySelectorAll<HTMLElement>("[role='gridcell']")).find((cell) => cell.classList.contains("approved") && cell.getAttribute("aria-label") === "02, Bài 1")!;
    expect(within(approvedCell).queryByRole("button", { name: "Soạn tay bài 1" })).not.toBeInTheDocument();
    await user.click(within(approvedCell).getByRole("button", { name: "Yêu cầu mở lại bài 1" }));
    const reopenDialog = within(container).getByRole("dialog", { name: "Yêu cầu mở lại bài 1" });
    await user.type(within(reopenDialog).getByLabelText("Lý do yêu cầu mở lại"), "Cần sửa ví dụ phát âm cho người học.");
    await user.click(within(reopenDialog).getByRole("button", { name: "Gửi yêu cầu Manager" }));

    await waitFor(() => expect(onCreateCorrection).toHaveBeenCalledWith("framework-a1", 1, "Cần sửa ví dụ phát âm cho người học."));
    expect(await screen.findByText("Đã gửi yêu cầu mở lại tới Manager.")).toBeInTheDocument();
  });

  it("calls the real monthly-final action from the final-day cell", async () => {
    const user = userEvent.setup();
    const onGenerateMonthlyFinal = vi.fn().mockResolvedValue({ versionId: "final-v1", status: "draft" });
    render(<ToastProvider><OperatorMonths month="2026-11" todayMonth="2026-11" cefr="A1" busy={false}
      overview={{ systemDate: "2026-11-03", monthWindow: { previous: "2026-10", current: "2026-11", next: "2026-12", writable: true }, brief: { month: "2026-11", title: "Handover", brief: "Prepare handover", context: "CS", communicationGoal: "Explain", version: 1, status: "approved" }, frameworks: [{
        id: "framework-a1", cefr: "A1", version: 1, status: "approved", scopeHash: "scope", lessons: [], quality: { severe: [], light: [] }, resources: { coreTerms: [], supportTerms: [], grammarTopics: [], sounds: [] }
      }] }}
      actions={{ onSelectMonth: vi.fn(), onSelectLevel: vi.fn(), onSuggestBrief: vi.fn(), onSaveBrief: vi.fn(), onApproveBrief: vi.fn(), onGenerateFramework: vi.fn(), onSaveFramework: vi.fn(), onApproveFramework: vi.fn(), onGenerateMonthlyFinal, onSaveDay: vi.fn(), onGenerateDay: vi.fn(), onAcknowledge: vi.fn(), onApproveDay: vi.fn(), onCreateCorrection: vi.fn(), onSaveCorrection: vi.fn(), onAcknowledgeCorrection: vi.fn(), onApproveCorrection: vi.fn() }}
    /></ToastProvider>);
    const finalButtons = screen.getAllByRole("button", { name: "Sinh đề thi" });
    await user.click(finalButtons[finalButtons.length - 1]!);
    expect(onGenerateMonthlyFinal).toHaveBeenCalledWith("framework-a1");
  });
});
