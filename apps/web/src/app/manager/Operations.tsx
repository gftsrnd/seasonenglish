import type { ManagerOperationsView } from "@e4s/contracts";
import { useMediaQuery } from "../shared/useMediaQuery.js";
import { Badge, OperationalCards, PageTitle, type ManagerOperationalProps } from "./shared.js";

export type ManagerOperationsProps = ManagerOperationalProps & { view: ManagerOperationsView; deleteRequestCounts?: Readonly<Record<string, number>> };

export function ManagerOperations({ view, deleteRequestCounts, ...operational }: ManagerOperationsProps) {
  const compact = useMediaQuery("(max-width: 1180px)");
  return <div className="manager-page manager-operations-page">
    <PageTitle description={<p className="muted">{compact ? "Theo dõi số bài soạn, chất lượng và duyệt mức." : `${view.operators.length} người vận hành. Theo dõi công việc và chất lượng đầu ra.`}</p>}><h1>Hiệu suất vận hành</h1></PageTitle>
    <div className="manager-operations-context">
      <div className="banner info operator-read-only-banner" role="note" aria-label="Phạm vi của Quản lý"><div className="body small"><b>Quản lý theo dõi vận hành tài khoản.</b> Toàn bộ nội dung học, đánh giá, kháng nghị và thay đổi trình độ do Người vận hành xử lý.</div></div>
    </div>
    <OperationalCards {...operational} />
    <section className="card section manager-operators-section" aria-label="Theo dõi người vận hành">
      <div className="row between manager-section-heading"><div><h3>Người vận hành</h3>{!compact && <p className="small muted">Theo dõi nhanh người soạn/duyệt và chất lượng đầu ra. Danh sách này chỉ gồm tài khoản vận hành, không trộn vào bảng học viên.</p>}</div><span className="xs muted">{view.operators.length} người</span></div>
      {view.operators.length ? <div className="manager-operator-list">{view.operators.map((operator) => <OperatorRow key={operator.operatorId} operator={operator} currentWeek={view.currentWeek} compact={compact} {...(deleteRequestCounts ? { deleteRequestCount: deleteRequestCounts[operator.operatorId] ?? 0 } : {})} />)}</div> : <p className="muted">Chưa có tài khoản Người vận hành.</p>}
    </section>
    {!compact && <p className="xs muted">Chỉ số chất lượng chỉ có khi học viên hoàn thành bài.</p>}
  </div>;
}

function OperatorRow({ operator, currentWeek, compact, deleteRequestCount }: { operator: ManagerOperationsView["operators"][number]; currentWeek: number; compact: boolean; deleteRequestCount?: number }) {
  const quality = operator.averageScore === null && operator.failedPercent === null ? ["", "Chưa đủ dữ liệu"] : (operator.averageScore ?? 100) < 60 || (operator.failedPercent ?? 0) > 20 ? ["danger", "Cần xem lại"] : (operator.averageScore ?? 100) >= 75 && (operator.failedPercent ?? 0) <= 10 ? ["ok", "Tốt"] : ["warn", "Ổn"];
  const activity = `${operator.approvals} duyệt · ${operator.reviewedSubmissions} bài đọc · ${operator.completions} hoàn thành`;
  const metrics = (
    <div className="grid cols-2 manager-operator-grid">
      <div className="manager-metric-group"><div className="eyebrow">Số bài soạn theo tuần</div><div className="table-wrap"><table className="manager-operator-week-table" aria-label="Số bài soạn theo tuần"><thead><tr><th scope="col">Tuần</th><th scope="col">Bộ bài</th><th scope="col">Số bài</th><th scope="col">Đã duyệt</th></tr></thead><tbody>{operator.byWeek.map((row) => <tr key={row.week} style={row.week === currentWeek ? { fontWeight: 800 } : undefined}><td>Tuần {row.week}{row.week === currentWeek ? " (hiện tại)" : ""}</td><td>{row.sets}</td><td>{row.lessons}</td><td>{row.sets ? `${row.approved}/${row.sets}` : "—"}</td></tr>)}</tbody></table></div><Metric label="Bài đủ cấu trúc chuẩn (4 kỹ năng + 3 thành phần)" value={ratio(operator.fullLessons, operator.lessons)} /><Metric label="Bài đã sửa tay sau khi AI sinh" value={value(operator.editedLessons)} /></div>
      <div className="manager-metric-group"><div className="eyebrow">Chất lượng qua kết quả học viên</div>{!compact && <><Metric label="Lượt hoàn thành bài" value={String(operator.completions)} /><Metric label="Điểm trung bình của bài" value={value(operator.averageScore, "%")} /></>}<Metric label="Phần làm đúng ngay lần đầu" value={value(operator.firstTryPercent, "%")} /><Metric label="Phần hết 2 lượt vẫn sai" value={value(operator.failedPercent, "%")} /><Metric label="Số lần làm trung bình mỗi phần" value={value(operator.averageAttempts)} /><div className="eyebrow manager-metric-subheading">Việc duyệt và kiểm tra</div>{!compact && <Metric label="Học viên đã duyệt mức" value={String(operator.approvals)} />}<Metric label="Thời gian chờ duyệt mức trung bình" value={value(operator.averageApprovalHours, " giờ")} /><Metric label="Bài nộp đã đọc mẫu" value={String(operator.reviewedSubmissions)} /><Metric label="Phản hồi coach đã kiểm" value={String(operator.reviewedCoachTurns)} />{deleteRequestCount !== undefined ? <Metric label="Yêu cầu xoá tài khoản đã gửi" value={String(deleteRequestCount)} /> : null}</div>
    </div>
  );
  return <details className="manager-operator-row" aria-label={`Theo dõi ${operator.operatorName}`}>
    <summary className="manager-operator-summary">
      <span className="manager-operator-name"><b>{operator.operatorName}</b><span className="xs muted">Người vận hành</span></span>
      <span className="manager-operator-output">
        <span><b>{operator.sets}</b> bộ · <b>{operator.lessons}</b> bài</span>
        <span><b>{operator.published}</b> đã duyệt</span>
      </span>
      <span className="manager-operator-quality"><Badge tone={quality[0] as "" | "ok" | "warn" | "danger"}>{quality[1]}</Badge></span>
      <span className="small muted manager-operator-activity">{activity}</span>
      <span className="manager-operator-toggle" aria-hidden="true">Chi tiết</span>
    </summary>
    <div className="manager-operator-detail">
      {compact ? <>
        <dl className="manager-operator-key-metrics">
          <div><dt>Hoàn thành</dt><dd>{operator.completions}</dd></div>
          <div><dt>Điểm TB</dt><dd>{value(operator.averageScore, "%")}</dd></div>
          <div><dt>Duyệt mức</dt><dd>{operator.approvals}</dd></div>
        </dl>
        <details className="manager-operator-breakdown">
          <summary>Số liệu theo tuần và chất lượng</summary>
          {metrics}
          <p className="xs muted">Chỉ số chất lượng chỉ có khi học viên hoàn thành bài.</p>
        </details>
      </> : metrics}
    </div>
  </details>;
}

function Metric({ label, value }: { label: string; value: string }) { return <div className="row between small" style={{ gap: 12, padding: "7px 0", borderBottom: "1px dashed var(--line)" }}><span>{label}</span><b>{value}</b></div>; }
function value(input: number | null, suffix = "") { return input === null ? "—" : `${input}${suffix}`; }
function ratio(input: number | null, total: number) { return input === null ? "—" : `${input}/${total}`; }
