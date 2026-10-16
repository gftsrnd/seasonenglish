import type { LearnerHomeView } from "@e4s/contracts";
import { LevelReadinessCard } from "./LevelReadinessCard.js";
import { SeasonMark } from "./games/season-art.js";

export function Home({ view }: { view: LearnerHomeView; onGenerateMicro?: () => void | Promise<void> }) {
  if (view.onboardingRequired) return <OnboardingHome view={view} />;
  const next = view.nextLesson;
  const primaryTask = !view.week
    ? <section className="primary-task primary-task--waiting" data-home-block="primary"><div><p className="eyebrow">Tuần học</p><h2>Tuần này chưa có bài</h2><p>Người vận hành chưa đặt chủ đề tuần. Bạn có thể luyện với Season trong lúc chờ.</p></div><a className="button button--primary" href="/coach">Luyện với Season</a></section>
    : view.lessons.length === 0
      ? <section className="primary-task primary-task--waiting" data-home-block="primary"><div><p className="eyebrow">Tuần {view.week.weekNumber} · {view.week.topic}</p><h2>Bộ bài đang được chuẩn bị</h2><p>Bộ bài mức {view.learner.cefr ?? "của bạn"} đang được duyệt. Quay lại sau hoặc luyện với Season trước.</p></div><a className="button button--primary" href="/coach">Luyện với Season</a></section>
      : next
        ? <section className="primary-task" data-home-block="primary" aria-labelledby="today-title"><p className="eyebrow">Bài hôm nay</p><h2 id="today-title">{next.title}</h2><p className="task-detail">{view.schedule.lessonMinutes} phút · Bài {next.dayNumber}/{view.lessons.length}</p><a className="button button--primary" href={`/lesson/${next.id}`}>Học {next.title}</a></section>
        : <section className="primary-task primary-task--complete" data-home-block="primary"><div><p className="eyebrow">Tuần {view.week.weekNumber} · {view.week.topic}</p><h2>Xong hết {view.lessons.length} bài rồi!</h2><p>Ôn lại bài hoặc luyện thêm với Season nhé.</p></div><a className="button button--primary" href="/practice">Bài thực hành cuối tuần</a></section>;
  return <main className="learner-page">
    <header className="page-heading home-heading">
      <div><p className="page-kicker">{weekdayLabel()} · Tuần {view.week?.weekNumber}/{view.program?.weekCount ?? "—"}</p><h1>Chào {view.learner.displayName}!</h1></div>
      <span className="level-badge">Trình độ {view.learner.cefr}</span>
    </header>
    <section className="topic-summary" data-home-block="context" aria-label="Chủ đề đang học">
      <article><span>Chủ đề lớn của khoá</span><strong>{view.program?.name}</strong></article>
      <article><span>Chủ đề tuần {view.week?.weekNumber}</span><strong>{view.week?.topic}</strong></article>
    </section>
    <div className="home-greeting" data-home-block="notice">
      <span className="home-season-mark" aria-hidden="true"><SeasonMark /></span>
      <aside className="learning-notice" role="note">Lâu rồi không gặp! Học ngắn {view.schedule.lessonMinutes} phút thôi nhé?</aside>
    </div>
    {primaryTask}
    <section className="metric-grid" data-home-block="metrics" aria-label="Tiến độ hiện tại">
      <Metric label="Bài đã học" value={`${view.metrics.completedLessons}/${view.metrics.totalLessons}`} />
      <Metric label="Ngày có học" value={String(view.metrics.studyDays)} />
      <Metric label="Chuỗi ngày" value={String(view.metrics.streakDays)} />
      <Metric label="Điểm" value={String(view.metrics.points)} />
    </section>
    <section data-home-block="week-path" aria-labelledby="week-path-title">
      <div className="section-heading"><h2 id="week-path-title">Lộ trình tuần {view.week?.weekNumber}</h2><span>T2–T6 · mỗi ngày một bài</span></div>
      <nav aria-label="Lộ trình tuần"><ol className="week-path">{view.lessons.map((lesson) => <li key={lesson.id} data-status={lesson.status}>
        <a href={`/lesson/${lesson.id}`} aria-label={`T${lesson.dayNumber + 1} · ${lesson.title} · ${statusLabel(lesson.status)}`}><span className="week-node" aria-hidden="true">{lesson.status === "completed" ? "✓" : lesson.status === "in_progress" ? "▶" : "•"}</span><span>T{lesson.dayNumber + 1}</span><small>{lesson.title}</small></a>
      </li>)}</ol></nav>
    </section>
    <section data-home-block="attendance" role="region" aria-label="Điểm danh tuần này">
      <div className="section-heading"><h2>Điểm danh tuần này</h2><strong>{view.schedule.days.filter((day) => day.status === "attended").length}/{view.schedule.daysPerWeek} ngày</strong></div>
      <ol className="attendance-row">{view.schedule.days.map((day) => <li key={day.date} data-status={day.status}>
        <span>{day.label}</span><strong aria-label={`${day.label}: ${attendanceLabel(day.status)}`}>{day.status === "attended" ? "✓" : day.status === "today" ? "•" : "○"}</strong>
      </li>)}</ol>
      <p className="supporting-text">T2–T6, mỗi ngày một bài khoảng {view.schedule.lessonMinutes} phút.</p>
    </section>
    <section className="activity-links" data-home-block="activities" aria-label="Hoạt động tuần">
      <a href={view.coach.href}><span className="activity-icon" aria-hidden="true">S</span><strong>Luyện với Season</strong><small>Đã luyện {view.coach.turnsThisWeek}/{view.coach.targetTurns} lượt tuần này</small></a>
      <a href={view.practice.href} className={view.practice.status === "locked" ? "activity-link activity-link--disabled" : undefined} aria-disabled={view.practice.status === "locked" ? "true" : undefined}><span className="activity-icon" aria-hidden="true">W</span><strong>Bài thực hành cuối tuần</strong><small>{view.practice.detail}</small></a>
    </section>
    <div data-home-block="readiness"><LevelReadinessCard readiness={view.levelReadiness} /></div>
    {view.finalAssessment.available ? <section className="final-assessment"><h2>Bài kiểm tra cuối kỳ đã mở</h2><p>Dùng cùng rubric với bài đầu vào để nhìn thấy tiến bộ.</p><a className="button button--primary" href={view.finalAssessment.href}>{view.finalAssessment.label}</a></section> : null}
  </main>;
}

function OnboardingHome({ view }: { view: LearnerHomeView }) {
  return <main className="learner-page learner-home-setup">
    <header className="page-heading home-heading"><div><p className="page-kicker">{weekdayLabel()}</p><h1>Chào {view.learner.displayName}!</h1></div></header>
    <section className="topic-summary" aria-label="Chủ đề đang học"><article><span>Chủ đề lớn của khoá</span><strong>{view.program?.name ?? "English for Every Season"}</strong></article><article><span>Chủ đề tuần</span><strong>{view.week?.topic ?? "Chưa đặt"}</strong></article></section>
    <div className="home-greeting"><span className="home-season-mark" aria-hidden="true"><SeasonMark /></span><aside className="learning-notice" role="note">Mình cần biết về bạn trước nhé!</aside></div>
    <section className="home-setup-card" aria-labelledby="setup-title"><h2 id="setup-title">3 bước để bắt đầu học</h2><ol className="home-setup-steps">
      <li data-state="current"><span>1</span><div><div><strong>Hồ sơ cá nhân</strong><small>Đang ở bước này</small></div><p><b>Vì sao cần?</b> Bài học lấy ví dụ theo đúng công việc của bạn, và Season giải thích theo cách bạn chọn.</p><a className="button button--primary" href="/onboard">Điền hồ sơ (~2 phút)</a></div></li>
      <li data-state="todo"><span>2</span><div><div><strong>Test đầu vào</strong><small>Mở sau khi xong hồ sơ</small></div><p><b>Vì sao cần?</b> Để xếp đúng mức CEFR: bài quá dễ thì chán, quá khó thì nản. Không cần ôn trước.</p></div></li>
      <li data-state="todo"><span>3</span><div><div><strong>Vận hành duyệt mức</strong><small>Sau khi nộp test</small></div><p><b>Vì sao cần?</b> Một người thật xem lại gợi ý của AI trước khi mở bài, tránh xếp nhầm mức.</p></div></li>
    </ol></section>
  </main>;
}

function weekdayLabel() {
  const label = new Intl.DateTimeFormat("vi-VN", { weekday: "long" }).format(new Date());
  return label.charAt(0).toUpperCase() + label.slice(1);
}

function Metric({ label, value }: { label: string; value: string }) {
  return <div className="metric"><strong>{value}</strong><span>{label}</span></div>;
}

function statusLabel(status: string) {
  return status === "completed" ? "đã hoàn thành" : status === "in_progress" ? "đang học" : "chưa bắt đầu";
}

function attendanceLabel(status: LearnerHomeView["schedule"]["days"][number]["status"]) {
  return status === "attended" ? "đã học" : status === "today" ? "hôm nay" : status === "missed" ? "chưa học" : "sắp tới";
}
