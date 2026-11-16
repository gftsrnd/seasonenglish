import { useEffect, useState, type FormEvent } from "react";
import { Link, useSearchParams } from "react-router";
import type { AssessmentAppealTargetView, LearnerAcademicAppealView, LearnerComplaintKind, LearnerComplaintView } from "@e4s/contracts";
import { learnerApiClient } from "../../api/learner.js";
import { AssessmentAppealForm } from "./AssessmentAppealForm.js";
import { PlacementRetakeRequest } from "./PlacementRetakeRequest.js";
import { PageTitle } from "./ui.js";
import { RequestEvidenceDetails, RequestEvidenceFields, requestEvidenceArgs, type RequestEvidenceDraft } from "../shared/RequestEvidence.js";
import { RequestTable } from "../shared/RequestTable.js";
import { LearnerMonthlySurveys, useLearnerMonthlySurveys } from "./MonthlySurveys.js";
import { MonthlySurveyAnswers, surveyMonthLabel } from "../shared/MonthlySurveyFields.js";

const complaintLabels: Record<LearnerComplaintKind, string> = {
  exam_eligibility: "Điều kiện dự thi", lesson_unlock: "Mở khóa bài học", account_unlock: "Mở khóa tài khoản",
  attendance: "Điểm danh sai", lesson_count: "Số bài học", account: "Tài khoản"
};
const appealLabels = { lesson: "Bài học", assessment: "Bài thi", practice: "Bài thực hành" };
const evidenceKinds = { lesson: "lesson_part", assessment: "assessment", practice: "weekly_practice" } as const;
const lessonPartNames: Record<string, string> = { listening: "Nghe", reading: "Đọc", speaking: "Nói", writing: "Viết", word_class: "Từ loại", word_use: "Cách dùng từ" };
const complaintKinds = ["attendance", "lesson_count", "account"] as const;
/** Before the level is approved there are no lessons or attendance yet: only account complaints apply (the API enforces the same). */
const onboardingComplaintKinds = ["account"] as const;

const supportFilters = [
  { value: "all", label: "Tất cả" },
  { value: "complaints", label: "Khiếu nại" },
  { value: "appeals", label: "Kháng nghị" },
  { value: "feedback", label: "Khảo sát", suffix: " tháng" }
] as const;

type SupportData = {
  /** Appeals, monthly surveys and learning complaints open only once the placement level is approved; unknown (load failed) keeps them closed. */
  levelApproved?: boolean;
  complaints?: LearnerComplaintView[];
  appeals?: LearnerAcademicAppealView[];
  results?: AssessmentAppealTargetView[];
};

export function LearnerRequestHistory() {
  const [params, setParams] = useSearchParams();
  const requested = params.get("type") ?? params.get("tab");
  const [data, setData] = useState<SupportData>();
  const appealsOpen = data?.levelApproved === true;
  // A monthly survey asks about a month of lessons: it opens with the lessons, once the level is approved.
  const surveysOpen = data?.levelApproved === true;
  const filters = supportFilters.filter(item => (item.value !== "appeals" || appealsOpen) && (item.value !== "feedback" || surveysOpen));
  const requestedFilter = supportFilters.find(item => item.value === requested)?.value ?? "all";
  // Before the level is approved there is nothing to appeal or survey: a typed ?type=appeals/feedback URL falls back to All.
  const learningOnlyFilter = requestedFilter === "appeals" || requestedFilter === "feedback";
  const filter = learningOnlyFilter && data?.levelApproved === false ? "all" : requestedFilter;
  const focusedId = params.get("id");
  const [expandedRequest, setExpandedRequest] = useState<{ filter: typeof filter; focusedId: string | null; id: string | null }>();
  const openRequestId = expandedRequest?.filter === filter && expandedRequest.focusedId === focusedId ? expandedRequest.id : focusedId;
  const lessonUnlock = params.get("kind") === "lesson_unlock";
  const composing = filter === "complaints" && (lessonUnlock || params.get("compose") === "complaint");
  const fromProfile = params.get("from") === "profile";
  const [revision, setRevision] = useState(0);
  const [notice, setNotice] = useState("");
  const surveys = useLearnerMonthlySurveys();
  const refresh = () => setRevision(value => value + 1);
  const setComplaintFormOpen = (open: boolean) => {
    const next = new URLSearchParams(params);
    if (open) next.set("compose", "complaint");
    else {
      next.delete("compose");
      if (lessonUnlock) next.delete("kind");
    }
    setParams(next, { replace: true });
  };

  useEffect(() => {
    let active = true;
    void Promise.allSettled([
      learnerApiClient.getLearnerComplaints(),
      learnerApiClient.getLearnerAppeals(),
      learnerApiClient.getAppealableAssessments(),
      learnerApiClient.getProgress()
    ]).then(([complaints, appeals, results, progress]) => {
      if (active) setData({
        ...(progress.status === "fulfilled" ? { levelApproved: progress.value.learner.cefr != null } : {}),
        ...(complaints.status === "fulfilled" ? { complaints: complaints.value.complaints } : {}),
        ...(appeals.status === "fulfilled" ? { appeals: appeals.value.appeals } : {}),
        ...(results.status === "fulfilled" ? { results: results.value.results } : {})
      });
    });
    return () => { active = false; };
  }, [revision]);

  useEffect(() => {
    if (!learningOnlyFilter || data?.levelApproved !== false) return;
    const next = new URLSearchParams(params);
    next.delete("type");
    next.delete("tab");
    setParams(next, { replace: true });
  }, [requestedFilter, data?.levelApproved]);

  useEffect(() => {
    if (focusedId && data) document.getElementById(`support-request-${focusedId}`)?.scrollIntoView?.({ block: "nearest" });
  }, [focusedId, data, filter]);

  const showComplaints = filter === "all" || filter === "complaints";
  const showAppeals = appealsOpen && (filter === "all" || filter === "appeals");
  const showFeedback = surveysOpen && (filter === "all" || filter === "feedback");
  const history = [
    ...(showComplaints ? data?.complaints ?? [] : []).map(item => ({ ...item, date: item.submittedAt, kindLabel: "Khiếu nại",
      title: complaintLabels[item.kind], evidenceKind: "complaint" as const })),
    ...(showAppeals ? data?.appeals ?? [] : []).map(item => ({ ...item, date: item.createdAt, kindLabel: "Kháng nghị",
      title: `${appealLabels[item.kind]} · ${item.title}`, evidenceKind: evidenceKinds[item.kind],
      scope: item.scope ?? (item.partCode ? lessonPartNames[item.partCode] ?? null : null) }))
  ].map(item => {
    const expanded = openRequestId === item.id;
    const detailsId = `support-details-${item.id}`;
    return {
      id: `support-request-${item.id}`,
      kind: item.kindLabel,
      date: item.date,
      content: <b>{item.title}</b>,
      status: <span className={`badge ${item.status === "pending" ? "warn" : item.status === "rejected" ? "danger" : "ok"}`}>{item.status === "pending" ? "Chờ xử lý" : item.status === "rejected" ? "Đã từ chối" : "Đã duyệt"}</span>,
      action: <button type="button" className="btn btn-sm" aria-expanded={expanded} aria-controls={expanded ? detailsId : undefined}
        onClick={() => setExpandedRequest({ filter, focusedId, id: expanded ? null : item.id })}>{expanded ? "Thu gọn" : "Chi tiết"}</button>,
      detail: expanded ? <div id={detailsId} className="learner-support-request-detail">
        <div><h3>Nội dung đã gửi</h3><p>{item.reason}</p><RequestEvidenceDetails kind={item.evidenceKind} item={item} /></div>
        {item.resolution ? <div><h3>Phản hồi</h3><p>{item.resolution}</p></div> : null}
      </div> : null
    };
  });
  const feedbackRows = (showFeedback ? surveys.submitted : []).map(({ form, submission }) => {
    const id = `support-feedback-${form.month}`;
    const expanded = openRequestId === id;
    const detailsId = `${id}-answers`;
    return {
      id,
      kind: "Góp ý",
      date: submission.submittedAt,
      content: <><b>{form.title}</b><div className="muted">{surveyMonthLabel(form.month)}</div></>,
      status: <span className="badge ok">Đã gửi</span>,
      action: <button type="button" className="btn btn-sm" aria-expanded={expanded} aria-controls={expanded ? detailsId : undefined}
        onClick={() => setExpandedRequest({ filter, focusedId, id: expanded ? null : id })}>{expanded ? "Thu gọn" : "Chi tiết"}</button>,
      detail: expanded ? <div id={detailsId} className="learner-support-request-detail">
        <MonthlySurveyAnswers questions={form.questions} answers={submission.answers} />
      </div> : null
    };
  });
  const rows = [...history, ...feedbackRows].sort((a, b) => Date.parse(b.date) - Date.parse(a.date));
  const requestError = data && ((showComplaints && !data.complaints) || (showAppeals && !data.appeals) || (filter === "appeals" && (!appealsOpen || !data.results)) || (filter === "feedback" && !surveysOpen));
  const surveyError = showFeedback && surveys.loadError;
  const loading = !data || (showFeedback && !surveys.view && !surveys.loadError);
  const listLabel = "Lịch sử hỗ trợ";

  return <div className="app-learner-page learner-support-page request-workspace">
    <PageTitle title="Hỗ trợ học tập" detail={data?.levelApproved === false ? "Theo dõi khiếu nại của bạn." : "Theo dõi khiếu nại, kháng nghị và góp ý của bạn."}
      aside={<Link className="btn" to={fromProfile ? "/profile" : "/home"}>{fromProfile ? "Về Tiến độ & hồ sơ" : "Về Trang chủ"}</Link>} />
    <nav className="request-tabs" aria-label="Các mục hỗ trợ học tập">
      {filters.map(item => {
        const search = new URLSearchParams();
        if (fromProfile) search.set("from", "profile");
        if (item.value !== "all") search.set("type", item.value);
        return <Link key={item.value} to={{ search: search.toString() }} aria-current={item.value === filter ? "page" : undefined}>
          <span>{item.label}{"suffix" in item && <span className="learner-support-tab-suffix">{item.suffix}</span>}</span>
        </Link>;
      })}
    </nav>
    {filter === "feedback" && surveysOpen ? <LearnerMonthlySurveys surveys={surveys} month={params.get("month")} key={params.get("month") ?? ""} /> : null}
    {notice ? <p role="status">{notice}</p> : null}
    {composing && data?.complaints ? <ComplaintForm lessonUnlock={lessonUnlock} complaints={data.complaints} learning={data.levelApproved === true}
      cancel={() => setComplaintFormOpen(false)} submitted={() => { setComplaintFormOpen(false); setNotice("Đã gửi khiếu nại cho Quản lý."); refresh(); }} /> : null}
    {filter === "all" || filter === "appeals" ? <PlacementRetakeRequest onSent={() => { setNotice("Đã gửi yêu cầu thi lại cho Vận hành."); refresh(); }} /> : null}
    {filter === "appeals" && appealsOpen && data?.results?.length ? <section className="card learner-support-action">
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
    <section className="card request-card">
      <div className="request-filters learner-support-history-header">
        <h2>{filter === "complaints" ? "Khiếu nại đã gửi" : filter === "appeals" ? "Kháng nghị đã gửi" : filter === "feedback" ? "Lịch sử góp ý" : listLabel}</h2>
        {filter === "complaints" && data?.complaints && !composing ? <button type="button" className="btn-primary" onClick={() => setComplaintFormOpen(true)}>Gửi khiếu nại</button> : null}
      </div>
      {requestError || (surveyError && filter !== "feedback") ? <p role="alert">Chưa tải được đầy đủ lịch sử. <button type="button" className="btn" onClick={() => { refresh(); surveys.retry(); }}>Thử lại</button></p> : null}
      <RequestTable label={listLabel} rows={rows} empty={loading ? <span role="status">Đang tải…</span> : "Chưa có mục nào."} />
    </section>
  </div>;
}

function ComplaintForm({ complaints, submitted, cancel, lessonUnlock, learning }: { complaints: LearnerComplaintView[]; submitted: () => void; cancel: () => void; lessonUnlock: boolean; learning: boolean }) {
  const kinds: readonly LearnerComplaintKind[] = learning ? complaintKinds : onboardingComplaintKinds;
  const [kind, setKind] = useState<LearnerComplaintKind>(lessonUnlock ? "lesson_unlock" : kinds[0]!);
  const [reason, setReason] = useState("");
  const [evidence, setEvidence] = useState<RequestEvidenceDraft>({});
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
      submitted();
    } catch { setError(true); }
    finally { setBusy(false); }
  };
  return <section className="card learner-support-action" aria-labelledby="learner-complaint-title">
      <h2 id="learner-complaint-title">Khiếu nại mới</h2>
      <form className="learner-support-form" onSubmit={submit} aria-busy={busy}>
        {lessonUnlock ? <b>Mở khóa bài học tháng</b> : <label>Loại khiếu nại<select value={kind} onChange={event => setKind(event.target.value as LearnerComplaintKind)}>{kinds.map(value => <option value={value} key={value}>{complaintLabels[value]}</option>)}</select></label>}
        {!lessonUnlock && !learning ? <p className="small muted">Khiếu nại về <b>điểm danh</b> và <b>số bài học</b> mở khi bạn bắt đầu học.</p> : null}
        <RequestEvidenceFields value={evidence} onChange={setEvidence} label="Màn hình hoặc ngày xảy ra" placeholder="Ví dụ: Điểm danh ngày 06/11" disabled={busy} />
        <label>Lý do khiếu nại<textarea rows={3} value={reason} minLength={5} maxLength={2000} required onChange={event => setReason(event.target.value)} /></label>
        {pending ? <p role="status">Bạn đã có khiếu nại loại này đang chờ.</p> : null}
        {error ? <p role="alert">Chưa gửi được khiếu nại. Hãy thử lại.</p> : null}
        <div className="form-actions learner-support-form-actions">
          <button type="button" className="btn" disabled={busy} onClick={cancel}>Hủy</button>
          <button type="submit" className="btn-primary" disabled={busy || pending || evidence.blocked || reason.trim().length < 5}>{busy ? "Đang gửi…" : "Gửi cho Quản lý"}</button>
        </div>
      </form>
    </section>;
}
