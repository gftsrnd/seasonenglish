import { useEffect, useRef, useState, type CSSProperties, type KeyboardEvent as ReactKeyboardEvent } from "react";
import { BookOpen, Clock3, LockKeyhole, MessageCircle, Play, Sprout } from "lucide-react";
import type { LearnerHomeView, LearnerCallbacks } from "./contracts.js";
import { Notice, PageTitle, Progress, AppLink } from "./ui.js";
import { LevelReadinessCard } from "./LevelReadiness.js";
import type { LearnerComplaintView } from "@e4s/contracts";

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
    {view.notifications?.length ? <section className="card soft" aria-label="Thông báo mới" style={{ marginTop: 12 }}><div className="eyebrow">Thông báo</div><h3 style={{ margin: "2px 0 8px" }}>Nội dung học tập</h3><ul style={{ margin: 0, paddingLeft: 20 }}>{view.notifications.slice(0, 5).map((notification) => <li key={notification.id} className="small" style={{ marginBottom: 6 }}>{notification.message}</li>)}</ul></section> : null}
    <PrimaryLesson view={view} next={next} actions={actions} />
    {!monthlyPreparation ? <section data-home-block="metrics" aria-label="Tiến độ tháng" style={{ marginTop: 16, padding: "16px 18px", borderRadius: 18, background: "var(--mint)", border: "1px solid var(--border)" }}>
      <div className="row between" style={{ gap: 12, alignItems: "baseline", flexWrap: "wrap" }}><div><div className="eyebrow">Theo tháng</div><h2 style={{ margin: "2px 0 0" }}>Tiến độ học tập</h2></div><span className="small muted">Bài thi tháng nằm trong thẻ riêng bên dưới</span></div>
      <div className="stats monthly-home-metrics" style={{ marginTop: 12 }}>
        <Metric label="Bài theo lịch" value={`${view.metrics.completedLessons}/${view.metrics.totalLessons}`} percent={ratio(view.metrics.completedLessons, view.metrics.totalLessons)} />
        <Metric label="Bài ôn" value={`${view.metrics.completedReviews ?? 0}/${view.metrics.totalReviews ?? 0}`} percent={ratio(view.metrics.completedReviews ?? 0, view.metrics.totalReviews ?? 0)} color="var(--primary)" />
        <Metric label="Điểm danh" secondary={view.monthlyEligibility ? `Vắng ${view.monthlyEligibility.absenceDays}/${view.monthlyEligibility.maxAbsences} tối đa` : undefined} value={view.monthlyEligibility ? `${view.monthlyEligibility.attendedDays}/${view.monthlyEligibility.effectiveDays}` : "–"} percent={view.monthlyEligibility ? ratio(view.monthlyEligibility.attendedDays, view.monthlyEligibility.effectiveDays) : 0} color="var(--peach)" />
        <MonthlyExamMetric status={view.metrics.monthlyExamStatus ?? view.monthlyExam?.status ?? "unpublished"} />
      </div>
    </section> : null}
    {monthly && view.lessons.length ? <MonthlyCalendar month={monthly} lessons={view.lessons} actions={actions} /> : null}
    {monthly ? <MonthlyRhythm lessons={view.lessons} scheduled={view.monthlyEligibility?.scheduledLessons} lessonMinutes={view.schedule.lessonMinutes} goal={view.monthlyGoal} /> : null}
    <section className="grid cols-2" style={{ marginTop: 16, alignItems: "stretch", gridAutoRows: "1fr", minWidth: 0 }} data-home-block="activities" aria-label="Hoạt động tháng">
      <AppLink className={`tile ${!monthlyPreparation && (view.coach.turnsToday ?? 0) > 0 ? "mint" : "peach"}`} style={{ height: "100%", minWidth: 0, boxSizing: "border-box" }} href="/coach" navigate={actions.navigate}><ActivityIcon /><span className="t">Season AI Coach</span><span className="s">{monthlyPreparation ? "Luyện theo trình độ đã được duyệt trong khi chờ bộ bài tháng." : `Lượt hợp lệ hôm nay ${view.coach.turnsToday ?? 0}/30`}</span></AppLink>
      <AppLink className="tile mint" style={{ height: "100%", minWidth: 0, boxSizing: "border-box" }} href="/monthly" navigate={actions.navigate}><BookOpen aria-hidden="true" /><span className="t">Bài tháng</span><span className="s">{monthlyPreparation ? "Xem trạng thái chuẩn bị lộ trình tháng." : "Xem lịch bài học, bài ôn và bài thi tháng."}</span></AppLink>
    </section>
    {!monthlyPreparation ? <LevelReadinessCard readiness={view.levelReadiness} phase={view.levelUpPhase} monthLabel={monthly ? formatMonth(monthly.month) : undefined} navigate={actions.navigate} className="home-readiness" /> : null}
    {!monthlyPreparation && view.monthlyExam ? <MonthlyExamOverview exam={view.monthlyExam} month={monthly} navigate={actions.navigate} /> : null}
    <section className="card learner-summary-card learner-summary-card--profile" style={{ marginTop: 12 }} aria-label="Hồ sơ và đánh giá đầu vào">
      <div className="row between" style={{ gap: 12, alignItems: "flex-start", flexWrap: "wrap" }}>
        <div><div className="eyebrow">Thông tin của bạn</div><h3 style={{ margin: "2px 0 4px" }}>Hồ sơ và đánh giá đầu vào</h3><p className="small muted" style={{ margin: 0 }}>Trình độ đã duyệt: <b>{view.learner.cefr}</b>. Kết quả đầu vào và hồ sơ vẫn xem được khi lộ trình tháng đang chuẩn bị.</p></div>
        <div className="row learner-summary-actions" style={{ flexWrap: "wrap" }}>
          <AppLink className="btn" href="/profile" navigate={actions.navigate}>Hồ sơ học tập & đầu vào</AppLink>
          {!monthly && !monthlyPreparation ? <AppLink className="btn" href="/survey" navigate={actions.navigate}>Khảo sát cuối pilot</AppLink> : null}
        </div>
      </div>
    </section>
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
    const reviewGate = next.lock.reason === "review";
    const reviewLabel = next.lock.reviewWeekNumber ? `bài ôn tuần ${next.lock.reviewWeekNumber}` : "bài ôn tuần trước";
    return <section className="hero" style={{ background: "var(--mint)", color: "var(--text)" }} data-home-block="primary"><div className="eyebrow">{period}</div><h2>{dateLocked ? next.lock.opensAt ? `Bài này mở vào ${formatLessonDate(next.lock.opensAt)}` : "Bài này chưa mở" : reviewGate ? `Hoàn thành ${reviewLabel} để mở bài này` : "Học bù bài trước đã nhé"}</h2><p>{dateLocked ? "Chưa đến ngày học nên chưa có nút học bài này." : reviewGate ? "Bài đầu tuần mới chỉ mở khi đã xong bài ôn của tuần trước." : "Hoàn thành bài trước để mở bài này."}</p>{!dateLocked && blocker ? <AppLink className="btn btn-primary" href={`/lesson/${blocker.id}`} navigate={actions.navigate}>{reviewGate ? `Làm ${reviewLabel}` : `Học bài ${monthly ? blocker.dayNumber : `T${blocker.dayNumber + 1}`} ngay`}</AppLink> : null}</section>;
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
  if (lock.reason === "review") return `Chưa mở · xong bài ôn tuần ${lock.reviewWeekNumber ?? "trước"} trước`;
  return `Chưa mở${lock.blocker ? ` · xong T${lock.blocker.dayNumber + 1} trước` : " · xong bài trước"}`;
}

function formatLessonDate(value: string) {
  const date = new Date(`${value.slice(0, 10)}T00:00:00Z`);
  if (!Number.isFinite(date.getTime())) return value;
  const formatted = new Intl.DateTimeFormat("vi-VN", { weekday: "long", day: "numeric", month: "numeric", year: "numeric" }).format(date);
  return formatted.charAt(0).toLocaleUpperCase("vi-VN") + formatted.slice(1);
}

function formatShortDate(value: string) {
  const date = new Date(`${value.slice(0, 10)}T00:00:00Z`);
  if (!Number.isFinite(date.getTime())) return value;
  return new Intl.DateTimeFormat("vi-VN", { day: "2-digit", month: "2-digit" }).format(date);
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
  const opened = status === "completed" || status === "ready";
  return <article className="stat" aria-label="Bài thi tháng"><div className="ring" style={{ "--p": opened ? 100 : 0, "--c": opened ? "var(--olive)" : "var(--butter)" } as CSSProperties}><b>{status === "completed" ? "✓" : status === "ready" ? "Mở" : "Chờ"}</b></div><span className="lbl">Bài thi tháng</span><small className="metric-secondary">{label}</small></article>;
}

/** Uses the dated, approved month plan — never the generic weekday strip. */
function MonthlyRhythm({ lessons, scheduled, lessonMinutes, goal }: { lessons: LearnerHomeView["lessons"]; scheduled?: number | undefined; lessonMinutes: number; goal?: string | null | undefined }) {
  const sessions = lessons.filter((lesson) => lesson.lessonDate).sort((a, b) => a.lessonDate!.localeCompare(b.lessonDate!));
  const total = scheduled ?? sessions.length;
  return <section className="card soft" style={{ marginTop: 16, background: "var(--butter)" }} data-home-block="attendance" aria-label="Nhịp học tháng này">
    <div className="row between" style={{ gap: 12, flexWrap: "wrap" }}><h3>Nhịp học tháng này</h3><strong>{total} buổi theo kế hoạch</strong></div>
    <ol style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(118px, 1fr))", gap: 8, margin: "12px 0 0", padding: 0, listStyle: "none" }}>
      {sessions.map((lesson) => <li key={lesson.id} className="card flat" style={{ padding: "8px 10px", background: "var(--surface)" }}><b>{lesson.kind === "review" ? "Ôn tập" : `Bài ${lesson.dayNumber}`}</b><span className="small muted" style={{ display: "block" }}>{formatShortDate(lesson.lessonDate!)}</span></li>)}
    </ol>
    {!sessions.length ? <p className="small muted" style={{ marginBottom: 0 }}>Đang chờ lịch có ngày học cụ thể.</p> : null}
    <p className="xs muted attendance-schedule-note">Mỗi buổi ≥{lessonMinutes} phút. {goal ?? ""}</p>
  </section>;
}

function MonthlyExamOverview({ exam, month, navigate }: { exam: NonNullable<LearnerHomeView["monthlyExam"]>; month: LearnerHomeView["month"] | null; navigate: LearnerCallbacks["navigate"] }) {
  return <section className="card learner-summary-card learner-summary-card--monthly" data-home-block="monthly-exam" aria-label="Bài thi tháng" style={{ marginTop: 0, marginBottom: 20 }}>
    <div className="row between learner-summary-row" style={{ gap: 12, alignItems: "flex-start", flexWrap: "wrap" }}><div><div className="eyebrow">Bài tháng</div><h3 style={{ margin: "2px 0 4px" }}>Bài thi tháng</h3><p className="small muted" style={{ margin: 0 }}>{exam.requirement}{month ? ` · Ngày thi ${formatLessonDate(month.examDate)}` : ""}</p></div><div className="row learner-summary-actions"><AppLink className="btn" href="/monthly" navigate={navigate}>Xem điều kiện và bài thi tháng</AppLink></div></div>
  </section>;
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
      {eligibility ? <MonthlyEligibilitySummary eligibility={eligibility} actions={actions} /> : <p className="monthly-assessment-inline-note">Điều kiện điểm danh đang được tải từ hệ thống.</p>}
      <div className="monthly-assessment-form-state" aria-label="Trạng thái form đề">
        <div><b>{exam?.status === "ready" ? "Bạn có thể vào đề" : exam?.status === "completed" ? "Bạn đã hoàn thành bài thi tháng" : "Form đề đang được chuẩn bị"}</b><span>{exam?.status === "ready" ? "Kiểm tra lại tai nghe và micro trước khi bắt đầu." : exam?.status === "completed" ? "Kết quả được lưu trong hồ sơ của bạn." : "Cấu trúc, audio và nút vào đề sẽ chỉ hiện sau khi Operator phát hành form."}</span></div>
        {exam?.status === "ready" ? <AppLink className="btn btn-primary" href="/test/monthly" navigate={actions.navigate}>Vào bài thi</AppLink> : null}
      </div>
    </section>
  </div>;
}

function MonthlyEligibilitySummary({ eligibility, actions }: { eligibility: NonNullable<LearnerHomeView["monthlyEligibility"]>; actions: LearnerCallbacks }) {
  const [complaints, setComplaints] = useState<LearnerComplaintView[]>([]);
  const [complaintReason, setComplaintReason] = useState("");
  const [complaintError, setComplaintError] = useState("");
  const [submittingComplaint, setSubmittingComplaint] = useState(false);
  useEffect(() => { void actions.getComplaints?.().then((result) => setComplaints(result.complaints)).catch(() => undefined); }, [actions.getComplaints]);
  const remaining = Math.max(0, daysUntil(eligibility.systemDate, eligibility.examDate));
  const appealRequired = eligibility.accessState === "appeal_required";
  const openToday = eligibility.accessEligible ?? eligibility.accessState === "eligible";
  const missingLearningGate = eligibility.formPublished === false;
  const state = appealRequired
    ? { label: "Cần kháng nghị", tone: "warn", copy: "Số ngày vắng đã vượt giới hạn." }
    : openToday
      ? { label: "Đủ điều kiện", tone: "ok", copy: "Đã đến ngày thi." }
      : missingLearningGate
        ? { label: "Chưa có đề", tone: "warn", copy: "Đề cố định sẽ mở sau khi được phát hành cho trình độ của bạn." }
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
    <details className="monthly-eligibility-rules"><summary>Quy tắc điểm danh và giờ vào đề</summary><ul><li>Bài thi tháng cố định dành cho mọi học viên cùng trình độ, kể cả khi chưa hoàn thành hết bài học.</li><li>Hoàn thành ít nhất một bài trong ngày để được tính một lần điểm danh; học bù nhiều bài cùng ngày vẫn chỉ tính một lần.</li><li>Ngày học hiệu lực là Thứ Hai–Thứ Sáu, không tính ngày thi; được vắng tối đa {eligibility.maxAbsences} ngày.</li><li>Đề mở trong cửa sổ hệ thống sau khi form được phát hành; chỉ số bài học và Season dùng để theo dõi tiến độ.</li>{appealRequired ? <li>Gửi khiếu nại tới Quản lý để được xem xét điều kiện dự thi.</li> : null}</ul></details>
    {appealRequired ? <section className="card monthly-complaint-form"><h3>Khiếu nại điều kiện dự thi</h3><p className="small muted">Quản lý sẽ phản hồi trong 24 giờ. Nếu chưa xử lý đúng hạn, đơn sẽ được tự duyệt.</p>{complaints.filter((item) => item.kind === "exam_eligibility").map((item) => <p className="small" key={item.id}>Đơn gần nhất: {item.status === "pending" ? "Đang chờ xử lý" : item.status === "auto_approved" || item.status === "approved" ? `Đã duyệt${item.resolution ? ` · ${item.resolution}` : ""}` : `Bị từ chối${item.resolution ? ` · ${item.resolution}` : ""}`}</p>)}{complaintError ? <p role="alert" className="small danger-text">{complaintError}</p> : null}<label>Lý do<textarea value={complaintReason} maxLength={2000} onChange={(event) => setComplaintReason(event.target.value)} /></label><button className="btn-sm btn-primary" type="button" disabled={submittingComplaint || !complaintReason.trim() || complaints.some((item) => item.kind === "exam_eligibility" && item.status === "pending")} onClick={() => { const submit = actions.submitComplaint; if (!submit) return; setSubmittingComplaint(true); setComplaintError(""); void submit("exam_eligibility", complaintReason.trim()).then(() => { setComplaintReason(""); return actions.getComplaints?.(); }).then((result) => { if (result) setComplaints(result.complaints); }).catch(() => setComplaintError("Không gửi được khiếu nại. Hãy thử lại sau.")).finally(() => setSubmittingComplaint(false)); }}>Gửi khiếu nại</button></section> : null}
  </div>;
}
function daysUntil(systemDate: string, examDate: string) {
  const start = new Date(`${systemDate.slice(0, 10)}T00:00:00Z`).getTime(); const end = new Date(`${examDate.slice(0, 10)}T00:00:00Z`).getTime();
  return Number.isFinite(start) && Number.isFinite(end) ? Math.max(0, Math.ceil((end - start) / 86_400_000)) : 0;
}
function Metric({ label, secondary, value, pending, percent, color = "var(--olive)" }: { label: string; secondary?: string | undefined; value?: string; pending?: string; percent: number; color?: string }) {
  return <article className={`stat${pending ? " is-pending" : ""}`}>{pending ? <div className="metric-pending" role="status">{pending}</div> : <div className="ring" style={{ "--p": percent, "--c": color } as CSSProperties}><b>{value}</b></div>}<span className="lbl">{label}</span>{secondary ? <small className="metric-secondary" style={{ display: "block" }}>{secondary}</small> : null}</article>;
}

function ratio(value: number, total: number) { return total > 0 ? Math.max(0, Math.min(100, Math.round(value / total * 100))) : 0; }

function pilotPhaseLabel(phase: LearnerHomeView["weekPhase"]) {
  return phase === "before_pilot" ? "Pilot sắp bắt đầu" : phase === "after_pilot" ? "Pilot đã kết thúc" : "Đang trong giai đoạn pilot";
}





