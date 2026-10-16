import type { ManagerOperationsView } from "@e4s/contracts";
import "./styles.manager-clone.css";

export function ManagerOperations({ view }: { view: ManagerOperationsView }) {
  const operators = view.operators ?? [];
  const currentWeek = view.currentWeek ?? 1;
  const pilotWeeks = view.pilotWeeks ?? 1;
  const ready = view.content?.published ?? 0;
  const pending = (view.content?.draft ?? 0) + (view.content?.inReview ?? 0);
  const required = Math.max(ready + pending, ...operators.flatMap((operator) => (operator.byWeek ?? []).filter((week) => week.week <= currentWeek).map((week) => week.sets)), 0);
  const missing = Math.max(0, required - ready);

  return <main className="operator-page manager-page manager-clone manager-operations-page">
    <header className="manager-page-title"><div>
      <h1 aria-label="Tổng quan vận hành">Hiệu suất vận hành</h1>
      <p>Tuần {currentWeek}/{pilotWeeks} · {operators.length} người vận hành. Số bài soạn theo tuần và chất lượng bài nhìn qua kết quả của học viên.</p>
    </div></header>

    <section className="manager-card">
      <h3>Xem màn hình của Người vận hành</h3>
      <p className="manager-small manager-muted">Bạn thấy đúng những gì vận hành thấy, ở chế độ chỉ xem.</p>
      <nav className="manager-row" aria-label="Màn hình vận hành">
        <a className="button" href="/op">Duyệt mức</a><a className="button" href="/op/weeks">Chủ đề tuần</a><a className="button" href="/op/lessons">Bài học</a><a className="button" href="/op/review">Đọc mẫu</a><a className="button" href="/op/prompts">Prompt</a><a className="button" href="/op/levelforms">Đề lên mức</a>
      </nav>
    </section>

    <section className="manager-card manager-readiness" data-state={!required ? "empty" : missing ? "attention" : "good"}>
      <div className="manager-row manager-between"><h3>Bộ bài đã sẵn sàng đến tuần {currentWeek}</h3><span className="manager-badge">{ready}/{required} bộ đã duyệt</span></div>
      <p className="manager-small">{!required ? "Chưa có học viên được duyệt mức nên chưa cần bộ bài nào." : missing ? `Còn ${missing} bộ ở bản nháp, chờ duyệt hoặc chưa sinh.` : "Mọi mức đang có học viên đều đã có bộ bài được duyệt."}</p>
    </section>

    {operators.map((operator) => {
      const verdict = quality(operator.averageScore, operator.failedPercent);
      return <section className="manager-card manager-operator-card" key={operator.operatorId}>
        <div className="manager-row manager-between"><div className="manager-operator-title"><StaffAvatar name={operator.operatorName} /><div><b>{operator.operatorName}</b><div className="manager-xs manager-muted">{operator.sets ?? 0} bộ bài · {operator.lessons ?? 0} bài</div></div></div><span className={`manager-badge ${verdict.tone}`} title="Tốt: điểm TB ≥75 và ≤10% phần hết lượt · Cần xem lại: điểm TB <60 hoặc >20% phần hết lượt">Chất lượng: {verdict.label}</span></div>
        <div className="manager-operator-grid">
          <div><div className="manager-eyebrow">Số bài soạn theo tuần</div><div className="table-wrap"><table><thead><tr><th>Tuần</th><th>Bộ bài</th><th>Số bài</th><th>Đã duyệt</th></tr></thead><tbody>
            {(operator.byWeek ?? []).map((week) => <tr key={week.week} data-current={week.week === currentWeek || undefined}><td>Tuần {week.week}{week.week === currentWeek ? " (hiện tại)" : ""}</td><td>{week.sets}</td><td>{week.lessons}</td><td>{week.sets ? `${week.approved}/${week.sets}` : <span className="manager-muted">—</span>}</td></tr>)}
          </tbody></table></div><MetricLine label="Bài đủ cấu trúc chuẩn (4 kỹ năng + 3 thành phần)" value={operator.lessons ? `${operator.fullLessons ?? 0}/${operator.lessons}` : "—"} /><MetricLine label="Bài đã sửa tay sau khi AI sinh" value={operator.editedLessons ?? "—"} /></div>
          <div><div className="manager-eyebrow">Chất lượng qua kết quả học viên</div>
            <MetricLine label="Lượt hoàn thành bài" value={operator.completions ?? 0} /><MetricLine label="Điểm trung bình của bài" value={operator.averageScore === null || operator.averageScore === undefined ? "—" : `${operator.averageScore}%`} /><MetricLine label="Phần làm đúng ngay lần đầu" value={operator.firstTryPercent === null || operator.firstTryPercent === undefined ? "—" : `${operator.firstTryPercent}%`} /><MetricLine label="Phần hết 3 lượt vẫn sai" value={operator.failedPercent === null || operator.failedPercent === undefined ? "—" : `${operator.failedPercent}%`} /><MetricLine label="Số lần làm trung bình mỗi phần" value={operator.averageAttempts ?? "—"} />
            <div className="manager-eyebrow manager-subheading">Việc duyệt và kiểm tra</div><MetricLine label="Học viên đã duyệt mức" value={operator.approvals ?? 0} /><MetricLine label="Thời gian chờ duyệt mức trung bình" value={operator.averageApprovalHours === null || operator.averageApprovalHours === undefined ? "—" : `${operator.averageApprovalHours} giờ`} /><MetricLine label="Bài nộp đã đọc mẫu" value={operator.reviewedSubmissions ?? 0} /><MetricLine label="Phản hồi coach đã kiểm" value={operator.reviewedCoachTurns ?? 0} /><MetricLine label="Yêu cầu xoá tài khoản đã gửi" value="—" />
          </div>
        </div>
      </section>;
    })}

    {!operators.length ? <div className="manager-card manager-empty">Chưa có tài khoản Người vận hành.</div> : null}
    <p className="manager-xs manager-muted manager-operations-foot">Người soạn được ghi nhận từ dữ liệu phiên bản bài học. Chỉ số chất lượng chỉ hiện khi học viên đã làm bài.</p>
  </main>;
}

function MetricLine({ label, value }: { label: string; value: string | number }) { return <div className="manager-metric-line"><span>{label}</span><b>{value}</b></div>; }
function quality(score: number | null | undefined, failed: number | null | undefined) {
  if (score === null || score === undefined) return { tone: "", label: "Chưa đủ dữ liệu" };
  if (score < 60 || (failed ?? 0) > 20) return { tone: "is-danger", label: "Cần xem lại" };
  if (score >= 75 && (failed ?? 0) <= 10) return { tone: "is-good", label: "Tốt" };
  return { tone: "is-warning", label: "Ổn" };
}
function StaffAvatar({ name }: { name: string }) { return <span className="manager-staff-avatar" aria-hidden="true">{initials(name)}</span>; }
function initials(name: string) { const parts = name.trim().split(/\s+/).filter(Boolean); return (parts.length > 1 ? `${parts[0]?.[0] ?? ""}${parts.at(-1)?.[0] ?? ""}` : parts[0]?.slice(0, 2) ?? "?").toUpperCase(); }
