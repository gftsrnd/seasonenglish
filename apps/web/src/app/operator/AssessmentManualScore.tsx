import { useMemo, useState, type Dispatch, type ReactNode, type SetStateAction } from "react";
import type { ManualAssessmentScoreInput } from "@e4s/contracts";

export type ManualRubricCriteria = Record<string, number | undefined>;

export type ManualScoreInput = ManualAssessmentScoreInput;

const WRITING_CRITERIA = [
  ["taskAchievement", "Task achievement"],
  ["organization", "Organization & coherence"],
  ["vocabulary", "Vocabulary"],
  ["grammar", "Grammar"],
  ["workplaceCommunication", "Workplace communication"]
] as const;

const SPEAKING_CRITERIA = [
  ["fluency", "Fluency & interaction"],
  ["grammar", "Grammar"],
  ["vocabulary", "Vocabulary"],
  ["professionalCommunication", "Professional communication"]
] as const;

function scoreOf(criteria: ManualRubricCriteria): number {
  return Object.values(criteria).reduce<number>((sum, value) => sum + (typeof value === "number" ? value : 0), 0);
}

function complete(criteria: ManualRubricCriteria, keys: readonly string[]): boolean {
  return keys.every(key => Number.isInteger(criteria[key]) && (criteria[key] as number) >= 0 && (criteria[key] as number) <= 5);
}

function RubricGrid({ criteria, onChange, fields }: { criteria: ManualRubricCriteria; onChange(key: string, value: number | undefined): void; fields: readonly (readonly [string, string])[] }) {
  return <div className="operator-rubric-grid">{fields.map(([key, label]) => <label key={key} className="operator-rubric-field">{label}<input aria-label={label} type="number" min={0} max={5} step={1} value={criteria[key] ?? ""} placeholder="0–5" onChange={event => { const value = event.target.value === "" ? undefined : Number(event.target.value); onChange(key, Number.isNaN(value) ? undefined : value); }} /></label>)}</div>;
}

export function AssessmentManualScore({ writingCriteria, speakingCriteria, comment, onSave, saving, writingContent, speakingContent, writingScore: persistedWritingScore, speakingScore: persistedSpeakingScore }: {
  writingCriteria: ManualRubricCriteria;
  speakingCriteria: ManualRubricCriteria;
  comment: string;
  onSave(input: ManualScoreInput): void;
  saving: boolean;
  writingContent?: ReactNode;
  speakingContent?: ReactNode;
  writingScore?: number | null | undefined;
  speakingScore?: number | null | undefined;
}) {
  const [writing, setWriting] = useState<ManualRubricCriteria>(writingCriteria);
  const [speaking, setSpeaking] = useState<ManualRubricCriteria>(speakingCriteria);
  const [note, setNote] = useState(comment);
  const [confirming, setConfirming] = useState(false);
  const writingKeys = WRITING_CRITERIA.map(([key]) => key);
  const speakingKeys = SPEAKING_CRITERIA.map(([key]) => key);
  const writingScore = Math.round((scoreOf(writing) * 20 / 25 + Number.EPSILON) * 100) / 100;
  const speakingScore = scoreOf(speaking);
  const canSave = complete(writing, writingKeys) && complete(speaking, speakingKeys);
  const summary = useMemo(() => ({ writingScore, speakingScore }), [speakingScore, writingScore]);
  const update = (setter: Dispatch<SetStateAction<ManualRubricCriteria>>) => (key: string, value: number | undefined) => setter(current => ({ ...current, [key]: value }));
  const requestSave = () => {
    if (!canSave || saving) return;
    setConfirming(true);
  };
  return <div className="operator-manual-score">
    <details className="operator-answer-section operator-manual-score-section" data-assessment-section="writing" aria-labelledby="operator-evidence-writing">
      <summary className="operator-answer-section-summary"><b id="operator-evidence-writing">Viết · {persistedWritingScore ?? summary.writingScore}/20</b></summary>
      {writingContent ?? <div className="operator-manual-task-list">
        <div><b>Task 1 – Phản hồi nhanh</b><span className="small muted">(7 phút · 7 điểm · A2–B1) (0 từ · yêu cầu 50–80)</span></div>
        <div><b>Task 2 – Báo cáo / đề xuất</b><span className="small muted">(13 phút · 13 điểm · B2–C1) (0 từ · yêu cầu 120–150)</span></div>
      </div>}
      <div className="operator-manual-rubric" data-manual-rubric="writing">
        <RubricGrid criteria={writing} onChange={update(setWriting)} fields={WRITING_CRITERIA} />
        <p className="small muted">Một rubric cho cả phần Viết (5 tiêu chí × 1–5 = 25), quy đổi về 20 điểm.</p>
      </div>
    </details>
    <details className="operator-answer-section operator-manual-score-section" data-assessment-section="speaking" aria-labelledby="operator-evidence-speaking">
      <summary className="operator-answer-section-summary"><b id="operator-evidence-speaking">Nói · {persistedSpeakingScore ?? summary.speakingScore}/20</b></summary>
      {speakingContent ?? <div className="operator-manual-task-list">
        <div><b>Task 1 – Warm-up</b><span className="small muted">(3 phút · A1–A2) (không có file ghi âm)<br />(không có lời chép)</span></div>
        <div><b>Task 2 – Data description</b><span className="small muted">(4 phút · B1–B2) (không có file ghi âm)<br />(không có lời chép)</span></div>
        <div><b>Task 3 – Roleplay</b><span className="small muted">(4 phút · B2–C1) (không có file ghi âm)<br />(không có lời chép)</span></div>
        <div><b>Task 4 – Monologue</b><span className="small muted">(4 phút · B2–C2) (không có file ghi âm)<br />(không có lời chép)</span></div>
      </div>}
      <div className="operator-manual-rubric" data-manual-rubric="speaking">
        <RubricGrid criteria={speaking} onChange={update(setSpeaking)} fields={SPEAKING_CRITERIA} />
        <p className="small muted">Phát âm không chấm được từ bản ghi chữ; điểm Nói quy đổi từ 4 tiêu chí (× 1–5 = 20) về 20 điểm.</p>
      </div>
    </details>
    <h4 className="operator-detail-section-title operator-manual-comment-title">Nhận xét</h4>
    <label className="operator-manual-comment"><span className="sr-only">Nhận xét</span><textarea aria-label="Nhận xét" value={note} rows={3} onChange={event => setNote(event.target.value)} /></label>
    <button className="btn-sm btn-primary" type="button" disabled={!canSave || saving} onClick={requestSave}>{saving ? "Đang lưu…" : "Lưu điểm chấm tay"}</button>
    {!canSave && <p className="small muted" role="status">Nhập đủ điểm 0–5 cho 9 tiêu chí trước khi lưu.</p>}
    {confirming && <div className="modal-backdrop operator-modal-scope" role="presentation"><section className="dialog operator-confirm-dialog" role="dialog" aria-modal="true" aria-label="Xác nhận lưu điểm"><h3>Xác nhận lưu điểm</h3><p className="small">Điểm chấm tay sẽ thay thế kết quả Viết/Nói hiện tại và ghi vào nhật ký xử lý.</p><div className="row end"><button className="btn-sm" type="button" onClick={() => setConfirming(false)}>Hủy</button><button className="btn-sm btn-primary" type="button" onClick={() => { setConfirming(false); onSave({ writingCriteria: writing as ManualScoreInput["writingCriteria"], speakingCriteria: speaking as ManualScoreInput["speakingCriteria"], comment: note }); }}>Xác nhận</button></div></section></div>}
  </div>;
}
