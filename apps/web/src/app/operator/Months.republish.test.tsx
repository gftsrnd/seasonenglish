// @vitest-environment jsdom
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { userEvent } from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { MonthFrameworkView, MonthlyOperatorOverviewView, MonthlyRepublicationPreviewView } from "@e4s/contracts";
import { OperatorMonths, republicationMissingMessage, type OperatorMonthsActions } from "./Months.js";
import { ToastProvider } from "../shared/design-system.js";
import { ModalProvider } from "../shared/ModalProvider.js";

afterEach(cleanup);

const NOTICE = "Ngày hệ thống (06/11) sớm hơn ngày công bố (13/11). Học viên chưa vào học được. Bấm Công bố lại để mở theo ngày hiện tại.";
const monthWindow = { previous: "2026-10", current: "2026-11", next: "2026-12", writable: true };
const framework = (publishedOn: string | null): MonthFrameworkView => ({
  id: "framework-a1", cefr: "A1", version: 18, status: "approved", scopeHash: "monthly-abc", lessons: [],
  quality: { severe: [], light: [] }, resources: { coreTerms: [], supportTerms: [], grammarTopics: [], sounds: [] },
  publication: { ready: true, publishedOn }
});
const preview = (extra: Partial<MonthlyRepublicationPreviewView> = {}): MonthlyRepublicationPreviewView => ({
  publishedOn: "2026-11-13", republishOn: "2026-11-06", needed: true, ready: true, missingDays: [], affectedLearners: 12, shiftedLearners: 2, ...extra
});

function actions(extra: Partial<OperatorMonthsActions> = {}): OperatorMonthsActions {
  return {
    onSelectMonth: vi.fn(), onSelectLevel: vi.fn(), onSuggestBrief: vi.fn(), onSaveBrief: vi.fn(), onApproveBrief: vi.fn(), onGenerateFramework: vi.fn(),
    onSaveFramework: vi.fn(), onApproveFramework: vi.fn(), onSaveDay: vi.fn(), onGenerateDay: vi.fn(), onAcknowledge: vi.fn(), onApproveDay: vi.fn(),
    onCreateCorrection: vi.fn(), onSaveCorrection: vi.fn(), onAcknowledgeCorrection: vi.fn(), onApproveCorrection: vi.fn(), ...extra
  };
}

function renderCard(publishedOn: string | null, extra: Partial<OperatorMonthsActions>, options: { readOnly?: boolean; systemDate?: string } = {}) {
  const overview: MonthlyOperatorOverviewView = {
    systemDate: options.systemDate ?? "2026-11-06", monthWindow, frameworks: [framework(publishedOn)],
    brief: { month: "2026-11", title: "Feedback", brief: "Client feedback", context: "Office", communicationGoal: "Agree", version: 1, status: "approved" }
  };
  render(<ModalProvider><ToastProvider><OperatorMonths month="2026-11" todayMonth="2026-11" cefr="A1" busy={false} readOnly={options.readOnly ?? false} overview={overview} actions={actions(extra)} /></ToastProvider></ModalProvider>);
  return within(screen.getByRole("region", { name: "Tiến độ công bố A1" }));
}

describe("Công bố lại on the month publication card", () => {
  const republishActions = () => ({ onPreviewRepublication: vi.fn().mockResolvedValue(preview()), onRepublishMonth: vi.fn().mockResolvedValue(undefined) });

  it("shows the warn notice and the button only when the publication date is after the system date", () => {
    const later = renderCard("2026-11-13", republishActions());
    expect(later.getByText(NOTICE)).toBeInTheDocument();
    expect(later.getByRole("button", { name: "Công bố lại" })).toBeEnabled();
    cleanup();
    const same = renderCard("2026-11-06", republishActions());
    expect(same.queryByText(/sớm hơn ngày công bố/u)).not.toBeInTheDocument();
    expect(same.queryByRole("button", { name: "Công bố lại" })).not.toBeInTheDocument();
    cleanup();
    const earlier = renderCard("2026-11-02", republishActions());
    expect(earlier.queryByRole("button", { name: "Công bố lại" })).not.toBeInTheDocument();
  });

  it("is available to the read-only Manager view, and hidden without the republish actions", () => {
    expect(renderCard("2026-11-13", republishActions(), { readOnly: true }).getByRole("button", { name: "Công bố lại" })).toBeInTheDocument();
    cleanup();
    const withoutActions = renderCard("2026-11-13", {});
    expect(withoutActions.getByText(NOTICE)).toBeInTheDocument();
    expect(withoutActions.queryByRole("button", { name: "Công bố lại" })).not.toBeInTheDocument();
  });

  it("confirms the date change, learner count and absence start before republishing", async () => {
    const user = userEvent.setup();
    const handlers = republishActions();
    const card = renderCard("2026-11-13", handlers);
    await user.click(card.getByRole("button", { name: "Công bố lại" }));
    const dialog = await screen.findByRole("dialog", { name: /Công bố lại tháng 2026-11 · A1/u });
    expect(within(dialog).getByText("Ngày công bố: 13/11 → 06/11.")).toBeInTheDocument();
    expect(within(dialog).getByText(/12 học viên A1 học được từ 06\/11\. 2 học viên có ngày bắt đầu cấp độ được dời về 06\/11\./u)).toBeInTheDocument();
    expect(within(dialog).getByText("Ngày vắng tính từ 06/11.")).toBeInTheDocument();
    await user.click(within(dialog).getByRole("button", { name: "Công bố lại" }));
    await waitFor(() => expect(handlers.onRepublishMonth).toHaveBeenCalledWith("framework-a1", "2026-11-06"));
  });

  it("names the missing days and does nothing when the month is not ready", async () => {
    const user = userEvent.setup();
    const handlers = { ...republishActions(), onPreviewRepublication: vi.fn().mockResolvedValue(preview({ ready: false, missingDays: [{ lessonNumber: 5, date: "2026-11-09" }] })) };
    const card = renderCard("2026-11-13", handlers);
    await user.click(card.getByRole("button", { name: "Công bố lại" }));
    expect(await screen.findByText(republicationMissingMessage([{ lessonNumber: 5, date: "2026-11-09" }]))).toBeInTheDocument();
    expect(screen.queryByRole("dialog", { name: /Công bố lại tháng/u })).not.toBeInTheDocument();
    expect(handlers.onRepublishMonth).not.toHaveBeenCalled();
    expect(republicationMissingMessage([{ lessonNumber: 5, date: "2026-11-09" }])).toContain("09/11 (Bài 5)");
  });
});
