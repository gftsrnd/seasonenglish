import type { ManagerMonthlyLearnerView, ManagerMonthlyOverviewView, ManagerProgressView } from "@e4s/contracts";
import { exportManagerMonthlyCsv, monthlyExamLabel } from "./MonthlyOverview.js";
import { Bell, Download, Gift, UserRound } from "lucide-react";
import { useState } from "react";
import { ActionLabel, useCompactUi } from "../shared/CompactUi.js";
import { rewardBadgeIcon, rewardBadgeKey, rewardSeasonOfLearner } from "../shared/reward-badge-icons.js";
import { RewardBadgeImage, RewardSeasonImage } from "../shared/RewardIcon.js";
import { useMediaQuery } from "../shared/useMediaQuery.js";
import { Pager, usePaged } from "../shared/Pager.js";
import { Badge, ManagerTitle, OperationalCards, PageDescription, PageTitle, formatDate, percent, type ManagerOperationalProps } from "./shared.js";
import { formatScore, formatScoreForExport } from "../shared/format-score.js";

export type ManagerProgressProps = ManagerOperationalProps & {
  view: ManagerProgressView;
  monthly?: ManagerMonthlyOverviewView | undefined;
  /** Count returned by the reminder queue; fallback keeps standalone fixtures honest. */
  pendingReminderCount?: number;
  onOpenLearnerProfile?: (learnerId: string) => void;
  onDeleteLearner?: (learnerId: string) => void;
};

export function ManagerProgress({ view, monthly, pendingReminderCount, onOpenLearnerProfile, onDeleteLearner: _onDeleteLearner, ...operational }: ManagerProgressProps) {
  const compact = useMediaQuery("(max-width: 600px)");
  const compactUi = useCompactUi();
  const approved = view.learners.filter((learner) => learner.cefr !== null);
  const waiting = view.learners.filter((learner) => learner.cefr === null);
  const testing = waiting.filter((learner) => learner.placementStatus === "in_progress");
  const submitted = waiting.filter((learner) => learner.placementStatus === "submitted" || (!learner.placementStatus && learner.placementScore !== null));
  const notTested = waiting.filter((learner) => learner.placementStatus === "not_started" || (!learner.placementStatus && learner.placementScore === null));
  const monthByLearner = new Map(monthly?.learners.map((learner) => [learner.learnerId, learner]));
  const activeMonth = monthly?.learners.filter((learner) => learner.state === "active");
  const activeCount = activeMonth?.length ?? approved.length;
  const regular = activeMonth?.filter((learner) => learner.onTrack).length ?? view.summary.activeLearnersThisWeek;
  const completed = activeMonth?.filter((learner) => learner.completedToDate).length ?? view.summary.completedLearners;
  const regularPercent = percent(regular, activeCount);
  const completedPercent = percent(completed, activeCount);
  const satisfaction = monthly ? monthly.survey.average : view.summary.satisfactionAverage;
  const surveyCount = monthly?.survey.submissions ?? view.summary.surveyCount;
  const reminderCount = pendingReminderCount ?? approved.filter((learner) => (learner.missedDays ?? 0) >= 2).length;
  const rows = approved.slice().sort((a, b) => risk(b, view.weekStartDate) - risk(a, view.weekStartDate) || a.sessionsThisWeek - b.sessionsThisWeek);
  // Phones page long lists 3 rows at a time (tablets 5); desktop shows all.
  const rowsPaged = usePaged(rows, { phone: 5, tablet: 8 });
  const submittedPaged = usePaged(submitted);
  const testingPaged = usePaged(testing);
  const notTestedPaged = usePaged(notTested);
  // Phones/tablets: the three "waiting for a level" lists share one card with a tab per state.
  const waitingGroups = [
    { id: "submitted", label: "Đã nộp", items: submitted },
    { id: "testing", label: "Đang làm", items: testing },
    { id: "not-tested", label: "Chưa làm", items: notTested }
  ] as const;
  const [waitingTab, setWaitingTab] = useState<(typeof waitingGroups)[number]["id"]>();
  const activeWaiting = waitingGroups.find((group) => group.id === waitingTab && group.items.length) ?? waitingGroups.find((group) => group.items.length);
  const waitingPaged = usePaged(activeWaiting?.items ?? [], { phone: 4, tablet: 6 });
  return <div className="manager-page manager-progress-page">
    <PageTitle description={compactUi ? <PageDescription text={`Lộ trình tháng hiện tại · ${approved.length} người học đang hoạt động · ${testing.length} đang làm test · ${submitted.length} đã nộp · ${notTested.length} chưa làm test`} /> : <p className="muted">{compact ? "Theo dõi tiến độ học theo tháng." : <>Lộ trình tháng hiện tại · {approved.length} người học đang hoạt động · {testing.length} đang làm test · {submitted.length} đã nộp · {notTested.length} chưa làm test</>}</p>}><h1>Tiến độ nhóm</h1></PageTitle>
    <OperationalCards {...operational} />
    <section className="grid cols-3 manager-kpi-grid" data-manager-card-group="kpi">
      <Kpi tip="Duy trì nhịp học: điểm danh ít nhất 70% số ngày học đã qua. Ngưỡng 70%." label={compact ? "Nhịp học" : "Duy trì nhịp học"} value={`${regularPercent}%`} detail={compact ? `${regular}/${activeCount} · ≥70%` : `${regular}/${activeCount} người · ngưỡng 70%`} state={activeCount ? regularPercent >= 70 : null} />
      <Kpi tip="Hoàn thành lộ trình tháng: hoàn thành các bài đến thời điểm báo cáo. Ngưỡng 60%." label={compact ? "Hoàn thành" : "Hoàn thành lộ trình tháng"} value={`${completedPercent}%`} detail={compact ? `${completed}/${activeCount} · ≥60%` : `${completed}/${activeCount} hoàn thành lộ trình đến hiện tại · ngưỡng 60%`} state={activeCount ? completedPercent >= 60 : null} />
      <Kpi tip="Hài lòng: điểm khảo sát trung bình. Ngưỡng 4/5." label="Hài lòng" value={satisfaction === null ? "—" : `${formatScore(satisfaction)}/5`} detail={surveyCount ? compact ? `${surveyCount} phản hồi` : `${surveyCount} phản hồi · ngưỡng 4/5` : compact ? "Chưa khảo sát" : "Chưa có khảo sát"} state={satisfaction === null ? null : satisfaction >= 4} />
    </section>
    <section className="card section manager-table-card manager-progress-card">
      <header className="row between manager-section-heading manager-progress-card-header">
        <div className="row">
          <ManagerTitle title={`Đang học (${approved.length})`} label="Đang học: giải thích" tip="Sắp theo rủi ro bỏ học: người bỏ học nhiều ngày nhất đứng đầu. Bấm … để xem Season, thi tháng, điểm thưởng và hoạt động gần nhất." />
          {compact ? null : <span className="xs muted">Sắp theo rủi ro bỏ học</span>}
        </div>
        <div className="row manager-progress-card-actions no-print">
          {reminderCount ? <a className="btn btn-primary" href="/mgr/reminders" aria-label={`Mở danh sách ${reminderCount} người cần nhắc`}>
            <Bell size={16} strokeWidth={2} aria-hidden="true" /> {reminderCount}{compact ? "" : " cần nhắc"}
          </a> : null}
          <button className="btn btn-primary" type="button" aria-label="Xuất CSV" onClick={() => monthly ? exportManagerMonthlyCsv(monthly) : exportCsv(view)}><ActionLabel icon={Download} label="Xuất CSV" /></button>
          <a className="btn" href="/mgr/rewards" aria-label="Giả lập phần thưởng"><ActionLabel icon={Gift} label="Giả lập phần thưởng" /></a>
        </div>
      </header>
      <div className="table-wrap manager-progress-table manager-action-table" data-manager-action-table role="region" aria-label="Danh sách đang học" tabIndex={0}><table role="table" aria-label="Tiến độ người học"><thead><tr><th scope="col">Người học</th><th>Mức</th><th>Nhịp học</th><th>Bài tháng</th><th>Coach</th><th>{monthly ? "Thi tháng" : "Đánh giá"}</th><th>Điểm thưởng</th><th>Gần nhất</th><th>Điểm đầu vào</th><th>Trạng thái</th><th className="manager-progress-compact-details">Chi tiết</th><th aria-label="Thao tác" /></tr></thead><tbody>{rowsPaged.visible.map((learner) => <LearnerRow key={learner.learnerId} learner={learner} monthly={monthByLearner.get(learner.learnerId)} {...(view.weekStartDate ? { weekStartDate: view.weekStartDate } : {})} {...(onOpenLearnerProfile ? { onOpen: onOpenLearnerProfile } : {})} />)}{!rows.length ? <tr><td colSpan={12} className="muted">Chưa có người học được duyệt mức.</td></tr> : null}</tbody></table></div>
      <Pager {...rowsPaged} label="người học đang học" />
    </section>
    {compactUi ? activeWaiting ? <section className="card section manager-progress-waiting">
      <header className="row between manager-section-heading"><ManagerTitle title={`Chờ xếp mức (${submitted.length + testing.length + notTested.length})`} label="Chờ xếp mức: giải thích" tip="Đã nộp: bài test đã nộp, đang chờ Người vận hành duyệt mức. Đang làm: bài test đang được thực hiện, chưa thể chấm điểm. Chưa làm: chưa có kết quả test." /></header>
      <div className="manager-progress-waiting-tabs" role="tablist" aria-label="Trạng thái bài test đầu vào">{waitingGroups.map((group) => <button key={group.id} type="button" role="tab" aria-selected={group.id === activeWaiting.id} disabled={!group.items.length} onClick={() => { setWaitingTab(group.id); waitingPaged.setPage(1); }}>{group.label} <b>{group.items.length}</b></button>)}</div>
      <div className="list manager-progress-list" role="tabpanel" aria-label={`Danh sách ${activeWaiting.label.toLocaleLowerCase("vi-VN")}`}>{waitingPaged.visible.map((learner) => <PendingLearnerRow key={learner.learnerId} learner={learner} showScoring={activeWaiting.id === "submitted"} {...(onOpenLearnerProfile ? { onOpen: onOpenLearnerProfile } : {})} />)}</div>
      <Pager {...waitingPaged} label="người học chờ xếp mức" />
    </section> : null : <>
      {submitted.length ? <section className="card section manager-progress-submitted"><h3>Đã nộp, chờ duyệt mức ({submitted.length})</h3><div className="list manager-progress-list" role="region" aria-label="Danh sách đã nộp chờ duyệt mức" tabIndex={0}>{submittedPaged.visible.map((learner) => <PendingLearnerRow key={learner.learnerId} learner={learner} detail={compact ? "Chờ duyệt mức" : "Bài test đã nộp; đang chờ Người vận hành duyệt mức."} {...(onOpenLearnerProfile ? { onOpen: onOpenLearnerProfile } : {})} />)}</div><Pager {...submittedPaged} label="người học đã nộp" /></section> : null}
      {testing.length ? <section className="card section manager-progress-testing"><h3>Đang làm test ({testing.length})</h3><div className="list manager-progress-list" role="region" aria-label="Danh sách đang làm test" tabIndex={0}>{testingPaged.visible.map((learner) => <PendingLearnerRow key={learner.learnerId} learner={learner} detail={compact ? "Đang làm, chưa chấm" : "Bài test đang được thực hiện, chưa thể chấm điểm."} showScoring={false} {...(onOpenLearnerProfile ? { onOpen: onOpenLearnerProfile } : {})} />)}</div><Pager {...testingPaged} label="người học đang làm test" /></section> : null}
      {notTested.length ? <section className="card section manager-progress-not-tested"><h3>Chưa làm test ({notTested.length})</h3><div className="list manager-progress-list" role="region" aria-label="Danh sách chưa làm test" tabIndex={0}>{notTestedPaged.visible.map((learner) => <PendingLearnerRow key={learner.learnerId} learner={learner} detail={compact ? "Chưa có kết quả" : learner.lastActivityAt ? "Đã có hoạt động hồ sơ, chưa có kết quả test" : "Chưa có kết quả test"} {...(onOpenLearnerProfile ? { onOpen: onOpenLearnerProfile } : {})} />)}</div><Pager {...notTestedPaged} label="người học chưa làm test" /></section> : null}
    </>}
  </div>;
}

function Kpi({ label, value, detail, state, tip }: { label: string; value: string; detail: string; state: boolean | null; tip: string }) {
  const compact = useCompactUi();
  return <article className="card kpi" data-state={state === null ? "empty" : state ? "good" : "bad"}><span className="val">{value}</span>{compact ? <ManagerTitle as="h4" className="kpi-label" title={label} tip={tip} /> : <b>{label}</b>}<span className="xs muted">{detail}</span></article>;
}

function LearnerRow({ learner, monthly, weekStartDate, onOpen }: { learner: ManagerProgressView["learners"][number]; monthly?: ManagerMonthlyLearnerView | undefined; weekStartDate?: string; onOpen?: (id: string) => void }) {
  const compactCard = useMediaQuery("(max-width: 600px)");
  const missed = learner.missedDays ?? 0; const reward = rewardSeasonOfLearner(learner);
  const status = managerLearnerStatus(learner, weekStartDate);
  const badgeDetailText = (learner.earnedBadgeDetails ?? []).map((badge) => `${badge.label}: ${badge.description}`).join(" · ");
  // Owner-supplied pictures (19/11) for the Season and each earned badge.
  const earnedKeys = [...new Set([...learner.earnedBadges, ...(learner.earnedBadgeDetails ?? []).map(({ key }) => key)].filter((key) => rewardBadgeIcon(key)).map(rewardBadgeKey))];
  const earnedIcons = earnedKeys.length ? <span className="reward-icon-row">{earnedKeys.map((key) => <RewardBadgeImage key={key} badgeKey={key} size={18} />)}</span> : null;
  const lessonCount = monthly ? `${monthly.lessons.completed}/${monthly.lessons.scheduled}` : learner.totalLessonsThisWeek ? `${learner.completedLessons}/${learner.totalLessonsThisWeek}` : "—";
  const assessment = monthly ? monthly.attendanceAppealRequired
    ? <Badge tone="warn">Cần kháng nghị</Badge>
    : <span className="small">{monthlyExamLabel(monthly.exam)}</span> : learner.weeklyPracticeStatus === "scored"
    ? <Badge tone={(learner.weeklyPracticeScore ?? 0) >= 70 ? "ok" : "warn"}>{formatScore(learner.weeklyPracticeScore)}</Badge>
    : learner.weeklyPracticeStatus === "pending_review" ? <Badge tone="warn">chờ chấm</Badge> : <span className="muted">chưa</span>;
  const coach = monthly ? <>{monthly.season.turns}<span className="xs muted"> /{monthly.season.target}</span></> : <>{learner.coachTurnsThisWeek}{learner.coachTurnsThisWeek >= 50 ? " ✓" : <span className="xs muted"> /50</span>}</>;
  const rewardPoints = <><RewardSeasonImage level={reward.level} size={18} className="reward-icon--inline" /> <b>★ {learner.rewardPoints}</b>{earnedIcons && <> {earnedIcons}</>}</>;
  const lastActivity = learner.lastActivityAt
    ? <>{formatDate(learner.lastActivityAt)}{missed ? <span className="muted"> ({missed} ngày)</span> : null}</>
    : <span className="muted">Chưa vào học</span>;
  const statusBadge = <Badge tone={status.startsWith("Bỏ ") ? "danger" : status === "Chưa có hoạt động gần đây" ? "warn" : "ok"}>{status}</Badge>;
  const rewardTitle = `Cấp ${reward.index + 1}/4: ${reward.name}${learner.cefr ? ` · ${learner.cefr}` : ""} · ${reward.pointsInLevel.toLocaleString("vi-VN")} điểm trong trình độ · tổng ${learner.rewardPoints.toLocaleString("vi-VN")}${badgeDetailText ? ` · ${badgeDetailText}` : ""}`;
  const hasAttendance = monthly && monthly.maxAbsences + monthly.elapsedDays > 0;
  const absence = hasAttendance ? `Vắng ${monthly.absenceDays}/${monthly.maxAbsences}` : undefined;
  const attendanceDots = <WeekDots count={learner.sessionsThisWeek} {...(weekStartDate ? { weekStartDate } : {})} {...(learner.activityDatesThisWeek ? { activityDates: learner.activityDatesThisWeek } : {})} />;
  const profile = <button className="btn-sm" type="button" aria-label={`Hồ sơ ${learner.learnerName}`} disabled={!onOpen} title={!onOpen ? "Chưa có API hồ sơ học viên dành cho Quản lý" : undefined} onClick={() => onOpen?.(learner.learnerId)}><ActionLabel icon={UserRound} label="Hồ sơ" /></button>;

  if (compactCard) return <tr className="manager-progress-card-row" role="row">
    <td colSpan={12}>
      <article className="manager-progress-learner-card" aria-label={learner.learnerName}>
        <header>
          <b>{learner.learnerName}</b>
          <Badge tone="primary">{learner.cefr}</Badge>
          {profile}
        </header>
        <div className="manager-progress-card-status">{statusBadge}</div>
        <dl className="manager-progress-card-metrics">
          <div>
            <dt>Điểm danh</dt>
            <dd>{absence ? <b>{absence}</b> : <span>{learner.sessionsThisWeek} buổi trong tuần</span>}</dd>
          </div>
          <div><dt>Bài tháng</dt><dd>{lessonCount}</dd></div>
          <div><dt>Season</dt><dd>{coach}</dd></div>
          <div><dt>{monthly ? "Thi tháng" : "Đánh giá"}</dt><dd>{assessment}</dd></div>
        </dl>
        <details>
          <summary>Chi tiết tiến độ</summary>
          <dl className="manager-progress-card-metrics">
            <div><dt>Nhịp học trong tuần</dt><dd>{attendanceDots} {learner.sessionsThisWeek}</dd></div>
            <div><dt>Điểm thưởng</dt><dd aria-label={rewardTitle}>{rewardPoints}</dd></div>
            <div><dt>Điểm đầu vào</dt><dd>{formatScore(learner.placementScore)}</dd></div>
            <div><dt>Gần nhất</dt><dd>{lastActivity}</dd></div>
          </dl>
        </details>
      </article>
    </td>
  </tr>;

  return <tr className="manager-progress-record" role="row">
    <td className="manager-progress-name"><b>{learner.learnerName}</b></td>
    <td className="manager-progress-level"><Badge tone="primary">{learner.cefr}</Badge></td>
    <td className="manager-progress-rhythm"><span className="manager-progress-compact-label">Nhịp học </span>{attendanceDots} <span className="xs muted">{learner.sessionsThisWeek}</span>{absence ? <div className="xs muted">{absence}</div> : null}</td>
    <td className="manager-progress-lessons"><span className="manager-progress-compact-label">Bài tháng </span>{lessonCount}</td>
    <td className="manager-progress-desktop-detail">{coach}</td>
    <td className="manager-progress-desktop-detail">{assessment}</td>
    <td className="manager-progress-desktop-detail" title={rewardTitle}>{rewardPoints}</td>
    <td className="manager-progress-desktop-detail">{lastActivity}</td>
    <td className="manager-progress-desktop-detail">{formatScore(learner.placementScore)}</td>
    <td className="manager-progress-status">{statusBadge}</td>
    <td className="manager-progress-compact-details">
      <details>
        <summary aria-label="Chi tiết tiến độ" title="Chi tiết tiến độ"><span className="manager-progress-details-label">Chi tiết tiến độ</span></summary>
        <dl className="manager-detail-metrics">
          <div><dt>Season</dt><dd>{coach}</dd></div>
          <div><dt>{monthly ? "Thi tháng" : "Đánh giá"}</dt><dd>{assessment}</dd></div>
          <div><dt>Điểm thưởng</dt><dd aria-label={rewardTitle}>{rewardPoints}</dd></div>
          <div className="manager-detail-secondary"><dt>Điểm đầu vào</dt><dd>{formatScore(learner.placementScore)}</dd></div>
          <div><dt>Gần nhất</dt><dd>{lastActivity}</dd></div>
        </dl>
      </details>
    </td>
    <td className="manager-progress-profile"><div className="row manager-row-actions">{profile}</div></td>
  </tr>;
}

function PendingLearnerRow({ learner, detail, showScoring = true, onOpen }: { learner: ManagerProgressView["learners"][number]; detail?: string; showScoring?: boolean; onOpen?: (id: string) => void }) {
  const scoringLabel = learner.placementScoring === "ai" ? "AI chấm" : learner.placementScoring === "human" ? "Đã chấm tay" : learner.placementScoring === "automatic" ? "Tự động" : learner.placementScoring === "pending" ? "Chờ chấm" : null;
  return <div className="item"><div className="body"><div className="row"><b>{learner.learnerName}</b>{showScoring && scoringLabel ? <Badge tone={learner.placementScoring === "pending" ? "warn" : "primary"}>{scoringLabel}</Badge> : null}</div>{detail ? <div className="xs muted">{detail}</div> : null}</div><button className="btn-sm" type="button" aria-label={`Hồ sơ ${learner.learnerName}`} disabled={!onOpen} title={!onOpen ? "Chưa có API hồ sơ học viên dành cho Quản lý" : undefined} onClick={() => onOpen?.(learner.learnerId)}><ActionLabel icon={UserRound} label="Hồ sơ" /></button></div>;
}


function WeekDots({ count, weekStartDate, activityDates }: { count: number; weekStartDate?: string; activityDates?: readonly string[] }) {
  const hasServerAttendance = Boolean(weekStartDate && activityDates);
  const activeDates = new Set(activityDates ?? []);
  const days = hasServerAttendance ? Array.from({ length: 7 }, (_, index) => {
    const date = addDays(weekStartDate!, index);
    return { label: DAY_LABELS[index]!, date, active: activeDates.has(date) };
  }) : Array.from({ length: 5 }, (_, index) => ({ label: DAY_LABELS[index]!, date: "", active: index < count }));
  return <span className="week-dots" aria-label="Điểm danh tuần này">{days.map((day) => <i key={`${day.label}-${day.date}`} className={`dot ${day.active ? "on" : "off"}`} aria-label={`${day.label}: ${day.active ? "đã học" : "chưa học"}`} title={day.date ? `${day.label} · ${day.date}` : day.label} />)}</span>;
}
function risk(learner: ManagerProgressView["learners"][number], weekStartDate?: string) { const status = managerLearnerStatus(learner, weekStartDate); return status.startsWith("Bỏ ") ? 2 : status === "Chưa có hoạt động gần đây" ? 1 : 0; }
const DAY_LABELS = ["T2", "T3", "T4", "T5", "T6", "T7", "CN"] as const;
function addDays(start: string, days: number) { const date = new Date(`${start}T00:00:00Z`); date.setUTCDate(date.getUTCDate() + days); return date.toISOString().slice(0, 10); }
export function managerLearnerStatus(learner: ManagerProgressView["learners"][number], weekStartDate?: string, today = new Date()): string {
  const missed = learner.missedDays ?? 0;
  if (missed >= 2) return `Bỏ ${missed} ngày`;
  const todayKey = today.toISOString().slice(0, 10);
  const reachedWednesday = weekStartDate ? todayKey >= addDays(weekStartDate, 2) : (today.getDay() || 7) >= 3;
  return learner.sessionsThisWeek === 0 && reachedWednesday ? "Chưa có hoạt động gần đây" : "Đang học";
}
export function buildManagerProgressCsv(view: ManagerProgressView, today = new Date()): string {
  const headers = ["Tên học viên", "Mức hiện tại", "Tình trạng học", "Mức rủi ro", "Số ngày không học", "Hoạt động gần nhất", "Số buổi gần đây", "Bài hoàn thành tháng", "Tổng bài tháng", "Lượt AI Coach", "Trạng thái đánh giá", "Điểm đánh giá", "Trạng thái bài đầu vào", "Cách chấm đầu vào", "Điểm đầu vào", "Điểm thưởng", "Huy hiệu"];
  const rows = [headers, ...view.learners.map((learner) => {
  const missed = learner.missedDays ?? 0;
    const status = managerLearnerStatus(learner, view.weekStartDate, today);
    const riskLevel = status.startsWith("Bỏ ") ? "Cao" : status === "Chưa có hoạt động gần đây" ? "Trung bình" : "Bình thường";
    const practiceStatus = learner.weeklyPracticeStatus === "scored" ? "Đã chấm" : learner.weeklyPracticeStatus === "pending_review" ? "Chờ chấm" : "Chưa nộp";
    const placementStatus = learner.placementStatus === "submitted" ? "Đã nộp" : learner.placementStatus === "in_progress" ? "Đang làm" : learner.placementStatus === "not_started" ? "Chưa làm" : "Không rõ";
    const placementScoring = learner.placementScoring === "ai" ? "AI chấm" : learner.placementScoring === "human" ? "Chấm tay" : learner.placementScoring === "automatic" ? "Tự động" : learner.placementScoring === "pending" ? "Chờ chấm" : "Không rõ";
    return [
      learner.learnerName,
      learner.cefr ?? "",
      status,
      riskLevel,
      missed,
      learner.lastActivityAt ? formatCsvDateTime(learner.lastActivityAt) : "Chưa vào học",
      learner.sessionsThisWeek,
      learner.completedLessons,
      learner.totalLessonsThisWeek,
      learner.coachTurnsThisWeek,
      practiceStatus,
      learner.weeklyPracticeStatus === "scored" ? formatScoreForExport(learner.weeklyPracticeScore) : "",
      placementStatus,
      placementScoring,
      learner.placementScore == null ? "—" : formatScoreForExport(learner.placementScore),
      learner.rewardPoints,
      learner.earnedBadges.join(", ") || "—"
    ];
  })];
  return rows.map((row) => row.map((cell) => `"${String(cell).replaceAll('"', '""')}"`).join(",")).join("\r\n");
}

function formatCsvDateTime(value: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/.exec(value);
  return match ? `${match[3]}/${match[2]}/${match[1]} ${match[4]}:${match[5]}` : value;
}

function exportCsv(view: ManagerProgressView) {
  const csv = buildManagerProgressCsv(view);
  const url = URL.createObjectURL(new Blob(["\ufeff", csv], { type: "text/csv;charset=utf-8" }));
  const a = document.createElement("a"); a.href = url; a.download = "e4s-tien-do.csv"; a.click(); URL.revokeObjectURL(url);
}
