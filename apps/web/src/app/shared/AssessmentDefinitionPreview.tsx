import { useState } from "react";
import type { AssessmentDefinitionView, AssessmentFormPreviewView, AssessmentSectionView, AssessmentStimulus } from "@e4s/contracts";

export type AssessmentPreviewStatus = "draft" | "published" | "retired";

export function AssessmentDefinitionPreview({
  definition,
  status,
  readOnly = true,
  audioConfigured,
  onEdit
}: {
  definition: AssessmentDefinitionView & { sections: AssessmentFormPreviewView["sections"] };
  status: AssessmentPreviewStatus;
  readOnly?: boolean;
  /** API-derived readiness for every listening source in the saved version. */
  audioConfigured?: boolean;
  onEdit?: () => void;
}) {
  const statusLabel = status === "published" ? "Đã phát hành" : status === "retired" ? "Đã lưu lịch sử" : "Bản nháp";
  const [selectedSectionCode, setSelectedSectionCode] = useState<string>();
  return <section className="card assessment-definition-preview" aria-label={`Xem đề ${definition.title}`}>
    <header className="assessment-definition-preview-header">
      <div>
        <p className="xs muted">CẤU TRÚC ĐỀ THI</p>
        <h2>{definition.title}</h2>
        <p className="small muted">Phiên bản {definition.version} · {statusLabel}</p>
      </div>
      <div className="row">
        <span className="badge">{readOnly ? "Chỉ xem" : statusLabel}</span>
        {!readOnly && status === "draft" && onEdit ? <button className="btn-sm" type="button" onClick={onEdit}>Sửa đề</button> : null}
      </div>
    </header>
    <div className="assessment-definition-preview-summary" aria-label="Tổng quan bài thi">
      <span><b>{definition.sections.length}</b><small> kỹ năng</small></span>
      <span><b>{definition.totalMinutes}</b><small> phút</small></span>
      <span><b>{definition.totalScore}</b><small> điểm</small></span>
    </div>
    <div className="table-wrap"><table aria-label="Cấu trúc bài thi"><thead><tr><th>Phần</th><th>Thời gian</th><th>Điểm</th><th>Nội dung</th></tr></thead><tbody>{definition.sections.map(section => <tr key={section.code}><td>{section.title}</td><td>{section.durationMinutes} phút</td><td><b>{section.maxScore}</b></td><td>{sectionSummary(section)}</td></tr>)}</tbody></table></div>
    <div className="assessment-definition-preview-rules" aria-label="Điều kiện trước khi thi"><p><b>Thiết bị:</b> tai nghe/loa và micro được kiểm tra trước khi bắt đầu.</p><p><b>Âm thanh:</b> {audioConfigured === undefined ? "chưa có trạng thái cấu hình." : audioConfigured ? "đã cấu hình nguồn audio cho phần Nghe." : "chưa đủ nguồn audio cho phần Nghe."}</p><p><b>Quy trình:</b> làm theo thứ tự Nghe → Đọc → Viết → Nói; mỗi phần đã nộp sẽ khóa.</p></div>
    <div className="assessment-definition-preview-sections" aria-label="Phần bài thi">{definition.sections.map(section => <div className="assessment-definition-preview-section-row" key={section.code}><button className={`assessment-definition-preview-section-trigger ${selectedSectionCode === section.code ? "active" : ""}`} type="button" aria-expanded={selectedSectionCode === section.code} aria-controls={`assessment-preview-${section.code}`} onClick={event => { const trigger = event.currentTarget; setSelectedSectionCode(section.code); window.requestAnimationFrame(() => trigger.scrollIntoView?.({ block: "start" })); }}><span><b>{section.title}</b><small>{taskCount(section)} câu · {section.durationMinutes} phút · {section.maxScore} điểm</small></span><span aria-hidden="true">⌄</span></button>{selectedSectionCode === section.code ? <section className="assessment-definition-preview-section" id={`assessment-preview-${section.code}`} aria-label={`Chi tiết ${section.title}`}><div className="assessment-definition-preview-section-body"><p className="small muted">{section.instructions.join(" · ")}</p>{section.groups.map(group => <section className="card flat assessment-definition-preview-group" key={group.key}><h3>{group.title}</h3><p className="small muted">{group.instruction}</p>{section.code === "listening" ? <ListeningReadiness {...(group.stimulus ? { stimulus: group.stimulus } : {})} /> : null}<Stimulus {...(group.stimulus ? { stimulus: group.stimulus } : {})} /><ol className="assessment-definition-preview-tasks">{group.tasks.map(task => <PreviewTask key={task.key} task={task} sectionCode={section.code} />)}</ol></section>)}</div></section> : null}</div>)}</div>
  </section>;
}

function taskCount(section: AssessmentSectionView) {
  return section.groups.reduce((total, group) => total + group.tasks.length, 0);
}

function sectionSummary(section: AssessmentSectionView) {
  const count = taskCount(section);
  return `${count} câu · ${section.instructions[0] ?? "Theo hướng dẫn của đề."}`;
}

function ListeningReadiness({ stimulus }: { stimulus?: AssessmentStimulus }) {
  const audio = stimulus?.type === "audio_script" ? stimulus.audioSrc?.trim() : undefined;
  if (stimulus?.type !== "audio_script") return null;
  return <section className={`assessment-definition-preview-audio ${audio ? "is-ready" : "is-missing"}`} aria-label="Audio và script"><h4>Audio &amp; script</h4><div className="assessment-definition-preview-audio-controls"><b>{audio ? "Nguồn audio đã sẵn sàng" : "Nguồn audio chưa sẵn sàng"}</b>{audio ? <audio controls preload="metadata" src={audio}>Trình duyệt không hỗ trợ audio.</audio> : <span className="small muted">Cần lưu file audio trước khi phát hành đề.</span>}</div>{stimulus.lines?.length || stimulus.text ? <div className="assessment-definition-preview-script"><b>Script dành cho vận hành</b>{stimulus.lines?.map((line, index) => <p key={index}><b>{line.speaker}:</b> {line.text}</p>) ?? <p>{stimulus.text}</p>}</div> : null}</section>;
}

function Stimulus({ stimulus }: { stimulus?: AssessmentStimulus }) {
  if (!stimulus || stimulus.type === "audio_script") return null;
  if (stimulus.type === "table") return <div className="table-wrap"><table><thead><tr>{stimulus.headers?.map(header => <th key={header}>{header}</th>)}</tr></thead><tbody>{stimulus.rows?.map((row, index) => <tr key={index}>{row.map((value, cell) => <td key={cell}>{value}</td>)}</tr>)}</tbody></table></div>;
  return <blockquote className="assessment-definition-preview-stimulus">{stimulus.lines?.map((line, index) => <p key={index}><b>{line.speaker}:</b> {line.text}</p>) ?? stimulus.text}</blockquote>;
}

function PreviewTask({ task, sectionCode }: { task: AssessmentFormPreviewView["sections"][number]["groups"][number]["tasks"][number]; sectionCode: AssessmentSectionView["code"] }) {
  const rubric = sectionCode === "writing"
    ? "Rubric: hoàn thành yêu cầu, tổ chức, từ vựng, ngữ pháp và văn phong công việc."
    : sectionCode === "speaking"
      ? "Rubric: hoàn thành yêu cầu, ngữ pháp và từ vựng, mạch lạc, tương tác và văn phong công việc."
      : null;
  return <li><p>{task.prompt}</p>{task.options?.length ? <ol type="A">{task.options.map(option => <li className={task.correctAnswer === option.value ? "assessment-definition-preview-correct-option" : ""} key={option.value}>{option.label}{task.correctAnswer === option.value ? <span>Đáp án đúng</span> : null}</li>)}</ol> : null}{task.minWords || task.maxWords ? <small>{task.minWords ? `Tối thiểu ${task.minWords} từ` : ""}{task.minWords && task.maxWords ? " · " : ""}{task.maxWords ? `tối đa ${task.maxWords} từ` : ""}</small> : null}{rubric ? <p className="assessment-definition-preview-task-rubric"><b>Đáp án &amp; chấm:</b> {rubric}{task.hint ? ` Bằng chứng mong đợi: ${task.hint}` : ""}</p> : null}</li>;
}


