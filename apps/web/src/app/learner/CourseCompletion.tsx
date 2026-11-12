import { useEffect, useState } from "react";
import { Link } from "react-router";
import { ChevronDown } from "lucide-react";
import { AssessmentAppealForm } from "./AssessmentAppealForm.js";
import { CertificateActions, CertificateDocument } from "./CertificateDocument.js";
import type { CourseCompletionView } from "@e4s/contracts";
import { learnerApiClient } from "../../api/learner.js";
import { formatScore, formatScoreOutOf } from "../shared/format-score.js";

const sectionNames = { listening: "Nghe", reading: "Đọc", writing: "Viết", speaking: "Nói" };
const outcomeNames = { correct: "Đúng", incorrect: "Sai", unanswered: "Chưa trả lời" };
const dateFormat = new Intl.DateTimeFormat("vi-VN", { day: "2-digit", month: "2-digit", year: "numeric", timeZone: "Asia/Ho_Chi_Minh" });

function useCourseCompletion() {
  const [record, setRecord] = useState<CourseCompletionView>();
  const [error, setError] = useState(false);
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    let active = true;
    void learnerApiClient.getCourseCompletion().then(value => {
      if (active) setRecord(value);
    }, () => { if (active) setError(true); });
    return () => { active = false; };
  }, [retry]);
  return { record, setRecord, error, retry: () => { setError(false); setRetry(value => value + 1); } };
}

export function CourseCompletion({ onPrint }: { onPrint: () => void }) {
  const { record, error, retry } = useCourseCompletion();
  const date = record ? dateFormat.format(new Date(record.issuedAt)) : "";
  return <div className="app-learner-page reward-page rw">
    {record ? <>
      <CertificateDocument organizationName={record.organizationName} certificateNumber={record.certificateNumber} learnerName={record.displayName}
        title="Chứng nhận hoàn thành E4S" declaration={<>đã đạt bài thi đầu ra của Season English ở trình độ <b>C1</b>.</>}
        summary={[{ label: "Ngày cấp", value: date }, { label: "Trình độ", value: "C1" }]}
        signature={record.issuerName ? <div className="cert-sign"><div><div className="line" /><div className="small">Người cấp</div><b>{record.issuerName}</b></div></div> : null}>
        <div className="cert-facts course-completion-facts">
          <div><span className="xs muted">Ngày cấp</span><b>{date}</b></div>
          <div><span className="xs muted">Trình độ</span><b>C1</b></div>
        </div>
      </CertificateDocument>
      <CertificateActions>
        <button className="btn" type="button" onClick={onPrint}>In / lưu PDF</button>
        <Link className="btn btn-primary" to="/home">Tiếp tục học</Link>
      </CertificateActions>
    </> : <section className="card">
      {error ? <p role="alert">Chưa tải được chứng nhận. <button type="button" className="btn" onClick={retry}>Thử lại</button></p> : <p role="status">Đang tải chứng nhận…</p>}
      <Link className="btn" to="/profile">Về hồ sơ</Link>
    </section>}
  </div>;
}

export function CourseAssessmentResult() {
  const { record, setRecord, error, retry } = useCourseCompletion();
  const scores = record?.scores ?? [];
  const complete = new Set(scores.filter(item => item.score !== null).map(item => item.section)).size === 4;
  const total = complete ? scores.reduce((sum, item) => sum + (item.score ?? 0), 0) : null;
  const maxScore = scores.reduce((sum, item) => sum + item.maxScore, 0);
  return <div className="profile-assessment-result" role="region" aria-label="Điểm đầu ra">
    <div className="eyebrow">Điểm đầu ra · C1</div>
    {!record ? error ? <p role="alert">Chưa tải được điểm đầu ra. <button type="button" className="btn" onClick={retry}>Thử lại</button></p>
      : <span role="status" className="muted">Đang tải điểm đầu ra…</span> : <>
      {total !== null ? <div><strong className="profile-assessment-total">{formatScore(total)}</strong><span className="muted"> / {formatScore(maxScore)}</span></div> : <span className="muted">Chưa có tổng điểm.</span>}
      <details className="course-completion-report">
        <summary><span>Chi tiết điểm đầu ra</span><ChevronDown size={18} aria-hidden="true" /></summary>
        {record.scores.length ? <dl>
          {record.scores.map(item => <div key={item.section}><dt>{sectionNames[item.section]}</dt><dd>{item.score === null ? "Chưa có điểm" : formatScoreOutOf(item.score, item.maxScore)}</dd></div>)}
        </dl> : <p>Chưa có bảng điểm chi tiết để hiển thị.</p>}
        {record.objectiveResults?.map(result => <details className="course-completion-questions" key={result.section}>
          <summary>Xem từng câu · {sectionNames[result.section]}</summary>
          <ol>{result.outcomes.map((outcome, index) => <li key={index}>Câu {index + 1} · {outcomeNames[outcome]}</li>)}</ol>
        </details>)}
        {record.feedback ? <p><b>Nhận xét Vận hành</b><br />{record.feedback}</p> : null}
        <AssessmentAppealForm target={record.appealTarget} appeal={record.appeal} submit={async (reason, ...evidence) => {
          if (!record.appealTarget) return;
          const appeal = await learnerApiClient.createAssessmentAppeal(record.appealTarget.attemptId, reason, ...evidence);
          setRecord({ ...record, appeal, appealTarget: null });
        }} />
      </details>
    </>}
  </div>;
}
