import type { ManagerOperationsView } from "@e4s/contracts";
import { Snowflake } from "lucide-react";
import { Badge, OperationalCards, PageTitle, type ManagerOperationalProps } from "./shared.js";

export type ManagerOperationsProps = ManagerOperationalProps & { view: ManagerOperationsView; deleteRequestCounts?: Readonly<Record<string, number>> };

const operatorLinks = [
  ["/mgr/ops/levels", "Duyệt mức"], ["/mgr/ops/weeks", "Chủ đề tuần"], ["/mgr/ops/lessons", "Bài học"],
  ["/mgr/ops/review", "Đọc mẫu"], ["/mgr/ops/prompts", "Prompt"], ["/mgr/ops/level-forms", "Đề lên mức"]
] as const;

export function ManagerOperations({ view, deleteRequestCounts, ...operational }: ManagerOperationsProps) {
  const readiness = view.readiness;
  return <div className="manager-page manager-operations-page">
    <PageTitle><h1>Hiệu suất vận hành</h1><p className="muted">Tuần {view.currentWeek}/{view.pilotWeeks} · {view.operators.length} người vận hành. Số bài soạn/tuần; chất lượng qua kết quả học viên.</p></PageTitle>
    <OperationalCards {...operational} />
    <section className="card section"><h3>Xem màn hình của Người vận hành</h3><p className="small muted">Bạn thấy đúng những gì vận hành thấy, ở chế độ chỉ xem.</p><nav className="row" aria-label="Màn hình vận hành (chỉ xem)" data-read-only-preview="true" style={{ gap: 8 }}>{operatorLinks.map(([href, label]) => <a className="btn" href={href} key={href} title="Mở bản xem chỉ đọc của màn hình vận hành" data-read-only-preview-link="true">{label}</a>)}</nav></section>
    <section className="card section" aria-label="Trạng thái bộ bài" style={{ background: !readiness || readiness.requiredSets === 0 ? "var(--surface)" : readiness.missing.length ? "var(--butter)" : "var(--mint)" }}>
      <div className="row between" style={{ gap: 12, alignItems: "baseline" }}><h3>Bộ bài đã sẵn sàng đến tuần {view.currentWeek}</h3>{readiness ? <Badge tone={readiness.readySets === readiness.requiredSets ? "ok" : "warn"}>{readiness.readySets}/{readiness.requiredSets} bộ đã duyệt</Badge> : <Badge>Chưa có dữ liệu</Badge>}</div>
      {!readiness ? <p className="muted">API chưa trả dữ liệu bộ bài bắt buộc.</p> : readiness.requiredSets === 0 ? <p>Chưa có học viên được duyệt mức nên chưa cần bộ bài nào.</p> : readiness.missing.length ? <p>Còn thiếu: {readiness.missing.map((item) => `Tuần ${item.week} · ${item.cefr} (${item.state === "draft" ? "bản nháp chưa duyệt" : "chưa sinh"})`).join("; ")}.</p> : <p>Mọi mức đang có học viên đều đã có bộ bài được duyệt.</p>}
    </section>
    {view.operators.map((operator) => <OperatorCard key={operator.operatorId} operator={operator} currentWeek={view.currentWeek} {...(deleteRequestCounts ? { deleteRequestCount: deleteRequestCounts[operator.operatorId] ?? 0 } : {})} />)}
    {!view.operators.length ? <div className="card">Chưa có tài khoản Người vận hành.</div> : null}
    <p className="xs muted">Người soạn tính từ bản này (bấm Sinh/Duyệt). {readiness?.orphanLegacySets ? `${readiness.orphanLegacySets} bộ bài cũ chưa có thông tin người soạn nên không tính cho ai. ` : ""}Chỉ số chất lượng chỉ có khi học viên làm bài.</p>
  </div>;
}

function OperatorCard({ operator, currentWeek, deleteRequestCount }: { operator: ManagerOperationsView["operators"][number]; currentWeek: number; deleteRequestCount?: number }) {
  const quality = operator.averageScore === null && operator.failedPercent === null ? ["", "Chưa đủ dữ liệu"] : (operator.averageScore ?? 100) < 60 || (operator.failedPercent ?? 0) > 20 ? ["danger", "Cần xem lại"] : (operator.averageScore ?? 100) >= 75 && (operator.failedPercent ?? 0) <= 10 ? ["ok", "Tốt"] : ["warn", "Ổn"];
  return <section className="card section" aria-label={`Hiệu suất của ${operator.operatorName}`}><div className="row between" style={{ gap: 12, alignItems: "center" }}><div className="row manager-operator-identity"><span className="manager-operator-mark" aria-hidden="true"><Snowflake size={22} strokeWidth={1.8} /></span><div><h3>{operator.operatorName}</h3><span className="xs muted">{operator.sets} bộ bài · {operator.lessons} bài</span></div></div><span title="Tốt: điểm TB ≥75 và ≤10% phần hết lượt · Cần xem lại: điểm TB <60 hoặc >20% phần hết lượt"><Badge tone={quality[0] as "" | "ok" | "warn" | "danger"}>Chất lượng: {quality[1]}</Badge></span></div>
    <div className="grid cols-2" style={{ marginTop: 10 }}><div><div className="eyebrow">Số bài soạn theo tuần</div><div className="table-wrap"><table><thead><tr><th>Tuần</th><th>Bộ bài</th><th>Số bài</th><th>Đã duyệt</th></tr></thead><tbody>{operator.byWeek.map((row) => <tr key={row.week} style={row.week === currentWeek ? { fontWeight: 800 } : undefined}><td>Tuần {row.week}{row.week === currentWeek ? " (hiện tại)" : ""}</td><td>{row.sets}</td><td>{row.lessons}</td><td>{row.sets ? `${row.approved}/${row.sets}` : "—"}</td></tr>)}</tbody></table></div><Metric label="Bài đủ cấu trúc chuẩn (4 kỹ năng + 3 thành phần)" value={ratio(operator.fullLessons, operator.lessons)} /><Metric label="Bài đã sửa tay sau khi AI sinh" value={value(operator.editedLessons)} /></div>
      <div><div className="eyebrow">Chất lượng qua kết quả học viên</div><Metric label="Lượt hoàn thành bài" value={String(operator.completions)} /><Metric label="Điểm trung bình của bài" value={value(operator.averageScore, "%")} /><Metric label="Phần làm đúng ngay lần đầu" value={value(operator.firstTryPercent, "%")} /><Metric label="Phần hết 2 lượt vẫn sai" value={value(operator.failedPercent, "%")} /><Metric label="Số lần làm trung bình mỗi phần" value={value(operator.averageAttempts)} /><div className="eyebrow" style={{ marginTop: 10 }}>Việc duyệt và kiểm tra</div><Metric label="Học viên đã duyệt mức" value={String(operator.approvals)} /><Metric label="Thời gian chờ duyệt mức trung bình" value={value(operator.averageApprovalHours, " giờ")} /><Metric label="Bài nộp đã đọc mẫu" value={String(operator.reviewedSubmissions)} /><Metric label="Phản hồi coach đã kiểm" value={String(operator.reviewedCoachTurns)} />{deleteRequestCount !== undefined ? <Metric label="Yêu cầu xoá tài khoản đã gửi" value={String(deleteRequestCount)} /> : null}</div></div>
  </section>;
}

function Metric({ label, value }: { label: string; value: string }) { return <div className="row between small" style={{ gap: 12, padding: "7px 0", borderBottom: "1px dashed var(--line)" }}><span>{label}</span><b>{value}</b></div>; }
function value(input: number | null, suffix = "") { return input === null ? "—" : `${input}${suffix}`; }
function ratio(input: number | null, total: number) { return input === null ? "—" : `${input}/${total}`; }
