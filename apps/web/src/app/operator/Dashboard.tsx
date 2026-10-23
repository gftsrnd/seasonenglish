import { useState } from "react";
import type { AssessmentReviewLearnerView } from "@e4s/contracts";
import { Badge, Banner, Button, LevelChip, OperatorPage, PageTitle } from "./primitives.js";
import type { Cefr, DashboardActionKey, LevelSignalPerson, OperatorDashboardActions, OperatorDashboardView } from "./types.js";

const cefrLabels: Record<Cefr, string> = {
  A1: "Mới bắt đầu",
  A2: "Sơ cấp",
  B1: "Trung cấp",
  B2: "Trung cao",
  C1: "Cao cấp"
};

export function OperatorDashboard({ view, actions, readOnly = false, unavailable = {} }: { view: OperatorDashboardView; actions: OperatorDashboardActions; readOnly?: boolean; unavailable?: Partial<Record<DashboardActionKey, string>> }) {
  const [selected, setSelected] = useState<Record<string, Cefr>>(() => Object.fromEntries(view.pending.filter(item => item.suggestedLevel).map(item => [item.id, item.suggestedLevel!]))) ;
  const inProgress = view.inProgress ?? [];
  const retry = view.retry ?? [];
  const blocked = (key: DashboardActionKey) => unavailable[key];
  const signalItem = (person: LevelSignalPerson, kind: "ready" | "weak" | "flow") => <div className="item" key={person.id}>
    <div className="body"><div className="title">{person.name} <LevelChip level={person.cefr} /> {person.target && <>→ <LevelChip level={person.target} /></>} {person.pendingLevel && <Badge tone="warn">chờ → {person.pendingLevel}</Badge>}</div><div className="xs muted">{person.metrics}</div></div>
    {person.testId && <Button small disabled={Boolean(blocked("viewTest"))} onClick={() => actions.onViewTest(person.testId!)}>Bài thi</Button>}
    {person.challengeId && <Button small disabled={Boolean(blocked("viewChallenge"))} onClick={() => actions.onViewChallenge(person.challengeId!)}>Thử thách</Button>}
    {kind === "weak" && <Button small danger disabled={readOnly || Boolean(blocked("demote"))} onClick={() => actions.onDemote(person.id)}>Hạ mức</Button>}
    {kind !== "flow" && <Button small disabled={readOnly || Boolean(blocked("changeLevel"))} onClick={() => actions.onChangeLevel(person.id)}>Đổi level</Button>}
  </div>;

  return <OperatorPage title="Duyệt trình độ">
    {view.deletionRequests}{view.trash}
    {view.openAppeals > 0 && <Banner tone="warn"><span className="small"><b>{view.openAppeals} kháng nghị chấm điểm đang chờ duyệt tay.</b>{" "}<button className="link-button" onClick={actions.onOpenAppeals}>Mở tab Kháng nghị</button></span></Banner>}
    {view.topicReports.length > 0 && <div className="card"><h3>Báo cáo nhập chủ đề mini game ({view.topicReports.length})</h3><p className="small muted" style={{ margin: "2px 0 8px" }}>Học viên nhập chủ đề sai hoặc vi phạm 3 lần liên tiếp. Nhắc nhở rồi bấm Đã xử lý.</p><div className="list">{view.topicReports.map(report => <div className="item" key={report.id}><div className="body"><div className="title">{report.learnerName} <span className="xs muted">{report.at}</span></div><div className="xs">{report.inputs.map((entry, index) => <div key={index}><code>{entry.input}</code> – {entry.reason}</div>)}</div></div><Button small primary disabled={readOnly} onClick={() => actions.onResolveTopicReport(report.id)}>Đã xử lý</Button></div>)}</div></div>}
      <PageTitle>
      <h1>Duyệt trình độ</h1><p className="muted">{view.week.current != null && view.week.total != null ? <>Tuần {view.week.current}/{view.week.total}</> : <>Chưa có khung tuần</>} · {view.week.topic || <button className="link-button" onClick={actions.onOpenWeeks}>chưa đặt chủ đề</button>} · {view.approved.length} người học đang hoạt động</p>
    </PageTitle>

    <section className="section"><h3>Chờ duyệt ({view.pending.length})</h3>{view.pending.length ? view.pending.map(item => {
      const profileOpen = Boolean(view.expandedPendingProfiles?.[item.id]);
      const profileDetail = view.pendingProfiles?.[item.id];
      const profileSummary = profileDetail ? inlineProfileSummary(profileDetail) : item.profileSummary;
      return <div className="card" key={item.id}>
      <div className="row between operator-card-header"><div><b className="name" style={{ fontFamily: "var(--font-display)", fontSize: "1.05rem" }}>{item.name}</b> <span className="xs muted">nộp {item.submittedAt} · tổng {item.total == null ? "—" : `${item.total}/100`}</span></div><div className="row"><Badge>Điểm thô: <b>&nbsp;{item.rawLevel ?? "—"}</b></Badge>{item.humanScored ? <Badge tone="primary">Đã chấm tay</Badge> : null}{item.aiScored ? <Badge tone="primary">AI chấm</Badge> : <Badge tone="warn">Chưa chấm AI</Badge>}{item.aiSuggestedCefr ? <Badge>AI gợi ý: <b>&nbsp;{item.aiSuggestedCefr}</b></Badge> : null}</div></div>
      <div className="grid cols-2" style={{ marginTop: 10 }}><div className="stack" style={{ gap: 4 }}>{item.sectionScores.map(score => <div className="row" key={score.label}><span className="xs muted" style={{ width: 70 }}>{score.label}</span><div className="progress" style={{ flex: 1 }}><i style={{ width: `${score.percent ?? 0}%` }} /></div><span className="xs" style={{ minWidth: 42, textAlign: "right" }}>{score.percent == null ? "Chờ chấm" : <>{score.percent}%{score.heuristic && <span className="muted" title="Điểm ước lượng theo độ dài, chưa chấm AI">*</span>}</>}</span></div>)}</div>{(item.rationale || item.monthlyGoal) && <div className="small">{item.rationale && <p style={{ margin: 0 }}><b>Nhận xét AI:</b> {item.rationale}</p>}{item.monthlyGoal && <p style={{ margin: item.rationale ? "4px 0 0" : 0 }}><b>Mục tiêu gợi ý:</b> {item.monthlyGoal}</p>}</div>}</div>
      <button className="operator-profile-disclosure" type="button" aria-expanded={profileOpen} disabled={Boolean(blocked("viewProfile"))} onClick={() => { if (actions.onTogglePendingProfile) actions.onTogglePendingProfile(item.id); else actions.onViewProfile(item.id); }}>{profileOpen ? "▼" : "▶"} Hồ sơ: {profileDetail ? profileSummary || "—" : profileSummary || "Chưa điền hồ sơ cá nhân."}</button>
      {profileOpen && profileDetail && <OperatorInlineProfile detail={profileDetail} />}{!item.rationale && <p className="xs muted" style={{ margin: "6px 0 0" }}>Không có nhận xét AI. Xem bài làm để quyết định.</p>}
      <div className="row" style={{ marginTop: 12 }}><select aria-label={`Mức duyệt cho ${item.name}`} style={{ width: "auto" }} value={selected[item.id] ?? ""} onChange={event => setSelected(value => ({ ...value, [item.id]: event.target.value as Cefr }))} disabled={readOnly}><option value="" disabled>Chọn mức</option>{item.levels.map(level => <option value={level} key={level}>{level} – {cefrLabels[level]}</option>)}</select>
        <Button primary disabled={readOnly || !selected[item.id] || Boolean(blocked("approvePlacement"))} onClick={() => selected[item.id] && actions.onApprovePlacement(item.id, selected[item.id]!)}>Duyệt mức</Button><Button disabled={Boolean(blocked("viewTest"))} onClick={() => actions.onViewTest(item.id)}>Xem bài làm</Button>{item.canRescore !== false && <Button title={blocked("rescore") ?? "Chấm lại toàn bộ bài test bằng AI"} disabled={readOnly || Boolean(blocked("rescore")) || item.rescoreBusy} aria-busy={item.rescoreBusy || undefined} onClick={() => actions.onRescore(item.id)}>{item.rescoreBusy ? "Đang chấm lại…" : "Chấm lại bằng AI"}</Button>}<Button small danger={!item.deletionPending} disabled={readOnly || Boolean(blocked("deleteLearner")) || item.deletionPending} onClick={() => actions.onDeleteLearner(item.id)} style={{ marginLeft: "auto" }}>{item.deletionPending ? "Chờ Quản lý duyệt xoá" : "Xoá học viên"}</Button></div>
    </div>;
    }) : <div className="card"><p className="muted" style={{ margin: 0 }}>Không có ai chờ duyệt.</p></div>}</section>

      <section className="section"><h3>Tín hiệu đổi mức <span className="small muted">({view.windowDays ?? 14} ngày gần nhất · <a className="link-button" href="/settings" onClick={event => { event.preventDefault(); actions.onOpenSettings(); }}>ngưỡng</a> · <a className="link-button" href="/op/levelforms" onClick={event => { event.preventDefault(); actions.onOpenLevelForms(); }}>đề thi lên mức</a>)</span></h3><div className="grid cols-2"><div className="card" style={{ background: "var(--mint)" }}><h4 style={{ margin: "0 0 6px" }}>Sẵn sàng thi lên level ({view.ready.length})</h4>{view.ready.length ? <div className="list">{view.ready.map(item => signalItem(item, "ready"))}</div> : <p className="small muted" style={{ margin: 0 }}>Chưa có ai đủ cả 4 tín hiệu.</p>}</div><div className="card" style={{ background: "var(--peach)" }}><h4 style={{ margin: "0 0 6px" }}>Nên xem xét hạ mức ({view.weak.length})</h4>{view.weak.length ? <div className="list">{view.weak.map(item => signalItem(item, "weak"))}</div> : <p className="small muted" style={{ margin: 0 }}>Không ai sai quá ngưỡng hai tuần liền.</p>}</div></div>{view.levelRequests.length > 0 && <div className="card" style={{ marginTop: 12, background: "var(--primary-soft)" }}><h4 style={{ margin: "0 0 8px" }}>Yêu cầu lên mức chờ duyệt ({view.levelRequests.length})</h4>{view.levelRequests.map(request => <div className="item" key={request.id}><div className="body"><div className="title">{request.learnerName} {request.from ? <LevelChip level={request.from} /> : <Badge>mức hiện tại: —</Badge>} → {request.to ? <LevelChip level={request.to} /> : <Badge>mức đích: —</Badge>} <span className="xs muted">gửi {request.sentAt}</span></div><div className="small">Bài thi: <b>{request.testSummary || "—"}</b> · Thử thách Season: {request.challengeSummary || "—"}</div></div><div className="row" style={{ gap: 6 }}>{request.testId && <Button small disabled={Boolean(blocked("viewTest"))} onClick={() => actions.onViewTest(request.testId!)}>Bài thi</Button>}{request.challengeId && <Button small disabled={Boolean(blocked("viewChallenge"))} onClick={() => actions.onViewChallenge(request.challengeId!)}>Thử thách</Button>}<Button small primary disabled={readOnly || !request.to || Boolean(blocked("decideLevelRequest"))} onClick={() => actions.onApproveLevelRequest(request.id)}>Duyệt lên mức</Button><Button small danger disabled={readOnly || Boolean(blocked("decideLevelRequest"))} onClick={() => actions.onRejectLevelRequest(request.id)}>Từ chối</Button></div></div>)}</div>}{view.inFlow.length > 0 && <div className="card" style={{ marginTop: 12 }}><h4 style={{ margin: "0 0 6px" }}>Đang trong luồng lên mức ({view.inFlow.length})</h4><div className="list">{view.inFlow.map(item => signalItem(item, "flow"))}</div></div>}</section>

    <section className="section operator-approved-panel"><h3>Đã duyệt ({view.approved.length})</h3><div className="table-wrap operator-action-table-wrap"><table className="operator-action-table"><thead><tr><th>Người học</th><th>Mức</th><th>Điểm đầu vào</th><th>Mục tiêu tháng</th><th aria-label="Thao tác" /></tr></thead><tbody>{view.approved.length ? view.approved.map(item => <tr key={item.id} data-testid={`approved-${item.id}`}><td data-label="Người học">{item.name}<br /><span className="xs muted">{item.profileSummary}</span></td><td data-label="Mức"><LevelChip level={item.cefr} /> {item.pendingLevel && <Badge tone="warn">chờ → {item.pendingLevel}</Badge>}</td><td data-label="Điểm đầu vào">{item.placementScore == null ? "—" : `${item.placementScore}/100`}</td><td className="small" data-label="Mục tiêu tháng">{item.monthlyGoal || "—"}</td><td data-label="Thao tác"><div className="operator-approved-actions"><Button small disabled={readOnly || Boolean(blocked("changeLevel"))} onClick={() => actions.onChangeLevel(item.id)}>Đổi level</Button><Button small disabled={readOnly || Boolean(blocked("editGoal"))} onClick={() => actions.onEditGoal(item.id)}>Mục tiêu</Button>{item.testId && <Button small disabled={Boolean(blocked("viewTest"))} onClick={() => actions.onViewTest(item.testId!)}>Bài test</Button>}<Button small className="operator-approved-weekly-action" disabled={readOnly || !actions.onAssignWeeklyPractice || Boolean(blocked("assignWeeklyPractice"))} onClick={() => actions.onAssignWeeklyPractice?.(item.id)}>Giao bài tuần</Button><Button small disabled={Boolean(blocked("viewProfile"))} onClick={() => actions.onViewProfile(item.id)}>Hồ sơ</Button></div></td></tr>) : <tr><td colSpan={5} className="muted">Chưa có.</td></tr>}</tbody></table></div></section>

    {inProgress.length > 0 && <section className="section"><h3>Đang làm test ({inProgress.length})</h3><div className="list">{inProgress.map(item => <div className="item" key={item.id}><div className="body"><div className="title">{item.name}</div><div className="xs muted">Đã bắt đầu bài test · {item.profileSummary || "Chưa điền hồ sơ"}</div></div><Button small disabled={Boolean(blocked("viewProfile"))} onClick={() => actions.onViewProfile(item.id)}>Hồ sơ</Button></div>)}</div></section>}

    {retry.length > 0 && <section className="section"><h3>Cần làm lại ({retry.length})</h3><div className="list">{retry.map(item => <div className="item" key={item.id}><div className="body"><div className="title">{item.name}</div><div className="xs muted">Bài test cần làm lại · {item.profileSummary || "Chưa điền hồ sơ"}</div></div><Button small primary disabled={readOnly || Boolean(blocked("setLevelDirect"))} onClick={() => actions.onSetLevelDirect(item.id)}>Đánh giá thủ công</Button>{item.hasProfile && <Button small disabled={Boolean(blocked("viewProfile"))} onClick={() => actions.onViewProfile(item.id)}>Hồ sơ</Button>}</div>)}</div></section>}

    {view.unassessed.length > 0 && <section className="section"><h3>Chưa làm test ({view.unassessed.length})</h3><div className="list">{view.unassessed.map(item => <div className="item" key={item.id}><div className="body"><div className="title">{item.name}</div><div className="xs muted">Chưa bắt đầu bài test · {item.profileSummary || "Chưa điền hồ sơ"}</div></div>{item.hasProfile && <Button small disabled={Boolean(blocked("viewProfile"))} onClick={() => actions.onViewProfile(item.id)}>Hồ sơ</Button>}</div>)}</div></section>}
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
    ["Phong cách Season", profile.persona === "formal" ? "Formal · Trang trọng" : "Informal · Thân thiện"],
    ["Lịch học", [profile.durationMinutes ? `${profile.durationMinutes} phút/buổi` : "", "5 ngày/tuần (T2–T6)", inlineProfileLabel("device", profile.device)].filter(Boolean).join(" · ")],
    ["Tự đánh giá", inlineProfileLabel("selfLevel", profile.selfLevel)]
  ].filter((row): row is [string, string] => Boolean(row[1]));
  return <section className="card soft operator-inline-profile" aria-label="Hồ sơ cá nhân"><b>Hồ sơ cá nhân</b><div className="operator-profile-rows">{rows.map(([label, value]) => <div className="operator-profile-row" key={label}><span className="small muted operator-profile-label">{label}</span><span className="small operator-profile-value">{value}</span></div>)}</div></section>;
}
