import { withoutGrammarStepLabel } from "../shared/lesson/presentation.js";
import { useEffect, useMemo, useRef, useState } from "react";
import { Check, ChevronLeft, ChevronRight, Eye, MessageSquareWarning, Pencil, Sparkles } from "lucide-react";
import type { CefrLevel, MonthlyResourceEditInput, MonthlyFinalDraftView, MonthlyFinalUpdateInput, MonthlyOperatorOverviewView, MonthlyQualityFindingView } from "@e4s/contracts";
import { buildMonthlyCalendar, monthlyDayKind, monthlyNewLessonOrdinal, recommendedMonthlyResourceCriteria, formatMonthlyDayLabel, monthlyLessonDisplayTitle, withMonthlyExpandedTerms, withMonthlyGrammarSteps, type MonthlyCurriculumContract } from "@e4s/domain/monthly";
import { useToast } from "../shared/design-system.js";
import { useDialog, useModal } from "../shared/ModalProvider.js";
import { useMediaQuery } from "../shared/useMediaQuery.js";
import { useManagerSectionHeader } from "../manager/shared.js";
import { Badge, Button, OperatorPage, PageTitle } from "./primitives.js";
import { OperatorLessonPreview, OperatorPracticeReview } from "./adapters.js";
import type { MonthlyResourceCheckpointView } from "../../api/operator.js";
import { groupVocabularyForDisplay, isStandaloneWord } from "./resource-display.js";
import { MonthlyFinalReview } from "./MonthlyFinalReview.js";
import { MonthlyResourceProgress } from "./MonthlyResourceProgress.js";
import { isGatewayTimeout, monthlyGenerationMessage, monthlyFinalGenerationMessage } from "./monthly-generation-message.js";
import { MonthlyResourceEditor } from "./MonthlyResourceEditor.js";
import { MonthlyReviewPractice } from "./MonthlyReviewPractice.js";
import { describeMonthlyFindings, MONTHLY_PART_TITLES } from "./monthly-failure-findings.js";
import { MonthlyFindingsPanel } from "./MonthlyFindingsPanel.js";
import { MonthlyIllustrationPanel } from "./MonthlyIllustrationPanel.js";
import type { MonthlyIllustrationsView } from "../../api/operator.js";
import "./months.css";

type MonthlyBriefInput = { title: string; brief: string; context: string; communicationGoal: string };
type MonthlyDayInput = { title: string; parts: Array<{ code: string; title?: string; content: Record<string, unknown> }> };
type MonthlyQualityReport = { severe: MonthlyQualityFindingView[]; light: MonthlyQualityFindingView[]; contractVersion: number };
type MonthlyResourceCriteria = { cefr: CefrLevel; vocabularyCount: number; expandedVocabularyCount: number; grammarTopicCount: number; pronunciationSoundCount: number };
type ResourceGroup = "core" | "expanded" | "grammar" | "sounds" | "plan" | "images";

export interface OperatorMonthsActions {
  /** Core-word illustrations (draft: generate/upload; approved: frozen, read-only). */
  onLoadIllustrations?(id: string): Promise<MonthlyIllustrationsView>;
  onGenerateIllustrations?(id: string, input: { words?: string[]; hint?: string }): Promise<unknown>;
  onUploadIllustration?(id: string, word: string, file: File): Promise<unknown>;
  onRemoveIllustration?(id: string, word: string): Promise<unknown>;
  onSelectMonth(month: string): void;
  onSelectLevel(level: CefrLevel): void;
  onSuggestBrief(month: string): Promise<MonthlyBriefInput>;
  onSaveBrief(month: string, input: MonthlyBriefInput): Promise<void> | void;
  onApproveBrief(month: string): Promise<void> | void;
  onGenerateFramework(month: string, criteria: MonthlyResourceCriteria): Promise<unknown> | void;
  onSaveFramework(month: string, contract: MonthlyCurriculumContract): Promise<void> | void;
  onApproveFramework(id: string): Promise<void> | void;
  onPreviewPublication?(id: string): Promise<import("@e4s/contracts").MonthlyPublicationPreviewView>;
  onPublishMonth?(id: string, confirmedOn: string): Promise<void>;
  /** Saves a hand-edited DRAFT resource pool (VH-R30/VH-R35); rejects with per-row `details.issues`. */
  onSaveResources?(id: string, input: MonthlyResourceEditInput): Promise<void>;
  onLoadManualResources?(month: string, cefr: CefrLevel): Promise<NonNullable<MonthlyOperatorOverviewView["frameworks"][number]["resources"]> & { theme: { version: number } }>;
  onCreateManualResources?(month: string, cefr: CefrLevel, input: MonthlyResourceEditInput): Promise<void>;
  /** Asks a Manager to reopen this level's approved monthly resources. */
  onRequestResourcesReopen?(id: string, reason: string): Promise<void> | void;
  onGenerateMonthlyFinal?(id: string): Promise<MonthlyFinalDraftView> | void;
  onComposeMonthlyFinal?(id: string): Promise<MonthlyFinalDraftView> | void;
  /** Opens the current draft or published monthly final for review. */
  onOpenMonthlyFinal?(id: string): Promise<MonthlyFinalDraftView> | void;
  /** Quietly reports whether a monthly final draft or published form exists (no toast, no reload). */
  onPeekMonthlyFinal?(id: string): Promise<boolean>;
  onSaveMonthlyFinal?(versionId: string, input: MonthlyFinalUpdateInput): Promise<MonthlyFinalDraftView | void> | void;
  onPublishMonthlyFinal?(versionId: string): Promise<unknown> | void;
  onSynthesizeMonthlyFinalAudio?(input: { text: string; voice: string }): Promise<{ filename: string; mimeType: string; base64: string }>;
  onUploadMonthlyFinalAudio?(file: Blob, filename: string): Promise<{ url: string }>;
  /** `slot` is what the calendar cell shows, so old plans without a day allocation still open the right editor. */
  onComposeDay?(id: string, dayNumber: number, slot?: { kind: "new" | "review"; date?: string | undefined; title?: string | undefined }): void;
  onViewDay?(id: string, dayNumber: number): void;
  onSaveDay(id: string, dayNumber: number, lesson: MonthlyDayInput): Promise<MonthlyQualityReport>;
  onGenerateDay(id: string, dayNumber: number): Promise<{ lesson: MonthlyDayInput; report: MonthlyQualityReport }>;
  /** Friday reviews use their own endpoint so the server can validate the weekly scope. */
  onGenerateReview?(id: string, dayNumber: number): Promise<{ lesson: MonthlyDayInput; report: MonthlyQualityReport }>;
  onAcknowledge(id: string, dayNumber: number, findingKeys: string[]): Promise<void> | void;
  onApproveDay(id: string, dayNumber: number): Promise<void> | void;
  onCreateCorrection(id: string, dayNumber: number, reason: string): Promise<string>;
  onSaveCorrection(id: string, dayNumber: number, correctionId: string, lesson: MonthlyDayInput): Promise<MonthlyQualityReport>;
  onAcknowledgeCorrection(correctionId: string, findingKeys: string[]): Promise<void> | void;
  onApproveCorrection(correctionId: string): Promise<void> | void;
}
export interface OperatorMonthsProps { month: string; todayMonth: string; overview: MonthlyOperatorOverviewView; cefr: CefrLevel; busy: boolean; readOnly?: boolean; error?: string; resourceCheckpoint?: MonthlyResourceCheckpointView; actions: OperatorMonthsActions; }

const LEVELS: CefrLevel[] = ["A1", "A2", "B1", "B2", "C1"];
const WEEKDAYS = ["T2", "T3", "T4", "T5", "T6", "T7", "CN"];
/** DOM id of a calendar day cell; unique per date (lesson numbers can repeat while a plan is rebuilt). */
export function monthlyDayCellId(date: string): string { return `monthly-day-${date}`; }
const emptyBrief = (): MonthlyBriefInput => ({ title: "", brief: "", context: "", communicationGoal: "" });
function shiftMonth(month: string, offset: number) {
  const [year, index] = month.split("-").map(Number) as [number, number];
  const date = new Date(Date.UTC(year, index - 1 + offset, 1));
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
}
function monthLabel(month: string) {
  const [year, index] = month.split("-").map(Number) as [number, number];
  return new Intl.DateTimeFormat("vi-VN", { month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(Date.UTC(year, index - 1, 1)));
}
function frameworkStatus(status?: string) {
  if (status === "approved") return "Đã chốt";
  if (status === "draft") return "Chờ chốt";
  return "Chưa tạo";
}

/** Relation groups shown for each core in the allocation view, in display order. */
const PLAN_RELATION_LABELS = [["umbrella", "Từ bao trùm"], ["synonym", "Đồng nghĩa"], ["antonym", "Trái nghĩa"], ["word_family", "Cùng họ từ"], ["collocation", "Cụm từ đi kèm"]] as const;
/** L-042: optional B1–C1 register alternatives stored on each core (shown with the expanded terms). */
const REGISTER_LABELS = [["slang", "Khẩu ngữ"], ["poetic", "Văn phong"]] as const;

export function OperatorMonths({ month, todayMonth, overview, cefr, busy: externalBusy, readOnly = false, error, resourceCheckpoint, actions }: OperatorMonthsProps) {
  const toast = useToast();
  const modal = useModal();
  const hasSectionHeader = useManagerSectionHeader();
  const [generating, setGenerating] = useState<number | "final">();
  const generationInFlight = useRef(false);
  const [resourceGenerating,setResourceGenerating] = useState(false);
  const [resourceGenerationAttempted,setResourceGenerationAttempted] = useState(false);
  const [resourceGenerationFailed,setResourceGenerationFailed] = useState(false);
  useEffect(()=>{setResourceGenerationAttempted(false);setResourceGenerationFailed(false);},[month,cefr]);
  const resourceGenerationInFlight = useRef(false);
  const observedResourceRunId = useRef<string | undefined>(undefined);
  useEffect(()=>{
    const progress=resourceCheckpoint?.progress;
    if(progress?.status === "running") observedResourceRunId.current=progress.runId;
    if(progress?.status === "completed" && observedResourceRunId.current === progress.runId) setResourceGenerationFailed(false);
  },[resourceCheckpoint?.progress?.runId,resourceCheckpoint?.progress?.status]);
  const resourceRunning = resourceGenerating || resourceCheckpoint?.progress?.status === "running";
  const busy = externalBusy || generating !== undefined || resourceRunning;
  const framework = overview.frameworks.find((item) => item.cefr === cefr);
  const calendar = useMemo(() => buildMonthlyCalendar(month), [month]);
  const calendarCells = useMemo(() => calendarGrid(month, calendar), [month, calendar]);
  const compact = useMediaQuery("(max-width: 960px)");
  const narrowViewport = useMediaQuery("(max-width: 820px)");
  const calendarRef = useRef<HTMLElement>(null);
  const [narrowCalendar, setNarrowCalendar] = useState(false);
  const agenda = narrowViewport || narrowCalendar;
  const [briefEditorMonth, setBriefEditorMonth] = useState<string>();
  const [agendaSelection, setAgendaSelection] = useState<{ month: string; week: number }>();
  const todayCell = calendarCells.findIndex((cell) => cell.date === overview.systemDate);
  const agendaWeek = agendaSelection?.month === month ? agendaSelection.week : Math.floor(Math.max(0, todayCell) / 7);
  const agendaDates = calendarCells.slice(agendaWeek * 7, agendaWeek * 7 + 7).filter((cell) => !cell.outside);
  const [brief, setBrief] = useState<MonthlyBriefInput>(emptyBrief);
  const [resourcePanel, setResourcePanel] = useState<ResourceGroup | null>(null);
  const [generationConfirmation, setGenerationConfirmation] = useState<{ dayNumber: number; kind: "new" | "review" }>();
  const [monthlyFinal, setMonthlyFinal] = useState<MonthlyFinalDraftView | null>(null);
  const [requestingResourcesReopen, setRequestingResourcesReopen] = useState(false);
  const [editingResources, setEditingResources] = useState(false);
  const [manualResources, setManualResources] = useState<Awaited<ReturnType<NonNullable<OperatorMonthsActions["onLoadManualResources"]>>>>();
  const [openingManualResources, setOpeningManualResources] = useState(false);
  const [monthlyFinalExists, setMonthlyFinalExists] = useState(false);
  const [illustrations, setIllustrations] = useState<MonthlyIllustrationsView | null>(null);
  const autoStartedIllustrations = useRef<string | null>(null);
  const briefLocked = overview.brief?.status === "approved";
  const monthChoices = [overview.monthWindow.previous, overview.monthWindow.current, overview.monthWindow.next];
  const previousMonth = month === monthChoices[0];
  const canEdit = !readOnly && overview.monthWindow.writable && !previousMonth;
  // Daily lessons can only be generated or composed from approved (locked) resources.
  const resourcesApproved = framework?.status === "approved";
  useEffect(() => {
    const section = calendarRef.current;
    if (!section || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(([entry]) => {
      if (entry) setNarrowCalendar(entry.contentRect.width < 620);
    });
    observer.observe(section);
    return () => observer.disconnect();
  }, [compact, resourcesApproved]);
  const publication = framework?.publication;
  const plannedDays = framework?.resources?.roadmap?.days ?? [];
  const pendingDayNumbers = (plannedDays.length ? plannedDays.map(day => day.lessonNumber) : calendar.effectiveDays.map((_, index) => index + 1))
    .filter(number => !framework?.lessons.some(day => day.lessonNumber === number && day.status === "approved"));
  // Calendar cells are identified by date: a lesson number can repeat across weeks while a plan is being rebuilt.
  const pendingLesson = framework?.lessons.find((item) => item.lessonNumber === pendingDayNumbers[0]);
  const pendingCellIndex = pendingDayNumbers.length ? calendarCells.findIndex((cell) => !cell.outside && (pendingLesson ? cell.date === pendingLesson.lessonDate : cell.lessonNumber === pendingDayNumbers[0])) : -1;
  const pendingTargetId = pendingCellIndex >= 0 ? monthlyDayCellId(calendarCells[pendingCellIndex]!.key) : undefined;
  const lockedDayTitle = "Chốt tài nguyên tháng trước khi sinh bài";
  const proposedResourceCounts = toResourceCounts(recommendedMonthlyResourceCriteria(month, cefr));
  const resourceCounts = framework?.resources ? {
    core: framework.resources.coreTerms.length,
    expanded: framework.resources.supportTerms.length,
    grammar: framework.resources.grammarTopics.length,
    sounds: framework.resources.sounds.length
  } : proposedResourceCounts;
  const resources = [
    { key: "core" as const, label: "Từ cốt lõi", count: framework?.resources?.coreTerms.length ?? 0, description: "Headword trọng tâm" },
    // Slang / formal alternatives (B1–C1) are listed and numbered inside the expanded panel, so the card counts them too.
    { key: "expanded" as const, label: "Từ mở rộng", count: (framework?.resources?.supportTerms.length ?? 0) + (framework?.resources?.coreTerms ?? []).reduce((total, core) => total + (core.registerTerms?.length ?? 0), 0), description: "3–9 từ mỗi từ cốt lõi" },
    { key: "grammar" as const, label: "Ngữ pháp", count: framework?.resources?.grammarTopics.length ?? 0, description: "Điểm ngữ pháp cần dùng" },
    { key: "sounds" as const, label: "Phát âm", count: framework?.resources?.sounds.length ?? 0, description: "Âm và ví dụ thực hành" },
    ...(illustrations ? [{ key: "images" as const, label: "Ảnh minh họa", count: illustrations.images.filter((image) => image.status === "ready").length, description: `/${illustrations.images.length} từ có ảnh` }] : [])
  ];
  const frameworkIdForExam = framework?.status === "approved" ? framework.id : undefined;
  useEffect(() => {
    setMonthlyFinalExists(false);
    if (!frameworkIdForExam || !actions.onPeekMonthlyFinal) return;
    let active = true;
    void actions.onPeekMonthlyFinal(frameworkIdForExam).then((exists) => { if (active) setMonthlyFinalExists(exists); }).catch(() => undefined);
    return () => { active = false; };
  }, [frameworkIdForExam]);
  useEffect(() => {
    setBrief(overview.brief ? {
      title: overview.brief.title,
      brief: overview.brief.brief,
      context: overview.brief.context,
      communicationGoal: overview.brief.communicationGoal
    } : emptyBrief());
  }, [overview.brief]);
  const showUnavailable = (message: string) => toast.show({ message, tone: "danger" });
  const openManualResources = async () => {
    if (!canEdit || !briefLocked) return;
    if (framework?.status === "draft" && framework.resources && actions.onSaveResources) {
      setEditingResources(true);
      return;
    }
    if (framework || !actions.onLoadManualResources || openingManualResources) return;
    setOpeningManualResources(true);
    try {
      setManualResources(await actions.onLoadManualResources(month, cefr));
    } catch {
      showUnavailable("Không mở được bảng soạn tay. Hãy tải lại tài nguyên tháng.");
    } finally { setOpeningManualResources(false); }
  };
  const publishMonth = async () => {
    if (!framework || !publication?.ready || !canEdit || !actions.onPreviewPublication || !actions.onPublishMonth) return;
    try {
      const preview = await actions.onPreviewPublication(framework.id);
      const impact = preview.waitingNextMonth
        ? `${preview.waitingNextMonth} học viên ${cefr} sẽ bắt đầu từ ${preview.nextMonth} vì còn dưới 75% số ngày học.`
        : `${preview.affectedLearners} học viên ${cefr} chịu ảnh hưởng bởi ngày công bố.`;
      const confirmed = await modal.confirm({ title: `Công bố tháng ${month} · ${cefr}?`, message: `Học viên sẽ thấy bài theo lịch. ${impact}`, confirmLabel: "Công bố tháng" });
      if (confirmed) await actions.onPublishMonth(framework.id, preview.publishOn);
    } catch (error) {
      showUnavailable(error instanceof Error ? error.message : "Không công bố được tháng.");
    }
  };
  const illustrationFrameworkId = framework?.resources ? framework.id : undefined;
  const illustrationKey = framework?.resources ? `${framework.id}:${framework.version}:${framework.status}` : undefined;
  const loadIllustrations = async () => {
    if (!illustrationFrameworkId || !actions.onLoadIllustrations) return null;
    try { const next = await actions.onLoadIllustrations(illustrationFrameworkId); setIllustrations(next); return next; } catch { return null; }
  };
  useEffect(() => {
    setIllustrations(null);
    if (!illustrationKey) return;
    void loadIllustrations();
  }, [illustrationKey]);
  const illustrationsWorking = Boolean(illustrations && (illustrations.running || illustrations.images.some((image) => image.status === "pending" || image.status === "generating")));
  useEffect(() => {
    if (!illustrationsWorking) return;
    const timer = window.setInterval(() => void loadIllustrations(), 4_000);
    return () => window.clearInterval(timer);
  }, [illustrationsWorking, illustrationFrameworkId]);
  // A fresh draft pool starts its illustrations automatically, once per framework version.
  useEffect(() => {
    if (!illustrations || !illustrationKey || !framework || framework.status !== "draft" || !canEdit || !actions.onGenerateIllustrations) return;
    if (!illustrations.available || illustrations.running || autoStartedIllustrations.current === illustrationKey) return;
    if (!illustrations.images.length || !illustrations.images.every((image) => image.status === "missing")) return;
    autoStartedIllustrations.current = illustrationKey;
    void actions.onGenerateIllustrations(framework.id, {}).then(() => loadIllustrations()).catch(() => undefined);
  }, [illustrations, illustrationKey]);
  const generateIllustrations = async (input: { words?: string[]; hint?: string }) => {
    if (!framework || !actions.onGenerateIllustrations) return;
    try { await actions.onGenerateIllustrations(framework.id, input); await loadIllustrations(); }
    catch { showUnavailable("Không bắt đầu sinh ảnh được. Hãy thử lại."); }
  };
  const uploadIllustration = async (word: string, file: File) => {
    if (!framework || !actions.onUploadIllustration) return;
    try { await actions.onUploadIllustration(framework.id, word, file); await loadIllustrations(); toast.show({ message: `Đã thay ảnh cho “${word}”.`, tone: "ok" }); }
    catch { showUnavailable("Không tải ảnh lên được."); }
  };
  const removeIllustration = async (word: string) => {
    if (!framework || !actions.onRemoveIllustration) return;
    if (!await modal.confirm({ title: `Xóa ảnh của “${word}”?`, message: "Từ này sẽ chỉ hiện chữ cho đến khi bạn sinh lại hoặc tải ảnh mới.", confirmLabel: "Xóa ảnh", tone: "danger", countdownSeconds: 0 })) return;
    try { await actions.onRemoveIllustration(framework.id, word); await loadIllustrations(); toast.show({ message: `Đã xóa ảnh của “${word}”.`, tone: "ok" }); }
    catch { showUnavailable("Không xóa được ảnh."); }
  };
  const illustrationEditing = illustrations && framework?.status === "draft" && canEdit && actions.onGenerateIllustrations && actions.onUploadIllustration
    ? { view: illustrations, onGenerate: generateIllustrations, onUpload: uploadIllustration, ...(actions.onRemoveIllustration ? { onRemove: removeIllustration } : {}) }
    : undefined;
  const generateFramework = async () => {
    if (!canEdit) return showUnavailable("Tháng trước chỉ dùng để xem.");
    if (!briefLocked) return showUnavailable("Hãy chốt chủ đề tháng trước khi sinh tài nguyên.");
    if (resourceGenerationInFlight.current || resourceRunning) return;
    if (framework?.resources && !await modal.confirm({ title: "Sinh lại tài nguyên tháng?", message: "Bản nháp tài nguyên hiện tại sẽ được thay khi sinh thành công.", confirmLabel: "Sinh lại", tone: "danger", countdownSeconds: 0 })) return;
    if (resourceGenerationInFlight.current) return;
    resourceGenerationInFlight.current=true;
    observedResourceRunId.current=undefined;
    setResourceGenerating(true);setResourceGenerationAttempted(true);setResourceGenerationFailed(false);
    try {
      await actions.onGenerateFramework(month, { cefr, vocabularyCount: resourceCounts.core, expandedVocabularyCount: resourceCounts.expanded, grammarTopicCount: resourceCounts.grammar, pronunciationSoundCount: resourceCounts.sounds });
      toast.show({ message: "Đã sinh tài nguyên tháng.", tone: "ok" });
    } catch (error) {
      if (isGatewayTimeout(error)) {
        // The server is still generating; the progress panel keeps polling and reloads the month when it completes.
        toast.show({ message: "Máy chủ vẫn đang sinh tài nguyên tháng. Theo dõi tiến độ bên dưới; không cần bấm Sinh lại.", tone: "info" });
        return;
      }
      setResourceGenerationFailed(true);
      const noAi = error instanceof Error && ["AI_UNAVAILABLE", "AI_PROMPT_NOT_READY"].includes(error.message);
      showUnavailable(noAi ? "Chưa kết nối AI, bạn có thể soạn tay." : "AI không tạo được đủ tài nguyên. Hãy thử lại hoặc soạn tay.");
      await openManualResources();
    } finally {resourceGenerationInFlight.current=false;setResourceGenerating(false);}
  };
  const generateDay = async (dayNumber: number, kind: "new" | "review") => {
    if (generationInFlight.current) return;
    if (!canEdit) return showUnavailable("Tháng trước chỉ dùng để xem.");
    if (!framework || framework.status !== "approved") return showUnavailable("Hãy chốt tài nguyên tháng trước khi sinh bài học.");
    generationInFlight.current = true;
    setGenerating(dayNumber);
    try {
      if (kind === "review") {
        if (!actions.onGenerateReview) return showUnavailable("Luồng sinh bài ôn chưa sẵn sàng.");
        await actions.onGenerateReview(framework.id, dayNumber);
        toast.show({ message: "Đã sinh bản nháp bài ôn. Hãy duyệt trước khi học viên học.", tone: "ok" });
      } else {
        await actions.onGenerateDay(framework.id, dayNumber);
        toast.show({ message: `Đã sinh bài học ngày ${dayNumber}.`, tone: "ok" });
      }
    } catch (reason) {
      showUnavailable(monthlyGenerationMessage(reason));
    } finally {
      generationInFlight.current = false;
      setGenerating(undefined);
    }
  };
  const openManualEditor = (dayNumber: number, slot?: { kind: "new" | "review"; date?: string | undefined; title?: string | undefined }) => {
    if (!canEdit) return showUnavailable("Tháng trước chỉ dùng để xem.");
    if (!framework || framework.status !== "approved") return showUnavailable("Hãy chốt tài nguyên tháng trước khi soạn bài học.");
    if (!actions.onComposeDay) return showUnavailable("Màn biên soạn bài tháng chưa sẵn sàng.");
    actions.onComposeDay(framework.id, dayNumber, slot);
  };
  const suggestBrief = async () => {
    if (!canEdit) return showUnavailable("Tháng trước chỉ dùng để xem.");
    try {
      const suggestion = await actions.onSuggestBrief(month);
      setBrief(suggestion);
      toast.show({ message: "Đã điền gợi ý AI cho chủ đề tháng.", tone: "ok" });
    } catch {
      showUnavailable("Không tạo được gợi ý AI. Hãy thử lại.");
    }
  };
  const selectLevel = (level: CefrLevel) => {
    actions.onSelectLevel(level);
  };
  const saveBrief = async () => {
    if (!canEdit) return showUnavailable("Tháng trước chỉ dùng để xem.");
    if (!brief.title.trim() || !brief.brief.trim()) return showUnavailable("Hãy điền tiêu đề và mô tả chủ đề.");
    try { await actions.onSaveBrief(month, brief); toast.show({ message: "Đã lưu chủ đề tháng.", tone: "ok" }); }
    catch { showUnavailable("Không lưu được chủ đề tháng. Hãy thử lại."); }
  };
  const approveBrief = async () => {
    if (!canEdit) return showUnavailable("Tháng trước chỉ dùng để xem.");
    if (!await modal.confirm({ title: "Chốt chủ đề tháng?", message: "Tài nguyên của các trình độ sẽ được soạn theo chủ đề này.", confirmLabel: "Chốt chủ đề" })) return;
    try { await actions.onApproveBrief(month); toast.show({ message: "Đã chốt chủ đề tháng.", tone: "ok" }); }
    catch { showUnavailable("Không chốt được chủ đề tháng. Hãy thử lại."); }
  };
  const approveFramework = async () => {
    if (!canEdit) return showUnavailable("Tháng trước chỉ dùng để xem.");
    if (!framework) return showUnavailable("Hãy sinh tài nguyên tháng trước khi duyệt.");
    const withoutImage = illustrations ? illustrations.images.filter((image) => image.status !== "ready").length : 0;
    const imageWarning = illustrationsWorking
      ? "Ảnh minh họa chưa sinh xong sẽ không được dùng."
      : withoutImage ? `${withoutImage} từ chưa có ảnh minh họa và sẽ chỉ hiện chữ.` : "";
    if (!await modal.confirm({
      title: "Duyệt tài nguyên tháng?",
      message: ["Tài nguyên và ảnh minh họa sẽ được khóa sau khi duyệt.", imageWarning].filter(Boolean).join(" "),
      confirmLabel: "Duyệt tài nguyên",
      tone: illustrationsWorking ? "danger" : "primary",
      countdownSeconds: 0
    })) return;
    try {
      await actions.onApproveFramework(framework.id);
      toast.show({ message: "Đã duyệt tài nguyên tháng.", tone: "ok" });
    } catch {
      showUnavailable("Không duyệt được tài nguyên tháng. Hãy thử lại.");
    }
  };
  // Only the request made against the current framework version is relevant:
  // an older approved/rejected request belongs to a previous resource revision.
  const resourcesReopen = framework?.reopenRequest && framework.reopenRequest.frameworkVersion >= (framework.status === "approved" ? framework.version : framework.version - 1) ? framework.reopenRequest : null;
  const resourcesReopenPending = framework?.status === "approved" && resourcesReopen?.status === "pending";
  const requestResourcesReopen = async (reason: string) => {
    if (!canEdit) return showUnavailable("Tháng trước chỉ dùng để xem.");
    if (!framework || framework.status !== "approved") return showUnavailable("Chỉ tài nguyên đã chốt mới cần Quản lý mở lại.");
    if (!actions.onRequestResourcesReopen) return showUnavailable("Luồng yêu cầu mở lại tài nguyên chưa sẵn sàng.");
    if (reason.trim().length < 5) return showUnavailable("Hãy nhập lý do ít nhất 5 ký tự.");
    try {
      await actions.onRequestResourcesReopen(framework.id, reason.trim());
      setRequestingResourcesReopen(false);
    } catch {
      showUnavailable("Không gửi được yêu cầu mở lại tài nguyên. Hãy thử lại.");
    }
  };
  const generateMonthlyFinal = async () => {
    if (generationInFlight.current) return;
    if (!canEdit) return showUnavailable("Tháng trước chỉ dùng để xem.");
    if (!framework || framework.status !== "approved") return showUnavailable("Hãy chốt tài nguyên tháng trước khi sinh đề thi.");
    if (!actions.onGenerateMonthlyFinal) return showUnavailable("Luồng đề thi tháng chưa sẵn sàng.");
    if (monthlyFinalExists && !await modal.confirm({ title: "Sinh lại đề thi tháng?", message: "Sinh lại sẽ thay bản nháp đề thi tháng hiện có. Tiếp tục?", confirmLabel: "Sinh lại", cancelLabel: "Quay lại", tone: "danger", countdownSeconds: 0 })) return;
    if (generationInFlight.current) return;
    generationInFlight.current = true;
    setGenerating("final");
    try {
      const draft = await actions.onGenerateMonthlyFinal(framework.id);
      if (draft?.blueprint) { setMonthlyFinal(draft); setMonthlyFinalExists(true); }
      toast.show({ message: "Đã sinh bản nháp đề tháng. Rà báo cáo GEN, thêm và nghe soát audio, rồi duyệt trước 00:00 ngày thi.", tone: "ok" });
    }
    catch (reason) { showUnavailable(monthlyFinalGenerationMessage(reason)); }
    finally { generationInFlight.current = false; setGenerating(undefined); }
  };
  const openMonthlyFinal = async () => {
    if (!framework || framework.status !== "approved") return showUnavailable("Hãy chốt tài nguyên tháng trước khi xem đề thi.");
    if (!actions.onOpenMonthlyFinal) return showUnavailable("Màn duyệt đề thi tháng chưa sẵn sàng.");
    try {
      const draft = await actions.onOpenMonthlyFinal(framework.id);
      if (draft?.blueprint) setMonthlyFinal(draft);
    } catch { showUnavailable("Chưa có đề thi tháng cho trình độ này."); }
  };
  const composeMonthlyFinal = async () => {
    if (!canEdit) return showUnavailable("Tháng trước chỉ dùng để xem.");
    if (!framework || framework.status !== "approved") return showUnavailable("Hãy chốt tài nguyên tháng trước khi soạn đề thi.");
    if (!actions.onComposeMonthlyFinal) return showUnavailable("Luồng soạn đề thi tháng chưa sẵn sàng.");
    try {
      const draft = await actions.onComposeMonthlyFinal(framework.id);
      if (draft?.blueprint) { setMonthlyFinal(draft); setMonthlyFinalExists(true); }
      toast.show({ message: "Đã mở bản nháp soạn tay đề thi tháng.", tone: "ok" });
    } catch {
      showUnavailable("Không mở được bản nháp soạn đề thi tháng.");
    }
  };
  const resourceColumn = <div className="monthly-resource-column">
        <section className="monthly-resources card">
        <div className="monthly-section-title"><div><span className="eyebrow">{cefr}</span><h2>Tài nguyên tháng</h2></div><span className={`monthly-status ${framework?.status ?? "missing"}`}>{frameworkStatus(framework?.status)}</span></div>
        <p className="small muted">AI chuẩn bị một bộ tài nguyên thống nhất cho cả tháng.</p>
        {!framework?.resources ? <div className="monthly-resource-proposal" aria-label="Số lượng đề xuất theo lịch học">
          <span className="eyebrow">Số lượng đề xuất theo lịch học</span>
          <dl>
            <div><dt>Từ cốt lõi</dt><dd>{resourceCounts.core}</dd></div>
            <div><dt>Từ mở rộng (tối đa)</dt><dd>{resourceCounts.expanded}</dd></div>
            <div><dt>Chủ điểm ngữ pháp</dt><dd>{resourceCounts.grammar}</dd></div>
            <div><dt>Mục tiêu phát âm</dt><dd>{resourceCounts.sounds}</dd></div>
          </dl>
          <small>Mỗi từ cốt lõi có 3–9 từ mở rộng, bắt buộc có từ bao trùm, đồng nghĩa và cùng họ từ.</small>
        </div> : <div className="monthly-resource-cards">{resources.map((item) => <button key={item.key} type="button" onClick={() => setResourcePanel(item.key)}><b>{item.count}</b><strong>{item.label}</strong><span>{item.description}</span></button>)}</div>}
        {(resourceGenerationAttempted || resourceRunning || resourceCheckpoint?.progress?.status === "failed") && <MonthlyResourceProgress running={resourceRunning} failed={resourceGenerationFailed && resourceCheckpoint?.progress?.status !== "running" && !(resourceCheckpoint?.progress?.status === "completed" && observedResourceRunId.current === resourceCheckpoint.progress.runId)} progress={resourceGenerating && resourceCheckpoint?.progress?.status === "completed" ? null : resourceCheckpoint?.progress} />}
        <div className="monthly-actions monthly-resource-actions">
          {resourceCheckpoint?.state === "draft_checkpoint" && !framework?.resources && <div className="monthly-resource-checkpoint" role="status" aria-label="Tiến độ tài nguyên nháp">
            <b>Bản nháp theo nhóm · chưa chốt</b>
            <ul>{([
              ["coreTerms", "Từ cốt lõi"], ["expandedTerms", "Từ mở rộng"], ["grammarTopics", "Ngữ pháp"], ["pronunciationTargets", "Phát âm"]
            ] as const).map(([key, label]) => {
              const category = resourceCheckpoint.categories[key];
              return <li key={key}><span>{label}</span><strong>{category.count}/{category.target}</strong><em>{category.state === "complete" ? "Đã lưu nháp" : "Chưa sinh"}</em></li>;
            })}</ul>
            <small>Tiếp tục sẽ sinh các nhóm còn thiếu; nhóm đã lưu vẫn ở trạng thái nháp và chưa dùng cho học viên.</small>
          </div>}
          {framework?.status !== "approved" && <button type="button" className={`btn ${framework?.resources ? "btn-danger" : "btn-primary"} monthly-resource-main-action`} aria-busy={resourceRunning} disabled={busy || !canEdit} onClick={() => void generateFramework()}>{resourceRunning ? <><span className="spinner" aria-hidden="true" />Đang sinh tài nguyên…</> : resourceCheckpoint?.state === "draft_checkpoint" && !framework?.resources ? "Tiếp tục nhóm còn thiếu" : framework?.resources ? "Sinh lại tài nguyên" : "Sinh tài nguyên"}</button>}
          {framework?.status === "draft" && <button type="button" className="btn monthly-resource-main-action" disabled={busy || !canEdit} onClick={() => void approveFramework()}>Duyệt tài nguyên</button>}
          {framework?.status === "draft" && framework.resources && actions.onSaveResources && <button type="button" className="btn monthly-resource-edit-button" disabled={busy || !canEdit} title={canEdit ? "Sửa tay tài nguyên nháp" : "Tháng này chỉ dùng để xem"} onClick={() => setEditingResources(true)}>Sửa tay</button>}
          {!framework && canEdit && briefLocked && actions.onLoadManualResources && <button type="button" className="btn monthly-resource-edit-button" disabled={busy || openingManualResources} onClick={() => void openManualResources()}>Soạn tay tài nguyên</button>}
          {(framework?.resources?.roadmap?.allocated || framework?.status === "approved") && <div className="monthly-plan-row">
            {framework?.resources?.roadmap?.allocated && <button type="button" className="btn monthly-plan-open-button" onClick={() => setResourcePanel("plan")}>Phân bổ tài nguyên &amp; bài tập</button>}
            {framework?.status === "approved" && <button type="button" className="btn monthly-reopen-request-button" aria-label="Báo Quản lý: yêu cầu mở lại tài nguyên" title={resourcesReopenPending ? "Đang chờ Quản lý duyệt" : "Báo Quản lý để mở lại tài nguyên đã chốt"} disabled={busy || !canEdit || resourcesReopenPending} onClick={() => setRequestingResourcesReopen(true)}><MessageSquareWarning aria-hidden="true" /></button>}
          </div>}
          {resourcesReopenPending && <span className="monthly-reopen-status pending" role="status">Đang chờ Quản lý duyệt</span>}
        </div>
        {framework?.status === "approved" && resourcesReopen?.status === "rejected" && <p className="monthly-reopen-status rejected small" role="note">Quản lý đã từ chối mở lại{resourcesReopen.decisionReason ? `: ${resourcesReopen.decisionReason}` : "."}</p>}
        {framework?.status === "draft" && resourcesReopen?.status === "approved" && <p className="monthly-reopen-status approved small" role="note">Quản lý đã mở lại tài nguyên{resourcesReopen.decisionReason ? `: ${resourcesReopen.decisionReason}` : "."} Hãy rà soát rồi duyệt lại để phân bổ bài học.</p>}
        </section>
        <section className="card monthly-publication" aria-label={`Tiến độ công bố ${cefr}`}>
          <h2>Công bố tháng · {cefr}</h2>
          {publication?.publishedOn ? <p className="small muted">Đã công bố {publication.publishedOn}</p>
            : publication?.ready ? (canEdit && actions.onPreviewPublication && actions.onPublishMonth
              ? <button type="button" className="btn btn-primary" disabled={busy} onClick={() => void publishMonth()}>Công bố tháng</button>
              : <p className="small muted">Sẵn sàng công bố</p>)
            : briefLocked && resourcesApproved && pendingDayNumbers.length ? (
              <a className="small monthly-publication-link" {...(pendingTargetId ? { href: "#" + pendingTargetId } : {})} onClick={(event) => {
                if (!agenda || pendingCellIndex < 0 || !pendingTargetId) return;
                event.preventDefault();
                setAgendaSelection({ month, week: Math.floor(pendingCellIndex / 7) });
                window.requestAnimationFrame(() => document.getElementById(pendingTargetId)?.scrollIntoView({ block: "center" }));
              }}><span>Còn {pendingDayNumbers.length} bài cần duyệt</span><ChevronRight size={16} aria-hidden="true" /></a>
            ) : <p className="small muted">{!briefLocked ? "Chưa chốt chủ đề" : !resourcesApproved ? "Chưa duyệt tài nguyên" : "Chưa đủ điều kiện công bố"}</p>}
        </section>
      </div>;
  const calendarSection = <section className="monthly-calendar-section card" id="monthly-teaching-calendar" ref={calendarRef}>
        <div className="monthly-section-title"><div><span className="eyebrow">{cefr}</span><h2>Lịch học {monthLabel(month)}</h2></div><div className="monthly-calendar-legend"><span className="lesson">Học mới</span><span className="review">Ôn tập</span><span className="weekend">Nghỉ</span><span className="holiday">Ngày lễ</span><span className="final">Bài thi tháng</span></div></div>
        {agenda ? <div className="monthly-agenda-picker" role="group" aria-label="Tuần trong tháng">
          <button type="button" className="btn-sm" aria-label="Tuần trước" disabled={agendaWeek === 0} onClick={() => setAgendaSelection({ month, week: agendaWeek - 1 })}><ChevronLeft size={18} aria-hidden="true" /></button>
          <b aria-live="polite">{agendaDates[0]?.dateLabel}–{agendaDates.at(-1)?.dateLabel}/{month.slice(5)}</b>
          <button type="button" className="btn-sm" aria-label="Tuần sau" disabled={agendaWeek === calendarCells.length / 7 - 1} onClick={() => setAgendaSelection({ month, week: agendaWeek + 1 })}><ChevronRight size={18} aria-hidden="true" /></button>
        </div> : null}
        <div className={agenda ? "monthly-calendar monthly-agenda" : "monthly-calendar"} role={agenda ? "list" : "grid"} aria-label={`Lịch tháng ${month.slice(5, 7)}/${month.slice(0, 4)}`}>
          {!agenda && WEEKDAYS.map((label) => <div key={label} role="columnheader" className="monthly-weekday">{label}</div>)}
          {calendarCells.map((cell, index) => {
            if (agenda && (cell.outside || Math.floor(index / 7) !== agendaWeek)) return null;
            if (cell.outside) return <article key={cell.key} role="gridcell" aria-disabled="true" className="monthly-day-cell outside-month"><b>{agenda ? <span>{WEEKDAYS[index % 7]}</span> : null}{cell.dateLabel}</b></article>;
            const calendarDay = overview.calendar?.find(day => day.date === cell.date); const isExam = cell.date === calendar.examDate;
            const holidayClass = calendarDay?.holiday ? "holiday" : "";
            const holidayDescription = calendarDay?.holiday ? `, ${calendarDay.holiday.name}` : "";
            const lesson = framework?.lessons.find((item) => item.lessonDate === cell.date);
            // The persisted lesson is the DaySpec projection. Its date, number, and kind
            // drive the calendar after resources exist; do not infer review slots from weekdays.
            const scheduledLessonNumber = lesson?.lessonNumber ?? cell.lessonNumber;
            if (isExam) {
              // VH-R64/VH-R70: generate any time after the plan is approved; frozen from 00:00 of the exam date.
              const examWindowOpen = overview.systemDate < calendar.examDate;
              const planApproved = Boolean(framework && framework.status === "approved");
              const generateTitle = !planApproved ? "Duyệt khung tháng trước khi sinh đề" : examWindowOpen ? "Sinh bản nháp đề thi tháng bằng AI (thay bản nháp hiện có)" : "Đã quá 00:00 ngày thi; đề bị khóa";
              return <article key={cell.date} role={agenda ? "listitem" : "gridcell"} aria-label={`${cell.dateLabel}, Bài thi${holidayDescription}`} title={calendarDay?.holiday?.name} className={`monthly-day-cell monthly-final ${holidayClass}`}><b>{agenda ? <span>{WEEKDAYS[index % 7]}</span> : null}{cell.dateLabel}</b><strong>Bài thi</strong><div className="monthly-day-actions monthly-final-actions" role="group" aria-label="Thao tác đề thi tháng">{monthlyFinalExists && actions.onOpenMonthlyFinal ? <><button type="button" aria-label="Xem đề thi tháng" title="Xem, sửa và duyệt đề thi tháng" className="monthly-day-action monthly-view-day" disabled={busy || !planApproved} onClick={() => void openMonthlyFinal()}><Eye aria-hidden="true" /><span>Xem</span></button><button type="button" aria-label="Sinh lại đề thi tháng" title={generateTitle} className="monthly-day-action monthly-generate-action icon-only btn-danger" disabled={busy || !examWindowOpen || !planApproved || !canEdit} aria-busy={generating === "final"} onClick={() => void generateMonthlyFinal()}>{generating === "final" ? <span className="spinner" role="status" aria-label="Đang sinh đề thi tháng" /> : <Sparkles aria-hidden="true" />}</button></> : <><button type="button" aria-label="Sinh đề thi tháng" title={generateTitle} className="monthly-day-action monthly-generate-action" disabled={busy || !examWindowOpen || !planApproved || !canEdit} aria-busy={generating === "final"} onClick={() => void generateMonthlyFinal()}>{generating === "final" ? <span className="spinner" role="status" aria-label="Đang sinh đề thi tháng" /> : <><Sparkles aria-hidden="true" /><span>AI</span></>}</button><button type="button" aria-label="Soạn tay đề thi tháng" title={examWindowOpen ? "Soạn tay đề thi tháng" : "Đã quá 00:00 ngày thi; đề bị khóa"} className="monthly-day-action monthly-manual-action" disabled={busy || !examWindowOpen || !planApproved || !canEdit} onClick={() => void composeMonthlyFinal()}><Pencil aria-hidden="true" /></button></>}</div></article>;
            }
            if (!scheduledLessonNumber) return <article key={cell.date} role={agenda ? "listitem" : "gridcell"} aria-label={`${cell.dateLabel}, Nghỉ${holidayDescription}`} title={calendarDay?.holiday?.name} className={`monthly-day-cell weekend ${holidayClass}`}><b>{agenda ? <span>{WEEKDAYS[index % 7]}</span> : null}{cell.dateLabel}</b><strong>Nghỉ</strong></article>;
            const scheduledKind = lesson?.kind ?? monthlyDayKind(scheduledLessonNumber, calendar);
            const kind = scheduledKind === "review" ? "review" : "lesson";
            // A manual save with severe findings is stored as "failed" but is still the day's draft to view and fix.
            const draft = lesson?.status === "draft" || (lesson?.status === "failed" && Boolean(lesson.content?.parts?.length));
            const isReview = scheduledKind === "review";
            const newLessonOrdinal = isReview ? null : monthlyNewLessonOrdinal(scheduledLessonNumber, calendar);
            const planDay = framework?.resources?.roadmap?.days.find(day => day.lessonNumber === scheduledLessonNumber); const dayLabel = isReview ? "bài ôn" : newLessonOrdinal ? `bài ${newLessonOrdinal}` : "bài học"; const reviewWeekNumber = planDay?.reviewWeekNumber ?? overview.calendar?.find(day => day.date === cell.date)?.reviewWeekNumber; const composeTitle = isReview ? (reviewWeekNumber ? `Bài ôn tuần ${reviewWeekNumber}` : "Bài ôn tập") : newLessonOrdinal ? `Bài ${newLessonOrdinal}` : undefined; const dayText = formatMonthlyDayLabel({ kind: isReview ? "review" : "new", newLessonNumber: newLessonOrdinal ?? undefined, reviewWeekNumber, ...(planDay?.grammarPlan ? { grammarPlan: planDay.grammarPlan } : {}), ...(planDay?.pronunciationPlan ? { pronunciationPlan: planDay.pronunciationPlan } : {}) });
            return <article id={monthlyDayCellId(cell.key)} key={cell.date} role={agenda ? "listitem" : "gridcell"} aria-label={`${cell.dateLabel}, ${dayText}${holidayDescription}`} title={calendarDay?.holiday?.name} className={`monthly-day-cell ${kind} ${calendarDay?.holiday ? "holiday" : ""} ${lesson?.status === "approved" ? "approved" : ""}`}><b>{agenda ? <span>{WEEKDAYS[index % 7]}</span> : null}{cell.dateLabel}</b><strong>{dayText}</strong><div className="monthly-day-actions" role="group" aria-label={`Thao tác ${dayLabel}`}>{lesson && (lesson.status === "approved" || draft) ? <><button type="button" aria-label={`Xem ${dayLabel}`} title={draft ? "Xem bản nháp để duyệt" : "Xem bài đã duyệt"} className="monthly-day-action monthly-view-day" disabled={busy} onClick={() => framework && actions.onViewDay?.(framework.id, lesson.lessonNumber)}><Eye aria-hidden="true" /><span>Xem</span></button>{draft ? <button type="button" aria-label={`Soạn tay ${dayLabel}`} title="Sửa tay bản nháp" className="monthly-day-action monthly-manual-action" disabled={busy || !canEdit || !resourcesApproved} onClick={() => openManualEditor(scheduledLessonNumber, { kind: isReview ? "review" : "new", date: cell.date, ...(composeTitle ? { title: composeTitle } : {}) })}><Pencil aria-hidden="true" /></button> : null}</> : <>{lesson?.generationFailure ? <button type="button" aria-label={`Xem lỗi sinh ${dayLabel}`} title="Xem lần sinh AI chưa đạt" className="monthly-day-action monthly-failure-action" disabled={busy} onClick={() => framework && actions.onViewDay?.(framework.id, lesson.lessonNumber)}><Eye aria-hidden="true" /><span>Lỗi</span></button> : <button type="button" aria-label={isReview ? "Sinh" : `Sinh ${dayLabel}`} {...(resourcesApproved ? {} : { title: lockedDayTitle })} className="monthly-day-action monthly-generate-action" disabled={busy || !canEdit || !resourcesApproved} onClick={() => setGenerationConfirmation({ dayNumber: scheduledLessonNumber, kind: isReview ? "review" : "new" })}>{generating === scheduledLessonNumber ? <span className="spinner" role="status" aria-label="Đang sinh bài" /> : <><Sparkles aria-hidden="true" /><span>AI</span></>}</button>}<button type="button" aria-label={`Soạn tay ${dayLabel}`} title={resourcesApproved ? "Soạn tay" : lockedDayTitle} className="monthly-day-action monthly-manual-action" disabled={busy || !canEdit || !resourcesApproved} onClick={() => openManualEditor(scheduledLessonNumber, { kind: isReview ? "review" : "new", date: cell.date, ...(composeTitle ? { title: composeTitle } : {}) })}><Pencil aria-hidden="true" /></button></>}</div></article>;
          })}
        </div>
      </section>;

  return <main className="operator-months-page">
    {!hasSectionHeader ? <header className="operator-months-header"><h1>{readOnly ? "Nội dung tháng" : "Bài học"}</h1><p>Thiết kế chủ đề, tài nguyên và lịch học theo tháng.</p></header> : null}
    {error && <div className="monthly-error" role="alert">{error}</div>}
    <section className="monthly-month-card card">
      <h2 id="monthly-cycle-title" className="monthly-cycle-title">Chu kỳ tháng</h2>
      <div className="monthly-month-tabs" role="tablist" aria-labelledby="monthly-cycle-title">
        {monthChoices.map((choice) => <button key={choice} type="button" role="tab" disabled={busy} aria-selected={choice === month} className={choice === month ? "selected" : ""} aria-label={choice === monthChoices[0] ? `${monthLabel(choice)}, chỉ xem` : monthLabel(choice)} onClick={() => actions.onSelectMonth(choice)}>
          <span className="monthly-month-full">{monthLabel(choice)}</span><span className="monthly-month-short" aria-hidden="true">{choice.slice(5)}/{choice.slice(0, 4)}</span>{choice === monthChoices[0] && <small>Chỉ xem</small>}
        </button>)}
      </div>
    </section>
    <section className="monthly-topic-card card">
      <div className="monthly-section-title"><div><span className="eyebrow">Nội dung chung</span><h2>Chủ đề tháng</h2></div><span className="monthly-version">{briefLocked ? "Đã chốt" : overview.brief ? "Đang soạn" : "Chưa có"}</span></div>
      {compact && briefLocked ? <div className="monthly-brief-summary">
        <b>{overview.brief?.title || brief.title}</b>
        <button type="button" className="btn-sm" aria-expanded={briefEditorMonth === month} aria-controls="monthly-brief-fields" onClick={() => setBriefEditorMonth(briefEditorMonth === month ? undefined : month)}>{briefEditorMonth === month ? "Thu gọn" : canEdit ? "Xem hoặc sửa chủ đề" : "Xem chủ đề"}</button>
      </div> : null}
      <div id="monthly-brief-fields" hidden={compact && briefLocked && briefEditorMonth !== month}>
      <div className="monthly-topic-grid">
        <label>Tiêu đề<input value={brief.title} disabled={!canEdit || busy} onChange={(event) => setBrief({ ...brief, title: event.target.value })} /></label>
        <label>Mô tả<textarea value={brief.brief} disabled={!canEdit || busy} onChange={(event) => setBrief({ ...brief, brief: event.target.value })} /></label>
        <label>Bối cảnh<textarea value={brief.context} disabled={!canEdit || busy} onChange={(event) => setBrief({ ...brief, context: event.target.value })} /></label>
        <label>Mục tiêu giao tiếp<textarea value={brief.communicationGoal} disabled={!canEdit || busy} onChange={(event) => setBrief({ ...brief, communicationGoal: event.target.value })} /></label>
      </div>
      <div className="monthly-actions">
        <button type="button" className="btn" disabled={busy || !canEdit} onClick={() => void suggestBrief()}>Gợi ý AI</button>
        <button type="button" className="btn" disabled={busy || !canEdit} onClick={() => void saveBrief()}>Lưu chủ đề</button>
        <button type="button" className="btn btn-primary" disabled={busy || !canEdit} onClick={() => void approveBrief()}>Chốt chủ đề</button>
      </div>
      </div>
      <div className="monthly-level-tabs" role="tablist" aria-label="Chọn trình độ">{LEVELS.map((level) => <button key={level} type="button" role="tab" disabled={busy} aria-selected={level === cefr} className={level === cefr ? "selected" : ""} onClick={() => selectLevel(level)}>{level}</button>)}</div>
    </section>
    <div className="monthly-workspace">
      {compact && resourcesApproved ? <>{calendarSection}{resourceColumn}</> : <>{resourceColumn}{calendarSection}</>}
      {framework?.resources && resourcePanel && <section className="monthly-resource-panel card" role="dialog" aria-modal="false" aria-label={resourcePanel === "plan" ? "Phân bổ tài nguyên và bài tập" : "Tài nguyên tháng"}>
        <header><div><span className="eyebrow">Tài nguyên tháng</span><h2>{resourcePanel === "plan" ? "Phân bổ tài nguyên & bài tập" : resources.find((item) => item.key === resourcePanel)?.label}</h2></div><button type="button" className="btn-sm" aria-label="Đóng tài nguyên" onClick={() => setResourcePanel(null)}>Đóng</button></header>
        {resourcePanel === "core" && <VocabularyPanel items={framework.resources.coreTerms} variant="core" />}
        {resourcePanel === "expanded" && <VocabularyPanel items={framework.resources.supportTerms} variant="expanded" registerCores={framework.resources.coreTerms} />}
        {resourcePanel === "grammar" && <GrammarResourcePanel topics={framework.resources.grammarTopics} {...(framework.resources.roadmap ? { roadmap: framework.resources.roadmap } : {})} />}
        {resourcePanel === "images" && illustrations && <MonthlyIllustrationPanel view={illustrations} busy={busy || !canEdit} onGenerate={generateIllustrations} onUpload={uploadIllustration} {...(actions.onRemoveIllustration ? { onRemove: removeIllustration } : {})} />}
        {resourcePanel === "sounds" && <PronunciationResourcePanel sounds={framework.resources.sounds} {...(framework.resources.roadmap ? { roadmap: framework.resources.roadmap } : {})} />}
        {resourcePanel === "plan" && framework.resources.roadmap?.allocated && <div className="monthly-plan-inspector" aria-label="Phân bổ tài nguyên và bài tập"><p className="small muted">Kế hoạch đã chốt. Đây là sơ đồ phân bổ; nội dung bài học chưa được sinh.</p><div className="monthly-plan-days">{framework.resources.roadmap.days.map((day) => {
          const coreTerms = framework.resources!.coreTerms.filter((term) => day.kind === "new" ? day.coreTermIds.includes(term.id) : day.reviewTermIds.includes(term.id));
          const expandedTerms = framework.resources!.supportTerms.filter((term) => day.kind === "new" ? day.expandedTermIds.includes(term.id) : day.reviewExpandedTermIds.includes(term.id));
          const grammarIds = day.kind === "review" ? day.reviewGrammarStepIds ?? [] : day.grammarStepIds;
          const soundIds = day.kind === "review" ? day.reviewSoundIds ?? [] : day.pronunciationPlan?.targetIds ?? [day.soundId];
          const grammarLabels = framework.resources!.grammarTopics.flatMap(topic => topic.steps).filter(step => grammarIds.includes(step.id)).map(step => step.focus);
          const soundLabels = framework.resources!.sounds.filter(sound => soundIds.includes(sound.id)).map(sound => sound.label);
          return <details key={day.lessonNumber} className="monthly-plan-day">
            <summary className="monthly-plan-day-summary"><div><span className="eyebrow">{day.kind === "review" ? "Ôn tập tuần" : formatMonthlyDayLabel({ ...day, newLessonNumber: day.newLessonNumber ?? monthlyNewLessonOrdinal(day.lessonNumber, calendar) ?? undefined })}</span><h3>{day.date}</h3><p className="monthly-plan-day-cores">{coreTerms.map((term) => term.word).join(" · ") || "Chưa có từ"}<em> · {coreTerms.length} từ cốt lõi, {expandedTerms.length} từ mở rộng</em></p></div><span className="monthly-plan-day-open">Xem phân bổ</span></summary>
            <div className="monthly-plan-day-body"><div className="monthly-plan-resource-groups">{coreTerms.map((core) => {
              const linked = expandedTerms.filter((term) => term.relatedCoreTermId === core.id);
              const groups = [
                ...PLAN_RELATION_LABELS.map(([relation, label]) => [label, linked.filter((term) => term.relation === relation).map((term) => term.word)] as const),
                ...REGISTER_LABELS.map(([kind, label]) => [label, (core.registerTerms ?? []).filter((term) => term.kind === kind).map((term) => term.word)] as const)
              ].filter(([, words]) => words.length);
              return <div key={core.id} className="monthly-plan-resource-group"><strong>{core.word}{core.type ? <em className="monthly-plan-core-type"> · {core.type}</em> : null}</strong>{groups.length ? <dl className="monthly-plan-relations">{groups.map(([label, words]) => <div key={label}><dt>{label}</dt><dd>{words.join(", ")}</dd></div>)}</dl> : <span>Chưa có từ mở rộng</span>}</div>;
            })}</div><small>Ngữ pháp: {grammarLabels.join(", ") || "Chưa gán"} · Phát âm: {soundLabels.join(", ") || "Chưa gán"}</small></div>
          </details>;
        })}</div></div>}
      </section>}
    </div>
    {editingResources && framework?.status === "draft" && framework.resources && actions.onSaveResources && <MonthlyResourceEditor
      cefr={cefr}
      version={framework.version}
      resources={framework.resources}
      busy={busy}
      {...(illustrationEditing ? { illustrations: illustrationEditing } : {})}
      onClose={() => setEditingResources(false)}
      onSave={async (input) => { await actions.onSaveResources!(framework.id, input); setEditingResources(false); }}
    />}
    {manualResources && canEdit && actions.onCreateManualResources && <MonthlyResourceEditor
      cefr={cefr}
      version={manualResources.theme.version}
      resources={manualResources}
      busy={busy}
      onClose={() => setManualResources(undefined)}
      onSave={async (input) => { await actions.onCreateManualResources!(month, cefr, input); setManualResources(undefined); }}
    />}
    {requestingResourcesReopen && framework?.status === "approved" && <MonthlyReopenRequest label={`tài nguyên tháng ${cefr}`} onCancel={() => setRequestingResourcesReopen(false)} onSubmit={(reason) => void requestResourcesReopen(reason)} />}
    {generationConfirmation && framework?.resources && <MonthlyGenerationConfirmation busy={generating !== undefined} dayNumber={generationConfirmation.dayNumber} kind={generationConfirmation.kind} framework={framework} onCancel={() => setGenerationConfirmation(undefined)} onConfirm={async () => { const generation = generationConfirmation; await generateDay(generation.dayNumber, generation.kind); setGenerationConfirmation(undefined); }} />}
    {monthlyFinal && <MonthlyFinalReview
      draft={monthlyFinal}
      readOnly={!canEdit}
      onClose={() => setMonthlyFinal(null)}
      {...(actions.onSaveMonthlyFinal ? { onSave: async (input: MonthlyFinalUpdateInput) => { const saved = await actions.onSaveMonthlyFinal!(monthlyFinal.versionId, input); if (saved && "blueprint" in saved) setMonthlyFinal(saved); toast.show({ message: "Đã lưu bản nháp đề tháng.", tone: "ok" }); } } : {})}
      {...(actions.onPublishMonthlyFinal ? { onPublish: async () => { await actions.onPublishMonthlyFinal!(monthlyFinal.versionId); toast.show({ message: "Đã duyệt và phát hành đề tháng.", tone: "ok" }); setMonthlyFinal(null); } } : {})}
      {...(actions.onSynthesizeMonthlyFinalAudio ? { synthesize: actions.onSynthesizeMonthlyFinalAudio } : {})}
      {...(actions.onUploadMonthlyFinalAudio ? { uploadAudio: actions.onUploadMonthlyFinalAudio } : {})}
    />}
  </main>;
}

export function MonthlyLessonPreview({ date, cefr, lesson, resources, focusedPart, busy = false, onClose, onRequestReopen, onApprove, onEdit, onRegenerate }: { date: string; cefr: CefrLevel; lesson: MonthlyOperatorOverviewView["frameworks"][number]["lessons"][number]; resources?: MonthlyOperatorOverviewView["frameworks"][number]["resources"]; focusedPart?: string | null; busy?: boolean; onClose(): void; onRequestReopen?(reason: string): Promise<void>; onApprove?(): Promise<void> | void; onEdit?(): void; onRegenerate?(): Promise<void> | void }) {
  const isDraft = lesson.status !== "approved";
  const [requestingReopen, setRequestingReopen] = useState(false);
  const parts = lesson.content?.parts ?? [];
  const dateLabel = `${date.slice(8, 10)}/${date.slice(5, 7)}`;
  const day = resources?.roadmap?.days.find((item) => item.lessonNumber === lesson.lessonNumber);
  const dayOrdinal = day?.newLessonNumber ?? (lesson.kind === "new" ? monthlyNewLessonOrdinal(lesson.lessonNumber, buildMonthlyCalendar(date.slice(0, 7))) : undefined);
  const teachingLabel = formatMonthlyDayLabel({ kind: lesson.kind, ...(dayOrdinal ? { newLessonNumber: dayOrdinal } : {}), ...(day?.reviewWeekNumber ? { reviewWeekNumber: day.reviewWeekNumber } : {}), ...(day?.grammarPlan ? { grammarPlan: day.grammarPlan } : {}), ...(day?.pronunciationPlan ? { pronunciationPlan: day.pronunciationPlan } : {}) });
  // Same number as the header: a stored "Bài N" from the raw slot (review days counted) shows the new-lesson ordinal.
  const title = monthlyLessonDisplayTitle(lesson.content?.title, { kind: lesson.kind, newLessonNumber: dayOrdinal, reviewWeekNumber: day?.reviewWeekNumber }) || (lesson.kind === "review" ? "Ôn tập" : teachingLabel);
  const dayCoreIds = new Set(day ? (day.kind === "review" ? day.reviewTermIds : day.coreTermIds) : []);
  const daySupportIds = new Set(day ? (day.kind === "review" ? day.reviewExpandedTermIds : day.expandedTermIds) : []);
  // Older drafts were saved before expanded terms were attached at generation time.
  const dayGrammarIds = day ? (day.kind === "review" ? day.reviewGrammarStepIds ?? [] : day.grammarStepIds) : [];
  const dayGrammarSteps = resources ? resources.grammarTopics.flatMap((topic) => topic.steps).filter((step) => dayGrammarIds.includes(step.id)) : [];
  const toPreviewParts = (source: typeof parts) => (resources ? withMonthlyGrammarSteps(withMonthlyExpandedTerms(source, resources.coreTerms.filter((term) => dayCoreIds.has(term.id)), resources.supportTerms.filter((term) => daySupportIds.has(term.id)), cefr), dayGrammarSteps) : source)
    .map((part) => ({ code: part.code ?? "instruction", title: MONTHLY_PART_TITLES[part.code ?? ""] ?? part.title ?? part.code ?? "Nội dung", content: part.content ?? {} }));
  const reviewParts = toPreviewParts(parts);
  // N3 (December 2026): the last AI generation that failed every repair round, shown beside (never instead of) the draft.
  const failure = lesson.generationFailure;
  const failedParts = failure?.candidate?.parts?.length ? toPreviewParts(failure.candidate.parts) : [];
  const exercise = focusedPart ? reviewParts.find(part => part.code === focusedPart) : undefined;
  // A day without a draft opens the manual editor prefilled with this candidate (OperatorRouteController.openDayEditor).
  const editCandidate = Boolean(onEdit && !parts.length && failedParts.length);
  const draftFindings = parts.length ? [...lesson.quality.severe, ...lesson.quality.light] : [];
  const draftSevere = parts.length ? lesson.quality.severe.length : 0;
  const draftNextStep = draftSevere
    ? "Bấm Sửa tay, sửa các mục Nặng, lưu lại rồi duyệt."
    : lesson.quality.light.length > 2
      ? "Bài có quá hai cảnh báo: bấm Sửa tay, sửa bớt rồi lưu lại để duyệt."
      : "Kiểm tra các cảnh báo; bấm Duyệt bài nghĩa là bạn đã xem và chấp nhận chúng.";
  const draftLines = isDraft ? describeMonthlyFindings(draftFindings, { kind: lesson.kind, parts: reviewParts }) : [];
  const failureLines = failure ? describeMonthlyFindings([...failure.report.severe, ...failure.report.light], { kind: lesson.kind, parts: failedParts }) : [];
  const kindLabel = lesson.kind === "review" ? "Ôn tập" : "Bài mới";
  // Same shell as the weekly lesson-set page so the legacy lesson styles (.app-operator) apply.
  return <OperatorPage title={`${kindLabel} ${dateLabel}`} hideRouteBack><PageTitle actions={<div className="row operator-page-title-actions">
    {onApprove && <Button primary className="operator-lesson-approve-button" disabled={busy} onClick={() => void onApprove()}><Check className="operator-button-icon" size={16} strokeWidth={2.5} aria-hidden="true" />Duyệt bài</Button>}
    {onRegenerate && <Button danger disabled={busy} onClick={() => void onRegenerate()}><Sparkles className="operator-button-icon" size={16} aria-hidden="true" />{busy ? "Đang sinh…" : "Sinh lại bằng AI"}</Button>}
    {onEdit && <Button className="operator-lesson-edit-button" disabled={busy} onClick={onEdit}><Pencil className="operator-button-icon" size={16} aria-hidden="true" />Sửa tay</Button>}
    {onRequestReopen && <Button className="operator-lesson-reopen-button" disabled={busy} onClick={() => setRequestingReopen(true)}>Yêu cầu mở lại</Button>}
  </div>}>
    <a className="link-button small" href="/op/months" onClick={(event) => { event.preventDefault(); onClose(); }}>← Về lịch tháng</a>
    <h1 className="operator-lesson-set-title">{dateLabel} · {teachingLabel} · Mức {cefr} <Badge tone={isDraft ? "warn" : "ok"}>{isDraft ? "Bản nháp" : "Đã duyệt"}</Badge></h1>
    <div className="operator-lesson-set-meta"><strong>{title}</strong><span>{cefr === "A1" || cefr === "A2" ? "tiếng Việt" : "tiếng Anh"}</span></div>
  </PageTitle>
    {/* The findings stay at the top of the view while the lesson below is scrolled, so the Operator always sees what to fix and where. */}
    {(draftLines.length > 0 || failure) && <div className="operator-monthly-findings-dock">
      {draftLines.length > 0 && <MonthlyFindingsPanel label="Kiểm tra chất lượng bản nháp" title="Kiểm tra chất lượng bản nháp" badge={{ tone: draftSevere ? "danger" : "warn", text: draftSevere ? "Chưa duyệt được" : "Có cảnh báo" }} lines={draftLines} testId={`monthly-draft-quality-${lesson.lessonNumber}`}>
        <p className="small"><strong>Bước tiếp theo:</strong> {draftNextStep}</p>
      </MonthlyFindingsPanel>}
      {failure && <MonthlyFindingsPanel label="Lần sinh AI chưa đạt" title="Lần sinh AI gần nhất chưa đạt" badge={{ tone: "danger", text: "Không duyệt được" }} lines={failureLines} testId={`monthly-generation-failure-${lesson.lessonNumber}`}>
        <p className="small muted">Sinh lúc {new Date(failure.failedAt).toLocaleString("vi-VN")} sau {failure.attempts} vòng sửa. {parts.length ? "Bản nháp hiện có vẫn được giữ nguyên; bản AI này nằm cuối trang." : "Bản AI này chưa phải bản nháp nên chưa duyệt được."}</p>
        {editCandidate && <div className="row between operator-monthly-findings-next"><p className="small"><strong>Bước tiếp theo:</strong> Bấm Sửa bản AI này, sửa các mục được báo, lưu rồi duyệt.</p><Button className="operator-lesson-edit-button" disabled={busy} onClick={onEdit}><Pencil className="operator-button-icon" size={16} aria-hidden="true" />Sửa bản AI này</Button></div>}
      </MonthlyFindingsPanel>}
    </div>}
    <div className={`card operator-monthly-lesson${lesson.kind === "review" ? " is-review" : ""}`} data-testid={`monthly-lesson-${lesson.lessonNumber}`}>
      <div className="row between operator-card-header"><h3>{title}</h3></div>
      {exercise && <section className="card operator-practice-review" aria-label="Câu hỏi cần kiểm tra"><OperatorPracticeReview sectionNumber={1} headingText="Câu hỏi cần kiểm tra" part={exercise as never} /></section>}
      {parts.length ? <OperatorLessonPreview cefr={cefr} lessonId={`monthly-${lesson.lessonNumber}`} parts={reviewParts as never} {...(lesson.kind === "review" ? { studyTabLabel: cefr === "A1" || cefr === "A2" ? "Ôn tập" : "Review", collapsibleVocabulary: true, practiceContent: <MonthlyReviewPractice parts={reviewParts} english={!(cefr === "A1" || cefr === "A2")} /> } : {})} /> : <p className="muted">{failure ? "Chưa có bản nháp đạt yêu cầu." : "Nội dung bài chưa tải được."}</p>}
    </div>
    {failedParts.length > 0 && <section className="card operator-monthly-lesson" aria-label="Bản AI chưa đạt" data-testid={`monthly-generation-candidate-${lesson.lessonNumber}`}>
      <div className="row between operator-card-header"><h3>Bản AI chưa đạt</h3><Badge tone="danger">Không duyệt được</Badge></div>
      <OperatorLessonPreview cefr={cefr} lessonId={`monthly-failed-${lesson.lessonNumber}`} parts={failedParts as never} {...(lesson.kind === "review" ? { studyTabLabel: cefr === "A1" || cefr === "A2" ? "Ôn tập" : "Review", collapsibleVocabulary: true, practiceContent: <MonthlyReviewPractice parts={failedParts} english={!(cefr === "A1" || cefr === "A2")} /> } : {})} />
    </section>}
    {requestingReopen && <MonthlyReopenRequest label={lesson.kind === "review" ? "bài ôn" : dayOrdinal ? `bài ${dayOrdinal}` : "bài học"} onCancel={() => setRequestingReopen(false)} onSubmit={async (reason) => { await onRequestReopen?.(reason); setRequestingReopen(false); }} />}
  </OperatorPage>;
}

function MonthlyGenerationConfirmation({ dayNumber, kind, framework, busy, onCancel, onConfirm }: { dayNumber: number; kind: "new" | "review"; framework: MonthlyOperatorOverviewView["frameworks"][number]; busy: boolean; onCancel(): void; onConfirm(): void | Promise<void> }) {
  const carryover = framework.resources?.carryoverReviews?.find(item => item.lessonNumber === dayNumber);
  const resources = { ...framework.resources!, ...(carryover ?? {}) };
  const isReview = kind === "review";
  const day = carryover?.day ?? resources.roadmap?.days.find((item) => item.lessonNumber === dayNumber);
  const teachingLabel = day ? formatMonthlyDayLabel({ ...day, ...(day.kind === "new" ? { newLessonNumber: day.newLessonNumber ?? monthlyNewLessonOrdinal(dayNumber, buildMonthlyCalendar(day.date.slice(0, 7))) } : {}) }) : `bài ngày ${dayNumber}`;
  const coreIds = isReview ? day?.reviewTermIds ?? [] : day?.coreTermIds ?? [];
  const expandedIds = isReview ? day?.reviewExpandedTermIds ?? [] : day?.expandedTermIds ?? [];
  const terms = [...resources.coreTerms, ...resources.supportTerms].filter((term) => [...coreIds, ...expandedIds].includes(term.id));
  const grammarIds = isReview ? day?.reviewGrammarStepIds ?? [] : day?.grammarStepIds ?? [];
  const grammar = resources.grammarTopics.flatMap((topic) => topic.steps).filter((step) => grammarIds.includes(step.id));
  const soundIds = isReview ? day?.reviewSoundIds ?? [] : day?.pronunciationPlan?.targetIds ?? (day?.soundId ? [day.soundId] : []);
  const sounds = resources.sounds.filter((sound) => soundIds.includes(sound.id));
  return <div className="monthly-lesson-preview-backdrop" role="presentation"><section className="monthly-generation-confirmation card" role="dialog" aria-modal="true" aria-label={isReview ? "Tài nguyên cho bài ôn" : `Tài nguyên cho bài ${dayNumber}`}><span className="eyebrow">Tài nguyên đã chốt</span><h2>{isReview ? "Sinh bài ôn?" : `Sinh ${teachingLabel}?`}</h2><p className="small muted">{isReview ? "Bài ôn chỉ dùng các tài nguyên đã phân bổ cho phần ôn." : "Bài sẽ dùng đúng tài nguyên của ngày này."}</p><dl>{day?.grammarPlan && <div><dt>Mục tiêu ngữ pháp</dt><dd>{withoutGrammarStepLabel(day.grammarPlan.objective)}</dd></div>}{day?.pronunciationPlan && <div><dt>Mục tiêu phát âm</dt><dd>{day.pronunciationPlan.objective}</dd></div>}<div><dt>Từ vựng</dt><dd>{terms.map((term) => term.word).join(" · ") || "Chưa gán"}</dd></div><div><dt>Ngữ pháp</dt><dd>{grammar.map((step) => step.focus).join(" · ") || "Chưa gán"}</dd></div><div><dt>Phát âm</dt><dd>{sounds.map((sound) => `${sound.label} ${sound.ipa}`).join(" · ") || "Chưa gán"}</dd></div></dl><footer><button type="button" className="btn" disabled={busy} onClick={onCancel}>Quay lại</button><button type="button" className="btn btn-primary" disabled={busy} aria-busy={busy} aria-label={busy ? "Đang sinh bài" : "Sinh"} onClick={() => void onConfirm()}>{busy ? <span className="spinner" role="status" aria-label="Đang sinh bài" /> : "Sinh"}</button></footer></section></div>;
}

function MonthlyReopenRequest({ label, onCancel, onSubmit }: { label: string; onCancel(): void; onSubmit(reason: string): void }) {
  const [reason, setReason] = useState("");
  const dialogRef = useRef<HTMLElement>(null);
  const reasonRef = useRef<HTMLTextAreaElement>(null);
  useDialog(true, dialogRef, onCancel, reasonRef);
  return <div className="monthly-lesson-preview-backdrop" role="presentation"><section ref={dialogRef} tabIndex={-1} className="monthly-generation-confirmation monthly-reopen-dialog card" role="dialog" aria-modal="true" aria-label={`Yêu cầu mở lại ${label}`}><span className="eyebrow">Nội dung đã khóa</span><h2>Yêu cầu mở lại {label}</h2><p className="small muted">Manager sẽ duyệt hoặc từ chối yêu cầu. Học viên đã hoàn thành vẫn giữ kết quả cũ.</p><label className="monthly-reopen-reason">Lý do yêu cầu mở lại<textarea ref={reasonRef} aria-label="Lý do yêu cầu mở lại" value={reason} onChange={(event) => setReason(event.target.value)} /></label><footer><button type="button" className="btn" onClick={onCancel}>Quay lại</button><button type="button" className="btn btn-primary" onClick={() => onSubmit(reason)}>Gửi yêu cầu Manager</button></footer></section></div>;
}

function GrammarResourcePanel({ topics, roadmap }: {
  topics: NonNullable<MonthlyOperatorOverviewView["frameworks"][number]["resources"]>["grammarTopics"];
  roadmap?: NonNullable<NonNullable<MonthlyOperatorOverviewView["frameworks"][number]["resources"]>["roadmap"]>;
}) {
  const daysFor = (stepId: string) => roadmap?.grammarSteps.find((item) => item.stepId === stepId)?.lessonNumbers ?? [];
  return <><div className="monthly-roadmap-intro"><b>2 chủ điểm · 3 bước mỗi chủ điểm</b><span>Mỗi chủ điểm tiến dần từ cách dùng cơ bản đến ứng dụng trong công việc.</span></div><div className="monthly-resource-roadmap monthly-grammar-roadmap" aria-label="Lộ trình ngữ pháp">
    {topics.map((topic, topicIndex) => <article key={topic.id} className="monthly-roadmap-card monthly-grammar-card"><header><span className="monthly-roadmap-code">Chủ điểm {topicIndex + 1}</span><div><h3>{topic.title}</h3></div></header><div className="monthly-roadmap-steps monthly-grammar-steps">{topic.steps.map((step, index) => <section key={step.id} className="monthly-grammar-step"><span className="monthly-grammar-step-number">Bước {index + 1}</span><h4>{step.focus}</h4>{step.usage && <details className="monthly-grammar-detail"><summary>Ghi chú cách dùng</summary><p>{step.usage}</p></details>}{step.formula && <div className="monthly-grammar-formula"><span>Công thức</span><code>{step.formula}</code></div>}{roadmap?.days.filter(day => day.kind === "new" && day.newLessonNumber && day.newLessonNumber <= 12 && day.grammarStepIds.includes(step.id)).map(day => <p className="small" key={day.lessonNumber}><b>Bài {day.newLessonNumber}</b> {withoutGrammarStepLabel(day.grammarPlan?.objective ?? "")}</p>)}{!roadmap?.allocated && step.dailyObjectives?.map((goal,i) => <p className="small" key={i}><b>Mục tiêu {i + 1}</b> {goal}</p>)}{step.examples.length > 0 && <div className="monthly-grammar-examples"><span>Ví dụ</span><div className="monthly-resource-chips">{step.examples.map((example) => <span key={example}>{example}</span>)}</div></div>}{roadmap?.allocated && <p className="monthly-roadmap-days">Áp dụng: {formatLessonBlocks(daysFor(step.id))}</p>}</section>)}</div></article>)}
  </div></>;
}

function PronunciationResourcePanel({ sounds, roadmap }: {
  sounds: NonNullable<MonthlyOperatorOverviewView["frameworks"][number]["resources"]>["sounds"];
  roadmap?: NonNullable<NonNullable<MonthlyOperatorOverviewView["frameworks"][number]["resources"]>["roadmap"]>;
}) {
  const assignment = (soundId: string) => roadmap?.sounds.find((item) => item.soundId === soundId);
  return <><div className="monthly-roadmap-intro"><b>4 mục tiêu phát âm</b><span>Mỗi thẻ có âm trọng tâm và các từ ví dụ ngắn để luyện tập.</span></div><div className="monthly-resource-pronunciation-grid" aria-label="Lộ trình phát âm">
    {sounds.map((sound, index) => { const allocated = assignment(sound.id); return <article key={sound.id} className="monthly-roadmap-card monthly-pronunciation-card"><header><span className="monthly-roadmap-code">Âm {index + 1}</span><div><h3>{sound.label}</h3><span className="monthly-pronunciation-ipa">{sound.ipa}</span></div></header><div className="monthly-pronunciation-plan"><p className="monthly-pronunciation-purpose">Luyện nhận diện và phát âm {sound.ipa}</p>{roadmap?.allocated && <p className="monthly-roadmap-days">Áp dụng: {formatLessonBlocks(allocated?.lessonNumbers ?? [])}</p>}<div className="monthly-pronunciation-examples"><span>Từ luyện tập</span><div className="monthly-resource-chips" aria-label={`Ví dụ âm ${sound.label}`}>{[0, 1, 2].map(set => <div key={set} className="monthly-pronunciation-example-set"><b>Bộ {set + 1} · {["Nhận diện", "Phân biệt trong từ", "Vận dụng trong câu"][set]}</b><div className="monthly-resource-chips">{sound.examples.slice(set * 3, set * 3 + 3).map(example => <span key={example.id}>{example.word} <em>{example.ipa}</em></span>)}</div></div>)}</div></div></div></article>; })}
  </div></>;
}

function formatLessonBlocks(lessonNumbers: number[]): string {
  if (!lessonNumbers.length) return "Chưa có ngày áp dụng";
  const blocks: string[] = [];
  let first = lessonNumbers[0]!;
  let previous = first;
  for (const lesson of lessonNumbers.slice(1)) {
    if (lesson === previous + 1) { previous = lesson; continue; }
    blocks.push(first === previous ? `N${first}` : `N${first}–N${previous}`);
    first = previous = lesson;
  }
  blocks.push(first === previous ? `N${first}` : `N${first}–N${previous}`);
  return blocks.join(", ");
}
function VocabularyPanel({ items, variant, registerCores = [] }: { items: Array<{ id: string; word: string; meaning: string; ipa?: string }>; variant: "core" | "expanded"; registerCores?: Array<{ id: string; word: string; registerTerms?: Array<{ kind: "slang" | "poetic"; word: string; definition: string }> | undefined }> }) {
  const grouped = groupVocabularyForDisplay(items);
  const visible = variant === "expanded" ? [...grouped.standalone, ...grouped.phrases] : items;
  const phraseCount = grouped.phrases.length;
  const registerTerms = variant === "expanded" ? registerCores.flatMap((core) => (core.registerTerms ?? []).map((term) => ({ ...term, coreId: core.id, coreWord: core.word }))) : [];
  return <>
    <section className="monthly-vocabulary-guidance" aria-label={variant === "core" ? "Quy tắc từ cốt lõi" : "Quy tắc từ mở rộng"}>
      {variant === "core"
        ? <><b>Headword đơn</b><span>Mỗi mục là một từ độc lập; dùng làm từ trọng tâm của tháng.</span></>
        : <><b>{grouped.standalone.length} từ đơn ưu tiên</b><span>{phraseCount ? `${phraseCount} cụm bổ trợ tự nhiên được đặt sau từ đơn.` : "Không có cụm từ trong bộ này."}</span></>}
    </section>
    <ol className={`monthly-resource-collection ${variant}`}>{visible.map((item, index) => {
      const standalone = isStandaloneWord(item.word);
      return <li key={item.id} className={standalone ? "standalone" : "phrase"}><i>{index + 1}</i><b>{item.word}</b><small>{variant === "core" ? "Headword" : standalone ? "Từ đơn" : "Cụm bổ trợ"}</small><span>{item.meaning}</span>{item.ipa && <em>{item.ipa}</em>}</li>;
    })}{registerTerms.map((term, index) => <li key={`${term.coreId}-${term.kind}-${term.word}`} className="register"><i>{visible.length + index + 1}</i><b>{term.word}</b><small>{term.kind === "slang" ? "Khẩu ngữ" : "Văn phong"} · {term.coreWord}</small><span>{term.definition}</span></li>)}</ol>
  </>;
}

function calendarGrid(month: string, calendar: ReturnType<typeof buildMonthlyCalendar>) {
  const [year, index] = month.split("-").map(Number) as [number, number];
  const dayCount = new Date(Date.UTC(year, index, 0)).getUTCDate();
  const leading = (new Date(Date.UTC(year, index - 1, 1)).getUTCDay() + 6) % 7;
  const lessonByDate = new Map(calendar.effectiveDays.map((date, lessonNumber) => [date, lessonNumber + 1]));
  const previousMonthDays = new Date(Date.UTC(year, index - 1, 0)).getUTCDate();
  return Array.from({ length: Math.ceil((leading + dayCount) / 7) * 7 }, (_, offset) => {
    const number = offset - leading + 1;
    if (number < 1) {
      const date = new Date(Date.UTC(year, index - 2, previousMonthDays + number));
      return { key: `previous-${previousMonthDays + number}`, dateLabel: formatCalendarDay(date), outside: true };
    }
    if (number > dayCount) {
      const date = new Date(Date.UTC(year, index, number - dayCount));
      return { key: `next-${number - dayCount}`, dateLabel: formatCalendarDay(date), outside: true };
    }
    const date = `${month}-${String(number).padStart(2, "0")}`;
    return { key: date, date, dateLabel: String(number).padStart(2, "0"), number, lessonNumber: lessonByDate.get(date), outside: false };
  });
}

function formatCalendarDay(date: Date) {
  return String(date.getUTCDate()).padStart(2, "0");
}

function toResourceCounts(criteria: Pick<MonthlyResourceCriteria, "vocabularyCount" | "expandedVocabularyCount" | "grammarTopicCount" | "pronunciationSoundCount">) {
  return { core: criteria.vocabularyCount, expanded: criteria.expandedVocabularyCount, grammar: criteria.grammarTopicCount, sounds: criteria.pronunciationSoundCount };
}
