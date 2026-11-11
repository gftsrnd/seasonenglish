import { useMemo, useState, type ReactNode } from "react";
import type { AssessmentProductiveRubricItem, ManualAssessmentScoreInput } from "@e4s/contracts";

export type ManualScoreInput = ManualAssessmentScoreInput;
export function AssessmentMonthlyRubricScore({ rubric, saved, comment, onSave, saving, writingContent, speakingContent }: {
  rubric: AssessmentProductiveRubricItem[];
  saved: Record<string, number>;
  comment: string;
  onSave(input: ManualScoreInput): void;
  saving: boolean;
  writingContent: ReactNode;
  speakingContent: ReactNode;
}) {
  const [scores, setScores] = useState<Record<string, string>>(() => Object.fromEntries(
    Object.entries(saved).map(([code, score]) => [code, String(score)])
  ));
  const [note, setNote] = useState(comment);
  const [confirming, setConfirming] = useState(false);
  const canSave = rubric.every(({ code, maxScore }) => {
    const value = scores[code];
    return value !== undefined && value.trim() !== "" && Number(value) >= 0 && Number(value) <= maxScore;
  });
  return <div className="operator-manual-score">
    {(["writing", "speaking"] as const).map(skill => {
      const items = rubric.filter(item => item.skill === skill);
      const total = items.reduce((sum, item) => sum + (Number(scores[item.code]) || 0), 0);
      const maximum = items.reduce((sum, item) => sum + item.maxScore, 0);
      return <details key={skill} className="operator-answer-section operator-manual-score-section" data-assessment-section={skill}>
        <summary className="operator-answer-section-summary"><b>{skill === "writing" ? "Viết" : "Nói"} · {items.some(({ code }) => scores[code]) ? `${total}/${maximum}` : "Chờ chấm"}</b></summary>
        {skill === "writing" ? writingContent : speakingContent}
        <div className="operator-manual-rubric" data-manual-rubric={skill}>
          {skill === "speaking" && <p className="small muted">Nghe bản ghi để chấm phát âm và độ liền mạch.</p>}
          <div className="operator-rubric-grid">{items.map(({ code, description, maxScore }) => <label className="operator-rubric-field" key={code}>
            {description} · tối đa {maxScore} điểm
            <input aria-label={`${code} · ${description}`} type="number" min={0} max={maxScore} step="any" value={scores[code] ?? ""} onChange={event => setScores(current => ({ ...current, [code]: event.target.value }))} />
          </label>)}</div>
        </div>
      </details>;
    })}
    <h4 className="operator-detail-section-title operator-manual-comment-title">Nhận xét</h4>
    <label className="operator-manual-comment"><span className="sr-only">Nhận xét</span><textarea aria-label="Nhận xét" value={note} rows={3} onChange={event => setNote(event.target.value)} /></label>
    <button className="btn-sm btn-danger" type="button" disabled={!canSave || saving} onClick={() => setConfirming(true)}>{saving ? "Đang lưu…" : "Lưu điểm chấm tay"}</button>
    {!canSave && <p className="small muted" role="status">Nhập điểm cho đủ các tiêu chí Viết và Nói trước khi lưu.</p>}
    {confirming && <div className="modal-backdrop operator-modal-scope" role="presentation"><section className="dialog operator-confirm-dialog" role="dialog" aria-modal="true" aria-label="Xác nhận lưu điểm">
      <h3>Xác nhận lưu điểm</h3><p className="small">Điểm chấm tay sẽ thay điểm Viết và Nói hiện tại, đồng thời được ghi vào nhật ký.</p>
      <div className="row end"><button className="btn-sm" type="button" onClick={() => setConfirming(false)}>Hủy</button><button className="btn-sm btn-danger" type="button" onClick={() => {
        setConfirming(false);
        onSave({ writingTasks: [], speakingTasks: [], comment: note, rubricScores: rubric.map(({ code }) => ({ code, score: Number(scores[code]) })) });
      }}>Xác nhận</button></div>
    </section></div>}
  </div>;
}
type CriteriaState = Record<string, number | undefined>;
type TaskState = Record<string, CriteriaState>;

const WRITING_TASKS = [
  { key: "W1", label: "Task 1 – Phản hồi nhanh", weight: 7, note: "7 phút · 7 điểm · A2–B1 · 50–80 từ" },
  { key: "W2", label: "Task 2 – Báo cáo / đề xuất", weight: 13, note: "13 phút · 13 điểm · B2–C1 · 120–150 từ" }
] as const;
const WRITING_CRITERIA = [
  ["taskCompletion", "Task completion"], ["organization", "Organization & coherence"],
  ["vocabulary", "Vocabulary"], ["grammar", "Grammar"], ["workplaceRegister", "Workplace communication"]
] as const;
const SPEAKING_TASKS = [
  { key: "S1", label: "Task 1 – Warm-up", note: "3 phút · A1–A2" },
  { key: "S2", label: "Task 2 – Data description", note: "4 phút · B1–B2" },
  { key: "S3", label: "Task 3 – Customer refund questions", note: "4 phút · B2–C1 · 4 bản ghi" },
  { key: "S4", label: "Task 4 – Monologue", note: "4 phút · B2–C1" }
] as const;
const SPEAKING_CRITERIA = [
  ["taskCompletionRelevance", "Task completion & relevance"], ["grammarVocabulary", "Grammar & vocabulary"],
  ["coherenceClarity", "Coherence & clarity"], ["interactionProfessionalRegister", "Interaction & professional register"]
] as const;

function initialTasks<T extends { taskKey: string; criteria: object | null }>(keys: readonly string[], tasks: T[]): TaskState {
  return Object.fromEntries(keys.map((key) => {
    const criteria = tasks.find((task) => task.taskKey === key)?.criteria;
    return [key, criteria ? Object.fromEntries(Object.entries(criteria)) : {}];
  })) as TaskState;
}
function scoreOf(criteria: CriteriaState) { return Object.values(criteria).reduce<number>((sum, value) => sum + (typeof value === "number" ? value : 0), 0); }
function complete(tasks: TaskState, taskKeys: readonly string[], criteriaKeys: readonly string[], max: number) {
  return taskKeys.every((taskKey) => criteriaKeys.every((key) => {
    const value = tasks[taskKey]?.[key];
    return Number.isInteger(value) && Number(value) >= 0 && Number(value) <= max;
  }));
}
function RubricGrid({ taskKey, criteria, onChange, fields, max }: { taskKey: string; criteria: CriteriaState; onChange(key: string, value: number | undefined): void; fields: readonly (readonly [string, string])[]; max: number }) {
  return <div className="operator-rubric-grid">{fields.map(([key, label]) => <label key={key} className="operator-rubric-field">{label}<input aria-label={`${taskKey} · ${label}`} type="number" min={0} max={max} step={1} value={criteria[key] ?? ""} placeholder={`0–${max}`} onChange={(event) => { const value = event.target.value === "" ? undefined : Number(event.target.value); onChange(key, Number.isNaN(value) ? undefined : value); }} /></label>)}</div>;
}

export function AssessmentManualScore({ writingTasks, speakingTasks, comment, onSave, saving, writingContent, speakingContent, writingScore: persistedWritingScore, speakingScore: persistedSpeakingScore, passCourseRubric }: {
  writingTasks: ManualAssessmentScoreInput["writingTasks"];
  speakingTasks: ManualAssessmentScoreInput["speakingTasks"];
  comment: string;
  onSave(input: ManualScoreInput): void;
  saving: boolean;
  writingContent?: ReactNode;
  speakingContent?: ReactNode;
  writingScore?: number | null;
  speakingScore?: number | null;
  passCourseRubric?: AssessmentProductiveRubricItem[];
}) {
  const [writing, setWriting] = useState<TaskState>(() => initialTasks(WRITING_TASKS.map((task) => task.key), writingTasks));
  const [speaking, setSpeaking] = useState<TaskState>(() => initialTasks(SPEAKING_TASKS.map((task) => task.key), speakingTasks));
  const [note, setNote] = useState(comment);
  const [confirming, setConfirming] = useState(false);
  const taskWeight = (key: string, fallback: number) => passCourseRubric?.find(item => item.code === key)?.maxScore ?? fallback;
  const roundedWriting = Math.round((WRITING_TASKS.reduce((total, task) => total + (scoreOf(writing[task.key] ?? {}) / 20) * taskWeight(task.key, task.weight), 0) + Number.EPSILON) * 100) / 100;
  const roundedSpeaking = Math.round((SPEAKING_TASKS.reduce((total, task) => total + (scoreOf(speaking[task.key] ?? {}) / 20) * taskWeight(task.key, 5), 0) + Number.EPSILON) * 100) / 100;
  const canSave = complete(writing, WRITING_TASKS.map((task) => task.key), WRITING_CRITERIA.map(([key]) => key), 4)
    && complete(speaking, SPEAKING_TASKS.map((task) => task.key), SPEAKING_CRITERIA.map(([key]) => key), 5);
  const writingStarted = Object.values(writing).some((criteria) => Object.values(criteria).some((value) => typeof value === "number"));
  const speakingStarted = Object.values(speaking).some((criteria) => Object.values(criteria).some((value) => typeof value === "number"));
  const summary = useMemo(() => ({ writingScore: roundedWriting, speakingScore: roundedSpeaking }), [roundedSpeaking, roundedWriting]);
  const update = (section: "writing" | "speaking", taskKey: string, key: string, value: number | undefined) => {
    const setter = section === "writing" ? setWriting : setSpeaking;
    setter((current) => ({ ...current, [taskKey]: { ...current[taskKey], [key]: value } }));
  };
  const save = () => {
    const evidence = new Map(speakingTasks.map((task) => [task.taskKey, task.evidenceType]));
    onSave({
      writingTasks: WRITING_TASKS.map(({ key }) => ({ taskKey: key, criteria: writing[key] as ManualScoreInput["writingTasks"][number]["criteria"] })),
      speakingTasks: SPEAKING_TASKS.map(({ key }) => ({ taskKey: key, evidenceType: evidence.get(key) ?? "audio", criteria: speaking[key] as NonNullable<ManualScoreInput["speakingTasks"][number]["criteria"]> })),
      comment: note
    });
  };
  return <div className="operator-manual-score">
    <details className="operator-answer-section operator-manual-score-section" data-assessment-section="writing" aria-labelledby="operator-evidence-writing">
      <summary className="operator-answer-section-summary"><b id="operator-evidence-writing">Viết · {persistedWritingScore != null ? `${persistedWritingScore}/20` : writingStarted ? `${summary.writingScore}/20 (đang nhập)` : "Chờ chấm"}</b></summary>{writingContent}
      <div className="operator-manual-rubric" data-manual-rubric="writing">{WRITING_TASKS.map((task, index) => <fieldset key={task.key}><legend><b>{passCourseRubric ? `Bài viết ${index + 1}` : task.label}</b> <span className="small muted">({passCourseRubric ? `tối đa ${taskWeight(task.key, task.weight)} điểm` : task.note})</span></legend><RubricGrid taskKey={task.key} criteria={writing[task.key] ?? {}} onChange={(key, value) => update("writing", task.key, key, value)} fields={WRITING_CRITERIA} max={4} /></fieldset>)}<p className="small muted">{passCourseRubric ? "Mỗi bài viết có 5 tiêu chí, mỗi tiêu chí từ 0 đến 4." : "Mỗi task có rubric riêng: 5 tiêu chí × 0–4; Task 1 quy đổi 7 điểm và Task 2 quy đổi 13 điểm."}</p></div>
    </details>
    <details className="operator-answer-section operator-manual-score-section" data-assessment-section="speaking" aria-labelledby="operator-evidence-speaking">
      <summary className="operator-answer-section-summary"><b id="operator-evidence-speaking">Nói · {persistedSpeakingScore != null ? `${persistedSpeakingScore}/20` : speakingStarted ? `${summary.speakingScore}/20 (đang nhập)` : "Chờ chấm"}</b></summary>{speakingContent}
      <div className="operator-manual-rubric" data-manual-rubric="speaking">{SPEAKING_TASKS.map((task, index) => <fieldset key={task.key}><legend><b>{passCourseRubric ? `Bài nói ${index + 1}` : task.label}</b> <span className="small muted">({passCourseRubric ? `tối đa ${taskWeight(task.key, 5)} điểm` : task.note})</span></legend><RubricGrid taskKey={task.key} criteria={speaking[task.key] ?? {}} onChange={(key, value) => update("speaking", task.key, key, value)} fields={SPEAKING_CRITERIA} max={5} /></fieldset>)}<p className="small muted">{passCourseRubric ? "Mỗi bài nói có 4 tiêu chí, mỗi tiêu chí từ 0 đến 5. Phần này không chấm phát âm." : "Mỗi task có 4 tiêu chí × 0–5 và được quy đổi về tối đa 5 điểm. MVP không chấm phát âm."}</p></div>
    </details>
    <h4 className="operator-detail-section-title operator-manual-comment-title">Nhận xét</h4><label className="operator-manual-comment"><span className="sr-only">Nhận xét</span><textarea aria-label="Nhận xét" value={note} rows={3} onChange={(event) => setNote(event.target.value)} /></label>
    <button className="btn-sm btn-danger" type="button" disabled={!canSave || saving} onClick={() => { if (canSave && !saving) setConfirming(true); }}>{saving ? "Đang lưu…" : "Lưu điểm chấm tay"}</button>{!canSave && <p className="small muted" role="status">Nhập đủ rubric riêng cho 2 task Viết và 4 task Nói trước khi lưu.</p>}
    {confirming && <div className="modal-backdrop operator-modal-scope" role="presentation"><section className="dialog operator-confirm-dialog" role="dialog" aria-modal="true" aria-label="Xác nhận lưu điểm"><h3>Xác nhận lưu điểm</h3><p className="small">Điểm chấm tay theo từng task sẽ thay thế kết quả Viết/Nói hiện tại và được ghi vào nhật ký.</p><div className="row end"><button className="btn-sm" type="button" onClick={() => setConfirming(false)}>Hủy</button><button className="btn-sm btn-danger" type="button" onClick={() => { setConfirming(false); save(); }}>Xác nhận</button></div></section></div>}
  </div>;
}
