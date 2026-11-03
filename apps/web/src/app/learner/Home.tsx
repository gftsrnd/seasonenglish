import { useEffect, useRef, useState, type CSSProperties, type KeyboardEvent as ReactKeyboardEvent } from "react";
import { BookOpen, Check, Circle, Clock3, LockKeyhole, MessageCircle, Play, Sprout } from "lucide-react";
import type { LearnerHomeView, LearnerCallbacks } from "./contracts.js";
import { Notice, PageTitle, Progress, AppLink } from "./ui.js";

export function LearnerHome({ view, actions }: { view: LearnerHomeView; actions: LearnerCallbacks }) {
  const [celebration, setCelebration] = useState(view.rewardAnnouncement?.kind === "new-level-announcement" || view.rewardAnnouncement?.kind === "top-level-redirect" ? view.rewardAnnouncement : null);
  const [assessmentCelebration, setAssessmentCelebration] = useState(false);
  useEffect(() => {
    setCelebration(view.rewardAnnouncement?.kind === "new-level-announcement" || view.rewardAnnouncement?.kind === "top-level-redirect" ? view.rewardAnnouncement : null);
  }, [view.rewardAnnouncement?.announcementId, view.rewardAnnouncement?.kind]);
  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      if (window.sessionStorage.getItem("e4s:assessment-complete-celebration") !== "1") return;
      window.sessionStorage.removeItem("e4s:assessment-complete-celebration");
    } catch {
      return;
    }
    setAssessmentCelebration(true);
    const timer = window.setTimeout(() => setAssessmentCelebration(false), 4_500);
    return () => window.clearTimeout(timer);
  }, []);
  if (view.onboardingRequired || view.learner.cefr === null) return <OnboardingHome view={view} actions={actions} />;
  const next = view.nextLesson;
  const monthly = view.month ?? null;
  const monthlyPreparation = view.monthlyPreparation === true;
  return <div className="app-learner-page home-page" style={{ width: "100%", maxWidth: 960, minWidth: 0, boxSizing: "border-box" }}>
    <PageTitle eyebrow={monthly ? `Tháng ${formatMonth(monthly.month)} · ${monthly.themeTitle}` : "Lộ trình tháng đang được chuẩn bị"} title={`Chào ${view.learner.displayName}!`} aside={<span className={`badge lvl lvl-${view.learner.cefr}`}>Trình độ {view.learner.cefr}</span>} />
    <div className="bao-row" style={{ marginBottom: 16 }} aria-label="Lời chào của Season AI Coach"><div className="bubble home-today-heading" style={{ flex: 1 }}>Hôm nay học gì nào?</div></div>
    {view.inactivityReminder ? <Notice tone="warn"><b>Bạn đã nghỉ học {view.inactivityReminder.inactiveDays} ngày.</b> Học bù bài gần nhất để nối lại nhịp học nhé.</Notice> : null}
    {!view.aiAvailable && view.aiAvailable !== undefined ? <Notice tone="warn">AI chưa kết nối (chưa có API key). Bạn vẫn làm test và học bài đã duyệt; báo người vận hành để bật AI coach.</Notice> : null}
    {view.notifications?.length ? <section className="card" aria-label="Thông báo mới" style={{ marginTop: 12 }}><div className="eyebrow">Thông báo</div><h3 style={{ margin: "2px 0 8px" }}>Nội dung học tập</h3><ul style={{ margin: 0, paddingLeft: 20 }}>{view.notifications.slice(0, 5).map((notification) => <li key={notification.id} className="small" style={{ marginBottom: 6 }}>{notification.message}</li>)}</ul></section> : null}
    <PrimaryLesson view={view} next={next} actions={actions} />
    {!monthlyPreparation ? <section className="stats" data-home-block="metrics" aria-label="Tiến độ hiện tại">
      <Metric label="Bài tháng" value={`${view.metrics.completedLessons}/${view.metrics.totalLessons}`} percent={ratio(view.metrics.completedLessons, view.metrics.totalLessons)} />
      <Metric label="Bài ôn" value={`${view.metrics.completedReviews ?? 0}/${view.metrics.totalReviews ?? 0}`} percent={ratio(view.metrics.completedReviews ?? 0, view.metrics.totalReviews ?? 0)} color="var(--butter)" />
      <Metric label="Điểm danh" value={String(view.schedule.days.filter((day) => day.status === "attended").length)} percent={ratio(view.schedule.days.filter((day) => day.status === "attended").length, view.schedule.days.filter((day) => day.status !== "upcoming").length)} color="var(--peach)" />
      <MonthlyExamMetric status={view.metrics.monthlyExamStatus ?? view.monthlyExam?.status ?? "unpublished"} />
    </section> : null}
    {monthly && view.lessons.length ? <MonthlyCalendar month={monthly} lessons={view.lessons} actions={actions} /> : null}
    {monthly && view.monthlyExam ? <MonthlyExamCard month={monthly} exam={view.monthlyExam} actions={actions} /> : null}
    {monthly ? <section className="card" style={{ marginTop: 16 }} data-home-block="attendance" aria-label="Nhịp học tháng này"><div className="row between"><h3>Nhịp học tháng này</h3><strong>{view.schedule.days.filter((day) => day.status === "attended").length} buổi</strong></div><ol className="days home-week-axis" style={{ display: "grid", gridTemplateColumns: `repeat(${Math.max(view.schedule.days.length, 1)}, minmax(0, 1fr))`, gap: 12, alignItems: "start", margin: "12px 0 0", padding: 0, minWidth: 0, width: "100%" }}> {view.schedule.days.map((day) => <li className="day" data-status={day.status} key={day.date}><span>{day.label}</span><i className={day.status === "attended" ? "on" : day.status === "missed" ? "miss" : day.status}>{day.status === "attended" ? <Check className="status-icon" aria-label="Đã học" /> : day.status === "today" ? <Circle className="status-icon" aria-label="Hôm nay" fill="currentColor" /> : day.status === "missed" ? <span className="sr-only">Đã bỏ lỡ</span> : <Circle className="status-icon" aria-label="Chưa học" />}</i></li>)}</ol><p className="xs muted attendance-schedule-note">Lịch học tháng · 1 bài/ngày, ≥{view.schedule.lessonMinutes} phút. {view.monthlyGoal ?? ""}</p></section> : null}
    <section className="grid cols-2" style={{ marginTop: 16, alignItems: "stretch", gridAutoRows: "1fr", minWidth: 0 }} data-home-block="activities" aria-label="Hoạt động tháng">
      <AppLink className={`tile ${!monthlyPreparation && (view.coach.turnsToday ?? 0) > 0 ? "mint" : "peach"}`} style={{ height: "100%", minWidth: 0, boxSizing: "border-box" }} href="/coach" navigate={actions.navigate}><ActivityIcon /><span className="t">Season AI Coach</span><span className="s">{monthlyPreparation ? "Luyện theo trình độ đã được duyệt trong khi chờ bộ bài tháng." : (view.coach.turnsToday ?? 0) > 0 ? `Đã luyện hôm nay ✓ (${view.coach.turnsToday} lượt)` : `Đã luyện ${view.coach.turnsThisWeek} lượt trong tháng này`}</span></AppLink>
      <AppLink className="tile mint" style={{ height: "100%", minWidth: 0, boxSizing: "border-box" }} href="/monthly" navigate={actions.navigate}><BookOpen aria-hidden="true" /><span className="t">Bài tháng</span><span className="s">{monthlyPreparation ? "Xem trạng thái chuẩn bị lộ trình tháng." : "Xem lịch bài học, bài ôn và bài thi tháng."}</span></AppLink>
    </section>
    {!monthlyPreparation ? <Readiness view={view} actions={actions} /> : null}
    <section className="card" style={{ marginTop: 12 }} aria-label="Hồ sơ và đánh giá đầu vào">
      <div className="row between" style={{ gap: 12, alignItems: "flex-start", flexWrap: "wrap" }}>
        <div><div className="eyebrow">Thông tin của bạn</div><h3 style={{ margin: "2px 0 4px" }}>Hồ sơ và đánh giá đầu vào</h3><p className="small muted" style={{ margin: 0 }}>Trình độ đã duyệt: <b>{view.learner.cefr}</b>. Kết quả đầu vào và hồ sơ vẫn xem được khi lộ trình tháng đang chuẩn bị.</p></div>
        <div className="row" style={{ flexWrap: "wrap" }}>
          <AppLink className="btn" href="/profile" navigate={actions.navigate}>Hồ sơ học tập</AppLink>
          <AppLink className="btn" href="/profile" navigate={actions.navigate}>Kết quả đầu vào</AppLink>
          {!monthlyPreparation ? <AppLink className="btn" href="/profile" navigate={actions.navigate}>Phần thưởng</AppLink> : null}
          {!monthly && !monthlyPreparation ? <AppLink className="btn" href="/survey" navigate={actions.navigate}>Khảo sát cuối pilot</AppLink> : null}
        </div>
      </div>
    </section>
    {!monthlyPreparation && view.reward ? <section className="card home-reward" style={{ marginTop: 16 }} data-home-block="reward" aria-label="Mùa học hiện tại"><div className="row between"><div><div className="eyebrow">Mùa học</div><h2>{view.reward.seasonName}</h2></div><strong>{view.reward.points} điểm</strong></div>{view.reward.nextPoints !== null ? <p className="small muted" style={{ marginBottom: 0 }}>Còn {Math.max(0, view.reward.nextPoints - view.reward.points)} điểm để mở cấp tiếp theo.</p> : <p className="small muted" style={{ marginBottom: 0 }}>Bạn đã đạt cấp cao nhất của chương trình.</p>}</section> : null}
    {celebration ? <LevelUpCelebration announcement={celebration} displayName={view.learner.displayName} onClose={async () => { if (celebration.announcementId) await actions.acknowledgeRewardAnnouncement?.(celebration.announcementId); setCelebration(null); }} /> : null}
    {assessmentCelebration ? <AssessmentCelebration /> : null}
  </div>;
}

function AssessmentCelebration() {
  const particles = Array.from({ length: 36 }, (_, index) => {
    const burst = index % 3;
    const angle = (index % 12) * 30;
    return <i key={index} style={{ "--burst": burst, "--angle": `${angle}deg`, "--delay": `${(index % 6) * 70}ms` } as CSSProperties} />;
  });
  return <div className="assessment-celebration-fireworks" data-testid="assessment-celebration-fireworks" role="status" aria-label="Chúc mừng bạn đã hoàn thành bài kiểm tra">{particles}<span className="sr-only">Chúc mừng bạn đã hoàn thành bài kiểm tra.</span></div>;
}

function LevelUpCelebration({
  announcement,
  displayName,
  onClose
}: {
  announcement: NonNullable<LearnerHomeView["rewardAnnouncement"]>;
  displayName: string;
  onClose: () => void | Promise<void>;
}) {
  const closeRef = useRef<HTMLButtonElement>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);
  const genuine = announcement.source !== "simulated";
  const isTopLevel = announcement.kind === "top-level-redirect";
  useEffect(() => {
    previousFocusRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    closeRef.current?.focus();
    return () => previousFocusRef.current?.focus();
  }, []);
  const handleDialogKeyDown = (event: ReactKeyboardEvent<HTMLElement>) => {
    if (event.key === "Escape") {
      event.preventDefault();
      void onClose();
      return;
    }
    if (event.key !== "Tab") return;
    const focusable = Array.from(event.currentTarget.querySelectorAll<HTMLElement>("button:not(:disabled), a[href], input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex]:not([tabindex='-1'])"));
    if (!focusable.length) {
      event.preventDefault();
      event.currentTarget.focus();
      return;
    }
    const first = focusable[0]!;
    const last = focusable[focusable.length - 1]!;
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  };
  return <div className="modal-backdrop" role="presentation">
    <section className="dialog wide" role="dialog" aria-modal="true" aria-label="Chúc mừng lên mức" data-testid="modal.level-up-celebration" data-modal="level-up-celebration" tabIndex={-1} onKeyDown={handleDialogKeyDown}>
      <div className="row between"><span className={`badge ${genuine ? "ok" : ""}`}>{genuine ? "Thông báo thật" : "Mô phỏng"}</span><button ref={closeRef} type="button" aria-label="Đóng" onClick={() => void onClose()}>Đóng</button></div>
      <div className="card flat" style={{ marginTop: 12, textAlign: "center" }}><div className="eyebrow">{announcement.seasonName}</div><Sprout className="celebration-icon" aria-hidden="true" /><h2>{isTopLevel ? "Bạn đã đạt mức cao nhất" : `Chúc mừng ${displayName}!`}</h2>{announcement.level ? <p className="badge lvl">Mức {announcement.level}</p> : null}</div>
      <p>{isTopLevel ? "Bạn đã hoàn thành chặng CEFR cao nhất trong lộ trình hiện tại." : "Bạn vừa mở một cột mốc mới trong hành trình học tiếng Anh."}</p>
      <Notice tone="info"><b>Quy tắc công nhận:</b> {announcement.rule ?? (isTopLevel ? "Mức cao nhất được giữ lại trong hồ sơ của bạn." : "Mức mới chỉ hiển thị sau khi người vận hành duyệt bằng chứng học tập.")}</Notice>
      <div className="row" style={{ justifyContent: "flex-end", marginTop: 16 }}><button type="button" onClick={() => void onClose()}>Đóng</button><button className="btn-primary" type="button" onClick={() => void onClose()}>Tiếp tục học</button></div>
    </section>
  </div>;
}

function PrimaryLesson({ view, next, actions }: { view: LearnerHomeView; next: LearnerHomeView["nextLesson"]; actions: LearnerCallbacks }) {
  const monthly = view.month ?? null;
  if (!monthly) return <section className="card" data-home-block="primary"><h2>Lộ trình tháng đang được chuẩn bị</h2><p>Người vận hành đang chuẩn bị và duyệt bộ bài tháng cho mức {view.learner.cefr ?? "—"}. Bạn có thể luyện với Season trong lúc chờ.</p></section>;
  const period = `Tháng ${formatMonth(monthly.month)}`;
  if (!next && !view.lessons.length) return <section className="card" data-home-block="primary"><h2>{period}: {monthly.themeTitle}</h2><p>Bộ bài tháng đang được chuẩn bị và duyệt. Quay lại sau nhé.</p></section>;
  if (!next) return <section className="hero" style={{ background: "var(--mint)", color: "var(--text)" }} data-home-block="primary"><div className="eyebrow">{period}</div><h2>Xong hết {view.lessons.length} bài rồi!</h2><p>Ôn lại bài hoặc luyện thêm với Season nhé.</p></section>;
  if (next.lock) {
    const blocker = next.lock.blocker;
    const dateLocked = next.lock.reason === "date";
    return <section className="hero" style={{ background: "var(--mint)", color: "var(--text)" }} data-home-block="primary"><div className="eyebrow">{period}</div><h2>{dateLocked ? next.lock.opensAt ? `Bài này mở vào ${formatLessonDate(next.lock.opensAt)}` : "Bài này chưa mở" : "Học bù bài trước đã nhé"}</h2><p>{dateLocked ? "Chưa đến ngày học nên chưa có nút học bài này." : "Hoàn thành bài trước để mở bài này."}</p>{!dateLocked && blocker ? <AppLink className="btn btn-primary" href={`/lesson/${blocker.id}`} navigate={actions.navigate}>Học bài {monthly ? blocker.dayNumber : `T${blocker.dayNumber + 1}`} ngay</AppLink> : null}</section>;
  }
  const catchUp = isCatchUp(view, next);
  return <section className={`hero home-primary-lesson${catchUp ? " home-primary-lesson--catch-up" : ""}`} data-home-block="primary"><div><div className="eyebrow">{catchUp ? "Bài học bù" : "Bài hôm nay"} · Bài {next.dayNumber} · {period}</div><h2>{catchUp ? "Học bù bài trước đã nhé" : next.title}</h2>{catchUp ? <p style={{ margin: 0 }}>Hoàn thành bài {next.dayNumber}: {next.title}</p> : <div style={{ fontWeight: 700 }}>{monthly.themeTitle}</div>}</div><div className="row" style={{ gap: 14, fontWeight: 800, fontSize: ".9rem" }}><span className="row" style={{ gap: 6 }}><ClockIcon /> {view.schedule.lessonMinutes} phút</span><span>Bài {next.dayNumber}/{view.lessons.length}</span></div><AppLink className="btn btn-primary btn-lg btn-block" href={`/lesson/${next.id}`} navigate={actions.navigate}>{catchUp ? `Học bài ${next.dayNumber} ngay` : "Học ngay"}</AppLink></section>;
}

function lessonTimingLabel(view: LearnerHomeView, lesson: LearnerHomeView["lessons"][number]) {
  if (lesson.status === "completed" || lesson.lock) return "";
  const todayLabel = view.schedule.days.find((day) => day.status === "today")?.label;
  if (lesson.status === "in_progress") return todayLabel === `T${lesson.dayNumber + 1}` ? "hôm nay" : "học bù";
  return view.schedule.days.find((day) => day.label === `T${lesson.dayNumber + 1}`)?.status === "missed" ? "học bù" : "";
}

function isCatchUp(view: LearnerHomeView, next: LearnerHomeView["nextLesson"]) {
  if (!next) return false;
  return lessonTimingLabel(view, next) === "học bù";
}

function ActivityIcon() {
  return <MessageCircle size={24} strokeWidth={2.5} aria-hidden="true" focusable="false" />;
}

function ClockIcon() {
  return <Clock3 size={18} strokeWidth={2.2} aria-hidden="true" focusable="false" />;
}

function lessonLockLabel(lock: NonNullable<LearnerHomeView["lessons"][number]["lock"]>) {
  if (lock.reason === "date") return `Chưa mở${lock.opensAt ? ` · mở vào ${formatLessonDate(lock.opensAt)}` : ""}`;
  return `Chưa mở${lock.blocker ? ` · xong T${lock.blocker.dayNumber + 1} trước` : " · xong bài trước"}`;
}

function formatLessonDate(value: string) {
  const date = new Date(`${value.slice(0, 10)}T00:00:00Z`);
  if (!Number.isFinite(date.getTime())) return value;
  const formatted = new Intl.DateTimeFormat("vi-VN", { weekday: "long", day: "numeric", month: "numeric", year: "numeric" }).format(date);
  return formatted.charAt(0).toLocaleUpperCase("vi-VN") + formatted.slice(1);
}

function formatMonth(value: string) {
  const match = /^(\d{4})-(\d{2})$/u.exec(value);
  return match ? `${match[2]}/${match[1]}` : value;
}


function OnboardingHome({ view, actions }: { view: LearnerHomeView; actions: LearnerCallbacks }) {
  const [hasOnboardDraft, setHasOnboardDraft] = useState(() => readOnboardDraftAvailable());
  useEffect(() => {
    const syncDraftState = () => setHasOnboardDraft(readOnboardDraftAvailable());
    window.addEventListener("storage", syncDraftState);
    return () => window.removeEventListener("storage", syncDraftState);
  }, []);
  const stage = view.approvalPending ? 3 : view.placementDraft || (!view.onboardingRequired && view.learner.cefr === null) ? 2 : 1;
  const steps = [
    ["Hồ sơ cá nhân", "Vì sao cần? Bài học sẽ sát với công việc và cách bạn muốn học."],
    ["Test đầu vào", "Vì sao cần? Để chọn mức bài vừa sức, không quá khó hay quá dễ."],
    ["Vận hành duyệt mức", "Vì sao cần? Người vận hành xem lại trước khi bài học được mở."]
  ] as const;
  return <div className="app-learner-page"><PageTitle title={`Chào ${view.learner.displayName}!`} detail="Mình cần biết về bạn trước nhé!" /><section className="card setup onboarding-steps"><h2>3 bước để bắt đầu học</h2>{steps.map(([title, text], index) => {
    const step = index + 1;
    const done = stage > step;
    const current = stage === step;
    const badge = done ? "Đã xong" : current ? stage === 3 ? "Đang chờ duyệt" : "Đang ở bước này" : "Sắp tới";
    const detail = stage === 3 && step === 3
      ? "Bài đã gửi. Bạn không cần làm gì thêm; bài học tự mở ngay khi có mức."
      : step === 2
        ? "Vì sao cần? Để xếp đúng mức CEFR: bài quá dễ thì chán, quá khó thì nản. Không cần ôn trước."
        : text;
    return <div className={`st ${current ? "cur" : done ? "done" : "todo"}`} key={title}>
      <span className="num">{done ? "✓" : step}</span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div className="row between" style={{ alignItems: "flex-start", gap: 8 }}><h3>{title}</h3><span className={`badge ${done ? "ok" : current ? "primary" : ""}`}>{badge}</span></div>
        <p>{detail}</p>
        {step === 1 && done ? <AppLink className="btn btn-sm" href="/onboard" navigate={actions.navigate}>← Xem / sửa hồ sơ</AppLink> : current && step < 3 ? <><AppLink className="btn btn-primary" href={step === 1 ? "/onboard" : "/test/placement"} navigate={actions.navigate}>{step === 1 ? hasOnboardDraft ? "Tiếp tục phần đã lưu" : "Điền hồ sơ (~2 phút)" : view.placementDraft ? "Tiếp tục bài test" : "Bắt đầu test (tối đa 75 phút)"}</AppLink>{step === 2 && !view.placementDraft ? <div className="onboarding-test-note" role="note"><Clock3 size={16} aria-hidden="true" /><span><b>4 phần</b><span>Nghe · Đọc · Viết · Nói</span></span><span className="onboarding-test-note-separator" aria-hidden="true">·</span><span>Tai nghe + micro</span></div> : null}</> : null}
      </div>
    </div>;
  })}</section></div>;
}

function readOnboardDraftAvailable() {
  try {
    return Boolean(window.localStorage.getItem("e4s:learner-onboard-draft"));
  } catch {
    return false;
  }
}

function MonthlyExamMetric({ status }: { status: NonNullable<LearnerHomeView["monthlyExam"]>["status"] }) {
  const label = monthlyExamLabel(status);
  const complete = status === "completed";
  const ready = status === "ready";
  return <article className="stat" aria-label="Bài thi tháng"><div className="ring" style={{ "--p": complete || ready ? 100 : 0, "--c": complete ? "var(--olive)" : "var(--surface)" } as CSSProperties}><b>{complete ? "✓" : ready ? "Mở" : "Chờ"}</b></div><span className="lbl">Bài thi tháng · {label}</span></article>;
}

function MonthlyCalendar({ month, lessons, actions }: { month: NonNullable<LearnerHomeView["month"]>; lessons: LearnerHomeView["lessons"]; actions: LearnerCallbacks }) {
  const [year, monthNumber] = month.month.split("-").map(Number);
  const first = new Date(Date.UTC(year!, (monthNumber ?? 1) - 1, 1));
  const daysInMonth = new Date(Date.UTC(year!, monthNumber!, 0)).getUTCDate();
  const offset = (first.getUTCDay() + 6) % 7;
  const byDate = new Map(lessons.filter((lesson) => lesson.lessonDate).map((lesson) => [lesson.lessonDate!, lesson]));
  const cells = Array.from({ length: offset + daysInMonth }, (_, index) => index < offset ? null : index - offset + 1);
  return <section className="card" style={{ marginTop: 16, minWidth: 0, boxSizing: "border-box" }} data-home-block="month-path" aria-labelledby="month-path-title">
    <div className="row between"><h3 id="month-path-title">Lịch học tháng {formatMonth(month.month)}</h3><span className="small muted">{month.themeTitle}</span></div>
    <div className="monthly-learner-calendar" role="grid" aria-label={`Lịch học tháng ${formatMonth(month.month)}`}>
      {["T2", "T3", "T4", "T5", "T6", "T7", "CN"].map((label) => <b className="monthly-learner-calendar-heading" role="columnheader" key={label}>{label}</b>)}
      {cells.map((day, index) => {
        if (day === null) return <span className="monthly-learner-calendar-blank" aria-hidden="true" key={`blank-${index}`} />;
        const date = `${year}-${String(monthNumber).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
        const lesson = byDate.get(date);
        if (!lesson) return <span className="monthly-learner-calendar-day" role="gridcell" key={date}><b>{String(day).padStart(2, "0")}</b></span>;
        const locked = Boolean(lesson.lock);
        const status = lesson.status === "completed" ? "done" : locked ? "locked" : lesson.status === "in_progress" ? "today" : "open";
        return <div className={`monthly-learner-calendar-day ${status}`} role="gridcell" key={date}><b>{String(day).padStart(2, "0")}</b><AppLink href={`/lesson/${lesson.id}`} navigate={actions.navigate} disabled={locked} className="monthly-learner-calendar-link" title={locked ? lesson.lock?.message : lesson.title}>{lesson.kind === "review" ? "Ôn tập" : `Bài ${lesson.dayNumber}`}</AppLink></div>;
      })}
    </div>
  </section>;
}

function MonthlyExamCard({ month, exam, actions }: { month: NonNullable<LearnerHomeView["month"]>; exam: NonNullable<LearnerHomeView["monthlyExam"]>; actions: LearnerCallbacks }) {
  const status = monthlyExamLabel(exam.status);
  return <section className="card" style={{ marginTop: 16 }} data-home-block="monthly-exam" aria-label="Bài thi tháng"><div className="row between"><div><div className="eyebrow">{formatMonth(month.month)}</div><h3 style={{ margin: 0 }}>Bài thi tháng</h3></div><span className={`badge ${exam.status === "ready" || exam.status === "completed" ? "ok" : "warn"}`}>{status}</span></div><p className="small">Bạn đã hoàn thành <b>{exam.completedLessons}/{exam.totalLessons}</b> bài trong tháng.</p><p className="small muted">{exam.requirement}</p>{exam.certificateEligible ? <p className="small"><b>Chứng chỉ C1:</b> Hoàn thành bài thi tháng để được xét cấp chứng chỉ.</p> : null}{exam.status === "ready" ? <AppLink className="btn btn-primary" href="/test/monthly" navigate={actions.navigate}>Bắt đầu bài thi tháng</AppLink> : null}</section>;
}

function monthlyExamLabel(status: NonNullable<LearnerHomeView["monthlyExam"]>["status"]) {
  return status === "completed" ? "Đã hoàn thành" : status === "ready" ? "Đã mở" : status === "unpublished" ? "Chờ phát hành" : "Chưa mở";
}

export function LearnerMonthly({ view, actions }: { view: LearnerHomeView; actions: LearnerCallbacks }) {
  const month = view.month;
  const eligibility = view.monthlyEligibility;
  const exam = view.monthlyExam;
  const monthLabel = month?.month ?? eligibility?.month;
  const examDate = month?.examDate ?? eligibility?.examDate;
  const systemDate = month?.systemDate ?? eligibility?.systemDate;
  const publishState = exam?.status === "ready" ? "Đề đã phát hành" : exam?.status === "completed" ? "Đã hoàn thành" : "Đề chưa phát hành";

  return <div className="app-learner-page monthly-assessment-page" style={{ width: "100%", maxWidth: 960, minWidth: 0, boxSizing: "border-box" }}>
    <PageTitle eyebrow={monthLabel ? `Tháng ${formatMonth(monthLabel)}` : "Bài tháng"} title="Bài thi tháng" detail={month ? month.themeTitle : "Theo dõi điều kiện và thời điểm vào đề của tháng hiện tại."} />
    <section className="monthly-assessment-landing" aria-label="Bài thi tháng">
      <header className="monthly-assessment-header">
        <div>
          <div className="eyebrow">Lịch thi</div>
          <h2>{examDate ? formatLessonDate(examDate) : "Đang chờ lịch thi"}</h2>
          <p>{systemDate ? `Ngày hệ thống: ${formatLessonDate(systemDate)}` : "Ngày hệ thống đang được cập nhật."}</p>
        </div>
        <span className={`badge ${exam?.status === "ready" || exam?.status === "completed" ? "ok" : "warn"}`}>{publishState}</span>
      </header>
      {eligibility ? <MonthlyEligibilitySummary eligibility={eligibility} /> : <p className="monthly-assessment-inline-note">Điều kiện điểm danh đang được tải từ hệ thống.</p>}
      <div className="monthly-assessment-form-state" aria-label="Trạng thái form đề">
        <div><b>{exam?.status === "ready" ? "Bạn có thể vào đề" : exam?.status === "completed" ? "Bạn đã hoàn thành bài thi tháng" : "Form đề đang được chuẩn bị"}</b><span>{exam?.status === "ready" ? "Kiểm tra lại tai nghe và micro trước khi bắt đầu." : exam?.status === "completed" ? "Kết quả được lưu trong hồ sơ của bạn." : "Cấu trúc, audio và nút vào đề sẽ chỉ hiện sau khi Operator phát hành form."}</span></div>
        {exam?.status === "ready" ? <AppLink className="btn btn-primary" href="/test/monthly" navigate={actions.navigate}>Vào bài thi</AppLink> : null}
      </div>
    </section>
  </div>;
}

function MonthlyEligibilitySummary({ eligibility }: { eligibility: NonNullable<LearnerHomeView["monthlyEligibility"]> }) {
  const remaining = Math.max(0, daysUntil(eligibility.systemDate, eligibility.examDate));
  const appealRequired = eligibility.accessState === "appeal_required";
  const openToday = eligibility.accessEligible ?? eligibility.accessState === "eligible";
  const missingLearningGate = eligibility.lessonsEligible === false || eligibility.seasonEligible === false || eligibility.frameworkApproved === false || eligibility.formPublished === false;
  const state = appealRequired
    ? { label: "Cần kháng nghị", tone: "warn", copy: "Số ngày vắng đã vượt giới hạn." }
    : openToday
      ? { label: "Đủ điều kiện", tone: "ok", copy: "Đã đến ngày thi." }
      : missingLearningGate
        ? { label: "Chưa đủ điều kiện", tone: "warn", copy: `Cần hoàn thành đủ bài hằng ngày + bài ôn tập, ${eligibility.seasonTurnsRequired ?? 100} lượt Season, framework duyệt và form phát hành.` }
        : { label: "Đang theo dõi", tone: "ok", copy: remaining ? `Còn ${remaining} ngày đến giờ mở đề.` : "Chờ giờ mở đề." };
  return <div className="monthly-eligibility-summary" aria-label="Điều kiện vào bài thi tháng">
    <div className="monthly-eligibility-state"><span className={`badge ${state.tone}`}>{state.label}</span><span className="small muted">{state.copy}</span></div>
    <div className="monthly-eligibility-metrics">
      <Metric label="Điểm danh" secondary={`Vắng ${eligibility.absenceDays}/${eligibility.maxAbsences} tối đa`} value={`${eligibility.attendedDays}/${eligibility.effectiveDays}`} percent={ratio(eligibility.attendedDays, eligibility.effectiveDays)} color={appealRequired ? "var(--danger)" : "var(--olive)"} />
      {(eligibility.frameworkApproved === true && (eligibility.scheduledLessons ?? 0) > 0)
        ? <Metric label="Hoàn thành lịch học" value={`${eligibility.completedLessons ?? 0}/${eligibility.scheduledLessons ?? 0}`} percent={ratio(eligibility.completedLessons ?? 0, eligibility.scheduledLessons ?? 0)} color="var(--primary)" />
        : <Metric label="Hoàn thành lịch học" pending="Chờ chốt lịch học" percent={0} color="var(--primary)" />}
      <Metric label="Season hợp lệ" value={`${eligibility.seasonTurns ?? 0}/${eligibility.seasonTurnsRequired ?? 100}`} percent={ratio(eligibility.seasonTurns ?? 0, eligibility.seasonTurnsRequired ?? 100)} color="var(--lav)" />
      <Metric label="Đếm ngược" value={remaining ? `${remaining} ngày` : "Hôm nay"} percent={ratio(Math.max(0, eligibility.effectiveDays - remaining), eligibility.effectiveDays)} color="var(--primary)" />
    </div>
    <details className="monthly-eligibility-rules"><summary>Quy tắc điểm danh và giờ vào đề</summary><ul><li>Hoàn thành đủ bài hằng ngày và bài ôn tập theo lịch tháng.</li><li>Hoàn thành ít nhất một bài trong ngày để được tính một lần điểm danh; học bù nhiều bài cùng ngày vẫn chỉ tính một lần.</li><li>Ngày học hiệu lực là Thứ Hai–Thứ Sáu, không tính ngày thi; được vắng tối đa {eligibility.maxAbsences} ngày.</li><li>Đạt ít nhất {eligibility.seasonTurnsRequired ?? 100} lượt hợp lệ với Season trong tháng.</li><li>Đề chỉ mở trong cửa sổ hệ thống khi framework đã duyệt và form đã phát hành.</li>{appealRequired ? <li>Gửi kháng nghị tới Manager để xử lý ngày vắng vượt giới hạn.</li> : null}</ul></details>
  </div>;
}
function daysUntil(systemDate: string, examDate: string) {
  const start = new Date(`${systemDate.slice(0, 10)}T00:00:00Z`).getTime(); const end = new Date(`${examDate.slice(0, 10)}T00:00:00Z`).getTime();
  return Number.isFinite(start) && Number.isFinite(end) ? Math.max(0, Math.ceil((end - start) / 86_400_000)) : 0;
}
function Metric({ label, secondary, value, pending, percent, color = "var(--olive)" }: { label: string; secondary?: string; value?: string; pending?: string; percent: number; color?: string }) {
  return <article className={`stat${pending ? " is-pending" : ""}`}>{pending ? <div className="metric-pending" role="status">{pending}</div> : <div className="ring" style={{ "--p": percent, "--c": color } as CSSProperties}><b>{value}</b></div>}<span className="lbl">{label}{secondary ? <small className="metric-secondary">{secondary}</small> : null}</span></article>;
}

function ratio(value: number, total: number) { return total > 0 ? Math.max(0, Math.min(100, Math.round(value / total * 100))) : 0; }

function pilotPhaseLabel(phase: LearnerHomeView["weekPhase"]) {
  return phase === "before_pilot" ? "Pilot sắp bắt đầu" : phase === "after_pilot" ? "Pilot đã kết thúc" : "Đang trong giai đoạn pilot";
}

function Readiness({ view, actions }: { view: LearnerHomeView; actions: LearnerCallbacks }) {
  const levelStatus = view.levelUpPhase === "requested" ? "Yêu cầu lên mức đang chờ duyệt (người vận hành)."
    : view.levelUpPhase === "approved" ? "Mức mới đã được duyệt và ghi nhận."
      : view.levelUpPhase === "failed" ? "Chưa đạt thử thách; kế hoạch luyện lại đang sẵn sàng."
        : view.levelUpPhase === "challenge" ? "Thử thách lên mức đang mở."
          : view.levelUpPhase === "testing" ? "Bài kiểm tra lên mức đang diễn ra."
            : view.levelUpPhase === "ungraded" ? "Bài kiểm tra lên mức đang chờ chấm."
              : null;
  const target = view.levelReadiness.targetLevel;
  const title = target ? view.levelReadiness.eligible ? `Sẵn sàng thi lên ${target}` : `Đường lên mức ${target}` : "Bạn đang ở mức cao nhất";
  return <section className="card" style={{ marginTop: 12 }} data-home-block="readiness" aria-label={target ? view.levelReadiness.eligible ? `Sẵn sàng thi lên ${target}` : `Đường lên mức ${target}` : "Bạn đang ở mức cao nhất"}>
    <div className="row between" style={{ alignItems: "baseline" }}><h3>{title}</h3><span className="small muted" style={{ fontWeight: 800 }}>{view.month ? `Theo tháng ${formatMonth(view.month.month)}` : `${view.levelReadiness.windowDays} ngày gần nhất`}</span></div>
    {levelStatus ? <p className="small muted" style={{ margin: "4px 0 0" }}>{levelStatus}</p> : null}
    {view.levelReadiness.monthlyPolicy ? <MonthlyLevelPolicy policy={view.levelReadiness.monthlyPolicy} /> : view.levelReadiness.criteria.map((metric) => <div className="readiness-metric" data-readiness-key={metric.key} key={metric.key}><div className="small readiness-heading"><span className="readiness-label">{metric.label}</span><span className="readiness-current">{readinessCurrent(metric)}</span></div><ReadinessBar metric={metric} /><div className="readiness-actual small muted">{metric.display}</div></div>)}
    {view.levelUpPhase === "testing" && target ? <div className="card flat" style={{ marginTop: 12, background: "var(--mint)" }}><b>Bài thi lên mức {target} đang dang dở.</b><div className="small" style={{ margin: "4px 0 8px" }}>Tiếp tục từ phần đang làm; bài thi vẫn theo thứ tự 4 kỹ năng.</div><AppLink className="btn btn-primary" href="/test/level-up" navigate={actions.navigate}>Tiếp tục bài thi</AppLink></div> : null}
    {view.levelUpPhase === "challenge" && target ? <div className="card flat" style={{ marginTop: 12, background: "var(--mint)" }}><b>Bạn đã qua bài thi lên mức {target}.</b><div className="small" style={{ margin: "4px 0 8px" }}>Hoàn thành 6 lượt thử thách với Season để gửi yêu cầu duyệt mức.</div><AppLink className="btn btn-primary" href="/challenge" navigate={actions.navigate}>Mở thử thách</AppLink></div> : null}
    {(!view.levelUpPhase || view.levelUpPhase === "eligible") && view.levelReadiness.eligible && view.levelReadiness.examAvailable && target ? <div className="card flat" style={{ marginTop: 12, background: "var(--mint)" }}><b>Bạn đủ điều kiện thi lên mức {target}.</b><div className="small" style={{ margin: "4px 0 8px" }}>Đề ngắn (≈35 phút, 4 phần), rồi 6 lượt thử thách với Season. Chuẩn bị tai nghe và micro như bài đầu vào.</div><AppLink className="btn btn-primary" href="/test/level-up" navigate={actions.navigate}>Thi lên mức</AppLink></div> : null}
    {view.levelUpPhase === "eligible" && !view.levelReadiness.examAvailable && target ? <Notice tone="info">Bạn đã đủ điều kiện thi lên mức {target}; đề sẽ mở ngay khi được vận hành duyệt.</Notice> : null}
    <p className="xs muted" style={{ margin: "10px 0 0" }}>{target ? view.levelReadiness.eligible ? "Đủ cả 4 mục – được thi lên mức khi đề được duyệt." : "Đủ cả 4 mục để thi lên mức." : "Giữ nhịp học để duy trì mức C1."}</p>
  </section>;
}

function MonthlyLevelPolicy({ policy }: { policy: NonNullable<LearnerHomeView["levelReadiness"]["monthlyPolicy"]> }) {
  const finalMet = policy.finalPasses >= policy.finalPassesRequired && (policy.finalAverage ?? 0) >= policy.finalAverageTarget && policy.latestFinalPassed;
  const seasonMet = policy.seasonMonths >= policy.seasonMonthsRequired;
  const monthsMet = policy.eligibleMonths >= policy.requiredMonths;
  const absenceMet = policy.reasons.indexOf("LEVEL_UP_ABSENCE_CAP_EXCEEDED") === -1;
  const item = (key: string, label: string, value: string, met: boolean) => <div className="readiness-metric" data-readiness-key={key} key={key}><div className="small readiness-heading"><span className="readiness-label">{label}</span><span className={`badge ${met ? "ok" : "warn"}`}>{met ? "Đạt" : "Chưa đạt"}</span></div><div className="readiness-actual small muted">{value}</div></div>;
  return <div aria-label="Điều kiện Đường lên mức">{item("eligibleMonths", "6 tháng hợp lệ", `${policy.eligibleMonths}/${policy.requiredMonths} tháng`, monthsMet)}{item("monthlyFinals", "Kết quả bài thi tháng", `${policy.finalPasses}/${policy.finalPassesRequired} bài đạt · TB ${policy.finalAverage === null ? "–" : policy.finalAverage.toFixed(1)}/${policy.finalAverageTarget} · tháng gần nhất ${policy.latestFinalPassed ? "đạt" : "chưa đạt"}`, finalMet)}{item("seasonMonths", "Season đạt chỉ tiêu", `${policy.seasonMonths}/${policy.seasonMonthsRequired} tháng đủ 100 lượt hợp lệ`, seasonMet)}{item("absenceCap", "Giới hạn vắng theo level", `Tối đa ${policy.absenceCap}% trong từng tháng hợp lệ`, absenceMet)}</div>;
}

function readinessScale(key: LearnerHomeView["levelReadiness"]["criteria"][number]["key"]): number {
  return key === "coachRubric" ? 5 : 100;
}

function readinessCurrent(metric: LearnerHomeView["levelReadiness"]["criteria"][number]): string {
  return metric.key === "coachRubric" ? `${metric.current}/5` : `${metric.current}%`;
}

function ReadinessBar({ metric }: { metric: LearnerHomeView["levelReadiness"]["criteria"][number] }) {
  const max = readinessScale(metric.key);
  const current = Math.max(0, Math.min(max, metric.current));
  const valuePercent = max ? current / max * 100 : 0;
  const targetPercent = max ? Math.max(0, Math.min(100, metric.target / max * 100)) : 0;
  return <div className="readiness-track" role="progressbar" aria-label={metric.label} aria-valuemin={0} aria-valuemax={max} aria-valuenow={current}>
    <i className="readiness-fill" style={{ width: `${valuePercent}%` }} />
    <i className="readiness-target" data-testid="readiness-target" aria-hidden="true" style={{ left: `${targetPercent}%` }} />
  </div>;
}





