// @vitest-environment jsdom
import { cleanup, render, screen, within } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { userEvent } from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { MonthFrameworkView, MonthlyOperatorOverviewView } from "@e4s/contracts";
import { OperatorMonths, type OperatorMonthsActions } from "./Months.js";
import { ToastProvider } from "../shared/design-system.js";
import { ModalProvider } from "../shared/ModalProvider.js";

const REOPEN = "Báo Quản lý: yêu cầu mở lại tài nguyên";
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
  const view = render(<ModalProvider><ToastProvider><OperatorMonths month="2026-11" todayMonth="2026-11" cefr="A2" busy={false} overview={overview} actions={actions(extra)} /></ToastProvider></ModalProvider>);
  return within(view.container.querySelector<HTMLElement>(".monthly-resources")!);
}

describe("Operator request to reopen approved monthly resources", () => {
  afterEach(() => cleanup());

  it("offers the Manager reopen request only for an approved level and sends the reason", async () => {
    const user = userEvent.setup();
    const onRequestResourcesReopen = vi.fn().mockResolvedValue(undefined);
    const panel = renderMonths(baseFramework, { onRequestResourcesReopen });

    expect(panel.queryByRole("button", { name: "Sinh lại tài nguyên" })).not.toBeInTheDocument();
    await user.click(panel.getByRole("button", { name: REOPEN }));
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
    expect(panel.queryByRole("button", { name: REOPEN })).not.toBeInTheDocument();
    expect(panel.getByRole("button", { name: "Duyệt tài nguyên" })).toBeInTheDocument();
  });

  it("shows the pending state instead of the button while the Manager decides", () => {
    const panel = renderMonths({ ...baseFramework, reopenRequest: { id: "request-1", frameworkVersion: 1, reason: "Thiếu bài tập", status: "pending", decisionReason: null, createdAt: "2026-11-05T01:00:00.000Z", decidedAt: null } });
    expect(panel.getByRole("status")).toHaveTextContent("Đang chờ Quản lý duyệt");
    const button = panel.getByRole("button", { name: REOPEN });
    expect(button).toBeDisabled();
    expect(button).toHaveAttribute("title", "Đang chờ Quản lý duyệt");
  });

  it("shows the request as a labelled secondary \"Báo Quản lý\" button on the plan row, not a red stop-like square", () => {
    const allocated: MonthFrameworkView = { ...baseFramework, resources: { ...baseFramework.resources!, roadmap: { allocated: true, grammarSteps: [], sounds: [], days: [] } } };
    const panel = renderMonths(allocated, { onRequestResourcesReopen: vi.fn() });
    const plan = panel.getByRole("button", { name: "Phân bổ tài nguyên & bài tập" });
    const request = panel.getByRole("button", { name: REOPEN });
    expect(request).toHaveTextContent("Báo Quản lý");
    expect(request).toHaveAccessibleName("Báo Quản lý: yêu cầu mở lại tài nguyên");
    expect(request).toHaveAttribute("title", "Báo Quản lý để mở lại tài nguyên đã chốt");
    expect(request).toHaveClass("btn", "monthly-reopen-request-button");
    expect(request).not.toHaveClass("btn-danger");
    expect(request).not.toHaveClass("monthly-reopen-icon-button");
    // lucide's Square (stop glyph) renders class "lucide-square"; the report action uses a message-warning icon.
    expect(request.querySelector("svg.lucide-square")).toBeNull();
    expect(request.querySelector("svg.lucide-message-square-warning")).not.toBeNull();
    expect(request.parentElement).toBe(plan.parentElement);
    expect(request.parentElement).toHaveClass("monthly-plan-row");
    expect(plan.nextElementSibling).toBe(request);
  });

  it("shows the Manager rejection reason and lets the Operator ask again", () => {
    const panel = renderMonths({ ...baseFramework, reopenRequest: { id: "request-1", frameworkVersion: 1, reason: "Thiếu bài tập", status: "rejected", decisionReason: "Đã có học viên học bài này", createdAt: "2026-11-05T01:00:00.000Z", decidedAt: "2026-11-05T02:00:00.000Z" } });
    expect(panel.getByRole("note")).toHaveTextContent("Quản lý đã từ chối mở lại: Đã có học viên học bài này");
    expect(panel.getByRole("button", { name: REOPEN })).toBeEnabled();
  });

  it("explains a Manager-approved reopen on the returned draft", () => {
    const panel = renderMonths({ ...baseFramework, version: 2, status: "draft", reopenRequest: { id: "request-1", frameworkVersion: 1, reason: "Thiếu bài tập", status: "approved", decisionReason: "Đồng ý mở lại", createdAt: "2026-11-05T01:00:00.000Z", decidedAt: "2026-11-05T02:00:00.000Z" } });
    expect(panel.getByRole("note")).toHaveTextContent("Quản lý đã mở lại tài nguyên: Đồng ý mở lại");
    expect(panel.getByRole("button", { name: "Duyệt tài nguyên" })).toBeInTheDocument();
  });

  it("disables the request for a read-only month", () => {
    const panel = renderMonths(baseFramework, { onRequestResourcesReopen: vi.fn() }, { monthWindow: { ...monthWindow, writable: false } });
    expect(panel.getByRole("button", { name: REOPEN })).toBeDisabled();
  });
});

describe("Operator monthly calendar day actions", () => {
  afterEach(() => cleanup());

  function renderCalendar(framework: MonthFrameworkView) {
    const overview: MonthlyOperatorOverviewView = { systemDate: "2026-11-05", monthWindow, brief: null, frameworks: [framework] };
    const view = render(<ModalProvider><ToastProvider><OperatorMonths month="2026-11" todayMonth="2026-11" cefr="A2" busy={false} overview={overview} actions={actions()} /></ToastProvider></ModalProvider>);
    return within(view.container.querySelector<HTMLElement>(".monthly-calendar")!);
  }
  const dayButtons = (calendar: ReturnType<typeof renderCalendar>) => [
    ...calendar.getAllByRole("button", { name: /^Sinh( bài \d+)?$/u }),
    ...calendar.getAllByRole("button", { name: /^Soạn tay bài/u })
  ];

  it("greys out the AI and pencil day buttons until the level's resources are approved", () => {
    const calendar = renderCalendar({ ...baseFramework, status: "draft" });
    const buttons = dayButtons(calendar);
    expect(buttons.length).toBeGreaterThan(10);
    for (const button of buttons) {
      expect(button).toBeDisabled();
      expect(button).toHaveAttribute("title", "Chốt tài nguyên tháng trước khi sinh bài");
      // Same disabled styling path as the exam cell buttons.
      expect(button).toHaveClass("monthly-day-action");
    }
  });

  it("keeps the day buttons available once the resources are approved", () => {
    const calendar = renderCalendar(baseFramework);
    for (const button of dayButtons(calendar)) {
      expect(button).toBeEnabled();
      expect(button).not.toHaveAttribute("title", "Chốt tài nguyên tháng trước khi sinh bài");
    }
  });
});

describe("Operator manual edit of draft monthly resources", () => {
  afterEach(() => cleanup());

  it("offers Sửa tay only for a draft level and opens the editor", async () => {
    const user = userEvent.setup();
    const onSaveResources = vi.fn().mockResolvedValue(undefined);
    const draftPanel = renderMonths({ ...baseFramework, status: "draft" }, { onSaveResources });
    await user.click(draftPanel.getByRole("button", { name: "Sửa tay" }));
    expect(screen.getByRole("dialog", { name: "Sửa tay tài nguyên A2" })).toBeInTheDocument();
    await user.click(within(screen.getByRole("dialog", { name: "Sửa tay tài nguyên A2" })).getByRole("button", { name: "Lưu bản nháp" }));
    expect(onSaveResources).toHaveBeenCalledWith("framework-a2", expect.objectContaining({ expectedVersion: 1 }));
    expect(screen.queryByRole("dialog", { name: "Sửa tay tài nguyên A2" })).not.toBeInTheDocument();
    cleanup();

    const approvedPanel = renderMonths(baseFramework, { onSaveResources });
    expect(approvedPanel.queryByRole("button", { name: "Sửa tay" })).not.toBeInTheDocument();
  });

  it("disables Sửa tay for a read-only month", () => {
    const panel = renderMonths({ ...baseFramework, status: "draft" }, { onSaveResources: vi.fn() }, { monthWindow: { ...monthWindow, writable: false } });
    expect(panel.getByRole("button", { name: "Sửa tay" })).toBeDisabled();
  });
});
