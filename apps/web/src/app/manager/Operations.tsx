import type { ManagerOperationsView } from "@e4s/contracts";
import { Badge, OperationalCards, PageTitle, type ManagerOperationalProps } from "./shared.js";

export type ManagerOperationsProps = ManagerOperationalProps & { view: ManagerOperationsView; deleteRequestCounts?: Readonly<Record<string, number>> };

export function ManagerOperations({ view, deleteRequestCounts, ...operational }: ManagerOperationsProps) {
  const readiness = view.readiness;
  return <div className="manager-page manager-operations-page">
    <PageTitle><h1>Hiệu suất vận hành</h1><p className="muted">Tuần {view.currentWeek}/{view.pilotWeeks} · {view.operators.length} người vận hành. Số bài soạn/tuần; chất lượng qua kết quả học viên.</p></PageTitle>
    <OperationalCards {...operational} />
    <section className="card section manager-readiness-card" aria-label="Trạng thái bộ bài" style={{ background: !readiness || readiness.requiredSets === 0 ? "var(--surface)" : readiness.missing.length ? "var(--butter)" : "var(--mint)" }}>
      <div className="row between manager-section-heading"><h3>Bộ bài đã sẵn sàng đến tuần {view.currentWeek}</h3>{readiness ? <Badge tone={readiness.readySets === readiness.requiredSets ? "ok" : "warn"}>{readiness.readySets}/{readiness.requiredSets} bộ đã duyệt</Badge> : <Badge>Chưa có dữ liệu</Badge>}</div>
      {!readiness ? <p className="muted">API chưa trả dữ liệu bộ bài bắt buộc.</p> : readiness.requiredSets === 0 ? <p>Chưa có học viên được duyệt mức nên chưa cần bộ bài nào.</p> : readiness.missing.length ? <p>Còn thiếu: {readiness.missing.map((item) => `Tuần ${item.week} · ${item.cefr} (${item.state === "draft" ? "bản nháp chưa duyệt" : "chưa sinh"})`).join("; ")}.</p> : <p>Mọi mức đang có học viên đều đã có bộ bài được duyệt.</p>}
    </section>
    <section className="card section manager-operations-actions" aria-label="Thao tác vận hành của Quản lý">
      <div className="manager-section-heading"><h3>Thao tác vận hành</h3><p className="small muted">Quản lý có thể mở và xử lý trực tiếp các phần vận hành như Người vận hành.</p></div>
      <nav className="manager-operations-action-list" aria-label="Các phần vận hành">
        <a className="btn" href="/mgr/ops/levels">Duyệt mức</a>
        <a className="btn" href="/mgr/ops/weeks">Chủ đề tuần</a>
        <a className="btn" href="/mgr/ops/lessons">Bài học</a>
        <a className="btn" href="/mgr/ops/review">Đọc mẫu & kiểm tra</a>
        <a className="btn" href="/mgr/ops/prompts">Prompt & rubric</a>
        <a className="btn" href="/mgr/ops/level-forms">Đề lên mức</a>
      </nav>
    </section>
    <section className="card section manager-operators-section" aria-label="Theo dõi người vận hành">
      <div className="row between manager-section-heading"><div><h3>Người vận hành</h3><p className="small muted">Theo dõi nhanh người soạn/duyệt và chất lượng đầu ra. Danh sách này chỉ gồm tài khoản vận hành, không trộn vào bảng học viên.</p></div><span className="xs muted">{view.operators.length} người</span></div>
      {view.operators.length ? <div className="manager-operator-list">{view.operators.map((operator) => <OperatorRow key={operator.operatorId} operator={operator} currentWeek={view.currentWeek} {...(deleteRequestCounts ? { deleteRequestCount: deleteRequestCounts[operator.operatorId] ?? 0 } : {})} />)}</div> : <p className="muted">Chưa có tài khoản Người vận hành.</p>}
    </section>
    <p className="xs muted">Người soạn tính từ bản này (bấm Sinh/Duyệt). {readiness?.orphanLegacySets ? `${readiness.orphanLegacySets} bộ bài cũ chưa có thông tin người soạn nên không tính cho ai. ` : ""}Chỉ số chất lượng chỉ có khi học viên làm bài.</p>
  </div>;
}

function OperatorRow({ operator, currentWeek, deleteRequestCount }: { operator: ManagerOperationsView["operators"][number]; currentWeek: number; deleteRequestCount?: number }) {
  const quality = operator.averageScore === null && operator.failedPercent === null ? ["", "Chưa đủ dữ liệu"] : (operator.averageScore ?? 100) < 60 || (operator.failedPercent ?? 0) > 20 ? ["danger", "Cần xem lại"] : (operator.averageScore ?? 100) >= 75 && (operator.failedPercent ?? 0) <= 10 ? ["ok", "Tốt"] : ["warn", "Ổn"];
  const activity = `${operator.approvals} duyệt · ${operator.reviewedSubmissions} bài đọc · ${operator.completions} hoàn thành`;
  return <details className="manager-operator-row" aria-label={`Theo dõi ${operator.operatorName}`}>
    <summary className="manager-operator-summary">
      <span className="manager-operator-name"><b>{operator.operatorName}</b><span className="xs muted">Người vận hành</span></span>
      <span><b>{operator.sets}</b> bộ · <b>{operator.lessons}</b> bài</span>
      <span><b>{operator.published}</b> đã duyệt</span>
      <span><Badge tone={quality[0] as "" | "ok" | "warn" | "danger"}>{quality[1]}</Badge></span>
      <span className="small muted">{activity}</span>
      <span className="manager-operator-toggle" aria-hidden="true">Chi tiết</span>
    </summary>
    <div className="manager-operator-detail">
      <div className="grid cols-2 manager-operator-grid">
        <div className="manager-metric-group"><div className="eyebrow">Số bài soạn theo tuần</div><div className="table-wrap"><table><thead><tr><th>Tuần</th><th>Bộ bài</th><th>Số bài</th><th>Đã duyệt</th></tr></thead><tbody>{operator.byWeek.map((row) => <tr key={row.week} style={row.week === currentWeek ? { fontWeight: 800 } : undefined}><td>Tuần {row.week}{row.week === currentWeek ? " (hiện tại)" : ""}</td><td>{row.sets}</td><td>{row.lessons}</td><td>{row.sets ? `${row.approved}/${row.sets}` : "—"}</td></tr>)}</tbody></table></div><Metric label="Bài đủ cấu trúc chuẩn (4 kỹ năng + 3 thành phần)" value={ratio(operator.fullLessons, operator.lessons)} /><Metric label="Bài đã sửa tay sau khi AI sinh" value={value(operator.editedLessons)} /></div>
        <div className="manager-metric-group"><div className="eyebrow">Chất lượng qua kết quả học viên</div><Metric label="Lượt hoàn thành bài" value={String(operator.completions)} /><Metric label="Điểm trung bình của bài" value={value(operator.averageScore, "%")} /><Metric label="Phần làm đúng ngay lần đầu" value={value(operator.firstTryPercent, "%")} /><Metric label="Phần hết 2 lượt vẫn sai" value={value(operator.failedPercent, "%")} /><Metric label="Số lần làm trung bình mỗi phần" value={value(operator.averageAttempts)} /><div className="eyebrow manager-metric-subheading">Việc duyệt và kiểm tra</div><Metric label="Học viên đã duyệt mức" value={String(operator.approvals)} /><Metric label="Thời gian chờ duyệt mức trung bình" value={value(operator.averageApprovalHours, " giờ")} /><Metric label="Bài nộp đã đọc mẫu" value={String(operator.reviewedSubmissions)} /><Metric label="Phản hồi coach đã kiểm" value={String(operator.reviewedCoachTurns)} />{deleteRequestCount !== undefined ? <Metric label="Yêu cầu xoá tài khoản đã gửi" value={String(deleteRequestCount)} /> : null}</div>
      </div>
    </div>
  </details>;
}

function Metric({ label, value }: { label: string; value: string }) { return <div className="row between small" style={{ gap: 12, padding: "7px 0", borderBottom: "1px dashed var(--line)" }}><span>{label}</span><b>{value}</b></div>; }
function value(input: number | null, suffix = "") { return input === null ? "—" : `${input}${suffix}`; }
function ratio(input: number | null, total: number) { return input === null ? "—" : `${input}/${total}`; }
