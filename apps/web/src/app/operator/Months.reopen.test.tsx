// @vitest-environment jsdom
import { cleanup, render, screen, within } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { userEvent } from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { MonthFrameworkView, MonthlyOperatorOverviewView } from "@e4s/contracts";
import { OperatorMonths, type OperatorMonthsActions } from "./Months.js";
import { ToastProvider } from "../shared/design-system.js";

const monthWindow = { previous: "2026-10", current: "2026-11", next: "2026-12", writable: true };
const baseFramework: MonthFrameworkView = {
  id: "framework-a2", cefr: "A2", version: 1, status: "approved", scopeHash: "monthly-abc", lessons: [],
  quality: { severe: [], light: [] }, resources: { coreTerms: [], supportTerms: [], grammarTopics: [], sounds: [] }
};

function actions(extra: Partial<OperatorMonthsActions> = {}): OperatorMonthsActions {
  return {
    onSelectMonth: vi.fn(), onSelectLevel: vi.fn(), onSuggestBrief: vi.fn(), onSaveBrief: vi.fn(), onApproveBrief: vi.fn(), onGenerateFramework: vi.fn(),
    onSaveFramework: vi.fn(), onApproveFramework: vi.fn(), onSaveDay: vi.fn(), onGenerateDay: vi.fn(), onAcknowledge: vi.fn(), onApproveDay: vi.fn(),
    onCreateCorrection: vi.fn(), onSaveCorrection: vi.fn(), onAcknowledgeCorrection: vi.fn(), onApproveCorrection: vi.fn(), ...extra
  };
}

function renderMonths(framework: MonthFrameworkView, extra: Partial<OperatorMonthsActions> = {}, overrides: Partial<MonthlyOperatorOverviewView> = {}) {
  const overview: MonthlyOperatorOverviewView = { systemDate: "2026-11-05", monthWindow, brief: null, frameworks: [framework], ...overrides };
  const view = render(<ToastProvider><OperatorMonths month="2026-11" todayMonth="2026-11" cefr="A2" busy={false} overview={overview} actions={actions(extra)} /></ToastProvider>);
  return within(view.container.querySelector<HTMLElement>(".monthly-resources")!);
}

describe("Operator request to reopen approved monthly resources", () => {
  afterEach(() => cleanup());

  it("offers the Manager reopen request only for an approved level and sends the reason", async () => {
    const user = userEvent.setup();
    const onRequestResourcesReopen = vi.fn().mockResolvedValue(undefined);
    const panel = renderMonths(baseFramework, { onRequestResourcesReopen });

    expect(panel.queryByRole("button", { name: "Sinh lại tài nguyên" })).not.toBeInTheDocument();
    await user.click(panel.getByRole("button", { name: "Yêu cầu Quản lý mở lại" }));
    const dialog = screen.getByRole("dialog", { name: "Yêu cầu mở lại tài nguyên tháng A2" });
    await user.click(within(dialog).getByRole("button", { name: "Gửi yêu cầu Manager" }));
    expect(onRequestResourcesReopen).not.toHaveBeenCalled();

    await user.type(within(dialog).getByLabelText("Lý do yêu cầu mở lại"), "Kế hoạch cũ thiếu bài tập kỹ năng");
    await user.click(within(dialog).getByRole("button", { name: "Gửi yêu cầu Manager" }));
    expect(onRequestResourcesReopen).toHaveBeenCalledWith("framework-a2", "Kế hoạch cũ thiếu bài tập kỹ năng");
    expect(screen.queryByRole("dialog", { name: "Yêu cầu mở lại tài nguyên tháng A2" })).not.toBeInTheDocument();
  });

  it("does not offer the request for a draft level", () => {
    const panel = renderMonths({ ...baseFramework, status: "draft" }, { onRequestResourcesReopen: vi.fn() });
    expect(panel.queryByRole("button", { name: "Yêu cầu Quản lý mở lại" })).not.toBeInTheDocument();
    expect(panel.getByRole("button", { name: "Duyệt tài nguyên" })).toBeInTheDocument();
  });

  it("shows the pending state instead of the button while the Manager decides", () => {
    const panel = renderMonths({ ...baseFramework, reopenRequest: { id: "request-1", frameworkVersion: 1, reason: "Thiếu bài tập", status: "pending", decisionReason: null, createdAt: "2026-11-05T01:00:00.000Z", decidedAt: null } });
    expect(panel.getByRole("status")).toHaveTextContent("Đang chờ Quản lý duyệt");
    expect(panel.queryByRole("button", { name: "Yêu cầu Quản lý mở lại" })).not.toBeInTheDocument();
  });

  it("shows the Manager rejection reason and lets the Operator ask again", () => {
    const panel = renderMonths({ ...baseFramework, reopenRequest: { id: "request-1", frameworkVersion: 1, reason: "Thiếu bài tập", status: "rejected", decisionReason: "Đã có học viên học bài này", createdAt: "2026-11-05T01:00:00.000Z", decidedAt: "2026-11-05T02:00:00.000Z" } });
    expect(panel.getByRole("note")).toHaveTextContent("Quản lý đã từ chối mở lại: Đã có học viên học bài này");
    expect(panel.getByRole("button", { name: "Yêu cầu Quản lý mở lại" })).toBeEnabled();
  });

  it("explains a Manager-approved reopen on the returned draft", () => {
    const panel = renderMonths({ ...baseFramework, version: 2, status: "draft", reopenRequest: { id: "request-1", frameworkVersion: 1, reason: "Thiếu bài tập", status: "approved", decisionReason: "Đồng ý mở lại", createdAt: "2026-11-05T01:00:00.000Z", decidedAt: "2026-11-05T02:00:00.000Z" } });
    expect(panel.getByRole("note")).toHaveTextContent("Quản lý đã mở lại tài nguyên: Đồng ý mở lại");
    expect(panel.getByRole("button", { name: "Duyệt tài nguyên" })).toBeInTheDocument();
  });

  it("disables the request for a read-only month", () => {
    const panel = renderMonths(baseFramework, { onRequestResourcesReopen: vi.fn() }, { monthWindow: { ...monthWindow, writable: false } });
    expect(panel.getByRole("button", { name: "Yêu cầu Quản lý mở lại" })).toBeDisabled();
  });
});
