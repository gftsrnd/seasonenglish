import { useMemo, useState } from "react";
import type {
  AssessmentDecisionInput,
  AssessmentReviewOverviewView,
  AssessmentReviewQueueItem,
  CefrLevel
} from "@e4s/contracts";

export function LevelApproval({ overview, readOnly, onDecision, onResolveTopicReport }: {
  overview: AssessmentReviewOverviewView;
  readOnly: boolean;
  onDecision: (attemptId: string, input: AssessmentDecisionInput) => void | Promise<void>;
  onResolveTopicReport?: (reportId: string) => void | Promise<void>;
}) {
  const topicReports = overview.topicReports ?? [];
  const levelSignals = overview.levelSignals ?? { windowDays: 14 as const, ready: [], weak: [] };
  const [selectedLevels, setSelectedLevels] = useState<Record<string, CefrLevel>>({});
  const [expandedAttempt, setExpandedAttempt] = useState<string | null>(null);
  const [expandedLevelUp, setExpandedLevelUp] = useState<string | null>(null);
  const activeLearners = overview.approvedLearners.length + overview.unassessedLearners.length;

  const approve = async (item: AssessmentReviewQueueItem) => {
    const approvedLevel = selectedLevels[item.attemptId] ?? item.suggestedLevel ?? "A1";
    await onDecision(item.attemptId, {
      status: "approved",
      approvedLevel,
      reason: "Đã kiểm tra evidence và rubric."
    });
  };

  return <main className="operator-page">
    {topicReports.filter((item) => item.status === "open").length ? <section className="operator-section topic-report-section" aria-labelledby="topic-reports-title">
      <h3 id="topic-reports-title">Báo cáo nhập chủ đề mini game ({topicReports.filter((item) => item.status === "open").length})</h3>
      <p className="supporting-text">Học viên nhập chủ đề sai hoặc vi phạm 3 lần liên tiếp. Nhắc nhở rồi bấm Đã xử lý.</p>
      <div className="topic-report-list">{topicReports.filter((item) => item.status === "open").map((item) => <article key={item.id} data-status={item.status}>
        <div><strong>{item.learnerName}</strong><span>{new Intl.DateTimeFormat("vi-VN", { dateStyle: "short", timeStyle: "short" }).format(new Date(item.createdAt))}</span></div>
        <p><code>{item.topic}</code> – {item.reason} · {item.strikeCount} lần</p>
        <button className="button--primary" type="button" disabled={readOnly || !onResolveTopicReport} onClick={() => void onResolveTopicReport?.(item.id)}>Đã xử lý</button>
      </article>)}</div>
    </section> : null}
    <header className="operator-heading">
      <div><h1>Duyệt trình độ</h1><p>Tuần hiện tại · English for Every Season · {activeLearners} người học đang hoạt động</p></div>
    </header>
    {readOnly ? <p className="operator-readonly">Quản lý đang xem ở chế độ chỉ đọc. Người vận hành là người chốt mức.</p> : null}

    <ReviewGroup
      title={`Chờ duyệt (${overview.pendingAssessments.length})`}
      empty="Không có bài đánh giá đang chờ duyệt."
      items={overview.pendingAssessments}
      readOnly={readOnly}
      selectedLevels={selectedLevels}
      expandedAttempt={expandedAttempt}
      onLevelChange={(attemptId, level) => setSelectedLevels((current) => ({ ...current, [attemptId]: level }))}
      onToggleEvidence={(attemptId) => setExpandedAttempt((current) => current === attemptId ? null : attemptId)}
      onApprove={approve}
    />

    <section className="operator-section operator-section--plain" aria-labelledby="pending-level-up-title">
      <h3 id="pending-level-up-title">Yêu cầu lên mức chờ duyệt ({overview.pendingLevelUp.length})</h3>
      {overview.pendingLevelUp.length ? overview.pendingLevelUp.map((item) => <LevelUpRequest
        key={item.attemptId}
        item={item}
        readOnly={readOnly}
        evidenceOpen={expandedLevelUp === item.attemptId}
        onToggleEvidence={() => setExpandedLevelUp((current) => current === item.attemptId ? null : item.attemptId)}
        onApprove={() => void approve(item)}
        onRetry={() => void onDecision(item.attemptId, { status: "needs_retry", reason: "Cần bổ sung evidence theo rubric." })}
      />) : <p className="operator-empty">Không có yêu cầu lên mức đang chờ.</p>}
    </section>

    <section className="operator-section operator-section--plain" aria-labelledby="level-signals-title">
      <h3 id="level-signals-title">Tín hiệu đổi mức <span className="supporting-text">({levelSignals.windowDays} ngày gần nhất · <a href="/settings">ngưỡng</a> · <a href="/op/levelforms">đề thi lên mức</a>)</span></h3>
      <div className="level-signal-grid">
        <article className="level-signal level-signal--ready"><h4>Sẵn sàng thi lên level ({levelSignals.ready.length})</h4>{levelSignals.ready.length ? <div className="level-signal-list">{levelSignals.ready.map((item) => <div className="level-signal-item" key={item.learnerId}><strong>{item.learnerName}</strong><span><span className="level-pill">{item.currentLevel}</span> → <span className="level-pill">{item.targetLevel}</span></span><p>{item.metrics.map((metric) => `${metric.label} ${metric.display}`).join(" · ")}</p></div>)}</div> : <p>Chưa có ai đủ cả 4 tín hiệu.</p>}</article>
        <article className="level-signal level-signal--down"><h4>Nên xem xét hạ mức ({levelSignals.weak.length})</h4>{levelSignals.weak.length ? <div className="level-signal-list">{levelSignals.weak.map((item) => <div className="level-signal-item" key={item.learnerId}><strong>{item.learnerName}</strong><span className="level-pill">{item.currentLevel}</span><p>{item.wrongWeeks.map((week) => `tuần ${week.weekNumber}: ${week.wrongPercent}% sai (${week.partCount} phần)`).join(" · ")}</p></div>)}</div> : <p>Không ai sai quá ngưỡng hai tuần liền.</p>}</article>
      </div>
    </section>

    <section className="operator-section" aria-labelledby="approved-title">
      <h3 id="approved-title">Đã duyệt ({overview.approvedLearners.length})</h3>
      <div className="operator-table-wrap"><table><thead><tr><th>Người học</th><th>Mức</th><th>Điểm đầu vào</th><th>Mục tiêu tháng</th><th><span className="sr-only">Hành động</span></th></tr></thead>
        <tbody>{overview.approvedLearners.map((learner) => <tr key={learner.learnerId}>
          <td><strong>{learner.learnerName}</strong></td><td><span className="level-pill">{learner.currentLevel}</span></td>
          <td>{learner.placementScore === null ? "—" : `${learner.placementScore}/100`}</td>
          <td>{learner.monthlyGoal ?? "Chưa đặt mục tiêu"}</td>
          <td className="operator-actions"><span className="muted">Đổi mức qua quy trình thi lên mức</span></td>
        </tr>)}</tbody>
      </table></div>
    </section>

    <section className="operator-section" aria-labelledby="unassessed-title">
      <h3 id="unassessed-title">Chưa làm test ({overview.unassessedLearners.length})</h3>
      {overview.unassessedLearners.length ? overview.unassessedLearners.map((learner) => <article className="unassessed-row" key={learner.learnerId}>
        <div><strong>{learner.learnerName}</strong><span>{learner.profileComplete ? "Đã điền hồ sơ" : "Chưa điền hồ sơ"}</span></div>
        <span className="muted">Chờ người học hoàn thành bài đánh giá đầu vào</span>
      </article>) : <p className="operator-empty">Tất cả người học đã có kết quả đầu vào.</p>}
    </section>
  </main>;
}

function ReviewGroup({ title, empty, items, readOnly, selectedLevels, expandedAttempt, onLevelChange, onToggleEvidence, onApprove }: {
  title: string;
  empty: string;
  items: AssessmentReviewQueueItem[];
  readOnly: boolean;
  selectedLevels: Record<string, CefrLevel>;
  expandedAttempt: string | null;
  onLevelChange: (attemptId: string, level: CefrLevel) => void;
  onToggleEvidence: (attemptId: string) => void;
  onApprove: (item: AssessmentReviewQueueItem) => Promise<void>;
}) {
  return <section className="operator-section operator-section--plain"><h3>{title}</h3>
    {items.length ? items.map((item) => {
      const selected = selectedLevels[item.attemptId] ?? item.suggestedLevel ?? "A1";
      const total = scoreTotal(item);
      return <article className="review-card" key={item.attemptId}>
        <div className="review-card-title"><div><strong>{item.learnerName}</strong><span> nộp {formatDate(item.submittedAt)} · tổng {total}/100</span></div><div><span>Điểm thô: {levelFromScore(total)}</span><span className="level-pill level-pill--accent">AI gợi ý: {item.suggestedLevel ?? "—"}</span></div></div>
        <div className="review-score-grid">{skillEntries(item).map(([label, value]) => <div key={label}><span>{label}</span><i><b style={{ width: `${Math.min(100, value)}%` }} /></i><strong>{value}%</strong></div>)}</div>
        <p className="review-note">Nhận xét cần chốt từ evidence và rubric trước khi duyệt.</p>
        {expandedAttempt === item.attemptId ? <div className="review-evidence"><strong>Bằng chứng điểm</strong><p>{skillEntries(item).map(([label, value]) => `${label} ${value}%`).join(" · ")}</p></div> : null}
        <div className="review-card-actions"><select aria-label={`Mức duyệt cho ${item.learnerName}`} value={selected} onChange={(event) => onLevelChange(item.attemptId, event.target.value as CefrLevel)}>{levelOptions.map(([value, label]) => <option key={value} value={value}>{value} – {label}</option>)}</select>
          <button className="button--primary" type="button" aria-label={`Duyệt mức cho ${item.learnerName}`} disabled={readOnly} onClick={() => void onApprove(item)}>Duyệt mức</button>
          <button type="button" onClick={() => onToggleEvidence(item.attemptId)}>Xem bài làm</button>
        </div>
      </article>;
    }) : <div className="operator-section"><p className="operator-empty">{empty}</p></div>}
  </section>;
}

function LevelUpRequest({ item, readOnly, evidenceOpen, onToggleEvidence, onApprove, onRetry }: { item: AssessmentReviewQueueItem; readOnly: boolean; evidenceOpen: boolean; onToggleEvidence: () => void; onApprove: () => void; onRetry: () => void }) {
  const total = scoreTotal(item);
  const challenge = item.challenge;
  return <article className="level-request"><div className="level-request-heading"><div><strong>{item.learnerName}</strong><span className="level-pill">{item.suggestedLevel ?? "—"}</span><span>gửi {formatDate(item.submittedAt)}</span></div><div><button type="button" onClick={onToggleEvidence}>{evidenceOpen ? "Ẩn bài thi" : "Xem bài thi"}</button><button className="button--primary" type="button" disabled={readOnly || !item.suggestedLevel || !challenge?.complete} onClick={onApprove}>Duyệt lên mức</button><button type="button" disabled={readOnly} onClick={onRetry}>Từ chối</button></div></div><p>Bài thi: {total}/100 · {skillEntries(item).map(([label, value]) => `${label} ${value}%`).join(" · ")}</p>{evidenceOpen ? <div className="review-evidence"><strong>Evidence điểm</strong><p>{skillEntries(item).map(([label, value]) => `${label} ${value}%`).join(" · ")}</p></div> : null}<p>Thử thách Season: {challenge ? `${challenge.completedTurns}/${challenge.requiredTurns} lượt · trung bình ${challenge.average.toFixed(1)}/5 · lệch chủ đề ${challenge.offTopic} · ${challenge.passed ? "đạt" : challenge.complete ? "chưa đạt" : "chưa hoàn thành"}` : "chưa bắt đầu"}.</p></article>;
}

const levelOptions: Array<[CefrLevel, string]> = [["A1", "Mới bắt đầu"], ["A2", "Sơ cấp"], ["B1", "Trung cấp"], ["B2", "Trung cao"], ["C1", "Cao cấp"]];
const skillLabels = { listening: "Nghe", reading: "Đọc", writing: "Viết", speaking: "Nói" } as const;
const skillMaximums = { listening: 20, reading: 40, writing: 20, speaking: 20 } as const;

function scoreTotal(item: AssessmentReviewQueueItem) { return Object.values(item.sectionScores).reduce((sum, value) => sum + Number(value ?? 0), 0); }
function levelFromScore(score: number) { return score < 25 ? "A1" : score < 45 ? "A2" : score < 65 ? "B1" : score < 85 ? "B2" : "C1"; }
function skillEntries(item: AssessmentReviewQueueItem): Array<[string, number]> {
  const isLevelUp = item.kind === "level-up";
  return (Object.keys(skillLabels) as Array<keyof typeof skillLabels>).map((section) => {
    const maximum = isLevelUp ? 25 : skillMaximums[section];
    return [skillLabels[section], Math.round((Number(item.sectionScores[section] ?? 0) / maximum) * 100)];
  });
}
function formatDate(value: string) { return new Intl.DateTimeFormat("vi-VN", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }).format(new Date(value)); }
