import type { ManagerProgressView } from "@e4s/contracts";
import { Bell } from "lucide-react";
import { Badge, OperationalCards, PageTitle, formatDate, percent, type ManagerOperationalProps } from "./shared.js";

export type ManagerProgressProps = ManagerOperationalProps & {
  view: ManagerProgressView;
  /** Count returned by the reminder queue; fallback keeps standalone fixtures honest. */
  pendingReminderCount?: number;
  onOpenLearnerProfile?: (learnerId: string) => void;
  onDeleteLearner?: (learnerId: string) => void;
};

export function ManagerProgress({ view, pendingReminderCount, onOpenLearnerProfile, onDeleteLearner, ...operational }: ManagerProgressProps) {
  const approved = view.learners.filter((learner) => learner.cefr !== null);
  const waiting = view.learners.filter((learner) => learner.cefr === null);
  const regular = view.summary.activeLearnersThisWeek;
  const regularPercent = percent(regular, approved.length);
  const completedPercent = percent(view.summary.completedLearners, approved.length);
  const improvedPercent = percent(view.summary.improvedLearners, view.summary.comparableLearners);
  const reminderCount = pendingReminderCount ?? approved.filter((learner) => (learner.missedDays ?? 0) >= 2).length;
  const rows = approved.slice().sort((a, b) => risk(b) - risk(a) || a.sessionsThisWeek - b.sessionsThisWeek);
  return <div className="manager-page manager-progress-page">
    <PageTitle actions={<>{reminderCount ? <a className="btn btn-primary" href="/mgr/reminders" aria-label={`Mở danh sách ${reminderCount} người cần nhắc`}><Bell size={16} strokeWidth={2} aria-hidden="true" /> {reminderCount} cần nhắc</a> : null}<a className="btn" href="/mgr/rewards">Giả lập phần thưởng</a><button className="btn" type="button" onClick={() => exportCsv(view)}>Xuất CSV</button></>}>
      <h1>Tiến độ nhóm</h1><p className="muted">Tuần {view.currentWeek}/{view.pilotWeeks} · {approved.length} người học đang hoạt động · {waiting.length} chưa vào học</p>
    </PageTitle>
    <OperationalCards {...operational} />
    <section className="grid cols-4 manager-kpi-grid" data-manager-card-group="kpi">
      <Kpi label="Học đều (≥3 buổi/tuần)" value={`${regularPercent}%`} detail={`${regular}/${approved.length} người · ngưỡng 70%`} state={approved.length ? regularPercent >= 70 : null} />
      <Kpi label="Học đến cuối" value={`${completedPercent}%`} detail={`${view.summary.completedLearners}/${approved.length} hoàn thành các tuần đã qua · ngưỡng 60%`} state={approved.length ? completedPercent >= 60 : null} />
      <Kpi label="Có tiến bộ" value={view.summary.comparableLearners ? `${improvedPercent}%` : "—"} detail={view.summary.comparableLearners ? `${view.summary.improvedLearners}/${view.summary.comparableLearners} tăng điểm · ngưỡng 70%` : "Chưa có bài cuối kỳ"} state={view.summary.comparableLearners ? improvedPercent >= 70 : null} />
      <Kpi label="Hài lòng" value={view.summary.satisfactionAverage === null ? "—" : `${view.summary.satisfactionAverage}/5`} detail={view.summary.surveyCount ? `${view.summary.surveyCount} phản hồi · ngưỡng 4/5` : "Chưa có khảo sát"} state={view.summary.surveyCount ? (view.summary.satisfactionAverage ?? 0) >= 4 : null} />
    </section>
    <section className="card section manager-table-card"><div className="row between manager-section-heading"><h3>Từng người học</h3><span className="xs muted">Sắp theo rủi ro bỏ học</span></div>
      <div className="table-wrap manager-progress-table manager-action-table" data-manager-action-table><table><thead><tr><th>Người học</th><th>Mức</th><th>Tuần này</th><th>Bài</th><th>Coach</th><th>Bài T6</th><th>Điểm thưởng</th><th>Gần nhất</th><th>Đầu vào → cuối</th><th>Trạng thái</th><th /></tr></thead><tbody>{rows.map((learner) => <LearnerRow key={learner.learnerId} learner={learner} {...(view.weekStartDate ? { weekStartDate: view.weekStartDate } : {})} {...(onOpenLearnerProfile ? { onOpen: onOpenLearnerProfile } : {})} {...(onDeleteLearner ? { onDelete: onDeleteLearner } : {})} />)}{!rows.length ? <tr><td colSpan={11} className="muted">Chưa có người học được duyệt mức.</td></tr> : null}</tbody></table></div>
    </section>
    {waiting.length ? <section className="card section"><h3>Chưa vào học</h3><div className="list">{waiting.map((learner) => <div className="item" key={learner.learnerId}><div className="body"><b>{learner.learnerName}</b><div className="xs muted">{learner.placementScore !== null ? "Đã làm test, chờ vận hành duyệt mức" : learner.lastActivityAt ? "Đã điền hồ sơ, chưa làm test" : "Chưa điền hồ sơ"}</div></div><button className="btn-sm btn-danger" type="button" aria-label={`Xoá ${learner.learnerName}`} disabled={!onDeleteLearner} title={!onDeleteLearner ? "Chưa có API xoá tài khoản" : undefined} onClick={() => onDeleteLearner?.(learner.learnerId)}>Xoá</button></div>)}</div></section> : null}
  </div>;
}

function Kpi({ label, value, detail, state }: { label: string; value: string; detail: string; state: boolean | null }) {
  return <article className="card kpi" data-state={state === null ? "empty" : state ? "good" : "bad"}><span className="val">{value}</span><b>{label}</b><span className="xs muted">{detail}</span></article>;
}

function LearnerRow({ learner, weekStartDate, onOpen, onDelete }: { learner: ManagerProgressView["learners"][number]; weekStartDate?: string; onOpen?: (id: string) => void; onDelete?: (id: string) => void }) {
  const missed = learner.missedDays ?? 0; const reward = rewardLevel(learner.rewardPoints, learner.earnedBadges, learner.earnedBadgeDetails);
  const badgeDetailText = (learner.earnedBadgeDetails ?? []).map((badge) => `${badge.label}: ${badge.description}`).join(" · ");
  const earnedIcons = badgeIcons(learner.earnedBadges, learner.earnedBadgeDetails);
  return <tr><td><b>{learner.learnerName}</b></td><td><Badge tone="primary">{learner.cefr}</Badge></td><td><WeekDots count={learner.sessionsThisWeek} {...(weekStartDate ? { weekStartDate } : {})} {...(learner.activityDatesThisWeek ? { activityDates: learner.activityDatesThisWeek } : {})} /> <span className="xs muted">{learner.sessionsThisWeek}</span></td><td>{learner.totalLessonsThisWeek ? `${learner.completedLessons}/${learner.totalLessonsThisWeek}` : "—"}</td><td>{learner.coachTurnsThisWeek}{learner.coachTurnsThisWeek >= 2 ? " ✓" : <span className="xs muted"> /2</span>}</td><td>{learner.weeklyPracticeStatus === "scored" ? <Badge tone={(learner.weeklyPracticeScore ?? 0) >= 70 ? "ok" : "warn"}>{learner.weeklyPracticeScore}</Badge> : learner.weeklyPracticeStatus === "pending_review" ? <Badge tone="warn">chờ chấm</Badge> : <span className="muted">chưa</span>}</td><td title={`Cấp ${reward.index + 1}: ${reward.name}${badgeDetailText ? ` · ${badgeDetailText}` : ""}`}>{reward.icon} <b>★ {learner.rewardPoints}</b>{earnedIcons ? <> {earnedIcons}</> : null}</td><td>{learner.lastActivityAt ? <>{formatDate(learner.lastActivityAt)}{missed ? <span className="muted"> ({missed} ngày)</span> : null}</> : <span className="muted">chưa học</span>}</td><td>{learner.placementScore ?? "—"} → {learner.finalScore ?? <span className="muted">—</span>}</td><td>{missed >= 2 ? <Badge tone="danger">Bỏ {missed} ngày</Badge> : learner.sessionsThisWeek === 0 ? <Badge tone="warn">Chưa học tuần này</Badge> : <Badge tone="ok">Đang học</Badge>}</td><td><div className="row" role="group" aria-label={`Thao tác cho ${learner.learnerName}`} style={{ gap: 6, flexWrap: "nowrap" }}><button className="btn-sm" type="button" aria-label={`Hồ sơ ${learner.learnerName}`} disabled={!onOpen} title={!onOpen ? "Chưa có API hồ sơ học viên dành cho Quản lý" : undefined} onClick={() => onOpen?.(learner.learnerId)}>Hồ sơ</button><button type="button" className="btn-sm btn-danger" aria-label={`Xoá ${learner.learnerName}`} disabled={!onDelete} title={!onDelete ? "Chưa có API xoá tài khoản" : undefined} onClick={() => onDelete?.(learner.learnerId)}>Xoá</button></div></td></tr>;
}

const BADGE_ICONS: Record<string, string> = { first: "🐣", starter: "🐣", week: "📅", week_complete: "📅", streak3: "🔥", streak7: "🌟", streak5: "🌟", sharp: "🎯", first_try: "🎯", words: "🔑", wordsmith: "🔑", chat: "💬", coach_friend: "💬", friday: "✍️" };
function badgeIcons(keys: readonly string[], details?: readonly { key: string }[]) { return [...new Set([...keys, ...(details ?? []).map((badge) => badge.key)].map((key) => BADGE_ICONS[key]).filter(Boolean))].join(""); }

function WeekDots({ count, weekStartDate, activityDates }: { count: number; weekStartDate?: string; activityDates?: readonly string[] }) {
  const hasServerAttendance = Boolean(weekStartDate && activityDates);
  const activeDates = new Set(activityDates ?? []);
  const days = hasServerAttendance ? Array.from({ length: 7 }, (_, index) => {
    const date = addDays(weekStartDate!, index);
    return { label: DAY_LABELS[index]!, date, active: activeDates.has(date) };
  }) : Array.from({ length: 5 }, (_, index) => ({ label: DAY_LABELS[index]!, date: "", active: index < count }));
  return <span className="week-dots" aria-label="Điểm danh tuần này">{days.map((day) => <i key={`${day.label}-${day.date}`} className={`dot ${day.active ? "on" : "off"}`} aria-label={`${day.label}: ${day.active ? "đã học" : "chưa học"}`} title={day.date ? `${day.label} · ${day.date}` : day.label} />)}</span>;
}
function risk(learner: ManagerProgressView["learners"][number]) { return (learner.missedDays ?? 0) >= 2 ? 2 : learner.sessionsThisWeek === 0 ? 1 : 0; }
function rewardLevel(points: number, badges: readonly string[], details?: readonly { key: string }[]) { const aliases: Record<string, string> = { starter: "first", week_complete: "week", streak5: "streak7", first_try: "sharp", wordsmith: "words", coach_friend: "chat" }; const has = new Set([...badges, ...(details ?? []).map((badge) => badge.key)].map((key) => aliases[key] ?? key)); const levels = [{ name: "Mùa xuân – gieo hạt", icon: "🌱", min: 0, required: [] }, { name: "Mùa hạ – đón nắng", icon: "☀️", min: 60, required: ["first", "streak3"] }, { name: "Mùa thu – gặt hái", icon: "🍂", min: 180, required: ["week", "friday", "chat"] }, { name: "Mùa đông – vững vàng", icon: "❄️", min: 360, required: ["streak7", "sharp", "words"] }]; let index = 0; while (index + 1 < levels.length) { const next = levels[index + 1]!; if (points < next.min || !next.required.every((id) => has.has(id))) break; index++; } return { ...levels[index]!, index }; }
const DAY_LABELS = ["T2", "T3", "T4", "T5", "T6", "T7", "CN"] as const;
function addDays(start: string, days: number) { const date = new Date(`${start}T00:00:00Z`); date.setUTCDate(date.getUTCDate() + days); return date.toISOString().slice(0, 10); }
function exportCsv(view: ManagerProgressView) { const rows = [["Tên", "Mức", "Buổi tuần này", "Bài xong", "Coach", "Điểm thưởng", "Hoạt động gần nhất", "Ngày bỏ"], ...view.learners.map((l) => [l.learnerName, l.cefr ?? "", l.sessionsThisWeek, l.completedLessons, l.coachTurnsThisWeek, l.rewardPoints, l.lastActivityAt ?? "", l.missedDays ?? ""])]; const csv = rows.map((row) => row.map((cell) => `"${String(cell).replaceAll('"', '""')}"`).join(",")).join("\r\n"); const url = URL.createObjectURL(new Blob(["\ufeff", csv], { type: "text/csv;charset=utf-8" })); const a = document.createElement("a"); a.href = url; a.download = "e4s-tien-do.csv"; a.click(); URL.revokeObjectURL(url); }
