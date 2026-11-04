import { useEffect, useMemo, useState } from "react";
import type { AssessmentLevelFormUpdateInput, CefrLevel, MonthlyOperatorOverviewView, MonthlyQualityFindingView } from "@e4s/contracts";
import { buildMonthlyCalendar, monthlyDayKind, monthlyNewLessonOrdinal, recommendedMonthlyResourceCriteria, type MonthlyCurriculumContract } from "@e4s/domain/monthly";
import { useToast } from "../shared/design-system.js";
import { OperatorLessonPreview } from "./adapters.js";
import { WeeklyPracticeEditor } from "./Review.js";
import type { ReviewWeeklyPractice } from "./types.js";
import type { MonthlyResourceCheckpointView } from "../../api/operator.js";
import { groupVocabularyForDisplay, isStandaloneWord } from "./resource-display.js";
import "./months.css";

type MonthlyBriefInput = { title: string; brief: string; context: string; communicationGoal: string };
type MonthlyDayInput = { title: string; parts: Array<{ code: string; title?: string; content: Record<string, unknown> }> };
type MonthlyQualityReport = { severe: MonthlyQualityFindingView[]; light: MonthlyQualityFindingView[]; contractVersion: number };
type MonthlyResourceCriteria = { cefr: CefrLevel; vocabularyCount: number; expandedVocabularyCount: number; grammarTopicCount: number; pronunciationSoundCount: number };
type ResourceGroup = "core" | "expanded" | "grammar" | "sounds" | "plan";
type MonthlyFinalDraft = { versionId: string; status: "draft"; blueprint: AssessmentLevelFormUpdateInput };

export interface OperatorMonthsActions {
  onSelectMonth(month: string): void;
  onSelectLevel(level: CefrLevel): void;
  onSuggestBrief(month: string): Promise<MonthlyBriefInput>;
  onSaveBrief(month: string, input: MonthlyBriefInput): Promise<void> | void;
  onApproveBrief(month: string): Promise<void> | void;
  onGenerateFramework(month: string, criteria: MonthlyResourceCriteria): Promise<unknown> | void;
  onSaveFramework(month: string, contract: MonthlyCurriculumContract): Promise<void> | void;
  onApproveFramework(id: string): Promise<void> | void;
  onGenerateMonthlyFinal?(id: string): Promise<MonthlyFinalDraft> | void;
  onSaveMonthlyFinal?(versionId: string, input: AssessmentLevelFormUpdateInput): Promise<unknown> | void;
  onPublishMonthlyFinal?(versionId: string): Promise<unknown> | void;
  onSynthesizeMonthlyFinalAudio?(input: { text: string; voice: string }): Promise<{ filename: string; mimeType: string; base64: string }>;
  onUploadMonthlyFinalAudio?(file: Blob, filename: string): Promise<{ url: string }>;
  onComposeDay?(id: string, dayNumber: number): void;
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

export function OperatorMonths({ month, todayMonth, overview, cefr, busy, readOnly = false, error, resourceCheckpoint, actions }: OperatorMonthsProps) {
  const toast = useToast();
  const framework = overview.frameworks.find((item) => item.cefr === cefr);
  const calendar = useMemo(() => buildMonthlyCalendar(month), [month]);
  const [brief, setBrief] = useState<MonthlyBriefInput>(emptyBrief);
  const [resourcePanel, setResourcePanel] = useState<ResourceGroup | null>(null);
  const [generationConfirmation, setGenerationConfirmation] = useState<{ dayNumber: number; kind: "new" | "review" }>();
  const [monthlyFinal, setMonthlyFinal] = useState<MonthlyFinalDraft | null>(null);
  const briefLocked = overview.brief?.status === "approved";
  const monthChoices = [overview.monthWindow.previous, overview.monthWindow.current, overview.monthWindow.next];
  const previousMonth = month === monthChoices[0];
  const canEdit = !readOnly && overview.monthWindow.writable && !previousMonth;
  const proposedResourceCounts = toResourceCounts(recommendedMonthlyResourceCriteria(month, cefr));
  const resourceCounts = framework?.resources ? {
    core: framework.resources.coreTerms.length,
    expanded: framework.resources.supportTerms.length,
    grammar: framework.resources.grammarTopics.length,
    sounds: framework.resources.sounds.length
  } : proposedResourceCounts;
  const resources = [
    { key: "core" as const, label: "Từ cốt lõi", count: framework?.resources?.coreTerms.length ?? 0, description: "Headword trọng tâm" },
    { key: "expanded" as const, label: "Từ mở rộng", count: framework?.resources?.supportTerms.length ?? 0, description: "Ưu tiên từ đơn; tối đa một cụm mỗi từ" },
    { key: "grammar" as const, label: "Ngữ pháp", count: framework?.resources?.grammarTopics.length ?? 0, description: "Điểm ngữ pháp cần dùng" },
    { key: "sounds" as const, label: "Phát âm", count: framework?.resources?.sounds.length ?? 0, description: "Âm và ví dụ thực hành" }
  ];
  useEffect(() => {
    setBrief(overview.brief ? {
      title: overview.brief.title,
      brief: overview.brief.brief,
      context: overview.brief.context,
      communicationGoal: overview.brief.communicationGoal
    } : emptyBrief());
  }, [overview.brief]);
  const showUnavailable = (message: string) => toast.show({ message, tone: "danger" });
  const generateFramework = async () => {
    if (!canEdit) return showUnavailable("Tháng trước chỉ dùng để xem.");
    if (!briefLocked) return showUnavailable("Hãy chốt chủ đề tháng trước khi sinh tài nguyên.");
    try {
      await actions.onGenerateFramework(month, { cefr, vocabularyCount: resourceCounts.core, expandedVocabularyCount: resourceCounts.expanded, grammarTopicCount: resourceCounts.grammar, pronunciationSoundCount: resourceCounts.sounds });
      toast.show({ message: "Đã sinh tài nguyên tháng.", tone: "ok" });
    } catch {
      showUnavailable("Không sinh được tài nguyên tháng. Hãy thử lại.");
    }
  };
  const generateDay = async (dayNumber: number, kind: "new" | "review") => {
    if (!canEdit) return showUnavailable("Tháng trước chỉ dùng để xem.");
    if (!framework || framework.status !== "approved") return showUnavailable("Hãy chốt tài nguyên tháng trước khi sinh bài học.");
    try {
      if (kind === "review") {
        if (!actions.onGenerateReview) return showUnavailable("Luồng sinh bài ôn chưa sẵn sàng.");
        await actions.onGenerateReview(framework.id, dayNumber);
        toast.show({ message: "Đã sinh bản nháp bài ôn. Hãy duyệt trước khi học viên học.", tone: "ok" });
      } else {
        await actions.onGenerateDay(framework.id, dayNumber);
        toast.show({ message: `Đã sinh bài học ngày ${dayNumber}.`, tone: "ok" });
      }
    } catch {
      showUnavailable("Không sinh được bài học. Hãy thử lại.");
    }
  };
  const openManualEditor = (dayNumber: number) => {
    if (!canEdit) return showUnavailable("Tháng trước chỉ dùng để xem.");
    if (!framework || framework.status !== "approved") return showUnavailable("Hãy chốt tài nguyên tháng trước khi soạn bài học.");
    if (!actions.onComposeDay) return showUnavailable("Màn biên soạn bài tháng chưa sẵn sàng.");
    actions.onComposeDay(framework.id, dayNumber);
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
    try { await actions.onApproveBrief(month); toast.show({ message: "Đã chốt chủ đề tháng.", tone: "ok" }); }
    catch { showUnavailable("Không chốt được chủ đề tháng. Hãy thử lại."); }
  };
  const approveFramework = async () => {
    if (!canEdit) return showUnavailable("Tháng trước chỉ dùng để xem.");
    if (!framework) return showUnavailable("Hãy sinh tài nguyên tháng trước khi duyệt.");
    try {
      await actions.onApproveFramework(framework.id);
      toast.show({ message: "Đã duyệt tài nguyên tháng.", tone: "ok" });
    } catch {
      showUnavailable("Không duyệt được tài nguyên tháng. Hãy thử lại.");
    }
  };
  const generateMonthlyFinal = async () => {
    if (!canEdit) return showUnavailable("Tháng trước chỉ dùng để xem.");
    if (!framework || framework.status !== "approved") return showUnavailable("Hãy chốt tài nguyên tháng trước khi sinh đề thi.");
    if (!actions.onGenerateMonthlyFinal) return showUnavailable("Luồng đề thi tháng chưa sẵn sàng.");
    try {
      const draft = await actions.onGenerateMonthlyFinal(framework.id);
      if (draft?.blueprint) setMonthlyFinal(draft);
      toast.show({ message: "Đã sinh bản nháp đề tháng. Thêm audio, xem lại và phát hành trước khi học viên vào thi.", tone: "ok" });
    }
    catch { showUnavailable("Chỉ sinh đề thi vào đúng ngày thi hệ thống và khi tài nguyên đã duyệt."); }
  };
  return <main className="operator-months-page">
    <header className="operator-months-header"><h1>Bài học</h1><p>Thiết kế chủ đề, tài nguyên và lịch học theo tháng.</p></header>
    {error && <div className="monthly-error" role="alert">{error}</div>}
    <section className="monthly-month-card card">
      <h2 className="monthly-cycle-title">Chu kỳ tháng</h2>
      <div className="monthly-month-tabs" role="tablist">
        {monthChoices.map((choice) => <button key={choice} type="button" role="tab" aria-selected={choice === month} className={choice === month ? "selected" : ""} onClick={() => actions.onSelectMonth(choice)}>
          {monthLabel(choice)}{choice === monthChoices[0] && <small>Chỉ xem</small>}
        </button>)}
      </div>
    </section>
    <section className="monthly-topic-card card">
      <div className="monthly-section-title"><div><span className="eyebrow">Nội dung chung</span><h2>Chủ đề tháng</h2></div><span className="monthly-version">{briefLocked ? "Đã chốt" : overview.brief ? "Đang soạn" : "Chưa có"}</span></div>
      <div className="monthly-topic-grid">
        <label>Tiêu đề<input value={brief.title} disabled={!canEdit || busy} onChange={(event) => setBrief({ ...brief, title: event.target.value })} /></label>
        <label>Mô tả<textarea value={brief.brief} disabled={!canEdit || busy} onChange={(event) => setBrief({ ...brief, brief: event.target.value })} /></label>
        <label>Bối cảnh<textarea value={brief.context} disabled={!canEdit || busy} onChange={(event) => setBrief({ ...brief, context: event.target.value })} /></label>
        <label>Mục tiêu giao tiếp<textarea value={brief.communicationGoal} disabled={!canEdit || busy} onChange={(event) => setBrief({ ...brief, communicationGoal: event.target.value })} /></label>
      </div>
      <div className="monthly-actions">
        <button type="button" className="btn" disabled={busy} onClick={() => void suggestBrief()}>Gợi ý AI</button>
        <button type="button" className="btn" disabled={busy} onClick={() => void saveBrief()}>Lưu chủ đề</button>
        <button type="button" className="btn btn-primary" disabled={busy} onClick={() => void approveBrief()}>Chốt chủ đề</button>
      </div>
      <div className="monthly-level-tabs" role="tablist" aria-label="Chọn trình độ">{LEVELS.map((level) => <button key={level} type="button" role="tab" aria-selected={level === cefr} className={level === cefr ? "selected" : ""} onClick={() => selectLevel(level)}>{level}</button>)}</div>
    </section>
    <div className="monthly-workspace">
      <section className="monthly-resources card">
        <div className="monthly-section-title"><div><span className="eyebrow">{cefr}</span><h2>Tài nguyên tháng</h2></div><span className={`monthly-status ${framework?.status ?? "missing"}`}>{frameworkStatus(framework?.status)}</span></div>
        <p className="small muted">AI chuẩn bị một bộ tài nguyên thống nhất cho cả tháng.</p>
        {!framework?.resources ? <div className="monthly-resource-proposal" aria-label="Số lượng đề xuất theo lịch học">
          <span className="eyebrow">Số lượng đề xuất theo lịch học</span>
          <dl>
            <div><dt>Từ cốt lõi</dt><dd>{resourceCounts.core}</dd></div>
            <div><dt>Từ mở rộng</dt><dd>{resourceCounts.expanded}</dd></div>
            <div><dt>Chủ điểm ngữ pháp</dt><dd>{resourceCounts.grammar}</dd></div>
            <div><dt>Mục tiêu phát âm</dt><dd>{resourceCounts.sounds}</dd></div>
          </dl>
        </div> : <div className="monthly-resource-cards">{resources.map((item) => <button key={item.key} type="button" onClick={() => setResourcePanel(item.key)}><b>{item.count}</b><strong>{item.label}</strong><span>{item.description}</span></button>)}</div>}
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
          {framework?.status !== "approved" && <button type="button" className="btn btn-primary" disabled={busy} onClick={() => void generateFramework()}>{resourceCheckpoint?.state === "draft_checkpoint" && !framework?.resources ? "Tiếp tục nhóm còn thiếu" : framework?.resources ? "Sinh lại tài nguyên" : "Sinh tài nguyên"}</button>}
          {framework?.status === "draft" && <button type="button" className="btn" disabled={busy} onClick={() => void approveFramework()}>Duyệt tài nguyên</button>}
          {framework?.resources?.roadmap?.allocated && <button type="button" className="btn monthly-plan-open-button" onClick={() => setResourcePanel("plan")}>Phân bổ tài nguyên &amp; bài tập</button>}
        </div>
      </section>
      <section className="monthly-calendar-section card">
        <div className="monthly-section-title"><div><span className="eyebrow">{cefr}</span><h2>Lịch học {monthLabel(month)}</h2></div><div className="monthly-calendar-legend"><span className="lesson">Học mới</span><span className="review">Ôn tập</span><span className="weekend">Nghỉ</span><span className="final">Bài thi tháng</span></div></div>
        <div className="monthly-calendar" role="grid" aria-label={`Lịch tháng ${month.slice(5, 7)}/${month.slice(0, 4)}`}>
          {WEEKDAYS.map((label) => <div key={label} role="columnheader" className="monthly-weekday">{label}</div>)}
          {calendarGrid(month, calendar).map((cell) => {
            if (cell.outside) return <article key={cell.key} role="gridcell" aria-disabled="true" className="monthly-day-cell outside-month"><b>{cell.dateLabel}</b></article>;
            const isExam = cell.date === calendar.examDate;
            const lesson = framework?.lessons.find((item) => item.lessonDate === cell.date);
            // The persisted lesson is the DaySpec projection. Its date, number, and kind
            // drive the calendar after resources exist; do not infer review slots from weekdays.
            const scheduledLessonNumber = lesson?.lessonNumber ?? cell.lessonNumber;
            if (isExam) {
              const examDayOpen = overview.systemDate === calendar.examDate;
              return <article key={cell.date} role="gridcell" className="monthly-day-cell monthly-final"><b>{cell.dateLabel}</b><strong>Bài thi</strong><button type="button" className="btn-sm" disabled={busy || !examDayOpen} title={examDayOpen ? "Sinh bản nháp đề thi tháng" : `Mở vào ngày thi ${cell.dateLabel}`} onClick={() => void generateMonthlyFinal()}>{examDayOpen ? "Sinh đề thi" : "Chờ ngày thi"}</button></article>;
            }
            if (!scheduledLessonNumber) return <article key={cell.date} role="gridcell" className="monthly-day-cell weekend"><b>{cell.dateLabel}</b><strong>Nghỉ</strong></article>;
            const scheduledKind = lesson?.kind ?? monthlyDayKind(scheduledLessonNumber, calendar.lessonCount);
            const kind = scheduledKind === "review" ? "review" : "lesson";
            const draft = lesson?.status === "draft";
            const isReview = scheduledKind === "review";
            const newLessonOrdinal = isReview ? null : monthlyNewLessonOrdinal(scheduledLessonNumber, calendar.lessonCount);
            const dayLabel = isReview ? "bài ôn" : `bài ${newLessonOrdinal}`;
            return <article key={cell.date} role="gridcell" aria-label={`${cell.dateLabel}, ${isReview ? "Ôn tập" : `Bài ${newLessonOrdinal}`}`} className={`monthly-day-cell ${kind} ${lesson?.status === "approved" ? "approved" : ""}`}><b>{cell.dateLabel}</b><strong>{isReview ? "Ôn tập" : `Bài ${newLessonOrdinal}`}</strong><div>{lesson?.status === "approved" ? <><button type="button" aria-label={`Xem ${dayLabel}`} className="btn-sm monthly-view-day" disabled={busy} onClick={() => framework && actions.onViewDay?.(framework.id, lesson.lessonNumber)}>Xem</button></> : draft ? <><button type="button" aria-label={`Soạn tay ${dayLabel}`} title="Soạn tay" className="btn-sm monthly-manual-action" disabled={busy} onClick={() => openManualEditor(scheduledLessonNumber)}>✎ Soạn tay</button><button type="button" aria-label={`Duyệt ${dayLabel}`} className="btn-sm" disabled={busy} onClick={() => framework && void actions.onApproveDay(framework.id, scheduledLessonNumber)}>Duyệt</button></> : <><button type="button" aria-label={isReview ? "Sinh" : `Sinh ${dayLabel}`} className="btn-sm btn-primary" disabled={busy} onClick={() => setGenerationConfirmation({ dayNumber: scheduledLessonNumber, kind: isReview ? "review" : "new" })}>{"Sinh"}</button><button type="button" aria-label={`Soạn tay ${dayLabel}`} title="Soạn tay" className="btn-sm monthly-manual-action" disabled={busy} onClick={() => openManualEditor(scheduledLessonNumber)}>✎ Soạn tay</button></>}</div></article>;
          })}
        </div>
      </section>
      {framework?.resources && resourcePanel && <section className="monthly-resource-panel card" role="dialog" aria-modal="false" aria-label={resourcePanel === "plan" ? "Phân bổ tài nguyên và bài tập" : "Tài nguyên tháng"}>
        <header><div><span className="eyebrow">Tài nguyên tháng</span><h2>{resourcePanel === "plan" ? "Phân bổ tài nguyên & bài tập" : resources.find((item) => item.key === resourcePanel)?.label}</h2></div><button type="button" className="btn-sm" aria-label="Đóng tài nguyên" onClick={() => setResourcePanel(null)}>Đóng</button></header>
        {resourcePanel === "core" && <VocabularyPanel items={framework.resources.coreTerms} variant="core" />}
        {resourcePanel === "expanded" && <VocabularyPanel items={framework.resources.supportTerms} variant="expanded" />}
        {resourcePanel === "grammar" && <GrammarResourcePanel topics={framework.resources.grammarTopics} {...(framework.resources.roadmap ? { roadmap: framework.resources.roadmap } : {})} />}
        {resourcePanel === "sounds" && <PronunciationResourcePanel sounds={framework.resources.sounds} {...(framework.resources.roadmap ? { roadmap: framework.resources.roadmap } : {})} />}
        {resourcePanel === "plan" && framework.resources.roadmap?.allocated && <div className="monthly-plan-inspector" aria-label="Phân bổ tài nguyên và bài tập"><p className="small muted">Kế hoạch đã chốt. Đây là sơ đồ phân bổ; nội dung bài học chưa được sinh.</p><div className="monthly-plan-days">{framework.resources.roadmap.days.map((day) => {
          const coreTerms = framework.resources!.coreTerms.filter((term) => day.kind === "new" ? day.coreTermIds.includes(term.id) : day.reviewTermIds.includes(term.id));
          const expandedTerms = framework.resources!.supportTerms.filter((term) => day.kind === "new" ? day.expandedTermIds.includes(term.id) : day.reviewExpandedTermIds.includes(term.id));
          return <details key={day.lessonNumber} className="monthly-plan-day">
            <summary className="monthly-plan-day-summary"><div><span className="eyebrow">{day.kind === "review" ? "Ôn tập tuần" : `Bài mới ${monthlyNewLessonOrdinal(day.lessonNumber, calendar.lessonCount)}`}</span><h3>{day.date}</h3></div><span className="monthly-plan-day-open">Xem phân bổ</span></summary>
            <div className="monthly-plan-day-body"><div className="monthly-plan-resource-groups">{coreTerms.map((core) => <div key={core.id} className="monthly-plan-resource-group"><strong>{core.word}</strong><span>{expandedTerms.filter((term) => term.relatedCoreTermId === core.id).map((term) => term.word).join(" · ")}</span></div>)}</div><small>Ngữ pháp: {day.grammarStepIds.join(" + ")} · Phát âm: {day.pronunciationSlot ?? "—"}</small></div>
          </details>;
        })}</div></div>}
      </section>}
    </div>
    {generationConfirmation && framework?.resources && <MonthlyGenerationConfirmation dayNumber={generationConfirmation.dayNumber} kind={generationConfirmation.kind} framework={framework} onCancel={() => setGenerationConfirmation(undefined)} onConfirm={async () => { const generation = generationConfirmation; await generateDay(generation.dayNumber, generation.kind); setGenerationConfirmation(undefined); }} />}
    {monthlyFinal && <MonthlyFinalEditor
      draft={monthlyFinal}
      onClose={() => setMonthlyFinal(null)}
      {...(actions.onSaveMonthlyFinal ? { onSave: async (input: AssessmentLevelFormUpdateInput) => { await actions.onSaveMonthlyFinal!(monthlyFinal.versionId, input); setMonthlyFinal((current) => current ? { ...current, blueprint: input } : current); toast.show({ message: "Đã lưu bản nháp đề tháng.", tone: "ok" }); } } : {})}
      {...(actions.onPublishMonthlyFinal ? { onPublish: async () => { await actions.onPublishMonthlyFinal!(monthlyFinal.versionId); toast.show({ message: "Đã phát hành đề tháng.", tone: "ok" }); setMonthlyFinal(null); } } : {})}
      {...(actions.onSynthesizeMonthlyFinalAudio ? { synthesize: actions.onSynthesizeMonthlyFinalAudio } : {})}
      {...(actions.onUploadMonthlyFinalAudio ? { uploadAudio: actions.onUploadMonthlyFinalAudio } : {})}
    />}
  </main>;
}

function MonthlyFinalEditor({ draft, onClose, onSave, onPublish, synthesize, uploadAudio }: {
  draft: MonthlyFinalDraft;
  onClose(): void;
  onSave?(input: AssessmentLevelFormUpdateInput): Promise<void>;
  onPublish?(): Promise<void>;
  synthesize?: (input: { text: string; voice: string }) => Promise<{ filename: string; mimeType: string; base64: string }>;
  uploadAudio?: (file: Blob, filename: string) => Promise<{ url: string }>;
}) {
  const [input, setInput] = useState<AssessmentLevelFormUpdateInput>(() => structuredClone(draft.blueprint));
  const [busy, setBusy] = useState<"save" | "publish" | "audio" | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => { setInput(structuredClone(draft.blueprint)); setError(null); }, [draft]);
  const listeningIndex = input.sections.findIndex((section) => section.code === "listening");
  const listening = listeningIndex >= 0 ? input.sections[listeningIndex] : undefined;
  const group = listening?.groups[0];
  const script = group?.stimulus?.type === "audio_script" ? group.stimulus.lines?.map((line) => line.text).filter(Boolean).join("\n") ?? "" : "";
  const audioSrc = group?.stimulus?.type === "audio_script" ? group.stimulus.audioSrc ?? "" : "";
  const setAudio = (url: string) => setInput((current) => ({ ...current, sections: current.sections.map((section, index) => index !== listeningIndex ? section : ({ ...section, groups: section.groups.map((item, groupIndex) => groupIndex !== 0 ? item : ({ ...item, stimulus: item.stimulus?.type === "audio_script" ? { ...item.stimulus, audioSrc: url } : { type: "audio_script", audioSrc: url, lines: [{ speaker: "Narrator", text: item.instruction }] } })) })) }));
  const persistAudio = async (file: Blob, filename: string) => {
    if (!uploadAudio) throw new Error("UPLOAD_UNAVAILABLE");
    const stored = await uploadAudio(file, filename);
    if (!stored.url) throw new Error("AUDIO_UPLOAD_FAILED");
    setAudio(stored.url);
  };
  const generateEdgeTts = async () => {
    if (!synthesize || !script.trim()) { setError("Chưa có script nghe để tạo audio."); return; }
    setBusy("audio"); setError(null);
    try {
      const generated = await synthesize({ text: script, voice: "en-US-AvaMultilingualNeural" });
      const bytes = Uint8Array.from(atob(generated.base64), (character) => character.charCodeAt(0));
      await persistAudio(new Blob([bytes], { type: generated.mimeType }), generated.filename);
    } catch { setError("Không tạo hoặc lưu được audio Edge TTS trên máy chủ."); }
    finally { setBusy(null); }
  };
  const upload = async (file: File | undefined) => {
    if (!file) return;
    setBusy("audio"); setError(null);
    try { await persistAudio(file, file.name); } catch { setError("Không tải và lưu được file audio."); } finally { setBusy(null); }
  };
  const save = async () => { if (!onSave) return; setBusy("save"); setError(null); try { await onSave(input); } catch { setError("Không lưu được bản nháp đề tháng."); } finally { setBusy(null); } };
  const publish = async () => { if (!onPublish) return; if (!audioSrc) { setError("Cần audio nghe đã lưu trước khi phát hành."); return; } setBusy("publish"); setError(null); try { await onPublish(); } catch { setError("Không phát hành được đề tháng. Kiểm tra lại script, audio và cấu trúc đề."); } finally { setBusy(null); } };
  return <div className="modal-backdrop" role="presentation"><section className="dialog" role="dialog" aria-modal="true" aria-label="Bản nháp đề thi tháng"><header className="row between"><div><span className="eyebrow">Bài thi tháng</span><h2>{input.title}</h2><p className="small muted">30 phút · 100 điểm · Nghe, Đọc, Viết, Nói. Nội dung lấy từ tài nguyên tháng đã duyệt.</p></div><button type="button" className="btn" onClick={onClose}>Đóng</button></header>
    <section className="card flat"><h3>Audio phần nghe</h3><p className="small muted">Script được sinh từ tài nguyên tháng. Chọn file đã chuẩn bị hoặc tạo Edge TTS rồi lưu vào kho audio trước khi phát hành.</p><pre className="monthly-final-script">{script || "Chưa có script nghe"}</pre>{audioSrc ? <audio controls preload="metadata" src={audioSrc}>Trình duyệt không hỗ trợ audio.</audio> : <p className="small muted">Chưa có audio đã lưu.</p>}<div className="row" style={{ flexWrap: "wrap", gap: 8 }}><label className="btn">Tải file audio<input hidden type="file" accept="audio/*" aria-label="Tải file audio đề tháng" disabled={busy === "audio"} onChange={(event) => void upload(event.target.files?.[0])} /></label><button type="button" className="btn" disabled={busy === "audio" || !synthesize || !uploadAudio || !script.trim()} onClick={() => void generateEdgeTts()}>{busy === "audio" ? "Đang tạo audio…" : "Sinh audio Edge TTS"}</button></div></section>
    <section className="card flat"><h3>Kiểm tra trước phát hành</h3><ul className="small"><li>Audio nghe: {audioSrc ? "đã lưu, có thể nghe thử" : "chưa có"}</li><li>Cấu trúc: {input.sections.length} kỹ năng, 100 điểm.</li></ul></section>{error && <p role="alert" className="monthly-error">{error}</p>}<footer className="row" style={{ justifyContent: "flex-end", gap: 8 }}><button type="button" className="btn" disabled={busy !== null || !onSave} onClick={() => void save()}>{busy === "save" ? "Đang lưu…" : "Lưu bản nháp"}</button><button type="button" className="btn btn-primary" disabled={busy !== null || !onPublish || !audioSrc} onClick={() => void publish()}>{busy === "publish" ? "Đang phát hành…" : "Duyệt & phát hành"}</button></footer>
  </section></div>;
}

export function MonthlyLessonPreview({ date, cefr, lesson, onClose, onRequestReopen }: { date: string; cefr: CefrLevel; lesson: MonthlyOperatorOverviewView["frameworks"][number]["lessons"][number]; onClose(): void; onRequestReopen?(reason: string): Promise<void> }) {
  const [requestingReopen, setRequestingReopen] = useState(false);
  const parts = lesson.content?.parts ?? [];
  const dateLabel = `${date.slice(8, 10)}/${date.slice(5, 7)}`;
  const title = lesson.kind === "review" ? "Ôn tập" : lesson.content?.title || `Bài ${lesson.lessonNumber}`;
  const reviewParts = parts.map((part) => ({ code: part.code ?? "instruction", title: part.title ?? part.code ?? "Nội dung", content: part.content ?? {} }));
  const reviewSeed: ReviewWeeklyPractice = { id: `month-${lesson.lessonNumber}`, week: 0, cefr, topic: title, status: "approved", version: 1, task: String(reviewParts.find((part) => part.code === "writing")?.content.prompt ?? reviewParts.find((part) => part.code === "instruction")?.content.text ?? ""), guidance: String(reviewParts.find((part) => part.code === "instruction")?.content.guidance ?? ""), requiredVocabulary: [] };
  return <main className="operator-monthly-legacy-preview"><div className="monthly-preview-actions"><button type="button" className="btn" onClick={onClose}>← Về lịch tháng</button>{onRequestReopen && <button type="button" className="btn" onClick={() => setRequestingReopen(true)}>Yêu cầu mở lại</button>}</div><header className="card operator-monthly-legacy-heading"><span className="eyebrow">Bài đã duyệt</span><h1>{dateLabel} · {title}</h1><p className="small muted">{cefr} · Nội dung vận hành theo ngày</p></header>{lesson.kind === "review" && <WeeklyPracticeEditor item={reviewSeed} readOnly contextLabel={`Ôn tập ngày ${dateLabel}`} headingLabel={`Ngày ${dateLabel} · Ôn tập`} onSave={async () => undefined} />}{parts.length ? <section className="card operator-monthly-legacy-content"><OperatorLessonPreview cefr={cefr} lessonId={`monthly-${lesson.lessonNumber}`} parts={reviewParts as never} /></section> : <p className="card muted">Nội dung bài đã duyệt chưa tải được.</p>}{requestingReopen && <MonthlyReopenRequest label={lesson.kind === "review" ? "bài ôn" : `bài ${lesson.lessonNumber}`} onCancel={() => setRequestingReopen(false)} onSubmit={async (reason) => { await onRequestReopen?.(reason); setRequestingReopen(false); }} />}</main>;
}

function MonthlyGenerationConfirmation({ dayNumber, kind, framework, onCancel, onConfirm }: { dayNumber: number; kind: "new" | "review"; framework: MonthlyOperatorOverviewView["frameworks"][number]; onCancel(): void; onConfirm(): void | Promise<void> }) {
  const resources = framework.resources!;
  const terms = [...resources.coreTerms, ...resources.supportTerms].filter((term) => term.dayNumber === dayNumber);
  const grammar = resources.grammarTopics.filter((_, index) => Math.min(resources.grammarTopics.length - 1, Math.floor((dayNumber - 1) * resources.grammarTopics.length / Math.max(framework.lessons.length || 20, 1))) === index);
  const sounds = resources.sounds.filter((_, index) => (dayNumber - 1) % resources.sounds.length === index);
  const isReview = kind === "review";
  return <div className="monthly-lesson-preview-backdrop" role="presentation"><section className="monthly-generation-confirmation card" role="dialog" aria-modal="true" aria-label={isReview ? "Tài nguyên cho bài ôn" : `Tài nguyên cho bài ${dayNumber}`}><span className="eyebrow">Tài nguyên đã chốt</span><h2>{isReview ? "Sinh bài ôn?" : `Sinh bài ngày ${dayNumber}?`}</h2><p className="small muted">{isReview ? "Bài ôn dùng toàn bộ tài nguyên và bài ngày của tuần này." : "Bài sẽ dùng đúng tài nguyên của ngày này."}</p><dl><div><dt>Từ vựng</dt><dd>{terms.map((term) => term.word).join(" · ") || "Chưa gán"}</dd></div><div><dt>Ngữ pháp</dt><dd>{grammar.map((item) => item.title).join(" · ") || "Chưa gán"}</dd></div><div><dt>Phát âm</dt><dd>{sounds.map((item) => item.label).join(" · ") || "Chưa gán"}</dd></div></dl><footer><button type="button" className="btn" onClick={onCancel}>Quay lại</button><button type="button" className="btn btn-primary" onClick={() => void onConfirm()}>{"Sinh"}</button></footer></section></div>;
}

function MonthlyReopenRequest({ label, onCancel, onSubmit }: { label: string; onCancel(): void; onSubmit(reason: string): void }) {
  const [reason, setReason] = useState("");
  return <div className="monthly-lesson-preview-backdrop" role="presentation"><section className="monthly-generation-confirmation card" role="dialog" aria-modal="true" aria-label={`Yêu cầu mở lại ${label}`}><span className="eyebrow">Nội dung đã khóa</span><h2>Yêu cầu mở lại {label}</h2><p className="small muted">Manager sẽ duyệt hoặc từ chối yêu cầu. Học viên đã hoàn thành vẫn giữ kết quả cũ.</p><label className="monthly-reopen-reason">Lý do yêu cầu mở lại<textarea aria-label="Lý do yêu cầu mở lại" value={reason} onChange={(event) => setReason(event.target.value)} /></label><footer><button type="button" className="btn" onClick={onCancel}>Quay lại</button><button type="button" className="btn btn-primary" onClick={() => onSubmit(reason)}>Gửi yêu cầu Manager</button></footer></section></div>;
}

function GrammarResourcePanel({ topics, roadmap }: {
  topics: NonNullable<MonthlyOperatorOverviewView["frameworks"][number]["resources"]>["grammarTopics"];
  roadmap?: NonNullable<NonNullable<MonthlyOperatorOverviewView["frameworks"][number]["resources"]>["roadmap"]>;
}) {
  const daysFor = (stepId: string) => roadmap?.grammarSteps.find((item) => item.stepId === stepId)?.lessonNumbers ?? [];
  return <><div className="monthly-roadmap-intro"><b>2 chủ điểm · 3 bước mỗi chủ điểm</b><span>Mỗi chủ điểm tiến dần từ cách dùng cơ bản đến ứng dụng trong công việc.</span></div><div className="monthly-resource-roadmap monthly-grammar-roadmap" aria-label="Lộ trình ngữ pháp">
    {topics.map((topic, topicIndex) => <article key={topic.id} className="monthly-roadmap-card monthly-grammar-card"><header><span className="monthly-roadmap-code">G{String.fromCharCode(65 + topicIndex)}</span><div><h3>{topic.title}</h3></div></header><div className="monthly-roadmap-steps monthly-grammar-steps">{topic.steps.map((step, index) => <section key={step.id} className="monthly-grammar-step"><span className="monthly-grammar-step-number">Bước {index + 1}</span><h4>{step.focus}</h4>{step.usage && <details className="monthly-grammar-detail"><summary>Ghi chú cách dùng</summary><p>{step.usage}</p></details>}{step.formula && <div className="monthly-grammar-formula"><span>Công thức</span><code>{step.formula}</code></div>}{step.examples.length > 0 && <div className="monthly-grammar-examples"><span>Ví dụ</span><div className="monthly-resource-chips">{step.examples.map((example) => <span key={example}>{example}</span>)}</div></div>}{roadmap?.allocated && <p className="monthly-roadmap-days">Áp dụng: {formatLessonBlocks(daysFor(step.id))}</p>}</section>)}</div></article>)}
  </div></>;
}

function PronunciationResourcePanel({ sounds, roadmap }: {
  sounds: NonNullable<MonthlyOperatorOverviewView["frameworks"][number]["resources"]>["sounds"];
  roadmap?: NonNullable<NonNullable<MonthlyOperatorOverviewView["frameworks"][number]["resources"]>["roadmap"]>;
}) {
  const assignment = (soundId: string) => roadmap?.sounds.find((item) => item.soundId === soundId);
  return <><div className="monthly-roadmap-intro"><b>4 mục tiêu phát âm</b><span>Mỗi thẻ có âm trọng tâm và các từ ví dụ ngắn để luyện tập.</span></div><div className="monthly-resource-pronunciation-grid" aria-label="Lộ trình phát âm">
    {sounds.map((sound, index) => { const allocated = assignment(sound.id); return <article key={sound.id} className="monthly-roadmap-card monthly-pronunciation-card"><header><span className="monthly-roadmap-code">P{index + 1}</span><div><h3>{sound.label}</h3><span className="monthly-pronunciation-ipa">{sound.ipa}</span></div></header><div className="monthly-pronunciation-plan"><p className="monthly-pronunciation-purpose">Luyện nhận diện và phát âm {sound.ipa}</p>{roadmap?.allocated && <p className="monthly-roadmap-days">Áp dụng: {formatLessonBlocks(allocated?.lessonNumbers ?? [])}</p>}<div className="monthly-pronunciation-examples"><span>Từ luyện tập</span><div className="monthly-resource-chips" aria-label={`Ví dụ âm ${sound.label}`}>{sound.examples.map((example) => <span key={example.id}>{example.word} <em>{example.ipa}</em></span>)}</div></div></div></article>; })}
  </div></>;
}

function formatLessonBlocks(lessonNumbers: number[]): string {
  if (!lessonNumbers.length) return "Chưa có ngày áp dụng";
  const blocks: string[] = [];
  let first = lessonNumbers[0]!;
  let previous = first;
  for (const lesson of lessonNumbers.slice(1)) {
    if (lesson === previous + 1) { previous = lesson; continue; }
    blocks.push(first === previous ? `Bài ${first}` : `Bài ${first}–${previous}`);
    first = previous = lesson;
  }
  blocks.push(first === previous ? `Bài ${first}` : `Bài ${first}–${previous}`);
  return blocks.join(", ");
}
function VocabularyPanel({ items, variant }: { items: Array<{ id: string; word: string; meaning: string; ipa?: string }>; variant: "core" | "expanded" }) {
  const grouped = groupVocabularyForDisplay(items);
  const visible = variant === "expanded" ? [...grouped.standalone, ...grouped.phrases] : items;
  const phraseCount = grouped.phrases.length;
  return <>
    <section className="monthly-vocabulary-guidance" aria-label={variant === "core" ? "Quy tắc từ cốt lõi" : "Quy tắc từ mở rộng"}>
      {variant === "core"
        ? <><b>Headword đơn</b><span>Mỗi mục là một từ độc lập; dùng làm từ trọng tâm của tháng.</span></>
        : <><b>{grouped.standalone.length} từ đơn ưu tiên</b><span>{phraseCount ? `${phraseCount} cụm bổ trợ tự nhiên được đặt sau từ đơn.` : "Không có cụm từ trong bộ này."}</span></>}
    </section>
    <ol className={`monthly-resource-collection ${variant}`}>{visible.map((item, index) => {
      const standalone = isStandaloneWord(item.word);
      return <li key={item.id} className={standalone ? "standalone" : "phrase"}><i>{index + 1}</i><b>{item.word}</b><small>{variant === "core" ? "Headword" : standalone ? "Từ đơn" : "Cụm bổ trợ"}</small><span>{item.meaning}</span>{item.ipa && <em>{item.ipa}</em>}</li>;
    })}</ol>
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
