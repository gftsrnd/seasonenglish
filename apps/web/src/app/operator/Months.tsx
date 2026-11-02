import { useEffect, useMemo, useState } from "react";
import type { CefrLevel, MonthlyOperatorOverviewView, MonthlyQualityFindingView } from "@e4s/contracts";
import { buildMonthlyCalendar, recommendedMonthlyResourceCriteria, type MonthlyCurriculumContract } from "@e4s/domain/monthly";
import { useToast } from "../shared/design-system.js";
import { LearnerLesson } from "../learner/Learning.js";
import "./months.css";

type MonthlyBriefInput = { title: string; brief: string; context: string; communicationGoal: string };
type MonthlyDayInput = { title: string; parts: Array<{ code: string; title?: string; content: Record<string, unknown> }> };
type MonthlyQualityReport = { severe: MonthlyQualityFindingView[]; light: MonthlyQualityFindingView[]; contractVersion: number };
type MonthlyResourceCriteria = { cefr: CefrLevel; vocabularyCount: number; expandedVocabularyCount: number; grammarTopicCount: number; pronunciationSoundCount: number };
type ResourceGroup = "core" | "expanded" | "grammar" | "sounds";

export interface OperatorMonthsActions {
  onSelectMonth(month: string): void;
  onSelectLevel(level: CefrLevel): void;
  onSuggestBrief(month: string): Promise<MonthlyBriefInput>;
  onSaveBrief(month: string, input: MonthlyBriefInput): Promise<void> | void;
  onApproveBrief(month: string): Promise<void> | void;
  onGenerateFramework(month: string, criteria: MonthlyResourceCriteria): Promise<unknown> | void;
  onSaveFramework(month: string, contract: MonthlyCurriculumContract): Promise<void> | void;
  onApproveFramework(id: string): Promise<void> | void;
  onComposeDay?(id: string, dayNumber: number): void;
  onViewDay?(id: string, dayNumber: number): void;
  onSaveDay(id: string, dayNumber: number, lesson: MonthlyDayInput): Promise<MonthlyQualityReport>;
  onGenerateDay(id: string, dayNumber: number): Promise<{ lesson: MonthlyDayInput; report: MonthlyQualityReport }>;
  onAcknowledge(id: string, dayNumber: number, findingKeys: string[]): Promise<void> | void;
  onApproveDay(id: string, dayNumber: number): Promise<void> | void;
  onCreateCorrection(id: string, dayNumber: number, reason: string): Promise<string>;
  onSaveCorrection(id: string, dayNumber: number, correctionId: string, lesson: MonthlyDayInput): Promise<MonthlyQualityReport>;
  onAcknowledgeCorrection(correctionId: string, findingKeys: string[]): Promise<void> | void;
  onApproveCorrection(correctionId: string): Promise<void> | void;
}
export interface OperatorMonthsProps { month: string; todayMonth: string; overview: MonthlyOperatorOverviewView; cefr: CefrLevel; busy: boolean; readOnly?: boolean; error?: string; actions: OperatorMonthsActions; }

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

export function OperatorMonths({ month, todayMonth, overview, cefr, busy, readOnly = false, error, actions }: OperatorMonthsProps) {
  const toast = useToast();
  const framework = overview.frameworks.find((item) => item.cefr === cefr);
  const calendar = useMemo(() => buildMonthlyCalendar(month), [month]);
  const [brief, setBrief] = useState<MonthlyBriefInput>(emptyBrief);
  const [resourceCounts, setResourceCounts] = useState(() => toResourceCounts(recommendedMonthlyResourceCriteria(month, cefr)));
  const [resourcePanel, setResourcePanel] = useState<ResourceGroup | null>(null);
  const [generationConfirmation, setGenerationConfirmation] = useState<number>();
  const briefLocked = overview.brief?.status === "approved";
  const monthChoices = [shiftMonth(todayMonth, -1), todayMonth, shiftMonth(todayMonth, 1)];
  const previousMonth = month === monthChoices[0];
  const canEdit = !readOnly && !previousMonth;
  const resources = [
    { key: "core" as const, label: "Từ cốt lõi", count: framework?.resources?.coreTerms.length ?? 0, description: "Từ và cụm từ trọng tâm" },
    { key: "expanded" as const, label: "Từ mở rộng", count: framework?.resources?.supportTerms.length ?? 0, description: "Từ bổ trợ theo từng bài" },
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
  useEffect(() => {
    if (framework?.resources) {
      setResourceCounts({
        core: framework.resources.coreTerms.length,
        expanded: framework.resources.supportTerms.length,
        grammar: framework.resources.grammarTopics.length,
        sounds: framework.resources.sounds.length
      });
      return;
    }
    setResourceCounts(toResourceCounts(recommendedMonthlyResourceCriteria(month, cefr)));
  }, [month, cefr, framework]);

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
  const generateDay = async (dayNumber: number) => {
    if (!canEdit) return showUnavailable("Tháng trước chỉ dùng để xem.");
    if (!framework || framework.status !== "approved") return showUnavailable("Hãy chốt tài nguyên tháng trước khi sinh bài học.");
    try {
      await actions.onGenerateDay(framework.id, dayNumber);
      toast.show({ message: `Đã sinh bài học ngày ${dayNumber}.`, tone: "ok" });
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
    // Update the creation criteria synchronously. Waiting for the overview
    // reload left the first "Sinh tài nguyên" click using the prior level's
    // counts, especially when that level already had a framework.
    if (!overview.frameworks.some((item) => item.cefr === level)) {
      setResourceCounts(toResourceCounts(recommendedMonthlyResourceCriteria(month, level)));
    }
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
  return <main className="operator-months-page">
    <header className="operator-months-header"><p className="eyebrow">Operator</p><h1>Bài học</h1><p>Thiết kế chủ đề, tài nguyên và lịch học theo tháng.</p></header>
    {error && <div className="monthly-error" role="alert">{error}</div>}
    <section className="monthly-month-card card">
      <div><span className="eyebrow">Chu kỳ</span><h2>Tháng học</h2></div>
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
        {!framework?.resources ? <div className="monthly-resource-inputs">
          <label>Từ cốt lõi<input type="number" min="0" value={resourceCounts.core} disabled={!canEdit} onChange={(event) => setResourceCounts({ ...resourceCounts, core: Number(event.target.value) })} /></label>
          <label>Từ mở rộng<input type="number" min="0" value={resourceCounts.expanded} disabled={!canEdit} onChange={(event) => setResourceCounts({ ...resourceCounts, expanded: Number(event.target.value) })} /></label>
          <label>Điểm ngữ pháp<input type="number" min="1" value={resourceCounts.grammar} disabled={!canEdit} onChange={(event) => setResourceCounts({ ...resourceCounts, grammar: Number(event.target.value) })} /></label>
          <label>Âm phát âm<input type="number" min="1" value={resourceCounts.sounds} disabled={!canEdit} onChange={(event) => setResourceCounts({ ...resourceCounts, sounds: Number(event.target.value) })} /></label>
        </div> : <div className="monthly-resource-cards">{resources.map((item) => <button key={item.key} type="button" onClick={() => setResourcePanel(item.key)}><b>{item.count}</b><strong>{item.label}</strong><span>{item.description}</span></button>)}</div>}
        <div className="monthly-actions monthly-resource-actions">
          <button type="button" className="btn btn-primary" disabled={busy} onClick={() => void generateFramework()}>{framework?.resources ? "Sinh lại" : "Sinh tài nguyên"}</button>
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
            if (isExam) return <article key={cell.date} role="gridcell" className="monthly-day-cell monthly-final"><b>{cell.dateLabel}</b><strong>Bài thi</strong><button type="button" className="btn-sm" onClick={() => showUnavailable("Sinh đề thi tháng đang chờ kết nối.")}>Sinh đề thi</button></article>;
            if (!cell.lessonNumber) return <article key={cell.date} role="gridcell" className="monthly-day-cell weekend"><b>{cell.dateLabel}</b><strong>Nghỉ</strong></article>;
            const kind = lesson?.kind === "review" ? "review" : "lesson";
            const draft = lesson?.status === "draft";
            return <article key={cell.date} role="gridcell" aria-label={`${cell.dateLabel}, ${lesson?.kind === "review" ? "Ôn tập" : `Bài ${cell.lessonNumber}`}`} className={`monthly-day-cell ${kind} ${lesson?.status === "approved" ? "approved" : ""}`}><b>{cell.dateLabel}</b><strong>{lesson?.kind === "review" ? "Ôn tập" : `Bài ${cell.lessonNumber}`}</strong><div>{lesson?.status === "approved" ? <button type="button" className="btn-sm monthly-view-day" disabled={busy} onClick={() => framework && actions.onViewDay?.(framework.id, lesson.lessonNumber)}>Xem</button> : <><button type="button" className="btn-sm btn-primary" disabled={busy} onClick={() => setGenerationConfirmation(cell.lessonNumber!)}>Sinh</button><button type="button" className="btn-sm" disabled={busy} onClick={() => openManualEditor(cell.lessonNumber!)}>Soạn tay</button>{draft && <button type="button" className="btn-sm" disabled={busy} onClick={() => framework && void actions.onApproveDay(framework.id, cell.lessonNumber!)}>Duyệt</button>}</>}</div></article>;
          })}
        </div>
      </section>
      {framework?.resources && resourcePanel && <section className="monthly-resource-panel card" role="dialog" aria-modal="false" aria-label="Tài nguyên tháng">
        <header><div><span className="eyebrow">Tài nguyên tháng</span><h2>{resources.find((item) => item.key === resourcePanel)?.label}</h2></div><button type="button" className="btn-sm" aria-label="Đóng tài nguyên" onClick={() => setResourcePanel(null)}>Đóng</button></header>
        {resourcePanel === "core" && <VocabularyPanel items={framework.resources.coreTerms} />}
        {resourcePanel === "expanded" && <VocabularyPanel items={framework.resources.supportTerms} />}
        {resourcePanel === "grammar" && <div className="monthly-resource-panel-grid">{framework.resources.grammarTopics.map((topic) => <article key={topic.id}><h3>{topic.title}</h3>{topic.steps.map((step) => <p key={step.id}>{step.usage || step.focus}</p>)}</article>)}</div>}
        {resourcePanel === "sounds" && <div className="monthly-resource-panel-grid">{framework.resources.sounds.map((sound) => <article key={sound.id}><h3>{sound.label} <span>{sound.ipa}</span></h3><p>{sound.examples.map((example) => example.word).join(", ")}</p></article>)}</div>}
      </section>}
    </div>
    {generationConfirmation && framework?.resources && <MonthlyGenerationConfirmation dayNumber={generationConfirmation} framework={framework} onCancel={() => setGenerationConfirmation(undefined)} onConfirm={() => { const dayNumber = generationConfirmation; setGenerationConfirmation(undefined); void generateDay(dayNumber); }} />}
  </main>;
}

export function MonthlyLessonPreview({ date, cefr, lesson, onClose }: { date: string; cefr: CefrLevel; lesson: MonthlyOperatorOverviewView["frameworks"][number]["lessons"][number]; onClose(): void }) {
  const parts = lesson.content?.parts ?? [];
  const dateLabel = new Intl.DateTimeFormat("vi-VN", { day: "2-digit", month: "2-digit", timeZone: "UTC" }).format(new Date(`${date}T00:00:00Z`));
  if (!parts.length) return <main className="app-learner-page"><button type="button" className="btn" onClick={onClose}>← Về lịch tháng</button><p className="card muted">Nội dung bài đã duyệt chưa tải được.</p></main>;
  const view = { lesson: { id: `monthly-${lesson.lessonNumber}`, title: lesson.content?.title || `Bài ${lesson.lessonNumber}`, dayNumber: lesson.lessonNumber, weekNumber: 0, weekTopic: `Ngày ${dateLabel}`, durationMinutes: 15, cefr, content: { parts: parts.map((part) => ({ code: part.code ?? "instruction", title: part.title ?? part.code ?? "Nội dung", content: part.content ?? {} })) }, progress: { status: "not_started", completedPartCodes: [], evidence: {} } }, lock: null } as never;
  const actions = { navigate: (path: string) => { if (path === "/home") onClose(); }, speak: () => undefined, completeLessonStudy: async () => undefined, saveLessonProgress: async () => undefined, uploadAssessmentAudio: async () => "", recordAssessmentAudioPlay: async () => ({ playCount: 0, remaining: 0 }) } as never;
  return <LearnerLesson view={view} actions={actions} />;
}

function MonthlyGenerationConfirmation({ dayNumber, framework, onCancel, onConfirm }: { dayNumber: number; framework: MonthlyOperatorOverviewView["frameworks"][number]; onCancel(): void; onConfirm(): void }) {
  const resources = framework.resources!;
  const terms = [...resources.coreTerms, ...resources.supportTerms].filter((term) => term.dayNumber === dayNumber);
  const grammar = resources.grammarTopics.filter((_, index) => Math.min(resources.grammarTopics.length - 1, Math.floor((dayNumber - 1) * resources.grammarTopics.length / Math.max(framework.lessons.length || 20, 1))) === index);
  const sounds = resources.sounds.filter((_, index) => (dayNumber - 1) % resources.sounds.length === index);
  return <div className="monthly-lesson-preview-backdrop" role="presentation"><section className="monthly-generation-confirmation card" role="dialog" aria-modal="true" aria-label={`Tài nguyên cho bài ${dayNumber}`}><span className="eyebrow">Tài nguyên đã chốt</span><h2>Sinh bài ngày {dayNumber}?</h2><p className="small muted">Bài sẽ dùng đúng tài nguyên của ngày này.</p><dl><div><dt>Từ vựng</dt><dd>{terms.map((term) => term.word).join(" · ") || "Chưa gán"}</dd></div><div><dt>Ngữ pháp</dt><dd>{grammar.map((item) => item.title).join(" · ") || "Chưa gán"}</dd></div><div><dt>Phát âm</dt><dd>{sounds.map((item) => item.label).join(" · ") || "Chưa gán"}</dd></div></dl><footer><button type="button" className="btn" onClick={onCancel}>Quay lại</button><button type="button" className="btn btn-primary" onClick={onConfirm}>Sinh bài</button></footer></section></div>;
}

function VocabularyPanel({ items }: { items: Array<{ id: string; word: string; meaning: string; ipa?: string }> }) {
  return <ol className="monthly-resource-collection">{items.map((item, index) => <li key={item.id}><i>{index + 1}</i><b>{item.word}</b><span>{item.meaning}</span>{item.ipa && <em>{item.ipa}</em>}</li>)}</ol>;
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
