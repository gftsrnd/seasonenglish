import { RequestEvidenceFields, requestEvidenceArgs, type RequestEvidenceDraft } from "../shared/RequestEvidence.js";
import { useEffect, useRef, useState, type CSSProperties, type KeyboardEvent as ReactKeyboardEvent } from "react";
import { BookOpen, ChevronLeft, ChevronRight, Clock3, LockKeyhole, MessageCircle, Play, Sprout } from "lucide-react";
import type { LearnerHomeView, LearnerCallbacks } from "./contracts.js";
import { Notice, PageTitle, Progress, AppLink, LearnerSupportCard, learnerLessonLabel, learnerLessonPhrase } from "./ui.js";
import { buildMonthlyTeachingCalendar } from "@e4s/domain/monthly";
import { LevelReadinessCard } from "./LevelReadiness.js";
import { useMediaQuery } from "../shared/useMediaQuery.js";
import type { LearnerComplaintView } from "@e4s/contracts";

export function LearnerHome({ view, actions, courseCompleted = false }: { view: LearnerHomeView; actions: LearnerCallbacks; courseCompleted?: boolean }) {
  const [celebration, setCelebration] = useState(view.rewardAnnouncement && view.rewardAnnouncement.kind !== "normal" ? view.rewardAnnouncement : null);
  const [assessmentCelebration, setAssessmentCelebration] = useState(false);
  useEffect(() => {
    setCelebration(view.rewardAnnouncement && view.rewardAnnouncement.kind !== "normal" ? view.rewardAnnouncement : null);
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
  return <div className="app-learner-page home-page" data-monthly-preparation={monthlyPreparation || !monthly || (!next && !view.lessons.length)} style={{ width: "100%", maxWidth: 960, minWidth: 0, boxSizing: "border-box" }}>
    <PageTitle eyebrow={monthly ? `Tháng ${formatMonth(monthly.month)} · ${monthly.themeTitle}` : "Lộ trình tháng đang được chuẩn bị"} title={`Chào ${view.learner.displayName}!`} aside={<span className={`badge lvl lvl-${view.learner.cefr}`}>Trình độ {view.learner.cefr}</span>} />
    <div className="bao-row" style={{ marginBottom: 16 }} aria-label="Lời chào của Season AI Coach"><div className="bubble home-today-heading" style={{ flex: 1 }}>Hôm nay học gì nào?</div></div>
    {/* Absence warnings and content updates live in the notification bell. Only the last day before the
        account lock stays on the page, as one compact line. */}
    {view.inactivityReminder && view.inactivityReminder.inactiveDays >= ABSENCE_LOCK_DAYS - 1 ? <p className="home-blocking-banner" role="alert"><b>Vắng thêm 1 ngày học sẽ bị khóa tài khoản.</b> Học bài hôm nay để giữ tài khoản.</p> : null}
    {!view.aiAvailable && view.aiAvailable !== undefined ? <Notice tone="warn">Bạn vẫn có thể học, làm bài thi và luyện với Season. Nhận xét AI đang tạm thời gián đoạn.</Notice> : null}
    <PrimaryLesson view={view} next={next} actions={actions} />
    {view.learner.cefr === "C1" && !courseCompleted ? <section className="card learner-summary-card pass-course-home-card" aria-label="Bài thi đầu ra">
      <div className="row between">
        <div><h3>Bài thi đầu ra · Pass Course</h3><p className="small muted">{view.passCourse?.status === "pending_review"
          ? "Bạn đã nộp bài. Vận hành đang chấm kết quả."
          : view.passCourse?.status === "in_progress" ? "Bài thi của bạn đang dang dở."
            : view.passCourse ? "Bạn đủ điều kiện thi. Chuẩn bị tai nghe và micro trước khi bắt đầu."
              : "Bạn đã đạt C1. Bài thi đầu ra mở khi bạn hoàn thành các điều kiện của khóa học."}</p></div>
        {view.passCourse ? <AppLink className="btn btn-primary" href="/test/pass-course" navigate={actions.navigate}>{view.passCourse.status === "in_progress" ? "Tiếp tục bài thi" : view.passCourse.status === "pending_review" ? "Xem trạng thái bài thi" : "Thi Pass Course"}</AppLink> : null}
      </div>
    </section> : null}
    {!monthlyPreparation ? <section data-home-block="metrics" aria-label="Tiến độ tháng" style={{ marginTop: 16, padding: "16px 18px", borderRadius: 18, background: "var(--mint)", border: "1px solid var(--border)" }}>
      <div><div className="eyebrow">Theo tháng</div><h2 style={{ margin: "2px 0 0" }}>Tiến độ học tập</h2></div>
      <div className="stats monthly-home-metrics" style={{ marginTop: 12 }}>
        <Metric metric="lessons" label="Bài theo lịch" value={`${view.metrics.completedLessons}/${view.metrics.totalLessons}`} percent={ratio(view.metrics.completedLessons, view.metrics.totalLessons)} />
        <Metric metric="reviews" label="Bài ôn" value={`${view.metrics.completedReviews ?? 0}/${view.metrics.totalReviews ?? 0}`} percent={ratio(view.metrics.completedReviews ?? 0, view.metrics.totalReviews ?? 0)} color="var(--primary)" />
        <HomeAttendanceMetric eligibility={view.monthlyEligibility} />
        <HomePointsMetric points={view.metrics.points} nextTier={view.metrics.nextPointsTier ?? null} />
      </div>
      {view.monthlyEligibility ? <AbsenceChip absenceDays={view.monthlyEligibility.absenceDays} maxAbsences={view.monthlyEligibility.maxAbsences} /> : null}
    </section> : null}
    {monthly ? <MonthlyCalendar month={monthly} lessons={view.lessons} actions={actions} /> : null}
    <section className="grid cols-2" style={{ marginTop: 16, alignItems: "stretch", gridAutoRows: "1fr", minWidth: 0 }} data-home-block="activities" aria-label="Hoạt động tháng">
      <AppLink className={`tile ${!monthlyPreparation && (view.coach.turnsToday ?? 0) > 0 ? "mint" : "peach"}`} style={{ height: "100%", minWidth: 0, boxSizing: "border-box" }} href="/coach" navigate={actions.navigate}><ActivityIcon /><span className="t">Season AI Coach</span><span className="s">{monthlyPreparation ? "Luyện theo trình độ đã được duyệt trong khi chờ bộ bài tháng." : `Lượt hợp lệ hôm nay ${view.coach.turnsToday ?? 0}/${view.coach.targetTurns}`}</span></AppLink>
      <AppLink className="tile mint" style={{ height: "100%", minWidth: 0, boxSizing: "border-box" }} href="/monthly" navigate={actions.navigate}><BookOpen aria-hidden="true" /><span className="t">Bài tháng</span><span className="s">{monthlyPreparation ? "Xem trạng thái chuẩn bị lộ trình tháng." : "Xem lịch bài học, bài ôn và bài thi tháng."}</span></AppLink>
    </section>
    {!monthlyPreparation && view.learner.cefr !== "C1" ? <LevelReadinessCard readiness={view.levelReadiness} phase={view.levelUpPhase} monthLabel={monthly ? formatMonth(monthly.month) : undefined} navigate={actions.navigate} className="home-readiness" /> : null}
    {view.monthlyExam ? <MonthlyExamOverview exam={view.monthlyExam} month={!view.monthlyEligibility || view.monthlyEligibility.month === monthly?.month ? monthly : null} navigate={actions.navigate} /> : null}
    <section className="card learner-summary-card learner-summary-card--profile" style={{ marginTop: 12 }} aria-label="Hồ sơ và đánh giá đầu vào">
      <div className="row between" style={{ gap: 12, alignItems: "flex-start", flexWrap: "wrap" }}>
        <div><div className="eyebrow">Thông tin của bạn</div><h3 style={{ margin: "2px 0 4px" }}>Hồ sơ và đánh giá đầu vào</h3><p className="small muted" style={{ margin: 0 }}>Trình độ đã duyệt: <b>{view.learner.cefr}</b>. {monthlyPreparation ? "Kết quả đầu vào và hồ sơ vẫn xem được khi lộ trình tháng đang chuẩn bị." : "Xem kết quả đầu vào và thông tin hồ sơ của bạn."}</p></div>
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
  const adjusted = announcement.kind === "level-adjustment";
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
    <section className="dialog wide" role="dialog" aria-modal="true" aria-label={adjusted ? "Thông báo cập nhật trình độ" : "Chúc mừng lên mức"} data-testid="modal.level-up-celebration" data-modal="level-up-celebration" tabIndex={-1} onKeyDown={handleDialogKeyDown}>
      <div className="row between"><span className={`badge ${genuine ? "ok" : ""}`}>{genuine ? "Thông báo thật" : "Mô phỏng"}</span><button ref={closeRef} type="button" aria-label="Đóng" onClick={() => void onClose()}>Đóng</button></div>
      <div className="card flat" style={{ marginTop: 12, textAlign: "center" }}><div className="eyebrow">{announcement.seasonName}</div>{adjusted ? null : <Sprout className="celebration-icon" aria-hidden="true" />}<h2>{adjusted ? "Trình độ đã được cập nhật" : isTopLevel ? "Bạn đã đạt mức cao nhất" : `Chúc mừng ${displayName}!`}</h2>{announcement.level ? <p className="badge lvl">Mức {announcement.level}</p> : null}</div>
      <p>{adjusted ? "Bài học và điều kiện thi lên mức áp dụng theo trình độ hiện tại của bạn." : isTopLevel ? "Bạn đã hoàn thành chặng CEFR cao nhất trong lộ trình hiện tại." : "Bạn vừa mở một cột mốc mới trong hành trình học tiếng Anh."}</p>
      <Notice tone="info"><b>Quy tắc công nhận:</b> {announcement.rule ?? (isTopLevel ? "Mức cao nhất được giữ lại trong hồ sơ của bạn." : "Mức mới chỉ hiển thị sau khi người vận hành duyệt bằng chứng học tập.")}</Notice>
      <div className="row" style={{ justifyContent: "flex-end", marginTop: 16 }}><button type="button" onClick={() => void onClose()}>Đóng</button><button className="btn-primary" type="button" onClick={() => void onClose()}>Tiếp tục học</button></div>
    </section>
  </div>;
}

function PrimaryLesson({ view, next, actions }: { view: LearnerHomeView; next: LearnerHomeView["nextLesson"]; actions: LearnerCallbacks }) {
  const monthly = view.month ?? null;
  if (view.monthlyStartDate) return <section className="card" data-home-block="primary"><h2>Bạn sẽ bắt đầu học từ ngày {view.monthlyStartDate.slice(8)}/{view.monthlyStartDate.slice(5, 7)}</h2><p>Bạn có thể luyện với Season và chơi mini game trong lúc chờ.</p></section>;
  if (view.monthlyLessonsLocked) return <section className="card" data-home-block="primary"><h2>Bài học tháng này bị khóa</h2><p>Bạn đã bỏ lỡ bài thi tháng trước. Hãy gửi lý do để Quản lý xem xét mở lại bài học.</p><AppLink className="btn btn-primary" href="/support?type=complaints&kind=lesson_unlock" navigate={actions.navigate}>Gửi đơn xin mở</AppLink></section>;
  if (!monthly) return <section className="card" data-home-block="primary"><h2>Lộ trình tháng đang được chuẩn bị</h2><p>Người vận hành đang chuẩn bị và duyệt bộ bài tháng cho mức {view.learner.cefr ?? "—"}. Bạn có thể luyện với Season trong lúc chờ.</p></section>;
  const period = `Tháng ${formatMonth(monthly.month)}`;
  if (!next && !view.lessons.length) return <section className="card" data-home-block="primary"><h2>{period}: {monthly.themeTitle}</h2><p>Bộ bài tháng đang được chuẩn bị và duyệt. Quay lại sau nhé.</p></section>;
  if (!next) return <section className="hero" style={{ background: "var(--mint)", color: "var(--text)" }} data-home-block="primary"><div className="eyebrow">{period}</div><h2>Xong hết {view.lessons.length} bài rồi!</h2><p>Ôn lại bài hoặc luyện thêm với Season nhé.</p></section>;
  if (next.lock) {
    const blocker = next.lock.blocker;
    const dateLocked = next.lock.reason === "date";
    const reviewGate = next.lock.reason === "review";
    const reviewLabel = next.lock.reviewWeekNumber ? `bài ôn tuần ${next.lock.reviewWeekNumber}` : "bài ôn tuần trước";
    return <section className="hero" style={{ background: "var(--mint)", color: "var(--text)" }} data-home-block="primary"><div className="eyebrow">{period}</div><h2>{dateLocked ? next.lock.opensAt ? `Bài này mở vào ${formatLessonDate(next.lock.opensAt)}` : "Bài này chưa mở" : reviewGate ? `Hoàn thành ${reviewLabel} để mở bài này` : "Học bù bài trước đã nhé"}</h2><p>{dateLocked ? "Chưa đến ngày học nên chưa có nút học bài này." : reviewGate ? "Bài đầu tuần mới chỉ mở khi đã xong bài ôn của tuần trước." : "Hoàn thành bài trước để mở bài này."}</p>{!dateLocked && blocker ? <AppLink className="btn btn-primary" href={`/lesson/${blocker.id}`} navigate={actions.navigate}>{reviewGate ? `Làm ${reviewLabel}` : `Học ${blocker.label ? learnerLessonPhrase(blocker.label) : monthly ? `bài ${blocker.dayNumber}` : `bài T${blocker.dayNumber + 1}`} ngay`}</AppLink> : null}</section>;
  }
  const catchUp = isCatchUp(view, next);
  return <section className={`hero home-primary-lesson${catchUp ? " home-primary-lesson--catch-up" : ""}`} data-home-block="primary"><div><div className="eyebrow">{catchUp ? "Bài học bù" : "Bài hôm nay"} · {learnerLessonLabel(next)} · {period}</div><h2>{catchUp ? "Học bù bài trước đã nhé" : next.title}</h2>{catchUp ? <p style={{ margin: 0 }}>Hoàn thành {learnerLessonPhrase(learnerLessonLabel(next))}: {next.title}</p> : <div style={{ fontWeight: 700 }}>{monthly.themeTitle}</div>}</div><div className="row" style={{ gap: 14, fontWeight: 800, fontSize: ".9rem" }}><span className="row" style={{ gap: 6 }}><ClockIcon /> {view.schedule.lessonMinutes} phút</span><span>{view.metrics.completedLessons}/{view.metrics.totalLessons} bài đã học</span></div><AppLink className="btn btn-primary btn-lg btn-block" href={`/lesson/${next.id}`} navigate={actions.navigate}>{catchUp ? `Học ${learnerLessonPhrase(learnerLessonLabel(next))} ngay` : "Học ngay"}</AppLink></section>;
}

function lessonTimingLabel(view: LearnerHomeView, lesson: LearnerHomeView["lessons"][number]) {
  if (lesson.status === "completed" || lesson.lock) return "";
  // Monthly lessons carry their own date: "học bù" only when it is before the learner's current
  // (simulated) date. The weekday labels below assumed dayNumber = weekday, so on 01/12 the
  // December lesson 1 (a Tuesday) was shown as a make-up lesson.
  const today = view.month?.systemDate ?? view.schedule.days.find((day) => day.status === "today")?.date;
  if (lesson.lessonDate && today) return lesson.lessonDate < today ? "học bù" : lesson.lessonDate === today && lesson.status === "in_progress" ? "hôm nay" : "";
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
  return `Chưa mở${lock.blocker ? ` · xong ${lock.blocker.label ? learnerLessonPhrase(lock.blocker.label) : `T${lock.blocker.dayNumber + 1}`} trước` : " · xong bài trước"}`;
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
        {step === 1 && done ? <AppLink className="btn btn-sm" href="/onboard" navigate={actions.navigate}>← Xem / sửa hồ sơ</AppLink> : current && step < 3 ? <><AppLink className="btn btn-primary" href={step === 1 ? "/onboard" : "/test/placement"} navigate={actions.navigate}>{step === 1 ? view.onboardingDraftAvailable ? "Tiếp tục phần đã lưu" : "Điền hồ sơ (~2 phút)" : view.placementDraft ? "Tiếp tục bài test" : "Bắt đầu test (tối đa 75 phút)"}</AppLink>{step === 2 && !view.placementDraft ? <div className="onboarding-test-note" role="note"><Clock3 size={16} aria-hidden="true" /><span><b>4 phần</b><span>Nghe · Đọc · Viết · Nói</span></span><span className="onboarding-test-note-separator" aria-hidden="true">·</span><span>Tai nghe + micro</span></div> : null}</> : null}
      </div>
    </div>;
  })}</section><LearnerSupportCard from="home" navigate={actions.navigate} appeals={false} /></div>;
}

function MonthlyExamOverview({ exam, month, navigate }: { exam: NonNullable<LearnerHomeView["monthlyExam"]>; month: LearnerHomeView["month"] | null; navigate: LearnerCallbacks["navigate"] }) {
  return <section className="card learner-summary-card learner-summary-card--monthly" data-home-block="monthly-exam" aria-label="Bài thi tháng" style={{ marginTop: 0, marginBottom: 20 }}>
    <div className="row between learner-summary-row" style={{ gap: 12, alignItems: "flex-start", flexWrap: "wrap" }}><div><div className="eyebrow">Bài tháng</div><h3 style={{ margin: "2px 0 4px" }}>Bài thi tháng</h3><p className="small muted" style={{ margin: 0 }}>{exam.requirement}{month ? ` · Ngày thi ${formatLessonDate(month.examDate)}` : ""}</p></div><div className="row learner-summary-actions"><AppLink className="btn" href="/monthly" navigate={navigate}>Xem điều kiện và bài thi tháng</AppLink></div></div>
  </section>;
}

const monthlyCalendarKinds = {
  lesson: "Bài học",
  review: "Ôn tập",
  rest: "Ngày nghỉ",
  holiday: "Ngày lễ",
  exam: "Bài thi tháng"
} as const;

function MonthlyCalendar({ month, lessons, actions }: { month: NonNullable<LearnerHomeView["month"]>; lessons: LearnerHomeView["lessons"]; actions: LearnerCallbacks }) {
  const compact = useMediaQuery("(max-width: 700px)");
  const [selectedWeek, setSelectedWeek] = useState<{ month: string; index: number }>();
  const days = buildMonthlyTeachingCalendar(month.month, month.holidays);
  const first = new Date(`${month.month}-01T00:00:00Z`);
  const offset = (first.getUTCDay() + 6) % 7;
  const trailing = (7 - (offset + days.length) % 7) % 7;
  const weekdays = ["T2", "T3", "T4", "T5", "T6", "T7", "CN"];
  const gridDays = [...Array<null>(offset).fill(null), ...days, ...Array<null>(trailing).fill(null)].map((day, index) => ({
    day,
    date: day?.date ?? new Date(first.getTime() + (index - offset) * 86_400_000).toISOString().slice(0, 10),
    weekday: weekdays[index % 7]
  }));
  const lastWeek = gridDays.length / 7 - 1;
  const todayIndex = gridDays.findIndex(({ date }) => date === month.systemDate && date.startsWith(month.month));
  const week = selectedWeek?.month === month.month ? selectedWeek.index : Math.floor((todayIndex < 0 ? offset : todayIndex) / 7);
  const visibleDays = compact ? gridDays.slice(week * 7, week * 7 + 7) : gridDays;
  const shortDate = (date: string) => `${date.slice(-2)}/${date.slice(5, 7)}`;
  const dayRole = compact ? "listitem" : "gridcell";
  const byDate = new Map(lessons.filter(lesson => lesson.lessonDate).map(lesson => [lesson.lessonDate!, lesson]));
  return <section className="card learner-month-calendar-card" data-home-block="month-path" aria-labelledby="month-path-title">
    <div className="monthly-learner-calendar-header"><h3 id="month-path-title">Lịch học tháng {formatMonth(month.month)}</h3><span className="small muted">{month.themeTitle}</span></div>
    {compact ? <div className="monthly-learner-calendar-week">
      <button type="button" className="btn" aria-label="Tuần trước" disabled={week === 0} onClick={() => setSelectedWeek({ month: month.month, index: week - 1 })}><ChevronLeft size={18} aria-hidden="true" /></button>
      <strong aria-live="polite">{shortDate(visibleDays[0]!.date)} – {shortDate(visibleDays[6]!.date)}</strong>
      <button type="button" className="btn" aria-label="Tuần sau" disabled={week === lastWeek} onClick={() => setSelectedWeek({ month: month.month, index: week + 1 })}><ChevronRight size={18} aria-hidden="true" /></button>
    </div> : <ul className="monthly-learner-calendar-legend" aria-label="Chú thích lịch">
      {Object.entries(monthlyCalendarKinds).map(([kind, label]) => <li className={kind} key={kind}>{label}</li>)}
    </ul>}
    <div className={`monthly-learner-calendar${compact ? " monthly-learner-calendar--agenda" : ""}`} role={compact ? "list" : "grid"} aria-label={compact ? "Lịch học trong tuần" : `Lịch học tháng ${formatMonth(month.month)}`}>
        {!compact && weekdays.map(label => <b className="monthly-learner-calendar-heading" role="columnheader" key={label}>{label}</b>)}
        {visibleDays.map(({ day, date, weekday }) => {
          const dayLabel = <time dateTime={date}>{compact ? <span>{weekday}</span> : null}{date.slice(-2)}</time>;
          if (!day) {
            return <div className="monthly-learner-calendar-day outside-month" role={dayRole} aria-label={date} key={date}>{dayLabel}{compact && <span className="monthly-learner-calendar-label">Ngoài tháng</span>}</div>;
          }
          const lesson = byDate.get(day.date);
          const exam = day.date === month.examDate;
          const holiday = day.holiday?.name;
          const rest = !lesson && (day.kind === "weekend" || day.date > month.examDate);
          const review = (lesson?.kind ?? day.kind) === "review";
          const kind = exam ? "exam" : holiday ? "holiday" : rest ? "rest" : review ? "review" : "lesson";
          const activity = lesson ? learnerLessonLabel(lesson) : review ? "Ôn tập" : "Bài học";
          const status = lesson?.status === "completed" ? "Đã học" : lesson?.lock ? "Chưa mở" : lesson?.status === "in_progress" ? "Đang học" : lesson ? "Có thể học" : "Chưa có bài";
          return <div className={`monthly-learner-calendar-day ${kind}`} role={dayRole} aria-label={date} aria-current={date === month.systemDate ? "date" : undefined} key={date}>
            {dayLabel}
            {exam ? <AppLink href="/monthly" navigate={actions.navigate} className="monthly-learner-calendar-link">Bài thi tháng</AppLink>
              : !lesson && (rest || holiday) ? <span className="monthly-learner-calendar-label" title={holiday}>{holiday ? "Nghỉ lễ" : "Nghỉ"}</span>
                : <>
                  {lesson && !lesson.lock ? <AppLink href={`/lesson/${lesson.id}`} navigate={actions.navigate} className="monthly-learner-calendar-link" title={lesson.title}>{activity}</AppLink>
                    : <span className="monthly-learner-calendar-label" title={lesson?.lock?.message}>{activity}</span>}
                  <small>{status}</small>
                  {holiday ? <small className="monthly-learner-calendar-holiday" title={holiday}>Ngày nghỉ</small> : null}
                </>}
          </div>;
        })}
    </div>
  </section>;
}


export function LearnerMonthly({ view, actions }: { view: LearnerHomeView; actions: LearnerCallbacks }) {
  const month = view.month;
  const eligibility = view.monthlyEligibility;
  const exam = view.monthlyExam;
  const monthLabel = eligibility?.month ?? month?.month;
  const examDate = eligibility?.examDate ?? month?.examDate;
  const canStart = exam?.status === "ready";
  const publishState = exam?.inProgress ? "Đang làm bài" : exam?.status === "completed" ? "Đã hoàn thành" : eligibility?.entryClosed ? "Đã hết giờ vào thi" : exam?.status === "ready" || eligibility?.formPublished ? "Đề đã phát hành" : "Đề chưa phát hành";
  const formNote = exam?.inProgress ? "Mở lại bài thi từ vị trí đã lưu."
    : canStart ? "Chuẩn bị tai nghe và micro trước khi bắt đầu."
      : exam?.status === "completed" ? "Kết quả được lưu trong hồ sơ của bạn."
        : exam?.requirement || (eligibility?.entryClosed ? null : eligibility?.formPublished ? "Chờ đến giờ mở đề." : "Đề đang được chuẩn bị cho trình độ của bạn.");

  return <div className="app-learner-page monthly-assessment-page" style={{ width: "100%", maxWidth: 960, minWidth: 0, boxSizing: "border-box" }}>
    <PageTitle {...(monthLabel ? { eyebrow: `Tháng ${formatMonth(monthLabel)}` } : {})} title="Bài thi tháng" detail={month?.themeTitle} />
    <section className="monthly-assessment-landing" aria-label="Bài thi tháng">
      <header className="monthly-assessment-header">
        <div>
          <div className="eyebrow">Lịch thi</div>
          <h2>{examDate ? formatLessonDate(examDate) : "Đang chờ lịch thi"}</h2>
        </div>
        <span className={`badge ${exam?.status === "ready" || exam?.status === "completed" ? "ok" : "warn"}`}>{publishState}</span>
      </header>
      {formNote || canStart ? <div className="monthly-assessment-form-state" aria-label="Trạng thái đề thi">
        {formNote ? <p>{formNote}</p> : null}
        {canStart ? <AppLink className="btn btn-primary" href="/test/monthly" navigate={actions.navigate}>{exam.inProgress ? "Tiếp tục bài thi" : "Vào bài thi"}</AppLink> : null}
      </div> : null}
      {eligibility ? <MonthlyEligibilitySummary eligibility={eligibility} actions={actions} /> : <p className="monthly-assessment-inline-note">Điều kiện điểm danh đang được tải từ hệ thống.</p>}
    </section>
  </div>;
}

function MonthlyEligibilitySummary({ eligibility, actions }: { eligibility: NonNullable<LearnerHomeView["monthlyEligibility"]>; actions: LearnerCallbacks }) {
  const [complaints, setComplaints] = useState<LearnerComplaintView[]>([]);
  const [complaintReason, setComplaintReason] = useState("");
  const [complaintEvidence, setComplaintEvidence] = useState<RequestEvidenceDraft>({});
  const [complaintRevision, setComplaintRevision] = useState(0);
  const [complaintError, setComplaintError] = useState("");
  const [submittingComplaint, setSubmittingComplaint] = useState(false);
  useEffect(() => { void actions.getComplaints?.().then((result) => setComplaints(result.complaints)).catch(() => undefined); }, [actions.getComplaints]);
  const appealRequired = eligibility.accessState === "appeal_required";
  const openToday = eligibility.accessEligible ?? eligibility.accessState === "eligible";
  const state = appealRequired
    ? { label: "Cần kháng nghị", tone: "warn", copy: "Số ngày vắng đã vượt giới hạn." }
    : openToday
      ? { label: "Đủ điều kiện", tone: "ok", copy: "Đã đến ngày thi." }
      : null;
  return <section className="monthly-eligibility-summary" aria-label="Điều kiện vào bài thi tháng">
    <h3>Điều kiện dự thi</h3>
    {state ? <div className="monthly-eligibility-state"><span className={`badge ${state.tone}`}>{state.label}</span><span className="small muted">{state.copy}</span></div> : null}
    <div className="monthly-eligibility-metrics">
      <Metric label="Điểm danh" secondary={`Vắng ${eligibility.absenceDays}/${eligibility.maxAbsences}`} value={`${eligibility.attendedDays}/${eligibility.effectiveDays}`} percent={ratio(eligibility.attendedDays, eligibility.effectiveDays)} color={appealRequired ? "var(--danger)" : "var(--olive)"} />
      {(eligibility.frameworkApproved === true && (eligibility.scheduledLessons ?? 0) > 0)
        ? <Metric label="Hoàn thành lịch học" value={`${eligibility.completedLessons ?? 0}/${eligibility.scheduledLessons ?? 0}`} percent={ratio(eligibility.completedLessons ?? 0, eligibility.scheduledLessons ?? 0)} color="var(--primary)" />
        : <Metric label="Hoàn thành lịch học" pending="Chờ chốt lịch học" percent={0} color="var(--primary)" />}
      <Metric label="Season hợp lệ" value={`${eligibility.seasonTurns ?? 0}/${eligibility.seasonTurnsRequired ?? 100}`} percent={ratio(eligibility.seasonTurns ?? 0, eligibility.seasonTurnsRequired ?? 100)} color="var(--lav)" />
    </div>
    <details className="monthly-eligibility-rules"><summary>Quy tắc điểm danh và giờ vào đề</summary><ul><li>Bài thi tháng cố định dành cho mọi học viên cùng trình độ, kể cả khi chưa hoàn thành hết bài học.</li><li>Hoàn thành ít nhất một bài trong ngày để được tính một lần điểm danh; học bù nhiều bài cùng ngày vẫn chỉ tính một lần.</li><li>Ngày học hiệu lực là Thứ Hai–Thứ Sáu, không tính ngày thi; được vắng tối đa {eligibility.maxAbsences} ngày.</li><li>Đề mở trong cửa sổ hệ thống sau khi form được phát hành; chỉ số bài học và Season dùng để theo dõi tiến độ.</li>{appealRequired ? <li>Gửi khiếu nại tới Quản lý để được xem xét điều kiện dự thi.</li> : null}</ul></details>
    {appealRequired ? <section className="card monthly-complaint-form"><h3>Khiếu nại điều kiện dự thi</h3><p className="small muted">Quản lý sẽ phản hồi trong 24 giờ. Nếu chưa xử lý đúng hạn, đơn sẽ được tự duyệt.</p>{complaints.filter((item) => item.kind === "exam_eligibility" && (item.month ?? item.submittedAt.slice(0, 7)) === eligibility.month).slice(0, 1).map((item) => <p className="small" key={item.id}>Đơn gần nhất: {item.status === "pending" ? "Đang chờ xử lý" : item.status === "auto_approved" || item.status === "approved" ? `Đã duyệt${item.resolution ? ` · ${item.resolution}` : ""}` : `Bị từ chối${item.resolution ? ` · ${item.resolution}` : ""}`}</p>)}{complaintError ? <p role="alert" className="small danger-text">{complaintError}</p> : null}<RequestEvidenceFields key={complaintRevision} value={complaintEvidence} onChange={setComplaintEvidence} label="Ngày hoặc mục cần kiểm tra" placeholder="Ví dụ: Điểm danh ngày 06/11" disabled={submittingComplaint} /><label>Lý do<textarea value={complaintReason} maxLength={2000} onChange={(event) => setComplaintReason(event.target.value)} /></label><button className="btn-sm btn-primary" type="button" disabled={submittingComplaint || complaintEvidence.blocked || complaintReason.trim().length < 5 || complaints.some((item) => item.kind === "exam_eligibility" && item.status === "pending")} onClick={() => { const submit = actions.submitComplaint; if (!submit) return; setSubmittingComplaint(true); setComplaintError(""); void submit("exam_eligibility", complaintReason.trim(), ...requestEvidenceArgs(complaintEvidence)).then(() => { setComplaintReason(""); setComplaintEvidence({}); setComplaintRevision(value => value + 1); return actions.getComplaints?.(); }).then((result) => { if (result) setComplaints(result.complaints); }).catch(() => setComplaintError("Không gửi được khiếu nại. Hãy thử lại sau.")).finally(() => setSubmittingComplaint(false)); }}>Gửi khiếu nại</button></section> : null}
  </section>;
}
function Metric({ metric, label, secondary, value, pending, percent, color = "var(--olive)", plain = false, title }: { metric?: string; label: string; secondary?: string | undefined; value?: string; pending?: string; percent?: number; color?: string; plain?: boolean; title?: string | undefined }) {
  const figure = pending ? <div className="metric-pending" role="status">{pending}</div>
    : plain ? <div className="stat-figure"><b>{value}</b></div>
      : <div className="ring" style={{ "--p": percent ?? 0, "--c": color } as CSSProperties}><b>{value}</b></div>;
  return <article className={`stat${pending ? " is-pending" : ""}${plain ? " is-plain" : ""}`} data-home-metric={metric} data-percent={plain || pending ? undefined : percent ?? 0} title={title}>{figure}<span className="lbl">{label}</span>{secondary ? <small className="metric-secondary" style={{ display: "block" }}>{secondary}</small> : null}</article>;
}

/** Days attended over the counted learning days that have already come (absences + attended days). */
function HomeAttendanceMetric({ eligibility }: { eligibility: LearnerHomeView["monthlyEligibility"] }) {
  if (!eligibility) return <Metric metric="attendance" label="Điểm danh" value="–" percent={0} color="var(--peach)" />;
  const daysSoFar = eligibility.attendedDays + eligibility.absenceDays;
  return <Metric metric="attendance" label="Điểm danh" value={`${eligibility.attendedDays}/${daysSoFar}`} percent={ratio(eligibility.attendedDays, daysSoFar)} color="var(--peach)" title={`Đã học ${eligibility.attendedDays} trên ${daysSoFar} ngày học đã qua`} />;
}

/** Ring toward the next Season points tier; a plain number once the last tier is reached. */
function HomePointsMetric({ points, nextTier }: { points: number; nextTier: number | null }) {
  if (nextTier === null || nextTier <= 0) return <Metric metric="points" label="Điểm huy hiệu" value={String(points)} plain />;
  // The ring shows the points only ("60/180" overflowed the ring); the next Season tier is named in the label.
  return <Metric metric="points" label={`Điểm huy hiệu · mốc ${nextTier}`} value={String(points)} percent={ratio(points, nextTier)} color="var(--primary)" title={`Còn ${Math.max(0, nextTier - points)} điểm tới mốc Season tiếp theo`} />;
}

function AbsenceChip({ absenceDays, maxAbsences }: { absenceDays: number; maxAbsences: number }) {
  const tone = absenceDays > maxAbsences ? "danger" : absenceDays > 0 ? "warn" : "ok";
  return <p className={`home-absence-chip badge ${tone}`} data-home-metric="absence" data-tone={tone}>Vắng {absenceDays}/{maxAbsences} ngày cho phép</p>;
}

const ABSENCE_LOCK_DAYS = 5;

function ratio(value: number, total: number) { return total > 0 ? Math.max(0, Math.min(100, Math.round(value / total * 100))) : 0; }

function pilotPhaseLabel(phase: LearnerHomeView["weekPhase"]) {
  return phase === "before_pilot" ? "Pilot sắp bắt đầu" : phase === "after_pilot" ? "Pilot đã kết thúc" : "Đang trong giai đoạn pilot";
}





