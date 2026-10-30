import { useState } from "react";
import { Check, PenLine, RefreshCw, TriangleAlert } from "lucide-react";
import type { CefrLevel, MonthFrameworkView, MonthLessonCellView, MonthlyOperatorOverviewView } from "@e4s/contracts";
import { Badge, Banner, Button, LevelChip, OperatorPage, PageTitle } from "./primitives.js";

export interface OperatorMonthsActions {
  onSelectMonth(month: string): void;
  onSelectLevel(cefr: CefrLevel): void;
  onGenerateFramework(): void;
  onApproveFramework(): void;
  onOpenLesson(lessonNumber: number): void;
  onApproveLesson(lessonNumber: number): void;
  onGenerateExam(): void;
  onApproveExam(): void;
  onViewExam(): void;
  onRefresh(): void;
}

export interface OperatorMonthsView {
  overview: MonthlyOperatorOverviewView;
  month: string;
  cefr: CefrLevel;
  framework: MonthFrameworkView | null;
  busy: boolean;
  status?: string | undefined;
  error?: string | undefined;
}

const FRAMEWORK_LABEL: Record<MonthFrameworkView["status"], string> = {
  missing: "Chưa có khung", generating: "Đang sinh khung…", draft: "Khung nháp", approved: "Khung đã duyệt", failed: "Sinh khung lỗi"
};
const LESSON_LABEL: Record<MonthLessonCellView["status"], string> = {
  pending: "Chờ chia", generating: "Đang chia…", draft: "Nháp", approved: "Đã duyệt", failed: "Lỗi"
};
const EXAM_LABEL: Record<MonthFrameworkView["exam"]["status"], string> = {
  none: "Chưa sinh", generating: "Đang sinh đề…", draft: "Đề nháp", approved: "Đề đã duyệt", failed: "Sinh đề lỗi"
};

function formatDate(value: string): string {
  const [year, month, day] = value.split("-");
  return `${day}/${month}/${year}`;
}

function weekdayLabel(value: string): string {
  const [year, month, day] = value.split("-").map(Number);
  const weekday = new Date(Date.UTC(year!, month! - 1, day!)).getUTCDay();
  return ["CN", "T2", "T3", "T4", "T5", "T6", "T7"][weekday] ?? "";
}

export function OperatorMonths({ view, actions, readOnly = false }: { view: OperatorMonthsView; actions: OperatorMonthsActions; readOnly?: boolean }) {
  const [tab, setTab] = useState<"vocabulary" | "grammar" | "sounds">("vocabulary");
  const selectedMonth = view.overview.months.find((month) => month.month === view.month) ?? view.overview.months[1]!;
  const framework = view.framework;
  const editable = selectedMonth.editable && !readOnly;
  const generating = framework?.status === "generating" || (framework?.status === "draft" && framework.vocabulary.length === 0 && !framework.generationError);
  const canGenerate = editable && framework?.status !== "approved" && !view.busy;
  const canApproveFramework = editable && framework?.status === "draft" && framework.vocabulary.length > 0 && !view.busy;
  const approvedLessons = framework?.lessons.filter((cell) => cell.status === "approved").length ?? 0;
  const allLessonsApproved = Boolean(framework && framework.lessons.length > 0 && approvedLessons === framework.lessons.length);
  const canGenerateExam = editable && framework?.status === "approved" && framework.exam.status !== "approved" && framework.exam.status !== "generating" && !view.busy;
  const canApproveExam = editable && framework?.exam.status === "draft" && !view.busy;
  return <OperatorPage title="Tháng học">
    <PageTitle actions={<div className="row operator-page-title-actions"><Button small onClick={actions.onRefresh} disabled={view.busy} aria-label="Tải lại"><RefreshCw size={14} aria-hidden="true" /> Tải lại</Button></div>}>
      <h1>Khung tháng & bài ngày</h1>
      <p className="muted">Mỗi tháng × level có một khung: {view.overview.settings.vocabularyCount} từ vựng, {view.overview.settings.grammarTopicCount} chủ điểm ngữ pháp, {view.overview.settings.soundCount} âm. Duyệt khung xong hệ thống tự chia thành bài ngày (T2–T6, trừ ngày thi); sau đó chỉ soạn tay từng bài. Bài thi tháng sinh từ khung.</p>
    </PageTitle>
    {!view.overview.aiConnected && <Banner tone="warn" icon={<TriangleAlert className="operator-banner-svg" size={17} strokeWidth={2.25} />}><span className="small"><b>AI chưa sẵn sàng.</b> Sinh khung sẽ dùng <b>khung mẫu</b> cố định theo level để kiểm thử trọn luồng.</span></Banner>}
    {view.error && <Banner tone="danger"><span className="small">{view.error}</span></Banner>}
    {view.status && !view.error && <div className="small muted" aria-live="polite">{view.busy && <span className="spinner" />} {view.status}</div>}

    <div className="card operator-month-picker">
      <div className="row operator-month-tabs" role="tablist" aria-label="Chọn tháng">
        {view.overview.months.map((month) => <button key={month.month} type="button" role="tab" aria-selected={month.month === view.month} className={`btn-sm ${month.month === view.month ? "btn-primary" : "btn-ghost"}`} onClick={() => actions.onSelectMonth(month.month)}>
          {month.label}{!month.editable && <span className="small muted"> · chỉ xem</span>}
        </button>)}
      </div>
      <div className="row between operator-card-header">
        <div className="small muted">Thi ngày <b>{formatDate(selectedMonth.examDate)}</b> · {selectedMonth.lessonCount} bài · {selectedMonth.studyDayCount} ngày học</div>
        <div className="row operator-month-levels" role="tablist" aria-label="Chọn level">
          {selectedMonth.levels.map((level) => <button key={level.cefr} type="button" role="tab" aria-selected={level.cefr === view.cefr} className={`btn-sm ${level.cefr === view.cefr ? "btn-primary" : "btn-ghost"}`} onClick={() => actions.onSelectLevel(level.cefr)}>
            {level.cefr} {level.readyForLearners ? <Check size={12} aria-label="Đủ điều kiện cho học viên" /> : <span className="small muted">{level.approvedLessons}/{level.totalLessons}</span>}
          </button>)}
        </div>
      </div>
    </div>

    <div className="operator-month-split">
      <section className="card operator-month-framework" aria-label={`Khung tháng ${view.cefr}`}>
        <div className="row between operator-card-header">
          <h3><LevelChip level={view.cefr} /> Khung {selectedMonth.label}</h3>
          <Badge tone={framework?.status === "approved" ? "ok" : framework?.status === "failed" ? "danger" : framework?.status === "draft" ? "warn" : ""}>{framework ? FRAMEWORK_LABEL[generating ? "generating" : framework.status] : "Đang tải…"}</Badge>
        </div>
        {framework?.source === "sample" && <Banner tone="info"><span className="small">Khung này là <b>khung mẫu</b> (không AI). Phiên bản {framework.version}.</span></Banner>}
        {framework?.generationError && <Banner tone="danger"><span className="small">Sinh khung chưa thành công: {framework.generationError}. Bạn có thể bấm sinh lại.</span></Banner>}
        {framework?.status === "approved" && <div className="small muted">Đã duyệt {framework.approvedAt ? new Date(framework.approvedAt).toLocaleString("vi-VN") : ""}{framework.approvedBy ? ` bởi ${framework.approvedBy}` : ""}.</div>}
        <div className="row operator-month-framework-actions">
          <Button onClick={actions.onGenerateFramework} disabled={!canGenerate} title={!editable ? "Tháng này chỉ xem" : framework?.status === "approved" ? "Khung đã duyệt, không sinh lại" : undefined}><RefreshCw size={14} aria-hidden="true" /> {framework && framework.vocabulary.length ? "Sinh lại khung" : "Sinh khung"}</Button>
          <Button primary onClick={actions.onApproveFramework} disabled={!canApproveFramework}><Check size={14} aria-hidden="true" /> Duyệt khung</Button>
        </div>
        {framework && framework.vocabulary.length > 0 && <>
          <div className="row operator-month-framework-tabs" role="tablist">
            <button type="button" role="tab" aria-selected={tab === "vocabulary"} className={`btn-sm ${tab === "vocabulary" ? "btn-primary" : "btn-ghost"}`} onClick={() => setTab("vocabulary")}>Từ vựng ({framework.vocabulary.length})</button>
            <button type="button" role="tab" aria-selected={tab === "grammar"} className={`btn-sm ${tab === "grammar" ? "btn-primary" : "btn-ghost"}`} onClick={() => setTab("grammar")}>Ngữ pháp ({framework.grammarTopics.length})</button>
            <button type="button" role="tab" aria-selected={tab === "sounds"} className={`btn-sm ${tab === "sounds" ? "btn-primary" : "btn-ghost"}`} onClick={() => setTab("sounds")}>Phát âm ({framework.sounds.length})</button>
          </div>
          {tab === "vocabulary" && <ol className="operator-month-vocabulary">{framework.vocabulary.map((item, index) => <li key={`${item.word}-${index}`}><b>{item.word}</b> <span className="small muted">{item.type} {item.ipa}</span> — {item.meaning}{item.abstract && <Badge className="operator-month-abstract">trừu tượng</Badge>}<div className="small muted">{item.example}</div></li>)}</ol>}
          {tab === "grammar" && framework.grammarTopics.map((topic, index) => <div className="card soft" key={`${topic.title}-${index}`}><b>{index + 1}. {topic.title}</b><div className="small muted">{topic.summary}</div><ol className="operator-month-steps">{topic.steps.map((step) => <li key={step.step}><b>Bước {step.step}: {step.focus}</b> · <code>{step.formula}</code><div className="small muted">{step.usage}</div>{step.examples.map((example) => <div className="small" key={example}>“{example}”</div>)}</li>)}</ol></div>)}
          {tab === "sounds" && framework.sounds.map((sound, index) => <div className="card soft" key={`${sound.ipa}-${index}`}><b>/{sound.ipa}/ · {sound.label}</b><div className="small muted">{sound.tip}</div><div className="small">{sound.examples.map((example) => example.word).join(", ")}</div></div>)}
        </>}
        {framework && framework.vocabulary.length === 0 && !framework.generationError && framework.status !== "missing" && <div className="small muted"><span className="spinner" /> Worker đang sinh khung. Bấm “Tải lại” để cập nhật.</div>}
        {framework?.status === "missing" && <div className="empty small">Chưa có khung cho level này. Bấm <b>Sinh khung</b> để bắt đầu.</div>}
      </section>

      <section className="card operator-month-grid" aria-label="Lưới bài ngày">
        <div className="row between operator-card-header">
          <h3>Bài ngày · {approvedLessons}/{framework?.lessons.length ?? selectedMonth.lessonCount} đã duyệt</h3>
          <Badge tone={framework?.exam.status === "approved" ? "ok" : framework?.exam.status === "failed" ? "danger" : framework?.exam.status === "draft" ? "warn" : ""}>Bài thi: {framework ? EXAM_LABEL[framework.exam.status] : "—"}</Badge>
        </div>
        {framework?.status !== "approved" && <div className="small muted">Bài ngày sẽ được chia tự động sau khi duyệt khung.</div>}
        {framework?.readyForLearners && <Banner tone="ok"><span className="small"><b>Đủ điều kiện:</b> khung, mọi bài ngày và bài thi tháng đã duyệt. Học viên {view.cefr} đã thấy bài của {selectedMonth.label}.</span></Banner>}
        <div className="operator-month-days">
          {(framework?.lessons ?? []).map((cell) => <div key={cell.lessonNumber} className={`operator-month-day operator-month-day--${cell.status}`}>
            <div className="row between"><b>Bài {cell.lessonNumber}</b><span className="small muted">{weekdayLabel(cell.date)} {formatDate(cell.date).slice(0, 5)}</span></div>
            <div className="small operator-month-day-title">{cell.title ?? (cell.status === "pending" ? "—" : LESSON_LABEL[cell.status])}</div>
            <div className="row between">
              <Badge tone={cell.status === "approved" ? "ok" : cell.status === "failed" ? "danger" : cell.status === "draft" ? "warn" : ""}>{LESSON_LABEL[cell.status]}{cell.review ? " · ôn" : ""}</Badge>
              {cell.lessonId && <span className="row operator-month-day-actions">
                <Button small onClick={() => actions.onOpenLesson(cell.lessonNumber)} aria-label={`Soạn tay bài ${cell.lessonNumber}`} title={editable ? "Soạn tay" : "Xem"}><PenLine size={13} aria-hidden="true" /></Button>
                {cell.status !== "approved" && editable && <Button small onClick={() => actions.onApproveLesson(cell.lessonNumber)} disabled={view.busy} aria-label={`Duyệt bài ${cell.lessonNumber}`}><Check size={13} aria-hidden="true" /></Button>}
              </span>}
            </div>
            {cell.error && <div className="small" style={{ color: "var(--danger, #b42318)" }}>{cell.error}</div>}
          </div>)}
        </div>
        <div className="card soft operator-month-exam">
          <div className="row between operator-card-header"><b>Bài thi tháng · {formatDate(selectedMonth.examDate)}</b><span className="small muted">Thời lượng {view.overview.settings.examDurationMinutes} phút (tạm)</span></div>
          <div className="small muted">Đề sinh từ khung đã duyệt, không lấy phần soạn tay. {allLessonsApproved ? "" : "Có thể sinh đề ngay sau khi duyệt khung."}</div>
          {framework?.exam.error && <Banner tone="danger"><span className="small">{framework.exam.error}</span></Banner>}
          <div className="row">
            <Button onClick={actions.onGenerateExam} disabled={!canGenerateExam}>{framework?.exam.status === "none" || framework?.exam.status === "failed" ? "Sinh bài thi tháng" : "Sinh lại bài thi"}</Button>
            <Button primary onClick={actions.onApproveExam} disabled={!canApproveExam}><Check size={14} aria-hidden="true" /> Duyệt bài thi</Button>
            <Button onClick={actions.onViewExam} disabled={!framework?.exam.assessmentVersionId}>Xem đề</Button>
          </div>
        </div>
      </section>
    </div>
  </OperatorPage>;
}
