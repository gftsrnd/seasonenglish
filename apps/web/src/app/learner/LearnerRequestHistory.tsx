import { useEffect, useState, type FormEvent } from "react";
import { Link, useSearchParams } from "react-router";
import type { AssessmentAppealTargetView, LearnerAcademicAppealView, LearnerComplaintKind, LearnerComplaintView } from "@e4s/contracts";
import { learnerApiClient } from "../../api/learner.js";
import { AssessmentAppealForm } from "./AssessmentAppealForm.js";
import { PageTitle } from "./ui.js";
import { RequestEvidenceDetails, RequestEvidenceFields, requestEvidenceArgs, type RequestEvidenceDraft } from "../shared/RequestEvidence.js";
import { RequestTable } from "../shared/RequestTable.js";
import { LearnerMonthlySurveys, LearnerSurveyHistoryEntry, useLearnerMonthlySurveys } from "./MonthlySurveys.js";

const complaintLabels: Record<LearnerComplaintKind, string> = {
  exam_eligibility: "Điều kiện dự thi", lesson_unlock: "Mở khóa bài học", account_unlock: "Mở khóa tài khoản",
  attendance: "Điểm danh sai", lesson_count: "Số bài học", account: "Tài khoản"
};
const appealLabels = { lesson: "Bài học", assessment: "Bài thi", practice: "Bài thực hành" };
const evidenceKinds = { lesson: "lesson_part", assessment: "assessment", practice: "weekly_practice" } as const;
const lessonPartNames: Record<string, string> = { listening: "Nghe", reading: "Đọc", speaking: "Nói", writing: "Viết", word_class: "Từ loại", word_use: "Cách dùng từ" };
const complaintKinds = ["attendance", "lesson_count", "account"] as const;

const supportFilters = [
  { value: "all", label: "Tất cả" },
  { value: "complaints", label: "Khiếu nại" },
  { value: "appeals", label: "Kháng nghị" },
  { value: "feedback", label: "Khảo sát tháng" }
] as const;

type SupportData = {
  complaints?: LearnerComplaintView[];
  appeals?: LearnerAcademicAppealView[];
  results?: AssessmentAppealTargetView[];
};

export function LearnerRequestHistory() {
  const [params] = useSearchParams();
  const requested = params.get("type") ?? params.get("tab");
  const filter = supportFilters.find(item => item.value === requested)?.value ?? "all";
  const focusedId = params.get("id");
  const fromProfile = params.get("from") === "profile";
  const [data, setData] = useState<SupportData>();
  const [revision, setRevision] = useState(0);
  const [notice, setNotice] = useState("");
  const surveys = useLearnerMonthlySurveys();
  const refresh = () => setRevision(value => value + 1);

  useEffect(() => {
    let active = true;
    void Promise.allSettled([
      learnerApiClient.getLearnerComplaints(),
      learnerApiClient.getLearnerAppeals(),
      learnerApiClient.getAppealableAssessments()
    ]).then(([complaints, appeals, results]) => {
      if (active) setData({
        ...(complaints.status === "fulfilled" ? { complaints: complaints.value.complaints } : {}),
        ...(appeals.status === "fulfilled" ? { appeals: appeals.value.appeals } : {}),
        ...(results.status === "fulfilled" ? { results: results.value.results } : {})
      });
    });
    return () => { active = false; };
  }, [revision]);

  useEffect(() => {
    if (focusedId && data) document.getElementById(`support-request-${focusedId}`)?.scrollIntoView?.({ block: "nearest" });
  }, [focusedId, data, filter]);

  const showComplaints = filter === "all" || filter === "complaints";
  const showAppeals = filter === "all" || filter === "appeals";
  const showFeedback = filter === "all" || filter === "feedback";
  const history = [
    ...(showComplaints ? data?.complaints ?? [] : []).map(item => ({ ...item, date: item.submittedAt, kindLabel: "Khiếu nại",
      title: complaintLabels[item.kind], evidenceKind: "complaint" as const })),
    ...(showAppeals ? data?.appeals ?? [] : []).map(item => ({ ...item, date: item.createdAt, kindLabel: "Kháng nghị",
      title: `${appealLabels[item.kind]} · ${item.title}`, evidenceKind: evidenceKinds[item.kind],
      scope: item.scope ?? (item.partCode ? lessonPartNames[item.partCode] ?? null : null) }))
  ].map(item => ({
    id: `support-request-${item.id}`,
    kind: item.kindLabel,
    date: item.date,
    content: <><b>{item.title}</b><p>{item.reason}</p><RequestEvidenceDetails kind={item.evidenceKind} item={item} />{item.resolution ? <p className="small muted">Phản hồi: {item.resolution}</p> : null}</>,
    status: <span className={`badge ${item.status === "pending" ? "warn" : item.status === "rejected" ? "danger" : "ok"}`}>{item.status === "pending" ? "Chờ xử lý" : item.status === "rejected" ? "Đã từ chối" : "Đã duyệt"}</span>
  }));
  const feedbackRows = (showFeedback ? surveys.submitted : []).map(({ form, submission }) => ({
    id: `support-feedback-${form.month}`,
    kind: "Góp ý",
    date: submission.submittedAt,
    content: <LearnerSurveyHistoryEntry form={form} submission={submission} expanded={surveys.submittedMonth === form.month || params.get("month") === form.month} />,
    status: <span className="badge ok">Đã gửi</span>
  }));
  const rows = [...history, ...feedbackRows].sort((a, b) => Date.parse(b.date) - Date.parse(a.date));
  const requestError = data && ((showComplaints && !data.complaints) || (showAppeals && !data.appeals) || (filter === "appeals" && !data.results));
  const surveyError = showFeedback && surveys.loadError;
  const loading = (filter !== "feedback" && !data) || (showFeedback && !surveys.view && !surveys.loadError);
  const listLabel = "Lịch sử hỗ trợ";

  return <div className="app-learner-page learner-support-page request-workspace">
    <PageTitle title="Hỗ trợ học tập" detail="Theo dõi khiếu nại, kháng nghị và góp ý của bạn."
      aside={<Link className="btn" to={fromProfile ? "/profile" : "/home"}>{fromProfile ? "Về Tiến độ & hồ sơ" : "Về Trang chủ"}</Link>} />
    <nav className="request-tabs" aria-label="Các mục hỗ trợ học tập">
      {supportFilters.map(item => {
        const search = new URLSearchParams();
        if (fromProfile) search.set("from", "profile");
        if (item.value !== "all") search.set("type", item.value);
        return <Link key={item.value} to={{ search: search.toString() }} aria-current={item.value === filter ? "page" : undefined}>{item.label}</Link>;
      })}
    </nav>
    {filter === "feedback" ? <LearnerMonthlySurveys surveys={surveys} month={params.get("month")} key={params.get("month") ?? ""} /> : null}
    {notice ? <p role="status">{notice}</p> : null}
    <section className="card request-card">
      <div className="request-filters">
        <h2>{filter === "complaints" ? "Khiếu nại đã gửi" : filter === "appeals" ? "Kháng nghị đã gửi" : filter === "feedback" ? "Lịch sử góp ý" : listLabel}</h2>
        {filter === "complaints" && data?.complaints ? <ComplaintForm key={params.get("kind")} lessonUnlock={params.get("kind") === "lesson_unlock"} complaints={data.complaints} submitted={() => { setNotice("Đã gửi khiếu nại cho Quản lý."); refresh(); }} /> : null}
      </div>
      {requestError || (surveyError && filter !== "feedback") ? <p role="alert">Chưa tải được đầy đủ lịch sử. <button type="button" className="btn" onClick={() => { refresh(); surveys.retry(); }}>Thử lại</button></p> : null}
      <RequestTable label={listLabel} rows={rows} empty={loading ? <span role="status">Đang tải…</span> : "Chưa có mục nào."} />
    </section>
    {filter === "appeals" && data?.results?.length ? <section className="card">
      <h2>Bài thi có thể kháng nghị</h2>
      <ul className="request-history-items">{data.results.map(result => <li key={result.attemptId}>
        <h3>{result.title}</h3>
        <AssessmentAppealForm target={result} submit={async (reason, ...evidence) => {
          await learnerApiClient.createAssessmentAppeal(result.attemptId, reason, ...evidence);
          setNotice("Đã gửi kháng nghị cho Vận hành.");
          refresh();
        }} />
      </li>)}</ul>
    </section> : null}
  </div>;
}

function ComplaintForm({ complaints, submitted, lessonUnlock }: { complaints: LearnerComplaintView[]; submitted: () => void; lessonUnlock: boolean }) {
  const [kind, setKind] = useState<LearnerComplaintKind>(lessonUnlock ? "lesson_unlock" : "attendance");
  const [reason, setReason] = useState("");
  const [evidence, setEvidence] = useState<RequestEvidenceDraft>({});
  const [open, setOpen] = useState(lessonUnlock);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);
  const pending = complaints.some(item => item.kind === kind && item.status === "pending");
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (busy || pending || evidence.blocked || reason.trim().length < 5) return;
    setBusy(true);
    setError(false);
    try {
      await learnerApiClient.submitLearnerComplaint(kind, reason.trim(), ...requestEvidenceArgs(evidence));
      setReason("");
      setEvidence({});
      setOpen(false);
      submitted();
    } catch { setError(true); }
    finally { setBusy(false); }
  };
  return !open ? <button type="button" className="btn-primary" onClick={() => setOpen(true)}>Gửi khiếu nại</button>
    : <form className="learner-support-form" onSubmit={submit} aria-busy={busy}>
      {lessonUnlock ? <b>Mở khóa bài học tháng</b> : <label>Loại khiếu nại<select value={kind} onChange={event => setKind(event.target.value as LearnerComplaintKind)}>{complaintKinds.map(value => <option value={value} key={value}>{complaintLabels[value]}</option>)}</select></label>}
      <RequestEvidenceFields value={evidence} onChange={setEvidence} label="Màn hình hoặc ngày xảy ra" placeholder="Ví dụ: Điểm danh ngày 06/11" disabled={busy} />
      <label>Lý do khiếu nại<textarea rows={3} value={reason} minLength={5} maxLength={2000} required onChange={event => setReason(event.target.value)} /></label>
      {pending ? <p role="status">Bạn đã có khiếu nại loại này đang chờ.</p> : null}
      {error ? <p role="alert">Chưa gửi được khiếu nại. Hãy thử lại.</p> : null}
      <div className="row"><button type="submit" className="btn-primary" disabled={busy || pending || evidence.blocked || reason.trim().length < 5}>{busy ? "Đang gửi…" : "Gửi cho Quản lý"}</button>
        <button type="button" className="btn" disabled={busy} onClick={() => { setOpen(false); setEvidence({}); }}>Hủy</button></div>
    </form>;
}
