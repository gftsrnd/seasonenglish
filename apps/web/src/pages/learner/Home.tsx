import type { LearnerHomeView } from "@e4s/contracts";
import { LevelReadinessCard } from "./LevelReadinessCard.js";

export function Home({ view }: { view: LearnerHomeView }) {
  if (view.onboardingRequired) return <main className="learner-page"><h1>Chào bạn!</h1><p>Hoàn thiện hồ sơ để Season chọn nội dung phù hợp.</p><a className="button button--primary" href="/onboard">Hoàn thiện hồ sơ</a></main>;
  const next = view.nextLesson;
  return <main className="learner-page">
    <header className="page-heading home-heading">
      <div><p className="page-kicker">Thứ Ba · Tuần {view.week?.weekNumber}/2</p><h1>Chào {view.learner.displayName}!</h1></div>
      <span className="level-badge">Trình độ {view.learner.cefr}</span>
    </header>
    <section className="topic-summary" data-home-block="context" aria-label="Chủ đề đang học">
      <article><span>Chủ đề lớn của khoá</span><strong>{view.program?.name}</strong></article>
      <article><span>Chủ đề tuần {view.week?.weekNumber}</span><strong>{view.week?.topic}</strong></article>
    </section>
    <aside className="learning-notice" data-home-block="notice" role="note">Lâu rồi không gặp! Học ngắn {view.schedule.lessonMinutes} phút thôi nhé?</aside>
    {next ? <section className="primary-task" data-home-block="primary" aria-labelledby="today-title">
      <p className="eyebrow">Bài hôm nay</p>
      <h2 id="today-title">{next.title}</h2>
      <p className="task-detail">{view.schedule.lessonMinutes} phút · Bài {next.dayNumber}/{view.lessons.length}</p>
      <a className="button button--primary" href={`/lesson/${next.id}`}>Học {next.title}</a>
    </section> : <section className="primary-task" data-home-block="primary"><h2>Đã xong bài tuần này</h2><a href="/practice">Làm bài thực hành cuối tuần</a></section>}
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
      <a href={view.practice.href} aria-disabled={view.practice.status === "locked"}><span className="activity-icon" aria-hidden="true">W</span><strong>Bài thực hành cuối tuần</strong><small>{view.practice.detail}</small></a>
    </section>
    <div data-home-block="readiness"><LevelReadinessCard readiness={view.levelReadiness} /></div>
    {view.finalAssessment.available ? <section className="final-assessment"><h2>Bài kiểm tra cuối kỳ đã mở</h2><p>Dùng cùng rubric với bài đầu vào để nhìn thấy tiến bộ.</p><a className="button button--primary" href={view.finalAssessment.href}>{view.finalAssessment.label}</a></section> : null}
  </main>;
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
