// @vitest-environment jsdom
import { render as renderUi, screen, waitFor, within, act, cleanup } from "@testing-library/react";
import type { ReactElement } from "react";
import { ModalProvider } from "../shared/ModalProvider.js";
import "@testing-library/jest-dom/vitest";
import { userEvent } from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { buildMonthlyCalendar, monthlyDayKind, monthlyNewLessonOrdinal } from "@e4s/domain/monthly";
import { MonthlyLessonPreview, OperatorMonths } from "./Months.js";
import { ToastProvider } from "../shared/design-system.js";
import { monthlyFinalView } from "../../../test/support/monthly-final-view.js";

const render = (element: ReactElement) => renderUi(<ModalProvider>{element}</ModalProvider>);
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

describe("Operator monthly planner", () => {
  it("renders an approved daily review with the legacy operator presentation and locked actions", () => {
    render(<MonthlyLessonPreview date="2026-11-06" cefr="A2" onClose={vi.fn()} lesson={{ lessonNumber: 5, lessonDate: "2026-11-06", kind: "review", status: "approved", scopeHash: "scope", locked: true, correctionCount: 0, quality: { severe: [], light: [] }, content: { title: "Ôn tập", parts: [{ code: "instruction", title: "Hướng dẫn", content: { guidance: "Ôn lại các bài trong tuần." } }, { code: "writing", title: "Viết", content: { prompt: "Write a recap.", answer: "A recap." } }, { code: "pronunciation", title: "Phát âm", content: { focus: "/k/", words: [{ word: "cost", ipa: "/kɒst/" }, { word: "can", ipa: "/kæn/" }, { word: "key", ipa: "/kiː/" }], reviewTargets: [{ soundId: "k", focus: "/k/", words: [{ word: "cost", ipa: "/kɒst/" }, { word: "can", ipa: "/kæn/" }, { word: "key", ipa: "/kiː/" }] }, { soundId: "s", focus: "/s/", words: [{ word: "see", ipa: "/siː/" }, { word: "soon", ipa: "/suːn/" }, { word: "sales", ipa: "/seɪlz/" }] }] } }] } }} />);

    expect(screen.getByRole("heading", { level: 1, name: /06\/11.*Ôn tập/ })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: /1\. Ôn/ })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Sinh bài cuối tuần/ })).not.toBeInTheDocument();
    expect(screen.getByText("/s/")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Nghe từ phát âm: sales" })).toBeInTheDocument();
  });

  it("numbers a stored raw-slot title like the header: 09/11 is Bài 5 (the 06/11 review is not counted), never Bài 6", () => {
    const calendar = buildMonthlyCalendar("2026-11");
    const slot = calendar.effectiveDays.indexOf("2026-11-09") + 1;
    expect(monthlyDayKind(slot - 1, calendar)).toBe("review");
    const ordinal = monthlyNewLessonOrdinal(slot, calendar)!;
    expect(ordinal).toBe(slot - 1);
    render(<MonthlyLessonPreview date="2026-11-09" cefr="A1" onClose={vi.fn()} lesson={{ lessonNumber: slot, lessonDate: "2026-11-09", kind: "new", status: "approved", scopeHash: "scope", locked: true, correctionCount: 0, quality: { severe: [], light: [] }, content: { title: `Bài ${slot}`, parts: [{ code: "instruction", title: "Hướng dẫn", content: { guidance: "Học bài mới." } }] } }} />);
    expect(screen.getByRole("heading", { level: 1, name: new RegExp(`09/11 · Bài ${ordinal} · Mức A1`) })).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 3, name: `Bài ${ordinal}` })).toBeInTheDocument();
    expect(screen.queryByText(`Bài ${slot}`)).not.toBeInTheDocument();
  });

  it("labels a review whose stored title is a raw 'Bài N' as review", () => {
    render(<MonthlyLessonPreview date="2026-11-06" cefr="A1" onClose={vi.fn()} lesson={{ lessonNumber: 5, lessonDate: "2026-11-06", kind: "review", status: "approved", scopeHash: "scope", locked: true, correctionCount: 0, quality: { severe: [], light: [] }, content: { title: "Bài 5", parts: [{ code: "instruction", title: "Hướng dẫn", content: { guidance: "Ôn lại." } }] } }} />);
    expect(screen.getByRole("heading", { level: 3, name: "Ôn tập" })).toBeInTheDocument();
    expect(screen.queryByText("Bài 5")).not.toBeInTheDocument();
  });

  it("shows the complete Monday-to-Sunday calendar for the selected month", () => {
    const { container } = render(<ToastProvider><OperatorMonths
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

    expect(screen.getByRole("heading", { name: "Chu kỳ tháng" })).toBeInTheDocument();
    expect(screen.queryByText("Chu kỳ")).not.toBeInTheDocument();
    expect(screen.getByRole("grid", { name: "Lịch tháng 11/2026" })).toBeInTheDocument();
    expect(screen.getAllByRole("gridcell")).toHaveLength(42);
    expect(screen.getAllByRole("columnheader")).toHaveLength(7);
    expect(screen.getByRole("tab", { name: /tháng 10 năm 2026/ })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "tháng 11 năm 2026" })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByRole("tab", { name: "tháng 12 năm 2026" })).toBeInTheDocument();
    expect(screen.getByRole("gridcell", { name: /30.*Bài thi/ })).toBeInTheDocument();
  });

  it("projects positional review slots before resources exist and numbers only new lessons", () => {
    const { container, unmount } = render(<ToastProvider><OperatorMonths
      month="2026-10" todayMonth="2026-10" cefr="A1" busy={false}
      overview={{ systemDate: "2026-10-01", monthWindow: { previous: "2026-09", current: "2026-10", next: "2026-11", writable: true }, brief: null, frameworks: [] }}
      actions={{ onSelectMonth: vi.fn(), onSelectLevel: vi.fn(), onSuggestBrief: vi.fn(), onSaveBrief: vi.fn(), onApproveBrief: vi.fn(), onGenerateFramework: vi.fn(), onSaveFramework: vi.fn(), onApproveFramework: vi.fn(), onSaveDay: vi.fn(), onGenerateDay: vi.fn(), onAcknowledge: vi.fn(), onApproveDay: vi.fn(), onCreateCorrection: vi.fn(), onSaveCorrection: vi.fn(), onAcknowledgeCorrection: vi.fn(), onApproveCorrection: vi.fn() }}
    /></ToastProvider>);

    const cells = Array.from(container.querySelectorAll<HTMLElement>("[role='gridcell']"));
    const firstReview = cells.find((cell) => cell.getAttribute("aria-label") === "07, Ôn tập");
    const nextNew = cells.find((cell) => cell.getAttribute("aria-label") === "08, Bài 5");
    expect(firstReview).toHaveClass("review");
    expect(within(firstReview!).getByRole("button", { name: "Sinh" })).toBeInTheDocument();
    expect(nextNew).toHaveClass("lesson");
    unmount();
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
    await user.click(screen.getByRole("button", { name: "Duyệt tài nguyên" }));
    const confirmation = screen.getByRole("dialog", { name: "Duyệt tài nguyên tháng?" });
    expect(onApproveFramework).not.toHaveBeenCalled();
    await user.click(within(confirmation).getByRole("button", { name: "Huỷ" }));
    expect(onApproveFramework).not.toHaveBeenCalled();
    await user.click(screen.getByRole("button", { name: "Duyệt tài nguyên" }));
    await user.click(within(screen.getByRole("dialog", { name: "Duyệt tài nguyên tháng?" })).getByRole("button", { name: "Duyệt tài nguyên" }));
    expect(onApproveFramework).toHaveBeenCalledWith("framework-a1");
  });

  it("shows approved resource links in the plan preview", async () => {
    const user = userEvent.setup();
    const coreTerms = ["budget", "cost", "forecast"].map((word, index) => ({ id: `core-${index + 1}`, word, meaning: word, type: "noun", ipa: "/b/", source: "core_registry" as const, component: "core" as const, dayNumber: 1 }));
    const supportTerms = Array.from({ length: 9 }, (_, index) => ({ id: `support-${index + 1}`, word: `extra${index + 1}`, meaning: "meaning", type: "noun", relation: (["umbrella", "synonym", "word_family"] as const)[index % 3]!, source: "example" as const, component: "expanded" as const, dayNumber: 1, relatedCoreTermId: `core-${Math.floor(index / 3) + 1}` }));
    render(<ToastProvider><OperatorMonths
      month="2026-11" todayMonth="2026-11" cefr="A2" busy={false}
      overview={{ systemDate: "2026-11-03", monthWindow: { previous: "2026-10", current: "2026-11", next: "2026-12", writable: true }, brief: null, frameworks: [{
        id: "framework-a2", cefr: "A2", version: 1, status: "approved", scopeHash: "scope", lessons: [], quality: { severe: [], light: [] }, resources: {
          coreTerms, supportTerms, grammarTopics: [], sounds: [], roadmap: { allocated: true, grammarSteps: [], sounds: [], days: [{ lessonNumber: 1, date: "2026-11-02", kind: "new", coreTermIds: coreTerms.map((term) => term.id), expandedTermIds: supportTerms.map((term) => term.id), reviewTermIds: [], reviewExpandedTermIds: [], skillExercises: [], grammarStepIds: ["grammar-step"], soundId: "sound-1", pronunciationSlot: "P1", pronunciationExampleIds: ["example-1", "example-2", "example-3"] }] }
        }
      }] }}
      actions={{ onSelectMonth: vi.fn(), onSelectLevel: vi.fn(), onSuggestBrief: vi.fn(), onSaveBrief: vi.fn(), onApproveBrief: vi.fn(), onGenerateFramework: vi.fn(), onSaveFramework: vi.fn(), onApproveFramework: vi.fn(), onSaveDay: vi.fn(), onGenerateDay: vi.fn(), onAcknowledge: vi.fn(), onApproveDay: vi.fn(), onCreateCorrection: vi.fn(), onSaveCorrection: vi.fn(), onAcknowledgeCorrection: vi.fn(), onApproveCorrection: vi.fn() }}
    /></ToastProvider>);

    await user.click(screen.getByText("Phân bổ tài nguyên và trọng tâm kỹ năng"));
    expect(screen.getByText("extra1 · extra2 · extra3")).toBeInTheDocument();
    expect(screen.getByText("Ngữ pháp: Chưa gán · Phát âm: Chưa gán")).toBeInTheDocument();
  });

  it("shows durable category checkpoints as unpublished and continues only missing groups", async () => {
    const user = userEvent.setup();
    const onGenerateFramework = vi.fn();
    const { container } = render(<ToastProvider><OperatorMonths
      month="2026-11" todayMonth="2026-11" cefr="A2" busy={false}
      overview={{ systemDate: "2026-11-03", monthWindow: { previous: "2026-10", current: "2026-11", next: "2026-12", writable: true }, brief: { month: "2026-11", title: "Customer handover", brief: "Prepare a handover.", context: "Customer success", communicationGoal: "Explain risks", version: 1, status: "approved" }, frameworks: [] }}
      resourceCheckpoint={{ state: "draft_checkpoint", draftOnly: true, publishable: false, retryOnlyMissing: true, generationId: "generation-1", version: 2, briefVersion: 1, updatedAt: "2026-11-04T00:00:00.000Z", categories: {
        coreTerms: { state: "complete", count: 48, target: 48 }, expandedTerms: { state: "complete", count: 288, target: 432 }, grammarTopics: { state: "missing", count: 0, target: 2 }, pronunciationTargets: { state: "missing", count: 0, target: 4 }
      } }}
      actions={{ onSelectMonth: vi.fn(), onSelectLevel: vi.fn(), onSuggestBrief: vi.fn(), onSaveBrief: vi.fn(), onApproveBrief: vi.fn(), onGenerateFramework, onSaveFramework: vi.fn(), onApproveFramework: vi.fn(), onSaveDay: vi.fn(), onGenerateDay: vi.fn(), onAcknowledge: vi.fn(), onApproveDay: vi.fn(), onCreateCorrection: vi.fn(), onSaveCorrection: vi.fn(), onAcknowledgeCorrection: vi.fn(), onApproveCorrection: vi.fn() }}
    /></ToastProvider>);

    expect(screen.getByText("Bản nháp theo nhóm · chưa chốt")).toBeInTheDocument();
    const checkpoint = screen.getByRole("status", { name: "Tiến độ tài nguyên nháp" });
    expect(within(checkpoint).getByText("Từ cốt lõi").parentElement).toHaveTextContent("48/48");
    expect(within(checkpoint).getByText("Ngữ pháp").parentElement).toHaveTextContent("0/2");
    expect(within(container).queryByRole("button", { name: "Duyệt tài nguyên" })).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Tiếp tục nhóm còn thiếu" }));
    expect(onGenerateFramework).toHaveBeenCalledWith("2026-11", { cefr: "A2", vocabularyCount: 48, expandedVocabularyCount: 432, grammarTopicCount: 2, pronunciationSoundCount: 4 });
  });

  it("treats a gateway timeout while generating resources as still running, not as a failure", async () => {
    const user = userEvent.setup();
    const onGenerateFramework = vi.fn().mockRejectedValue(Object.assign(new Error("HTTP_504"), { code: "HTTP_504", status: 504 }));
    const onLoadManualResources = vi.fn();
    render(<ToastProvider><OperatorMonths
      month="2026-11" todayMonth="2026-11" cefr="A2" busy={false}
      overview={{ systemDate: "2026-11-03", monthWindow: { previous: "2026-10", current: "2026-11", next: "2026-12", writable: true }, brief: { month: "2026-11", title: "Customer handover", brief: "Prepare a handover.", context: "Customer success", communicationGoal: "Explain risks", version: 1, status: "approved" }, frameworks: [] }}
      resourceCheckpoint={{ state: "draft_checkpoint", draftOnly: true, publishable: false, retryOnlyMissing: true, generationId: "generation-1", version: 2, briefVersion: 1, updatedAt: "2026-11-04T00:00:00.000Z", categories: {
        coreTerms: { state: "complete", count: 48, target: 48 }, expandedTerms: { state: "complete", count: 288, target: 432 }, grammarTopics: { state: "missing", count: 0, target: 2 }, pronunciationTargets: { state: "missing", count: 0, target: 4 }
      } }}
      actions={{ onSelectMonth: vi.fn(), onSelectLevel: vi.fn(), onSuggestBrief: vi.fn(), onSaveBrief: vi.fn(), onApproveBrief: vi.fn(), onGenerateFramework, onLoadManualResources, onSaveFramework: vi.fn(), onApproveFramework: vi.fn(), onSaveDay: vi.fn(), onGenerateDay: vi.fn(), onAcknowledge: vi.fn(), onApproveDay: vi.fn(), onCreateCorrection: vi.fn(), onSaveCorrection: vi.fn(), onAcknowledgeCorrection: vi.fn(), onApproveCorrection: vi.fn() }}
    /></ToastProvider>);

    await user.click(screen.getByRole("button", { name: "Tiếp tục nhóm còn thiếu" }));

    expect(await screen.findByText(/Máy chủ vẫn đang sinh tài nguyên tháng/)).toBeInTheDocument();
    expect(screen.queryByText(/AI không tạo được đủ tài nguyên/)).not.toBeInTheDocument();
    expect(onLoadManualResources).not.toHaveBeenCalled();
  });

  const partialRun = (failedAttempts: number, onGenerateFramework: Parameters<typeof OperatorMonths>[0]["actions"]["onGenerateFramework"], onLoadManualResources = vi.fn()) => render(<ToastProvider><OperatorMonths
      month="2026-11" todayMonth="2026-11" cefr="A2" busy={false}
      overview={{ systemDate: "2026-11-03", monthWindow: { previous: "2026-10", current: "2026-11", next: "2026-12", writable: true }, brief: { month: "2026-11", title: "Customer handover", brief: "Prepare a handover.", context: "Customer success", communicationGoal: "Explain risks", version: 1, status: "approved" }, frameworks: [] }}
      resourceCheckpoint={{ state: "draft_checkpoint", draftOnly: true, publishable: false, retryOnlyMissing: true, generationId: "generation-1", version: 2, briefVersion: 1, updatedAt: "2026-11-04T00:00:00.000Z", failedAttempts, categories: {
        coreTerms: { state: "complete", count: 48, target: 48 }, expandedTerms: { state: "missing", count: 240, target: 432 }, grammarTopics: { state: "missing", count: 0, target: 2 }, pronunciationTargets: { state: "missing", count: 0, target: 4 }
      } }}
      actions={{ onSelectMonth: vi.fn(), onSelectLevel: vi.fn(), onSuggestBrief: vi.fn(), onSaveBrief: vi.fn(), onApproveBrief: vi.fn(), onGenerateFramework, onLoadManualResources, onSaveFramework: vi.fn(), onApproveFramework: vi.fn(), onSaveDay: vi.fn(), onGenerateDay: vi.fn(), onAcknowledge: vi.fn(), onApproveDay: vi.fn(), onCreateCorrection: vi.fn(), onSaveCorrection: vi.fn(), onAcknowledgeCorrection: vi.fn(), onApproveCorrection: vi.fn() }}
    /></ToastProvider>);
  const budgetMessage = "Đã dùng hết 400 lượt gọi AI cho lần này; phần đã làm được đã lưu (240 từ mở rộng). Bấm Tiếp tục để sinh tiếp.";
  const budgetError = (failedAttempts: number) => Object.assign(new Error("MONTHLY_RESOURCE_PLAN_INVALID"), { code: "MONTHLY_RESOURCE_PLAN_INVALID", status: 422, details: { code: "MONTHLY_RESOURCE_PLAN_INVALID", issues: [budgetMessage], progressSaved: true, failedAttempts } });

  it("shows a stopped run that kept progress as a calm info notice, without opening the manual editor", async () => {
    const user = userEvent.setup();
    const onLoadManualResources = vi.fn();
    partialRun(1, vi.fn().mockRejectedValue(budgetError(1)), onLoadManualResources);
    await user.click(screen.getByRole("button", { name: "Tiếp tục nhóm còn thiếu" }));
    const toast = (await screen.findByText(budgetMessage)).closest(".ds-toast");
    expect(toast).toHaveClass("ds-toast--info");
    expect(screen.queryByText(/AI không tạo được đủ tài nguyên/u)).not.toBeInTheDocument();
    expect(screen.queryByText(/có thể soạn tay phần còn thiếu/u)).not.toBeInTheDocument();
    expect(screen.queryByText("Cần thử lại")).not.toBeInTheDocument();
    expect(onLoadManualResources).not.toHaveBeenCalled();
  });

  it("suggests manual completion from the 3rd unfinished run, still in a neutral tone", async () => {
    const user = userEvent.setup();
    partialRun(3, vi.fn().mockRejectedValue(budgetError(3)));
    expect(screen.getByRole("status", { name: "Tiến độ tài nguyên nháp" })).toHaveTextContent("Đã thử 3 lần chưa xong — có thể soạn tay phần còn thiếu.");
    await user.click(screen.getByRole("button", { name: "Tiếp tục nhóm còn thiếu" }));
    const toast = (await screen.findByText(`${budgetMessage} Đã thử 3 lần chưa xong — có thể soạn tay phần còn thiếu.`)).closest(".ds-toast");
    expect(toast).toHaveClass("ds-toast--info");
  });

  it("explains an AI provider rate limit with a warn notice", async () => {
    const user = userEvent.setup();
    partialRun(0, vi.fn().mockRejectedValue(Object.assign(new Error("AI_PROVIDER_RATE_LIMIT"), { code: "AI_PROVIDER_RATE_LIMIT", status: 429, details: { code: "AI_PROVIDER_RATE_LIMIT" } })));
    await user.click(screen.getByRole("button", { name: "Tiếp tục nhóm còn thiếu" }));
    const toast = (await screen.findByText("Nhà cung cấp AI đang giới hạn tốc độ; chưa tốn lượt sinh. Thử lại sau ít phút.")).closest(".ds-toast");
    expect(toast).toHaveClass("ds-toast--warn");
  });

  it("presents four pronunciation targets in the fixed responsive grid", async () => {
    const user = userEvent.setup();
    const { container } = render(<ToastProvider><OperatorMonths
      month="2026-11" todayMonth="2026-11" cefr="A2" busy={false}
      overview={{ systemDate: "2026-11-03", monthWindow: { previous: "2026-10", current: "2026-11", next: "2026-12", writable: true }, brief: { month: "2026-11", title: "Customer handover", brief: "Prepare a handover.", context: "Customer success", communicationGoal: "Explain risks", version: 1, status: "approved" }, frameworks: [{
        id: "framework-a2", cefr: "A2", version: 1, status: "draft", scopeHash: "scope", lessons: [], quality: { severe: [], light: [] }, resources: {
          coreTerms: [], supportTerms: [], grammarTopics: [], sounds: ["i", "e", "æ", "ʌ"].map((ipa, index) => ({ id: `sound-${index + 1}`, label: `Âm ${index + 1}`, ipa: `/${ipa}/`, examples: [{ id: `word-${index + 1}`, word: `term${index + 1}`, ipa: `/${ipa}/` }] }))
        }
      }] }}
      actions={{ onSelectMonth: vi.fn(), onSelectLevel: vi.fn(), onSuggestBrief: vi.fn(), onSaveBrief: vi.fn(), onApproveBrief: vi.fn(), onGenerateFramework: vi.fn(), onSaveFramework: vi.fn(), onApproveFramework: vi.fn(), onSaveDay: vi.fn(), onGenerateDay: vi.fn(), onAcknowledge: vi.fn(), onApproveDay: vi.fn(), onCreateCorrection: vi.fn(), onSaveCorrection: vi.fn(), onAcknowledgeCorrection: vi.fn(), onApproveCorrection: vi.fn() }}
    /></ToastProvider>);

    await user.click(within(container).getByRole("button", { name: /Phát âm/ }));
    const panel = within(container).getByRole("dialog", { name: "Tài nguyên tháng" });
    expect(panel.querySelector(".monthly-resource-pronunciation-grid")).toBeInTheDocument();
    expect(panel.querySelectorAll(".monthly-pronunciation-card")).toHaveLength(4);
    expect(within(panel).getByText("Luyện nhận diện và phát âm /i/")).toBeInTheDocument();
  });

  it("shows grammar as topic, step, learning goal, formula, and examples without N-slot codes", async () => {
    const user = userEvent.setup();
    const { container } = render(<ToastProvider><OperatorMonths
      month="2026-11" todayMonth="2026-11" cefr="A2" busy={false}
      overview={{ systemDate: "2026-11-03", monthWindow: { previous: "2026-10", current: "2026-11", next: "2026-12", writable: true }, brief: { month: "2026-11", title: "Customer handover", brief: "Prepare a handover.", context: "Customer success", communicationGoal: "Explain risks", version: 1, status: "approved" }, frameworks: [{
        id: "framework-a2", cefr: "A2", version: 1, status: "draft", scopeHash: "scope", lessons: [], quality: { severe: [], light: [] }, resources: {
          coreTerms: [], supportTerms: [], sounds: [], grammarTopics: [{ id: "grammar-a", title: "Past simple questions", steps: ["Form questions", "Ask for details", "Clarify a timeline"].map((focus, index) => ({ id: `step-${index + 1}`, focus, formula: "Did + subject + base verb?", usage: "Ask about a completed work event.", examples: [`Did you send update ${index + 1}?`] })) }]
        }
      }] }}
      actions={{ onSelectMonth: vi.fn(), onSelectLevel: vi.fn(), onSuggestBrief: vi.fn(), onSaveBrief: vi.fn(), onApproveBrief: vi.fn(), onGenerateFramework: vi.fn(), onSaveFramework: vi.fn(), onApproveFramework: vi.fn(), onSaveDay: vi.fn(), onGenerateDay: vi.fn(), onAcknowledge: vi.fn(), onApproveDay: vi.fn(), onCreateCorrection: vi.fn(), onSaveCorrection: vi.fn(), onAcknowledgeCorrection: vi.fn(), onApproveCorrection: vi.fn() }}
    /></ToastProvider>);

    await user.click(within(container).getByRole("button", { name: /Ngữ pháp/ }));
    const panel = within(container).getByRole("dialog", { name: "Tài nguyên tháng" });
    expect(within(panel).getByRole("heading", { name: "Past simple questions" })).toBeInTheDocument();
    expect(within(panel).getByText((_content, element) => element?.classList.contains("monthly-grammar-step-number") === true && element.textContent === "Bước 1")).toBeInTheDocument();
    expect(within(panel).getByText("Form questions")).toBeInTheDocument();
    expect(within(panel).getAllByText("Ghi chú cách dùng")).toHaveLength(3);
    expect(within(panel).getAllByText("Did + subject + base verb?")).toHaveLength(3);
    expect(within(panel).getByText("Did you send update 1?")).toBeInTheDocument();
    expect(within(panel).queryByText(/N\d+–N\d+/u)).not.toBeInTheDocument();
  });

  it("uses the compact Sinh action for a review and keeps approved daily lessons view-only", () => {
    const { container } = render(<ToastProvider><OperatorMonths
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
    const reviewCell = Array.from(container.querySelectorAll<HTMLElement>("[role='gridcell']")).find((cell) => cell.getAttribute("aria-label") === "06, Ôn tập")!;
    const generate = within(reviewCell).getByRole("button", { name: "Sinh" });
    const compose = within(reviewCell).getByRole("button", { name: "Soạn tay bài ôn" });
    expect(generate).toHaveClass("monthly-generate-action");
    expect(generate).toHaveTextContent("AI");
    expect(compose).toHaveClass("monthly-manual-action");
    expect(compose).toHaveTextContent("");
  });

  it("uses the saved review slot rather than a weekday convention", () => {
    const { container } = render(<ToastProvider><OperatorMonths
      month="2026-11" todayMonth="2026-11" cefr="A1" busy={false}
      overview={{ systemDate: "2026-11-03", monthWindow: { previous: "2026-10", current: "2026-11", next: "2026-12", writable: true }, brief: { month: "2026-11", title: "Customer handover", brief: "Prepare a handover.", context: "Customer success", communicationGoal: "Explain risks", version: 1, status: "approved" }, frameworks: [{
        id: "framework-a1", cefr: "A1", version: 1, status: "approved", scopeHash: "scope", quality: { severe: [], light: [] }, resources: { coreTerms: [], supportTerms: [], grammarTopics: [], sounds: [] }, lessons: [
          { lessonNumber: 21, lessonDate: "2026-11-03", kind: "review", status: "pending", scopeHash: "scope", locked: false, correctionCount: 0, quality: { severe: [], light: [] } }
        ]
      }] }}
      actions={{ onSelectMonth: vi.fn(), onSelectLevel: vi.fn(), onSuggestBrief: vi.fn(), onSaveBrief: vi.fn(), onApproveBrief: vi.fn(), onGenerateFramework: vi.fn(), onSaveFramework: vi.fn(), onApproveFramework: vi.fn(), onSaveDay: vi.fn(), onGenerateDay: vi.fn(), onGenerateReview: vi.fn(), onAcknowledge: vi.fn(), onApproveDay: vi.fn(), onCreateCorrection: vi.fn(), onSaveCorrection: vi.fn(), onAcknowledgeCorrection: vi.fn(), onApproveCorrection: vi.fn() }}
    /></ToastProvider>);

    const scheduledReview = container.querySelector<HTMLElement>("[role='gridcell'][aria-label='03, Ôn tập']");
    expect(scheduledReview).toHaveClass("review");
    expect(within(scheduledReview!).getByRole("button", { name: "Sinh" })).toBeInTheDocument();
  });

  it("uses the dedicated scheduled review endpoint after the operator confirms generation", async () => {
    const user = userEvent.setup();
    const onGenerateReview = vi.fn().mockResolvedValue({ lesson: { title: "Ôn tập", parts: [] }, report: { severe: [], light: [], contractVersion: 1 } });
    const onGenerateDay = vi.fn();
    const { container } = render(<ToastProvider><OperatorMonths
      month="2026-11"
      todayMonth="2026-11"
      overview={{ systemDate: "2026-11-03", monthWindow: { previous: "2026-10", current: "2026-11", next: "2026-12", writable: true }, brief: { month: "2026-11", title: "Customer handover", brief: "Prepare a handover.", context: "Customer success", communicationGoal: "Explain risks", version: 1, status: "approved" }, frameworks: [{
        id: "framework-a1", cefr: "A1", version: 1, status: "approved", scopeHash: "scope", quality: { severe: [], light: [] }, resources: {
          coreTerms: [{ id: "review-core", word: "review-core", meaning: "từ ôn", type: "noun", ipa: "/r/", source: "core_registry", component: "core", dayNumber: 1 }, { id: "calendar-core", word: "calendar-core", meaning: "từ ngày", type: "noun", ipa: "/k/", source: "core_registry", component: "core", dayNumber: 5 }],
          supportTerms: [{ id: "review-support", word: "review-support", meaning: "mở rộng", type: "noun", relation: "synonym", source: "synonym", component: "expanded", dayNumber: 1, relatedCoreTermId: "review-core" }],
          grammarTopics: [{ id: "topic", title: "Grammar", steps: [{ id: "review-grammar", focus: "review-focus", formula: "review formula", usage: "review", examples: [] }, { id: "calendar-grammar", focus: "calendar-focus", formula: "calendar formula", usage: "calendar", examples: [] }] }],
          sounds: [{ id: "review-sound", ipa: "/r/", label: "Review sound", examples: [] }, { id: "calendar-sound", ipa: "/k/", label: "Calendar sound", examples: [] }],
          roadmap: { allocated: true, grammarSteps: [], sounds: [], days: [{ lessonNumber: 5, date: "2026-11-06", kind: "review", coreTermIds: [], expandedTermIds: [], reviewTermIds: ["review-core"], reviewExpandedTermIds: ["review-support"], reviewGrammarStepIds: ["review-grammar"], reviewSoundIds: ["review-sound"], reviewPronunciationExampleIds: ["re1", "re2", "re3"], skillExercises: [], grammarStepIds: ["calendar-grammar"], soundId: "calendar-sound", pronunciationExampleIds: ["ke1", "ke2", "ke3"] }] }
        }, lessons: [
          { lessonNumber: 5, lessonDate: "2026-11-06", kind: "review", status: "pending", scopeHash: "scope", locked: false, correctionCount: 0, quality: { severe: [], light: [] } }
        ]
      }] }}
      cefr="A1"
      busy={false}
      actions={{ onSelectMonth: vi.fn(), onSelectLevel: vi.fn(), onSuggestBrief: vi.fn(), onSaveBrief: vi.fn(), onApproveBrief: vi.fn(), onGenerateFramework: vi.fn(), onSaveFramework: vi.fn(), onApproveFramework: vi.fn(), onSaveDay: vi.fn(), onGenerateDay, onGenerateReview, onAcknowledge: vi.fn(), onApproveDay: vi.fn(), onCreateCorrection: vi.fn(), onSaveCorrection: vi.fn(), onAcknowledgeCorrection: vi.fn(), onApproveCorrection: vi.fn() }}
    /></ToastProvider>);

    const reviewCell = Array.from(container.querySelectorAll<HTMLElement>("[role='gridcell']")).find((cell) => cell.getAttribute("aria-label") === "06, Ôn tập")!;
    await user.click(within(reviewCell).getByRole("button", { name: "Sinh" }));
    const dialog = screen.getByRole("dialog", { name: "Tài nguyên cho bài ôn" });
    expect(dialog).toBeInTheDocument();
    expect(within(dialog).getByText("review-core · review-support")).toBeInTheDocument();
    expect(within(dialog).getByText("review-focus")).toBeInTheDocument();
    expect(within(dialog).getByText("Review sound /r/")).toBeInTheDocument();
    expect(within(dialog).queryByText("calendar-core")).not.toBeInTheDocument();
    expect(within(dialog).queryByText("calendar-focus")).not.toBeInTheDocument();
    expect(within(dialog).queryByText("Calendar sound /k/")).not.toBeInTheDocument();
    await user.click(within(dialog).getByRole("button", { name: "Sinh" }));

    expect(onGenerateReview).toHaveBeenCalledWith("framework-a1", 5);
    expect(onGenerateDay).not.toHaveBeenCalled();
  });

  it("keeps an approved day calendar cell limited to View", () => {
    const onViewDay = vi.fn();
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
      actions={{ onSelectMonth: vi.fn(), onSelectLevel: vi.fn(), onSuggestBrief: vi.fn(), onSaveBrief: vi.fn(), onApproveBrief: vi.fn(), onGenerateFramework: vi.fn(), onSaveFramework: vi.fn(), onApproveFramework: vi.fn(), onSaveDay: vi.fn(), onGenerateDay: vi.fn(), onAcknowledge: vi.fn(), onApproveDay: vi.fn(), onCreateCorrection: vi.fn(), onSaveCorrection: vi.fn(), onAcknowledgeCorrection: vi.fn(), onApproveCorrection: vi.fn(), onViewDay }}
    /></ToastProvider>);

    const approvedCell = Array.from(container.querySelectorAll<HTMLElement>("[role='gridcell']")).find((cell) => cell.classList.contains("approved") && cell.getAttribute("aria-label") === "02, Bài 1")!;
    expect(within(approvedCell).queryByRole("button", { name: "Soạn tay bài 1" })).not.toBeInTheDocument();
    expect(within(approvedCell).getByRole("button", { name: "Xem bài 1" })).toBeInTheDocument();
    expect(within(approvedCell).queryByRole("button", { name: "Yêu cầu mở lại bài 1" })).not.toBeInTheDocument();
  });

  const monthActions = (extra: Record<string, unknown>) => ({ onSelectMonth: vi.fn(), onSelectLevel: vi.fn(), onSuggestBrief: vi.fn(), onSaveBrief: vi.fn(), onApproveBrief: vi.fn(), onGenerateFramework: vi.fn(), onSaveFramework: vi.fn(), onApproveFramework: vi.fn(), onSaveDay: vi.fn(), onGenerateDay: vi.fn(), onAcknowledge: vi.fn(), onApproveDay: vi.fn(), onCreateCorrection: vi.fn(), onSaveCorrection: vi.fn(), onAcknowledgeCorrection: vi.fn(), onApproveCorrection: vi.fn(), ...extra });
  const approvedFramework = { id: "framework-b1", cefr: "B1" as const, version: 2, status: "approved" as const, scopeHash: "monthly-abc", lessons: [], quality: { severe: [], light: [] }, resources: { coreTerms: [], supportTerms: [], grammarTopics: [], sounds: [] } };
  const monthWindow = { previous: "2026-10", current: "2026-11", next: "2026-12", writable: true };

  it.each([
    { ready: false, publishedOn: null, readOnly: false, detail: "Còn 20 bài cần duyệt" },
    { ready: true, publishedOn: null, readOnly: false, detail: "Công bố tháng" },
    { ready: true, publishedOn: null, readOnly: true, detail: "Sẵn sàng công bố" },
    { ready: true, publishedOn: "2026-11-03", readOnly: false, detail: "Đã công bố 2026-11-03" }
  ])("shows only the relevant publication detail or action ($detail)", ({ ready, publishedOn, readOnly, detail }) => {
    render(<ToastProvider><OperatorMonths month="2026-11" todayMonth="2026-11" cefr="B1" busy={false} readOnly={readOnly}
      overview={{ systemDate: "2026-11-03", monthWindow, brief: { month: "2026-11", title: "Updates", brief: "Project updates", context: "Office", communicationGoal: "Report", version: 1, status: "approved" }, frameworks: [{ ...approvedFramework, publication: { ready, publishedOn } }] }}
      actions={monthActions({ onPreviewPublication: vi.fn(), onPublishMonth: vi.fn() }) as never} /></ToastProvider>);
    expect(screen.queryByRole("note", { name: "Chế độ chỉ đọc của Quản lý" })).not.toBeInTheDocument();
    const card = within(screen.getByRole("region", { name: "Tiến độ công bố B1" }));
    expect(card.getByText(detail, { exact: true })).toBeInTheDocument();
    expect(card.queryByText(/Bài ngày|Bài ôn|Đề thi|Chờ công bố/)).not.toBeInTheDocument();
    if (!ready) expect(card.getByRole("link")).toHaveAttribute("href", `#monthly-day-${buildMonthlyCalendar("2026-11").effectiveDays[0]}`);
    if (ready && !readOnly && !publishedOn) expect(card.getByRole("button", { name: "Công bố tháng" })).toBeEnabled();
    else expect(card.queryByRole("button")).not.toBeInTheDocument();
  });

  describe("calendar cell ids and manual-compose titles", () => {
    const calendar = buildMonthlyCalendar("2026-11");
    const firstReview = calendar.effectiveDays.findIndex((_date, index) => monthlyDayKind(index + 1, calendar) === "review") + 1;
    const afterReview = firstReview + 1;
    const renderCalendar = (onComposeDay = vi.fn()) => {
      const overviewCalendar = calendar.effectiveDays.map((date, index) => ({ date, kind: monthlyDayKind(index + 1, calendar), lessonNumber: index + 1, ...(monthlyDayKind(index + 1, calendar) === "review" ? { reviewWeekNumber: 1 } : {}) }));
      const view = render(<ToastProvider><OperatorMonths month="2026-11" todayMonth="2026-11" cefr="B1" busy={false}
        overview={{ systemDate: "2026-11-03", monthWindow, brief: { month: "2026-11", title: "Updates", brief: "Project updates", context: "Office", communicationGoal: "Report", version: 1, status: "approved" }, calendar: overviewCalendar, frameworks: [{ ...approvedFramework, publication: { ready: false, publishedOn: null } }] } as never}
        actions={monthActions({ onComposeDay }) as never} /></ToastProvider>);
      return { ...view, onComposeDay };
    };

    it("gives every day cell a unique id based on its date", () => {
      const { container } = renderCalendar();
      const ids = Array.from(container.querySelectorAll<HTMLElement>("[id^='monthly-day-']")).map((cell) => cell.id);
      expect(ids.length).toBeGreaterThan(0);
      expect(new Set(ids).size).toBe(ids.length);
      expect(ids).toContain(`monthly-day-${calendar.effectiveDays[0]}`);
      expect(ids.every((id) => /^monthly-day-2026-11-[0-3][0-9]$/.test(id))).toBe(true);
    });

    it("passes the calendar's new-lesson ordinal and review label as the editor title", async () => {
      const user = userEvent.setup();
      const { container, onComposeDay } = renderCalendar();
      const ordinal = monthlyNewLessonOrdinal(afterReview, calendar)!;
      expect(ordinal).toBeLessThan(afterReview);
      const newCell = container.querySelector<HTMLElement>(`#monthly-day-${calendar.effectiveDays[afterReview - 1]}`)!;
      await user.click(within(newCell).getByRole("button", { name: `Soạn tay bài ${ordinal}` }));
      expect(onComposeDay).toHaveBeenLastCalledWith("framework-b1", afterReview, { kind: "new", date: calendar.effectiveDays[afterReview - 1], title: `Bài ${ordinal}` });
      const reviewCell = container.querySelector<HTMLElement>(`#monthly-day-${calendar.effectiveDays[firstReview - 1]}`)!;
      await user.click(within(reviewCell).getByRole("button", { name: "Soạn tay bài ôn" }));
      expect(onComposeDay).toHaveBeenLastCalledWith("framework-b1", firstReview, { kind: "review", date: calendar.effectiveDays[firstReview - 1], title: "Bài ôn tuần 1" });
    });
  });

  it.each(["new", "review"] as const)("shows a spinner and blocks duplicate %s generation until the request settles", async (kind) => {
    const user = userEvent.setup();
    let finish!: (value: any) => void;
    const generate = vi.fn(() => new Promise<any>(resolve => { finish = resolve; }));
    render(<ToastProvider><OperatorMonths month="2026-11" todayMonth="2026-11" cefr="B1" busy={false}
      overview={{ systemDate: "2026-11-03", monthWindow, brief: null, frameworks: [approvedFramework] }}
      actions={monthActions({ onGenerateDay: generate, onGenerateReview: generate }) as never} /></ToastProvider>);
    await user.click(screen.getAllByRole("button", { name: kind === "review" ? "Sinh" : "Sinh bài 1" })[0]!);
    const dialog = screen.getByRole("dialog");
    await user.click(within(dialog).getByRole("button", { name: "Sinh" }));
    const pending = within(dialog).getByRole("button", { name: "Đang sinh bài" });
    expect(pending).toBeDisabled();
    expect(pending).toHaveAttribute("aria-busy", "true");
    expect(within(pending).getByRole("status")).toHaveClass("spinner");
    await user.click(pending);
    expect(generate).toHaveBeenCalledTimes(1);
    await act(async () => finish({ lesson: { title: "Bài", parts: [] }, report: { severe: [], light: [], contractVersion: 2 } }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("confirms exam regeneration inside the app and shows progress on the exam button", async () => {
    const user = userEvent.setup();
    const browserConfirm = vi.spyOn(window, "confirm");
    let finish!: (value: any) => void;
    const generate = vi.fn(() => new Promise<any>(resolve => { finish = resolve; }));
    render(<ToastProvider><OperatorMonths month="2026-11" todayMonth="2026-11" cefr="B1" busy={false}
      overview={{ systemDate: "2026-11-03", monthWindow, brief: null, frameworks: [approvedFramework] }}
      actions={monthActions({ onGenerateMonthlyFinal: generate, onOpenMonthlyFinal: vi.fn(), onPeekMonthlyFinal: vi.fn().mockResolvedValue(true) }) as never} /></ToastProvider>);
    const button = await screen.findByRole("button", { name: "Sinh lại đề thi tháng" });
    await user.click(button);
    const dialog = screen.getByRole("dialog", { name: "Sinh lại đề thi tháng?" });
    expect(generate).not.toHaveBeenCalled();
    await user.click(within(dialog).getByRole("button", { name: "Quay lại" }));
    expect(generate).not.toHaveBeenCalled();
    await user.click(button);
    await user.click(within(screen.getByRole("dialog", { name: "Sinh lại đề thi tháng?" })).getByRole("button", { name: "Sinh lại" }));
    await waitFor(() => expect(button).toBeDisabled());
    expect(button).toHaveAttribute("aria-busy", "true");
    expect(within(button).getByRole("status", { name: "Đang sinh đề thi tháng" })).toHaveClass("spinner");
    expect(browserConfirm).not.toHaveBeenCalled();
    await act(async () => finish(monthlyFinalView()));
    browserConfirm.mockRestore();
  });

  it("opens exam generation as soon as the plan is approved, well before the exam date", async () => {
    const user = userEvent.setup();
    const onGenerateMonthlyFinal = vi.fn().mockResolvedValue(monthlyFinalView());
    const onComposeMonthlyFinal = vi.fn().mockResolvedValue(monthlyFinalView());
    render(<ToastProvider><OperatorMonths month="2026-11" todayMonth="2026-11" cefr="B1" busy={false}
      overview={{ systemDate: "2026-11-03", monthWindow, brief: null, frameworks: [approvedFramework] }}
      actions={monthActions({ onGenerateMonthlyFinal, onComposeMonthlyFinal }) as never}
    /></ToastProvider>);
    expect(screen.getAllByRole("button", { name: "Sinh đề thi tháng" }).at(-1)).toBeEnabled();
    await user.click(screen.getAllByRole("button", { name: "Soạn tay đề thi tháng" }).at(-1)!);
    expect(onComposeMonthlyFinal).toHaveBeenCalledWith("framework-b1");
    expect((await screen.findAllByRole("dialog", { name: "Bản nháp đề thi tháng" })).length).toBeGreaterThan(0);
  });

  it("keeps the exam AI button closed until the monthly plan is approved", () => {
    render(<ToastProvider><OperatorMonths month="2026-11" todayMonth="2026-11" cefr="B1" busy={false}
      overview={{ systemDate: "2026-11-03", monthWindow, brief: null, frameworks: [{ ...approvedFramework, status: "draft" }] }}
      actions={monthActions({ onGenerateMonthlyFinal: vi.fn() }) as never}
    /></ToastProvider>);
    expect(screen.getAllByRole("button", { name: "Sinh đề thi tháng" }).at(-1)).toBeDisabled();
  });

  it("locks generation and manual composition from 00:00 of the exam date but still lets the Operator view the exam", async () => {
    const user = userEvent.setup();
    const onOpenMonthlyFinal = vi.fn().mockResolvedValue(monthlyFinalView({ editable: false }));
    const onPeekMonthlyFinal = vi.fn().mockResolvedValue(true);
    render(<ToastProvider><OperatorMonths month="2026-11" todayMonth="2026-11" cefr="B1" busy={false}
      overview={{ systemDate: "2026-11-30", monthWindow, brief: null, frameworks: [approvedFramework] }}
      actions={monthActions({ onGenerateMonthlyFinal: vi.fn(), onComposeMonthlyFinal: vi.fn(), onOpenMonthlyFinal, onPeekMonthlyFinal }) as never}
    /></ToastProvider>);
    expect(screen.getAllByRole("button", { name: "Sinh đề thi tháng" }).at(-1)).toBeDisabled();
    expect(screen.getAllByRole("button", { name: "Soạn tay đề thi tháng" }).at(-1)).toBeDisabled();
    await user.click((await screen.findAllByRole("button", { name: "Xem đề thi tháng" })).at(-1)!);
    expect(screen.getAllByRole("button", { name: "Sinh lại đề thi tháng" }).at(-1)).toBeDisabled();
    expect(onOpenMonthlyFinal).toHaveBeenCalledWith("framework-b1");
    expect((await screen.findAllByText(/Đã quá 00:00 ngày thi/u)).length).toBeGreaterThan(0);
  });

  it("generates with AI, reviews in the shared level editor and saves the edit with the review fields", async () => {
    const user = userEvent.setup();
    const onGenerateMonthlyFinal = vi.fn().mockResolvedValue(monthlyFinalView());
    const onSaveMonthlyFinal = vi.fn().mockResolvedValue(monthlyFinalView());
    render(<ToastProvider><OperatorMonths month="2026-11" todayMonth="2026-11" cefr="B1" busy={false}
      overview={{ systemDate: "2026-11-20", monthWindow, brief: { month: "2026-11", title: "Updates", brief: "Project updates", context: "Office", communicationGoal: "Report", version: 1, status: "approved" }, frameworks: [approvedFramework] }}
      actions={monthActions({ onGenerateMonthlyFinal, onSaveMonthlyFinal, onPublishMonthlyFinal: vi.fn() }) as never}
    /></ToastProvider>);
    await user.click(screen.getAllByRole("button", { name: "Sinh đề thi tháng" }).at(-1)!);
    expect(onGenerateMonthlyFinal).toHaveBeenCalledWith("framework-b1");
    expect((await screen.findAllByRole("dialog", { name: "Bản nháp đề thi tháng" })).length).toBeGreaterThan(0);
    expect(screen.getAllByTestId("monthly-final-status").at(-1)).toHaveTextContent("Chờ rà soát");
    expect(screen.getAllByRole("button", { name: "Duyệt & phát hành" }).at(-1)).toBeDisabled();
    const prompt = screen.getAllByRole("textbox", { name: "Nội dung L01" }).at(-1)!;
    await user.clear(prompt);
    await user.type(prompt, "What does Anna say is ready?");
    await user.click(screen.getAllByRole("button", { name: "Lưu bản nháp" }).at(-1)!);
    expect(onSaveMonthlyFinal).toHaveBeenCalledWith("final-v1", expect.objectContaining({
      review: expect.objectContaining({ audioReviewed: false, manualConfirmations: [] }),
      sections: expect.arrayContaining([expect.objectContaining({ code: "listening", groups: expect.arrayContaining([expect.objectContaining({ tasks: expect.arrayContaining([expect.objectContaining({ key: "L01", prompt: "What does Anna say is ready?" })]) })]) })])
    }));
    expect(screen.getAllByRole("dialog", { name: "Bản nháp đề thi tháng" }).length).toBeGreaterThan(0);
  });

});



