import { useEffect, useMemo, useState } from "react";
import type { MonthlyOperatorOverviewView, MonthlyQualityFindingView, CefrLevel } from "@e4s/contracts";
import { buildMonthlyCurriculum, buildMonthlyCalendar, type MonthlyCurriculumContract } from "@e4s/domain/monthly";
import "./months.css";

type MonthlyBriefInput = { title: string; brief: string; context: string; communicationGoal: string };
type MonthlyDayInput = { title: string; parts: Array<{ code: string; title?: string; content: Record<string, unknown> }> };
type MonthlyQualityReport = { severe: MonthlyQualityFindingView[]; light: MonthlyQualityFindingView[]; contractVersion: number };

export interface OperatorMonthsActions {
  onSelectMonth(month: string): void;
  onSelectLevel(level: CefrLevel): void;
  onSaveBrief(month: string, input: MonthlyBriefInput): Promise<void> | void;
  onApproveBrief(month: string): Promise<void> | void;
  onSaveFramework(month: string, contract: MonthlyCurriculumContract): Promise<void> | void;
  onApproveFramework(id: string): Promise<void> | void;
  onSaveDay(id: string, dayNumber: number, lesson: MonthlyDayInput): Promise<MonthlyQualityReport>;
  onGenerateDay(id: string, dayNumber: number): Promise<{ lesson: MonthlyDayInput; report: MonthlyQualityReport }>;
  onAcknowledge(id: string, dayNumber: number, findingKeys: string[]): Promise<void> | void;
  onApproveDay(id: string, dayNumber: number): Promise<void> | void;
  onCreateCorrection(id: string, dayNumber: number, reason: string): Promise<string>;
  onSaveCorrection(id: string, dayNumber: number, correctionId: string, lesson: MonthlyDayInput): Promise<MonthlyQualityReport>;
  onAcknowledgeCorrection(correctionId: string, findingKeys: string[]): Promise<void> | void;
  onApproveCorrection(correctionId: string): Promise<void> | void;
}

export interface OperatorMonthsProps {
  month: string;
  todayMonth: string;
  overview: MonthlyOperatorOverviewView;
  cefr: CefrLevel;
  busy: boolean;
  readOnly?: boolean;
  error?: string;
  actions: OperatorMonthsActions;
}

const LEVELS: CefrLevel[] = ["A1", "A2", "B1", "B2", "C1"];
const WEEKDAYS = ["T2", "T3", "T4", "T5", "T6", "T7", "CN"];

function shiftMonth(month: string, offset: number): string {
  const [year, index] = month.split("-").map(Number) as [number, number];
  const date = new Date(Date.UTC(year, index - 1 + offset, 1));
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
}

function monthLabel(month: string): string {
  const [year, index] = month.split("-").map(Number) as [number, number];
  return new Intl.DateTimeFormat("vi-VN", { month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(Date.UTC(year, index - 1, 1)));
}

function monthGrid(month: string) {
  const calendar = buildMonthlyCalendar(month);
  const [year, index] = month.split("-").map(Number) as [number, number];
  const dayCount = new Date(Date.UTC(year, index, 0)).getUTCDate();
  const leading = (new Date(Date.UTC(year, index - 1, 1)).getUTCDay() + 6) % 7;
  const length = Math.ceil((leading + dayCount) / 7) * 7;
  const lessonByDate = new Map(calendar.effectiveDays.map((date, index) => [date, index + 1]));
  return Array.from({ length }, (_, index) => {
    const number = index - leading + 1;
    if (number < 1 || number > dayCount) return null;
    const date = `${month}-${String(number).padStart(2, "0")}`;
    const weekday = new Date(`${date}T00:00:00.000Z`).getUTCDay();
    const lessonNumber = lessonByDate.get(date);
    return { date, number, weekday, lessonNumber };
  });
}

function emptyBrief(): MonthlyBriefInput { return { title: "", brief: "", context: "", communicationGoal: "" }; }

export function OperatorMonths({ month, todayMonth, overview, cefr, busy, readOnly = false, error, actions }: OperatorMonthsProps) {
  const framework = overview.frameworks.find((item) => item.cefr === cefr);
  const [brief, setBrief] = useState<MonthlyBriefInput>(emptyBrief);
  const [coreJson, setCoreJson] = useState("[]");
  const [expandedJson, setExpandedJson] = useState("[]");
  const [grammarJson, setGrammarJson] = useState("[]");
  const [soundsJson, setSoundsJson] = useState("[]");
  const [selectedDay, setSelectedDay] = useState(1);
  const [dayJson, setDayJson] = useState('{\n  "title": "",\n  "parts": []\n}\n');
  const [quality, setQuality] = useState<Record<number, MonthlyQualityReport>>({});
  const [pendingAcknowledgements, setPendingAcknowledgements] = useState<string[]>([]);
  const [acknowledgedKeys, setAcknowledgedKeys] = useState<Record<number, string[]>>({});
  const [correctionId, setCorrectionId] = useState("");
  const [correctionReason, setCorrectionReason] = useState("");
  const [editorError, setEditorError] = useState("");
  const cells = monthGrid(month);
  const monthChoices = [shiftMonth(todayMonth, -1), todayMonth, shiftMonth(todayMonth, 1)];
  const calendar = useMemo(() => buildMonthlyCalendar(month), [month]);
  const dayCell = framework?.lessons.find((item) => item.lessonNumber === selectedDay);
  const briefLocked = overview.brief?.status === "approved";
  const dayReport = quality[selectedDay] ?? (dayCell ? { severe: dayCell.quality.severe, light: dayCell.quality.light, contractVersion: framework?.version ?? 1 } : undefined);
  const findingKeys = (dayReport?.light ?? []).map((finding) => `${finding.code}:${finding.dayNumber ?? 0}:${finding.component ?? ""}`);

  useEffect(() => {
    setBrief(overview.brief ? {
      title: overview.brief.title, brief: overview.brief.brief, context: overview.brief.context,
      communicationGoal: overview.brief.communicationGoal
    } : emptyBrief());
  }, [overview.brief]);
  useEffect(() => {
    const resources = framework?.resources;
    setCoreJson(JSON.stringify(resources?.coreTerms ?? [], null, 2));
    setExpandedJson(JSON.stringify(resources?.supportTerms ?? [], null, 2));
    setGrammarJson(JSON.stringify(resources?.grammarTopics ?? [], null, 2));
    setSoundsJson(JSON.stringify(resources?.sounds ?? [], null, 2));
    setSelectedDay(framework?.lessons[0]?.lessonNumber ?? 1);
    setQuality({});
    setAcknowledgedKeys({});
    setPendingAcknowledgements([]);
  }, [framework?.id, framework?.version]);
  useEffect(() => {
    setCorrectionId("");
    setCorrectionReason("");
    setPendingAcknowledgements([]);
  }, [selectedDay, framework?.id]);

  const saveFramework = () => {
    try {
      setEditorError("");
      const contract = buildMonthlyCurriculum({
        month,
        cefr,
        theme: { version: overview.brief?.version ?? 1, ...brief },
        coreTerms: JSON.parse(coreJson),
        supportTerms: JSON.parse(expandedJson),
        grammarTopics: JSON.parse(grammarJson),
        sounds: JSON.parse(soundsJson)
      });
      void actions.onSaveFramework(month, contract);
    } catch (reason) {
      setEditorError(reason instanceof Error ? reason.message : "Không đọc được dữ liệu N/Y/Z.");
    }
  };

  const saveDay = async () => {
    if (!framework) return;
    try {
      setEditorError("");
      const lesson = JSON.parse(dayJson) as MonthlyDayInput;
      const report = await actions.onSaveDay(framework.id, selectedDay, lesson);
      setQuality((current) => ({ ...current, [selectedDay]: report }));
    } catch (reason) {
      setEditorError(reason instanceof Error ? reason.message : "Không thể lưu bài ngày.");
    }
  };
  const generateDay = async () => {
    if (!framework) return;
    try {
      setEditorError("");
      const result = await actions.onGenerateDay(framework.id, selectedDay);
      setDayJson(JSON.stringify(result.lesson, null, 2));
      setQuality((current) => ({ ...current, [selectedDay]: result.report }));
    } catch (reason) {
      setEditorError(reason instanceof Error ? reason.message : "AI không thể sinh bài đạt chuẩn.");
    }
  };
  const saveCorrection = async () => {
    if (!framework || !correctionId) return;
    try {
      setEditorError("");
      const lesson = JSON.parse(dayJson) as MonthlyDayInput;
      const report = await actions.onSaveCorrection(framework.id, selectedDay, correctionId, lesson);
      setQuality((current) => ({ ...current, [selectedDay]: report }));
    } catch (reason) {
      setEditorError(reason instanceof Error ? reason.message : "Không thể lưu revision hiệu chỉnh.");
    }
  };

  return <main className="operator-months-page">
    <header className="operator-months-header">
      <div><p className="eyebrow">Operator · Chu kỳ học tháng</p><h1>Thiết kế tháng học</h1><p>Chủ đề chung A1–C1. Khóa tài nguyên N/Y/Z trước khi soạn bài ngày.</p></div>
      <div className="operator-month-picker" aria-label="Chọn tháng">
        {monthChoices.map((choice, index) => <button key={choice} type="button" aria-label={["Tháng trước", "Tháng hiện tại", "Tháng sau"][index]} aria-pressed={choice === month} onClick={() => actions.onSelectMonth(choice)}>{monthLabel(choice)}</button>)}
      </div>
    </header>
    {error && <div className="monthly-error" role="alert">{error}</div>}
    <section className="monthly-brief card">
      <div className="monthly-section-title"><div><span className="eyebrow">Chủ đề tháng chung</span><h2>Brief thô</h2></div><span className="monthly-version">{overview.brief ? `v${overview.brief.version} · ${overview.brief.status === "approved" ? "Đã duyệt" : "Bản nháp"}` : "Chưa có brief"}</span></div>
      <div className="monthly-brief-grid">
        <label>Tiêu đề<input value={brief.title} disabled={readOnly || busy || briefLocked} onChange={(event) => setBrief({ ...brief, title: event.target.value })} /></label>
        <label>Brief<textarea value={brief.brief} disabled={readOnly || busy || briefLocked} rows={3} onChange={(event) => setBrief({ ...brief, brief: event.target.value })} /></label>
        <label>Bối cảnh<textarea value={brief.context} disabled={readOnly || busy || briefLocked} rows={2} onChange={(event) => setBrief({ ...brief, context: event.target.value })} /></label>
        <label>Mục tiêu giao tiếp<textarea value={brief.communicationGoal} disabled={readOnly || busy || briefLocked} rows={2} onChange={(event) => setBrief({ ...brief, communicationGoal: event.target.value })} /></label>
      </div>
      <div className="row monthly-actions"><button type="button" className="btn" disabled={readOnly || busy || briefLocked || !brief.title.trim() || !brief.brief.trim()} onClick={() => void actions.onSaveBrief(month, brief)}>Lưu brief tháng</button>
        <button type="button" className="btn btn-primary" disabled={readOnly || busy || !overview.brief || briefLocked} onClick={() => void actions.onApproveBrief(month)}>Khóa brief đã chọn</button></div>
    </section>
    <div className="monthly-level-tabs" role="tablist" aria-label="Chọn trình độ">
      {LEVELS.map((level) => <button key={level} type="button" role="tab" aria-selected={level === cefr} onClick={() => actions.onSelectLevel(level)} className={level === cefr ? "selected" : ""}>{level}</button>)}
    </div>
    <section className="monthly-resources card">
      <div className="monthly-section-title"><div><span className="eyebrow">Bước 1 · khóa tài nguyên cho {cefr}</span><h2>N / Y / Z</h2></div><span className={`monthly-status ${framework?.status ?? "missing"}`}>{framework?.status === "approved" ? "Đã khóa" : framework?.status === "draft" ? "Chờ Operator duyệt" : "Chưa soạn"}</span></div>
      <p className="small muted">Số ngày học thay đổi theo lịch {monthLabel(month)}: {calendar.lessonCount} ngày từ T2–T6, gồm {calendar.effectiveDays.filter((date) => new Date(`${date}T00:00:00.000Z`).getUTCDay() !== 5).length} ngày mới. Core cần đúng 3 từ mỗi ngày mới. Không có nội dung mẫu dự phòng.</p>
      <div className="monthly-resource-grid">
        <JsonField label="N · Core vocabulary registry" value={coreJson} disabled={readOnly || busy || framework?.status === "approved"} onChange={setCoreJson} hint="Mỗi phần tử: id, word, meaning, type, ipa." />
        <JsonField label="N · Expanded vocabulary" value={expandedJson} disabled={readOnly || busy || framework?.status === "approved"} onChange={setExpandedJson} hint="Mỗi phần tử cần type, source và dayNumber; giữ quota theo schema vocabulary hiện hành." />
        <JsonField label="Y · 4 grammar topics" value={grammarJson} disabled={readOnly || busy || framework?.status === "approved"} onChange={setGrammarJson} hint="Mỗi topic có title và steps: focus, formula, usage, examples." />
        <JsonField label="Z · 4 âm và kho ví dụ" value={soundsJson} disabled={readOnly || busy || framework?.status === "approved"} onChange={setSoundsJson} hint="Mỗi âm có ipa, label, examples; lịch ngày được sinh theo tháng." />
      </div>
      <div className="row monthly-actions">
        <button type="button" className="btn" disabled={readOnly || busy || !overview.brief || framework?.status === "approved"} onClick={saveFramework}>Lưu khung N/Y/Z và DaySpec</button>
        <button type="button" className="btn btn-primary" disabled={readOnly || busy || framework?.status !== "draft"} onClick={() => framework && void actions.onApproveFramework(framework.id)}>Duyệt và khóa tài nguyên</button>
      </div>
    </section>
    <section className="monthly-calendar-section card">
      <div className="monthly-section-title"><div><span className="eyebrow">Bước 2 · nội dung theo ngày</span><h2>Lịch {monthLabel(month)}</h2></div><div className="monthly-calendar-legend"><span>● Nội dung mới</span><span>● Ôn tập</span><span>Cuối tuần nghỉ</span></div></div>
      <div className="monthly-calendar" role="grid" aria-label={`Lịch tháng ${month.slice(5, 7)}/${month.slice(0, 4)}`}>
        {WEEKDAYS.map((label) => <div key={label} role="columnheader" className="monthly-weekday">{label}</div>)}
        {cells.map((cell, index) => {
          if (!cell) return <div key={`blank-${index}`} role="gridcell" aria-hidden="true" className="monthly-calendar-blank" />;
          const lesson = framework?.lessons.find((entry) => entry.lessonDate === cell.date);
          const weekend = cell.weekday === 0 || cell.weekday === 6;
          return <button key={cell.date} type="button" role="gridcell" aria-label={`${cell.date} · ${weekend ? "nghỉ" : lesson?.kind === "review" ? "ôn tập" : "nội dung mới"}`} aria-pressed={cell.lessonNumber === selectedDay} disabled={!cell.lessonNumber || !framework || framework.status !== "approved"} className={`monthly-day-cell ${weekend ? "weekend" : lesson?.kind ?? "pending"} ${lesson?.status === "approved" ? "approved" : ""}`} onClick={() => cell.lessonNumber && setSelectedDay(cell.lessonNumber)}>
            <b>{cell.number}</b>{cell.lessonNumber && <span>{lesson?.kind === "review" ? "Ôn" : `Bài ${cell.lessonNumber}`}</span>}{lesson && <small>{lesson.status === "approved" ? "Đã duyệt" : lesson.status === "draft" ? "Bản nháp" : lesson.status === "failed" ? "Lỗi chất lượng" : "Chờ soạn"}</small>}
          </button>;
        })}
      </div>
      {framework?.status === "approved" && dayCell && <section className="monthly-day-editor" aria-label={`Soạn bài ngày ${dayCell.lessonDate}`}>
        <div className="monthly-section-title"><div><span className="eyebrow">{dayCell.lessonDate} · {dayCell.kind === "review" ? "Ôn tập" : "Nội dung mới"}</span><h3>DaySpec #{selectedDay}</h3></div><span className={`monthly-status ${dayCell.status}`}>{dayCell.status === "approved" ? "Đã duyệt · khóa" : dayCell.status}</span></div>
        <p className="small muted">Core, grammar, sound và objective lấy từ DaySpec đã khóa. AI chỉ soạn ví dụ và hoạt động; không thay đổi phạm vi.</p>
        {dayCell.locked && !correctionId && <div className="monthly-correction-start">
          <label>Lý do cần hiệu chỉnh sau duyệt<input value={correctionReason} onChange={(event) => setCorrectionReason(event.target.value)} disabled={readOnly || busy} /></label>
          <button type="button" className="btn" disabled={readOnly || busy || correctionReason.trim().length < 5} onClick={() => { if (!framework) return; void actions.onCreateCorrection(framework.id, selectedDay, correctionReason).then((result) => { setCorrectionId(result); setQuality((current) => ({ ...current, [selectedDay]: { severe: [], light: [], contractVersion: framework.version } })); setDayJson('{\n  "title": "",\n  "parts": []\n}\n'); }).catch((reason) => setEditorError(reason instanceof Error ? reason.message : "Không tạo được revision.")); }}>Tạo revision hiệu chỉnh</button>
        </div>}
        {(!dayCell.locked || correctionId) && <label>{correctionId ? "Nội dung revision · JSON" : "Nội dung bài ngày · JSON"}<textarea className="monthly-json-editor" value={dayJson} disabled={readOnly || busy} rows={14} onChange={(event) => setDayJson(event.target.value)} /></label>}
        <div className="row monthly-actions">{(!dayCell.locked || correctionId) && !correctionId && <button type="button" className="btn" disabled={readOnly || busy} onClick={() => void generateDay()}>Sinh bài bằng AI theo DaySpec</button>}{(!dayCell.locked || correctionId) && <button type="button" className="btn" disabled={readOnly || busy} onClick={() => void (correctionId ? saveCorrection() : saveDay())}>{correctionId ? "Lưu revision" : "Lưu bản nháp ngày"}</button>}
          {dayReport?.severe.map((finding, index) => <p key={`${finding.code}-${index}`} className="monthly-finding severe">Severe · {finding.message}</p>)}
          {dayReport?.light.map((finding, index) => <label key={`${finding.code}-${index}`} className="monthly-finding light"><input type="checkbox" checked={pendingAcknowledgements.includes(findingKeys[index] ?? "")} disabled={readOnly || busy || (dayCell.locked && !correctionId)} onChange={(event) => setPendingAcknowledgements((current) => event.target.checked ? [...current, findingKeys[index] ?? ""] : current.filter((key) => key !== findingKeys[index]))} /> Operator xác nhận lỗi nhẹ: {finding.message}</label>)}
          {Boolean(dayReport?.light.length) && <button type="button" className="btn" disabled={readOnly || busy || pendingAcknowledgements.length !== findingKeys.length || findingKeys.length === 0} onClick={() => framework && void Promise.resolve(correctionId ? actions.onAcknowledgeCorrection(correctionId, findingKeys) : actions.onAcknowledge(framework.id, selectedDay, findingKeys)).then(() => { setAcknowledgedKeys((current) => ({ ...current, [selectedDay]: findingKeys })); })}>Xác nhận tất cả lỗi nhẹ</button>}
          {correctionId && <button type="button" className="btn btn-primary" disabled={readOnly || busy || !dayReport || Boolean(dayReport.severe.length) || findingKeys.some((key) => !(acknowledgedKeys[selectedDay] ?? []).includes(key))} onClick={() => void Promise.resolve(actions.onApproveCorrection(correctionId)).then(() => setCorrectionId(""))}>Duyệt revision hiệu chỉnh</button>}
          {!dayCell.locked && <button type="button" className="btn btn-primary" disabled={readOnly || busy || dayCell.status !== "draft" || Boolean(dayReport?.severe.length) || findingKeys.some((key) => !(acknowledgedKeys[selectedDay] ?? dayCell.quality.acknowledged?.findingCodes ?? []).includes(key))} onClick={() => framework && void actions.onApproveDay(framework.id, selectedDay)}>Duyệt bài ngày</button>}
        </div>
      </section>}
    </section>
    {editorError && <div className="monthly-error" role="alert">{editorError}</div>}
  </main>;
}

function JsonField({ label, value, disabled, onChange, hint }: { label: string; value: string; disabled: boolean; onChange(value: string): void; hint: string }) {
  return <label className="monthly-json-field">{label}<textarea value={value} disabled={disabled} rows={12} spellCheck={false} onChange={(event) => onChange(event.target.value)} /><small>{hint}</small></label>;
}
