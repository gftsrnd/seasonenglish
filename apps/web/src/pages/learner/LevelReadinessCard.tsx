import type { LevelReadinessView } from "@e4s/contracts";

export function LevelReadinessCard({ readiness }: { readiness: LevelReadinessView }) {
  const target = readiness.targetLevel ?? "mức tiếp theo";
  return <section className="readiness-card" role="region" aria-label={`Đường lên mức ${target}`}>
    <div className="section-heading"><div><p className="eyebrow">{readiness.windowDays} ngày gần nhất</p><h2>Đường lên mức {target}</h2></div>
      <span className={`status-chip ${readiness.eligible ? "status-chip--success" : ""}`}>{readiness.eligible ? "Đủ điều kiện" : "Đang tích luỹ"}</span>
    </div>
    <div className="criteria-list">{readiness.criteria.map((criterion) => <article key={criterion.key} className="criterion">
      <div><strong>{criterion.met ? "✓ " : "○ "}{criterion.label}</strong><span>{criterion.display}</span></div>
      <div role="progressbar" aria-label={criterion.label} aria-valuemin={0} aria-valuemax={criterion.target} aria-valuenow={Math.min(criterion.current, criterion.target)}>
        <span style={{ width: `${Math.min(100, criterion.target ? criterion.current / criterion.target * 100 : 0)}%` }} />
      </div>
      <small>Mục tiêu: {criterion.target}{criterion.key === "coachRubric" ? "/5 và tối thiểu 6 lượt" : "%"}</small>
    </article>)}</div>
    {readiness.eligible && readiness.examAvailable ? <a className="button button--primary" href="/test/levelup">Thi lên mức {target}</a> : null}
    {readiness.eligible && !readiness.examAvailable ? <p>Đã đủ điều kiện; đề thi đang chờ người vận hành duyệt.</p> : null}
  </section>;
}
