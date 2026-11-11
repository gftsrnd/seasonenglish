import { useEffect, useId, useState } from "react";
import { Printer } from "lucide-react";
import type { CefrLevel, ManagerMonthlyFilter, ManagerMonthlyLearnerView, ManagerMonthlyOverviewView } from "@e4s/contracts";
import { managerApiClient } from "../../api/manager.js";
import { ReportAction } from "./Report.js";
import { useMediaQuery } from "../shared/useMediaQuery.js";
import { Badge, copyText, downloadText, formatDate, PageTitle, percent } from "./shared.js";

const levels = ["A1", "A2", "B1", "B2", "C1"] as const;
const learnerStates: Record<ManagerMonthlyLearnerView["state"], string> = {
  active: "Đang học",
  locked: "Đã khóa",
  unplaced: "Chưa làm bài đầu vào",
  placement_in_progress: "Đang làm bài đầu vào",
  placement_pending: "Chờ duyệt mức",
  placement_retry: "Cần làm lại bài đầu vào",
  waiting_content: "Chờ nội dung",
  waiting_next_month: "Chờ tháng sau",
  missed_exam: "Khóa do chưa thi tháng trước",
  graduated: "Đã hoàn thành khóa"
};
const examStates: Record<ManagerMonthlyLearnerView["exam"]["status"], string> = {
  unpublished: "Chưa mở đề", not_started: "Chưa làm", in_progress: "Đang làm",
  submitted: "Đã nộp", pending_review: "Chờ chấm", approved: "Đã chấm", needs_retry: "Chưa đạt"
};
const skills = { listening: "Nghe", reading: "Đọc", writing: "Viết", speaking: "Nói" } as const;
const sectionTitles = [
  "1. Ba chỉ số của tháng",
  "2. Quy mô và hoạt động",
  "3. Từng học viên",
  "4. Phản hồi khảo sát",
  "5. Việc cần làm tiếp"
] as const;

export function useManagerMonthlyOverview() {
  const [filter, setFilter] = useState<ManagerMonthlyFilter>({});
  const [view, setView] = useState<ManagerMonthlyOverviewView>();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  useEffect(() => {
    let current = true;
    void managerApiClient.getManagerMonthlyOverview(filter).then(
      (result) => { if (current) { setView(result); setLoading(false); } },
      () => { if (current) { setError("Không tải được số liệu tháng. Vui lòng thử lại."); setLoading(false); } }
    );
    return () => { current = false; };
  }, [filter]);
  const selectFilter = (next: ManagerMonthlyFilter) => {
    setLoading(true);
    setError("");
    setFilter({ ...next });
  };
  const rename = (learnerId: string, name: string) => setView((current) => current ? {
    ...current,
    learners: current.learners.map((learner) => learner.learnerId === learnerId ? { ...learner, learnerName: name } : learner)
  } : current);
  return { view, filter, selectFilter, rename, loading, error };
}

export function ManagerMonthlyReport({ view, filter, selectFilter, loading, error }: ReturnType<typeof useManagerMonthlyOverview>) {
  const compact = useMediaQuery("(max-width: 960px)");
  const [exportStatus, setExportStatus] = useState("");
  const [showActivity, setShowActivity] = useState(false);
  const activityId = useId();
  const selectedMonth = filter.month ?? view?.month ?? "";
  const selectedLevel = filter.cefr ?? "";
  const report = view && !loading && !error ? buildMonthlyReport(view) : null;
  const copyReport = async () => {
    if (!view || !report) return;
    try { await copyText(buildManagerMonthlyText(view, report)); setExportStatus("Đã sao chép báo cáo."); }
    catch { setExportStatus("Không thể sao chép báo cáo."); }
  };
  const downloadReport = () => {
    if (!view || !report) return;
    try {
      downloadText(`e4s-${view.month}-${view.cefr ?? "tat-ca"}.txt`, buildManagerMonthlyText(view, report), "text/plain;charset=utf-8");
      setExportStatus("Đã tải báo cáo dạng .txt.");
    } catch { setExportStatus("Không thể tải báo cáo dạng .txt."); }
  };

  return <div className="manager-page manager-report-page manager-monthly-report">
    <PageTitle description={<p className="muted">Kết quả học và thi theo tháng.</p>}><h1>Báo cáo tổng kết</h1></PageTitle>
    {view ? <article className="report">
      <header className="rhead">
        <div className="manager-monthly-report-title">
          <div className="eyebrow">Báo cáo tháng</div>
          <h2>Season English · {view.organizationName}</h2>
          <div className="meta">Tháng {view.month} · {view.cefr ?? "Tất cả mức"} · Ngày lập {formatDate(view.generatedAt)}</div>
        </div>
        <div className="row manager-monthly-report-actions no-print">
          <button className="btn btn-primary" type="button" aria-label="In / Lưu PDF" disabled={!report} onClick={() => window.print()}>
            <Printer size={16} strokeWidth={2} aria-hidden="true" /> <span className="manager-report-action-full">In / Lưu PDF</span><span className="manager-report-action-compact" aria-hidden="true">PDF</span>
          </button>
          <button className="btn" type="button" aria-label="Copy bản chữ" disabled={!report} onClick={() => void copyReport()}>
            <span className="manager-report-action-full">Copy bản chữ</span><span className="manager-report-action-compact" aria-hidden="true">Sao chép</span>
          </button>
          <button className="btn" type="button" disabled={!report} onClick={downloadReport}>Tải .txt</button>
        </div>
      </header>
      <p className="manager-monthly-export-status no-print" role="status">{exportStatus}</p>
      <div className="manager-monthly-filters no-print">
        <label>Tháng <input type="month" aria-label="Tháng báo cáo" value={selectedMonth} max={view.currentMonth} min="1900-01"
          onChange={(event) => {
            const month = event.target.value;
            if (/^(?:19|20|21)\d{2}-(?:0[1-9]|1[0-2])$/.test(month) && month <= view.currentMonth) selectFilter({ month, ...(selectedLevel ? { cefr: selectedLevel } : {}) });
          }} /></label>
        <label>Mức <select aria-label="Lọc theo mức" value={selectedLevel} onChange={(event) => {
          const cefr = event.target.value as CefrLevel | "";
          selectFilter({ ...(selectedMonth ? { month: selectedMonth } : {}), ...(cefr ? { cefr } : {}) });
        }}><option value="">Tất cả</option>{levels.map((level) => <option key={level}>{level}</option>)}</select></label>
      </div>
      {report ? <>
        <div className="summary" style={{ background: report.summaryBackground }}>
          <div className="eyebrow">Tóm tắt</div>{report.summary}
        </div>
        <h3>{sectionTitles[0]}</h3>
        <div className="table-wrap">
          <table className="manager-monthly-metrics" role="table" aria-label="Ba chỉ số của tháng">
            <thead role="rowgroup"><tr role="row"><th scope="col">Chỉ số</th><th scope="col">Kết quả</th><th scope="col">Mức đạt</th><th scope="col">Ngưỡng</th><th scope="col">Đánh giá</th></tr></thead>
            <tbody role="rowgroup">{report.metrics.map((metric) => <tr key={metric.label} role="row">
              <td role="cell"><b>{metric.label}</b><div className="xs muted">{metric.description}</div></td>
              <td role="cell"><span className="manager-monthly-cell-label" aria-hidden="true">Kết quả</span>
                <b className="manager-monthly-metric-value">{metric.result}</b>{metric.value !== null ? <div className="xs muted">{metric.detail}</div> : null}
              </td>
              <td role="cell"><span className="manager-monthly-cell-label" aria-hidden="true">Mức đạt</span>
                {metric.value !== null ? <div className={`progress ${metric.passed ? "ok" : "danger"}`} role="progressbar" aria-label={`Mức đạt ${metric.label}`} aria-valuemin={0} aria-valuemax={metric.max} aria-valuenow={metric.value}>
                  <i style={{ width: `${metric.value / metric.max * 100}%` }} />
                </div> : "—"}
              </td>
              <td role="cell"><span className="manager-monthly-cell-label" aria-hidden="true">Ngưỡng</span>{metric.threshold}</td>
              <td role="cell"><span className="manager-monthly-cell-label" aria-hidden="true">Đánh giá</span>
                <Badge tone={metric.value === null ? "" : metric.passed ? "ok" : "danger"}>{metric.assessment}</Badge>
              </td>
            </tr>)}</tbody>
          </table>
        </div>
        <div className="manager-report-activity-heading">
          <h3>{sectionTitles[1]}</h3>
          {compact && <button className="btn-sm no-print" type="button" aria-controls={activityId} aria-expanded={showActivity}
            onClick={() => setShowActivity((current) => !current)}>{showActivity ? "Thu gọn" : "Xem chi tiết"}</button>}
        </div>
        <div id={activityId} className="grid cols-2 manager-report-scale" data-collapsed={compact && !showActivity || undefined}>
          <div className="manager-report-level-distribution">
            <div className="eyebrow">Phân bố trình độ</div>
            {report.placed ? report.distribution.map(({ level, count }) => <div className="barrow" data-empty={count === 0 ? "true" : undefined} key={level}>
              <Badge tone="primary">{level}</Badge>
              <div className="progress" role="progressbar" aria-label={`Phân bố trình độ ${level}`} aria-valuemin={0} aria-valuemax={report.placed} aria-valuenow={count}>
                <i style={{ width: `${percent(count, report.placed)}%` }} />
              </div>
              <b>{count} người</b>
            </div>) : <p className="muted">Chưa có học viên được duyệt mức.</p>}
          </div>
          <table className="manager-report-activity-table" aria-label="Quy mô và hoạt động">
            <tbody>{report.activity.map(({ label, value }) => <tr key={label}><td>{label}</td><td><b>{value}</b></td></tr>)}</tbody>
          </table>
        </div>
        <h3>{sectionTitles[2]}</h3>
        {view.learners.length ? <>
          <div className="table-wrap manager-report-learner-table-wrap"><MonthlyLearnerTable learners={view.learners} /></div>
          {compact ? <MonthlyLearnerList key={`${view.month}:${view.cefr ?? ""}`} learners={view.learners} /> : null}
        </> : <p className="muted">Chưa có học viên trong bộ lọc này.</p>}
        <h3>{sectionTitles[3]}</h3>
        <div className="barrow">
          {view.survey.average !== null ? <Badge tone={view.survey.average >= 4 ? "ok" : "warn"}>{report.metrics[2].result}</Badge> : null}
          <span>{report.surveyDetail}</span>
        </div>
        <section className="manager-report-next-actions" aria-label="Phần việc cần làm tiếp">
          <h3>{sectionTitles[4]}</h3>
          <ul className="manager-next-actions" aria-label="Việc cần làm tiếp">
            {report.actions.map((action) => <ReportAction key={action.title} {...action} />)}
          </ul>
        </section>
        <footer className="foot">Số liệu tính tự động từ dữ liệu của tháng và mức đã chọn.</footer>
      </> : null}
    </article> : null}
    {error ? <div className="banner danger" role="alert">{error} <button className="btn-sm" type="button" onClick={() => selectFilter(filter)}>Thử lại</button></div> : null}
    {loading ? <p role="status">Đang tải số liệu tháng…</p> : null}
  </div>;
}

function buildMonthlyReport(view: ManagerMonthlyOverviewView) {
  const { learners, survey } = view;
  const active = learners.filter((learner) => learner.state === "active");
  const placed = learners.filter((learner) => learner.cefr !== null).length;
  const scored = learners.filter((learner) => learner.exam.total !== null).length;
  const onTrack = active.filter((learner) => learner.onTrack).length;
  const completed = active.filter((learner) => learner.completedToDate).length;
  const formatMetric = (metric: { label: string; description: string; value: number | null; detail: string; target: number; max: number; unit: string }) => {
    const passed = metric.value !== null && metric.value >= metric.target;
    return {
      ...metric, passed,
      result: metric.value === null ? "—" : `${metric.value.toLocaleString("vi-VN")}${metric.unit}`,
      threshold: `≥ ${metric.target}${metric.unit}`,
      assessment: metric.value === null ? "Chưa có dữ liệu" : passed ? "Đạt" : "Chưa đạt"
    };
  };
  const metrics = [
    formatMetric({
      label: "Duy trì nhịp học", description: "Điểm danh ít nhất 70% số ngày học đã qua",
      value: active.length ? percent(onTrack, active.length) : null,
      detail: `${onTrack}/${active.length} học viên đang học`, target: 70, max: 100, unit: "%"
    }),
    formatMetric({
      label: "Hoàn thành lộ trình tháng", description: "Hoàn thành các bài đến thời điểm báo cáo",
      value: active.length ? percent(completed, active.length) : null,
      detail: `${completed}/${active.length} học viên đang học`, target: 60, max: 100, unit: "%"
    }),
    formatMetric({
      label: "Hài lòng", description: "Điểm khảo sát trung bình", value: survey.average,
      detail: `${survey.ratingResponses} câu trả lời có điểm`, target: 4, max: 5, unit: "/5"
    })
  ] as const;
  const measured = metrics.filter((metric) => metric.value !== null).length;
  const passed = metrics.filter((metric) => metric.passed).length;
  const summary = [
    measured ? `Đạt ${passed}/${measured} chỉ số đã đo được` : "Chưa có dữ liệu để đánh giá",
    ...(measured > 0 && measured < metrics.length ? [`${metrics.length - measured} chỉ số chưa có dữ liệu`] : []),
    `${active.length}/${learners.length} học viên đang học`,
    `${scored} học viên đã có tổng điểm thi tháng`
  ].join(" · ") + ".";
  const summaryBackground = !measured ? "var(--surface-2)" : passed === measured ? "var(--mint)" : passed ? "var(--butter)" : "var(--peach)";
  const distribution = levels.map((level) => ({ level, count: learners.filter((learner) => learner.cefr === level).length }));
  const total = (select: (learner: ManagerMonthlyLearnerView) => number) => learners.reduce((sum, learner) => sum + select(learner), 0);
  const activity = [
    { label: "Học viên trong bộ lọc", value: `${learners.length} người · ${active.length} đang học` },
    { label: "Lượt điểm danh / ngày học", value: `${total((learner) => learner.attendedDays)}/${total((learner) => learner.elapsedDays)}` },
    { label: "Bài học hoàn thành / được giao", value: `${total((learner) => learner.lessons.completed)}/${total((learner) => learner.lessons.scheduled)}` },
    { label: "Bài ôn hoàn thành / được giao", value: `${total((learner) => learner.reviews.completed)}/${total((learner) => learner.reviews.scheduled)}` },
    { label: "Lượt Season hợp lệ", value: total((learner) => learner.season.turns) },
    { label: "Học viên có tổng điểm thi tháng", value: scored },
    { label: "Khiếu nại / kháng nghị", value: total((learner) => learner.complaintCount) }
  ];
  const actions: { title: string; detail: string; names?: { id: string; label: string }[] }[] = [];
  const addLearnerAction = (title: string, detail: string, group: readonly ManagerMonthlyLearnerView[]) => {
    if (group.length) actions.push({ title, detail: `${group.length} học viên ${detail}`, names: group.map((learner) => ({ id: learner.learnerId, label: learner.learnerName })) });
  };
  const current = view.month === view.currentMonth;
  addLearnerAction(current ? "Nhắc học" : "Rà soát điểm danh", "có nguy cơ vượt giới hạn vắng.", active.filter((learner) => learner.atRisk));
  addLearnerAction(current ? "Khuyến khích bắt đầu" : "Rà soát trường hợp chưa học", "chưa điểm danh trong tháng.", active.filter((learner) => !learner.atRisk && learner.elapsedDays > 0 && learner.attendedDays === 0));
  addLearnerAction("Theo dõi duyệt trình độ", "đang chờ duyệt mức.", learners.filter((learner) => learner.state === "placement_pending"));
  addLearnerAction("Theo dõi chấm bài thi tháng", "đã nộp bài và đang chờ kết quả.", learners.filter((learner) => learner.exam.status === "submitted" || learner.exam.status === "pending_review"));
  if (!survey.submissions) actions.push({ title: "Thu phản hồi hài lòng", detail: "Chưa có phiếu khảo sát trong bộ lọc này." });
  else if (survey.average === null) actions.push({ title: "Theo dõi điểm hài lòng", detail: "Các phiếu đã nộp chưa có câu trả lời được chấm điểm." });
  if (!actions.length) actions.push({ title: "Không có việc tồn đọng", detail: "Số liệu trong bộ lọc hiện tại chưa ghi nhận việc cần theo dõi." });

  return { metrics, summary, summaryBackground, placed, distribution, activity, surveyDetail: surveyDetail(survey), actions };
}

function surveyDetail({ submissions, ratingResponses, withoutRatingQuestion, unansweredRating }: ManagerMonthlyOverviewView["survey"]) {
  if (!submissions) return "Chưa có phản hồi";
  return [
    `${submissions} phiếu · ${ratingResponses} câu trả lời có điểm`,
    withoutRatingQuestion ? `${withoutRatingQuestion} phiếu không có câu chấm điểm` : "",
    unansweredRating ? `${unansweredRating} phiếu bỏ trống câu chấm điểm` : "",
  ].filter(Boolean).join(" · ");
}

export function monthlyExamLabel(exam: ManagerMonthlyLearnerView["exam"]) {
  return exam.total === null ? examStates[exam.status] : `${exam.total}/100 · ${examStates[exam.status]}`;
}

function MonthlySkillScores({ scores }: { scores: ManagerMonthlyLearnerView["exam"]["scores"] }) {
  if (Object.values(scores).every((score) => score === null)) return null;
  return <div className="manager-monthly-skill-scores">
    {(Object.keys(skills) as (keyof typeof skills)[]).map((key) => <span className="xs muted" key={key}>{skills[key]} {scores[key] ?? "—"}</span>)}
  </div>;
}

function MonthlyLearnerList({ learners }: { learners: readonly ManagerMonthlyLearnerView[] }) {
  const [showAll, setShowAll] = useState(false);
  const visibleLearners = showAll ? learners : learners.slice(0, 3);
  const remaining = learners.length - visibleLearners.length;
  return <><ul className="manager-monthly-learner-list" aria-label="Kết quả học tập theo tháng">
    {visibleLearners.map((learner) => <li key={learner.learnerId}>
      <details>
        <summary>
          <span className="manager-monthly-learner-summary">
            <span className="manager-monthly-learner-name"><b>{learner.learnerName}</b>{learner.cefr ? <Badge tone="primary">{learner.cefr}</Badge> : null}</span>
            <span className="muted">Thi tháng · {monthlyExamLabel(learner.exam)}</span>
          </span>
        </summary>
        <div className="manager-monthly-learner-detail">
          <div className="row">
            <Badge tone={learner.atRisk || learner.state === "locked" ? "warn" : ""}>{learnerStates[learner.state]}</Badge>
            <span className="muted">{learner.lastActivityAt ? `Gần nhất ${formatDate(learner.lastActivityAt)}` : "Chưa có hoạt động"}</span>
          </div>
          {learner.email ? <div className="muted">{learner.email}</div> : null}
          <dl className="manager-detail-metrics">
            <div><dt>Điểm danh</dt><dd>{learner.attendedDays}/{learner.elapsedDays} · Vắng {learner.absenceDays}/{learner.maxAbsences}{learner.consecutiveAbsences ? ` · ${learner.consecutiveAbsences} ngày liên tiếp` : ""}</dd></div>
            <div><dt>Bài học</dt><dd>{learner.lessons.completed}/{learner.lessons.scheduled} · Ôn {learner.reviews.completed}/{learner.reviews.scheduled}</dd></div>
            <div><dt>Season</dt><dd>{learner.season.turns}/{learner.season.target} lượt hợp lệ</dd></div>
            <div><dt>Khiếu nại / kháng nghị</dt><dd>{learner.complaintCount}</dd></div>
          </dl>
          <MonthlySkillScores scores={learner.exam.scores} />
        </div>
      </details>
    </li>)}
  </ul>
  {remaining > 0 ? <button className="btn-sm manager-report-more-learners no-print" type="button" onClick={() => setShowAll(true)}>Xem thêm {remaining} học viên</button> : null}</>;
}

function MonthlyLearnerTable({ learners }: { learners: readonly ManagerMonthlyLearnerView[] }) {
  return <table className="manager-monthly-table" role="table" aria-label="Kết quả học tập theo tháng">
    <thead role="rowgroup"><tr role="row"><th scope="col">Học viên</th><th scope="col">Điểm danh</th><th scope="col">Bài học</th><th scope="col">Season</th><th scope="col">Bài thi tháng</th><th scope="col">Khiếu nại / kháng nghị</th></tr></thead>
    <tbody role="rowgroup">{learners.map((learner) => <tr key={learner.learnerId} role="row">
      <td className="manager-monthly-identity"><div className="row"><b>{learner.learnerName}</b>{learner.cefr ? <Badge tone="primary">{learner.cefr}</Badge> : null}</div>
        <Badge tone={learner.atRisk || learner.state === "locked" ? "warn" : ""}>{learnerStates[learner.state]}</Badge>
      </td>
      <td><span className="manager-monthly-cell-label">Điểm danh</span><b>{learner.attendedDays}/{learner.elapsedDays}</b><div className="xs muted">Vắng {learner.absenceDays}/{learner.maxAbsences}</div>
        {learner.consecutiveAbsences ? <div className="xs muted">Vắng liên tiếp {learner.consecutiveAbsences} ngày</div> : null}
      </td>
      <td><span className="manager-monthly-cell-label">Bài học</span><b>{learner.lessons.completed}/{learner.lessons.scheduled} bài</b><div className="xs muted">{learner.reviews.completed}/{learner.reviews.scheduled} bài ôn</div></td>
      <td><span className="manager-monthly-cell-label">Season</span><b>{learner.season.turns}/{learner.season.target}</b><div className="xs muted">Lượt hợp lệ</div></td>
      <td><span className="manager-monthly-cell-label">Bài thi tháng</span><b>{monthlyExamLabel(learner.exam)}</b>
        <MonthlySkillScores scores={learner.exam.scores} />
      </td>
      <td><span className="manager-monthly-cell-label">Khiếu nại / kháng nghị</span>{learner.complaintCount}</td>
    </tr>)}</tbody>
  </table>;
}

function buildManagerMonthlyText(view: ManagerMonthlyOverviewView, report: ReturnType<typeof buildMonthlyReport>): string {
  const sections = [
    report.metrics.map((metric) => `${metric.label} · ${metric.result} · ${metric.threshold} · ${metric.assessment}${metric.value === null ? "" : ` · ${metric.detail}`}`),
    [
      report.placed ? `Phân bố trình độ · ${report.distribution.map(({ level, count }) => `${level} ${count}`).join(" · ")}` : "Chưa có học viên được duyệt mức.",
      ...report.activity.map(({ label, value }) => `${label} · ${value}`)
    ],
    view.learners.length ? view.learners.map((learner) => [
      `${learner.learnerName} · ${learner.cefr ?? "Chưa có mức"} · ${learnerStates[learner.state]}`,
      `Điểm danh ${learner.attendedDays}/${learner.elapsedDays} · vắng ${learner.absenceDays}/${learner.maxAbsences}`,
      `Bài học ${learner.lessons.completed}/${learner.lessons.scheduled} · ôn ${learner.reviews.completed}/${learner.reviews.scheduled} · Season ${learner.season.turns}/${learner.season.target}`,
      `Thi tháng ${monthlyExamLabel(learner.exam)} · ${(Object.keys(skills) as (keyof typeof skills)[]).map((key) => `${skills[key]} ${learner.exam.scores[key] ?? "—"}`).join(" · ")}`,
      `Khiếu nại / kháng nghị · ${learner.complaintCount}`
    ].join("\n")) : ["Chưa có học viên trong bộ lọc này."],
    [`Hài lòng · ${report.metrics[2].result} · ${report.surveyDetail}`],
    report.actions.map(({ title, detail, names }) => `${title} · ${detail}${names?.length ? ` · ${names.map(({ label }) => label).join(", ")}` : ""}`)
  ];
  return [
    `Báo cáo tháng · Season English · ${view.organizationName}`,
    `Tháng ${view.month} · ${view.cefr ?? "Tất cả mức"} · Ngày lập ${formatDate(view.generatedAt)}`,
    `Tóm tắt · ${report.summary}`,
    ...sections.map((lines, index) => [sectionTitles[index], ...lines].join("\n"))
  ].join("\n\n");
}

export function buildManagerMonthlyCsv(view: ManagerMonthlyOverviewView): string {
  const headers = ["Email", "Tên học viên", "Mức", "Trạng thái", "Điểm danh", "Ngày hiệu lực đã qua", "Vắng", "Vắng tối đa", "Bài hoàn thành", "Tổng bài", "Bài ôn hoàn thành", "Tổng bài ôn", "Lượt Season hợp lệ", "Chỉ tiêu Season", "Điểm Nghe", "Điểm Đọc", "Điểm Viết", "Điểm Nói", "Tổng điểm thi tháng", "Trạng thái thi tháng", "ĐK1", "ĐK2", "ĐK3", "ĐK4", "Khiếu nại / kháng nghị"];
  const rows = view.learners.map((learner) => [
    learner.email ?? "", learner.learnerName, learner.cefr ?? "", learnerStates[learner.state],
    learner.attendedDays, learner.elapsedDays, learner.absenceDays, learner.maxAbsences,
    learner.lessons.completed, learner.lessons.scheduled, learner.reviews.completed, learner.reviews.scheduled, learner.season.turns, learner.season.target,
    learner.exam.scores.listening ?? "", learner.exam.scores.reading ?? "", learner.exam.scores.writing ?? "", learner.exam.scores.speaking ?? "",
    learner.exam.total ?? "", examStates[learner.exam.status], ...Array.from({ length: 4 }, (_, index) => learner.levelCriteria ? (learner.levelCriteria[index] ? "Đạt" : "Chưa đạt") : ""), learner.complaintCount
  ]);
  const cell = (value: string | number) => {
    const content = typeof value === "string" && /^[\t\r\n =+@-]/.test(value) ? `'${value}` : String(value);
    return `"${content.replaceAll('"', '""')}"`;
  };
  return "\ufeff" + [headers, ...rows].map(row => row.map(cell).join(",")).join("\r\n");
}

export function exportManagerMonthlyCsv(view: ManagerMonthlyOverviewView) {
  downloadText(`e4s-${view.month}-${view.cefr ?? "tat-ca"}.csv`, buildManagerMonthlyCsv(view), "text/csv;charset=utf-8");
}
