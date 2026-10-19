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
  return <main className="learner-page learner-profile">
    <header className="page-heading profile-heading"><div><p className="eyebrow">Tiến độ & hồ sơ</p><h1>{view.learner.displayName}</h1><p>{view.learner.cefr ? `Trình độ ${view.learner.cefr} – ${cefrDescription(view.learner.cefr)}` : "Chưa duyệt trình độ"}</p></div>{view.learner.cefr ? <span className={`level-badge level-badge--${view.learner.cefr}`}>{view.learner.cefr}</span> : null}</header>
    <section className="profile-overview app-card" role="region" aria-label="Nhận diện người học">
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
    <section className="profile-details app-card app-card--soft" role="region" aria-labelledby="profile-title"><div className="section-heading"><h2 id="profile-title">Hồ sơ cá nhân</h2><a className="button button--small" href="/onboard">Sửa</a></div><dl>
      <ProfileRow label="Công việc" value={[view.learner.profile.position, view.learner.profile.department].filter(Boolean).join(" · ")} />
      <ProfileRow label="Email" value={view.learner.profile.email} />
      <ProfileRow label="Base" value={view.learner.profile.contact} />
      <ProfileRow label="Dùng tiếng Anh để" value={optionLabels("goals", view.learner.profile.goals)} />
      <ProfileRow label="Mức độ dùng ở công ty" value={optionLabel("environmentUse", view.learner.profile.environmentUse)} />
      <ProfileRow label="Dùng trong gia đình" value={optionLabel("familyUse", view.learner.profile.familyUse)} />
      <ProfileRow label="Thói quen ngoài việc" value={optionLabels("habits", view.learner.profile.habits)} />
      <ProfileRow label="Tình huống" value={view.learner.profile.situations} />
      <ProfileRow label="Cách học thích" value={optionLabels("learningStyles", view.learner.profile.learningStyles)} />
      <ProfileRow label="Giải thích bằng" value={explanationLabel(view.learner.cefr)} />
      <ProfileRow label="Phong cách Season" value={view.learner.profile.persona === "formal" ? "Formal · Trang trọng" : "Informal · Thân thiện"} />
      <ProfileRow label="Lịch học" value={`${view.learner.profile.durationMinutes ?? 10} phút/buổi · 5 ngày/tuần (T2–T6) · ${optionLabel("device", view.learner.profile.device) || "Cả hai"}`} />
      <ProfileRow label="Tự đánh giá" value={optionLabel("selfLevel", view.learner.profile.selfLevel) || "Chưa rõ"} />
      <ProfileRow label="Chứng chỉ" value={view.learner.profile.certificates?.map((item) => `${item.type} ${item.result}${item.year ? ` (${item.year})` : ""}`).join(", ") || "Chưa cập nhật"} />
      <ProfileRow label="Đã học" value={view.learner.profile.experience} />
      <ProfileRow label="Lo ngại / mong muốn" value={view.learner.profile.concerns} />
    </dl></section>
    <section role="region" aria-label="Mùa học và huy hiệu" className="reward-card app-card">
      <div className="season-card">
        <div className={`season-mark season-mark--${view.season.current.level}`} aria-hidden="true">{seasonIcon(view.season.current.level)}</div>
        <div><p className="eyebrow">Mùa học {view.season.current.level}/4</p><h2>{view.season.current.name}</h2>
          {view.season.next ? <p>Lên <strong>{view.season.next.name}</strong> cần đủ <strong>cả hai</strong>: điểm và huy hiệu của cấp đó.</p> : <p>Cấp cao nhất – đủ điểm và đủ toàn bộ huy hiệu.</p>}</div>
      </div>
      {view.season.next ? <div className="season-progress">
        <RewardTrack title="① Điểm" value={`★ ${view.points} / ${view.season.next.pointsRequired}`} current={view.points} required={view.season.next.pointsRequired} unit="điểm" />
        <RewardTrack title="② Huy hiệu của cấp tiếp theo" value={`${view.season.earnedBadgeCount} / ${view.season.requiredBadgeCount}`} current={view.season.earnedBadgeCount} required={view.season.requiredBadgeCount} unit="huy hiệu" />
      </div> : null}
      {view.season.next && (view.points >= view.season.next.pointsRequired) !== (view.season.earnedBadgeCount >= view.season.requiredBadgeCount) ? <div className="reward-mismatch" role="status">{view.points >= view.season.next.pointsRequired ? <><strong>Đủ điểm nhưng chưa lên cấp</strong> vì còn thiếu huy hiệu. Điểm không thay thế được huy hiệu.</> : <><strong>Đủ huy hiệu nhưng chưa lên cấp</strong> vì chưa đủ điểm. Huy hiệu không thay thế được điểm.</>}</div> : null}
      <div className="section-heading reward-heading"><h2>Huy hiệu theo cấp</h2><strong>{view.badges.length}/{view.badgeRoadmap.length} huy hiệu · ★ {view.points} điểm</strong></div>
      <div className="badge-groups">{badgeGroups.map((group) => <div className="badge-group" key={group.level}>
        <div className="badge-group-heading"><h3 className={`badge ${group.level === view.season.current.level + 1 ? "badge--warning" : ""}`}>{seasonIcon(group.level)} Cấp {group.level} · {seasonName(group.level)}</h3><span>{seasonPoints(group.level)} điểm + {group.badges.length} huy hiệu{group.level <= view.season.current.level ? " · đã đạt" : group.level === view.season.current.level + 1 ? " · cấp tiếp theo" : ""}</span></div>
        <div className="badge-grid">{group.badges.map((badge) => <article key={badge.key} data-earned={badge.earned} title={canonicalBadge(badge.key, badge.label, badge.description).description}><span className="badge-icon" aria-hidden="true">{badgeIcon(badge.key)}</span><strong>{canonicalBadge(badge.key, badge.label, badge.description).label}</strong><span>{canonicalBadge(badge.key, badge.label, badge.description).description}</span></article>)}</div>
      </div>)}</div>
      <div className="reward-actions"><a className="button button--small" href={`/reward/${view.season.next ? "preview" : "done"}`}>{view.season.next ? "Xem trước màn hình khi đạt cấp cao nhất" : "Xem màn hình cấp cao nhất"}</a></div>
      <details className="reward-rules"><summary>Cách tính điểm và lên cấp</summary><ul><li>Hoàn thành bài học và phần luyện tập để tích luỹ điểm.</li><li>Luyện với Season, nộp bài cuối tuần và duy trì nhịp học để mở huy hiệu.</li><li>Lên cấp: phải đủ <strong>điểm của cấp</strong> và <strong>mọi huy hiệu của cấp</strong>; các cấp đi lần lượt, không nhảy cấp.</li></ul></details>
    </section>
    <LevelReadinessCard readiness={view.levelReadiness} />
    <section className="metric-grid profile-kpis" aria-label="Tổng quan hoạt động">
      <Metric label="Bài đã học" value={String(view.stats.completedLessons)} />
      <Metric label="Lượt luyện với Season" value={String(view.stats.coachTurns)} />
      <Metric label="Ngày có học" value={String(view.stats.studyDays)} />
    </section>
    <section className="profile-weeks" aria-labelledby="weekly-progress"><h2 id="weekly-progress" className="sr-only">Tiến độ theo tuần</h2>{view.weeks.map((week) => <article className="profile-week-card app-card" key={week.weekNumber}>
      <div className="profile-week-heading"><h3>Tuần {week.weekNumber} <span>{week.topic}</span></h3><strong>{week.completedLessons}/{week.totalLessons || "–"} bài</strong></div>
      <div className="profile-week-dots" role="progressbar" aria-label={`Tiến độ tuần ${week.weekNumber}`} aria-valuemin={0} aria-valuemax={week.totalLessons} aria-valuenow={week.completedLessons}>{Array.from({ length: 5 }, (_, index) => <span key={index} className={index < Math.min(week.completedLessons, 5) ? "is-active" : ""} title={["T2", "T3", "T4", "T5", "T6"][index]} />)}</div>
    </article>)}</section>
    <section role="region" aria-label="Điểm đầu vào" className="assessment-comparison app-card"><h2>Điểm đầu vào → cuối kỳ</h2>
      {view.assessments.placement ? <div><div><p className="eyebrow">Đầu vào · {view.assessments.placement.approvedLevel}</p><strong>{view.assessments.placement.totalScore}<span className="sr-only">/100</span></strong></div>
        <dl className="assessment-skills">{Object.entries(view.assessments.placement.sections).map(([section, score]) => <div key={section}><dt>{skillLabel(section)}</dt><dd><Progress value={score} max={25} label={`Điểm ${skillLabel(section)}`} /><span>{Math.round(score / 25 * 100)}%</span></dd></div>)}</dl></div> : <p>Chưa có kết quả đầu vào.</p>}
      {view.assessments.final ? <p>Cuối kỳ: {view.assessments.final.totalScore}/100</p> : <a href="/test/final">Làm bài cuối kỳ →</a>}
    </section>
  </main>;
}

function RewardTrack({ title, value, current, required, unit }: { title: string; value: string; current: number; required: number; unit: string }) {
  const complete = current >= required;
  return <div className={`reward-track ${complete ? "is-complete" : ""}`}><div><strong>{title}</strong><span className={`badge ${complete ? "badge--success" : "badge--warning"}`}>{complete ? "✓ Đạt" : "Chưa đạt"}</span></div><b>{value}<span className="sr-only"> {current}/{required} {unit}</span></b><Progress value={current} max={required} label={title} /><small>{complete ? `Đã đủ ${unit} cho cấp tiếp theo.` : `Còn thiếu ${Math.max(0, required - current)} ${unit}.`}</small></div>;
}

function Metric({ label, value }: { label: string; value: string }) {
  return <div className="metric"><strong>{value}</strong><span>{label}</span></div>;
}

function ProfileRow({ label, value }: { label: string; value?: string | null | undefined }) {
  if (!value) return null;
  return <div><dt>{label}</dt><dd>{value}</dd></div>;
}

const profileOptions = {
  goals: {
    customer: "Nói chuyện với khách hàng / đối tác", email: "Viết email, tin nhắn công việc",
    meeting: "Họp và trình bày", docs: "Đọc tài liệu, spec kỹ thuật",
    career: "Thăng tiến / phỏng vấn", confidence: "Tự tin hơn khi nói"
  },
  environmentUse: { daily: "Hằng ngày", weekly: "Vài lần mỗi tuần", monthly: "Thỉnh thoảng", rarely: "Hiếm khi / chưa dùng" },
  familyUse: { daily: "Hằng ngày", weekly: "Vài lần mỗi tuần", sometimes: "Thỉnh thoảng", none: "Không dùng" },
  habits: {
    movies: "Xem phim / video", podcast: "Nghe nhạc / podcast", documents: "Đọc tin tức, tài liệu",
    social: "Mạng xã hội, chat", conversation: "Nói chuyện với người nước ngoài", course: "Học qua app / khoá học",
    none: "Chưa có thói quen nào"
  },
  learningStyles: {
    reading: "Đọc và ghi chú", listening: "Nghe và nhắc lại", speaking: "Nói / hội thoại",
    quiz: "Trắc nghiệm, điền từ", writing: "Viết câu, viết email", examples: "Ví dụ sát việc đang làm",
    challenge: "Thử thách ngắn, có điểm"
  },
  device: { phone: "Điện thoại", computer: "Máy tính", both: "Cả hai" },
  selfLevel: { unknown: "Không rõ", A1: "Mới bắt đầu (A1)", A2: "Sơ cấp (A2)", B1: "Trung cấp (B1)", B2: "Khá (B2)", C1: "Tốt (C1)" }
} as const;

function optionLabel(group: keyof typeof profileOptions, value?: string | null) {
  if (!value) return "";
  return (profileOptions[group] as Record<string, string>)[value] ?? value;
}

function optionLabels(group: keyof typeof profileOptions, values?: string[]) {
  return values?.map((value) => optionLabel(group, value)).join(", ") ?? "";
}

function explanationLabel(cefr: string | null) {
  if (!cefr) return "Tự động theo trình độ";
  return `${cefr === "A1" || cefr === "A2" ? "Tiếng Việt" : "Tiếng Anh"} (tự động theo mức ${cefr})`;
}

function Progress({ value, max, label }: { value: number; max: number; label: string }) {
  return <div className="inline-progress" role="progressbar" aria-label={label} aria-valuemin={0} aria-valuemax={max} aria-valuenow={value}>
    <span style={{ width: `${max ? Math.min(value / max * 100, 100) : 0}%` }} />
  </div>;
}

function seasonName(level: number) {
  return ({ 2: "Mùa hạ – đón nắng", 3: "Mùa thu – gặt hái", 4: "Mùa đông – vững vàng" } as Record<number, string>)[level] ?? `Mùa ${level}`;
}

function seasonPoints(level: number) {
  return ({ 2: 60, 3: 180, 4: 360 } as Record<number, number>)[level] ?? 0;
}

function cefrDescription(level: string) {
  return ({ A1: "Mới bắt đầu", A2: "Sơ cấp", B1: "Trung cấp · Trình bày một vấn đề và đề xuất giải pháp.", B2: "Khá", C1: "Tốt" } as Record<string, string>)[level] ?? level;
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
  return ({ first: "🐣", starter: "🐣", streak3: "🔥", week: "📅", week_complete: "📅", friday: "✍️", chat: "💬", coach_friend: "💬", streak7: "🌟", streak5: "🌟", sharp: "🎯", first_try: "🎯", words: "🔑", wordsmith: "🔑" } as Record<string, string>)[key] ?? "🏅";
}

function canonicalBadge(key: string, label: string, description: string) {
  const values: Record<string, { label: string; description: string }> = {
    first: { label: "Khởi động", description: "Hoàn thành bài học đầu tiên" }, starter: { label: "Khởi động", description: "Hoàn thành bài học đầu tiên" },
    week: { label: "Tuần trọn vẹn", description: "Xong tất cả bài của một tuần" }, week_complete: { label: "Tuần trọn vẹn", description: "Xong tất cả bài của một tuần" },
    streak3: { label: "Chuỗi 3 ngày", description: "Học 3 ngày học liên tiếp (T2–T6)" },
    streak7: { label: "Chuỗi 5 ngày", description: "Học 5 ngày học liên tiếp (T2–T6), không tính cuối tuần" }, streak5: { label: "Chuỗi 5 ngày", description: "Học 5 ngày học liên tiếp (T2–T6), không tính cuối tuần" },
    sharp: { label: "Chuẩn ngay lần đầu", description: "Làm đúng cả 4 kỹ năng Nghe, Đọc, Viết, Nói của một bài ngay ở lần làm đầu tiên" }, first_try: { label: "Chuẩn ngay lần đầu", description: "Làm đúng cả 4 kỹ năng Nghe, Đọc, Viết, Nói của một bài ngay ở lần làm đầu tiên" },
    words: { label: "Thợ mở khoá", description: "Mở 10 ô từ bí mật khi chat với Season" }, wordsmith: { label: "Thợ mở khoá", description: "Mở 10 ô từ bí mật khi chat với Season" },
    chat: { label: "Bạn của Season", description: "10 lượt luyện với Season" }, coach_friend: { label: "Bạn của Season", description: "10 lượt luyện với Season" },
    friday: { label: "Đúng hẹn thứ Sáu", description: "Nộp bài thực hành tuần" }
  };
  return values[key] ?? { label, description };
}

function seasonIcon(level: number) {
  return ({ 1: "🌱", 2: "☀️", 3: "🍂", 4: "❄️" } as Record<number, string>)[level] ?? "🌱";
}

function skillLabel(key: string) {
  return ({ listening: "Nghe", reading: "Đọc", writing: "Viết", speaking: "Nói" } as Record<string, string>)[key] ?? key;
}
