import type { ManagerOperationsView, ManagerOperatorMonthlyPerformance } from "@e4s/contracts";
import { useMediaQuery } from "../shared/useMediaQuery.js";
import { Badge, ManagerTitle, OperationalCards, PageTitle, type ManagerOperationalProps } from "./shared.js";
import { PagedList } from "../shared/Pager.js";

export type ManagerOperationsProps = ManagerOperationalProps & {
  view: ManagerOperationsView;
  deleteRequestCounts?: Readonly<Record<string, number>>;
  onSelectMonth?: (month: string) => void;
  monthLoading?: boolean;
};

const poolStatusLabels: Record<string, string> = { draft: "Bản nháp", generating: "Đang sinh", approved: "Đã duyệt", failed: "Sinh lỗi" };

export function monthLabel(month: string) {
  const [year, number] = month.split("-");
  return `Tháng ${Number(number)}/${year}`;
}

export function ManagerOperations({ view, deleteRequestCounts, onSelectMonth, monthLoading = false, ...operational }: ManagerOperationsProps) {
  const compact = useMediaQuery("(max-width: 1180px)");
  const months = view.availableMonths.length ? view.availableMonths : [view.month];
  const summary = view.monthSummary;
  return <div className="manager-page manager-operations-page">
    <PageTitle description={compact ? undefined : <p className="muted">{`${view.operators.length} người vận hành. Theo dõi nội dung tháng và chất lượng đầu ra.`}</p>}><h1>Hiệu suất vận hành</h1></PageTitle>
    <div className="manager-operations-context">
      <div className="banner info operator-read-only-banner" role="note" aria-label="Phạm vi của Quản lý"><div className="body small"><b>Quản lý theo dõi vận hành tài khoản.</b> Toàn bộ nội dung học, đánh giá, kháng nghị và thay đổi trình độ do Người vận hành xử lý.</div></div>
    </div>
    <OperationalCards {...operational} />
    <section className="card section manager-operators-section" aria-label="Theo dõi người vận hành" aria-busy={monthLoading || undefined}>
      <div className="row between manager-section-heading">
        <div><ManagerTitle title={compact ? "Người vận hành" : <>Người vận hành · {monthLabel(view.month)}</>} label="Người vận hành: giải thích" tip={`${view.operators.length} người vận hành. Số liệu nội dung tháng của từng người vận hành: bộ tài nguyên, bài học tháng và đề thi tháng. Chỉ số chất lượng chỉ có khi học viên hoàn thành bài học tháng do người vận hành soạn hoặc duyệt.`} />{!compact && <p className="small muted">Số liệu nội dung tháng của từng người vận hành: bộ tài nguyên, bài học tháng và đề thi tháng.</p>}</div>
        <label className="manager-operations-month">
          <span className="xs muted">Tháng</span>
          <select aria-label="Chọn tháng" value={view.month} disabled={!onSelectMonth || monthLoading} onChange={(event) => onSelectMonth?.(event.target.value)}>
            {months.map((month) => <option key={month} value={month}>{compact ? monthLabel(month).replace(/^Tháng\s*/u, "") : monthLabel(month)}{month === view.currentMonth ? " (hiện tại)" : ""}</option>)}
          </select>
        </label>
      </div>
      <p className="small muted manager-operations-month-summary" aria-label="Tổng quan tháng">
        Cả tổ chức: <b>{summary.approvedFrameworks}/{summary.frameworks}</b> bộ tài nguyên đã duyệt · <b>{summary.publishedFrameworks}</b> đã phát hành · <b>{summary.approvedLessons}/{summary.lessons}</b> bài đã duyệt{summary.failedLessons ? <> · <b>{summary.failedLessons}</b> bài đang sinh lỗi</> : null}
      </p>
      {view.operators.length ? <div className="manager-operator-list">{view.operators.map((operator) => <OperatorRow key={operator.operatorId} operator={operator} compact={compact} {...(deleteRequestCounts ? { deleteRequestCount: deleteRequestCounts[operator.operatorId] ?? 0 } : {})} />)}</div> : <p className="muted">Chưa có tài khoản Người vận hành.</p>}
    </section>
    {!compact && <p className="xs muted">Chỉ số chất lượng chỉ có khi học viên hoàn thành bài học tháng do người vận hành soạn hoặc duyệt.</p>}
  </div>;
}

function OperatorRow({ operator, compact, deleteRequestCount }: { operator: ManagerOperatorMonthlyPerformance; compact: boolean; deleteRequestCount?: number }) {
  const quality = operator.averageScore === null && operator.failedPercent === null ? ["", "Chưa đủ dữ liệu"] : (operator.averageScore ?? 100) < 60 || (operator.failedPercent ?? 0) > 20 ? ["danger", "Cần xem lại"] : (operator.averageScore ?? 100) >= 75 && (operator.failedPercent ?? 0) <= 10 ? ["ok", "Tốt"] : ["warn", "Ổn"];
  const activity = `${operator.approvals} duyệt mức · ${operator.finalsGenerated} đề thi sinh · ${operator.completions} hoàn thành`;
  const metrics = (
    <div className="grid cols-2 manager-operator-grid">
      <div className="manager-metric-group">
        <div className="eyebrow">Bộ tài nguyên theo cấp độ</div>
        {operator.resourcePools.length ? <div className="table-wrap"><table className="manager-operator-pool-table" aria-label={`Bộ tài nguyên của ${operator.operatorName}`}><thead><tr><th scope="col">Cấp độ</th><th scope="col">Trạng thái</th><th scope="col">Tạo</th><th scope="col">Duyệt</th><th scope="col">Phát hành</th></tr></thead><tbody>{operator.resourcePools.map((pool) => <tr key={pool.cefr}><td>{pool.cefr}</td><td>{poolStatusLabels[pool.status] ?? pool.status}</td><td>{pool.createdByOperator ? "Có" : "—"}</td><td>{pool.approvedByOperator ? "Có" : "—"}</td><td>{pool.published ? "Có" : "—"}</td></tr>)}</tbody></table></div> : <p className="small muted">Chưa tạo hoặc duyệt bộ tài nguyên nào trong tháng.</p>}
        <div className="eyebrow manager-metric-subheading">Bài học tháng</div>
        <Metric label="Bài đã soạn (bản nháp hiện tại)" value={String(operator.lessonsDrafted)} />
        <Metric label="Bài đã lưu nhiều bản nháp (sinh lại hoặc sửa tay)" value={String(operator.lessonsResaved)} />
        <Metric label="Bài đã duyệt" value={String(operator.lessonsApproved)} />
        <Metric label="Bài đã phát hành cho học viên" value={String(operator.lessonsPublished)} />
        <Metric label="Yêu cầu sửa bài đã duyệt" value={String(operator.correctionsRequested)} />
        <Metric label="Thời gian trung bình từ soạn đến duyệt" value={value(operator.averageDraftToApprovalHours, " giờ")} />
        <div className="eyebrow manager-metric-subheading">Đề thi tháng</div>
        <Metric label="Đề đã sinh bằng AI" value={String(operator.finalsGenerated)} />
        <Metric label="Lượt sinh đề bị lỗi" value={String(operator.finalGenerationFailures)} />
        <Metric label="Đề đã phát hành" value={String(operator.finalsPublished)} />
      </div>
      <div className="manager-metric-group"><div className="eyebrow">Chất lượng qua kết quả học viên</div>{!compact && <><Metric label="Lượt hoàn thành bài" value={String(operator.completions)} /><Metric label="Điểm trung bình của bài" value={value(operator.averageScore, "%")} /></>}<Metric label="Phần làm đúng ngay lần đầu" value={value(operator.firstTryPercent, "%")} /><Metric label="Phần hết 2 lượt vẫn sai" value={value(operator.failedPercent, "%")} /><Metric label="Số lần làm trung bình mỗi phần" value={value(operator.averageAttempts)} /><div className="eyebrow manager-metric-subheading">Việc duyệt và kiểm tra</div>{!compact && <Metric label="Học viên đã duyệt mức trong tháng" value={String(operator.approvals)} />}<Metric label="Thời gian chờ duyệt mức trung bình" value={value(operator.averageApprovalHours, " giờ")} /><Metric label="Bài nộp đã đọc mẫu (tổng)" value={String(operator.reviewedSubmissions)} /><Metric label="Phản hồi coach đã kiểm (tổng)" value={String(operator.reviewedCoachTurns)} />{deleteRequestCount !== undefined ? <Metric label="Yêu cầu xoá tài khoản đã gửi" value={String(deleteRequestCount)} /> : null}</div>
    </div>
  );
  const poolTable = operator.resourcePools.length ? <div className="table-wrap"><table className="manager-operator-pool-table" aria-label={`Bộ tài nguyên của ${operator.operatorName}`}><thead><tr><th scope="col">Cấp độ</th><th scope="col">Trạng thái</th><th scope="col">Tạo</th><th scope="col">Duyệt</th><th scope="col">Phát hành</th></tr></thead><tbody>{operator.resourcePools.map((pool) => <tr key={pool.cefr}><td>{pool.cefr}</td><td>{poolStatusLabels[pool.status] ?? pool.status}</td><td>{pool.createdByOperator ? "Có" : "—"}</td><td>{pool.approvedByOperator ? "Có" : "—"}</td><td>{pool.published ? "Có" : "—"}</td></tr>)}</tbody></table></div> : <p className="small muted">Chưa có bộ tài nguyên trong tháng.</p>;
  // Phones/tablets: one metric group per page instead of a long nested list.
  const metricGroups = compact ? [
    <><div className="eyebrow">Bộ tài nguyên theo cấp độ</div>{poolTable}</>,
    <><div className="eyebrow">Bài học tháng</div><Metric label="Bài đã soạn" value={String(operator.lessonsDrafted)} /><Metric label="Bài lưu nhiều bản nháp" value={String(operator.lessonsResaved)} /><Metric label="Bài đã duyệt" value={String(operator.lessonsApproved)} /><Metric label="Bài đã phát hành" value={String(operator.lessonsPublished)} /><Metric label="Yêu cầu sửa bài đã duyệt" value={String(operator.correctionsRequested)} /><Metric label="TB từ soạn đến duyệt" value={value(operator.averageDraftToApprovalHours, " giờ")} /></>,
    <><div className="eyebrow">Đề thi tháng</div><Metric label="Đề đã sinh bằng AI" value={String(operator.finalsGenerated)} /><Metric label="Lượt sinh đề bị lỗi" value={String(operator.finalGenerationFailures)} /><Metric label="Đề đã phát hành" value={String(operator.finalsPublished)} /></>,
    <><div className="eyebrow">Chất lượng qua kết quả học viên</div><Metric label="Đúng ngay lần đầu" value={value(operator.firstTryPercent, "%")} /><Metric label="Hết 2 lượt vẫn sai" value={value(operator.failedPercent, "%")} /><Metric label="Số lần làm TB mỗi phần" value={value(operator.averageAttempts)} /></>,
    <><div className="eyebrow">Việc duyệt và kiểm tra</div><Metric label="Chờ duyệt mức TB" value={value(operator.averageApprovalHours, " giờ")} /><Metric label="Bài nộp đã đọc mẫu" value={String(operator.reviewedSubmissions)} /><Metric label="Phản hồi coach đã kiểm" value={String(operator.reviewedCoachTurns)} />{deleteRequestCount !== undefined ? <Metric label="Yêu cầu xoá tài khoản" value={String(deleteRequestCount)} /> : null}</>
  ] : [];
  return <details className="manager-operator-row" aria-label={`Theo dõi ${operator.operatorName}`}>
    <summary className="manager-operator-summary">
      <span className="manager-operator-name"><b>{operator.operatorName}</b><span className="xs muted">Người vận hành</span></span>
      <span className="manager-operator-output">
        <span><b>{operator.poolsCreated}</b> bộ tài nguyên · <b>{operator.lessonsDrafted}</b> bài</span>
        <span><b>{operator.lessonsApproved}</b> bài đã duyệt</span>
      </span>
      <span className="manager-operator-quality"><Badge tone={quality[0] as "" | "ok" | "warn" | "danger"}>{quality[1]}</Badge></span>
      <span className="small muted manager-operator-activity">{activity}</span>
      <span className="manager-operator-toggle" aria-hidden="true">Chi tiết</span>
    </summary>
    <div className="manager-operator-detail">
      {compact ? <>
        <dl className="manager-operator-key-metrics">
          <div><dt>Bài đã duyệt</dt><dd>{operator.lessonsApproved}</dd></div>
          <div><dt>Điểm TB</dt><dd>{value(operator.averageScore, "%")}</dd></div>
          <div><dt>Đề thi sinh</dt><dd>{operator.finalsGenerated}</dd></div>
        </dl>
        <div className="manager-operator-breakdown manager-operator-breakdown--paged">
          <PagedList items={metricGroups} phone={1} tablet={2} label={`số liệu ${operator.operatorName}`}>{(group) => <div className="manager-metric-group">{group}</div>}</PagedList>
        </div>
      </> : metrics}
    </div>
  </details>;
}

function Metric({ label, value }: { label: string; value: string }) { return <div className="row between small" style={{ gap: 12, padding: "7px 0", borderBottom: "1px dashed var(--line)" }}><span>{label}</span><b>{value}</b></div>; }
function value(input: number | null, suffix = "") { return input === null ? "—" : `${input}${suffix}`; }
