import { useEffect, useRef, useState } from "react";
import type { MonthlyExamOperatorView } from "@e4s/contracts";
import { Badge, Button } from "./primitives.js";
import { useDialog } from "../shared/ModalProvider.js";

/** Vận hành xem đề thi tháng: 4 phần (gói học viên) + key, ma trận, rubric (gói người chấm). */
export function MonthExamPreview({ exam, onClose }: { exam: MonthlyExamOperatorView; onClose(): void }) {
  const dialogRef = useRef<HTMLElement>(null);
  const [tab, setTab] = useState<"student" | "keys" | "mapping" | "rubric" | "checks">("student");
  const [showKeys, setShowKeys] = useState(false);
  useDialog(true, dialogRef, onClose);
  useEffect(() => { setTab("student"); }, [exam.assessmentVersionId]);
  const keyFor = (taskKey: string) => exam.graderPackage.keys.find((key) => key.taskKey === taskKey);
  return <div className="modal-backdrop operator-modal-scope" role="presentation" onClick={(event) => { if (event.target === event.currentTarget) onClose(); }}>
    <section ref={dialogRef} className="dialog operator-exam-preview" role="dialog" aria-modal="true" aria-labelledby="month-exam-title">
      <div className="row between operator-card-header">
        <h2 id="month-exam-title">{exam.title}</h2>
        <Button small onClick={onClose}>Đóng</Button>
      </div>
      <div className="row operator-exam-preview-meta small muted">
        <span>{exam.totalMinutes} phút · {exam.totalScore} điểm · {exam.cefr}</span>
        <Badge tone={exam.status === "approved" ? "ok" : "warn"}>{exam.status === "approved" ? "Đã duyệt" : "Nháp"}</Badge>
        <Badge tone={exam.audioStatus === "READY" ? "ok" : "warn"}>Audio: {exam.audioStatus === "READY" ? "đã nghe soát" : "SCRIPT_ONLY"}</Badge>
        <Badge tone={exam.blueprintStatus === "READY" ? "ok" : ""}>{exam.blueprintStatus}</Badge>
      </div>
      <div className="row operator-month-framework-tabs" role="tablist">
        {([["student", "Đề cho học viên"], ["keys", "Script & key"], ["mapping", "Ma trận mục tiêu"], ["rubric", "Rubric"], ["checks", "Kiểm tra GEN"]] as const).map(([key, label]) => <button key={key} type="button" role="tab" aria-selected={tab === key} className={`btn-sm ${tab === key ? "btn-primary" : "btn-ghost"}`} onClick={() => setTab(key)}>{label}</button>)}
        {tab === "student" && <label className="check small"><input type="checkbox" checked={showKeys} onChange={(event) => setShowKeys(event.target.checked)} /> Hiện đáp án</label>}
      </div>
      <div className="operator-exam-preview-body">
        {tab === "student" && exam.sections.map((section) => <div className="card soft" key={section.code}>
          <div className="row between"><b>{section.title}</b><span className="small muted">{section.durationMinutes} phút · {section.maxScore} điểm</span></div>
          {section.instructions.map((line) => <div className="small muted" key={line}>{line}</div>)}
          {section.groups.map((group) => <div className="operator-exam-group" key={group.key}>
            <b className="small">{group.title}</b>
            <div className="small muted">{group.instruction}{group.maxPlays ? ` · nghe tối đa ${group.maxPlays} lần` : ""}</div>
            {group.stimulus?.type === "passage" && group.stimulus.text && <blockquote className="small">{group.stimulus.text}</blockquote>}
            {group.stimulus?.type === "audio_script" && <div className="small muted">[Bản nghe — script nằm ở tab “Script & key”]</div>}
            <ol className="operator-exam-tasks">{group.tasks.map((task) => <li key={task.key}>
              <div><code>{task.key}</code> {task.prompt}</div>
              {task.options && <div className="row operator-exam-options">{task.options.map((option) => <span key={option.value} className={`chip ${showKeys && option.value === task.correctAnswer ? "ok" : ""}`}>{option.value}. {option.label}</span>)}</div>}
              {task.responseType !== "single_choice" && <div className="small muted">{task.responseType === "long_text" ? `Tự luận · ${task.minWords ?? "?"}–${task.maxWords ?? "?"} từ` : "Ghi âm"} · {task.maxScore} điểm{task.hint ? ` · ${task.hint}` : ""}</div>}
              {showKeys && task.evidenceCodes?.length ? <div className="small muted">Bằng chứng: {task.evidenceCodes.join(", ")}</div> : null}
            </li>)}</ol>
          </div>)}
        </div>)}
        {tab === "keys" && <>
          {exam.graderPackage.scripts.map((script) => <div className="card soft" key={script.key}><b>{script.title} ({script.key})</b>{script.lines.map((line, index) => <div className="small" key={index}><b>{line.speaker}:</b> {line.text}</div>)}</div>)}
          <div className="card soft"><b>Key và giải thích</b><table className="small"><thead><tr><th>Câu</th><th>Đáp án</th><th>Bằng chứng</th><th>Giải thích</th></tr></thead><tbody>{exam.graderPackage.keys.map((key) => <tr key={key.taskKey}><td><code>{key.taskKey}</code></td><td><b>{key.answer}</b></td><td>{key.evidence}</td><td>{key.explanation}</td></tr>)}</tbody></table></div>
          <div className="card soft"><b>Bài mẫu Writing</b><p className="small">{exam.graderPackage.sampleAnswers.writing}</p><b>Bài mẫu Speaking</b><p className="small">{exam.graderPackage.sampleAnswers.speaking}</p></div>
        </>}
        {tab === "mapping" && <div className="card soft"><table className="small"><thead><tr><th>Mục tiêu</th><th>Loại</th><th>Vị trí</th><th>Bằng chứng</th><th>Điểm</th></tr></thead><tbody>{exam.mapping.map((row, index) => <tr key={`${row.objective}-${row.position}-${index}`}><td><code>{row.objective}</code></td><td>{row.kind === "vocabulary" ? "Từ vựng" : row.kind === "grammar" ? "Ngữ pháp" : "Phát âm"}</td><td>{row.position}</td><td>{row.evidence}</td><td>{row.maxScore}</td></tr>)}</tbody></table></div>}
        {tab === "rubric" && <div className="grid cols-2">
          <div className="card soft"><b>Writing 25 điểm</b><ul className="small">{exam.graderPackage.rubric.writing.map((row) => <li key={row.code}><code>{row.code}</code> {row.label} — {row.max}</li>)}</ul></div>
          <div className="card soft"><b>Speaking 25 điểm</b><ul className="small">{exam.graderPackage.rubric.speaking.map((row) => <li key={row.code}><code>{row.code}</code> {row.label} — {row.max}</li>)}</ul></div>
          <div className="card soft small">Listening = đúng ÷ tổng câu × 25. Reading = đúng ÷ tổng câu × 25. Mỗi mục từ / vị trí âm / thành phần ngữ pháp max 1 chỉ nhận 0 · 0,5 · 1; max 2 chỉ nhận 0 · 1 · 2. Không trừ một lỗi hai lần. Xem đặc tả v1.1 mục 7.</div>
        </div>}
        {tab === "checks" && <div className="card soft"><ul className="small">{exam.checks.map((check) => <li key={check.code}><Badge tone={check.passed ? "ok" : "warn"}>{check.code}</Badge> {check.detail}</li>)}</ul><div className="small muted">GEN20 (audio đã nghe soát) luôn chưa đạt cho tới khi có pipeline audio; Listening chưa phát hành chính thức.</div></div>}
      </div>
    </section>
  </div>;
}
