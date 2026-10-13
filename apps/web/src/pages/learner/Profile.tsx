import { useState } from "react";
import type { LearnerAvatarData, LearnerProgressView } from "@e4s/contracts";
import { LevelReadinessCard } from "./LevelReadinessCard.js";

export function Profile({ view, onSaveAvatar, savingAvatar = false }: {
  view: LearnerProgressView;
  onSaveAvatar?: (avatar: LearnerAvatarData) => void | Promise<void>;
  savingAvatar?: boolean;
}) {
  const savedAvatar = view.learner.profile.avatar ?? defaultAvatar;
  const [avatarOpen, setAvatarOpen] = useState(false);
  const [draftAvatar, setDraftAvatar] = useState<LearnerAvatarData>(savedAvatar);
  const badgeGroups = [2, 3, 4].map((level) => ({
    level,
    badges: view.badgeRoadmap.filter((badge) => badge.seasonLevel === level)
  })).filter((group) => group.badges.length > 0);
  return <main className="learner-page">
    <header className="page-heading profile-heading"><div><p className="eyebrow">Tiến độ & hồ sơ</p><h1>{view.learner.displayName}</h1><p>Trình độ {view.learner.cefr}</p></div><span className="level-badge">{view.learner.cefr}</span></header>
    <section className="profile-overview" role="region" aria-label="Nhận diện người học">
      <button className="profile-avatar-button" type="button" aria-label="Đổi avatar" onClick={() => { setDraftAvatar(savedAvatar); setAvatarOpen(true); }}><Avatar avatar={savedAvatar} name={view.learner.displayName} /></button>
      <div><strong>Avatar của bạn</strong><p>{avatarDescription(savedAvatar)}</p></div>
      <div className="profile-overview-actions"><button className="button button--primary" type="button" onClick={() => { setDraftAvatar(savedAvatar); setAvatarOpen(true); }}>Đổi avatar</button><a className="button" href="/onboard">Sửa hồ sơ</a></div>
    </section>
    {avatarOpen ? <AvatarPicker
      avatar={draftAvatar}
      name={view.learner.displayName}
      saving={savingAvatar}
      onChange={setDraftAvatar}
      onCancel={() => setAvatarOpen(false)}
      onSave={async () => { await onSaveAvatar?.(draftAvatar); setAvatarOpen(false); }}
    /> : null}
    <section aria-labelledby="profile-title"><div className="section-heading"><h2 id="profile-title">Hồ sơ cá nhân</h2></div><dl>
      <div><dt>Công việc</dt><dd>{view.learner.profile.position ?? "Chưa cập nhật"}</dd></div>
      <div><dt>Phòng ban</dt><dd>{view.learner.profile.department ?? "Chưa cập nhật"}</dd></div>
      <div><dt>Email</dt><dd>{view.learner.profile.email ?? "Chưa cập nhật"}</dd></div>
      <div><dt>Mục tiêu</dt><dd>{view.learner.profile.goals?.join(", ") || "Chưa cập nhật"}</dd></div>
      <div><dt>Cách học</dt><dd>{view.learner.profile.learningStyles?.join(", ") || "Chưa cập nhật"}</dd></div>
      <div><dt>Lịch học</dt><dd>{view.learner.profile.durationMinutes ?? 10} phút/buổi · 5 ngày/tuần</dd></div>
      <div><dt>Tự đánh giá</dt><dd>{view.learner.profile.selfLevel ?? "Chưa rõ"}</dd></div>
      <div><dt>Chứng chỉ</dt><dd>{view.learner.profile.certificates?.map((item) => `${item.type} ${item.result}`).join(", ") || "Chưa cập nhật"}</dd></div>
    </dl></section>
    <section role="region" aria-label="Mùa học" className="season-card">
      <div className="season-mark" aria-hidden="true">{seasonIcon(view.season.current.level)}</div>
      <div><p className="eyebrow">Mùa học {view.season.current.level}/4</p><h2>{view.season.current.name}</h2>
        {view.season.next ? <p>Lên {view.season.next.name} khi đủ điểm và huy hiệu của cấp đó.</p> : <p>Bạn đã ở mùa cao nhất.</p>}</div>
      {view.season.next ? <div className="season-progress">
        <div><span>Điểm</span><strong>{view.points}/{view.season.next.pointsRequired} điểm</strong><Progress value={view.points} max={view.season.next.pointsRequired} label="Điểm lên mùa tiếp theo" /></div>
        <div><span>Huy hiệu cấp tiếp theo</span><strong>{view.season.earnedBadgeCount}/{view.season.requiredBadgeCount} huy hiệu</strong><Progress value={view.season.earnedBadgeCount} max={view.season.requiredBadgeCount} label="Huy hiệu lên mùa tiếp theo" /></div>
      </div> : null}
    </section>
    <section role="region" aria-label="Huy hiệu"><div className="section-heading"><h2>Huy hiệu theo cấp</h2><strong>{view.badges.length}/{view.badgeRoadmap.length} huy hiệu · {view.points} điểm</strong></div>
      <div className="badge-groups">{badgeGroups.map((group) => <section className="badge-group" key={group.level} aria-labelledby={`badge-level-${group.level}`}>
        <h3 id={`badge-level-${group.level}`}>Cấp {group.level} · {seasonName(group.level)}</h3>
        <div className="badge-grid">{group.badges.map((badge) => <article key={badge.key} data-earned={badge.earned}><span className="badge-icon" aria-hidden="true">{badgeIcon(badge.key)}</span><strong>{badge.label}</strong><span className="badge-state">{badge.earned ? "Đã đạt" : "Chưa đạt"}</span><p>{badge.description}</p></article>)}</div>
      </section>)}</div>
    </section>
    <LevelReadinessCard readiness={view.levelReadiness} />
    <section className="metric-grid" aria-label="Tổng quan hoạt động">
      <Metric label="Bài đã học" value={String(view.stats.completedLessons)} />
      <Metric label="Lượt luyện với Season" value={String(view.stats.coachTurns)} />
      <Metric label="Ngày có học" value={String(view.stats.studyDays)} />
    </section>
    <section aria-labelledby="weekly-progress"><h2 id="weekly-progress">Tiến độ theo tuần</h2>{view.weeks.map((week) => <article key={week.weekNumber}>
      <h3>Tuần {week.weekNumber} · {week.topic}</h3>
      <div role="progressbar" aria-label={`Tiến độ tuần ${week.weekNumber}`} aria-valuemin={0} aria-valuemax={week.totalLessons} aria-valuenow={week.completedLessons}>
        <span style={{ width: `${week.totalLessons ? week.completedLessons / week.totalLessons * 100 : 0}%` }} />
      </div>
      <p>{week.completedLessons}/{week.totalLessons} bài</p>
    </article>)}</section>
    <section aria-labelledby="activity-title"><h2 id="activity-title">Hoạt động gần đây</h2><p>{view.studyDays} ngày có học</p></section>
    <section role="region" aria-label="Điểm đầu vào" className="assessment-comparison"><h2>Điểm đầu vào → cuối kỳ</h2>
      {view.assessments.placement ? <div><div><p className="eyebrow">Đầu vào · {view.assessments.placement.approvedLevel}</p><strong>{view.assessments.placement.totalScore}/100</strong></div>
        <dl className="assessment-skills">{Object.entries(view.assessments.placement.sections).map(([section, score]) => <div key={section}><dt>{skillLabel(section)}</dt><dd><Progress value={score} max={25} label={`Điểm ${skillLabel(section)}`} /><span>{score}/25</span></dd></div>)}</dl></div> : <p>Chưa có kết quả đầu vào.</p>}
      {view.assessments.final ? <p>Cuối kỳ: {view.assessments.final.totalScore}/100</p> : <a href="/test/final">Làm bài cuối kỳ →</a>}
    </section>
  </main>;
}

function Metric({ label, value }: { label: string; value: string }) {
  return <div className="metric"><strong>{value}</strong><span>{label}</span></div>;
}

function Progress({ value, max, label }: { value: number; max: number; label: string }) {
  return <div className="inline-progress" role="progressbar" aria-label={label} aria-valuemin={0} aria-valuemax={max} aria-valuenow={value}>
    <span style={{ width: `${max ? Math.min(value / max * 100, 100) : 0}%` }} />
  </div>;
}

function seasonName(level: number) {
  return ({ 2: "Mùa hạ – đón nắng", 3: "Mùa thu – gặt hái", 4: "Mùa đông – vững vàng" } as Record<number, string>)[level] ?? `Mùa ${level}`;
}

const avatarColors = [
  ["ink", "#1E1E1E", "Mực"], ["brown", "#6E3B32", "Nâu"], ["olive", "#4B6120", "Ô liu"],
  ["taupe", "#7A7064", "Xám nâu"], ["orange", "#F28C28", "Cam"], ["rose", "#B4374B", "Đỏ hồng"]
] as const;
const avatarMarks = [
  ["none", "Chữ cái đầu"], ["leaf", "Lá"], ["sun", "Nắng"], ["flower", "Hoa"],
  ["cloud", "Mây"], ["star", "Sao"], ["drop", "Giọt mưa"], ["snow", "Tuyết"]
] as const;
const avatarBackgrounds = ["#FBB829", "#F6D3CB", "#E3DCFB", "#DCE8C8", "#FFF4D9", "#D6CCBF"] as const;
const defaultAvatar: LearnerAvatarData = { color: "olive", acc: "sun", bg: 2 };

function AvatarPicker({ avatar, name, saving, onChange, onCancel, onSave }: {
  avatar: LearnerAvatarData;
  name: string;
  saving: boolean;
  onChange: (avatar: LearnerAvatarData) => void;
  onCancel: () => void;
  onSave: () => void | Promise<void>;
}) {
  return <div className="modal-backdrop" role="presentation">
    <section className="avatar-dialog" role="dialog" aria-modal="true" aria-labelledby="avatar-dialog-title">
      <div className="avatar-dialog-preview"><Avatar avatar={avatar} name={name} size="large" /><div><h2 id="avatar-dialog-title">Avatar của bạn</h2><p>Chọn biểu tượng mùa, màu nét và màu nền.</p></div></div>
      <fieldset><legend>Biểu tượng</legend><div className="avatar-options">{avatarMarks.map(([value, label]) => <button className={avatar.acc === value ? "is-selected" : ""} type="button" key={value} onClick={() => onChange({ ...avatar, acc: value })}><Avatar avatar={{ ...avatar, acc: value }} name={name} />{label}</button>)}</div></fieldset>
      <fieldset><legend>Màu nét</legend><div className="avatar-options avatar-options--color">{avatarColors.map(([value, color, label]) => <button className={avatar.color === value ? "is-selected" : ""} type="button" key={value} onClick={() => onChange({ ...avatar, color: value })}><span style={{ background: color }} />{label}</button>)}</div></fieldset>
      <fieldset><legend>Màu nền</legend><div className="avatar-options avatar-options--background">{avatarBackgrounds.map((color, index) => <button className={avatar.bg === index ? "is-selected" : ""} type="button" key={color} aria-label={`Nền ${index + 1}`} onClick={() => onChange({ ...avatar, bg: index as LearnerAvatarData["bg"] })}><span style={{ background: color }} /></button>)}</div></fieldset>
      <div className="avatar-dialog-actions"><button className="button" type="button" onClick={onCancel}>Huỷ</button><button className="button button--primary" type="button" disabled={saving} onClick={() => void onSave()}>{saving ? "Đang lưu…" : "Lưu avatar"}</button></div>
    </section>
  </div>;
}

export function Avatar({ avatar, name, size }: { avatar: LearnerAvatarData; name: string; size?: "large" }) {
  const color = avatarColors.find(([key]) => key === avatar.color)?.[1] ?? avatarColors[0][1];
  const initials = name.split(/\s+/).filter(Boolean).slice(-2).map((part) => part[0]?.toUpperCase()).join("");
  return <span className={`profile-avatar${size ? " profile-avatar--large" : ""}`} style={{ background: avatarBackgrounds[avatar.bg], color }} aria-hidden="true">
    {avatar.acc === "none" ? initials : <AvatarMark mark={avatar.acc} />}
  </span>;
}

function AvatarMark({ mark }: { mark: LearnerAvatarData["acc"] }) {
  const common = { fill: "none", stroke: "currentColor", strokeWidth: 1.7, strokeLinecap: "round" as const, strokeLinejoin: "round" as const };
  return <svg viewBox="0 0 24 24" aria-hidden="true" {...common}>
    {mark === "leaf" ? <><path d="M5 19C5 10 11 5 20 5c0 9-5 15-15 14z" /><path d="M5 19c3-5 7-8 11-10" /></> : null}
    {mark === "sun" ? <><circle cx="12" cy="12" r="4" /><path d="M12 3v2.5M12 18.5V21M3 12h2.5M18.5 12H21M5.6 5.6l1.8 1.8M16.6 16.6l1.8 1.8M5.6 18.4l1.8-1.8M16.6 7.4l1.8-1.8" /></> : null}
    {mark === "flower" ? <><circle cx="12" cy="12" r="2.5" /><path d="M12 3.5a3 3 0 0 1 0 6 3 3 0 0 1 0-6zM12 14.5a3 3 0 0 1 0 6 3 3 0 0 1 0-6zM3.5 12a3 3 0 0 1 6 0 3 3 0 0 1-6 0zM14.5 12a3 3 0 0 1 6 0 3 3 0 0 1-6 0z" /></> : null}
    {mark === "cloud" ? <path d="M7 18h10a4 4 0 0 0 .5-8A6 6 0 0 0 6 11a3.5 3.5 0 0 0 1 7z" /> : null}
    {mark === "star" ? <path d="M12 3.5l2.4 5.2 5.6.6-4.2 3.9 1.2 5.6L12 16l-5 2.8 1.2-5.6L4 9.3l5.6-.6z" /> : null}
    {mark === "drop" ? <path d="M12 3.5c3.5 4.5 6 7.5 6 11a6 6 0 0 1-12 0c0-3.5 2.5-6.5 6-11z" /> : null}
    {mark === "snow" ? <><path d="M12 3v18M3 12h18M6 6l12 12M18 6 6 18" /><path d="M12 3l-2 2M12 3l2 2M12 21l-2-2M12 21l2-2M3 12l2-2M3 12l2 2M21 12l-2-2M21 12l-2 2" /></> : null}
  </svg>;
}

function avatarDescription(avatar: LearnerAvatarData) {
  const mark = avatarMarks.find(([key]) => key === avatar.acc)?.[1] ?? avatarMarks[0][1];
  const color = avatarColors.find(([key]) => key === avatar.color)?.[2].toLowerCase() ?? "mực";
  return `${mark} · nét ${color}`;
}

function badgeIcon(key: string) {
  return ({ starter: "🐣", streak3: "🔥", week_complete: "📅", friday: "✍️", coach_friend: "💬", streak5: "🌟", first_try: "🎯", wordsmith: "🔑" } as Record<string, string>)[key] ?? "🏅";
}

function seasonIcon(level: number) {
  return ({ 1: "🌱", 2: "☀️", 3: "🍂", 4: "❄️" } as Record<number, string>)[level] ?? "🌱";
}

function skillLabel(key: string) {
  return ({ listening: "Nghe", reading: "Đọc", writing: "Viết", speaking: "Nói" } as Record<string, string>)[key] ?? key;
}
