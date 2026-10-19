import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent as ReactKeyboardEvent, type MouseEvent } from "react";
import { Check, CheckCircle2, Circle, Cloud, Droplets, Flower2, Leaf, Snowflake, Star, Sun, type LucideIcon } from "lucide-react";
import type { LearnerAvatarData, RewardView, SurveyView } from "@e4s/contracts";
import type { LearnerCallbacks, ProfileView } from "./contracts.js";
import { ProductArt } from "../shared/media/ProductArt.js";
import { ErrorText, Notice, PageTitle, Progress, AppLink } from "./ui.js";

const BADGE_ICONS: Record<string, string> = {
  first: "🐣", starter: "🐣", // media-scan: allow-avatar-reward -- deliberate badge symbol
  week: "📅", week_complete: "📅", // media-scan: allow-avatar-reward -- deliberate badge symbol
  streak3: "🔥", // media-scan: allow-avatar-reward -- deliberate badge symbol
  streak7: "🌟", streak5: "🌟", // media-scan: allow-avatar-reward -- deliberate badge symbol
  sharp: "🎯", first_try: "🎯", // media-scan: allow-avatar-reward -- deliberate badge symbol
  words: "🔑", wordsmith: "🔑", // media-scan: allow-avatar-reward -- deliberate badge symbol
  chat: "💬", coach_friend: "💬", // media-scan: allow-avatar-reward -- deliberate badge symbol
  friday: "✍️" // media-scan: allow-avatar-reward -- deliberate badge symbol
};
const SEASON_META = {
  1: { icon: "🌱", name: "Mùa xuân – gieo hạt", points: 0 }, // media-scan: allow-avatar-reward -- deliberate reward symbol
  2: { icon: "☀️", name: "Mùa hạ – đón nắng", points: 60 }, // media-scan: allow-avatar-reward -- deliberate reward symbol
  3: { icon: "🍂", name: "Mùa thu – gặt hái", points: 180 }, // media-scan: allow-avatar-reward -- deliberate reward symbol
  4: { icon: "❄️", name: "Mùa đông – vững vàng", points: 360 } // media-scan: allow-avatar-reward -- deliberate reward symbol
} as const;

export function LearnerSurvey({ view, actions }: { view: SurveyView; actions: LearnerCallbacks }) {
  const [rating, setRating] = useState<number | null>(view.answers?.rating ?? null);
  const [comment, setComment] = useState(view.answers?.comment ?? "");
  const [studyTime, setStudyTime] = useState<"work" | "outside" | "both">(view.answers?.studyTime ?? "work");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  if (view.state === "submitted") return <div className="app-learner-page survey-page">
    <PageTitle title="Khảo sát cuối pilot" />
    <section className="card survey-complete">
      <div className="bao-row"><ProductArt id="mascot" className="learner-mascot learner-mascot--survey" decorative /><div><h3>Cảm ơn bạn!</h3><p className="small">Bạn đã đánh giá {view.answers?.rating ?? "—"}/5. {view.answers?.comment ? `“${view.answers.comment}”` : ""}</p><AppLink className="btn" href="/profile" navigate={actions.navigate}>Xem tiến độ</AppLink></div></div>
    </section>
  </div>;
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (submitting || rating === null) return;
    setSubmitting(true); setError("");
    try { await actions.submitSurvey({ rating, comment, studyTime }); }
    catch { setError("Chưa gửi được phản hồi. Hãy kiểm tra kết nối rồi thử lại."); }
    finally { setSubmitting(false); }
  };
  return <div className="app-learner-page survey-page">
    <PageTitle title="Khảo sát cuối pilot" />
    <form className="card" aria-busy={submitting || undefined} onSubmit={(event) => void submit(event)}>
      <div className="bao-row"><ProductArt id="mascot" className="learner-mascot learner-mascot--survey" decorative /><div className="bubble">Học với mình 2 tuần qua có hữu ích không?</div></div>
      <fieldset className="survey-rating"><legend className="sr-only">Mức độ hữu ích</legend><div className="row">{[1, 2, 3, 4, 5].map((n) => <button type="button" className={`btn-lg${rating === n ? " active" : ""}`} aria-pressed={rating === n} aria-label={`${n} trên 5`} onClick={() => setRating(n)} key={n}>{n}</button>)}</div><p className="xs muted">1 = không hữu ích · 5 = rất hữu ích</p></fieldset>
      <label className="field"><span>Điều gì hữu ích nhất? Điều gì nên đổi?</span><textarea value={comment} onChange={(event) => setComment(event.target.value)} /></label>
      <label className="field"><span>Bạn học chủ yếu lúc nào?</span><select value={studyTime} onChange={(event) => setStudyTime(event.target.value as typeof studyTime)}><option value="work">Trong giờ làm</option><option value="outside">Ngoài giờ</option><option value="both">Cả hai</option></select></label>
      <ErrorText message={error} />
      <button className="btn-primary" type="submit" disabled={submitting || rating === null} aria-busy={submitting || undefined}>{submitting ? "Đang gửi…" : "Gửi khảo sát"}</button>
    </form>
  </div>;
}

export function LearnerProfile({ view, actions }: { view: ProfileView; actions: LearnerCallbacks }) {
  const [avatarOpen, setAvatarOpen] = useState(false);
  const avatarReturnRef = useRef<HTMLButtonElement | null>(null);
  const openAvatar = (event: MouseEvent<HTMLButtonElement>) => {
    avatarReturnRef.current = event.currentTarget;
    setAvatarOpen(true);
  };
  const closeAvatar = () => {
    const returnTarget = avatarReturnRef.current;
    setAvatarOpen(false);
    returnTarget?.focus();
  };
  if (view.profileMissing) return <div className="app-learner-page" style={{ width: "100%", maxWidth: 960, minWidth: 0, boxSizing: "border-box", paddingBottom: "calc(88px + env(safe-area-inset-bottom))" }}><PageTitle title="Tiến độ & hồ sơ" /><Notice tone="warn">Bạn chưa hoàn thành hồ sơ cá nhân.</Notice><AppLink className="btn btn-primary" href="/onboard" navigate={actions.navigate}>Điền hồ sơ</AppLink></div>;
  const level = view.learner.cefr;
  const goals = labels(view.learner.profile.goals, GOALS);
  const detail = level ? `Trình độ ${level} – ${CEFR_LABELS[level]}${goals ? ` · ${goals}.` : ""}` : "Chưa duyệt trình độ";
  return <div className="app-learner-page profile-page" style={{ width: "100%", maxWidth: 960, minWidth: 0, boxSizing: "border-box", paddingBottom: "calc(88px + env(safe-area-inset-bottom))" }}>
    <PageTitle eyebrow="Tiến độ & hồ sơ" title={view.learner.displayName} detail={detail} aside={level ? <span className={`badge lvl lvl-${level}`}>{level}</span> : null} />
    <section className="card" aria-label="Nhận diện người học">
      <div className="row" style={{ gap: 16, alignItems: "center", flexWrap: "wrap" }}>
        <button ref={avatarReturnRef} className="btn-ghost" type="button" aria-label="Đổi avatar" title="Đổi avatar" style={{ padding: 0, border: 0, background: "transparent" }} onClick={openAvatar}><Avatar avatar={view.learner.profile.avatar} name={view.learner.displayName} /></button>
        <div style={{ flex: 1, minWidth: 200 }}><b style={{ fontFamily: "var(--font-display)", fontSize: "1.1rem" }}>Avatar của bạn</b><div className="small muted">{avatarDescription(view.learner.profile.avatar)}</div></div>
        <div className="row" style={{ gap: 8 }}><button className="btn-primary" type="button" onClick={openAvatar}>Đổi avatar</button><AppLink className="btn" href="/onboard" navigate={actions.navigate}>Sửa hồ sơ</AppLink></div>
      </div>
    </section>
    <ProfileCard view={view} actions={actions} />
    {level ? <SeasonCard view={view} actions={actions} /> : null}
    {level ? <ReadinessCard view={view} actions={actions} /> : null}
    <section className="profile-progress-section" aria-label="Tổng quan tiến độ"><div className="profile-section-heading"><div><div className="eyebrow">Tổng quan học tập</div><h2>Nhịp học hiện tại</h2></div><span className="small muted">Tóm tắt từ dữ liệu đã ghi nhận</span></div><div className="grid cols-3 profile-kpi-grid"><div className="card kpi"><span className="val">{view.stats.completedLessons}</span><span className="lbl">bài đã học</span></div><div className="card kpi"><span className="val">{view.stats.coachTurns}</span><span className="lbl">lượt luyện với Season</span></div><div className="card kpi"><span className="val">{view.stats.studyDays}</span><span className="lbl">ngày có học</span></div></div></section>
    <section className="profile-progress-section profile-weeks-section" aria-label="Tiến độ theo tuần"><div className="profile-section-heading"><div><div className="eyebrow">Lộ trình học</div><h2>Tiến độ theo tuần</h2></div><span className="small muted">Theo dõi từng ngày T2–T6</span></div><div className="profile-week-grid">{view.weeks.map((week) => <article className="card profile-week-card" key={week.weekNumber}><div className="row between" style={{ gap: 12, alignItems: "flex-start" }}><h3>Tuần {week.weekNumber} <span className="small muted">{week.topic}</span></h3><span className="small muted" style={{ fontWeight: 800, whiteSpace: "nowrap" }}>{week.completedLessons}/{week.totalLessons || "–"} bài</span></div><WeekDays completed={week.completedLessons} total={week.totalLessons} /><Progress value={week.completedLessons} max={week.totalLessons} label={`Tiến độ tuần ${week.weekNumber}`} /></article>)}</div></section>
    <section className="card profile-progress-section profile-assessment-section" aria-label="Kết quả đánh giá"><div className="profile-section-heading"><div><div className="eyebrow">Đánh giá năng lực</div><h2>Điểm đầu vào → cuối kỳ</h2></div><span className="small muted">So sánh trước và sau pilot</span></div><div className="grid cols-2 profile-assessment-grid"><AssessmentResult label="Điểm đầu vào" result={view.assessments.placement} /><AssessmentResult label="Điểm cuối kỳ" result={view.assessments.final} /></div><div className="row profile-assessment-actions">{view.finalAssessmentAvailable && !view.assessments.final ? <AppLink className="btn btn-primary" href="/test/final" navigate={actions.navigate}>Làm bài cuối kỳ</AppLink> : null}{view.surveyAvailable ? <AppLink className="btn" href="/survey" navigate={actions.navigate}>Trả lời khảo sát cuối pilot</AppLink> : null}</div></section>
    {avatarOpen ? <AvatarDialog initial={view.learner.profile.avatar} name={view.learner.displayName} onClose={closeAvatar} onSave={async (avatar) => { await actions.saveAvatar(avatar); closeAvatar(); }} /> : null}
  </div>;
}

function ProfileCard({ view, actions }: { view: ProfileView; actions: LearnerCallbacks }) {
  const [open, setOpen] = useState(false);
  return <section className="card soft" style={{ marginTop: 16, minWidth: 0 }} aria-label="Hồ sơ cá nhân">
    <div className="row between" style={{ gap: 12, minWidth: 0 }}><div><b>Hồ sơ cá nhân</b><div className="xs muted">Thông tin công việc và nhu cầu học của bạn.</div></div><button className="btn btn-sm" type="button" aria-expanded={open} onClick={() => setOpen((value) => !value)}>{open ? "Đóng thông tin cá nhân" : "Chỉnh sửa thông tin cá nhân"}</button></div>
    {open ? <><div className="stack profile-details" style={{ gap: 12, marginTop: 12, minWidth: 0 }}>{profileRows(view).filter(([, value]) => value).map(([label, value]) => <div className="row profile-detail-row" style={{ display: "grid", gridTemplateColumns: "minmax(104px, .38fr) minmax(0, 1fr)", gap: 12, alignItems: "start", minWidth: 0 }} key={label}><span className="xs muted profile-detail-label" style={{ minWidth: 0, fontWeight: 800 }}>{label}</span><span className="small profile-detail-value" style={{ minWidth: 0, overflowWrap: "anywhere" }}>{value}</span></div>)}</div><div className="row" style={{ marginTop: 12 }}><AppLink className="btn btn-sm" style={{ minHeight: 32 }} href="/onboard" navigate={actions.navigate}>Cập nhật hồ sơ</AppLink></div></> : null}
  </section>;
}

function SeasonCard({ view, actions }: { view: ProfileView; actions: LearnerCallbacks }) {
  const next = view.season.next;
  const nextBadges = next ? view.badgeRoadmap.filter((badge) => badge.seasonLevel === next.level) : [];
  const missing = nextBadges.filter((badge) => !badge.earned);
  const pointsMet = !next || view.points >= next.pointsRequired;
  const badgesMet = !next || missing.length === 0;
  return <section className="card profile-season-card" style={{ marginTop: 16 }} aria-label="Mùa học">
    <div className="row profile-season-heading" style={{ gap: 16, alignItems: "center" }}><SeasonFigure level={view.season.current.level} /><div className="profile-season-copy" style={{ flex: 1, minWidth: 200 }}><div className="eyebrow">Mùa học {view.season.current.level}/4</div><div className="small muted profile-season-current" style={{ fontWeight: 800 }}>Cấp hiện tại: {view.season.current.level}/4</div><div className="profile-season-title" style={{ fontFamily: "var(--font-display)", fontWeight: 800, fontSize: "1.5rem", lineHeight: 1.2 }}>{view.season.current.name}</div><div className="small profile-season-next" style={{ fontWeight: 700 }}>{next ? <>Lên <b>{next.name}</b> cần đủ điểm và huy hiệu của cấp đó.</> : "Cấp cao nhất – đủ điểm và đủ toàn bộ huy hiệu."}</div></div></div>
    {next ? <><div className="grid cols-2 profile-season-tracks" style={{ marginTop: 16 }}><SeasonTrack met={pointsMet} title="① Điểm" value={`★ ${view.points} / ${next.pointsRequired}`} current={view.points} target={next.pointsRequired} note={pointsMet ? "Đủ điểm cho cấp tiếp theo." : `Còn thiếu ${next.pointsRequired - view.points} điểm.`} /><SeasonTrack met={badgesMet} title="② Huy hiệu của cấp tiếp theo" value={`${view.season.earnedBadgeCount} / ${view.season.requiredBadgeCount}`} current={view.season.earnedBadgeCount} target={view.season.requiredBadgeCount} note={badgesMet ? "Đủ huy hiệu cho cấp tiếp theo." : `Còn thiếu: ${missing.map((badge) => badge.label).join(", ")}.`} /></div>{pointsMet !== badgesMet ? <Notice tone="warn">{pointsMet ? <div className="profile-season-warning"><b>Đủ điểm</b><span>Còn thiếu huy hiệu; điểm không thay thế huy hiệu.</span></div> : <div className="profile-season-warning"><b>Đủ huy hiệu</b><span>Còn thiếu điểm; huy hiệu không thay thế điểm.</span></div>}</Notice> : null}</> : null}
    <div className="row between profile-badges-heading" style={{ marginTop: 14 }}><h3 style={{ margin: 0 }}>Huy hiệu theo cấp</h3><span className="small muted" style={{ fontWeight: 800 }}>{view.badges.length}/{view.badgeRoadmap.length} huy hiệu · ★ {view.points} điểm</span></div>
    <div className="profile-season-levels">{[1, 2, 3, 4].map((seasonLevel) => { const list = view.badgeRoadmap.filter((badge) => badge.seasonLevel === seasonLevel); const meta = SEASON_META[seasonLevel as keyof typeof SEASON_META]; const current = view.season.current.level === seasonLevel; const completed = view.season.current.level > seasonLevel; const nextLevel = view.season.current.level + 1 === seasonLevel; return <div className="profile-season-level" data-season-level={seasonLevel} key={seasonLevel}><div className="row profile-season-level-heading" style={{ gap: 8, marginBottom: list.length ? 6 : 0 }}><span className={`badge ${completed ? "ok" : nextLevel ? "warn" : current ? "primary" : ""}`}><span className="profile-season-emoji" role="img" aria-label={`Biểu tượng ${meta.name}`}>{meta.icon}</span> Cấp {seasonLevel} · {meta.name}</span><span className="xs muted" style={{ fontWeight: 800 }}>{meta.points} điểm{list.length ? ` + ${list.length} huy hiệu` : " · không yêu cầu huy hiệu"}{completed ? " · đã đạt" : nextLevel ? " · cấp tiếp theo" : current ? " · đang ở đây" : ""}</span></div>{list.length ? <div className="badges">{list.map((badge) => { const badgeIcon = BADGE_ICONS[badge.key] ?? "🏅"; return <article className={`bdg ${badge.earned ? "" : "off"}`} title={badge.description} key={badge.key}><span className="ic"><span className="profile-badge-emoji" role="img" aria-label={`Biểu tượng ${badge.label}`}>{badgeIcon}</span></span><b>{badge.label}</b><span>{badge.description}</span></article>; })}</div> : <p className="profile-season-empty xs muted">Cấp nền của lộ trình. Đủ điều kiện từ đây sẽ mở Cấp 2.</p>}</div>; })}</div>
    <div className="row" style={{ marginTop: 12 }}><AppLink className="btn btn-sm" style={{ minHeight: 32 }} href={next ? "/reward/preview" : "/reward/done"} navigate={actions.navigate}>{next ? "Xem trước màn hình khi đạt cấp cao nhất" : "Xem màn hình cấp cao nhất"}</AppLink></div>
    <details style={{ marginTop: 10 }}><summary className="small" style={{ fontWeight: 800, cursor: "pointer" }}>Cách tính điểm và lên cấp</summary><ul className="small" style={{ margin: "6px 0 0", paddingLeft: 20 }}><li>Hoàn thành 1 bài học: <b>+10</b></li><li>Mỗi phần Nghe/Đọc/Viết/Nói đúng: <b>+5 lần 1, giảm 1 điểm mỗi lần làm lại</b></li><li>1 lượt luyện với Season: <b>+2</b></li><li>Mở 1 ô từ bí mật: <b>+2</b></li><li>Nộp bài tuần (thứ Sáu): <b>+15</b></li><li>Xong trọn bài của một tuần: <b>+20</b></li><li>Lên cấp: đủ <b>điểm</b> và <b>mọi huy hiệu của cấp</b>; đi lần lượt, không nhảy cấp.</li></ul></details>
  </section>;
}

function SeasonTrack({ met, title, value, current, target, note }: { met: boolean; title: string; value: string; current: number; target: number; note: string }) { return <div className="card flat" style={{ background: met ? "var(--mint)" : "var(--surface)" }}><div className="row between"><b className="small">{title}</b><span className={`badge ${met ? "ok" : "warn"}`}>{met ? <><Check className="status-icon" aria-hidden="true" /> Đạt</> : "Chưa đạt"}</span></div><div style={{ fontFamily: "var(--font-display)", fontWeight: 800, fontSize: "1.3rem", margin: "2px 0" }}>{value}</div><Progress value={current} max={target} label={title} /><div className="xs muted" style={{ marginTop: 4 }}>{note}</div></div>; }

function ReadinessCard({ view, actions }: { view: ProfileView; actions: LearnerCallbacks }) { const readiness = view.levelReadiness; const target = readiness.targetLevel; return <section className="card" style={{ marginTop: 16 }} aria-label={readiness.eligible && target ? `Sẵn sàng thi lên ${target}` : `Đường lên mức ${target ?? "tiếp theo"}`}><div className="row between" style={{ alignItems: "baseline" }}><h3>{target ? readiness.eligible ? `Sẵn sàng thi lên ${target}` : `Đường lên mức ${target}` : "Bạn đang ở mức cao nhất"}</h3><span className="small muted" style={{ fontWeight: 800 }}>{readiness.windowDays} ngày gần nhất</span></div>{readiness.criteria.map((criterion) => <div style={{ marginTop: 8 }} key={criterion.key}><div className="row between small" style={{ fontWeight: 800 }}><span className="readiness-label">{criterion.met ? <CheckCircle2 className="status-icon" aria-hidden="true" /> : <Circle className="status-icon" aria-hidden="true" />} {criterion.label}</span><span className={criterion.met ? "" : "muted"}>{criterion.display}</span></div><Progress value={criterion.current} max={criterion.target} label={criterion.label} /></div>)}{readiness.eligible && readiness.examAvailable && target ? <div className="card flat" style={{ marginTop: 16, background: "var(--mint)" }}><b>Bạn đủ điều kiện thi lên mức {target}.</b><div className="small" style={{ margin: "4px 0 8px" }}>Đề ngắn (≈35 phút, 4 phần), rồi 6 lượt thử thách với Season. Chuẩn bị tai nghe và micro như bài đầu vào.</div><AppLink className="btn btn-primary" href="/test/level-up" navigate={actions.navigate}>Thi lên mức</AppLink></div> : null}<p className="xs muted" style={{ margin: "10px 0 0" }}>{target ? readiness.eligible ? "Đủ cả 4 mục – được thi lên mức khi đề được duyệt." : "Đủ cả 4 mục để thi lên mức." : "Giữ nhịp học để duy trì mức C1."}</p></section>; }

function WeekDays({ completed, total }: { completed: number; total: number }) { return <div className="days" style={{ gridTemplateColumns: "repeat(5,1fr)" }}>{["T2", "T3", "T4", "T5", "T6"].map((day, index) => <div className="day" key={day}><span>{day}</span><i className={index < Math.min(completed, total) ? "on" : ""}>{index < Math.min(completed, total) ? <Check className="status-icon" aria-hidden="true" /> : <Circle className="status-icon" aria-hidden="true" />}</i></div>)}</div>; }

function AssessmentResult({ label, result }: { label: string; result: ProfileView["assessments"]["placement"] }) { if (!result) return <div className="item"><b>{label}</b><span className="muted">{label === "Điểm cuối kỳ" ? "Chưa làm" : "Chưa có"}</span></div>; return <div className="item" role="region" aria-label={label}><div className="row between"><b>{label}</b><strong>{result.totalScore}/100 · {result.approvedLevel}</strong></div>{Object.entries(result.sections).map(([section, score]) => <div key={section}><span className="small">{SECTION_LABELS[section] ?? section}</span><Progress value={score ?? 0} max={100} label={`Điểm ${SECTION_LABELS[section]?.toLowerCase() ?? section}`} /></div>)}</div>; }
function Avatar({ avatar, name, size = 88 }: { avatar: Partial<LearnerAvatarData> | undefined; name: string; size?: number }) { const acc = avatar?.acc ?? "none"; const color = avatar?.color ?? "olive"; const bg = avatar?.bg ?? 0; return <span className="app-avatar" style={{ width: size, height: size, minWidth: size, minHeight: size, boxSizing: "border-box", background: AVATAR_BG[bg], color: AVATAR_COLOR_HEX[color] }} aria-label={`Avatar của ${name}`}>{acc !== "none" ? <AvatarMark acc={acc} size={Math.round(size * .58)} /> : name.split(/\s+/).slice(-2).map((word) => word[0]).join("").toUpperCase()}</span>; }
export function AvatarMark({ acc, size = 32 }: { acc: Exclude<LearnerAvatarData["acc"], "none">; size?: number }) { const icons: Record<typeof acc, LucideIcon> = { leaf: Leaf, sun: Sun, flower: Flower2, cloud: Cloud, star: Star, drop: Droplets, snow: Snowflake }; const Icon = icons[acc]; return <Icon size={size} strokeWidth={1.7} aria-hidden="true" />; }
function SeasonFigure({ level }: { level: number }) {
  const season = [
    { name: "Mùa xuân", icon: "🌱", color: "var(--mint)", size: 64 }, // media-scan: allow-avatar-reward -- deliberate reward symbol
    { name: "Mùa hạ", icon: "☀️", color: "var(--primary)", size: 76 }, // media-scan: allow-avatar-reward -- deliberate reward symbol
    { name: "Mùa thu", icon: "🍂", color: "var(--peach)", size: 88 }, // media-scan: allow-avatar-reward -- deliberate reward symbol
    { name: "Mùa đông", icon: "❄️", color: "var(--lav)", size: 100 } // media-scan: allow-avatar-reward -- deliberate reward symbol
  ][Math.max(0, Math.min(3, level - 1))]!;
  const outerSize = season.size + 28;
  return <span role="img" aria-label={season.name} style={{ position: "relative", display: "inline-grid", placeItems: "center", flexShrink: 0, width: outerSize, height: outerSize, borderRadius: "50%", background: season.color }}><span className="profile-season-figure-emoji" aria-hidden="true">{season.icon}</span></span>;
}

export function AvatarDialog({ initial, name = "Avatar xem trước", onClose, onSave }: { initial: Partial<LearnerAvatarData> | undefined; name?: string; onClose: () => void; onSave: (avatar: LearnerAvatarData) => void | Promise<void> }) {
  const [avatar, setAvatar] = useState<LearnerAvatarData>({ acc: initial?.acc ?? "leaf", color: initial?.color ?? "olive", bg: initial?.bg ?? 0 });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const closeRef = useRef<HTMLButtonElement>(null);
  useEffect(() => { closeRef.current?.focus({ preventScroll: true }); }, []);
  const accessories = Object.entries(AVATAR_ACC_LABELS) as Array<[LearnerAvatarData["acc"], string]>;
  const colors = Object.entries(AVATAR_COLOR_LABELS) as Array<[LearnerAvatarData["color"], string]>;
  const save = async () => {
    if (saving) return;
    setSaving(true); setError("");
    try { await onSave(avatar); }
    catch { setError("Chưa lưu được avatar. Hãy kiểm tra kết nối rồi thử lại."); }
    finally { setSaving(false); }
  };
  const handleDialogKeyDown = (event: ReactKeyboardEvent<HTMLElement>) => {
    if (event.key === "Escape") {
      event.preventDefault();
      if (!saving) onClose();
      return;
    }
    if (event.key !== "Tab") return;
    const focusable = Array.from(event.currentTarget.querySelectorAll<HTMLElement>("button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [href], [tabindex]:not([tabindex='-1'])"));
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
  return <div className="modal-backdrop"><section className="dialog" role="dialog" aria-modal="true" aria-labelledby="avatar-dialog-title" aria-describedby="avatar-dialog-description" aria-busy={saving || undefined} style={{ width: "min(100%, 520px)", maxHeight: "min(90vh, 760px)", overflowY: "auto", boxSizing: "border-box", padding: 20 }} onKeyDown={handleDialogKeyDown}>
    <h2 id="avatar-dialog-title">Avatar của bạn</h2>
    <div className="row" style={{ alignItems: "center", gap: 12, marginBottom: 12, minWidth: 0 }}><Avatar avatar={avatar} name={name} size={72} /><div style={{ minWidth: 0 }}><b>{name}</b><div id="avatar-dialog-description" className="small muted">Chọn biểu tượng mùa, màu nét và màu nền.</div></div></div>
    <fieldset disabled={saving} style={{ display: "grid", gap: 8, marginTop: 12, minWidth: 0 }}><legend>Biểu tượng</legend><div className="row" style={{ gap: 10, alignItems: "stretch" }}>{accessories.map(([key, text]) => <button type="button" aria-pressed={avatar.acc === key} className={avatar.acc === key ? "btn-primary" : "btn-sm"} style={{ minHeight: 42 }} onClick={() => setAvatar({ ...avatar, acc: key })} key={key}>{key === "none" ? null : <AvatarMark acc={key} size={32} />}{text}</button>)}</div></fieldset>
    <fieldset disabled={saving} style={{ display: "grid", gap: 8, marginTop: 12, minWidth: 0 }}><legend>Màu nét</legend><div className="row" style={{ gap: 10, alignItems: "stretch" }}>{colors.map(([key, text]) => <button type="button" aria-pressed={avatar.color === key} className={avatar.color === key ? "btn-primary" : "btn-sm"} style={{ minHeight: 42 }} onClick={() => setAvatar({ ...avatar, color: key })} key={key}><span aria-hidden="true" style={{ display: "inline-block", width: 16, height: 16, borderRadius: "50%", background: AVATAR_COLOR_HEX[key] }} />{text}</button>)}</div></fieldset>
    <fieldset disabled={saving} style={{ display: "grid", gap: 8, marginTop: 12, minWidth: 0 }}><legend>Màu nền</legend><div className="row" style={{ gap: 10, alignItems: "stretch" }}>{AVATAR_BG.map((background, bg) => <button type="button" aria-label={`Màu nền ${bg + 1}`} aria-pressed={avatar.bg === bg} className={avatar.bg === bg ? "btn-primary" : "btn-sm"} style={{ minHeight: 42 }} onClick={() => setAvatar({ ...avatar, bg: bg as LearnerAvatarData["bg"] })} key={background}><span aria-hidden="true" style={{ display: "inline-block", width: 16, height: 16, borderRadius: "50%", background, boxShadow: "inset 0 0 0 1px rgba(0,0,0,.08)" }} /></button>)}</div></fieldset>
    <ErrorText message={error} />
    <div className="row" style={{ justifyContent: "flex-end", gap: 8, marginTop: 16, flexWrap: "wrap" }}><button ref={closeRef} type="button" disabled={saving} onClick={onClose}>Huỷ</button><button className="btn-primary" type="button" disabled={saving} aria-busy={saving || undefined} onClick={() => void save()}>{saving ? "Đang lưu…" : "Lưu avatar"}</button></div>
  </section></div>;
}
function profileRows(view: ProfileView): Array<[string, string]> {
  const p = view.learner.profile;
  const level = view.learner.cefr;
  const explanation = p.explanationLanguage === "vi" ? "Tiếng Việt" : p.explanationLanguage === "en" ? "Tiếng Anh" : level ? `${level === "A1" || level === "A2" ? "Tiếng Việt" : "Tiếng Anh"} (tự động theo mức ${level})` : "Tự động theo trình độ";
  return [
    ["Họ và tên", p.fullName ?? view.learner.displayName],
    ["Công việc", [p.position, p.department].filter(Boolean).join(" · ")],
    ["Email", p.email ?? ""],
    ["Base", p.contact ?? ""],
    ["Dùng tiếng Anh để", labels(p.goals, GOALS)],
    ["Mức độ dùng ở công ty", label(p.environmentUse, ENVIRONMENT_USE)],
    ["Dùng trong gia đình", label(p.familyUse, FAMILY_USE)],
    ["Thói quen ngoài việc", labels(p.habits, HABITS)],
    ["Tình huống", p.situations ?? ""],
    ["Cách học thích", labels(p.learningStyles, LEARNING_STYLES)],
    ["Giải thích bằng", explanation],
    ["Phong cách Season", p.persona === "formal" ? "Formal · Trang trọng" : "Informal · Thân thiện"],
    ["Lịch học", p.durationMinutes ? `${p.durationMinutes} phút/buổi · 5 ngày/tuần (T2–T6) · ${label(p.device, DEVICES)}` : ""],
    ["Tự đánh giá", label(p.selfLevel, SELF_LEVELS)],
    ["Chứng chỉ", (p.certificates ?? []).map((certificate) => `${certificate.type} ${certificate.result}${certificate.year ? ` (${certificate.year})` : ""}`).join(", ")],
    ["Đã học", p.experience ?? ""],
    ["Lo ngại / mong muốn", p.concerns ?? ""]
  ];
}

const CEFR_LABELS = { A1: "Mới bắt đầu", A2: "Sơ cấp", B1: "Trung cấp", B2: "Khá", C1: "Tốt" } as const;
const GOALS: Record<string, string> = { customer: "Nói chuyện với khách hàng / đối tác", email: "Viết email, tin nhắn công việc", meeting: "Họp và trình bày", docs: "Đọc tài liệu, spec kỹ thuật", career: "Thăng tiến / phỏng vấn", confidence: "Tự tin hơn khi nói", travel: "Du lịch" };
const ENVIRONMENT_USE: Record<string, string> = { daily: "Hằng ngày", weekly: "Vài lần mỗi tuần", monthly: "Thỉnh thoảng (vài lần/tháng)", rarely: "Hiếm khi / chưa dùng" };
const FAMILY_USE: Record<string, string> = { daily: "Hằng ngày (người thân nói tiếng Anh)", often: "Thường xuyên", weekly: "Vài lần mỗi tuần", sometimes: "Thỉnh thoảng", monthly: "Thỉnh thoảng", never: "Không dùng", none: "Không dùng" };
const HABITS: Record<string, string> = { movies: "Xem phim / video tiếng Anh", music: "Nghe nhạc / podcast", podcast: "Nghe nhạc / podcast", reading: "Đọc tin tức, tài liệu", documents: "Đọc tin tức, tài liệu", social: "Mạng xã hội, chat tiếng Anh", speak: "Nói chuyện với người nước ngoài", app: "Học qua app / khoá học", none: "Chưa có thói quen nào" };
const LEARNING_STYLES: Record<string, string> = { reading: "Đọc và ghi chú", listening: "Nghe và nhắc lại", speaking: "Nói / hội thoại", quiz: "Trắc nghiệm, điền từ", practice: "Thử thách ngắn", writing: "Viết câu, viết email", examples: "Ví dụ sát việc đang làm", games: "Thử thách ngắn, có điểm" };
const DEVICES: Record<string, string> = { phone: "Điện thoại", laptop: "Máy tính", computer: "Máy tính", both: "Cả hai" };
const SELF_LEVELS: Record<string, string> = { unknown: "Không rõ", A1: "Mới bắt đầu (A1)", A2: "Sơ cấp (A2)", B1: "Trung cấp (B1)", B2: "Khá (B2)", C1: "Tốt (C1)" };
const SECTION_LABELS: Record<string, string> = { listening: "Nghe", reading: "Đọc", writing: "Viết", speaking: "Nói" };
const AVATAR_ACC_LABELS: Record<string, string> = { none: "Chữ cái đầu", leaf: "Lá", sun: "Nắng", flower: "Hoa", cloud: "Mây", star: "Sao", drop: "Giọt mưa", snow: "Tuyết" };
const AVATAR_COLOR_LABELS: Record<string, string> = { ink: "Mực", brown: "Nâu", olive: "Ô liu", taupe: "Xám nâu", orange: "Cam", rose: "Đỏ hồng" };
const AVATAR_COLOR_HEX: Record<LearnerAvatarData["color"], string> = { ink: "#1E1E1E", brown: "#6E3B32", olive: "#4B6120", taupe: "#7A7064", orange: "#F28C28", rose: "#B4374B" };
const AVATAR_BG = ["#FBB829", "#F6D3CB", "#E3DCFB", "#DCE8C8", "#FFF4D9", "#D6CCBF"] as const;
function label(value: string | undefined, dictionary: Record<string, string>) { return value ? dictionary[value] ?? value : ""; }
function labels(values: readonly string[] | undefined, dictionary: Record<string, string>) { return (values ?? []).map((value) => label(value, dictionary)).join(", "); }
function avatarDescription(avatar: Partial<LearnerAvatarData> | undefined) { return avatar ? `${label(avatar.acc, AVATAR_ACC_LABELS)} · nét ${label(avatar.color, AVATAR_COLOR_LABELS).toLowerCase()}` : "Chưa chọn – đang hiện chữ cái đầu"; }

export function LearnerReward({ view, actions }: { view: RewardView; actions: LearnerCallbacks }) {
  const preview = view.mode === "preview";
  const badges = preview ? view.badges.map((badge) => ({ ...badge, earned: true })) : view.badges;
  const completedAt = new Date(view.completedAt);
  const backHref = preview ? "/profile" : "/home";
  return <div className="app-learner-page reward-page rw">
    {preview ? <div className="banner info no-print" style={{ marginBottom: 12 }}><div className="body small"><b>Bản xem trước.</b> Chứng nhận mở khi đủ {view.requiredBadgeCount}/{view.requiredBadgeCount} huy hiệu; điểm dưới đây là giả lập, không ghi vào dữ liệu. Hiện có {view.earnedBadgeCount}/{view.requiredBadgeCount} huy hiệu.</div></div> : null}
    <section className="cert-doc" aria-label="Chứng nhận hoàn thành">
      <header className="cert-head"><div className="row" style={{ gap: 14, alignItems: "center" }}><img className="cert-logo" src="/gft-logo.png" alt={view.organizationName} /><div><div className="cert-org">Season English</div><div className="xs muted">{view.organizationName} · Chương trình tiếng Anh nội bộ</div></div></div><div className="cert-no xs muted">Số: {view.certificateNumber}</div></header>
      <div className="cert-body">
        <div className="eyebrow" style={{ letterSpacing: ".18em" }}>Chứng nhận hoàn thành</div>
        <h1 className="cert-title">Certificate of Completion</h1>
        <p className="cert-line">Chứng nhận</p>
        <div className="cert-name">{view.learnerName}</div>
        <p className="cert-line">đã hoàn thành {view.requiredBadgeCount} huy hiệu của chương trình Season English, đạt cấp <b>{view.season.name} – {view.season.description}</b> với <b>{view.displayPoints} điểm</b> ở trình độ <b>{view.cefrLabel}</b>.</p>
        <div className="cert-facts"><div><span className="xs muted">Ngày hoàn thành</span><b>{completedAt.toLocaleDateString("vi-VN")}</b></div><div><span className="xs muted">Huy hiệu</span><b>{badges.filter((badge) => badge.earned).length}/{view.requiredBadgeCount}</b></div><div><span className="xs muted">Điểm tích luỹ</span><b>{view.displayPoints}</b></div><div><span className="xs muted">Cấp độ</span><b>{view.season.name}</b></div></div>
        <div className="cert-badges">{badges.map((badge) => <div className="cert-badge" key={badge.key}><span className="ck">{badge.earned ? "✓" : "○"}</span><div><b>{badge.label}</b><div className="xs muted">{badge.description}</div></div></div>)}</div>
      </div>
      <div className="cert-sign"><div><div className="line" /><div className="small">Vận hành</div><div className="xs muted">{view.operatorName}</div></div><div className="cert-date xs muted">{view.organizationName}, ngày {completedAt.getDate()} tháng {completedAt.getMonth() + 1} năm {completedAt.getFullYear()}</div><div><div className="line" /><div className="small">Quản lý</div><div className="xs muted">{view.managerName}</div></div></div>
      <div className="cert-foot xs muted">Chứng nhận tự động từ dữ liệu Season English; có giá trị nội bộ. {preview ? "BẢN XEM TRƯỚC" : ""}</div>
    </section>
    <div className="row no-print reward-actions" style={{ marginTop: 12, justifyContent: "center" }}>{preview ? <span className="xs muted">Nút in / lưu chỉ mở khi đạt cấp cao nhất thật.</span> : <button className="btn" type="button" disabled={!view.printable} onClick={actions.printReward}>In / lưu chứng nhận (PDF, 1 trang A4 ngang)</button>}<AppLink className="btn btn-primary" href={backHref} navigate={actions.navigate}>{preview ? "← Quay lại" : "Tiếp tục học"}</AppLink></div>
  </div>;
}

