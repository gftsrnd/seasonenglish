import type { ManagerProgressView } from "@e4s/contracts";
import { useMemo, useState } from "react";
import "./styles.manager-clone.css";

const badges = [
  ["first", "🐣", "Khởi động", "Hoàn thành bài học đầu tiên", 2],
  ["week", "📅", "Tuần trọn vẹn", "Xong tất cả bài của một tuần", 3],
  ["streak3", "🔥", "Chuỗi 3 ngày", "Học 3 ngày học liên tiếp (T2–T6)", 2],
  ["streak7", "🌟", "Chuỗi 5 ngày", "Học 5 ngày học liên tiếp (T2–T6), không tính cuối tuần", 4],
  ["sharp", "🎯", "Chuẩn ngay lần đầu", "Làm đúng cả 4 kỹ năng ngay lần đầu", 4],
  ["words", "🔑", "Thợ mở khoá", "Mở 10 ô từ bí mật khi chat với Season", 4],
  ["chat", "💬", "Bạn của Season", "10 lượt luyện với Season", 3],
  ["friday", "✍️", "Đúng hẹn thứ Sáu", "Nộp bài thực hành tuần", 3]
] as const;

const levels = [
  { name: "Mùa xuân – gieo hạt", icon: "🌱", min: 0, badges: [] as readonly string[], color: "var(--ok-tint)" },
  { name: "Mùa hạ – đón nắng", icon: "☀️", min: 60, badges: ["first", "streak3"], color: "var(--primary)" },
  { name: "Mùa thu – gặt hái", icon: "🍂", min: 180, badges: ["week", "friday", "chat"], color: "var(--danger-soft)" },
  { name: "Mùa đông – vững vàng", icon: "❄️", min: 360, badges: ["streak7", "sharp", "words"], color: "var(--surface-3)" }
] as const;

const cases = [
  ["Mới bắt đầu", 0, []],
  ["Cấp 1 · đủ điểm, thiếu huy hiệu", 80, ["first"]],
  ["Cấp 1 · đủ huy hiệu, thiếu điểm", 40, ["first", "streak3"]],
  ["Vừa lên cấp 2", 65, ["first", "streak3"]],
  ["Cấp 2 · điểm cao, kẹt vì huy hiệu", 400, ["first", "streak3", "week"]],
  ["Vừa lên cấp 3", 190, ["first", "streak3", "week", "friday", "chat"]],
  ["Cấp 3 · thiếu 1 huy hiệu cuối", 420, ["first", "streak3", "week", "friday", "chat", "streak7", "sharp"]],
  ["Cấp cao nhất", 420, badges.map(([id]) => id)],
  ["Có huy hiệu cấp cao nhưng thiếu cấp dưới", 400, ["first", "streak7", "sharp", "words"]]
] as const;

const rewardRules = [["Hoàn thành 1 bài học", "+10"], ["Mỗi phần Nghe/Đọc/Viết/Nói làm đúng", "+5 nếu đúng lần 1, giảm 1 điểm mỗi lần làm lại"], ["1 lượt luyện với Season", "+2"], ["Mở 1 ô từ bí mật", "+2"], ["Nộp bài tuần (thứ Sáu)", "+15"], ["Xong trọn bài của một tuần", "+20"]] as const;

export function ManagerRewardPreview({ view }: { view: ManagerProgressView }) {
  const [points, setPoints] = useState(0);
  const [earned, setEarned] = useState<Set<string>>(new Set());
  const state = useMemo(() => rewardState(points, earned), [points, earned]);
  const applyCase = (entry: typeof cases[number]) => { setPoints(entry[1]); setEarned(new Set<string>(entry[2])); };
  const toggleBadge = (id: string) => setEarned((current) => { const next = new Set(current); next.has(id) ? next.delete(id) : next.add(id); return next; });

  return <main className="operator-page manager-page manager-clone manager-reward-page">
    <header className="manager-page-title"><div><a href="/mgr" className="manager-small">← Tiến độ nhóm</a><h1>Giả lập phần thưởng</h1><p>Xem trước mọi trường hợp của mùa học mà học viên có thể gặp. Đây là bản giả lập: không đọc và không ghi dữ liệu của học viên nào.</p></div></header>
    <section className="manager-card manager-reward-controls"><h3>Chọn nhanh một trường hợp</h3><div className="manager-row manager-case-buttons">{cases.map((entry) => <button className={isSelected(entry, points, earned) ? "button button--primary" : "button"} type="button" key={entry[0]} onClick={() => applyCase(entry)}>{entry[0]}</button>)}</div>
      <div className="manager-reward-inputs"><label><span>Số điểm giả lập (0–600)</span><input type="number" min="0" max="600" step="5" value={points} onChange={(event) => setPoints(clamp(Number(event.target.value), 0, 600))} /></label>
        <div><span>Huy hiệu đã có (bấm để bật/tắt)</span><div className="manager-row">{badges.map(([id, icon, name, description]) => <button className={earned.has(id) ? "button button--primary" : "button"} type="button" key={id} title={description} onClick={() => toggleBadge(id)}>{icon} {name}</button>)}</div></div></div>
      <p className="manager-reward-result"><b>Kết quả: cấp {state.index + 1}/{levels.length} · {state.current.name}</b></p>
    </section>
    <h3 className="manager-reward-preview-title">Học viên sẽ thấy (Tiến độ &amp; hồ sơ)</h3>
    <RewardCard points={points} earned={earned} />
    <section className="manager-card manager-level-table"><h3>4 mùa học</h3><div className="table-wrap"><table><thead><tr><th>Cấp</th><th>Hình</th><th>Điểm cần</th><th>Huy hiệu cần</th><th>Màn chúc mừng</th></tr></thead><tbody>{levels.map((level, index) => <tr key={level.name}><td><b>{index + 1}. {level.name}</b></td><td><SeasonFigure index={index} /></td><td>{level.min}</td><td>{level.badges.length ? level.badges.map((id) => { const badge = badges.find(([key]) => key === id)!; return <div key={id}>{badge[1]} {badge[2]}</div>; }) : <span className="manager-muted">không cần</span>}</td><td>{index === 0 ? <span className="manager-muted">—</span> : index === levels.length - 1 ? <a className="button" href="/reward/preview">Xem màn cấp cao nhất</a> : <button type="button" onClick={() => applyCase(cases[index === 1 ? 3 : 5]!)}>Xem màn lên cấp</button>}</td></tr>)}</tbody></table></div></section>
    <span className="manager-visually-hidden">{view.organizationName}</span>
  </main>;
}

function RewardCard({ points, earned }: { points: number; earned: Set<string> }) {
  const state = rewardState(points, earned); const next = levels[state.index + 1]; const pointsOk = !next || points >= next.min; const missing = next ? next.badges.filter((id) => !earned.has(id)) : []; const badgesOk = !next || !missing.length;
  return <section className="manager-card manager-reward-card"><div className="manager-reward-head"><SeasonFigure index={state.index} /><div><p className="manager-eyebrow">Mùa học {state.index + 1}/{levels.length}</p><h2>{state.current.name}</h2><p>{next ? <>Lên <b>{next.name}</b> cần đủ <b>cả hai</b>: điểm và huy hiệu của cấp đó.</> : "Cấp cao nhất – đủ điểm và đủ toàn bộ huy hiệu."}</p></div></div>
    {next ? <><div className="manager-reward-tracks"><RewardTrack ok={pointsOk} title="① Điểm" value={`★ ${points} / ${next.min}`} percent={Math.min(100, Math.round(points / next.min * 100))} note={pointsOk ? "Đã đủ điểm cho cấp tiếp theo." : `Còn thiếu ${next.min - points} điểm.`} /><RewardTrack ok={badgesOk} title="② Huy hiệu của cấp tiếp theo" value={`${next.badges.length - missing.length} / ${next.badges.length}`} percent={Math.round((next.badges.length - missing.length) / next.badges.length * 100)} note={badgesOk ? "Đã đủ huy hiệu cho cấp tiếp theo." : `Còn thiếu: ${missing.map(badgeLabel).join(", ")}.`} /></div>{pointsOk !== badgesOk ? <div className="manager-warning">{pointsOk ? <><b>Đủ điểm nhưng chưa lên cấp</b> vì còn thiếu huy hiệu. Điểm không thay thế được huy hiệu.</> : <><b>Đủ huy hiệu nhưng chưa lên cấp</b> vì chưa đủ điểm. Huy hiệu không thay thế được điểm.</>}</div> : null}</> : null}
    <div className="manager-row manager-between manager-badges-title"><h3>Huy hiệu theo cấp</h3><span>{earned.size}/{badges.length} huy hiệu · ★ {points} điểm</span></div>
    {levels.slice(1).map((level, offset) => { const index = offset + 1; const tierBadges = badges.filter((badge) => badge[4] === index + 1); return <div className="manager-badge-tier" key={level.name}><div className="manager-row"><span className={`manager-badge ${state.index >= index ? "is-good" : state.index + 1 === index ? "is-warning" : ""}`}>{level.icon} Cấp {index + 1} · {level.name}</span><span>{level.min} điểm + {tierBadges.length} huy hiệu{state.index >= index ? " · đã đạt" : state.index + 1 === index ? " · cấp tiếp theo" : ""}</span></div><div className="manager-earned-grid">{tierBadges.map(([id, icon, name, description]) => <div className={earned.has(id) ? "manager-earned" : "manager-earned is-off"} title={description} key={id}><span>{icon}</span><b>{name}</b><small>{description}</small></div>)}</div></div>; })}
    <details><summary>Cách tính điểm và lên cấp</summary><ul>{rewardRules.map(([name, value]) => <li key={name}>{name}: <b>{value}</b></li>)}<li>Lên cấp: phải đủ <b>điểm của cấp</b> và <b>mọi huy hiệu của cấp</b>; các cấp đi lần lượt, không nhảy cấp.</li></ul></details></section>;
}

function RewardTrack({ ok, title, value, percent, note }: { ok: boolean; title: string; value: string; percent: number; note: string }) { return <article className={ok ? "manager-reward-track is-good" : "manager-reward-track"}><div className="manager-row manager-between"><b>{title}</b><span className={`manager-badge ${ok ? "is-good" : "is-warning"}`}>{ok ? "✓ Đạt" : "Chưa đạt"}</span></div><strong>{value}</strong><div className="manager-progress"><i style={{ width: `${percent}%` }} /></div><small>{note}</small></article>; }
function SeasonFigure({ index }: { index: number }) { const level = levels[index]!; const size = 64 + index * 12; return <span className="manager-season-figure" style={{ width: size + 28, height: size + 28, background: level.color, fontSize: Math.round(size * .55) }}>{level.icon}</span>; }
function rewardState(points: number, earned: Set<string>) { let index = 0; while (index + 1 < levels.length) { const next = levels[index + 1]!; if (points < next.min || !next.badges.every((id) => earned.has(id))) break; index++; } return { index, current: levels[index]! }; }
function badgeLabel(id: string) { const badge = badges.find(([key]) => key === id); return badge ? `${badge[1]} ${badge[2]}` : id; }
function isSelected(entry: typeof cases[number], points: number, earned: Set<string>) { return entry[1] === points && entry[2].length === earned.size && entry[2].every((id) => earned.has(id)); }
function clamp(value: number, min: number, max: number) { return Math.min(max, Math.max(min, Number.isFinite(value) ? Math.round(value) : min)); }
