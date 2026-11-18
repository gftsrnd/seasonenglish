import { useState } from "react";
import { useMediaQuery } from "../shared/useMediaQuery.js";
import { Pager, usePaged } from "../shared/Pager.js";
import { SectionTip, useCompactUi } from "../shared/CompactUi.js";
import { OPERATOR_TIPS } from "./section-tips.js";
import type { AssessmentReviewLearnerView } from "@e4s/contracts";
import { Badge, Button, LevelChip, OperatorPage, PageTitle } from "./primitives.js";
import type { Cefr, DashboardActionKey, LevelSignalPerson, OperatorDashboardActions, OperatorDashboardView, PlacementRetakeState } from "./types.js";
import { formatPercent, formatScoreOutOf } from "../shared/format-score.js";

const placementRetakeSkills = [
  { key: "listening", label: "Nghe", max: 20 },
  { key: "reading", label: "Đọc", max: 40 },
  { key: "writing", label: "Viết", max: 20 },
  { key: "speaking", label: "Nói", max: 20 }
] as const;

function PlacementRetakeComparison({ original, retake, currentLevel, onView }: {
  original: AssessmentReviewLearnerView["attempts"][number];
  retake: AssessmentReviewLearnerView["attempts"][number];
  currentLevel: Cefr | null;
  onView?: ((id: string) => void) | undefined;
}) {
  const score = (attempt: typeof original, key: typeof placementRetakeSkills[number]["key"], max: number) => {
    const value = attempt.sectionScores[key];
    return value == null ? "Chờ chấm" : `${formatScoreOutOf(value, max)} · ${formatPercent(value / max * 100)}`;
  };
  return <section className="operator-retake-comparison" aria-label="So sánh bài đầu vào và bài thi lại">
    <p className="small">Mức hiện tại <b>{currentLevel ?? "—"}</b></p>
    <table><thead><tr><th scope="col">Kỹ năng</th><th scope="col">Lần đầu</th><th scope="col">Thi lại</th></tr></thead>
      <tbody>{placementRetakeSkills.map(({ key, label, max }) => <tr key={key}><th scope="row">{label}</th><td>{score(original, key, max)}</td><td>{score(retake, key, max)}</td></tr>)}</tbody>
    </table>
    {onView ? <div className="row"><Button small onClick={() => onView(original.id)}>Xem bài lần đầu</Button><Button small onClick={() => onView(retake.id)}>Xem bài thi lại</Button></div> : null}
  </section>;
}

/** One placement retake per learner: shown on every placement row so the Operator sees what is left. */
export const placementRetakeLabels: Record<PlacementRetakeState, string> = {
  not_granted: "Chưa cho thi lại",
  granted: "Đã duyệt thi lại · chờ học viên làm bài",
  used: "Đã dùng lượt thi lại · Vận hành xếp lớp"
};

const cefrLabels: Record<Cefr, string> = {
  A1: "Mới bắt đầu",
  A2: "Sơ cấp",
  B1: "Trung cấp",
  B2: "Trung cao",
  C1: "Cao cấp"
};

export function OperatorDashboard({ view, actions, readOnly = false, unavailable = {} }: { view: OperatorDashboardView; actions: OperatorDashboardActions; readOnly?: boolean; unavailable?: Partial<Record<DashboardActionKey, string>> }) {
  const [selected, setSelected] = useState<Record<string, Cefr>>(() => Object.fromEntries(view.pending.filter(item => item.suggestedLevel).map(item => [item.id, item.suggestedLevel!]))) ;
  const compact = useMediaQuery("(max-width: 960px)");
  const inProgress = view.inProgress ?? [];
  const retry = view.retry ?? [];
  // Phones page long lists 3 rows at a time (tablets 5); desktop shows all.
  const phone = useMediaQuery("(max-width: 480px)");
  const compactUi = useCompactUi();
  /** Phone rows keep one short status line ("Đang làm · Có hồ sơ"). */
  const profileNote = (summary?: string | null) => phone ? (summary ? "Có hồ sơ" : "Chưa có hồ sơ") : summary || "Chưa điền hồ sơ";
  const pendingPaged = usePaged(view.pending);
  const approvedPaged = usePaged(view.approved);
  const inProgressPaged = usePaged(inProgress);
  const unassessedPaged = usePaged(view.unassessed);
  const blocked = (key: DashboardActionKey) => unavailable[key];
  const signalItem = (person: LevelSignalPerson, kind: "ready" | "weak" | "flow") => <div className="item" key={person.id}>
    <div className="body"><div className="title">{person.name} <LevelChip level={person.cefr} /> {person.target && <>→ <LevelChip level={person.target} /></>} {person.pendingLevel && <Badge tone="warn">chờ → {person.pendingLevel}</Badge>}</div><div className="xs muted">{person.metrics}</div></div>
    {person.testId && <Button small disabled={Boolean(blocked("viewTest"))} onClick={() => actions.onViewTest(person.testId!)}>Bài thi</Button>}
    {person.challengeId && <Button small disabled={Boolean(blocked("viewChallenge"))} onClick={() => actions.onViewChallenge(person.challengeId!)}>Thử thách</Button>}
    {kind === "weak" && <Button small danger disabled={readOnly || Boolean(blocked("demote"))} onClick={() => actions.onDemote(person.id)}>Hạ mức</Button>}
    {kind !== "flow" && <Button small disabled={readOnly || Boolean(blocked("changeLevel"))} onClick={() => actions.onChangeLevel(person.id)}>Đổi level</Button>}
  </div>;

  const trialBadge = (item: OperatorDashboardView["approved"][number]) => item.trialCountsFrom
    ? <Badge tone="primary">Học thử · tính từ {item.trialCountsFrom.slice(8, 10)}/{item.trialCountsFrom.slice(5, 7)}</Badge>
    : null;
  const approvedProfile = (item: OperatorDashboardView["approved"][number]) => <Button small disabled={Boolean(blocked("viewProfile"))} onClick={() => actions.onViewProfile(item.id)}>Hồ sơ</Button>;
  // Staff exception: open the level-up test now. Managers see the badge only (readOnly screen).
  const levelUpBadge = (item: OperatorDashboardView["approved"][number]) => item.levelUpAllowed ? <span className="operator-levelup-badge" title="Đã mở thi lên mức cho học viên này"><Badge tone="warn">Đã mở thi</Badge></span> : null;
  const levelUpToggle = (item: OperatorDashboardView["approved"][number]) => readOnly || !actions.onToggleLevelUpOverride ? null
    : item.levelUpAllowed
      ? <Button small title="Huỷ cho phép thi lên mức" aria-label="Huỷ cho phép thi lên mức" disabled={Boolean(blocked("levelUpOverride"))} onClick={() => actions.onToggleLevelUpOverride?.(item.id, false)}>Huỷ mở thi</Button>
      : <Button small title={item.cefr === "C1" ? "Học viên đã ở mức cao nhất" : "Cho phép thi lên mức"} aria-label="Cho phép thi lên mức" disabled={item.cefr === "C1" || Boolean(blocked("levelUpOverride"))} onClick={() => actions.onToggleLevelUpOverride?.(item.id, true)}>Thi lên mức</Button>;
  const retakeButton = (learnerId: string, state: PlacementRetakeState | undefined) => state === "not_granted" && actions.onGrantPlacementRetake
    ? <Button small title="Học viên làm bài trên đề thi lại đã phát hành" disabled={readOnly || Boolean(blocked("placementRetake"))} onClick={() => actions.onGrantPlacementRetake?.(learnerId)}>Cho thi lại</Button>
    : null;
  const approvedActions = (item: OperatorDashboardView["approved"][number]) => <><Button small disabled={readOnly || Boolean(blocked("changeLevel"))} onClick={() => actions.onChangeLevel(item.id)}>Đổi level</Button>{levelUpToggle(item)}<Button small disabled={readOnly || Boolean(blocked("editGoal"))} onClick={() => actions.onEditGoal(item.id)}>Mục tiêu</Button>{item.testId && <Button small disabled={Boolean(blocked("viewTest"))} onClick={() => actions.onViewTest(item.testId!)}>Bài test</Button>}</>;

  return <OperatorPage title="Duyệt trình độ">
    {/* Mini game topic reports and deletion requests reach staff through the notification bell. */}
      <PageTitle>
      <h1>Duyệt trình độ</h1><p className="muted">{view.approved.length} người học đang hoạt động.</p>
    </PageTitle>

    <section className="section" data-guide="op-pending"><h3>Chờ duyệt ({view.pending.length}){<SectionTip text={OPERATOR_TIPS.pending} desktop label="Chờ duyệt là gì?" />}</h3>{view.pending.length ? <div aria-label="Danh sách chờ duyệt" className="bounded-scroll-region operator-pending-list">{pendingPaged.visible.map(item => {
      const profileOpen = Boolean(view.expandedPendingProfiles?.[item.id]);
      const profileDetail = view.pendingProfiles?.[item.id];
      const profileSummary = profileDetail ? inlineProfileSummary(profileDetail) : item.profileSummary;
      const retakeAttempt = item.isPlacementRetake ? profileDetail?.attempts.find(attempt => attempt.id === item.id) : undefined;
      const originalAttempt = retakeAttempt?.originalPlacementAttemptId
        ? profileDetail?.attempts.find(attempt => attempt.id === retakeAttempt.originalPlacementAttemptId) : undefined;
      return <details className="card operator-pending-review" key={item.id} aria-label={`Chờ duyệt ${item.name}`}>
      <summary className="operator-pending-review-summary">
        <div className="operator-pending-review-identity">
          <b className="name">{item.name}</b>
          <span className="xs muted">nộp {item.submittedAt} · tổng {item.total == null ? "—" : formatScoreOutOf(item.total, 100)}</span>
        </div>
        <div className="row operator-pending-review-status"><Badge>Điểm thô: <b>&nbsp;{item.rawLevel ?? "—"}</b></Badge>{item.humanScored ? <Badge tone="primary">Đã chấm tay</Badge> : null}{item.aiScoringStatus === "failed" ? <Badge tone="warn">AI chấm lỗi — có thể thử lại</Badge> : item.aiScoringStatus === "queued" || item.aiScoringStatus === "running" ? <Badge tone="warn">AI đang chấm</Badge> : item.aiScored ? <Badge tone="primary">AI chấm</Badge> : <Badge tone="warn">Chưa chấm AI</Badge>}{item.aiSuggestedCefr ? <Badge>AI gợi ý: <b>&nbsp;{item.aiSuggestedCefr}</b></Badge> : null}</div>
        <span className="ui-chevron" aria-hidden="true" />
      </summary>
      <div className="operator-pending-review-body">
      {item.reviewFlags?.length ? <div className="row operator-review-flags" aria-label="Cờ cần xem" style={{ marginTop: 10 }}>{item.reviewFlags.map(flag => <Badge key={flag} tone="warn">{{ pending_score: "Chờ chấm", incomplete: "Bài chưa đủ", typed_speaking: "Nói bằng chữ", borderline: "Sát ranh giới", skill_gap: "Lệch kỹ năng lớn" }[flag]}</Badge>)}</div> : null}
      {originalAttempt && retakeAttempt ? <PlacementRetakeComparison original={originalAttempt} retake={retakeAttempt}
        currentLevel={profileDetail?.learner.currentLevel ?? null} onView={blocked("viewTest") ? undefined : actions.onViewTest} /> : null}
      <div className={`grid${originalAttempt ? "" : " cols-2"}`} style={{ marginTop: 10 }}>{originalAttempt ? null : <div className="stack" style={{ gap: 4 }}>{item.sectionScores.map(score => <div className="row" key={score.label}><span className="xs muted" style={{ width: 70 }}>{score.label}</span><div className="progress" style={{ flex: 1 }}><i style={{ width: `${score.percent ?? 0}%` }} /></div><span className="xs" style={{ minWidth: 42, textAlign: "right" }}>{score.percent == null ? "Chờ chấm" : <>{formatPercent(score.percent)}{score.heuristic && <span className="muted" title="Điểm ước lượng theo độ dài, chưa chấm AI">*</span>}</>}</span></div>)}</div>}{(item.rationale || item.monthlyGoal) && <div className="small">{item.rationale && <p style={{ margin: 0 }}><b>Nhận xét AI:</b> {item.rationale}</p>}{item.monthlyGoal && <p style={{ margin: item.rationale ? "4px 0 0" : 0 }}><b>Mục tiêu gợi ý:</b> {item.monthlyGoal}</p>}</div>}</div>
      <button className="operator-profile-disclosure" type="button" aria-expanded={profileOpen} disabled={Boolean(blocked("viewProfile"))} onClick={() => { if (actions.onTogglePendingProfile) actions.onTogglePendingProfile(item.id); else actions.onViewProfile(item.id); }}><span className="ui-chevron ui-chevron--right" aria-hidden="true" /> Hồ sơ: {profileDetail ? profileSummary || "—" : profileSummary || "Chưa điền hồ sơ cá nhân."}</button>
      {profileOpen && profileDetail && <OperatorInlineProfile detail={profileDetail} />}{!item.rationale && !compactUi ? <p className="xs muted" style={{ margin: "6px 0 0" }}>Không có nhận xét AI. Xem bài làm để quyết định.</p> : null}
      {item.kind === "placement" && item.isPlacementRetake ? <p className="small operator-retake-final" role="note" style={{ margin: "10px 0 0" }}><Badge tone="warn">Bài thi lại</Badge> Học viên đã dùng lượt thi lại duy nhất. Chọn mức để xếp lớp — đây là quyết định cuối cùng.</p> : item.kind === "placement" && item.placementRetake && item.placementRetake !== "not_granted" ? <p className="xs muted" style={{ margin: "10px 0 0" }}>{placementRetakeLabels[item.placementRetake]}</p> : null}
      <footer className="operator-pending-review-actions">{item.kind === "placement" && <select aria-label={`Mức duyệt cho ${item.name}`} style={{ width: "auto" }} value={selected[item.id] ?? ""} onChange={event => setSelected(value => ({ ...value, [item.id]: event.target.value as Cefr }))} disabled={readOnly}><option value="" disabled>Chọn mức</option>{item.levels.map(level => <option value={level} key={level}>{level} – {cefrLabels[level]}</option>)}</select>}
        <Button primary disabled={readOnly || (item.kind === "placement" && !selected[item.id]) || Boolean(blocked("approvePlacement"))} onClick={() => item.kind === "placement" ? selected[item.id] && actions.onApprovePlacement(item.id, selected[item.id]!) : actions.onApprovePlacement(item.id)}>{item.kind === "final" ? "Duyệt bài thi tháng" : item.kind === "pass-course" ? "Cấp chứng chỉ" : "Duyệt mức"}</Button>{item.kind === "placement" && !item.isPlacementRetake && item.placementRetake === "not_granted" && actions.onRetryPlacementOnce ? <Button title="Vận hành sẽ xếp lớp sau bài thi lại" disabled={readOnly || Boolean(blocked("placementRetake"))} onClick={() => actions.onRetryPlacementOnce?.(item.id)}>Cho thi lại</Button> : null}{originalAttempt ? null : <Button disabled={Boolean(blocked("viewTest"))} onClick={() => actions.onViewTest(item.id)}><span>Xem bài làm</span></Button>}{item.canRescore !== false && <Button title={blocked("rescore") ?? "Chấm lại Viết và Nói bằng AI"} disabled={readOnly || Boolean(blocked("rescore")) || item.rescoreBusy} aria-busy={item.rescoreBusy || undefined} onClick={() => actions.onRescore(item.id)}>{item.rescoreBusy ? "Đang chấm lại…" : "Chấm lại bằng AI"}</Button>}<Button small danger={!item.deletionPending} disabled={readOnly || Boolean(blocked("deleteLearner")) || item.deletionPending} onClick={() => actions.onDeleteLearner(item.id)} className="operator-pending-review-delete"><span>{item.deletionPending ? "Chờ Quản lý duyệt xoá" : "Xoá học viên"}</span></Button></footer>
      </div>
    </details>;
    })}</div> : <div className="card"><p className="muted" style={{ margin: 0 }}>Không có ai chờ duyệt.</p></div>}<Pager {...pendingPaged} label="bài chờ duyệt" /></section>

      <section className="section" data-guide="op-signals"><h3>Tín hiệu đổi mức <span className="small muted">({view.windowDays ?? 14} ngày gần nhất · <a className="link-button" href="/op/levelforms" onClick={event => { event.preventDefault(); actions.onOpenLevelForms(); }}>đề thi lên mức</a>)</span>{<SectionTip text={OPERATOR_TIPS.signals} desktop label="Tín hiệu đổi mức là gì?" />}</h3><div className="grid cols-2"><div className="card" style={{ background: "var(--mint)" }}><h4 style={{ margin: "0 0 6px" }}>{phone ? "Sẵn sàng lên mức" : "Sẵn sàng thi lên level"} ({view.ready.length}){<SectionTip text={OPERATOR_TIPS.signalsReady} label="Sẵn sàng lên mức là gì?" />}</h4>{view.ready.length ? <div className="list">{view.ready.map(item => signalItem(item, "ready"))}</div> : <p className="small muted" style={{ margin: 0 }}>Chưa có ai đủ cả 4 tín hiệu.</p>}</div><div className="card" style={{ background: "var(--peach)" }}><h4 style={{ margin: "0 0 6px" }}>{phone ? "Nên hạ mức" : "Nên xem xét hạ mức"} ({view.weak.length}){<SectionTip text={OPERATOR_TIPS.signalsWeak} label="Nên hạ mức là gì?" />}</h4>{view.weak.length ? <div className="list">{view.weak.map(item => signalItem(item, "weak"))}</div> : <p className="small muted" style={{ margin: 0 }}>Không ai sai quá ngưỡng hai tuần liền.</p>}</div></div>{view.levelRequests.length > 0 && <div className="card" style={{ marginTop: 12, background: "var(--primary-soft)" }}><h4 style={{ margin: "0 0 8px" }}>Yêu cầu lên mức chờ duyệt ({view.levelRequests.length})</h4>{view.levelRequests.map(request => <div className="item" key={request.id}><div className="body"><div className="title">{request.learnerName} {request.from ? <LevelChip level={request.from} /> : <Badge>mức hiện tại: —</Badge>} → {request.to ? <LevelChip level={request.to} /> : <Badge>mức đích: —</Badge>} <span className="xs muted">gửi {request.sentAt}</span></div><div className="small">Bài thi: <b>{request.testSummary || "—"}</b> · Thử thách Season: {request.challengeSummary || "—"}</div></div><div className="row" style={{ gap: 6 }}>{request.testId && <Button small disabled={Boolean(blocked("viewTest"))} onClick={() => actions.onViewTest(request.testId!)}>Bài thi</Button>}{request.challengeId && <Button small disabled={Boolean(blocked("viewChallenge"))} onClick={() => actions.onViewChallenge(request.challengeId!)}>Thử thách</Button>}<Button small primary disabled={readOnly || !request.to || Boolean(blocked("decideLevelRequest"))} onClick={() => actions.onApproveLevelRequest(request.id)}>Duyệt lên mức</Button><Button small danger disabled={readOnly || Boolean(blocked("decideLevelRequest"))} onClick={() => actions.onRejectLevelRequest(request.id)}>Từ chối</Button></div></div>)}</div>}{view.inFlow.length > 0 && <div className="card" style={{ marginTop: 12 }}><h4 style={{ margin: "0 0 6px" }}>Đang trong luồng lên mức ({view.inFlow.length})</h4><div className="list">{view.inFlow.map(item => signalItem(item, "flow"))}</div></div>}</section>

    <section className="section operator-approved-panel">
      <h3>Đã duyệt ({view.approved.length}){<SectionTip text={OPERATOR_TIPS.approved} desktop label="Đã duyệt là gì?" />}</h3>
      {compact ? (view.approved.length ? <><ul className="operator-approved-list" aria-label="Học viên đã duyệt">
        {approvedPaged.visible.map((item) => <li key={item.id} className="card operator-approved-record" data-testid={`approved-${item.id}`}>
          <div className="operator-approved-record-header">
            <div>
              <b>{item.name}</b>
              <div className="operator-approved-record-meta">
                <LevelChip level={item.cefr} />
                {item.pendingLevel && <Badge tone="warn">chờ → {item.pendingLevel}</Badge>}
                {levelUpBadge(item)}{trialBadge(item)}
                <span className="small muted">{item.placementScore == null ? "Chưa có điểm đầu vào" : `Đầu vào ${formatScoreOutOf(item.placementScore, 100)}`}</span>
              </div>
            </div>
            {approvedProfile(item)}
          </div>
          <p className="small operator-approved-goal"><b>Mục tiêu tháng</b> <span>{item.monthlyGoal?.trim() || "—"}</span></p>
          <details>
            <summary>Thao tác</summary>
            <div className="operator-approved-record-detail">
              {item.profileSummary ? <p className="small muted">{item.profileSummary}</p> : null}
              <div className="operator-approved-record-actions">{approvedActions(item)}</div>
            </div>
          </details>
        </li>)}
      </ul><Pager {...approvedPaged} label="học viên đã duyệt" /></> : <div className="card"><p className="muted">Chưa có.</p></div>)
      : <div className="table-wrap operator-action-table-wrap"><table className="operator-action-table"><thead><tr><th>Người học</th><th>Mức</th><th>Điểm đầu vào</th><th>Mục tiêu tháng</th><th aria-label="Thao tác" /></tr></thead><tbody>{view.approved.length ? approvedPaged.visible.map(item => <tr key={item.id} data-testid={`approved-${item.id}`}><td data-label="Người học">{item.name}<br /><span className="xs muted">{item.profileSummary}</span></td><td data-label="Mức"><LevelChip level={item.cefr} /> {item.pendingLevel && <Badge tone="warn">chờ → {item.pendingLevel}</Badge>} {levelUpBadge(item)}{trialBadge(item)}</td><td data-label="Điểm đầu vào">{item.placementScore == null ? "—" : formatScoreOutOf(item.placementScore, 100)}</td><td className="operator-approved-goal" data-label="Mục tiêu tháng">{item.monthlyGoal?.trim() || "—"}</td><td data-label="Thao tác"><div className="operator-approved-actions">{approvedActions(item)}{approvedProfile(item)}</div></td></tr>) : <tr><td colSpan={5} className="muted">Chưa có.</td></tr>}</tbody></table></div>}
      {compact ? null : <Pager {...approvedPaged} label="học viên đã duyệt" />}
    </section>

    {inProgress.length > 0 && <section className="section" data-guide="op-in-progress"><h3>Đang làm test ({inProgress.length}){<SectionTip text={OPERATOR_TIPS.inProgress} desktop label="Đang làm test là gì?" />}</h3><div className="list operator-bounded-list">{inProgressPaged.visible.map(item => <div className="item" key={item.id}><div className="body"><div className="title">{item.name}</div><div className="xs muted">{item.placementRetake === "used" ? phone ? "Đang thi lại" : "Đang làm bài thi lại (lượt duy nhất)" : phone ? "Đang làm" : "Đã bắt đầu bài test"} · {profileNote(item.profileSummary)}</div></div><Button small disabled={Boolean(blocked("viewProfile"))} onClick={() => actions.onViewProfile(item.id)}>Hồ sơ</Button></div>)}</div><Pager {...inProgressPaged} label="học viên đang làm test" /></section>}

    {retry.length > 0 && <section className="section"><h3>Cần làm lại ({retry.length}){<SectionTip text={OPERATOR_TIPS.retry} desktop label="Cần làm lại là gì?" />}</h3><div className="list operator-bounded-list">{retry.map(item => <div className="item" key={item.id}><div className="body"><div className="title">{item.name}</div><div className="xs muted">Bài test cần làm lại · {item.profileSummary || "Chưa điền hồ sơ"}</div>{item.placementRetake ? <div className="xs" data-testid={`retake-${item.id}`}>Thi lại: <b>{placementRetakeLabels[item.placementRetake]}</b></div> : null}</div>{retakeButton(item.id, item.placementRetake)}<Button small primary disabled={readOnly || Boolean(blocked("setLevelDirect"))} onClick={() => actions.onSetLevelDirect(item.id)}>{item.placementRetake === "used" ? "Xếp lớp" : "Đánh giá thủ công"}</Button>{item.hasProfile && <Button small disabled={Boolean(blocked("viewProfile"))} onClick={() => actions.onViewProfile(item.id)}>Hồ sơ</Button>}</div>)}</div></section>}

    {view.unassessed.length > 0 && <section className="section" data-guide="op-unassessed"><h3>Chưa làm test ({view.unassessed.length}){<SectionTip text={OPERATOR_TIPS.unassessed} desktop label="Chưa làm test là gì?" />}</h3><div className="list operator-bounded-list">{unassessedPaged.visible.map(item => <div className="item" key={item.id}><div className="body"><div className="title">{item.name}</div><div className="xs muted">{phone ? "Chưa làm" : "Chưa bắt đầu bài test"} · {profileNote(item.profileSummary)}</div></div>{item.hasProfile && <Button small disabled={Boolean(blocked("viewProfile"))} onClick={() => actions.onViewProfile(item.id)}>Hồ sơ</Button>}</div>)}</div><Pager {...unassessedPaged} label="học viên chưa làm test" /></section>}
  </OperatorPage>;
}

const inlineProfileOptions: Record<string, Record<string, string>> = {
  goals: { customer: "Nói chuyện với khách hàng / đối tác", email: "Viết email, tin nhắn công việc", meeting: "Họp và trình bày", docs: "Đọc tài liệu, spec kỹ thuật", career: "Thăng tiến / phỏng vấn", confidence: "Tự tin hơn khi nói" },
  environmentUse: { daily: "Hằng ngày", weekly: "Vài lần mỗi tuần", monthly: "Thỉnh thoảng (vài lần/tháng)", rarely: "Hiếm khi / chưa dùng" },
  familyUse: { daily: "Hằng ngày (người thân nói tiếng Anh)", weekly: "Vài lần mỗi tuần", monthly: "Thỉnh thoảng", never: "Không dùng", none: "Không dùng" },
  habits: { movies: "Xem phim / video tiếng Anh", music: "Nghe nhạc / podcast", podcast: "Nghe nhạc / podcast", reading: "Đọc tin tức, tài liệu", documents: "Đọc tin tức, tài liệu", social: "Mạng xã hội, chat tiếng Anh", speak: "Nói chuyện với người nước ngoài", app: "Học qua app / khoá học", none: "Chưa có thói quen nào" },
  learningStyles: { reading: "Đọc và ghi chú", listening: "Nghe và nhắc lại", speaking: "Nói / hội thoại", quiz: "Trắc nghiệm, điền từ", writing: "Viết câu, viết email", examples: "Ví dụ sát việc đang làm", games: "Thử thách ngắn, có điểm" },
  device: { phone: "Điện thoại", computer: "Máy tính", laptop: "Máy tính", both: "Cả hai" },
  selfLevel: { unknown: "Không rõ", A1: "Mới bắt đầu (A1)", A2: "Sơ cấp (A2)", B1: "Trung cấp (B1)", B2: "Khá (B2)", C1: "Tốt (C1)" }
};

function inlineProfileLabel(group: string, value: string | undefined): string {
  return value ? inlineProfileOptions[group]?.[value] ?? value : "";
}

function inlineProfileLabels(group: string, values: readonly string[] | undefined): string {
  return (values ?? []).map(value => inlineProfileLabel(group, value)).filter(Boolean).join(", ");
}

function inlineProfileSummary(detail: AssessmentReviewLearnerView): string {
  const profile = detail.profile;
  return [
    profile.selfLevel ? `tự đánh giá ${inlineProfileLabel("selfLevel", profile.selfLevel)}` : "",
    profile.learningStyles?.length ? `thích ${inlineProfileLabels("learningStyles", profile.learningStyles)}` : ""
  ].filter(Boolean).join(" · ");
}

const PROFILE_DECISION_FIELDS = ["Tự đánh giá", "Dùng tiếng Anh để", "Mức độ dùng ở công ty", "Lịch học"];

/** Learner profile rows: the four level-decision fields first; the rest sit
 * behind "Xem đủ hồ sơ", closed on phone/tablet so the decision stays in reach. */
export function OperatorProfileRows({ rows, labelClassName }: { rows: Array<[string, string]>; labelClassName: string }) {
  const wide = useMediaQuery("(min-width: 601px)");
  const decision = PROFILE_DECISION_FIELDS.flatMap(label => rows.filter(row => row[0] === label));
  const rest = rows.filter(row => !PROFILE_DECISION_FIELDS.includes(row[0]));
  const renderRow = ([label, value]: [string, string]) => <div className="operator-profile-row" data-short={(value.length <= 24 && !value.includes("@")) || undefined} key={label}><span className={`${labelClassName} operator-profile-label`}>{label}</span><span className="small operator-profile-value">{value}</span></div>;
  return <>
    {decision.length ? <div className="operator-profile-rows">{decision.map(renderRow)}</div> : null}
    {rest.length ? <details className="operator-profile-more" key={wide ? "wide" : "narrow"} open={wide || !decision.length}><summary>Xem đủ hồ sơ ({rest.length} mục)</summary><div className="operator-profile-rows">{rest.map(renderRow)}</div></details> : null}
  </>;
}

function OperatorInlineProfile({ detail }: { detail: AssessmentReviewLearnerView }) {
  const profile = detail.profile;
  const level = detail.learner.currentLevel;
  const rows: Array<[string, string]> = [
    ["Email", profile.email ?? detail.learner.email ?? ""],
    ["Dùng tiếng Anh để", inlineProfileLabels("goals", profile.goals)],
    ["Mức độ dùng ở công ty", inlineProfileLabel("environmentUse", profile.environmentUse)],
    ["Dùng trong gia đình", inlineProfileLabel("familyUse", profile.familyUse)],
    ["Thói quen ngoài việc", inlineProfileLabels("habits", profile.habits)],
    ["Cách học thích", inlineProfileLabels("learningStyles", profile.learningStyles)],
    ["Giải thích bằng", level ? (level === "A1" || level === "A2" ? `Tiếng Việt (tự động theo mức ${level})` : `Tiếng Anh (tự động theo mức ${level})`) : "Tự động theo trình độ"],
    ["Lịch học", [profile.durationMinutes ? `${profile.durationMinutes} phút/buổi` : "", "5 ngày/tuần (T2–T6)", inlineProfileLabel("device", profile.device)].filter(Boolean).join(" · ")],
    ["Tự đánh giá", inlineProfileLabel("selfLevel", profile.selfLevel)]
  ].filter((row): row is [string, string] => Boolean(row[1]));
  return <section className="card soft operator-inline-profile" aria-label="Hồ sơ cá nhân"><b>Hồ sơ cá nhân</b><OperatorProfileRows rows={rows} labelClassName="small muted" /></section>;
}
