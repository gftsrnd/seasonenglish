import type { ManagerProgressView } from "@e4s/contracts";
import "./styles.manager-clone.css";

export function ManagerProgress({ view }: { view: ManagerProgressView }) {
  const summary = view.summary;
  const enrolled = [...(view.learners ?? [])];
  const waitingLearners = enrolled.filter((item) => !item.cefr);
  const approvedLearners = enrolled.filter((item) => item.cefr);
  const learnerCount = approvedLearners.length;
  const active = Math.min(summary.activeLearnersThisWeek ?? 0, learnerCount);
  const completedLearners = summary.completedLearners ?? 0;
  const comparableLearners = summary.comparableLearners ?? 0;
  const improvedLearners = summary.improvedLearners ?? 0;
  const surveyCount = summary.surveyCount ?? 0;
  const satisfaction = summary.satisfactionAverage ?? null;
  const activePercent = percent(active, learnerCount);
  const completedPercent = percent(completedLearners, learnerCount);
  const improvedPercent = percent(improvedLearners, comparableLearners);
  const learners = approvedLearners.sort((a, b) => risk(b) - risk(a) || (a.sessionsThisWeek ?? 0) - (b.sessionsThisWeek ?? 0));
  const pendingReminders = learners.filter((item) => (item.missedDays ?? 0) >= 2).length;

  return <main className="operator-page manager-page manager-clone manager-progress-page">
    <header className="manager-page-title"><div>
      <h1>Tiến độ nhóm</h1>
      <p>Tuần {view.currentWeek ?? 1}/{view.pilotWeeks ?? 1} · <span>{learnerCount} người học</span> đang hoạt động · {waitingLearners.length} chưa vào học</p>
    </div><div className="manager-row">
      {pendingReminders ? <a className="button manager-reminder-link" href="/mgr/reminders">{pendingReminders} cần nhắc</a> : null}
      <a className="button" href="/mgr/rewards">Giả lập phần thưởng</a>
      <button type="button" onClick={() => exportLearners(view)}>Xuất CSV</button>
    </div></header>

    <section className="manager-kpi-grid" aria-label="Tổng quan tiến độ">
      <Kpi label="Học đều (≥3 buổi/tuần)" value={`${activePercent}%`} detail={`${active}/${learnerCount} người · ngưỡng 70%`} state={learnerCount ? activePercent >= 70 : null} />
      <Kpi label="Học đến cuối" value={`${completedPercent}%`} detail={`${completedLearners}/${learnerCount} hoàn thành các tuần đã qua · ngưỡng 60%`} state={learnerCount ? completedPercent >= 60 : null} />
      <Kpi label="Có tiến bộ" value={comparableLearners ? `${improvedPercent}%` : "—"} detail={comparableLearners ? `${improvedLearners}/${comparableLearners} tăng điểm · ngưỡng 70%` : "Chưa có bài cuối kỳ"} state={comparableLearners ? improvedPercent >= 70 : null} />
      <Kpi label="Hài lòng" value={satisfaction === null ? "—" : `${satisfaction}/5`} detail={surveyCount ? `${surveyCount} phản hồi · ngưỡng 4/5` : "Chưa có khảo sát"} state={surveyCount ? satisfaction !== null && satisfaction >= 4 : null} />
    </section>

    <section className="manager-card manager-progress-card" aria-label="Tiến độ người học">
      <div className="manager-row manager-between"><h3>Từng người học</h3><span className="manager-muted manager-xs">Sắp theo rủi ro bỏ học</span></div>
      <div className="table-wrap"><table className="manager-progress-table"><thead><tr><th>Người học</th><th>Mức</th><th>Tuần này</th><th>Bài</th><th>Coach</th><th>Bài T6</th><th>Điểm thưởng</th><th>Gần nhất</th><th>Đầu vào → cuối</th><th>Trạng thái</th></tr></thead><tbody>
        {learners.map((learner) => {
          const sessions = learner.sessionsThisWeek ?? 0;
          const missed = learner.missedDays ?? 0;
          const reward = rewardSummary(learner.rewardPoints ?? 0, learner.earnedBadges ?? []);
          return <tr key={learner.learnerId}>
            <td><b>{learner.learnerName}</b></td>
            <td>{learner.cefr ? <span className={`manager-badge manager-level manager-level-${learner.cefr}`}>{learner.cefr}</span> : <span className="manager-muted">—</span>}</td>
            <td><span className="manager-week-dots" aria-label={`${sessions} buổi tuần này`}>{Array.from({ length: 5 }, (_, index) => <span key={index} className={index < Math.min(sessions, 5) ? "is-on" : ""} />)}</span> <span className="manager-muted manager-xs">{sessions}</span></td>
            <td>{learner.totalLessonsThisWeek ? `${learner.completedLessons ?? 0}/${learner.totalLessonsThisWeek}` : <span className="manager-muted">—</span>}</td>
            <td>{learner.coachTurnsThisWeek ?? 0}{(learner.coachTurnsThisWeek ?? 0) >= 2 ? " ✓" : <span className="manager-muted manager-xs"> /2</span>}</td>
            <td>{practiceStatus(learner.weeklyPracticeStatus, learner.weeklyPracticeScore)}</td>
            <td><span title={`Cấp ${reward.level}: ${reward.name}`}>{reward.icon}</span> <b>★ {learner.rewardPoints ?? 0}</b> {learner.earnedBadges?.length ? <span className="manager-earned-badges manager-xs" title={learner.earnedBadges.join(", ")}>{learner.earnedBadges.map(badgeIcon).join("")}</span> : null}</td>
            <td className="manager-small">{learner.lastActivityAt ? <>{shortDate(learner.lastActivityAt)}{missed ? <span className="manager-muted"> ({missed} ngày)</span> : null}</> : <span className="manager-muted">chưa học</span>}</td>
            <td className="manager-small">{learner.placementScore ?? "—"} → {learner.finalScore === null || learner.finalScore === undefined ? <span className="manager-muted">—</span> : <>{learner.finalScore} <span className={`manager-badge ${(learner.finalScore - (learner.placementScore ?? 0)) >= 0 ? "is-good" : "is-warning"}`}>{signed(learner.finalScore - (learner.placementScore ?? 0))}</span></>}</td>
            <td>{missed >= 2 ? <span className="manager-badge is-danger">Bỏ {missed} ngày</span> : sessions === 0 ? <span className="manager-badge is-warning">Chưa học tuần này</span> : <span className="manager-badge is-good">Đang học</span>}</td>
          </tr>;
        })}
        {!learners.length ? <tr><td colSpan={10} className="manager-muted">Chưa có người học được duyệt mức.</td></tr> : null}
      </tbody></table></div>
    </section>
    {waitingLearners.length ? <section className="manager-card manager-waiting-card"><h3>Chưa vào học</h3><div className="manager-waiting-list">{waitingLearners.map((learner) => <article key={learner.learnerId}><div><b>{learner.learnerName}</b><p>{learner.placementScore !== null ? "Đã làm test, chờ vận hành duyệt mức" : learner.lastActivityAt ? "Đã bắt đầu hồ sơ, chưa làm test" : "Chưa điền hồ sơ"}</p></div></article>)}</div></section> : null}
  </main>;
}

function Kpi({ label, value, detail, state }: { label: string; value: string; detail: string; state: boolean | null }) {
  return <article className="manager-card manager-kpi" data-state={state === null ? "empty" : state ? "good" : "attention"}><span className="manager-kpi-value">{value}</span><b>{label}</b><span className="manager-xs">{detail}</span></article>;
}

function practiceStatus(status: ManagerProgressView["learners"][number]["weeklyPracticeStatus"], score: number | null | undefined) {
  if (status === "scored") return <span className={`manager-badge ${(score ?? 0) >= 70 ? "is-good" : (score ?? 0) >= 50 ? "is-warning" : "is-danger"}`}>{score}</span>;
  if (status === "pending_review") return <span className="manager-badge is-warning">chờ chấm</span>;
  return <span className="manager-muted">chưa</span>;
}

function risk(learner: ManagerProgressView["learners"][number]) { return (learner.missedDays ?? 0) >= 2 ? 2 : (learner.sessionsThisWeek ?? 0) === 0 ? 1 : 0; }
function percent(value: number, total: number) { return total ? Math.round(value / total * 100) : 0; }
function shortDate(value: string) { return new Intl.DateTimeFormat("vi-VN", { day: "2-digit", month: "2-digit" }).format(new Date(value)); }
function signed(value: number) { return value >= 0 ? `+${value}` : String(value); }
function badgeIcon(id: string) { return ({ first: "🐣", week: "📅", streak3: "🔥", streak7: "🌟", sharp: "🎯", words: "🔑", chat: "💬", friday: "✍️" } as Record<string, string>)[id] ?? "🏅"; }
function rewardSummary(points: number, badges: readonly string[]) {
  const has = new Set(badges);
  if (points >= 360 && ["first", "streak3", "week", "friday", "chat", "streak7", "sharp", "words"].every((id) => has.has(id))) return { level: 4, name: "Mùa đông – vững vàng", icon: "❄️" };
  if (points >= 180 && ["first", "streak3", "week", "friday", "chat"].every((id) => has.has(id))) return { level: 3, name: "Mùa thu – gặt hái", icon: "🍂" };
  if (points >= 60 && ["first", "streak3"].every((id) => has.has(id))) return { level: 2, name: "Mùa hạ – đón nắng", icon: "☀️" };
  return { level: 1, name: "Mùa xuân – gieo hạt", icon: "🌱" };
}

function exportLearners(view: ManagerProgressView) {
  const rows = [["Người học", "Mức", "Buổi tuần này", "Bài hoàn thành", "Coach", "Điểm thưởng", "Hoạt động gần nhất"], ...(view.learners ?? []).map((item) => [item.learnerName, item.cefr ?? "", String(item.sessionsThisWeek ?? 0), String(item.completedLessons ?? 0), String(item.coachTurnsThisWeek ?? 0), String(item.rewardPoints ?? 0), item.lastActivityAt ?? ""])];
  const csv = rows.map((row) => row.map((value) => `"${value.replaceAll('"', '""')}"`).join(",")).join("\r\n");
  const url = URL.createObjectURL(new Blob(["\ufeff", csv], { type: "text/csv;charset=utf-8" }));
  const anchor = document.createElement("a"); anchor.href = url; anchor.download = "e4s-tien-do.csv"; anchor.click(); URL.revokeObjectURL(url);
}
