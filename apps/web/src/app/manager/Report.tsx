import { useState } from "react";
import type { ManagerReportView } from "@e4s/contracts";
import { Printer } from "lucide-react";
import { Badge, PageTitle, copyText, downloadText, formatDate, percent } from "./shared.js";

export type ManagerReportProps = { view: ManagerReportView; courseTheme?: string; pilotStartDate?: string; managerName?: string };

const REPORT_SECTION_TITLES_SOURCE = [
  "1. Ba chỉ số của pilot",
  "2. Quy mô và hoạt động",
  "3. Từng học viên",
  "4. Phản hồi khảo sát",
  "5. Việc cần làm tiếp"
] as const;
const REPORT_SECTION_TITLES = REPORT_SECTION_TITLES_SOURCE;

export function ManagerReport({ view, courseTheme, pilotStartDate, managerName }: ManagerReportProps) {
  const [exportStatus, setExportStatus] = useState("");
  const model = buildManagerReportModel(view);
  const text = buildManagerReportText(view);
  const { active, metrics, atRisk, notStarted, levelDistribution, hasLevelDistribution, measured, passed, failed, sortedActive } = model;
  const summaryBackground = !measured.length ? "var(--surface-2)" : passed.length === measured.length ? "var(--mint)" : passed.length ? "var(--butter)" : "var(--peach)";
  const copyReport = async () => {
    setExportStatus("Đang sao chép báo cáo…");
    try { await copyText(text); setExportStatus("Đã sao chép báo cáo."); }
    catch { setExportStatus("Không thể sao chép báo cáo trên thiết bị này."); }
  };
  const downloadReport = () => {
    try { downloadText("bao-cao-e4s.txt", text, "text/plain;charset=utf-8"); setExportStatus("Đã tải báo cáo dạng .txt."); }
    catch { setExportStatus("Không thể tải báo cáo dạng .txt."); }
  };
  return <div className="manager-page manager-report-page">
    <PageTitle actions={<><button className="btn btn-primary" type="button" onClick={() => { window.print(); setExportStatus("Đã mở hộp thoại in."); }}><Printer size={16} strokeWidth={2} aria-hidden="true" /> In / Lưu PDF</button><button className="btn" type="button" onClick={() => void copyReport()}>Copy bản chữ</button><button className="btn" type="button" onClick={downloadReport}>Tải .txt</button><span className="sr-only" role="status" aria-label="Trạng thái xuất báo cáo" aria-live="polite">{exportStatus}</span></>}><h1>Báo cáo tổng kết</h1><p className="muted">Tổng hợp tự động theo ba chỉ số của PRD. Bấm In để in hoặc lưu thành PDF.</p></PageTitle>
    <article className="report"><header className="rhead"><div><div className="eyebrow">Báo cáo pilot</div><h2>Season English · {view.organizationName}</h2>{courseTheme ? <div className="small" style={{ fontWeight: 700 }}>Chủ đề khoá: {courseTheme}</div> : null}</div><div className="meta">Ngày lập: {formatDate(view.generatedAt)}<br />Giai đoạn: tuần {view.currentWeek}/{view.pilotWeeks}{pilotStartDate ? ` (từ ${formatShortDate(pilotStartDate)})` : ""}<br />Học viên: {active.length} đang học · {view.learners.length} đăng ký{managerName ? <><br />Người lập: {managerName}</> : null}</div></header>
      <div className="summary" role="status" aria-live="polite" style={{ background: summaryBackground }}><div className="eyebrow" style={{ color: "var(--text)", marginBottom: 2 }}>Tóm tắt</div>{!active.length ? "Chưa có học viên nào được duyệt mức, nên chưa có số liệu để đánh giá." : <>Đến tuần {view.currentWeek}/{view.pilotWeeks}, pilot đạt <b>{passed.length}/{measured.length}</b> chỉ số đã đo được{measured.length < 3 ? ` (${3 - measured.length} chỉ số chưa có dữ liệu)` : ""}. {passed.length ? <>Đạt: {passed.map((metric) => metric[0].toLowerCase()).join(", ")}. </> : null}{failed.length ? <>Chưa đạt: {failed.map((metric) => `${metric[0].toLowerCase()} (${metric[2]}${metric[3]}, ngưỡng ${metric[5]})`).join(", ")}. </> : null}{atRisk.length ? <><b>{atRisk.length} học viên đã bỏ từ 2 ngày trở lên</b> và cần được nhắc.</> : "Không có học viên nào bỏ từ 2 ngày trở lên."}</>}</div>
      <h3>{model.sections[0].title}</h3><div className="table-wrap"><table aria-label="Ba chỉ số của pilot"><thead><tr><th>Chỉ số</th><th>Kết quả</th><th>Mức đạt</th><th>Ngưỡng</th><th>Đánh giá</th></tr></thead><tbody>{metrics.map((metric) => <tr key={metric[0]}><td><b>{metric[0]}</b><div className="xs muted">{metric[1]}</div></td><td>{metric[6] ? <><b style={{ fontFamily: "var(--font-display)", fontSize: "1.25rem" }}>{metric[2]}{metric[3]}</b><div className="xs muted">{metric[4]}</div></> : "—"}</td><td>{metric[6] ? <div className={`progress ${metric[7] ? "ok" : "danger"}`} role="progressbar" aria-label={`Mức đạt ${metric[0]}`} aria-valuemin={0} aria-valuemax={metric[3] === "/5" ? 5 : 100} aria-valuenow={metric[2]}><i style={{ width: `${Math.min(100, metric[3] === "/5" ? metric[2] * 20 : metric[2])}%` }} /></div> : null}</td><td>{metric[5]}</td><td><Badge tone={!metric[6] ? "" : metric[7] ? "ok" : "danger"}>{!metric[6] ? "Chưa có dữ liệu" : metric[7] ? "Đạt" : "Chưa đạt"}</Badge></td></tr>)}</tbody></table></div>
      {view.regularByWeek?.length ? <div><div className="eyebrow">Tỉ lệ học đều theo tuần</div>{view.regularByWeek.map((week) => <div className="barrow" key={week.week}><span style={{ width: 64 }}>Tuần {week.week}</span><div className={`progress ${week.percent >= 70 ? "ok" : "warn"}`} role="progressbar" aria-label={`Tỉ lệ học đều tuần ${week.week}`} aria-valuemin={0} aria-valuemax={100} aria-valuenow={week.percent}><i style={{ width: `${week.percent}%` }} /></div><b style={{ width: 44, textAlign: "right" }}>{week.percent}%</b></div>)}</div> : null}
      <h3>{model.sections[1].title}</h3><div className="grid cols-2 manager-report-scale"><div className="manager-report-level-distribution"><div className="eyebrow">Phân bố trình độ</div>{hasLevelDistribution ? levelDistribution.map((level) => <div className="barrow" data-empty={level.learners === 0 ? "true" : undefined} key={level.cefr}><span style={{ width: 64 }}><Badge tone="primary">{level.cefr}</Badge></span><div className="progress" role="progressbar" aria-label={`Phân bố trình độ ${level.cefr}`} aria-valuemin={0} aria-valuemax={active.length || 1} aria-valuenow={level.learners}><i style={{ width: `${percent(level.learners, active.length)}%` }} /></div><b style={{ width: 60, textAlign: "right" }}>{level.learners} người</b></div>) : <p className="muted">Chưa có học viên được duyệt mức.</p>}</div><table className="manager-report-activity-table" aria-label="Quy mô và hoạt động"><tbody><tr><td>Bộ bài đã duyệt</td><td><b>{view.totals?.approvedLessonSets ?? "—"}</b> bộ · {view.totals?.approvedLessons ?? "—"} bài</td></tr><tr><td>Lượt luyện với Season</td><td><b>{view.totals?.coachTurns ?? "—"}</b></td></tr><tr><td>Bài thực hành cuối tuần</td><td><span>{view.totals?.practiceSubmissions ?? "—"} đã nộp · {view.totals?.reviewedPracticeSubmissions ?? "—"} đã đọc mẫu</span></td></tr><tr><td>Lượt nhắc học</td><td><b>{view.totals?.reminders ?? "—"}</b></td></tr><tr><td>Kháng nghị chấm điểm</td><td><b>{view.totals?.appeals ?? "—"}</b> · {view.totals?.pendingAppeals ?? "—"} chờ xử lý</td></tr></tbody></table></div>
      <h3>{model.sections[2].title}</h3>{active.length ? <div className="table-wrap"><table><thead><tr><th>Học viên</th><th>Mức</th><th>Buổi tuần này</th><th>Bài</th><th>Lượt coach</th><th>Bài cuối tuần</th><th>Điểm đầu vào</th><th>Cấp ngỗng</th><th>Tình trạng</th></tr></thead><tbody>{sortedActive.map((learner) => { const reward = reportRewardLevel(learner.rewardPoints, learner.earnedBadges, learner.earnedBadgeDetails); return <tr key={learner.learnerId}><td><b>{learner.learnerName}</b></td><td><Badge tone="primary">{learner.cefr}</Badge></td><td>{learner.sessionsThisWeek}/5</td><td>{learner.totalLessonsThisWeek ? `${learner.completedLessons}/${learner.totalLessonsThisWeek}` : "—"}</td><td>{learner.coachTurnsThisWeek}</td><td>{learner.weeklyPracticeScore ?? (learner.weeklyPracticeStatus === "pending_review" ? "chờ chấm" : "chưa nộp")}</td><td>{learner.placementScore ?? "—"}</td><td>{reward.icon} {reward.index + 1} · ★{learner.rewardPoints}</td><td><Badge tone={(learner.missedDays ?? 0) >= 2 ? "danger" : learner.sessionsThisWeek ? "ok" : "warn"}>{(learner.missedDays ?? 0) >= 2 ? `Bỏ ${learner.missedDays} ngày` : learner.sessionsThisWeek ? "Đang học" : "Chưa học tuần này"}</Badge></td></tr>; })}</tbody></table></div> : <p className="muted">Chưa có học viên được duyệt mức.</p>}
      <h3>{model.sections[3].title}</h3>{view.surveyResponses?.length ? view.surveyResponses.map((survey) => <div className="barrow" key={`${survey.learnerId}-${survey.submittedAt}`}><Badge tone={survey.rating >= 4 ? "ok" : survey.rating >= 3 ? "warn" : "danger"}>{survey.rating}/5</Badge><span><b>{survey.learnerName}</b>{survey.comment ? `: “${survey.comment}”` : ""}{survey.studyTime ? <span className="muted"> ({studyTime(survey.studyTime)})</span> : null}</span></div>) : <p className="muted">Chưa có phản hồi.</p>}
      <h3>{model.sections[4].title}</h3><ul className="manager-next-actions" aria-label="Việc cần làm tiếp">{atRisk.length ? <ReportAction title="Nhắc học ngay" detail={`${atRisk.length} học viên đã bỏ từ 2 ngày`} names={atRisk.map((item) => ({ id: item.learnerId, label: item.learnerName }))} /> : null}{notStarted.length ? <ReportAction title="Khuyến khích bắt đầu tuần" detail={`${notStarted.length} học viên chưa học buổi nào trong tuần này`} names={notStarted.map((item) => ({ id: item.learnerId, label: item.learnerName }))} /> : null}{view.learners.length - active.length ? <ReportAction title="Theo dõi duyệt trình độ" detail={`${view.learners.length - active.length} người đăng ký chưa được duyệt mức.`} /> : null}{view.totals?.pendingAppeals ? <ReportAction title="Theo dõi xử lý kháng nghị" detail={`${view.totals.pendingAppeals} kháng nghị chấm điểm đang chờ Vận hành.`} /> : null}{!view.progress.surveyCount ? <ReportAction title="Thu phản hồi hài lòng" detail="Chưa có khảo sát hài lòng." /> : null}{!atRisk.length && !notStarted.length && view.learners.length === active.length && !view.totals?.pendingAppeals && view.progress.surveyCount ? <ReportAction title="Không có việc tồn đọng" detail="Các chỉ số hiện không cần hành động thêm." /> : null}</ul>
      <footer className="foot">Số liệu tính tự động từ dữ liệu hệ thống tại thời điểm lập báo cáo. Ngưỡng theo PRD: học đều ≥70%, học đến cuối ≥60%, hài lòng ≥4/5.</footer>
    </article>
  </div>;
}

function ReportAction({ title, detail, names }: { title: string; detail: string; names?: readonly { id: string; label: string }[] }) {
  return <li className="manager-next-action"><div className="manager-next-action-copy"><b>{title}</b><span className="small muted">{detail}</span>{names?.length ? <div className="manager-next-action-names">{names.map((item) => <span key={item.id}>{item.label}</span>)}</div> : null}</div></li>;
}

function studyTime(value: "work" | "outside" | "both") { return value === "work" ? "trong giờ" : value === "outside" ? "ngoài giờ" : "cả hai"; }
function formatShortDate(value: string) { const [, month, day] = value.slice(0, 10).split("-"); return day && month ? `${day}/${month}` : value; }
function reportRisk(learner: ManagerReportView["learners"][number]) { return (learner.missedDays ?? 0) >= 2 ? 2 : learner.sessionsThisWeek === 0 ? 1 : 0; }
function reportRewardLevel(points: number, badges: readonly string[], details?: readonly { key: string }[]) { const aliases: Record<string, string> = { starter: "first", week_complete: "week", streak5: "streak7", first_try: "sharp", wordsmith: "words", coach_friend: "chat" }; const has = new Set([...badges, ...(details ?? []).map((badge) => badge.key)].map((key) => aliases[key] ?? key)); const levels = [{ icon: "🌱", min: 0, required: [] }, { icon: "☀️", min: 60, required: ["first", "streak3"] }, { icon: "🍂", min: 180, required: ["week", "friday", "chat"] }, { icon: "❄️", min: 360, required: ["streak7", "sharp", "words"] }]; let index = 0; while (index + 1 < levels.length) { const next = levels[index + 1]!; if (points < next.min || !next.required.every((id) => has.has(id))) break; index++; } return { ...levels[index]!, index }; } // media-scan: allow-avatar-reward -- deliberate reward symbols

export function buildManagerReportModel(view: ManagerReportView) {
  const active = view.learners.filter((learner) => learner.cefr !== null);
  const regular = percent(view.progress.activeLearnersThisWeek, active.length);
  const completed = percent(view.progress.completedLearners, active.length);
  const metrics = [
    ["Học đều", "≥3 buổi mỗi tuần", regular, "%", `${view.progress.activeLearnersThisWeek}/${active.length} người`, "≥ 70%", active.length > 0, regular >= 70],
    ["Học đến cuối", "hoàn thành các tuần đã qua", completed, "%", `${view.progress.completedLearners}/${active.length} người`, "≥ 60%", active.length > 0, completed >= 60],
    ["Hài lòng", "điểm khảo sát trung bình", view.progress.satisfactionAverage ?? 0, "/5", `${view.progress.surveyCount} phản hồi`, "≥ 4/5", view.progress.surveyCount > 0, (view.progress.satisfactionAverage ?? 0) >= 4]
  ] as const;
  const atRisk = active.filter((learner) => (learner.missedDays ?? 0) >= 2);
  const notStarted = active.filter((learner) => learner.sessionsThisWeek === 0 && (learner.missedDays ?? 0) < 2);
  const levelDistribution = (["A1", "A2", "B1", "B2", "C1"] as const)
    .map((cefr) => ({ cefr, learners: view.levelDistribution?.find((level) => level.cefr === cefr)?.learners ?? 0 }));
  const hasLevelDistribution = Boolean(view.levelDistribution?.length);
  const measured = metrics.filter((metric) => metric[6]);
  const passed = measured.filter((metric) => metric[7]);
  const failed = measured.filter((metric) => !metric[7]);
  const sortedActive = active.slice().sort((left, right) => reportRisk(right) - reportRisk(left) || left.learnerName.localeCompare(right.learnerName));

  const actionLines = [
    ...(atRisk.length ? [`Nhắc ${atRisk.length} học viên đã bỏ từ 2 ngày: ${atRisk.map((item) => item.learnerName).join(", ")}.`] : []),
    ...(notStarted.length ? [`${notStarted.length} học viên chưa học buổi nào trong tuần này: ${notStarted.map((item) => item.learnerName).join(", ")}.`] : []),
    ...(view.learners.length - active.length ? [`${view.learners.length - active.length} người đăng ký chưa được duyệt mức.`] : []),
    ...(view.totals?.pendingAppeals ? [`${view.totals.pendingAppeals} kháng nghị chấm điểm chờ Vận hành xử lý.`] : []),
    ...(!view.progress.surveyCount ? ["Chưa có khảo sát hài lòng."] : [])
  ];
  if (!actionLines.length) actionLines.push("Không có việc tồn đọng.");

  const sections = [
    { title: REPORT_SECTION_TITLES[0], lines: metrics.map((metric) => `${metric[0]}: ${metric[6] ? `${metric[2]}${metric[3]} (${metric[4]}; ngưỡng ${metric[5]}; ${metric[7] ? "Đạt" : "Chưa đạt"})` : "Chưa có dữ liệu"}`) },
    { title: REPORT_SECTION_TITLES[1], lines: [
      hasLevelDistribution ? `Phân bố trình độ: ${levelDistribution.map((level) => `${level.cefr} ${level.learners}`).join(" · ")}` : "Chưa có học viên được duyệt mức.",
      `Bộ bài đã duyệt: ${view.totals?.approvedLessonSets ?? "—"} bộ · ${view.totals?.approvedLessons ?? "—"} bài`,
      `Lượt luyện với Season: ${view.totals?.coachTurns ?? "—"}`,
      `Bài thực hành cuối tuần: ${view.totals?.practiceSubmissions ?? "—"} đã nộp · ${view.totals?.reviewedPracticeSubmissions ?? "—"} đã đọc mẫu`,
      `Lượt nhắc học: ${view.totals?.reminders ?? "—"}`,
      `Kháng nghị chấm điểm: ${view.totals?.appeals ?? "—"} · ${view.totals?.pendingAppeals ?? "—"} chờ xử lý`
    ] },
    { title: REPORT_SECTION_TITLES[2], lines: sortedActive.length ? sortedActive.map((learner) => `- ${learner.learnerName} (${learner.cefr}): ${learner.sessionsThisWeek} buổi, ${learner.completedLessons}/${learner.totalLessonsThisWeek} bài, ★${learner.rewardPoints}`) : ["Chưa có học viên được duyệt mức."] },
    { title: REPORT_SECTION_TITLES[3], lines: view.surveyResponses?.length ? view.surveyResponses.map((survey) => `- ${survey.learnerName}: ${survey.rating}/5${survey.comment ? ` – ${survey.comment}` : ""}${survey.studyTime ? ` (${studyTime(survey.studyTime)})` : ""}`) : ["Chưa có phản hồi."] },
    { title: REPORT_SECTION_TITLES[4], lines: actionLines }
  ] as const;
  return { active, metrics, atRisk, notStarted, levelDistribution, hasLevelDistribution, measured, passed, failed, sortedActive, sections };
}

export function buildManagerReportText(view: ManagerReportView) {
  const model = buildManagerReportModel(view);
  return [
    `BÁO CÁO PILOT SEASON ENGLISH – ${view.organizationName} – ${formatDate(view.generatedAt)}`,
    `Tuần ${view.currentWeek}/${view.pilotWeeks}`,
    ...model.sections.flatMap((section) => ["", section.title!.toLocaleUpperCase("vi-VN"), ...section.lines])
  ].join("\n");
}
