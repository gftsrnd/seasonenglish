import { useEffect, useRef, useState, type CSSProperties, type KeyboardEvent as ReactKeyboardEvent } from "react";
import { Check, Circle, Clock3, LockKeyhole, MessageCircle, PenLine, Play, Sprout } from "lucide-react";
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
  const showLifecycle = Boolean(
    view.monthlyGoal
      || (view.levelUpPhase && view.levelUpPhase !== "none")
      || (view.rewardAnnouncement && view.rewardAnnouncement.kind !== "normal")
  );
  return <div className="app-learner-page home-page" style={{ width: "100%", maxWidth: 960, minWidth: 0, boxSizing: "border-box" }}>
    <PageTitle eyebrow={view.month ? `${weekdayLabel()} · ${view.month.label} · Bài ${view.month.completedLessons}/${view.month.lessonCount}` : `${weekdayLabel()} · ${view.program?.cycleNumber ? `Chu kỳ ${view.program.cycleNumber} · ` : ""}Tuần ${view.week?.weekNumber ?? "—"}/${view.program?.weekCount ?? "—"}`} title={`Chào ${view.learner.displayName}!`} aside={<span className={`badge lvl lvl-${view.learner.cefr}`}>Trình độ {view.learner.cefr}</span>} />
    <div className="bao-row" style={{ marginBottom: 16 }} aria-label="Lời chào của Season"><div className="bubble home-today-heading" style={{ flex: 1 }}>Hôm nay học gì nào?</div></div>
    {view.month?.seasonOnly ? <Notice tone="warn">{seasonOnlyMessage(view.month)}</Notice> : null}
    {view.inactivityReminder ? <Notice tone="warn"><b>Bạn đã nghỉ học {view.inactivityReminder.inactiveDays} ngày.</b> Học bù bài gần nhất để nối lại nhịp học nhé.</Notice> : null}
    {!view.aiAvailable && view.aiAvailable !== undefined ? <Notice tone="warn">AI chưa kết nối (chưa có API key). Bạn vẫn làm test và học bài đã duyệt; báo người vận hành để bật AI coach.</Notice> : null}
    {showLifecycle ? <section className="card home-lifecycle home-lifecycle-card" data-home-block="lifecycle" aria-label="Trạng thái pilot"><div className="row between"><div><div className="eyebrow">Trạng thái chương trình</div><h3>{pilotPhaseLabel(view.weekPhase)}</h3></div>{view.levelUpPhase && view.levelUpPhase !== "none" ? <span className="badge warn">Đang theo dõi lên mức</span> : null}</div>{view.monthlyGoal ? <p className="small" style={{ marginBottom: 0 }}><b>Mục tiêu tháng:</b> {view.monthlyGoal}</p> : null}</section> : null}
    <PrimaryLesson view={view} next={next} actions={actions} />
    <section className="stats" data-home-block="metrics" aria-label="Tiến độ hiện tại">
      <Metric label={view.month ? "Bài tháng này" : "Bài tuần này"} value={`${view.metrics.completedLessons}/${view.metrics.totalLessons}`} percent={ratio(view.metrics.completedLessons, view.metrics.totalLessons)} />
      <Metric label="Ngày học (T2–T6)" value={`${Math.min(view.metrics.studyDays, view.schedule.daysPerWeek)}/${view.schedule.daysPerWeek}`} percent={ratio(view.metrics.studyDays, view.schedule.daysPerWeek)} color="var(--butter)" />
      <Metric label="Ngày liên tiếp" value={String(view.metrics.streakDays)} percent={view.metrics.streakDays > 0 ? 100 : 0} color="var(--peach)" />
      <AppLink className="stat home-points-stat" href="/profile" navigate={actions.navigate} title="Xem huy hiệu và cách tính điểm"><div className="ring" style={{ "--p": 100, "--c": "var(--surface)" } as CSSProperties}><b>★</b></div><span className="lbl">{view.metrics.points} điểm</span></AppLink>
    </section>
    {view.lessons.length ? <section className="card" style={{ marginTop: 16, minWidth: 0, boxSizing: "border-box" }} data-home-block="week-path" aria-labelledby="week-path-title"><div className="row between"><h3 id="week-path-title">{view.month ? `Lộ trình ${view.month.label}` : `Lộ trình tuần ${view.week?.weekNumber ?? ""}`}</h3><span className="small muted">{view.month ? `${view.month.lessonCount} bài · T2–T6 · học tuần tự, học bù được` : "T2–T6 · mỗi ngày một bài"}</span></div>
      <ol className="path home-week-axis" aria-label="Lộ trình tuần" style={{ display: "grid", gridTemplateColumns: `repeat(${Math.max(view.lessons.length, 1)}, minmax(0, 1fr))`, gap: 12, alignItems: "start", margin: "12px 0 0", padding: 0, minWidth: 0, width: "100%" }}>{view.lessons.map((lesson) => {
        const lock = lesson.lock ?? null;
        const lockLabel = lock ? lessonLockLabel(lock) : "";
        const timingLabel = lessonTimingLabel(view, lesson);
        const linkClass = lesson.status === "completed" ? "done" : lock ? "locked" : lesson.status === "in_progress" ? "today" : undefined;
        return <li key={lesson.id} data-state={lesson.status} data-lock-reason={lock?.reason ?? undefined} style={{ minWidth: 0, position: "relative", zIndex: 1 }}>
          <AppLink
            href={`/lesson/${lesson.id}`}
            navigate={actions.navigate}
            disabled={Boolean(lock)}
            className={linkClass}
            ariaLabel={`${lessonDayLabel(view, lesson)}${timingLabel ? ` · ${timingLabel}` : ""} · ${lesson.title}${lock ? ` · ${lockLabel}` : ""}`}
            title={lock ? `${lesson.title} – ${lock.reason === "date" ? "chưa đến ngày mở" : "mở sau khi xong bài trước"}` : undefined}
          >
            <span className="node" style={{ display: "grid", placeItems: "center", position: "relative", zIndex: 1 }}>{lesson.status === "completed" ? <Check className="status-icon" aria-hidden="true" /> : lock ? <LockKeyhole className="status-icon" aria-hidden="true" /> : lesson.status === "in_progress" ? <Play className="status-icon" aria-hidden="true" fill="currentColor" /> : <span aria-hidden="true">{lesson.dayNumber}</span>}</span>
            <span className="d">{lessonDayLabel(view, lesson)}{timingLabel ? ` · ${timingLabel}` : ""}</span>
            <span className="ttl">{lesson.title}</span>
          </AppLink>
        </li>;
      })}</ol>
    </section> : null}
    {view.month ? <MonthAttendance month={view.month} actions={actions} /> : <section className="card" style={{ marginTop: 16 }} data-home-block="attendance" aria-label="Điểm danh tuần này"><div className="row between"><h3>Điểm danh tuần này</h3><strong>{view.schedule.days.filter((day) => day.status === "attended").length}/{view.schedule.daysPerWeek} ngày</strong></div><ol className="days home-week-axis" style={{ display: "grid", gridTemplateColumns: `repeat(${Math.max(view.schedule.days.length, 1)}, minmax(0, 1fr))`, gap: 12, alignItems: "start", margin: "12px 0 0", padding: 0, minWidth: 0, width: "100%" }}> {view.schedule.days.map((day) => <li className="day" data-status={day.status} key={day.date}><span>{day.label}</span><i className={day.status === "attended" ? "on" : day.status === "missed" ? "miss" : day.status}>{day.status === "attended" ? <Check className="status-icon" aria-label="Đã học" /> : day.status === "today" ? <Circle className="status-icon" aria-label="Hôm nay" fill="currentColor" /> : day.status === "missed" ? <span className="sr-only">Đã bỏ lỡ</span> : <Circle className="status-icon" aria-label="Chưa học" />}</i></li>)}</ol><p className="xs muted attendance-schedule-note">Lịch cố định {view.schedule.daysPerWeek} ngày/tuần (T2–T6), 1 bài/ngày, ≥{view.schedule.lessonMinutes} phút. {view.monthlyGoal ?? ""}</p></section>}
    <section className="grid cols-2" style={{ marginTop: 16, alignItems: "stretch", gridAutoRows: "1fr", minWidth: 0 }} data-home-block="activities" aria-label="Hoạt động tuần">
      <AppLink className={`tile ${(view.coach.turnsToday ?? 0) > 0 ? "mint" : "peach"}`} style={{ height: "100%", minWidth: 0, boxSizing: "border-box" }} href="/coach" navigate={actions.navigate}><ActivityIcon kind="chat" /><span className="t">Luyện với Season</span><span className="s">{(view.coach.turnsToday ?? 0) > 0 ? `Đã luyện hôm nay ✓ (${view.coach.turnsToday} lượt)${view.coach.turnsThisWeek >= view.coach.targetTurns ? ` · tuần ${view.coach.turnsThisWeek} lượt` : ""}` : view.coach.turnsThisWeek >= view.coach.targetTurns ? `Đã đạt mục tiêu tuần ✓ (${view.coach.turnsThisWeek} lượt)` : `Mục tiêu tuần: đã luyện ${view.coach.turnsThisWeek}/${view.coach.targetTurns} lượt`}</span></AppLink>
      <AppLink className="tile butter" style={{ height: "100%", minWidth: 0, boxSizing: "border-box" }} href="/exam" navigate={actions.navigate}><ActivityIcon kind="pen" />{examBadge(view.month)}<span className="t">Bài thi tháng</span><span className="s">{examDetail(view.month)}</span></AppLink>
    </section>
    <Readiness view={view} actions={actions} />
    <section className="card" style={{ marginTop: 12 }} aria-label="Hồ sơ, phần thưởng và khảo sát">
      <h3 style={{ marginTop: 0 }}>Thông tin của bạn</h3>
      <div className="row" style={{ flexWrap: "wrap" }}>
        <AppLink className="btn" href="/profile" navigate={actions.navigate}>Hồ sơ học tập</AppLink>
        <AppLink className="btn" href="/profile" navigate={actions.navigate}>Phần thưởng</AppLink>
        <AppLink className="btn" href="/survey" navigate={actions.navigate}>Khảo sát cuối pilot</AppLink>
      </div>
    </section>
    {view.reward ? <section className="card home-reward" style={{ marginTop: 16 }} data-home-block="reward" aria-label="Mùa học hiện tại"><div className="row between"><div><div className="eyebrow">Mùa học</div><h2>{view.reward.seasonName}</h2></div><strong>{view.reward.points} điểm</strong></div>{view.reward.nextPoints !== null ? <p className="small muted" style={{ marginBottom: 0 }}>Còn {Math.max(0, view.reward.nextPoints - view.reward.points)} điểm để mở cấp tiếp theo.</p> : <p className="small muted" style={{ marginBottom: 0 }}>Bạn đã đạt cấp cao nhất của chương trình.</p>}</section> : null}
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
  if (!next && (!view.week || !view.lessons.length)) return <section className="card" data-home-block="primary"><h2>{view.week ? view.week.topic ? `Tuần ${view.week.weekNumber}: ${view.week.topic}` : `Tuần ${view.week.weekNumber} chưa có bài` : "Tuần này chưa có bài"}</h2><p>{view.week?.topic ? `Bộ bài mức ${view.learner.cefr ?? "—"} đang được chuẩn bị và duyệt. Quay lại sau nhé, hoặc luyện với Season trước.` : "Người vận hành chưa đặt chủ đề tuần. Bạn có thể luyện với Season trong lúc chờ."}</p></section>;
  if (!next) return <section className="hero" style={{ background: "var(--mint)", color: "var(--text)" }} data-home-block="primary"><div className="eyebrow">{view.month ? view.month.label : `Tuần ${view.week?.weekNumber ?? "—"}`}</div><h2>Xong hết {view.lessons.length} bài rồi!</h2><p>Ôn lại bài hoặc luyện thêm với Season nhé.</p></section>;
  if (next.lock) {
    const blocker = next.lock.blocker;
    const dateLocked = next.lock.reason === "date";
    return <section className="hero" style={{ background: "var(--mint)", color: "var(--text)" }} data-home-block="primary"><div className="eyebrow">{view.month ? view.month.label : `Tuần ${view.week?.weekNumber ?? "—"}`}</div><h2>{dateLocked ? next.lock.opensAt ? `Bài này mở vào ${formatLessonDate(next.lock.opensAt)}` : "Bài này chưa mở" : "Học bù bài trước đã nhé"}</h2><p>{dateLocked ? "Chưa đến ngày học nên chưa có nút học bài này." : "Hoàn thành bài trước để mở bài này."}</p>{!dateLocked && blocker ? <AppLink className="btn btn-primary" href={`/lesson/${blocker.id}`} navigate={actions.navigate}>Học bài T{blocker.dayNumber + 1} ngay</AppLink> : null}</section>;
  }
  const catchUp = isCatchUp(view, next);
  return <section className={`hero home-primary-lesson${catchUp ? " home-primary-lesson--catch-up" : ""}`} data-home-block="primary"><div><div className="eyebrow">{catchUp ? "Bài học bù" : "Bài hôm nay"} · T{next.dayNumber + 1} · Tuần {view.week?.weekNumber ?? "—"}</div><h2>{catchUp ? "Học bù bài trước đã nhé" : next.title}</h2>{catchUp ? <p style={{ margin: 0 }}>Hoàn thành bài T{next.dayNumber + 1}: {next.title}</p> : view.week?.topic ? <div style={{ fontWeight: 700 }}>{view.week.topic}</div> : null}</div><div className="row" style={{ gap: 14, fontWeight: 800, fontSize: ".9rem" }}><span className="row" style={{ gap: 6 }}><ClockIcon /> {view.schedule.lessonMinutes} phút</span><span>Bài {next.dayNumber}/{view.lessons.length}</span></div><AppLink className="btn btn-primary btn-lg btn-block" href={`/lesson/${next.id}`} navigate={actions.navigate}>{catchUp ? `Học bài T${next.dayNumber + 1} ngay` : "Học ngay"}</AppLink></section>;
}

function lessonTimingLabel(view: LearnerHomeView, lesson: LearnerHomeView["lessons"][number]) {
  if (lesson.status === "completed" || lesson.lock) return "";
  if (view.month) {
    const monthLesson = view.month.lessons.find((item) => item.id === lesson.id);
    if (!monthLesson) return "";
    if (monthLesson.date === view.month.today) return lesson.status === "in_progress" ? "hôm nay" : "";
    return monthLesson.date < view.month.today ? "học bù" : "";
  }
  const todayLabel = view.schedule.days.find((day) => day.status === "today")?.label;
  if (lesson.status === "in_progress") return todayLabel === `T${lesson.dayNumber + 1}` ? "hôm nay" : "học bù";
  return view.schedule.days.find((day) => day.label === `T${lesson.dayNumber + 1}`)?.status === "missed" ? "học bù" : "";
}

function isCatchUp(view: LearnerHomeView, next: LearnerHomeView["nextLesson"]) {
  if (!next) return false;
  return lessonTimingLabel(view, next) === "học bù";
}

function ActivityIcon({ kind }: { kind: "chat" | "pen" }) {
  const Icon = kind === "chat" ? MessageCircle : PenLine;
  return <Icon size={24} strokeWidth={2.5} aria-hidden="true" focusable="false" />;
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

function Metric({ label, value, percent, color = "var(--olive)" }: { label: string; value: string; percent: number; color?: string }) {
  return <article className="stat"><div className="ring" style={{ "--p": percent, "--c": color } as CSSProperties}><b>{value}</b></div><span className="lbl">{label}</span></article>;
}

function ratio(value: number, total: number) { return total > 0 ? Math.max(0, Math.min(100, Math.round(value / total * 100))) : 0; }

function pilotPhaseLabel(phase: LearnerHomeView["weekPhase"]) {
  return phase === "before_pilot" ? "Pilot sắp bắt đầu" : phase === "after_pilot" ? "Pilot đã kết thúc" : "Đang trong giai đoạn pilot";
}

function practiceStatusLabel(status: LearnerHomeView["practice"]["status"]) {
  return status === "open" ? "Đang mở" : status === "draft" ? "Bản nháp" : status === "submitted" ? "Đã nộp" : "Đã chấm";
}

function weekdayLabel() {
  const value = new Intl.DateTimeFormat("vi-VN", { weekday: "long" }).format(new Date());
  return value.charAt(0).toLocaleUpperCase("vi-VN") + value.slice(1);
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
    <div className="row between" style={{ alignItems: "baseline" }}><h3>{title}</h3><span className="small muted" style={{ fontWeight: 800 }}>{view.levelReadiness.windowDays} ngày gần nhất</span></div>
    {levelStatus ? <p className="small muted" style={{ margin: "4px 0 0" }}>{levelStatus}</p> : null}
    {view.levelReadiness.criteria.map((metric) => <div className="readiness-metric" data-readiness-key={metric.key} key={metric.key}><div className="small readiness-heading"><span className="readiness-label">{metric.label}</span><span className="readiness-current">{readinessCurrent(metric)}</span></div><ReadinessBar metric={metric} /><div className="readiness-actual small muted">{metric.display}</div></div>)}
    {view.levelUpPhase === "testing" && target ? <div className="card flat" style={{ marginTop: 12, background: "var(--mint)" }}><b>Bài thi lên mức {target} đang dang dở.</b><div className="small" style={{ margin: "4px 0 8px" }}>Tiếp tục từ phần đang làm; bài thi vẫn theo thứ tự 4 kỹ năng.</div><AppLink className="btn btn-primary" href="/test/level-up" navigate={actions.navigate}>Tiếp tục bài thi</AppLink></div> : null}
    {view.levelUpPhase === "challenge" && target ? <div className="card flat" style={{ marginTop: 12, background: "var(--mint)" }}><b>Bạn đã qua bài thi lên mức {target}.</b><div className="small" style={{ margin: "4px 0 8px" }}>Hoàn thành 6 lượt thử thách với Season để gửi yêu cầu duyệt mức.</div><AppLink className="btn btn-primary" href="/challenge" navigate={actions.navigate}>Mở thử thách</AppLink></div> : null}
    {(!view.levelUpPhase || view.levelUpPhase === "eligible") && view.levelReadiness.eligible && view.levelReadiness.examAvailable && target ? <div className="card flat" style={{ marginTop: 12, background: "var(--mint)" }}><b>Bạn đủ điều kiện thi lên mức {target}.</b><div className="small" style={{ margin: "4px 0 8px" }}>Đề ngắn (≈35 phút, 4 phần), rồi 6 lượt thử thách với Season. Chuẩn bị tai nghe và micro như bài đầu vào.</div><AppLink className="btn btn-primary" href="/test/level-up" navigate={actions.navigate}>Thi lên mức</AppLink></div> : null}
    {view.levelUpPhase === "eligible" && !view.levelReadiness.examAvailable && target ? <Notice tone="info">Bạn đã đủ điều kiện thi lên mức {target}; đề sẽ mở ngay khi được vận hành duyệt.</Notice> : null}
    <p className="xs muted" style={{ margin: "10px 0 0" }}>{target ? view.levelReadiness.eligible ? "Đủ cả 4 mục – được thi lên mức khi đề được duyệt." : "Đủ cả 4 mục để thi lên mức." : "Giữ nhịp học để duy trì mức C1."}</p>
  </section>;
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



function lessonDayLabel(view: LearnerHomeView, lesson: LearnerHomeView["lessons"][number]): string {
  if (!view.month) return `T${lesson.dayNumber + 1}`;
  const monthLesson = view.month.lessons.find((item) => item.id === lesson.id);
  const date = monthLesson?.date ? `${monthLesson.date.slice(8, 10)}/${monthLesson.date.slice(5, 7)}` : "";
  return `Bài ${lesson.dayNumber}${date ? ` · ${date}` : ""}`;
}

function formatMonthDate(value: string | null | undefined): string {
  if (!value) return "—";
  return `${value.slice(8, 10)}/${value.slice(5, 7)}/${value.slice(0, 4)}`;
}

function seasonOnlyMessage(month: NonNullable<LearnerHomeView["month"]>): string {
  if (month.seasonOnlyReason === "waiting_next_month") return `Bạn sẽ bắt đầu học từ ngày ${formatMonthDate(month.enrollment?.startsOn)}. Trong lúc chờ, hãy luyện với Season (chủ đề ngẫu nhiên) và chơi mini game với từ khoá tự nhập.`;
  if (month.seasonOnlyReason === "locked_missed_exam") return "Bạn chưa làm bài thi tháng trước nên bài học tháng này đang khoá. Hãy gửi báo cáo xin mở cho Quản lý; trong lúc chờ bạn vẫn luyện được với Season và mini game.";
  return `Nội dung ${month.label} cho trình độ ${month.cefr ?? ""} chưa được Vận hành duyệt đủ. Bạn luyện với Season (chủ đề ngẫu nhiên) và mini game với từ khoá tự nhập cho tới khi bài học mở.`;
}

function examBadge(month: LearnerHomeView["month"]) {
  if (!month) return <><LockKeyhole className="status-icon" aria-hidden="true" /><span className="badge warn">Chưa có</span></>;
  const exam = month.exam;
  if (exam.attemptStatus !== "none" && exam.attemptStatus !== "in_progress") return <span className="badge ok">Đã nộp</span>;
  if (exam.canStart) return <span className="badge ok">Đang mở</span>;
  if (exam.blockedReason === "not_eligible") return <span className="badge warn">Chưa đủ điều kiện</span>;
  if (exam.blockedReason === "locked") return <span className="badge warn">Đã khoá</span>;
  return <span className="badge">{month.attendance.eligible ? "Đủ điều kiện" : "Theo dõi điểm danh"}</span>;
}

function examDetail(month: LearnerHomeView["month"]): string {
  if (!month) return "Hoàn thành bài kiểm tra đầu vào và chờ duyệt mức để có lịch thi tháng.";
  const attendance = month.attendance;
  return `Thi ngày ${formatMonthDate(month.exam.date)} · điểm danh ${attendance.attendedDays}/${attendance.effectiveDays} · vắng ${attendance.absentDays}/${attendance.maxAbsences}`;
}

function MonthAttendance({ month, actions }: { month: NonNullable<LearnerHomeView["month"]>; actions: LearnerCallbacks }) {
  const attendance = month.attendance;
  return <section className="card" style={{ marginTop: 16 }} data-home-block="attendance" aria-label="Điểm danh tháng này">
    <div className="row between"><h3>Điểm danh {month.label}</h3><span className={`badge ${attendance.eligible ? "ok" : "warn"}`}>{attendance.eligible ? "Đủ điều kiện thi" : "Chưa đủ điều kiện"}</span></div>
    <div className="grid cols-3" style={{ marginTop: 8 }}>
      <div className="stat"><b>{attendance.attendedDays}/{attendance.effectiveDays}</b><span className="small muted">ngày điểm danh</span></div>
      <div className="stat"><b style={attendance.absentDays > attendance.maxAbsences ? { color: "var(--danger, #b42318)" } : undefined}>{attendance.absentDays}/{attendance.maxAbsences}</b><span className="small muted">ngày vắng / tối đa</span></div>
      <div className="stat"><b>{month.coach.turnsThisMonth}/{month.coach.monthlyTarget}</b><span className="small muted">lượt Season tháng này</span></div>
    </div>
    <p className="small muted" style={{ margin: "8px 0 0" }}>Một ngày điểm danh = ngày học T2–T6 có hoàn thành ít nhất một bài; học bù nhiều bài trong một ngày vẫn tính một ngày. <AppLink href="/exam" navigate={actions.navigate}>Xem báo cáo và bài thi tháng →</AppLink></p>
  </section>;
}
