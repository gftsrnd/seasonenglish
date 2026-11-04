import type { CSSProperties } from "react";
import type { LevelReadinessMetric, LevelReadinessView } from "@e4s/contracts";
import { AppLink, Notice } from "./ui.js";

type Phase = "none" | "requested" | "approved" | "failed" | "challenge" | "testing" | "ungraded" | "eligible" | undefined;
type Track = { key: string; label: string; current: number; target: number; max: number; display: string; currentLabel: string };

/** The one canonical level-up view for both Learner Home and Hồ sơ. */
export function LevelReadinessCard({ readiness, navigate, phase, monthLabel, className = "" }: { readiness: LevelReadinessView; navigate: (href: string) => void; phase?: Phase; monthLabel?: string | undefined; className?: string }) {
  const target = readiness.targetLevel;
  const title = target ? readiness.eligible ? `Sẵn sàng thi lên ${target}` : `Đường lên mức ${target}` : "Bạn đang ở mức cao nhất";
  const levelStatus = phase === "requested" ? "Yêu cầu lên mức đang chờ duyệt (người vận hành)." : phase === "approved" ? "Mức mới đã được duyệt và ghi nhận." : phase === "failed" ? "Chưa đạt thử thách; kế hoạch luyện lại đang sẵn sàng." : phase === "challenge" ? "Thử thách lên mức đang mở." : phase === "testing" ? "Bài kiểm tra lên mức đang diễn ra." : phase === "ungraded" ? "Bài kiểm tra lên mức đang chờ chấm." : null;
  const tracks = readiness.monthlyPolicy ? monthlyPolicyTracks(readiness.monthlyPolicy) : readiness.criteria.map(criterionTrack);
  return <section className={`card level-readiness-card ${className}`} data-home-block={className.includes("home") ? "readiness" : undefined} aria-label={title} style={{ marginTop: 20, marginBottom: 20, background: "#f2f7f6", borderColor: "#cbded9", "--surface-3": "#d6e6e2", "--line": "#b9d1ca", "--primary": "#246b67" } as CSSProperties}>
    <div className="row between" style={{ alignItems: "baseline", gap: 12, flexWrap: "wrap" }}><h3>{title}</h3><span className="small muted" style={{ fontWeight: 800 }}>{monthLabel ? `Theo tháng ${monthLabel}` : `${readiness.windowDays} ngày gần nhất`}</span></div>
    {levelStatus ? <p className="small muted" style={{ margin: "4px 0 0" }}>{levelStatus}</p> : null}
    <div aria-label="Điều kiện Đường lên mức">{tracks.map((track) => <ProgressTrack key={track.key} track={track} />)}</div>
    {phase === "testing" && target ? <Action text={`Bài thi lên mức ${target} đang dang dở.`} href="/test/level-up" label="Tiếp tục bài thi" navigate={navigate} /> : null}
    {phase === "challenge" && target ? <Action text={`Bạn đã qua bài thi lên mức ${target}.`} href="/challenge" label="Mở thử thách" navigate={navigate} /> : null}
    {(!phase || phase === "eligible") && readiness.eligible && readiness.examAvailable && target ? <Action text={`Bạn đủ điều kiện thi lên mức ${target}.`} href="/test/level-up" label="Thi lên mức" navigate={navigate} /> : null}
    {phase === "eligible" && !readiness.examAvailable && target ? <Notice tone="info">Bạn đã đủ điều kiện thi lên mức {target}; đề sẽ mở ngay khi được vận hành duyệt.</Notice> : null}
    <p className="xs muted" style={{ margin: "10px 0 0" }}>{target ? readiness.eligible ? "Đủ cả 4 mục – được thi lên mức khi đề được duyệt." : "Đủ cả 4 mục để thi lên mức." : "Giữ nhịp học để duy trì mức C1."}</p>
  </section>;
}

function Action({ text, href, label, navigate }: { text: string; href: string; label: string; navigate: (href: string) => void }) { return <div className="card flat" style={{ marginTop: 12, background: "var(--mint)" }}><b>{text}</b><div className="small" style={{ margin: "4px 0 8px" }}>Đề gồm 4 phần; chuẩn bị tai nghe và micro trước khi bắt đầu.</div><AppLink className="btn btn-primary" href={href} navigate={navigate}>{label}</AppLink></div>; }

function criterionTrack(metric: LevelReadinessMetric): Track {
  const max = metric.key === "coachRubric" ? 5 : 100;
  return { key: metric.key, label: metric.label, current: metric.current, target: metric.target, max, display: metric.display, currentLabel: metric.key === "coachRubric" ? `${metric.current}/5` : `${metric.current}%` };
}

function monthlyPolicyTracks(policy: NonNullable<LevelReadinessView["monthlyPolicy"]>): Track[] {
  const absenceMet = !policy.reasons.includes("LEVEL_UP_ABSENCE_CAP_EXCEEDED");
  return [
    { key: "eligibleMonths", label: "6 tháng hợp lệ", current: policy.eligibleMonths, target: policy.requiredMonths, max: policy.requiredMonths, display: `${policy.eligibleMonths}/${policy.requiredMonths} tháng`, currentLabel: `${policy.eligibleMonths}/${policy.requiredMonths}` },
    { key: "monthlyFinals", label: "Kết quả bài thi tháng", current: Math.min(policy.finalPasses, policy.finalPassesRequired), target: policy.finalPassesRequired, max: policy.finalPassesRequired, display: `${policy.finalPasses}/${policy.finalPassesRequired} bài đạt · TB ${policy.finalAverage === null ? "–" : policy.finalAverage.toFixed(1)}/${policy.finalAverageTarget}${policy.latestFinalPassed ? " · bài gần nhất đạt" : " · bài gần nhất chưa đạt"}`, currentLabel: `${policy.finalPasses}/${policy.finalPassesRequired}` },
    { key: "seasonMonths", label: "Season đạt chỉ tiêu", current: policy.seasonMonths, target: policy.seasonMonthsRequired, max: policy.seasonMonthsRequired, display: `${policy.seasonMonths}/${policy.seasonMonthsRequired} tháng đủ 100 lượt hợp lệ`, currentLabel: `${policy.seasonMonths}/${policy.seasonMonthsRequired}` },
    { key: "absenceCap", label: "Giới hạn vắng theo level", current: absenceMet ? 1 : 0, target: 1, max: 1, display: absenceMet ? `Đang trong giới hạn tối đa ${policy.absenceCap}% vắng ở mỗi tháng hợp lệ` : `Cần đưa tỷ lệ vắng về tối đa ${policy.absenceCap}% ở mỗi tháng hợp lệ`, currentLabel: absenceMet ? "Đạt" : "0/1" }
  ];
}

function ProgressTrack({ track }: { track: Track }) {
  const max = Math.max(track.max, 1);
  const current = Math.max(0, Math.min(max, track.current));
  const target = Math.max(0, Math.min(100, track.target / max * 100));
  return <div className="readiness-metric" data-readiness-key={track.key}>
    <div className="small readiness-heading"><span className="readiness-label">{track.label}</span><span className="readiness-current">{track.currentLabel}</span></div>
    <div className="readiness-track" role="progressbar" aria-label={track.label} aria-valuemin={0} aria-valuemax={max} aria-valuenow={current}><i className="readiness-fill" style={{ width: `${current / max * 100}%` }} /><i className="readiness-target" data-testid="readiness-target" aria-hidden="true" style={{ left: `${target}%`, background: "#8b5e24" }} /></div>
    <div className="readiness-actual small muted">{track.display}</div>
  </div>;
}
