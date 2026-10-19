import { createContext, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useLocation, useNavigate } from "react-router";
import "./styles.css";
import type {
  AssessmentLevelFormSlotView,
  AssessmentLevelFormDetailView,
  AssessmentReviewChallengeView,
  AssessmentReviewLearnerView,
  AssessmentReviewOverviewView,
  CefrLevel,
  ContentLessonDraftInput,
  ContentLessonMatrixView,
  ContentLessonSetVersionView,
  ContentPromptKey,
  ContentPromptSettingsView,
  ContentReviewTabKey,
  ContentReviewAssessmentDetailView,
  ContentReviewView,
  ContentWeekFrameView,
  SessionView,
  SystemCapabilitiesView
} from "@e4s/contracts";
import { operatorApiClient as apiClient } from "../../api/operator.js";
import { OperatorDashboard } from "./Dashboard.js";
import { OperatorLevelFormDetail, OperatorLevelForms } from "./LevelForms.js";
import { OperatorLessonSet, OperatorLessons } from "./Lessons.js";
import { emptyLesson, LessonFormEditor } from "./LessonFormEditor.js";
import { OperatorPrompts } from "./Prompts.js";
import { OperatorReview, OperatorReviewAssessmentDetail } from "./Review.js";
import { OperatorWeeks } from "./Weeks.js";
import { Badge, Banner } from "./primitives.js";
import { ModalProvider, useModal } from "../shared/ModalProvider.js";
import { adaptAssessmentOverview, adaptLevelForms, adaptLessonMatrix, adaptLessonSet, adaptPrompts, adaptReview, adaptWeeks } from "./adapters.js";
import type { Cefr, PromptKey, ReviewTab, WeekSuggestion } from "./types.js";

export type OperatorApiClient = typeof apiClient;

type OperatorRoutePaths = {
  root: string;
  levelForms: string;
  weeks: string;
  lessons: string;
  review: string;
  prompts: string;
};

const defaultOperatorRoutePaths = routePathsFor("/op");
const OperatorRoutePathsContext = createContext<OperatorRoutePaths>(defaultOperatorRoutePaths);

const unavailable = (feature: string) => `API hiện chưa cung cấp ${feature}.`;
const reviewToApi: Record<ReviewTab, ContentReviewTabKey> = { subs: "submissions", coach: "coach", micro: "micro", appeals: "appeals", attempts: "attempts", tests: "assessments" };
const promptToApi: Record<PromptKey, ContentPromptKey> = { base: "system_rules", placement: "assessment_scoring", lesson: "weekly_lessons", weeks: "week_suggestions", mgrade: "micro_grading", coach: "coach_dialogue", grade: "weekly_practice_grading" };

type OperatorDashboardDialog =
  | { kind: "challenge"; detail: AssessmentReviewChallengeView; learnerName: string }
  | { kind: "profile"; detail: AssessmentReviewLearnerView };

const operatorProfileOptions: Record<string, Record<string, string>> = {
  goals: { customer: "Nói chuyện với khách hàng / đối tác", email: "Viết email, tin nhắn công việc", meeting: "Họp và trình bày", docs: "Đọc tài liệu, spec kỹ thuật", career: "Thăng tiến / phỏng vấn", confidence: "Tự tin hơn khi nói" },
  environmentUse: { daily: "Hằng ngày", weekly: "Vài lần mỗi tuần", monthly: "Thỉnh thoảng (vài lần/tháng)", rarely: "Hiếm khi / chưa dùng" },
  familyUse: { daily: "Hằng ngày (người thân nói tiếng Anh)", weekly: "Vài lần mỗi tuần", monthly: "Thỉnh thoảng", never: "Không dùng", none: "Không dùng" },
  habits: { movies: "Xem phim / video tiếng Anh", music: "Nghe nhạc / podcast", podcast: "Nghe nhạc / podcast", reading: "Đọc tin tức, tài liệu", documents: "Đọc tin tức, tài liệu", social: "Mạng xã hội, chat tiếng Anh", speak: "Nói chuyện với người nước ngoài", app: "Học qua app / khoá học", none: "Chưa có thói quen nào" },
  learningStyles: { reading: "Đọc và ghi chú", listening: "Nghe và nhắc lại", speaking: "Nói / hội thoại", quiz: "Trắc nghiệm, điền từ", writing: "Viết câu, viết email", examples: "Ví dụ sát việc đang làm", games: "Thử thách ngắn, có điểm" },
  device: { phone: "Điện thoại", computer: "Máy tính", laptop: "Máy tính", both: "Cả hai" },
  selfLevel: { unknown: "Không rõ", A1: "Mới bắt đầu (A1)", A2: "Sơ cấp (A2)", B1: "Trung cấp (B1)", B2: "Khá (B2)", C1: "Tốt (C1)" },
  certificate: { ielts: "IELTS", toeic: "TOEIC", toefl: "TOEFL iBT", cambridge: "Cambridge (KET/PET/FCE/CAE)", vstep: "VSTEP", other: "Khác" }
};

function operatorProfileLabel(group: string, value: string | undefined): string {
  return value ? operatorProfileOptions[group]?.[value] ?? value : "";
}

function operatorProfileLabels(group: string, values: readonly string[] | undefined): string {
  return (values ?? []).map(value => operatorProfileLabel(group, value)).filter(Boolean).join(", ");
}

function formatOperatorCertificate(certificate: { type: string; result: string; year?: string }): string {
  const name = operatorProfileLabel("certificate", certificate.type);
  return [name, certificate.result, certificate.year ? `(${certificate.year})` : ""].filter(Boolean).join(" ");
}

export function OperatorRouteController({ session, client = apiClient, basePath = "/op" }: { session: SessionView; client?: OperatorApiClient; basePath?: "/op" | "/mgr/ops" }) {
  const paths = routePathsFor(basePath);
  return <ModalProvider><OperatorRoutePathsContext.Provider value={paths}><OperatorRouteControllerContent session={session} client={client} paths={paths} /></OperatorRoutePathsContext.Provider></ModalProvider>;
}

function OperatorRouteControllerContent({ session, client, paths }: { session: SessionView; client: OperatorApiClient; paths: OperatorRoutePaths }) {
  const location = useLocation();
  if (session.role !== "operator" && session.role !== "manager") return <Status tone="error">Tài khoản này không có quyền mở khu vực vận hành.</Status>;
  const readOnly = session.role === "manager";
  const props = { client, readOnly };
  const detail = location.pathname.match(new RegExp(`^${escapeRegExp(paths.lessons)}/(\\d+)/(A1|A2|B1|B2|C1)$`));
  const content = detail ? <LessonSetRoute {...props} week={Number(detail[1])} cefr={detail[2] as Cefr} />
    : location.pathname === paths.root ? <DashboardRoute {...props} />
      : location.pathname === paths.levelForms ? <LevelFormsRoute {...props} />
        : location.pathname === paths.weeks ? <WeeksRoute {...props} />
          : location.pathname === paths.lessons ? <LessonsRoute {...props} />
            : location.pathname === paths.review ? <ReviewRoute {...props} />
              : location.pathname === paths.prompts ? <PromptsRoute {...props} />
                : <Status tone="error">Đường dẫn vận hành không tồn tại.</Status>;
  return readOnly ? <div className="manager-operator-inspection" data-read-only-inspection="true"><div className="manager-inspection-context" role="note"><b>Chế độ xem của Quản lý</b><span>Đang xem dữ liệu vận hành ở chế độ chỉ đọc; các thao tác thay đổi bị tắt.</span></div>{content}</div> : content;
}

function routePathsFor(basePath: "/op" | "/mgr/ops"): OperatorRoutePaths {
  return {
    root: basePath === "/op" ? basePath : `${basePath}/levels`,
    levelForms: basePath === "/op" ? `${basePath}/levelforms` : `${basePath}/level-forms`,
    weeks: `${basePath}/weeks`,
    lessons: `${basePath}/lessons`,
    review: `${basePath}/review`,
    prompts: `${basePath}/prompts`
  };
}

function useOperatorRoutePaths(): OperatorRoutePaths {
  return useContext(OperatorRoutePathsContext);
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function Status({ children, tone = "loading" }: { children: ReactNode; tone?: "loading" | "error" }) {
  return <section className={`card ${tone === "error" ? "danger" : ""}`} role={tone === "error" ? "alert" : "status"}><div className="row">{tone === "loading" && <span className="spinner" aria-hidden="true" />}<p>{children}</p></div></section>;
}

function useCapabilities(client: OperatorApiClient) {
  const [capabilities, setCapabilities] = useState<SystemCapabilitiesView | null>(null);
  useEffect(() => { if (typeof client.getSystemCapabilities !== "function") return; void client.getSystemCapabilities().then(setCapabilities).catch(() => setCapabilities(null)); }, [client]);
  return capabilities;
}

function DashboardRoute({ client, readOnly }: { client: OperatorApiClient; readOnly: boolean }) {
  const modal = useModal();
  const navigate = useNavigate();
  const paths = useOperatorRoutePaths();
  const [data, setData] = useState<AssessmentReviewOverviewView>();
  const [weekFrame, setWeekFrame] = useState<ContentWeekFrameView>();
  const [error, setError] = useState<string>();
  const [assessmentDialog, setAssessmentDialog] = useState<ContentReviewAssessmentDetailView>();
  const [dialog, setDialog] = useState<OperatorDashboardDialog>();
  const [rescoreBusy, setRescoreBusy] = useState<string>();
  const [actionError, setActionError] = useState<string>();
  const capabilities = useCapabilities(client);
  const load = () => client.getAssessmentReviewOverview().then(setData).catch(reason => setError(message(reason)));
  useEffect(() => { void load(); }, [client]);
  useEffect(() => {
    if (typeof client.getContentWeeks !== "function") return;
    void client.getContentWeeks().then(setWeekFrame).catch(() => setWeekFrame(undefined));
  }, [client]);
  if (error) return <Status tone="error">Không tải được duyệt trình độ: {error}</Status>;
  if (!data) return <Status>Đang tải duyệt trình độ…</Status>;
  const currentWeek = weekFrame?.weeks.find(week => week.current);
  const view = adaptAssessmentOverview(data, {
    aiConnected: capabilities?.ai ?? false,
    openAppeals: 0,
    rescoreBusy,
    ...(currentWeek ? { currentWeek: currentWeek.weekNumber, topic: currentWeek.topic } : {}),
    ...(weekFrame ? { pilotWeeks: weekFrame.pilot.weekCount } : {})
  });
  const targetFor = (attemptId: string) => view.levelRequests.find(item => item.id === attemptId)?.to;
  const learnerIdFor = (id: string) => data.pendingAssessments.find(item => item.attemptId === id)?.learnerId ?? id;
  const refresh = (promise: Promise<unknown>) => void promise.then(() => { setActionError(undefined); return load(); }).catch(reason => setActionError(message(reason)));
  const missing = {
    ...(typeof client.decideAssessment !== "function" ? { approvePlacement: unavailable("endpoint duyệt mức đầu vào"), decideLevelRequest: unavailable("endpoint xử lý yêu cầu lên mức") } : {}),
    ...(typeof client.getContentReviewAssessment !== "function" ? { viewTest: unavailable("endpoint xem chi tiết bài test của học viên") } : {}),
    ...(typeof client.getAssessmentReviewChallenge !== "function" ? { viewChallenge: unavailable("endpoint xem thử thách của học viên") } : {}),
    ...(typeof client.changeAssessmentReviewLearnerLevel !== "function" ? { changeLevel: unavailable("endpoint đổi level trực tiếp"), demote: unavailable("endpoint hạ mức"), setLevelDirect: unavailable("endpoint xếp mức trực tiếp") } : {}),
    ...(typeof client.updateAssessmentReviewMonthlyGoal !== "function" ? { editGoal: unavailable("endpoint sửa mục tiêu tháng") } : {}),
    ...(typeof client.getAssessmentReviewLearner !== "function" ? { viewProfile: unavailable("endpoint đọc hồ sơ theo học viên") } : {}),
    ...(typeof client.requestAssessmentReviewLearnerDeletion !== "function" ? { deleteLearner: unavailable("endpoint xoá học viên") } : {}),
    ...(typeof client.rescoreAssessment !== "function"
      ? { rescore: unavailable("endpoint chấm lại bài test bằng AI") }
      : capabilities && !capabilities.ai
        ? { rescore: unavailable("AI chưa được cấu hình trên máy chủ") }
        : {})
  };
  const showAttempt = (attemptId: string) => {
    if (typeof client.getContentReviewAssessment !== "function") return;
    void client.getContentReviewAssessment(attemptId).then(detail => { setActionError(undefined); setAssessmentDialog(detail); }).catch(reason => setActionError(message(reason)));
  };
  const showChallenge = (attemptId: string) => void client.getAssessmentReviewChallenge(attemptId).then(detail => { setActionError(undefined); setDialog({ kind: "challenge", detail, learnerName: view.levelRequests.find(item => item.id === attemptId)?.learnerName ?? "" }); }).catch(reason => setActionError(message(reason)));
  const showProfile = (learnerId: string) => void client.getAssessmentReviewLearner(learnerId).then(detail => { setActionError(undefined); setDialog({ kind: "profile", detail }); }).catch(reason => setActionError(message(reason)));
  const changeLevel = async (learnerId: string, mode: "direct" | "scheduled" | "recommend_lower") => {
    if (readOnly) return;
    const ordered: CefrLevel[] = ["A1", "A2", "B1", "B2", "C1"];
    const currentLevel = [...view.weak, ...view.approved, ...view.ready].find(item => item.id === learnerId)?.cefr;
    const lowerIndex = currentLevel ? ordered.indexOf(currentLevel) - 1 : -1;
    const targetLevel = mode === "recommend_lower" && lowerIndex >= 0
      ? ordered[lowerIndex]
      : await modal.prompt({ title: "Chọn mức CEFR đích", label: "Mức CEFR (A1/A2/B1/B2/C1)", confirmLabel: "Tiếp tục" }) as CefrLevel | null;
    if (!targetLevel || !(["A1", "A2", "B1", "B2", "C1"] as string[]).includes(targetLevel)) return;
    const reason = (await modal.prompt({ title: "Lý do thay đổi mức", label: "Lý do", confirmLabel: "Tiếp tục" }))?.trim();
    if (!reason) return;
    const evidence = (await modal.prompt({ title: "Bằng chứng thay đổi mức", label: "Bằng chứng / ghi chú", confirmLabel: "Xác nhận" }))?.trim() ?? "Operator review";
    refresh(client.changeAssessmentReviewLearnerLevel(learnerId, { mode, targetLevel, reason, evidence }));
  };
  const editGoal = async (learnerId: string) => {
    if (readOnly) return;
    const goal = (await modal.prompt({ title: "Cập nhật mục tiêu tháng", label: "Mục tiêu tháng mới", confirmLabel: "Lưu" }))?.trim();
    if (goal) refresh(client.updateAssessmentReviewMonthlyGoal(learnerId, goal));
  };
  const requestDeletion = async (learnerId: string) => {
    if (readOnly) return;
    const reason = (await modal.prompt({ title: "Yêu cầu xoá học viên", message: "Yêu cầu sẽ được chuyển cho Quản lý duyệt.", label: "Lý do", confirmLabel: "Gửi yêu cầu", tone: "danger" }))?.trim();
    if (reason) refresh(client.requestAssessmentReviewLearnerDeletion(learnerId, reason));
  };
  const rescore = (attemptId: string) => {
    if (readOnly) return;
    if (typeof client.rescoreAssessment !== "function") return;
    setRescoreBusy(attemptId);
    const requestId = typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
      ? crypto.randomUUID()
      : `${attemptId}:${Date.now()}`;
    void client.rescoreAssessment(attemptId, requestId)
      .then(() => { setActionError(undefined); return load(); })
      .catch(reason => setActionError(message(reason)))
      .finally(() => setRescoreBusy(undefined));
  };
  return <>{actionError && <Banner tone="danger"><b>Thao tác chưa hoàn tất:</b> {actionError}</Banner>}<OperatorDashboard view={view} readOnly={readOnly} unavailable={missing} actions={{
    onResolveTopicReport: id => { if (!readOnly) refresh(client.resolveTopicReport(id)); },
    onApprovePlacement: (id, cefr) => { if (!readOnly && typeof client.decideAssessment === "function") refresh(client.decideAssessment(id, { status: "approved", approvedLevel: cefr, reason: "Duyệt mức đầu vào" })); },
    onApproveLevelRequest: id => { const target = targetFor(id); if (!readOnly && target && typeof client.decideAssessment === "function") refresh(client.decideAssessment(id, { status: "approved", approvedLevel: target, reason: "Duyệt yêu cầu lên mức" })); },
    onRejectLevelRequest: id => { if (readOnly || typeof client.decideAssessment !== "function") return; void modal.prompt({ title: "Từ chối yêu cầu lên mức", message: "Học viên sẽ nhìn thấy nội dung này.", label: "Lý do từ chối", confirmLabel: "Từ chối", tone: "danger" }).then(reason => { if (reason?.trim()) refresh(client.decideAssessment(id, { status: "needs_retry", reason: reason.trim() })); }); },
    onViewTest: showAttempt, onRescore: rescore, onDeleteLearner: id => requestDeletion(learnerIdFor(id)), onViewChallenge: showChallenge,
    onDemote: id => changeLevel(id, "recommend_lower"), onChangeLevel: id => changeLevel(id, "scheduled"), onEditGoal: editGoal, onViewProfile: showProfile, onSetLevelDirect: id => changeLevel(id, "direct"),
    onOpenAppeals: () => navigate(paths.review, { state: { reviewTab: "appeals" } }), onOpenSettings: () => navigate("/settings"), onOpenWeeks: () => navigate(paths.weeks), onOpenLevelForms: () => navigate(paths.levelForms)
  }} />
  {assessmentDialog && <OperatorReviewAssessmentDetail detail={assessmentDialog} onClose={() => setAssessmentDialog(undefined)} />}
  {dialog && <OperatorDashboardDialog dialog={dialog} onClose={() => setDialog(undefined)} />}
  </>;
}

function OperatorDashboardDialog({ dialog, onClose }: { dialog: OperatorDashboardDialog; onClose(): void }) {
  const dialogRef = useRef<HTMLElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const title = dialog.kind === "profile" ? `Hồ sơ · ${dialog.detail.learner.displayName}` : `Thử thách · ${dialog.detail.targetLevel} · ${dialog.learnerName}`;
  const heading = dialog.kind === "profile" ? dialog.detail.learner.displayName : `Thử thách lên mức ${dialog.detail.targetLevel} – ${dialog.learnerName}`;

  useEffect(() => {
    const previouslyFocused = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    closeButtonRef.current?.focus();
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
        return;
      }
      if (event.key !== "Tab" || !dialogRef.current) return;
      const focusable = Array.from(dialogRef.current.querySelectorAll<HTMLElement>(
        "button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), a[href], summary, [tabindex]:not([tabindex='-1'])"
      )).filter(element => !element.hasAttribute("hidden"));
      if (!focusable.length) {
        event.preventDefault();
        dialogRef.current.focus();
        return;
      }
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (!first || !last) return;
      if (event.shiftKey && (document.activeElement === first || !dialogRef.current.contains(document.activeElement))) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && (document.activeElement === last || !dialogRef.current.contains(document.activeElement))) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      if (previouslyFocused?.isConnected) previouslyFocused.focus();
    };
  }, [onClose]);

  const modalClassName = dialog.kind === "profile" ? "modal-backdrop operator-modal-scope operator-profile-modal" : "modal-backdrop operator-modal-scope";
  const dialogClassName = `dialog${dialog.kind === "challenge" ? " wide" : ""}${dialog.kind === "profile" ? " operator-profile-dialog" : ""}`;
  return <div className={modalClassName} role="presentation"><section ref={dialogRef} className={dialogClassName} role="dialog" aria-modal="true" aria-label={title} tabIndex={-1}>
    <div className="row between"><h3>{heading}</h3><button ref={closeButtonRef} className="btn-sm" type="button" onClick={onClose}>Đóng</button></div>
    {dialog.kind === "profile" ? <OperatorProfileEvidence detail={dialog.detail} /> : <OperatorChallengeEvidence detail={dialog.detail} />}
  </section></div>;
}

function OperatorProfileEvidence({ detail }: { detail: AssessmentReviewLearnerView }) {
  const profile = detail.profile;
  const level = detail.learner.currentLevel;
  const profileRows: Array<[string, string]> = [
    ["Công việc", [profile.position, profile.department].filter(Boolean).join(" · ")],
    ["Email", profile.email ?? detail.learner.email ?? ""],
    ["Base", profile.contact ?? ""],
    ["Dùng tiếng Anh để", operatorProfileLabels("goals", profile.goals)],
    ["Mức độ dùng ở công ty", operatorProfileLabel("environmentUse", profile.environmentUse)],
    ["Dùng trong gia đình", operatorProfileLabel("familyUse", profile.familyUse)],
    ["Thói quen ngoài việc", operatorProfileLabels("habits", profile.habits)],
    ["Tình huống", profile.situations ?? ""],
    ["Cách học thích", operatorProfileLabels("learningStyles", profile.learningStyles)],
    ["Giải thích bằng", level ? (level === "A1" || level === "A2" ? `Tiếng Việt (tự động theo mức ${level})` : `Tiếng Anh (tự động theo mức ${level})`) : "Tự động theo trình độ"],
    ["Phong cách Season", profile.persona === "formal" ? "Formal · Trang trọng" : "Informal · Thân thiện"],
    ["Lịch học", [profile.durationMinutes ? `${profile.durationMinutes} phút/buổi` : "", "5 ngày/tuần (T2–T6)", operatorProfileLabel("device", profile.device)].filter(Boolean).join(" · ")],
    ["Tự đánh giá", operatorProfileLabel("selfLevel", profile.selfLevel)],
    ["Chứng chỉ", (profile.certificates ?? []).map(formatOperatorCertificate).filter(Boolean).join(", ")],
    ["Đã học", profile.experience ?? ""],
    ["Lo ngại / mong muốn", profile.concerns ?? ""]
  ].filter((row): row is [string, string] => Boolean(row[1]));
  return <>
    <div className="card soft operator-profile-card">{profileRows.length ? <><div className="row between"><b>Hồ sơ cá nhân</b></div><div className="operator-profile-rows">{profileRows.map(([label, value]) => <div className="operator-profile-row" key={label}><span className="xs muted operator-profile-label">{label}</span><span className="small operator-profile-value">{value}</span></div>)}</div></> : <p className="small muted" style={{ margin: 0 }}>Chưa điền hồ sơ cá nhân.</p>}</div>
    <div className="grid cols-2"><div className="card soft"><h4>Tài khoản</h4><p className="small"><b>Trạng thái:</b> {detail.learner.status}</p><p className="small"><b>Email:</b> {detail.learner.email ?? "—"}</p><p className="small"><b>Mức hiện tại:</b> {detail.learner.currentLevel ?? "—"}</p></div><div className="card soft"><h4>Mục tiêu tháng</h4><p className="small">{detail.monthlyGoal ?? "—"}</p></div></div>
    <h4>Lịch sử đổi mức</h4>
    {detail.levelHistory.length ? <div className="list">{detail.levelHistory.map((item, index) => <div className="item small" key={`${item.changedAt}-${index}`}><b>{item.from ?? "—"} → {item.to}</b> · {item.mode} · {item.reason}<div className="xs muted">{item.changedAt} · bằng chứng: {item.evidence || "—"}</div></div>)}</div> : <p className="small muted">Chưa có lịch sử đổi mức.</p>}
    <h4>Bài test</h4>
    {detail.attempts.length ? <div className="list">{detail.attempts.map(item => <div className="item small" key={item.id}><b>{item.title}</b> · {item.kind} · {item.status} · tổng {item.totalScore ?? "—"}<div className="xs muted">Nộp: {item.submittedAt ?? "—"} · mức gợi ý: {item.suggestedLevel ?? "—"}</div></div>)}</div> : <p className="small muted">Chưa có bài test.</p>}
    {detail.deletionRequests.length > 0 && <><h4>Yêu cầu xoá</h4><div className="list">{detail.deletionRequests.map(item => <div className="item small" key={item.id}><b>{item.status}</b> · {item.reason}<div className="xs muted">Gửi lúc {item.requestedAt}</div></div>)}</div></>}
  </>;
}

function OperatorChallengeEvidence({ detail }: { detail: AssessmentReviewChallengeView }) {
  const progress = detail.progress;
  return <>
    <p className="small muted"><b>Tiến độ thử thách:</b> {progress.completedTurns}/{progress.requiredTurns} lượt · TB {progress.average}/5 · {progress.offTopic} lượt lạc đề</p>
    <div className="row"><Badge tone={progress.passed ? "ok" : progress.complete ? "danger" : "warn"}>{progress.passed ? "Đạt" : progress.complete ? "Chưa đạt" : "Đang làm"}</Badge><Badge>Mức đích: {detail.targetLevel}</Badge></div>
    {detail.turns.length ? <div className="chat" style={{ background: "var(--bg)", padding: 12, borderRadius: 12 }}>{detail.turns.map(turn => <div className="item small" key={turn.id}><b>{turn.speaker === "learner" ? "Học viên" : "Coach"} · lượt {turn.turnNumber}</b><p>{turn.text}</p>{turn.coachText && <p className="muted"><b>Nhận xét:</b> {turn.coachText}</p>}{turn.feedback && <code style={{ display: "block", overflowWrap: "anywhere", whiteSpace: "pre-wrap" }}>{JSON.stringify(turn.feedback)}</code>}</div>)}</div> : <p className="small muted">Chưa có lượt hội thoại.</p>}
  </>;
}

function LevelFormsRoute({ client, readOnly }: { client: OperatorApiClient; readOnly: boolean }) {
  const modal = useModal();
  const navigate = useNavigate();
  const paths = useOperatorRoutePaths();
  const [data, setData] = useState<AssessmentLevelFormSlotView[]>();
  const [generating, setGenerating] = useState<Cefr | null>(null);
  const [error, setError] = useState<string>();
  const [dialog, setDialog] = useState<AssessmentLevelFormDetailView>();
  const capabilities = useCapabilities(client);
  const load = () => client.getAssessmentLevelForms().then(setData).catch(reason => setError(message(reason)));
  useEffect(() => { void load(); }, [client]);
  if (error) return <Status tone="error">Không tải được đề thi lên mức: {error}</Status>;
  if (!data) return <Status>Đang tải đề thi lên mức…</Status>;
  const refresh = (promise: Promise<unknown>) => void promise.then(load).catch(reason => setError(message(reason))).finally(() => setGenerating(null));
  const missing = {
    ...(typeof client.getAssessmentLevelForm !== "function" ? { view: unavailable("endpoint đọc nội dung đầy đủ của phiên bản đề") } : {}),
    ...(typeof client.deleteAssessmentLevelForm !== "function" ? { delete: unavailable("endpoint xoá đề thi lên mức") } : {})
  };
  const show = (versionId: string) => {
    if (typeof client.getAssessmentLevelForm !== "function") return;
    void client.getAssessmentLevelForm(versionId).then(setDialog).catch(reason => setError(message(reason)));
  };
  return <><OperatorLevelForms readOnly={readOnly} showReadOnlyBanner={!readOnly} unavailable={missing} view={adaptLevelForms(data, { aiConnected: capabilities?.ai ?? false, generatingTarget: generating })} actions={{
    onBack: () => navigate(paths.root), onOpenSettings: () => navigate("/settings"),
    onGenerate: target => { if (readOnly) return; setGenerating(target); refresh(client.generateAssessmentLevelForm(target as Exclude<CefrLevel, "A1">)); },
    onApprove: id => { if (!readOnly) refresh(client.publishAssessmentLevelForm(id)); }, onView: show,
    onDelete: id => { if (readOnly || typeof client.deleteAssessmentLevelForm !== "function") return; void modal.confirm({ title: "Xoá bản nháp đề thi?", message: "Bản nháp này sẽ bị xoá khỏi danh sách đề lên mức.", confirmLabel: "Xoá bản nháp", tone: "danger" }).then(confirmed => { if (confirmed) refresh(client.deleteAssessmentLevelForm(id)); }); }
  }} />{dialog && <OperatorLevelFormDetail detail={dialog} onClose={() => setDialog(undefined)} />}</>;
}

function WeeksRoute({ client, readOnly }: { client: OperatorApiClient; readOnly: boolean }) {
  const navigate = useNavigate();
  const paths = useOperatorRoutePaths();
  const [data, setData] = useState<ContentWeekFrameView>();
  const [suggestions, setSuggestions] = useState<Record<number, WeekSuggestion>>({});
  const [status, setStatus] = useState("");
  const [error, setError] = useState<string>();
  const capabilities = useCapabilities(client);
  useEffect(() => { void client.getContentWeeks().then(setData).catch(reason => setError(message(reason))); }, [client]);
  if (error) return <Status tone="error">Không tải được khung chủ đề: {error}</Status>;
  if (!data) return <Status>Đang tải khung chủ đề…</Status>;
  const inputs = (source = data) => source.weeks.map(week => ({ weekNumber: week.weekNumber, topic: week.topic, description: week.description, objectives: week.objectives, keyVocabHint: week.keyVocabHint }));
  const suggest = (numbers: number[]) => { if (readOnly) return; numbers.forEach(number => setSuggestions(current => ({ ...current, [number]: { state: "loading" } }))); void client.suggestContentWeeks(numbers).then(result => { const next: Record<number, WeekSuggestion> = {}; result.weeks.forEach(week => { next[week.weekNumber] = { state: "options", levels: week.levels ?? [], options: week.options.map(option => ({ ...option, plan: option.plan ?? {} })) }; }); setSuggestions(current => ({ ...current, ...next })); setStatus("Đã tải 3 phương án chủ đề kèm kế hoạch CEFR × 5 ngày."); }).catch(reason => { const failure = message(reason); setSuggestions(current => ({ ...current, ...Object.fromEntries(numbers.map(number => [number, { state: "error", message: failure }])) })); setStatus(""); }); };
  const save = (source = data) => { if (readOnly) return; void client.saveContentWeeks(inputs(source)).then(saved => { setData(saved); setStatus("Đã lưu khung chủ đề."); }).catch(reason => setError(message(reason))); };
  const view = adaptWeeks(data, { aiConnected: capabilities?.ai ?? false, status, suggestions });
  return <OperatorWeeks readOnly={readOnly} view={view} actions={{
    onSuggestAll: () => suggest(data.weeks.filter(week => !week.topic.trim()).map(week => week.weekNumber).length ? data.weeks.filter(week => !week.topic.trim()).map(week => week.weekNumber) : data.weeks.map(week => week.weekNumber)),
    onSuggestWeek: week => suggest([week]), onCloseSuggestion: week => setSuggestions(current => { const next = { ...current }; delete next[week]; return next; }), onReopenSuggestion: week => setSuggestions(current => {
      const suggestion = current[week];
      if (suggestion?.state !== "confirmed") return current;
      return {
        ...current,
        [week]: suggestion.options?.length
          ? { state: "options", levels: suggestion.levels ?? [], options: suggestion.options }
          : { state: "error", message: "Các phương án cũ không còn trong API response; bấm Gợi ý để tải lại." }
      };
    }),
    onConfirmSuggestion: (weekNumber, index) => { if (readOnly) return; const suggestion = suggestions[weekNumber]; if (suggestion?.state !== "options") return; const option = suggestion.options[index]; if (!option) return; const updated = { ...data, weeks: data.weeks.map(week => week.weekNumber === weekNumber ? { ...week, topic: option.topic, description: option.description, objectives: option.objectives, keyVocabHint: option.keyVocabHint } : week) }; setData(updated); setSuggestions(current => ({ ...current, [weekNumber]: { state: "confirmed", topic: option.topic, levels: suggestion.levels, options: suggestion.options } })); save(updated); },
    onChangeWeek: (weekNumber, patch) => { if (!readOnly) setData(current => current ? { ...current, weeks: current.weeks.map(week => week.weekNumber === weekNumber ? { ...week, ...patch } : week) } : current); }, onSave: () => save(), onOpenLessons: () => navigate(paths.lessons)
  }} />;
}

function LessonsRoute({ client, readOnly }: { client: OperatorApiClient; readOnly: boolean }) {
  const navigate = useNavigate();
  const paths = useOperatorRoutePaths();
  const [data, setData] = useState<ContentLessonMatrixView>();
  const [extraLevels, setExtraLevels] = useState<Cefr[]>([]);
  const [generating, setGenerating] = useState<{ week: number; cefr: Cefr; message?: string } | null>(null);
  const [error, setError] = useState<string>();
  const capabilities = useCapabilities(client);
  useEffect(() => { void client.getContentLessonMatrix().then(setData).catch(reason => setError(message(reason))); }, [client]);
  if (error) return <Status tone="error">Không tải được ma trận bài học: {error}</Status>;
  if (!data) return <Status>Đang tải ma trận bài học…</Status>;
  const open = (week: number, cefr: Cefr) => navigate(`${paths.lessons}/${week}/${cefr}`);
  const produce = (week: number, cefr: Cefr, promise: Promise<ContentLessonSetVersionView>) => { setGenerating({ week, cefr, message: "Đang chuẩn bị bộ 5 bài…" }); void promise.then(() => open(week, cefr)).catch(reason => setError(message(reason))).finally(() => setGenerating(null)); };
  const extended = { ...data, levels: [...data.levels, ...extraLevels.filter(level => !data.levels.some(item => item.cefr === level)).map(cefr => ({ cefr, learnerCount: 0 }))] };
  return <OperatorLessons readOnly={readOnly} view={adaptLessonMatrix(extended, { aiConnected: capabilities?.ai ?? false, extraLevels: (["A1", "A2", "B1", "B2", "C1"] as Cefr[]).filter(level => !extended.levels.some(item => item.cefr === level)), generating })} actions={{
    onOpenSettings: () => navigate("/settings"), onAddLevel: cefr => { if (!readOnly) setExtraLevels(current => current.includes(cefr) ? current : [...current, cefr]); }, onGenerate: (week, cefr) => { if (!readOnly) produce(week, cefr, client.generateContentLessonDraft(week, cefr)); }, onCreateManual: (week, cefr) => { if (!readOnly) produce(week, cefr, client.saveContentLessonDraft(week, cefr, [])); }, onOpenSet: open
  }} />;
}

function LessonSetRoute({ client, readOnly, week, cefr }: { client: OperatorApiClient; readOnly: boolean; week: number; cefr: Cefr }) {
  const modal = useModal();
  const navigate = useNavigate();
  const paths = useOperatorRoutePaths();
  const [data, setData] = useState<ContentLessonSetVersionView>();
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(false);
  const [editor, setEditor] = useState<ContentLessonDraftInput>();
  const capabilities = useCapabilities(client);
  const load = () => client.getContentLessonSet(week, cefr).then(setData).catch(reason => setError(message(reason)));
  useEffect(() => { void load(); }, [client, week, cefr]);
  if (error) return <Status tone="error">Không tải được bộ bài: {error}</Status>;
  if (!data) return <Status>Đang tải bộ bài…</Status>;
  const mutate = (promise: Promise<ContentLessonSetVersionView>) => { if (readOnly) return; setBusy(true); void promise.then(setData).then(() => setEditor(undefined)).catch(reason => setError(message(reason))).finally(() => setBusy(false)); };
  const publish = () => { if (readOnly) return; setBusy(true); const prepared = data.status === "draft" ? client.submitContentLessonSet(data.versionId) : Promise.resolve(data); void prepared.then(version => client.publishContentLessonSet(version.versionId)).then(setData).catch(reason => setError(message(reason))).finally(() => setBusy(false)); };
  const saveLesson = (lesson: ContentLessonDraftInput) => mutate(client.upsertContentLessonDay(week, cefr, lesson.dayNumber, lesson, data.version));
  const openEditor = (day: number, id?: string) => {
    const current = id ? data.lessons.find(lesson => lesson.id === id) : data.lessons.find(lesson => lesson.dayNumber === day);
    setEditor(current ? { dayNumber: current.dayNumber, title: current.title, durationMinutes: current.durationMinutes, parts: current.parts } : emptyLesson(day));
  };
  const deleteLesson = async (id: string) => {
    if (readOnly) return;
    const lesson = data.lessons.find(candidate => candidate.id === id);
    if (lesson && await modal.confirm({ title: `Xoá ${lesson.title}?`, message: "Bài học sẽ bị xoá khỏi bộ bài nháp.", confirmLabel: "Xoá bài", tone: "danger" })) mutate(client.deleteContentLessonDay(week, cefr, lesson.dayNumber, data.version));
  };
  const deleteSet = async () => { if (readOnly) return; if (await modal.confirm({ title: "Xoá toàn bộ bộ bài nháp?", message: `Toàn bộ bài tuần ${week} · ${cefr} sẽ bị xoá.`, confirmLabel: "Xoá bộ bài", tone: "danger" })) { setBusy(true); void client.deleteContentLessonDraftSet(week, cefr).then(() => navigate(paths.lessons)).catch(reason => setError(message(reason))).finally(() => setBusy(false)); } };
  const unavailableSet = {
    ...(typeof client.fillContentLessonPhrases !== "function" ? { fillPhrases: unavailable("endpoint bổ sung cụm từ cho bộ bài") } : {}),
    ...(typeof client.enrichContentLessonDraft !== "function" ? { enrich: unavailable("endpoint bổ sung chi tiết cho bộ bài") } : {})
  };
  return <><OperatorLessonSet readOnly={readOnly} unavailable={unavailableSet} view={adaptLessonSet(data, { aiConnected: capabilities?.ai ?? false, mutationState: busy ? "loading" : "idle" })} actions={{
    onBack: () => navigate(paths.lessons), onApprove: publish, onUnapprove: () => mutate(client.retireContentLessonSet(data.versionId)), onRegenerate: () => mutate(client.generateContentLessonDraft(week, cefr)), onDeleteSet: deleteSet,
    onFillPhrases: () => { if (typeof client.fillContentLessonPhrases === "function") mutate(client.fillContentLessonPhrases(week, cefr, data.version)); },
    onEnrich: () => { if (typeof client.enrichContentLessonDraft === "function") mutate(client.enrichContentLessonDraft(week, cefr, data.version)); },
    onEditLesson: id => openEditor(0, id), onDeleteLesson: deleteLesson, onComposeDay: openEditor
  }} />{!readOnly && editor && <LessonFormEditor weekNumber={week} cefr={cefr} initial={editor} onSave={saveLesson} onCancel={() => setEditor(undefined)} busy={busy} />}</>;
}

function ReviewRoute({ client, readOnly }: { client: OperatorApiClient; readOnly: boolean }) {
  const modal = useModal();
  const location = useLocation();
  const initialTab = (location.state as { reviewTab?: ReviewTab } | null)?.reviewTab ?? "subs";
  const [tab, setTab] = useState<ReviewTab>(initialTab);
  const [data, setData] = useState<ContentReviewView>();
  const [error, setError] = useState<string>();
  const [dialog, setDialog] = useState<ContentReviewAssessmentDetailView>();
  const capabilities = useCapabilities(client);
  const load = () => client.getContentReview().then(setData).catch(reason => setError(message(reason)));
  useEffect(() => { void load(); }, [client]);
  if (error) return <Status tone="error">Không tải được dữ liệu đọc mẫu: {error}</Status>;
  if (!data) return <Status>Đang tải dữ liệu đọc mẫu…</Status>;
  const refresh = (promise: Promise<unknown>) => void promise.then(load).catch(reason => setError(message(reason)));
  const askScore = async (label: string) => {
    const raw = await modal.prompt({ title: "Chấm bài thủ công", label: `${label} (0–5)`, inputType: "number", confirmLabel: "Tiếp tục" });
    if (raw == null) return null;
    const value = Number(raw);
    return Number.isFinite(value) && value >= 0 && value <= 5 ? value : null;
  };
  const manualGrade = async (id: string) => { const meaning = await askScore("Đúng ý"); if (meaning == null) return; const vocabulary = await askScore("Từ vựng"); if (vocabulary == null) return; const grammar = await askScore("Ngữ pháp"); if (grammar == null) return; const feedback = await modal.prompt({ title: "Nhận xét bài làm", label: "Nhận xét", confirmLabel: "Lưu điểm" }) ?? ""; refresh(client.gradeReviewedSubmission(id, { meaning, vocabulary, grammar, feedback })); };
  const decide = async (id: string, accepted: boolean) => { if (readOnly) return; const resolution = await modal.prompt({ title: accepted ? "Chấp nhận kháng nghị" : "Từ chối kháng nghị", label: "Nội dung xử lý / giải thích cho học viên", confirmLabel: accepted ? "Chấp nhận" : "Từ chối", tone: accepted ? "primary" : "danger" }); if (resolution?.trim()) refresh(client.decideReviewedAppeal(id, { status: accepted ? "accepted" : "rejected", resolution: resolution.trim() })); };
  const missing = {
    ...(typeof client.gradeReviewedSubmissionAi !== "function" ? { gradeAi: unavailable("endpoint chấm bài review bằng AI") } : {}),
    ...(typeof client.getContentReviewAssessment !== "function" ? { viewTest: unavailable("endpoint xem chi tiết bài test") } : {})
  };
  const gradeAi = (id: string) => {
    if (readOnly) return;
    if (typeof client.gradeReviewedSubmissionAi !== "function") return;
    refresh(client.gradeReviewedSubmissionAi(id));
  };
  const viewTest = (attemptId: string) => {
    if (typeof client.getContentReviewAssessment !== "function") return;
    void client.getContentReviewAssessment(attemptId).then(setDialog).catch(reason => setError(message(reason)));
  };
  const guardedManualGrade = (id: string) => { if (!readOnly) void manualGrade(id); };
  return <><OperatorReview readOnly={readOnly} unavailable={missing} view={adaptReview(data, reviewToApi[tab], { aiConnected: capabilities?.ai ?? false })} actions={{
    onTabChange: setTab, onMarkSubmission: (id, checked) => { if (!readOnly) refresh(client.setContentReviewChecked("submission", id, checked)); }, onMarkCoachTurn: (id, checked) => { if (!readOnly) refresh(client.setContentReviewChecked("coach", id, checked)); }, onDeleteMicroLesson: id => { if (!readOnly) refresh(client.deleteReviewedMicroLesson(id)); }, onGradeAi: gradeAi, onGradeManual: guardedManualGrade, onDecideAppeal: decide, onViewTest: viewTest
  }} />{dialog && <OperatorReviewAssessmentDetail detail={dialog} onClose={() => setDialog(undefined)} />}</>;
}

function PromptsRoute({ client, readOnly }: { client: OperatorApiClient; readOnly: boolean }) {
  const navigate = useNavigate();
  const [data, setData] = useState<ContentPromptSettingsView>();
  const [error, setError] = useState<string>();
  const [saving, setSaving] = useState(false);
  useEffect(() => { void client.getContentPrompts().then(setData).catch(reason => setError(message(reason))); }, [client]);
  if (error) return <Status tone="error">Không tải được prompt: {error}</Status>;
  if (!data) return <Status>Đang tải prompt…</Status>;
  return <OperatorPrompts readOnly={readOnly} view={adaptPrompts(data, { saveState: saving ? "loading" : "idle" })} actions={{
    onBack: () => navigate("/settings"),
    onReset: key => { if (!readOnly) setData(current => current ? { ...current, groups: current.groups.map(group => group.key === promptToApi[key] ? { ...group, content: group.defaultContent } : group) } : current); },
    onSave: values => { if (readOnly) return; setSaving(true); void client.saveContentPrompts(Object.entries(values).map(([key, content]) => ({ key: promptToApi[key as PromptKey], content }))).then(setData).catch(reason => setError(message(reason))).finally(() => setSaving(false)); }
  }} />;
}

const operatorErrorMessages: Record<string, string> = {
  WEEK_SUGGESTION_FAILED: "Không thể tạo gợi ý tuần lúc này. Vui lòng kiểm tra kết nối AI rồi thử lại.",
  AI_UNAVAILABLE: "AI chưa được cấu hình trên máy chủ.",
  AI_PROMPT_NOT_READY: "Chưa có prompt AI đang hoạt động cho thao tác này.",
  AI_OUTPUT_INVALID: "AI trả về nội dung không đúng định dạng. Vui lòng thử lại."
};

function message(reason: unknown) {
  const raw = reason instanceof Error ? reason.message : String(reason);
  return operatorErrorMessages[raw] ?? raw;
}
