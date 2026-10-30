import { createContext, useContext, useEffect, useMemo, useRef, useState, useSyncExternalStore, type ReactNode } from "react";
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
import type { ManualScoreInput } from "./AssessmentManualScore.js";
import { OperatorWeeks } from "./Weeks.js";
import { Badge, OperationsReadOnlyContext, OperatorPage, PageTitle } from "./primitives.js";
import { ModalProvider, useModal } from "../shared/ModalProvider.js";
import type { AudioEvidence } from "../shared/media/audio-evidence.js";
import { adaptAssessmentOverview, adaptLevelForms, adaptLessonMatrix, adaptLessonSet, adaptPrompts, adaptReview, adaptWeeks } from "./adapters.js";
import type { Cefr, LessonSetActionKey, OperatorReviewActions, PromptKey, ReviewTab, WeekSuggestion } from "./types.js";
import { describeBatchLevelResults, generateLessonWeeksBatchSettled, lessonGenerationJobsSnapshot, startLessonGenerationJob, subscribeLessonGenerationJobs } from "./lesson-generation.js";

export type OperatorApiClient = typeof apiClient;

type OperatorRoutePaths = {
  root: string;
  levelForms: string;
  weeks: string;
  lessons: string;
  review: string;
  tests: string;
  prompts: string;
};

const defaultOperatorRoutePaths = routePathsFor("/op");
const OperatorRoutePathsContext = createContext<OperatorRoutePaths>(defaultOperatorRoutePaths);

const unavailable = (feature: string) => `API hiện chưa cung cấp ${feature}.`;
const reviewToApi = { subs: "submissions", coach: "coach", weekly: "weekly_practices", appeals: "appeals", attempts: "attempts", tests: "assessments" } as const satisfies Record<ReviewTab, ContentReviewTabKey>;
const promptToApi: Record<PromptKey, ContentPromptKey> = { base: "system_rules", placement: "assessment_scoring", lesson: "weekly_lessons", weeks: "week_suggestions", coach: "coach_dialogue", grade: "weekly_practice_grading" };

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

export function OperationsRouteController({ session, client = apiClient, basePath = "/op" }: { session: SessionView; client?: OperatorApiClient; basePath?: "/op" | "/mgr/ops" }) {
  const paths = routePathsFor(basePath);
  return <ModalProvider><OperatorRoutePathsContext.Provider value={paths}><OperatorRouteControllerContent session={session} client={client} paths={paths} /></OperatorRoutePathsContext.Provider></ModalProvider>;
}

// Kept as the Operator-facing name so existing Operator imports and tests do not change.
export const OperatorRouteController = OperationsRouteController;

function OperatorRouteControllerContent({ session, client, paths }: { session: SessionView; client: OperatorApiClient; paths: OperatorRoutePaths }) {
  const location = useLocation();
  if (session.role !== "operator" && session.role !== "manager") return <Status tone="error">Tài khoản này không có quyền mở khu vực vận hành.</Status>;
  // Manager can inspect the operational screens, but must not mutate content
  // from this area. Keep the shared screens and let their readOnly guards
  // disable every create/edit/approve action consistently.
  const readOnly = session.role === "manager";
  const props = { client, readOnly };
  const detail = location.pathname.match(new RegExp(`^${escapeRegExp(paths.lessons)}/(\\d+)/(A1|A2|B1|B2|C1)$`));
  const content = detail ? <LessonSetRoute {...props} week={Number(detail[1])} cefr={detail[2] as Cefr} />
    : location.pathname === paths.root ? <DashboardRoute {...props} />
      : location.pathname === paths.tests ? <TestsRoute {...props} initialTab="placement" />
        : location.pathname === paths.levelForms ? <TestsRoute {...props} initialTab="promotion" />
        : location.pathname === paths.weeks ? <WeeksRoute {...props} />
          : location.pathname === paths.lessons ? <LessonsRoute {...props} />
            : location.pathname === paths.review ? <ReviewRoute {...props} canEditWeeklyPractice={session.role === "operator"} />
              : session.role === "manager" && location.pathname === paths.prompts ? <PromptsRoute client={client} readOnly={false} />
                : <Status tone="error">Đường dẫn vận hành không tồn tại.</Status>;
  return <OperationsReadOnlyContext.Provider value={readOnly && location.pathname !== paths.prompts}>{content}</OperationsReadOnlyContext.Provider>;
}

function routePathsFor(basePath: "/op" | "/mgr/ops"): OperatorRoutePaths {
  return {
    root: basePath === "/op" ? basePath : `${basePath}/levels`,
    levelForms: basePath === "/op" ? `${basePath}/levelforms` : `${basePath}/level-forms`,
    weeks: `${basePath}/weeks`,
    lessons: `${basePath}/lessons`,
    review: `${basePath}/review`,
    tests: `${basePath}/tests`,
    prompts: "/settings/prompts"
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

function cefrFromTotal(total: number | null): Cefr | undefined {
  if (total === null) return undefined;
  if (total >= 85) return "C1";
  if (total >= 65) return "B2";
  if (total >= 45) return "B1";
  if (total >= 25) return "A2";
  return "A1";
}

function placementDetail(detail: ContentReviewAssessmentDetailView, profile?: AssessmentReviewLearnerView) {
  const criteria = [...detail.scores.map(score => score.criteria), ...(detail.sections ?? []).map(section => section.criteria)];
  const criterion = (key: "rationale" | "monthlyGoal") => criteria.map(item => item[key]).find((value): value is string => typeof value === "string" && Boolean(value.trim())) ?? null;
  const labels: Record<string, string> = { listening: "Nghe", reading: "Đọc", writing: "Viết", speaking: "Nói" };
  const sectionScores = (detail.sections ?? detail.scores.map(score => ({ ...score, label: labels[score.section], maxScore: score.section === "reading" ? 40 : 20 }))).map(section => ({
    label: section.label ?? labels[section.section] ?? section.section,
    percent: section.score == null || !section.maxScore ? null : Math.round(section.score / section.maxScore * 1_000) / 10
  }));
  const total = detail.totalScore;
  return {
    total,
    rawLevel: (detail.overallCefr ?? cefrFromTotal(total)) as Cefr | undefined,
    sectionScores,
    rationale: criterion("rationale"),
    monthlyGoal: profile?.monthlyGoal ?? criterion("monthlyGoal"),
    aiScored: detail.scores.some(score => score.source === "ai"),
    humanScored: detail.scores.some(score => score.source === "human"),
    ...(detail.aiScoring ? {
      aiScoringStatus: detail.aiScoring.status,
      aiScoringErrorCode: detail.aiScoring.errorCode
    } : {})
  };
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
  const [manualScoreBusy, setManualScoreBusy] = useState(false);
  const [dialog, setDialog] = useState<OperatorDashboardDialog>();
  const [pendingProfiles, setPendingProfiles] = useState<Record<string, AssessmentReviewLearnerView | null>>({});
  const [expandedPendingProfiles, setExpandedPendingProfiles] = useState<Record<string, true>>({});
  const [pendingAssessmentDetails, setPendingAssessmentDetails] = useState<Record<string, ContentReviewAssessmentDetailView>>({});
  const [rescoreBusy, setRescoreBusy] = useState<string>();
  const [deletionPendingLearners, setDeletionPendingLearners] = useState<Set<string>>(() => new Set());
  const [toast, setToast] = useState<{ tone: "success" | "danger" | "info"; message: string }>();
  const capabilities = useCapabilities(client);
  const notify = (message: string, tone: "success" | "danger" | "info" = "success") => setToast({ tone, message });
  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(undefined), 4200);
    return () => window.clearTimeout(timer);
  }, [toast]);
  const load = () => client.getAssessmentReviewOverview().then(setData).catch(reason => setError(message(reason)));
  useEffect(() => { void load(); }, [client]);
  useEffect(() => {
    if (!data) return;
    let live = true;
    const pending = data.pendingAssessments;
    if (typeof client.getContentReviewAssessment === "function") {
      void Promise.all(pending.map(async item => {
        try { return [item.attemptId, await client.getContentReviewAssessment!(item.attemptId)] as const; }
        catch { return null; }
      })).then(entries => {
        if (live) setPendingAssessmentDetails(Object.fromEntries(entries.filter((entry): entry is NonNullable<typeof entry> => entry !== null)));
      });
    }
    if (typeof client.getAssessmentReviewLearner === "function") {
      void Promise.all(pending.map(async item => {
        try { return [item.attemptId, await client.getAssessmentReviewLearner!(item.learnerId)] as const; }
        catch { return null; }
      })).then(entries => {
        if (live) setPendingProfiles(Object.fromEntries(entries.filter((entry): entry is NonNullable<typeof entry> => entry !== null)));
      });
    }
    return () => { live = false; };
  }, [client, data]);
  useEffect(() => {
    if (typeof client.getContentWeeks !== "function") return;
    void client.getContentWeeks().then(setWeekFrame).catch(() => setWeekFrame(undefined));
  }, [client]);
  if (error) return <Status tone="error">Không tải được duyệt trình độ: {error}</Status>;
  if (!data) return <Status>Đang tải duyệt trình độ…</Status>;
  const currentWeek = weekFrame?.weeks.find(week => week.current);
  const adaptedView = adaptAssessmentOverview(data, {
    aiConnected: capabilities?.ai ?? false,
    ...(capabilities?.aiConfigured === undefined ? {} : { aiConfigured: capabilities.aiConfigured }),
    ...(capabilities?.aiProvider === undefined ? {} : { aiProvider: capabilities.aiProvider }),
    openAppeals: data.openAppeals ?? 0,
    rescoreBusy,
    placementDetails: Object.fromEntries(Object.entries(pendingAssessmentDetails).map(([attemptId, detail]) => [attemptId, placementDetail(detail, pendingProfiles[attemptId] ?? undefined)])),
    ...(currentWeek ? { currentWeek: currentWeek.weekNumber, topic: currentWeek.topic } : {}),
    ...(weekFrame ? { pilotWeeks: weekFrame.pilot.weekCount } : {})
  });
  const view = {
    ...adaptedView,
    pending: adaptedView.pending.map((item) => ({
      ...item,
      deletionPending: deletionPendingLearners.has(item.learnerId ?? item.id)
        || Boolean(pendingProfiles[item.id]?.deletionRequests.some((request) => request.status === "pending"))
    }))
  };
  const targetFor = (attemptId: string) => view.levelRequests.find(item => item.id === attemptId)?.to;
  const learnerIdFor = (id: string) => data.pendingAssessments.find(item => item.attemptId === id)?.learnerId ?? id;
  const refresh = (promise: Promise<unknown>) => void promise.then(() => { notify("Đã cập nhật trạng thái."); return load(); }).catch(reason => notify(message(reason), "danger"));
  const missing = {
    ...(typeof client.decideAssessment !== "function" ? { approvePlacement: unavailable("endpoint duyệt mức đầu vào"), decideLevelRequest: unavailable("endpoint xử lý yêu cầu lên mức") } : {}),
    ...(typeof client.getContentReviewAssessment !== "function" ? { viewTest: unavailable("endpoint xem chi tiết bài test của học viên") } : {}),
    ...(typeof client.getAssessmentReviewChallenge !== "function" ? { viewChallenge: unavailable("endpoint xem thử thách của học viên") } : {}),
    ...(typeof client.changeAssessmentReviewLearnerLevel !== "function" ? { changeLevel: unavailable("endpoint đổi level trực tiếp"), demote: unavailable("endpoint hạ mức"), setLevelDirect: unavailable("endpoint xếp mức trực tiếp") } : {}),
    ...(typeof client.updateAssessmentReviewMonthlyGoal !== "function" ? { editGoal: unavailable("endpoint sửa mục tiêu tháng") } : {}),
    ...(typeof client.getAssessmentReviewLearner !== "function" ? { viewProfile: unavailable("endpoint đọc hồ sơ theo học viên") } : {}),
    ...(typeof client.assignAssessmentReviewWeeklyPractice !== "function" ? { assignWeeklyPractice: unavailable("endpoint giao bài thực hành tuần") } : {}),
    ...(typeof client.requestAssessmentReviewLearnerDeletion !== "function" ? { deleteLearner: unavailable("endpoint xoá học viên") } : {}),
    ...(typeof client.rescoreAssessment !== "function"
      ? { rescore: unavailable("endpoint chấm lại bài test bằng AI") }
      : capabilities && !capabilities.ai
        ? { rescore: unavailable("AI chưa được cấu hình trên máy chủ") }
        : {})
  };
  const showAttempt = (attemptId: string) => {
    if (typeof client.getContentReviewAssessment !== "function") return;
    void client.getContentReviewAssessment(attemptId).then(detail => { setAssessmentDialog(detail); }).catch(reason => notify(message(reason), "danger"));
  };
  const saveManualScore = (input: ManualScoreInput) => {
    if (!assessmentDialog || typeof client.manualScoreAssessment !== "function" || readOnly) return;
    setManualScoreBusy(true);
    void client.manualScoreAssessment(assessmentDialog.attemptId, input)
      .then(() => client.getContentReviewAssessment(assessmentDialog.attemptId))
      .then(detail => { setAssessmentDialog(detail); notify("Đã lưu điểm chấm tay."); })
      .catch(reason => notify(message(reason), "danger"))
      .finally(() => setManualScoreBusy(false));
  };
  const deleteAssessmentAudio = async (evidence: AudioEvidence) => {
    if (readOnly || !assessmentDialog || !evidence.fileId || typeof client.confirmAssessmentAudioDeletion !== "function" || typeof client.deleteAssessmentAudio !== "function") return;
    const confirmation = await client.confirmAssessmentAudioDeletion(evidence.fileId);
    await client.deleteAssessmentAudio(evidence.fileId, confirmation.confirmationToken);
    const refreshed = await client.getContentReviewAssessment(assessmentDialog.attemptId);
    setAssessmentDialog(refreshed);
    notify("Đã xoá bản ghi âm; transcript và kết quả vẫn được giữ.");
  };
  const showChallenge = (attemptId: string) => void client.getAssessmentReviewChallenge(attemptId).then(detail => { setDialog({ kind: "challenge", detail, learnerName: view.levelRequests.find(item => item.id === attemptId)?.learnerName ?? "" }); }).catch(reason => notify(message(reason), "danger"));
  const showProfile = (learnerId: string) => void client.getAssessmentReviewLearner(learnerId).then(detail => { setDialog({ kind: "profile", detail }); }).catch(reason => notify(message(reason), "danger"));
  const togglePendingProfile = (attemptId: string) => {
    if (expandedPendingProfiles[attemptId]) {
      setExpandedPendingProfiles(current => { const next = { ...current }; delete next[attemptId]; return next; });
      return;
    }
    setExpandedPendingProfiles(current => ({ ...current, [attemptId]: true }));
    if (Object.prototype.hasOwnProperty.call(pendingProfiles, attemptId)) return;
    const pending = data.pendingAssessments.find(item => item.attemptId === attemptId);
    if (!pending || typeof client.getAssessmentReviewLearner !== "function") return;
    setPendingProfiles(current => ({ ...current, [attemptId]: null }));
    void client.getAssessmentReviewLearner(pending.learnerId)
      .then(detail => setPendingProfiles(current => ({ ...current, [attemptId]: detail })))
      .catch(reason => { setPendingProfiles(current => { const next = { ...current }; delete next[attemptId]; return next; }); notify(message(reason), "danger"); });
  };
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
  const assignWeeklyPractice = async (learnerId: string) => {
    if (readOnly || typeof client.assignAssessmentReviewWeeklyPractice !== "function") return;
    const learner = view.approved.find((item) => item.id === learnerId);
    if (!learner) return;
    const confirmed = await modal.confirm({ title: "Giao bài thực hành tuần", message: <>Giao bài thực hành của tuần hiện tại cho <b>{learner.name}</b>? Nếu đã giao, hệ thống sẽ giữ nguyên bài cũ.</>, confirmLabel: "Giao bài tuần", cancelLabel: "Huỷ" });
    if (!confirmed) return;
    try {
      const assignment = await client.assignAssessmentReviewWeeklyPractice(learnerId);
      notify(assignment.status === "assigned" ? `Đã giao bài tuần ${assignment.weekNumber}: ${assignment.topic}.` : `Bài tuần ${assignment.weekNumber} đã được giao trước đó.`);
      await load();
    } catch (reason) { notify(message(reason), "danger"); }
  };
  const requestDeletion = async (learnerId: string) => {
    if (readOnly) return;
    const reason = (await modal.prompt({ title: "Yêu cầu xoá học viên", message: "Yêu cầu sẽ được chuyển cho Quản lý duyệt.", label: "Lý do", confirmLabel: "Gửi yêu cầu", tone: "danger" }))?.trim();
    if (!reason) return;
    try {
      await client.requestAssessmentReviewLearnerDeletion(learnerId, reason);
      setDeletionPendingLearners((current) => new Set(current).add(learnerId));
      notify("Đã gửi yêu cầu xoá cho Quản lý duyệt.");
      await load();
    } catch (reason) {
      notify(message(reason), "danger");
    }
  };
  const rescore = (attemptId: string) => {
    if (readOnly) return;
    if (typeof client.rescoreAssessment !== "function") return;
    setRescoreBusy(attemptId);
    const requestId = typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
      ? crypto.randomUUID()
      : `${attemptId}:${Date.now()}`;
    void client.rescoreAssessment(attemptId, requestId)
      .then(() => { notify("Đã chấm lại bài bằng AI."); return load(); })
      .catch(reason => notify(message(reason), "danger"))
      .finally(() => setRescoreBusy(undefined));
  };
  return <><OperatorDashboard view={{ ...view, pendingProfiles, expandedPendingProfiles }} readOnly={readOnly} unavailable={missing} actions={{
    onResolveTopicReport: id => { if (!readOnly) refresh(client.resolveTopicReport(id)); },
    onApprovePlacement: (id, cefr) => {
      if (readOnly || typeof client.decideAssessment !== "function") return;
      void modal.prompt({ title: "Duyệt mức đầu vào", message: `Mức được duyệt: ${cefr}. Hãy ghi rõ lý do để lưu quyết định.`, label: "Lý do", confirmLabel: "Duyệt mức" })
        .then(reason => {
          const trimmed = reason?.trim();
          if (!trimmed) {
            notify("Lý do duyệt mức là bắt buộc; quyết định chưa được lưu.", "danger");
            return;
          }
          refresh(client.decideAssessment(id, { status: "approved", approvedLevel: cefr, reason: trimmed }));
        });
    },
    onApproveLevelRequest: id => { const target = targetFor(id); if (!readOnly && target && typeof client.decideAssessment === "function") refresh(client.decideAssessment(id, { status: "approved", approvedLevel: target, reason: "Duyệt yêu cầu lên mức" })); },
    onRejectLevelRequest: id => { if (readOnly || typeof client.decideAssessment !== "function") return; void modal.prompt({ title: "Từ chối yêu cầu lên mức", message: "Học viên sẽ nhìn thấy nội dung này.", label: "Lý do từ chối", confirmLabel: "Từ chối", tone: "danger" }).then(reason => { if (reason?.trim()) refresh(client.decideAssessment(id, { status: "needs_retry", reason: reason.trim() })); }); },
    onViewTest: showAttempt, onRescore: rescore, onDeleteLearner: id => requestDeletion(learnerIdFor(id)), onViewChallenge: showChallenge,
    onDemote: id => changeLevel(id, "recommend_lower"), onChangeLevel: id => changeLevel(id, "direct"), onEditGoal: editGoal, onViewProfile: showProfile, onAssignWeeklyPractice: assignWeeklyPractice, onTogglePendingProfile: togglePendingProfile, onSetLevelDirect: id => changeLevel(id, "direct"),
    onOpenAppeals: () => navigate(paths.review, { state: { reviewTab: "appeals" } }), onOpenSettings: () => navigate("/settings"), onOpenWeeks: () => navigate(paths.weeks), onOpenLevelForms: () => navigate(paths.levelForms)
  }} />
  {assessmentDialog && <OperatorReviewAssessmentDetail detail={assessmentDialog} onClose={() => setAssessmentDialog(undefined)} {...(typeof client.manualScoreAssessment === "function" && !readOnly && (assessmentDialog.status === "pending_review" || assessmentDialog.status === "submitted") ? { onSaveManualScore: saveManualScore } : {})} {...(typeof client.confirmAssessmentAudioDeletion === "function" && typeof client.deleteAssessmentAudio === "function" && !readOnly ? { onDeleteAudio: deleteAssessmentAudio } : {})} savingManualScore={manualScoreBusy} />}
  {dialog && <OperatorDashboardDialog dialog={dialog} onClose={() => setDialog(undefined)} />}
  {toast && <div className={`operator-toast operator-toast-${toast.tone}`} role={toast.tone === "danger" ? "alert" : "status"} aria-live={toast.tone === "danger" ? "assertive" : "polite"}>{toast.message}</div>}
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

function TestsRoute({ client, readOnly, initialTab }: { client: OperatorApiClient; readOnly: boolean; initialTab: "placement" | "promotion" }) {
  const [activeTab, setActiveTab] = useState(initialTab);
  return <OperatorPage title="Bài kiểm tra">
    <PageTitle><h1>Bài kiểm tra</h1><p className="muted">Xem bài đầu vào và quản lý đề thi lên mức trong cùng một khu vực.</p></PageTitle>
    <div className="tabs operator-review-tabs" role="tablist" aria-label="Loại bài kiểm tra">
      <button type="button" role="tab" aria-selected={activeTab === "placement"} className={activeTab === "placement" ? "active" : ""} onClick={() => setActiveTab("placement")}>Đề đầu vào</button>
      <button type="button" role="tab" aria-selected={activeTab === "promotion"} className={activeTab === "promotion" ? "active" : ""} onClick={() => setActiveTab("promotion")}>Đề lên mức</button>
    </div>
    {activeTab === "placement"
      ? <ReviewRoute client={client} readOnly={readOnly} canEditWeeklyPractice={false} assessmentOnly embedded />
      : <LevelFormsRoute client={client} readOnly={readOnly} embedded />}
  </OperatorPage>;
}

function LevelFormsRoute({ client, readOnly, embedded = false }: { client: OperatorApiClient; readOnly: boolean; embedded?: boolean }) {
  const modal = useModal();
  const navigate = useNavigate();
  const paths = useOperatorRoutePaths();
  const [data, setData] = useState<AssessmentLevelFormSlotView[]>();
  const [generating, setGenerating] = useState<Cefr | null>(null);
  const [error, setError] = useState<string>();
  const [dialog, setDialog] = useState<{ detail: AssessmentLevelFormDetailView; editing: boolean }>();
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
  const show = (versionId: string, editing = false) => {
    if (typeof client.getAssessmentLevelForm !== "function") return;
    void client.getAssessmentLevelForm(versionId).then(detail => setDialog({ detail, editing })).catch(reason => setError(message(reason)));
  };
  return <><OperatorLevelForms readOnly={readOnly} embedded={embedded} unavailable={missing} view={adaptLevelForms(data, { aiConnected: capabilities?.ai ?? false, generatingTarget: generating })} actions={{
    onBack: () => navigate(paths.root), onOpenSettings: () => navigate("/settings"),
    onGenerate: target => { if (readOnly) return; setGenerating(target); refresh(client.generateAssessmentLevelForm(target as Exclude<CefrLevel, "A1">)); },
    onApprove: id => { if (!readOnly) refresh(client.publishAssessmentLevelForm(id)); }, onView: id => show(id), onEdit: (id, fromPublished) => {
      if (readOnly) return;
      if (fromPublished) void client.copyAssessmentLevelFormToDraft(id).then(detail => { setDialog({ detail, editing: true }); void load(); }).catch(reason => setError(message(reason)));
      else show(id, true);
    },
    onDelete: id => { if (readOnly || typeof client.deleteAssessmentLevelForm !== "function") return; void modal.confirm({ title: "Xoá bản nháp đề thi?", message: "Bản nháp này sẽ bị xoá khỏi danh sách đề lên mức.", confirmLabel: "Xoá bản nháp", tone: "danger" }).then(confirmed => { if (confirmed) refresh(client.deleteAssessmentLevelForm(id)); }); }
  }} />{dialog && <OperatorLevelFormDetail detail={dialog.detail} editing={dialog.editing} readOnly={readOnly} uploadAudio={async (file, filename) => client.uploadContentMedia("audio", file, filename)} onClose={() => setDialog(undefined)} onSave={async input => {
    if (readOnly) return;
    const updated = await client.updateAssessmentLevelForm(dialog.detail.versionId, input);
    setDialog({ detail: updated, editing: true });
    await load();
  }} />}</>;
}

function WeeksRoute({ client, readOnly }: { client: OperatorApiClient; readOnly: boolean }) {
  const navigate = useNavigate();
  const paths = useOperatorRoutePaths();
  const [data, setData] = useState<ContentWeekFrameView>();
  const [suggestions, setSuggestions] = useState<Record<number, WeekSuggestion>>({});
  const [toast, setToast] = useState<{ tone: "success" | "danger"; message: string }>();
  const [generatingWeek, setGeneratingWeek] = useState<number | null>(null);
  const [generationStatus, setGenerationStatus] = useState("");
  const [generationLevels, setGenerationLevels] = useState<Cefr[]>(["A1", "A2", "B1", "B2", "C1"]);
  const [occupiedWeeks, setOccupiedWeeks] = useState<number[]>([]);
  const [generationDialog, setGenerationDialog] = useState<{ weeks: number[]; selectedWeeks: number[]; replacementWeeks: number[]; levelCount: number }>();
  const [preferredGenerationWeek, setPreferredGenerationWeek] = useState<number>();
  const [error, setError] = useState<string>();
  const saveQueue = useRef<Promise<unknown>>(Promise.resolve());
  const capabilities = useCapabilities(client);
  const notify = (message: string, tone: "success" | "danger" = "success") => setToast({ tone, message });
  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(undefined), 4200);
    return () => window.clearTimeout(timer);
  }, [toast]);
  useEffect(() => { void client.getContentWeeks().then(setData).catch(reason => setError(message(reason))); }, [client]);
  useEffect(() => {
    if (typeof client.getContentLessonMatrix !== "function") return;
    void client.getContentLessonMatrix().then(matrix => {
      const levels = matrix.levels.map(level => level.cefr as Cefr);
      if (levels.length) setGenerationLevels(levels);
      setOccupiedWeeks(matrix.weeks.filter(week => week.cells.some(cell => cell.status !== "missing" || cell.lessons.length > 0)).map(week => week.weekNumber));
    }).catch(() => undefined);
  }, [client]);
  if (error) return <Status tone="error">Không tải được khung chủ đề: {error}</Status>;
  if (!data) return <Status>Đang tải khung chủ đề…</Status>;
  const inputs = (source = data) => source.weeks
    .filter(week => week.topic.trim())
    .map(week => ({ weekNumber: week.weekNumber, topic: week.topic, description: week.description, objectives: week.objectives, keyVocabHint: week.keyVocabHint, ...(week.plan ? { plan: week.plan } : {}) }));
  const suggest = (numbers: number[]) => { if (readOnly) return; numbers.forEach(number => setSuggestions(current => ({ ...current, [number]: { state: "loading" } }))); void client.suggestContentWeeks(numbers).then(result => { const next: Record<number, WeekSuggestion> = {}; result.weeks.forEach(week => { next[week.weekNumber] = { state: "options", levels: week.levels ?? [], options: week.options.map(option => ({ ...option, plan: option.plan ?? {} })) }; }); setSuggestions(current => ({ ...current, ...next })); notify("Đã tải 3 phương án chủ đề kèm kế hoạch CEFR × 5 ngày."); }).catch(reason => { setSuggestions(current => { const next = { ...current }; numbers.forEach(number => delete next[number]); return next; }); notify(message(reason), "danger"); }); };
  const save = (source = data, options: { promptForGeneration?: boolean } = {}) => {
    if (readOnly) return Promise.resolve(undefined);
    const payload = inputs(source);
    const request = saveQueue.current.catch(() => undefined).then(() => client.saveContentWeeks(payload));
    saveQueue.current = request.then(() => undefined, () => undefined);
    const completed = request.then(saved => {
      setData(saved);
      notify("Đã lưu khung chủ đề.");
      if (options.promptForGeneration) {
        const weeks = saved.weeks.filter(week => week.topic.trim()).map(week => week.weekNumber);
        const preferredWeek = preferredGenerationWeek && weeks.includes(preferredGenerationWeek)
          ? preferredGenerationWeek
          : saved.weeks.find(week => week.current && weeks.includes(week.weekNumber))?.weekNumber ?? weeks[0];
        if (weeks.length && preferredWeek) setGenerationDialog({ weeks, selectedWeeks: [preferredWeek], replacementWeeks: occupiedWeeks.filter(week => weeks.includes(week)), levelCount: generationLevels.length });
        else notify("Đã lưu khung chủ đề. Chưa có tuần nào có chủ đề để sinh bài.", "danger");
      }
      return saved;
    });
    void completed.catch(reason => notify(message(reason), "danger"));
    return completed;
  };
  const startGeneration = (weekNumbers: number[], levels = generationLevels, savePromise?: Promise<ContentWeekFrameView | undefined>) => {
    const orderedLevels = levels.length ? levels : ["A1", "A2", "B1", "B2", "C1"] as Cefr[];
    setGenerationDialog(undefined);
    setGeneratingWeek(weekNumbers[0] ?? null);
    setGenerationStatus(savePromise ? "Đang lưu chủ đề trước khi sinh bài…" : "Đang chuẩn bị sinh bài…");
    void (async () => {
      try {
        if (savePromise) await savePromise;
        if (typeof client.generateContentLessonWeekBatch !== "function") {
          throw new Error("Máy chủ chưa hỗ trợ sinh tuần theo batch");
        }
        // One server-side batch per week: the API normalizes the canonical plan once,
        // runs every level with its own checkpoints and saves each level as it finishes.
        const results = await generateLessonWeeksBatchSettled(
          weekNumbers,
          orderedLevels,
          (week, batchLevels) => client.generateContentLessonWeekBatch!(week, [...batchLevels]),
          (week, _level, completed, total) => {
            setGeneratingWeek(week);
            setGenerationStatus(`Đang sinh tuần ${week} · batch ${orderedLevels.length} mức (${completed + 1}/${total} bộ đã khởi động)…`);
          }
        );
        const failed = results.filter((result) => result.status === "failed");
        const succeeded = results.length - failed.length;
        const levelSummary = describeBatchLevelResults(results);
        if (failed.length) {
          setGenerationStatus(`⚠ Đã sinh ${succeeded}/${results.length} bộ. ${levelSummary}. Bấm sinh lại để tiếp tục từ checkpoint.`);
          notify(`Đã giữ ${succeeded} bộ thành công; ${failed.length} bộ cần thử lại.`, "danger");
        } else {
          setGenerationStatus(`✓ Đã sinh đủ ${results.length * 5} bài T2–T6. ${levelSummary}.`);
          notify(`Đã sinh đủ bài cho ${weekNumbers.length} tuần.`);
          navigate(paths.lessons);
        }
      } catch (reason) {
        const detail = message(reason);
        setGenerationStatus(`✗ Không thể chuẩn bị đợt sinh bài: ${detail}.`);
        notify(`Không thể chuẩn bị đợt sinh bài: ${detail}`, "danger");
      } finally {
        setGeneratingWeek(null);
      }
    })();
  };
  const view = adaptWeeks(data, { aiConnected: capabilities?.ai ?? false, status: generationStatus, suggestions, generationDialog });
  return <><OperatorWeeks readOnly={readOnly} view={view} actions={{
    onSuggestAll: () => { if (!generatingWeek) suggest(data.weeks.filter(week => !week.topic.trim()).map(week => week.weekNumber).length ? data.weeks.filter(week => !week.topic.trim()).map(week => week.weekNumber) : data.weeks.map(week => week.weekNumber)); },
    onSuggestWeek: week => { if (!generatingWeek) { setPreferredGenerationWeek(week); suggest([week]); } }, onCloseSuggestion: week => setSuggestions(current => { const next = { ...current }; delete next[week]; return next; }), onReopenSuggestion: week => setSuggestions(current => {
      const suggestion = current[week];
      if (suggestion?.state !== "confirmed") return current;
      return {
        ...current,
        [week]: suggestion.options?.length
          ? { state: "options", levels: suggestion.levels ?? [], options: suggestion.options }
          : { state: "error", message: "Các phương án cũ không còn trong API response; bấm Gợi ý để tải lại." }
      };
    }),
    onConfirmSuggestion: (weekNumber, index) => {
      if (readOnly || generatingWeek) return;
      const suggestion = suggestions[weekNumber];
      if (suggestion?.state !== "options") return;
      const option = suggestion.options[index];
      if (!option) return;
      const updated = { ...data, weeks: data.weeks.map(week => week.weekNumber === weekNumber ? { ...week, topic: option.topic, description: option.description, objectives: option.objectives, keyVocabHint: option.keyVocabHint, plan: option.plan } : week) };
      setData(updated);
      setPreferredGenerationWeek(weekNumber);
      setSuggestions(current => ({ ...current, [weekNumber]: { state: "confirmed", topic: option.topic, levels: suggestion.levels ?? [], options: suggestion.options } }));
    },
    onChangeWeek: (weekNumber, patch) => { if (!readOnly) { setPreferredGenerationWeek(weekNumber); setData(current => current ? { ...current, weeks: current.weeks.map(week => {
      if (week.weekNumber !== weekNumber) return week;
      const changed = { ...week, ...patch };
      if ("topic" in patch && patch.topic !== week.topic) { const { plan: _discardedPlan, ...withoutPlan } = changed; return withoutPlan; }
      return changed;
    }) } : current); } },
    onSave: () => { if (!generatingWeek) void save(undefined, { promptForGeneration: true }).catch(() => undefined); },
    onToggleGenerationWeek: week => setGenerationDialog(current => current ? { ...current, selectedWeeks: current.selectedWeeks.includes(week) ? current.selectedWeeks.filter(item => item !== week) : [...current.selectedWeeks, week].sort((a, b) => a - b) } : current),
    onCancelGeneration: () => setGenerationDialog(undefined),
    onStartGeneration: weeks => { if (!generatingWeek && weeks.length) startGeneration(weeks); },
    onOpenLessons: () => { if (!generatingWeek) navigate(paths.lessons); }
  }} />{toast && <div className={`operator-toast operator-toast-${toast.tone}`} role={toast.tone === "danger" ? "alert" : "status"} aria-live={toast.tone === "danger" ? "assertive" : "polite"}>{toast.message}</div>}</>;
}

function LessonsRoute({ client, readOnly }: { client: OperatorApiClient; readOnly: boolean }) {
  const modal = useModal();
  const navigate = useNavigate();
  const paths = useOperatorRoutePaths();
  const [data, setData] = useState<ContentLessonMatrixView>();
  const generationJobs = useSyncExternalStore(subscribeLessonGenerationJobs, lessonGenerationJobsSnapshot, lessonGenerationJobsSnapshot);
  const [error, setError] = useState<string>();
  const [toast, setToast] = useState<{ tone: "success" | "danger"; message: string; sticky?: boolean }>();
  const capabilities = useCapabilities(client);
  const notify = (message: string, tone: "success" | "danger" = "danger") => setToast({ tone, message });
  useEffect(() => {
    if (!toast || toast.sticky) return;
    const timer = window.setTimeout(() => setToast(undefined), 4200);
    return () => window.clearTimeout(timer);
  }, [toast]);
  useEffect(() => { void client.getContentLessonMatrix().then(setData).catch(reason => setError(message(reason))); }, [client]);
  if (error) return <Status tone="error">Không tải được ma trận bài học: {error}</Status>;
  if (!data) return <Status>Đang tải ma trận bài học…</Status>;
  const open = (week: number, cefr: Cefr, state?: { manualCreate?: boolean; topic?: string }) => navigate(`${paths.lessons}/${week}/${cefr}`, state ? { state } : undefined);
  const produce = (week: number, cefr: Cefr) => {
    setToast({ tone: "success", message: "Đang chuẩn bị bộ 5 bài…", sticky: true });
    void startLessonGenerationJob(week, cefr, () => client.generateContentLessonDraft(week, cefr))
      .then(() => client.getContentLessonMatrix())
      .then(next => { setData(next); notify(`Đã sinh xong tuần ${week} · mức ${cefr}.`, "success"); })
      .catch(reason => notify(message(reason), "danger"));
  };
  const saveLevels = (levels: Cefr[]) => {
    if (readOnly || typeof client.setContentLessonLevels !== "function") return;
    void client.setContentLessonLevels(levels).then(setData).catch(reason => notify(message(reason)));
  };
  const removeLevel = async (cefr: Cefr) => {
    if (cefr !== "C1" || readOnly || data.levels.length <= 1) return;
    const confirmed = await modal.confirm({
      title: `Xóa cột ${cefr}?`,
      message: `Cột ${cefr} sẽ được ẩn khỏi ma trận và AI chủ đề/sinh bài sẽ không chạy mức này. Dữ liệu bài ${cefr} cũ vẫn được giữ để có thể thêm lại sau.`,
      confirmLabel: `Xóa cột ${cefr}`,
      tone: "danger"
    });
    if (confirmed) saveLevels(data.levels.filter(level => level.cefr !== cefr).map(level => level.cefr));
  };
  return <><OperatorLessons readOnly={readOnly} view={adaptLessonMatrix(data, { aiConnected: capabilities?.ai ?? false, extraLevels: data.levels.some(item => item.cefr === "C1") ? [] : ["C1"], generatingCells: generationJobs.filter(job => job.status === "running").map(job => ({ week: job.week, cefr: job.level as Cefr, message: "Đang sinh bộ 5 bài…" })) })} actions={{
    onOpenSettings: () => navigate("/settings"), onAddLevel: cefr => { if (cefr === "C1") saveLevels([...data.levels.map(level => level.cefr), cefr]); }, onRemoveLevel: removeLevel, onGenerate: (week, cefr) => { if (!readOnly) produce(week, cefr); }, onCreateManual: (week, cefr) => { if (!readOnly) { const topic = data.weeks.find(candidate => candidate.weekNumber === week)?.topic; open(week, cefr, topic ? { manualCreate: true, topic } : { manualCreate: true }); } }, onOpenSet: open
  }} />{toast && <div className={`operator-toast operator-toast-${toast.tone}`} role={toast.tone === "danger" ? "alert" : "status"} aria-live={toast.tone === "danger" ? "assertive" : "polite"}>{toast.message}</div>}</>;
}

function LessonSetRoute({ client, readOnly, week, cefr }: { client: OperatorApiClient; readOnly: boolean; week: number; cefr: Cefr }) {
  const modal = useModal();
  const navigate = useNavigate();
  const location = useLocation();
  const paths = useOperatorRoutePaths();
  const [data, setData] = useState<ContentLessonSetVersionView>();
  const [error, setError] = useState<string>();
  const [actionError, setActionError] = useState<string>();
  const [actionMessage, setActionMessage] = useState<string>();
  const [activeMutation, setActiveMutation] = useState<LessonSetActionKey>();
  const [busy, setBusy] = useState(false);
  const [editor, setEditor] = useState<ContentLessonDraftInput>();
  const capabilities = useCapabilities(client);
  const manualCreate = Boolean((location.state as { manualCreate?: boolean } | null)?.manualCreate);
  const manualTopic = (location.state as { topic?: string } | null)?.topic ?? "";
  const transientManualSet = (): ContentLessonSetVersionView => ({
    lessonSetId: "", versionId: "", version: 0, status: "draft", weekNumber: week, topic: manualTopic,
    cefr, explanationLanguage: "Tiếng Việt", createdBy: null, approvedBy: null, createdAt: new Date().toISOString(), publishedAt: null,
    weeklyPractice: { task: `Write 3–5 sentences about “${manualTopic || "this week's topic"}”.`, guidance: "Use at least 3 words from this week's lessons.", inputMode: "text_or_dictation", requiredVocabulary: [] }, lessons: []
  });
  const load = () => client.getContentLessonSet(week, cefr).then(setData).catch(reason => {
    if (manualCreate && reason instanceof Error && reason.message === "CONTENT_LESSON_SET_NOT_FOUND") setData(transientManualSet());
    else setError(message(reason));
  });
  useEffect(() => { void load(); }, [client, week, cefr]);
  if (error) return <Status tone="error">Không tải được bộ bài: {error}</Status>;
  if (!data) return <Status>Đang tải bộ bài…</Status>;
  const mutate = (promise: Promise<ContentLessonSetVersionView>, options?: { action?: LessonSetActionKey; pending?: string; success?: string }) => {
    if (readOnly) return;
    setActionError(undefined);
    setActionMessage(options?.pending);
    setActiveMutation(options?.action);
    setBusy(true);
    void promise
      .then(result => { setData(result); setActionMessage(options?.success); setEditor(undefined); })
      .catch(reason => { setActionMessage(undefined); setActionError(message(reason)); })
      .finally(() => { setBusy(false); setActiveMutation(undefined); });
  };
  const publish = () => {
    if (readOnly) return;
    setActionError(undefined);
    setBusy(true);
    const prepared = data.status === "draft" ? client.submitContentLessonSet(data.versionId) : Promise.resolve(data);
    void prepared
      .then(version => { setData(version); return client.publishContentLessonSet(version.versionId); })
      .then(setData)
      .catch(reason => setActionError(message(reason)))
      .finally(() => setBusy(false));
  };
  const confirmAction = async (options: Parameters<typeof modal.confirm>[0], action: () => void) => {
    if (readOnly) return;
    if (await modal.confirm(options)) action();
  };
  const approveSet = () => void confirmAction({
    title: "Duyệt bộ bài?",
    message: `Bộ bài tuần ${week} · ${cefr} sẽ được xuất bản cho học viên ở mức này.`,
    confirmLabel: "Duyệt bộ bài",
    tone: "primary"
  }, publish);
  const regenerateSet = () => void confirmAction({
    title: "Sinh lại bộ bài?",
    message: `AI sẽ tạo lại bộ bài tuần ${week} · ${cefr}. Nội dung hiện tại có thể bị thay thế.`,
    confirmLabel: "Sinh lại",
    tone: "primary",
    countdownSeconds: 5
  }, () => mutate(client.generateContentLessonDraft(week, cefr)));
  const retireSet = () => void confirmAction({
    title: "Thu hồi duyệt bộ bài?",
    message: `Học viên mức ${cefr} sẽ không còn truy cập bộ bài tuần ${week}.`,
    confirmLabel: "Thu hồi duyệt",
    tone: "danger"
  }, () => mutate(client.retireContentLessonSet(data.versionId)));
  const saveLesson = (lesson: ContentLessonDraftInput) => mutate(client.upsertContentLessonDay(week, cefr, lesson.dayNumber, lesson, data.version || undefined));
  const openEditor = (day: number, id?: string) => {
    const current = id ? data.lessons.find(lesson => lesson.id === id) : data.lessons.find(lesson => lesson.dayNumber === day);
    setEditor(current ? { dayNumber: current.dayNumber, title: current.title, durationMinutes: current.durationMinutes, parts: current.parts } : emptyLesson(day));
  };
  const deleteLesson = async (id: string) => {
    if (readOnly) return;
    const lesson = data.lessons.find(candidate => candidate.id === id);
    if (lesson && await modal.confirm({ title: `Xoá ${lesson.title}?`, message: "Bài học sẽ bị xoá khỏi bộ bài nháp.", confirmLabel: "Xoá bài", tone: "danger" })) mutate(client.deleteContentLessonDay(week, cefr, lesson.dayNumber, data.version));
  };
  const deleteSet = async () => { if (readOnly) return; if (await modal.confirm({ title: "Xoá toàn bộ bộ bài nháp?", message: `Toàn bộ bài tuần ${week} · ${cefr} sẽ bị xoá.`, confirmLabel: "Xoá bộ bài", tone: "danger" })) { if (!data.versionId) { navigate(paths.lessons); return; } setActionError(undefined); setBusy(true); void client.deleteContentLessonDraftSet(week, cefr).then(() => navigate(paths.lessons)).catch(reason => setActionError(message(reason))).finally(() => setBusy(false)); } };
  const unavailableSet = {
    ...(typeof client.fillContentLessonPhrases !== "function" ? { fillPhrases: unavailable("endpoint bổ sung cụm từ cho bộ bài") } : {}),
    ...(typeof client.enrichContentLessonDraft !== "function" && typeof client.enrichContentLessonDay !== "function"
      ? { enrich: unavailable("endpoint bổ sung chi tiết cho bộ bài") }
      : {})
  };
  const mutationMessage = actionError ?? actionMessage;
  return <><OperatorLessonSet readOnly={readOnly} unavailable={unavailableSet} view={adaptLessonSet(data, { aiConnected: capabilities?.ai ?? false, mutationState: busy ? "loading" : actionError ? "error" : "idle", ...(activeMutation ? { activeMutation } : {}), ...(mutationMessage ? { mutationMessage } : {}), ...(typeof client.resolveContentLessonVocabularyImage === "function" ? { resolveVocabularyImage: (lessonId: string, itemIndex: number) => client.resolveContentLessonVocabularyImage!(week, cefr, lessonId, itemIndex) } : {}) })} actions={{
    onBack: () => navigate(paths.lessons), onApprove: approveSet, onUnapprove: retireSet, onRegenerate: regenerateSet, onDeleteSet: deleteSet,
    onFillPhrases: () => { if (typeof client.fillContentLessonPhrases === "function") mutate(client.fillContentLessonPhrases(week, cefr, data.version), { action: "fillPhrases", pending: "AI đang bổ sung cụm từ…", success: "Đã bổ sung cụm từ. Các nội dung cũ được giữ nguyên." }); },
    onEnrich: () => { if (typeof client.enrichContentLessonDraft === "function") mutate(client.enrichContentLessonDraft(week, cefr, data.version), { action: "enrich", pending: "AI đang tự động điền các nội dung còn thiếu…", success: "Đã tự động điền các nội dung còn thiếu. Vui lòng kiểm tra lại trước khi duyệt." }); },
    onRegenerateDay: day => { if (typeof client.enrichContentLessonDay === "function") mutate(client.enrichContentLessonDay(week, cefr, day, data.version), { action: "enrich", pending: `AI đang sinh lại bài T${day + 1}…`, success: `Đã sinh lại bài T${day + 1}; các ngày khác được giữ nguyên.` }); },
    onEditLesson: id => openEditor(0, id), onDeleteLesson: deleteLesson, onComposeDay: openEditor,
    onSaveWeeklyPractice: async input => {
      if (readOnly) return;
      const saved = await client.saveContentWeeklyPractice(input.week, input.cefr, {
        expectedVersion: input.expectedVersion,
        task: input.task,
        guidance: input.guidance,
        requiredVocabulary: input.requiredVocabulary
      });
      setData(saved);
    }
  }} />{!readOnly && editor && <LessonFormEditor weekNumber={week} cefr={cefr} initial={editor} onSave={saveLesson} onCancel={() => setEditor(undefined)} uploadMedia={client.uploadContentMedia} busy={busy} />}</>;
}

function ReviewRoute({ client, readOnly, canEditWeeklyPractice, assessmentOnly = false, embedded = false }: { client: OperatorApiClient; readOnly: boolean; canEditWeeklyPractice: boolean; assessmentOnly?: boolean; embedded?: boolean }) {
  const modal = useModal();
  const location = useLocation();
  const initialTab = assessmentOnly ? "tests" : (location.state as { reviewTab?: ReviewTab } | null)?.reviewTab ?? "weekly";
  const [tab, setTab] = useState<ReviewTab>(initialTab);
  const [data, setData] = useState<ContentReviewView>();
  const [error, setError] = useState<string>();
  const [dialog, setDialog] = useState<ContentReviewAssessmentDetailView>();
  const capabilities = useCapabilities(client);
  const load = async () => {
    try {
      const next = await client.getContentReview();
      if (typeof client.listAssessmentAudio !== "function") {
        setData(next);
        return;
      }
      try {
        const audio = await client.listAssessmentAudio();
        const bySource = new Map(audio.items.flatMap(item => (item.sourceEntityId && (item.sourceFlow === "season" || item.sourceFlow === "weekly_practice")) ? [[item.sourceEntityId, item] as const] : []));
        const byArtifact = new Map(audio.items.map(item => [item.artifactKey, item] as const));
        const attachAudio = <T extends { id: string; audioArtifact?: { artifactKey: string } }>(item: T) => {
          const artifact = item.audioArtifact?.artifactKey
            ? byArtifact.get(item.audioArtifact.artifactKey) ?? bySource.get(item.id)
            : bySource.get(item.id);
          return artifact ? { ...item, audioArtifact: artifact } : item;
        };
        setData({
          ...next,
          coachSamples: next.coachSamples.map(attachAudio),
          submissions: next.submissions.map(attachAudio),
          lessonAttempts: next.lessonAttempts.map(item => {
            const artifact = item.speakingArtifactKey ? byArtifact.get(item.speakingArtifactKey) : undefined;
            return artifact ? { ...item, audioArtifact: artifact } : item;
          })
        });
      } catch {
        setData(next);
      }
    } catch (reason) {
      setError(message(reason));
    }
  };
  useEffect(() => { void load(); }, [client]);
  if (error) return <Status tone="error">Không tải được dữ liệu đọc mẫu: {error}</Status>;
  if (!data) return <Status>Đang tải dữ liệu đọc mẫu…</Status>;
  const refresh = (promise: Promise<unknown>) => void promise.then(load).catch(reason => setError(message(reason)));
  const decide = async (id: string, accepted: boolean) => {
    if (readOnly) return;
    const practiceAppeal = data.appeals.find(appeal => appeal.id === id)?.kind === "weekly_practice";
    let newScore: number | undefined;
    if (accepted && practiceAppeal) {
      const rawScore = await modal.prompt({
        title: "Chấm lại bài thực hành tuần", label: "Điểm mới (0–100)", inputType: "number", confirmLabel: "Tiếp tục"
      });
      if (rawScore == null) return;
      const parsedScore = Number(rawScore);
      if (!Number.isInteger(parsedScore) || parsedScore < 0 || parsedScore > 100) return;
      newScore = parsedScore;
    }
    const resolution = await modal.prompt({
      title: accepted ? "Chấp nhận kháng nghị" : "Từ chối kháng nghị",
      label: "Nội dung xử lý / giải thích cho học viên",
      confirmLabel: accepted ? "Chấp nhận" : "Từ chối",
      tone: accepted ? "primary" : "danger"
    });
    if (resolution?.trim()) refresh(client.decideReviewedAppeal(id, {
      status: accepted ? "accepted" : "rejected", resolution: resolution.trim(), ...(newScore === undefined ? {} : { newScore })
    }));
  };
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
  const deleteReviewedAudio = async (evidence: AudioEvidence) => {
    if (readOnly || !evidence.fileId || typeof client.confirmAssessmentAudioDeletion !== "function" || typeof client.deleteAssessmentAudio !== "function") return;
    const confirmation = await client.confirmAssessmentAudioDeletion(evidence.fileId);
    await client.deleteAssessmentAudio(evidence.fileId, confirmation.confirmationToken);
    if (dialog) setDialog(await client.getContentReviewAssessment(dialog.attemptId));
    await load();
  };
  const guardedManualGrade: OperatorReviewActions["onGradeManual"] = (id, input) => {
    if (!readOnly) refresh(client.gradeReviewedSubmission(id, input));
  };
  return <><OperatorReview readOnly={readOnly} embedded={embedded} mode={assessmentOnly ? "assessment" : "weekly"} unavailable={missing} view={adaptReview(data, reviewToApi[tab], { aiConnected: capabilities?.ai ?? false })} actions={{
    onTabChange: setTab, onMarkSubmission: (id, checked) => { if (!readOnly) refresh(client.setContentReviewChecked("submission", id, checked)); }, onMarkCoachTurn: (id, checked) => { if (!readOnly) refresh(client.setContentReviewChecked("coach", id, checked)); }, onGradeAi: gradeAi, onGradeManual: guardedManualGrade, onDecideAppeal: decide, onViewTest: viewTest, ...(typeof client.confirmAssessmentAudioDeletion === "function" && typeof client.deleteAssessmentAudio === "function" && !readOnly ? { onDeleteAudio: deleteReviewedAudio } : {}),
    ...(canEditWeeklyPractice ? { onSaveWeeklyPractice: async input => {
      if (readOnly) return;
      await client.saveContentWeeklyPractice(input.week, input.cefr, { expectedVersion: input.expectedVersion, task: input.task, guidance: input.guidance, requiredVocabulary: input.requiredVocabulary });
      const next = await client.getContentReview();
      setData(next);
    } } : {})
  }} />{dialog && <OperatorReviewAssessmentDetail detail={dialog} onClose={() => setDialog(undefined)} {...(typeof client.confirmAssessmentAudioDeletion === "function" && typeof client.deleteAssessmentAudio === "function" && !readOnly ? { onDeleteAudio: deleteReviewedAudio } : {})} />}</>;
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
    onSave: values => { if (readOnly) return; setSaving(true); void client.saveContentPrompts(Object.entries(values).map(([key, content]) => ({ key: promptToApi[key as PromptKey], content }))).then(setData).catch(reason => setError(message(reason))).finally(() => setSaving(false)); },
    onPublish: (key, version) => { if (readOnly) return; setSaving(true); void client.publishContentPrompt(promptToApi[key], version).then(group => setData(current => current ? { groups: current.groups.map(item => item.key === group.key ? group : item) } : current)).catch(reason => setError(message(reason))).finally(() => setSaving(false)); }
  }} />;
}

const operatorErrorMessages: Record<string, string> = {
  WEEK_SUGGESTION_FAILED: "Không thể tạo gợi ý tuần lúc này. Hãy bấm Gợi ý để thử lại; nếu vẫn lỗi, bạn có thể nhập chủ đề thủ công rồi lưu.",
  AI_UNAVAILABLE: "AI chưa được cấu hình trên máy chủ.",
  AI_PROMPT_NOT_READY: "Chưa có prompt AI đang hoạt động cho thao tác này.",
  AI_OUTPUT_INVALID: "AI trả về nội dung không đúng định dạng. Hãy bấm lại thao tác vừa rồi; ở ma trận bài học, bấm Sinh để thử lại hoặc chọn Soạn tay nếu lỗi tiếp tục.",
  AI_OUTPUT_TRUNCATED: "AI bị cắt giữa chừng vì vượt giới hạn output; bộ bài chưa được lưu.",
  AI_INPUT_INVALID: "Dữ liệu gửi cho AI không hợp lệ.",
  AI_PROMPT_NOT_FOUND: "Không tìm thấy prompt AI đang dùng.",
  AI_PROVIDER_FAILED: "Nhà cung cấp AI không trả lời hoặc trả lỗi.",
  AI_PROVIDER_MALFORMED_RESPONSE: "AI trả về JSON bị thiếu hoặc không đọc được; bộ bài chưa được lưu.",
  AI_PROVIDER_REJECTED: "Nhà cung cấp AI từ chối request; bộ bài chưa được lưu.",
  AI_PROVIDER_NETWORK: "Không kết nối được tới nhà cung cấp AI; bộ bài chưa được lưu.",
  AI_PROVIDER_UNAVAILABLE: "Nhà cung cấp AI đang tạm thời không khả dụng; bộ bài chưa được lưu.",
  AI_PROVIDER_RATE_LIMIT: "Nhà cung cấp AI đang giới hạn lượt gọi; hãy chờ rồi thử lại.",
  AI_TIMEOUT: "AI xử lý quá thời gian cho phép.",
  AI_LESSON_GENERATION_FAILED: "AI chưa tạo được bài học. Hãy bấm Sinh để thử lại; nếu vẫn lỗi, chọn Soạn tay để tiếp tục mà không mất nội dung.",
  AI_LESSON_SET_INVALID: "AI trả về bộ bài chưa đủ 5 ngày hoặc sai cấu trúc.",
  CONTENT_VALIDATION_FAILED: "Nội dung thủ công chưa đủ để xuất bản. Hãy sửa các mục được nêu bên dưới.",
  CONTENT_LESSON_SET_INCOMPLETE: "Bộ bài phải có đủ 5 bài T2–T6 trước khi duyệt.",
  HTTP_429: "AI đang bị giới hạn số lượt gọi; hãy thử lại sau một chút.",
  HTTP_504: "Hệ thống vẫn đang hoàn tất bộ bài. Vui lòng chờ một chút rồi tải lại ma trận; không bấm Sinh lại.",
  CONTENT_WEEK_NOT_FOUND: "Không tìm thấy tuần cần sinh bài.",
  CONTENT_LEVEL_NOT_ACTIVE: "Mức này đang không bật trong ma trận bài học."
};

function message(reason: unknown) {
  const raw = reason instanceof Error ? reason.message : String(reason);
  const label = operatorErrorMessages[raw] ?? raw;
  const details = reason && typeof reason === "object" && "details" in reason ? (reason as { details?: unknown }).details : undefined;
  const issues = details && typeof details === "object" && "issues" in details ? (details as { issues?: unknown }).issues : undefined;
  if (raw === "CONTENT_VALIDATION_FAILED" && Array.isArray(issues) && issues.length) {
    const summary = issues.slice(0, 2).map(issue => {
      if (typeof issue === "string") return issue;
      if (!issue || typeof issue !== "object") return String(issue);
      const item = issue as { message?: unknown };
      return item.message === undefined ? "Nội dung chưa hợp lệ." : String(item.message);
    }).join("; ");
    return `${label} Chi tiết: ${summary}`;
  }
  return label;
}
