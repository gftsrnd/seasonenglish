import { useEffect, useRef, useState, type ReactNode } from "react";
import type { RewardView } from "@e4s/contracts";
import { Link } from "react-router";
import { AssessmentAppealForm } from "./AssessmentAppealForm.js";
import { BadgeCertificate, CertificateActions, CertificateDocument } from "./CertificateDocument.js";
import { ModalCloseButton } from "../shared/CompactUi.js";
import { useDialog } from "../shared/ModalProvider.js";
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

/** The badge view behind the course certificate: the learner's real badges ("done"), else the preview. */
function useCertificateBadges() {
  const [reward, setReward] = useState<RewardView | null>();
  useEffect(() => {
    let active = true;
    // A client without the reward endpoint (or a failed call) falls back to the plain course certificate.
    void Promise.resolve().then(() => learnerApiClient.getReward("done")).catch(() => learnerApiClient.getReward("preview")).then(
      value => { if (active) setReward(value); },
      () => { if (active) setReward(null); });
    return () => { active = false; };
  }, []);
  return reward;
}

export function CourseCompletion({ onPrint }: { onPrint: () => void }) {
  const { record, error, retry } = useCourseCompletion();
  const reward = useCertificateBadges();
  const date = record ? dateFormat.format(new Date(record.issuedAt)) : "";
  const declaration = <>đã đạt bài thi đầu ra của Season English ở trình độ <b>C1</b>.</>;
  return <div className="app-learner-page reward-page rw">
    {record && reward !== undefined ? <>
      {/* 18/11 #14: same template as reward/preview (badges included); the plain document is only a fallback. */}
      {reward ? <BadgeCertificate view={{ ...reward, cefrLabel: "C1" }} preview={false}
        course={{ title: "Chứng nhận hoàn thành E4S", declaration, issuedAt: record.issuedAt, certificateNumber: record.certificateNumber, learnerName: record.displayName }} />
        : <CertificateDocument organizationName={record.organizationName} certificateNumber={record.certificateNumber} learnerName={record.displayName}
          title="Chứng nhận hoàn thành E4S" declaration={declaration}
          summary={[{ label: "Ngày cấp", value: date }, { label: "Trình độ", value: "C1" }]}
          signature={record.issuerName ? <div className="cert-sign"><div><div className="line" /><div className="small">Người cấp</div><b>{record.issuerName}</b></div></div> : null}>
          <div className="cert-facts course-completion-facts">
            <div><span className="xs muted">Ngày cấp</span><b>{date}</b></div>
            <div><span className="xs muted">Trình độ</span><b>C1</b></div>
          </div>
        </CertificateDocument>}
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
  const [open, setOpen] = useState(false);
  const scores = record?.scores ?? [];
  const complete = new Set(scores.filter(item => item.score !== null).map(item => item.section)).size === 4;
  const total = complete ? scores.reduce((sum, item) => sum + (item.score ?? 0), 0) : null;
  const maxScore = scores.reduce((sum, item) => sum + item.maxScore, 0);
  return <div className="profile-assessment-result" role="region" aria-label="Điểm đầu ra">
    <div className="eyebrow">Điểm đầu ra · C1</div>
    {!record ? error ? <p role="alert">Chưa tải được điểm đầu ra. <button type="button" className="btn" onClick={retry}>Thử lại</button></p>
      : <span role="status" className="muted">Đang tải điểm đầu ra…</span> : <>
      {total !== null ? <div><strong className="profile-assessment-total">{formatScore(total)}</strong><span className="muted"> / {formatScore(maxScore)}</span></div> : <span className="muted">Chưa có tổng điểm.</span>}
      {/* 18/11 #9: the same view button and the same popup as the placement result ("Xem lại bài làm"). */}
      <div className="row"><button type="button" className="btn" onClick={() => setOpen(true)}>Xem lại bài làm</button></div>
      {open ? <CourseResultDialog record={record} total={total} maxScore={maxScore} onClose={() => setOpen(false)}>
        <AssessmentAppealForm target={record.appealTarget} appeal={record.appeal} submit={async (reason, ...evidence) => {
          if (!record.appealTarget) return;
          const appeal = await learnerApiClient.createAssessmentAppeal(record.appealTarget.attemptId, reason, ...evidence);
          setRecord({ ...record, appeal, appealTarget: null });
        }} />
      </CourseResultDialog> : null}
    </>}
  </div>;
}

/**
 * The exit-test result in the placement popup's layout and classes ("Bài đầu vào đã nộp"): header with ×, the
 * operator's feedback, then one expandable row per skill ("Nghe · 19/20") listing every question.
 * The course record has outcomes per question, not the questions themselves, so a row reads "Câu 3 · Sai".
 */
function CourseResultDialog({ record, total, maxScore, onClose, children }: { record: CourseCompletionView; total: number | null; maxScore: number; onClose: () => void; children: ReactNode }) {
  const dialogRef = useRef<HTMLElement>(null);
  useDialog(true, dialogRef, onClose);
  return <div className="modal-backdrop operator-modal-scope operator-detail-modal" role="presentation" onClick={event => { if (event.target === event.currentTarget) onClose(); }}>
    <section ref={dialogRef} className="dialog wide operator-detail-dialog operator-assessment-dialog learner-original-placement-dialog course-result-dialog" role="dialog" aria-modal="true" aria-labelledby="course-result-title" tabIndex={-1}>
      <div className="row between"><div><h3 id="course-result-title">Bài thi đầu ra</h3><p className="small muted">Pass Course · C1 · Tổng điểm: {total === null ? "Chờ đủ 4 kỹ năng" : formatScoreOutOf(total, maxScore)}</p></div><ModalCloseButton iconOnly label="Đóng" onClick={onClose} /></div>
      {record.feedback ? <p className="operator-answer-value operator-learner-feedback"><b>Phản hồi của Vận hành</b><br />{record.feedback}</p> : null}
      <h4 className="operator-detail-section-title">Điểm và từng câu</h4>
      <section className="operator-assessment-document"><div className="operator-answer-sections">
        {record.scores.map(item => {
          const outcomes = record.objectiveResults?.find(result => result.section === item.section)?.outcomes ?? [];
          return <details className="operator-answer-section" key={item.section}>
            <summary className="operator-answer-section-summary"><b>{sectionNames[item.section]} · {item.score === null ? "Chờ chấm" : formatScoreOutOf(item.score, item.maxScore)}</b></summary>
            <div className="operator-answer-section-content">{outcomes.length ? <div className="operator-answer-rows">{outcomes.map((outcome, index) => <article className="operator-answer-row" key={index}>
              <p className="operator-answer-question"><b>Câu {index + 1}</b> · <span className={outcome === "correct" ? "operator-answer-correct" : outcome === "incorrect" ? "operator-answer-wrong" : "muted"}>{outcomeNames[outcome]}</span></p>
            </article>)}</div> : <p className="small muted operator-answer-empty">Phần này được chấm theo tiêu chí, không có kết quả từng câu.</p>}</div>
          </details>;
        })}
      </div></section>
      {children}
    </section>
  </div>;
}
