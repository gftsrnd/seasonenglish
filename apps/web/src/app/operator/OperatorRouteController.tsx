import { monthlyManualSeed } from "./monthly-manual-seed.js";
import { describeMonthlyFindings, MONTHLY_PART_TITLES, type MonthlyFindingLine } from "./monthly-failure-findings.js";
import { monthlyLessonDisplayTitle } from "@e4s/domain/monthly";
import { createContext, useContext, useEffect, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore, type ReactNode } from "react";
import { Link, Navigate, useLocation, useNavigate } from "react-router";
import "./styles.css";
import type {
  AssessmentFormPreviewView,
  AssessmentDefinitionView,
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
  MonthlyFinalDraftView,
  SessionView,
  SystemCapabilitiesView
} from "@e4s/contracts";
import { operatorApiClient as apiClient } from "../../api/operator.js";
import { OperatorDashboard, OperatorProfileRows } from "./Dashboard.js";
import { OperatorLevelFormDetail, OperatorLevelForms } from "./LevelForms.js";
import { OperatorLessonSet, OperatorLessons } from "./Lessons.js";
import { emptyLesson, LessonFormEditor } from "./LessonFormEditor.js";
import { OperatorPrompts } from "./Prompts.js";
import { OperatorReview, OperatorReviewAssessmentDetail, promptExerciseCorrection } from "./Review.js";
import type { ManualScoreInput } from "./AssessmentManualScore.js";
import { OperatorWeeks } from "./Weeks.js";
import { MonthlyLessonPreview, OperatorMonths } from "./Months.js";
import { OperatorRequests } from "./OperatorRequests.js";
import { MonthlyFinalReview } from "./MonthlyFinalReview.js";
import { Badge, OperatorPage, PageTitle } from "./primitives.js";
import { ModalProvider, useDialog, useModal } from "../shared/ModalProvider.js";
import { AssessmentDefinitionPreview } from "../shared/AssessmentDefinitionPreview.js";
import { ScrollJumpButton, useScrollJump } from "../shared/ScrollJump.js";
import { useToast } from "../shared/design-system.js";
import type { AudioEvidence } from "../shared/media/audio-evidence.js";
import { formatScore, formatScoreOutOf } from "../shared/format-score.js";
import { adaptAssessmentOverview, adaptLevelForms, adaptLessonMatrix, adaptLessonSet, adaptPrompts, adaptReview, adaptWeeks } from "./adapters.js";
import type { Cefr, LessonSetActionKey, OperatorReviewActions, PromptKey, ReviewTab, WeekSuggestion } from "./types.js";
import { describeBatchLevelResults, generateLessonWeeksBatchSettled, lessonGenerationJobsSnapshot, startLessonGenerationJob, subscribeLessonGenerationJobs } from "./lesson-generation.js";

export type OperatorApiClient = typeof apiClient;

type OperatorRoutePaths = {
  root: string;
  weeks: string;
  levelForms: string;
  months: string;
  lessons: string;
  review: string;
  requests: string;
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
  if (session.role !== "operator" && session.role !== "manager") return <Status tone="error">Tài khoản này không có quyền mở khu vực học thuật.</Status>;
  const readOnly = session.role === "manager";
  const query = new URLSearchParams(location.search);
  const reviewTab = query.get("tab") ?? (location.state as { reviewTab?: ReviewTab } | null)?.reviewTab;
  const oldReopens = location.pathname === paths.months && location.hash === "#my-reopen-requests";
  if (!readOnly && (location.pathname === paths.requests || oldReopens)) {
    query.set("tab", oldReopens || reviewTab === "sent" ? "sent" : "appeals");
    return <Navigate to={`${paths.review}?${query}`} replace />;
  }
  const props = { client, readOnly };
  const detail = location.pathname.match(new RegExp(`^${escapeRegExp(paths.lessons)}/(\\d+)/(A1|A2|B1|B2|C1)$`));
  const monthlyLesson = location.pathname.match(new RegExp(`^${escapeRegExp(paths.months)}/lesson/([^/]+)/(\\d+)$`));
  const content = detail ? <LessonSetRoute {...props} week={Number(detail[1])} cefr={detail[2] as Cefr} />
    : location.pathname === paths.root ? <DashboardRoute {...props} />
      : location.pathname === paths.weeks ? <WeeksRoute {...props} />
      : location.pathname === paths.tests ? <TestsRoute key={paths.tests} {...props} initialTab="placement" />
        : location.pathname === paths.levelForms ? <TestsRoute key={paths.levelForms} {...props} initialTab="promotion" />
        : monthlyLesson ? <MonthsRoute {...props} preview={{ frameworkId: monthlyLesson[1]!, dayNumber: Number(monthlyLesson[2]) }} />
        : location.pathname === paths.months ? <MonthsRoute {...props} />
          : location.pathname === paths.lessons ? <LessonsRoute {...props} />
            : location.pathname === paths.review ? (readOnly ? <ReviewRoute {...props} canEditWeeklyPractice /> : <OperatorReviewWorkspace client={client} />)
              : location.pathname === paths.prompts ? <PromptsRoute client={client} readOnly={false} />
                : <Status tone="error">Đường dẫn vận hành không tồn tại.</Status>;
  return content;
}

function routePathsFor(basePath: "/op" | "/mgr/ops"): OperatorRoutePaths {
  return {
    root: basePath === "/op" ? basePath : `${basePath}/levels`,
    weeks: `${basePath}/weeks`,
    levelForms: basePath === "/op" ? `${basePath}/levelforms` : `${basePath}/level-forms`,
    months: `${basePath}/months`,
    lessons: `${basePath}/lessons`,
    review: `${basePath}/review`,
    requests: `${basePath}/requests`,
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

/** VH-R44 (chốt 03/11): daily lessons have no regenerate button. Kept behind a flag for a later decision. */
const SHOW_MONTHLY_DAY_REGENERATE = false;

function MonthsRoute({ client, readOnly, preview }: { client: OperatorApiClient; readOnly: boolean; preview?: { frameworkId: string; dayNumber: number } }) {
  const toast = useToast();
  const modal = useModal();
  const navigate = useNavigate();
  const { search } = useLocation();
  const paths = useOperatorRoutePaths();
  const browserDate = new Date();
  const browserMonth = `${browserDate.getFullYear()}-${String(browserDate.getMonth() + 1).padStart(2, "0")}`;
  const queryMonth = new URLSearchParams(search).get("month");
  const focusedPart = new URLSearchParams(search).get("part");
  const linkedMonth = queryMonth && /^\d{4}-(0[1-9]|1[0-2])$/u.test(queryMonth) ? queryMonth : null;
  const [month, setMonth] = useState(linkedMonth ?? browserMonth);
  const [cefr, setCefr] = useState<CefrLevel>("A1");
  const [overview, setOverview] = useState<import("@e4s/contracts").MonthlyOperatorOverviewView>();
  const [resourceCheckpoint, setResourceCheckpoint] = useState<Awaited<ReturnType<OperatorApiClient["getContentMonthResourceCheckpoint"]>>>();
  const [resourceGenerationActive,setResourceGenerationActive] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const [editor, setEditor] = useState<{ frameworkId: string; dayNumber: number; initial?: { title?: string; parts?: Array<{ code?: string; title?: string; content?: Record<string, unknown> }> }; kind?: "new" | "review"; date?: string; vocabularyCount?: number; defaultTitle?: string; cefr?: CefrLevel; findings?: { title: string; lines: MonthlyFindingLine[] }; grammarStepLabels?: Record<string, string>; focusFinding?: string }>();
  const systemMonthInitialized = useRef(false);
  useEffect(() => { if (linkedMonth) setMonth(linkedMonth); }, [linkedMonth]);
  const pendingScrollRestore = useRef<number | null>(null);
  const selectMonth = (nextMonth: string) => {
    if (nextMonth === month) return;
    pendingScrollRestore.current = window.scrollY;
    setMonth(nextMonth);
  };
  const selectLevel = (nextLevel: CefrLevel) => {
    if (nextLevel === cefr) return;
    pendingScrollRestore.current = window.scrollY;
    setCefr(nextLevel);
  };
  const loadResourceCheckpoint = () => !readOnly && typeof client.getContentMonthResourceCheckpoint === "function"
    ? client.getContentMonthResourceCheckpoint(month, cefr).catch(() => undefined)
    : Promise.resolve(undefined);
  useEffect(() => {
    if ((!resourceGenerationActive && resourceCheckpoint?.progress?.status !== "running") || typeof client.getContentMonthResourceCheckpoint !== "function") return;
    let stopped=false;
    let timer:ReturnType<typeof setTimeout>;
    const poll=async()=>{
      try {
        const next=await client.getContentMonthResourceCheckpoint(month,cefr);
        if (!stopped && !resourceGenerationActive && next.progress?.status === "completed" && next.progress.runId === resourceCheckpoint?.progress?.runId) {
          const refreshed=await client.getContentMonth(month);
          if (!stopped) setOverview(refreshed);
        }
        if (!stopped && (!resourceGenerationActive || next.progress?.status === "running")) setResourceCheckpoint(next);
      } catch { /* Keep the last observed stage; the generation request reports its result. */ }
      if (!stopped) timer=setTimeout(()=>void poll(),1500);
    };
    timer=setTimeout(()=>void poll(),300);
    return ()=>{stopped=true;clearTimeout(timer);};
  },[client,month,cefr,resourceGenerationActive,resourceCheckpoint?.progress?.status,resourceCheckpoint?.progress?.runId]);
  const load = async () => {
    setError(undefined);
    try {
      const [next, checkpoint] = await Promise.all([
        client.getContentMonth(month),
        loadResourceCheckpoint()
      ]);
      setOverview(next);
      setResourceCheckpoint(checkpoint);
    }
    catch (reason) { setError(message(reason)); }
  };
  useEffect(() => {
    setOverview(undefined);
    void Promise.all([
      !systemMonthInitialized.current && !linkedMonth && client.getCurrentContentMonth ? client.getCurrentContentMonth() : client.getContentMonth(month),
      loadResourceCheckpoint()
    ]).then(([next, checkpoint]) => {
      setOverview(next);
      setResourceCheckpoint(checkpoint);
      if (!systemMonthInitialized.current) {
        systemMonthInitialized.current = true;
        if (!linkedMonth && next.monthWindow.current !== month) setMonth(next.monthWindow.current);
      }
    }).catch((reason) => setError(message(reason)));
  }, [client, month, cefr]);
  useLayoutEffect(() => {
    if (pendingScrollRestore.current === null || (!overview && !error)) return;
    window.scrollTo(0, pendingScrollRestore.current);
    pendingScrollRestore.current = null;
  }, [overview, error]);
  const run = async <T,>(action: () => Promise<T>, success?: string, propagateError = false): Promise<T | undefined> => {
    setBusy(true); setError(undefined);
    try { const result = await action(); await load(); if (success) toast.show({ message: success, tone: "ok" }); return result; }
    catch (reason) { if (propagateError) throw reason; const detail = message(reason); setError(detail); toast.show({ message: detail, tone: "danger" }); return undefined; }
    finally { setBusy(false); }
  };
  // Toasts name the day the way the calendar does: "bài 7" is the 7th new lesson (Friday reviews not counted), a review is "bài ôn".
  const monthDayLabel = (dayNumber: number) => {
    const day = overview?.calendar?.find((item) => item.lessonNumber === dayNumber && (item.kind === "new" || item.kind === "review"));
    return day?.kind === "review" ? "bài ôn" : day?.newLessonNumber ? `bài ${day.newLessonNumber}` : "bài học";
  };
  const openDayEditor = (frameworkId: string, dayNumber: number, cellSlot?: { kind: "new" | "review"; date?: string | undefined; title?: string | undefined }, focusFinding?: string) => {
    const framework = overview?.frameworks.find((item) => item.id === frameworkId);
    const savedLesson = framework?.lessons.find((item) => item.lessonNumber === dayNumber);
    const saved = savedLesson?.content;
    // Approved plan: prefill the day's allocated resources so manual authoring starts from the plan.
    const seed = framework ? monthlyManualSeed(framework, dayNumber) : null;
    // A day without a plan allocation (old plans) takes its kind from the calendar cell the operator clicked,
    // then the saved lesson row, then the overview calendar.
    const slot = overview?.calendar?.find((item) => item.lessonNumber === dayNumber && (item.kind === "new" || item.kind === "review"));
    const kind = seed?.kind ?? cellSlot?.kind ?? savedLesson?.kind ?? (slot?.kind === "review" ? "review" : slot?.kind === "new" ? "new" : undefined);
    const date = seed?.date ?? savedLesson?.lessonDate ?? cellSlot?.date ?? slot?.date;
    // Default title follows the calendar label ("Bài 7", "Bài ôn tuần 2"), not the slot number (lessonNumber 8 is "Bài 7" after a review day).
    const calendarDay = overview?.calendar?.find((item) => (date ? item.date === date : item.lessonNumber === dayNumber) && (item.kind === "new" || item.kind === "review"));
    const defaultTitle = cellSlot?.title ?? (kind === "review"
      ? (calendarDay?.reviewWeekNumber ? `Bài ôn tuần ${calendarDay.reviewWeekNumber}` : "Bài ôn tập")
      : calendarDay?.newLessonNumber ? `Bài ${calendarDay.newLessonNumber}` : undefined);
    // The day's own level: the preview route does not carry the months page's selected level (it starts at A1).
    const meta = { ...(kind ? { kind } : {}), ...(date ? { date } : {}), ...(seed ? { vocabularyCount: seed.vocabularyCount } : {}), ...(defaultTitle ? { defaultTitle } : {}), ...(framework ? { cefr: framework.cefr } : {}) };
    // A saved title "Bài 8" taken from the raw slot is shown (and re-saved) with the calendar's number.
    const displayTitle = (title?: string) => title && kind ? monthlyLessonDisplayTitle(title, { kind, newLessonNumber: calendarDay?.newLessonNumber, reviewWeekNumber: calendarDay?.reviewWeekNumber }) : title;
    const savedTitle = displayTitle(saved?.title);
    // No draft yet but a failed AI candidate: start from that candidate so the Operator only fixes the flagged items.
    const candidate = savedLesson?.generationFailure?.candidate;
    const candidateTitle = displayTitle(candidate?.title);
    // The findings the Operator is fixing stay pinned in the editor: the draft's own check, or the failed candidate's.
    const findingKind = kind === "review" ? "review" as const : "new" as const;
    const findingSource = saved?.parts?.length
      ? savedLesson?.status !== "approved" && savedLesson ? { title: "Kiểm tra chất lượng bản nháp", findings: [...savedLesson.quality.severe, ...savedLesson.quality.light], parts: saved.parts } : undefined
      : candidate?.parts?.length && savedLesson?.generationFailure ? { title: "Lần sinh AI gần nhất chưa đạt", findings: [...savedLesson.generationFailure.report.severe, ...savedLesson.generationFailure.report.light], parts: candidate.parts } : undefined;
    const findingLines = findingSource ? describeMonthlyFindings(findingSource.findings, { kind: findingKind, parts: findingSource.parts }) : [];
    // Daily practice questions name their grammar step by its short title, never by its id.
    const carryoverTopics = framework?.resources?.carryoverReviews?.find((item) => item.lessonNumber === dayNumber)?.grammarTopics ?? [];
    const grammarStepLabels = Object.fromEntries([...(framework?.resources?.grammarTopics ?? []), ...carryoverTopics].flatMap((topic) => topic.steps).map((step) => [step.id, step.focus || step.formula]));
    const editorMeta = { ...meta, grammarStepLabels, ...(findingSource && findingLines.length ? { findings: { title: findingSource.title, lines: findingLines } } : {}), ...(focusFinding ? { focusFinding } : {}) };
    setEditor(saved?.parts?.length ? { frameworkId, dayNumber, initial: { ...saved, ...(savedTitle ? { title: savedTitle } : {}) }, ...editorMeta }
      : candidate?.parts?.length ? { frameworkId, dayNumber, initial: { ...(candidateTitle ? { title: candidateTitle } : {}), parts: candidate.parts.map((part) => ({ ...part, title: part.title || MONTHLY_PART_TITLES[part.code ?? ""] || part.code || "Nội dung" })) }, ...editorMeta }
      : seed ? { frameworkId, dayNumber, initial: { title: seed.title, parts: seed.parts }, ...editorMeta } : { frameworkId, dayNumber, ...editorMeta });
  };
  const editorCefr = editor?.cefr ?? cefr;
  const dayEditor = !readOnly && editor ? <LessonFormEditor weekNumber={0} cefr={editorCefr} initial={editor.initial?.parts?.length ? { dayNumber: editor.dayNumber - 1, title: editor.initial.title || editor.defaultTitle || `Bài ${editor.dayNumber}`, durationMinutes: 10, parts: editor.initial.parts.map((part) => ({ code: (part.code || "instruction") as import("@e4s/contracts").LessonPartCode, title: part.title || part.code || "Nội dung", content: part.content || {} })) } : { ...emptyLesson(editor.dayNumber - 1), ...(editor.defaultTitle ? { title: editor.defaultTitle } : {}) }} vocabularyCount={editor.vocabularyCount ?? 3} kind={editor.kind === "review" ? "review" : "lesson"} monthly grammarStepLabels={editor.grammarStepLabels} findings={editor.findings} focusFinding={editor.focusFinding} onSave={async (lesson) => {
    const label = monthDayLabel(editor.dayNumber);
    const report = await run(() => client.saveContentMonthDay(editor.frameworkId, editor.dayNumber, { title: lesson.title, parts: lesson.parts }));
    if (!report) return;
    setEditor(undefined);
    // The saved draft went through the same quality checks as an AI draft; open it so the Operator sees the result and can approve.
    const severe = report.severe?.length ?? 0;
    toast.show(severe
      ? { message: `Đã lưu bản nháp ${label}, nhưng còn ${severe} lỗi nặng cần sửa trước khi duyệt.`, tone: "danger" }
      : { message: `Đã lưu bản nháp ${label}. Kiểm tra rồi bấm Duyệt bài.`, tone: "ok" });
    if (!preview || preview.frameworkId !== editor.frameworkId || preview.dayNumber !== editor.dayNumber) navigate(`${paths.months}/lesson/${editor.frameworkId}/${editor.dayNumber}?month=${month}`);
  }} headingOverride={`${editor.kind === "review" ? "Soạn bài ôn" : "Soạn bài"} ngày ${editor.date ? `${editor.date.slice(8, 10)}/${editor.date.slice(5, 7)}` : `#${editor.dayNumber}`} · ${editorCefr}`} onCancel={() => setEditor(undefined)} uploadMedia={client.uploadContentMedia} busy={busy} /> : null;
  if (!overview && !error) return <Status>Đang tải khung tháng…</Status>;
  if (preview && overview) {
    const framework = overview.frameworks.find((item) => item.id === preview.frameworkId);
    const lesson = framework?.lessons.find((item) => item.lessonNumber === preview.dayNumber);
    if (!framework || !lesson) return <Status tone="error">Không tìm thấy bài học tháng.</Status>;
    const isDraft = lesson.status !== "approved";
    return <><MonthlyLessonPreview date={lesson.lessonDate} cefr={framework.cefr} lesson={lesson} focusedPart={focusedPart} {...(framework.resources ? { resources: framework.resources } : {})} busy={busy} onClose={() => navigate(paths.months)}
      {...(isDraft && !readOnly ? {
        // A day with only a failed AI candidate (no saved draft) has nothing to approve.
        // Same gate as the API: a saved draft with no severe finding and at most two light ones.
        ...(lesson.content?.parts?.length && lesson.status === "draft" && !lesson.quality.severe.length && lesson.quality.light.length <= 2 ? { onApprove: async () => {
          const title = lesson.kind === "review" ? "Duyệt bài ôn" : "Duyệt bài học";
          const light = lesson.quality.light;
          const message = light.length ? `Bài có ${light.length} cảnh báo nhẹ; duyệt nghĩa là bạn đã kiểm tra và chấp nhận chúng. Bài sẽ được khóa chỉnh sửa sau khi duyệt.` : "Bài sẽ được khóa chỉnh sửa sau khi duyệt.";
          if (!await modal.confirm({ title, message, confirmLabel: "Duyệt bài" })) return;
          const lightKeys = light.map((finding) => `${finding.code}:${finding.dayNumber ?? 0}:${finding.component ?? ""}`);
          const acknowledged = new Set(lesson.quality.acknowledged?.findingCodes ?? []);
          let approved = false;
          await run(async () => {
            if (lightKeys.some((key) => !acknowledged.has(key))) await client.acknowledgeContentMonthQuality(framework.id, lesson.lessonNumber, lightKeys);
            await client.approveContentMonthDay(framework.id, lesson.lessonNumber);
            approved = true;
          }, `Đã duyệt ${monthDayLabel(lesson.lessonNumber)}.`);
          if (approved) navigate(paths.months);
        } } : {}),
        onEdit: (findingKey?: string) => openDayEditor(framework.id, lesson.lessonNumber, undefined, findingKey),
        // VH-R44: no per-day regenerate; generate once, then edit by hand. Hidden until the rule changes.
        ...(SHOW_MONTHLY_DAY_REGENERATE && framework.status === "approved" ? { onRegenerate: async () => {
          if (!await modal.confirm({ title: lesson.kind === "review" ? "Sinh lại bài ôn?" : "Sinh lại bài học?", message: "Bản nháp hiện tại sẽ bị thay.", confirmLabel: "Sinh lại", tone: "danger", countdownSeconds: 0 })) return;
          await run(() => lesson.kind === "review" ? client.generateContentMonthReview(framework.id, lesson.lessonNumber) : client.generateContentMonthDay(framework.id, lesson.lessonNumber), lesson.kind === "review" ? "Đã sinh lại bài ôn." : `Đã sinh lại bài ${lesson.lessonNumber}.`);
        } } : {})
      } : {})}
      {...(!isDraft ? { onRequestReopen: async (reason: string) => {
        const result = await run(() => client.createContentMonthCorrection(framework.id, lesson.lessonNumber, reason), "Đã gửi yêu cầu mở lại tới Manager.");
        if (!result) throw new Error("Không gửi được yêu cầu mở lại.");
      } } : {})} />{dayEditor}</>;
  }
  return <><OperatorMonths
    month={month}
    todayMonth={overview?.monthWindow.current ?? browserMonth}
    overview={overview ?? { systemDate: new Date().toISOString().slice(0, 10), monthWindow: { previous: month, current: month, next: month, writable: false }, brief: null, frameworks: [] }}
    cefr={cefr}
    {...(resourceCheckpoint ? { resourceCheckpoint } : {})}
    busy={busy}
    readOnly={readOnly}
    {...(error ? { error } : {})}
    actions={{
      onSelectMonth: selectMonth,
      onSelectLevel: selectLevel,
      onSuggestBrief: async (selectedMonth) => {
        const result = await run(() => client.suggestContentMonthBrief(selectedMonth), "Đã tạo gợi ý AI cho chủ đề tháng.");
        if (!result) throw new Error("Không tạo được gợi ý AI cho chủ đề tháng.");
        return { title: result.title, brief: result.brief, context: result.context, communicationGoal: result.communicationGoal };
      },
      onSaveBrief: async (selectedMonth, input) => { await run(() => client.saveContentMonthBrief(selectedMonth, input), "Đã lưu chủ đề tháng."); },
      onApproveBrief: async (selectedMonth) => { await run(() => client.approveContentMonthBrief(selectedMonth), "Đã chốt chủ đề tháng."); },
      onSaveFramework: async (selectedMonth, contract) => { await run(() => client.saveContentMonthFramework(selectedMonth, contract), "Đã lưu tài nguyên tháng."); },
      onGenerateFramework: async (selectedMonth, criteria) => {
        setResourceGenerationActive(true);
        setResourceCheckpoint(previous=>previous ? {...previous,progress:null} : previous);
        try {
          const result=await run(()=>client.generateContentMonthResources(selectedMonth,criteria),undefined,true);
          if (!result) throw new Error("Không sinh được tài nguyên tháng.");
          return result;
        } finally {
          if (typeof client.getContentMonthResourceCheckpoint === "function") {
            await client.getContentMonthResourceCheckpoint(selectedMonth,criteria.cefr).then(setResourceCheckpoint).catch(()=>undefined);
          }
          setResourceGenerationActive(false);
        }
      },
      onApproveFramework: async (id) => { await run(() => client.approveContentMonthFramework(id), "Đã chốt tài nguyên tháng."); },
      ...(!readOnly && client.previewContentMonthPublication && client.publishContentMonth ? {
        onPreviewPublication: client.previewContentMonthPublication,
        onPublishMonth: async (id: string, confirmedOn: string) => {
          await run(() => client.publishContentMonth!(id, confirmedOn), "Đã công bố nội dung tháng.", true);
        }
      } : {}),
      ...(!readOnly && client.getManualContentMonthResources && client.createManualContentMonthResources ? {
        onLoadManualResources: client.getManualContentMonthResources,
        onCreateManualResources: async (selectedMonth: string, selectedLevel: CefrLevel, input: import("@e4s/contracts").MonthlyResourceEditInput) => {
          setBusy(true);
          try {
            await client.createManualContentMonthResources!(selectedMonth, selectedLevel, input);
            await load();
            toast.show({ message: "Đã lưu bản nháp tài nguyên tháng.", tone: "ok" });
          } finally { setBusy(false); }
        }
      } : {}),
      // The editor needs the API error (per-row issues), so this does not go through run().
      ...(typeof client.saveContentMonthResources === "function" ? {
        onSaveResources: async (id: string, input: import("@e4s/contracts").MonthlyResourceEditInput) => {
          setBusy(true); setError(undefined);
          try {
            await client.saveContentMonthResources!(id, input);
            await load();
            toast.show({ message: "Đã lưu bản nháp tài nguyên tháng.", tone: "ok" });
          } finally { setBusy(false); }
        }
      } : {}),
      onRequestResourcesReopen: async (id, reason) => {
        const result = await run(() => client.requestContentMonthResourcesReopen(id, reason), "Đã gửi yêu cầu mở lại tài nguyên tới Quản lý.");
        if (!result) throw new Error("Không gửi được yêu cầu mở lại tài nguyên tháng.");
      },
      onGenerateMonthlyFinal: async (id) => {
        const result = await run(() => client.generateMonthlyFinal(id), undefined, true);
        if (!result || !("blueprint" in result)) throw new Error("Không tải được bản nháp đề tháng.");
        return result;
      },
      onComposeMonthlyFinal: async (id) => {
        const result = await run(() => client.composeMonthlyFinal(id), "Đã mở bản nháp soạn tay đề tháng.");
        if (!result || !("blueprint" in result)) throw new Error("Không tải được bản nháp soạn tay đề tháng.");
        return result;
      },
      ...(client.getMonthlyIllustrations ? { onLoadIllustrations: (id: string) => client.getMonthlyIllustrations!(id) } : {}),
      ...(client.generateMonthlyIllustrations ? { onGenerateIllustrations: (id: string, input: { words?: string[]; hint?: string }) => client.generateMonthlyIllustrations!(id, input) } : {}),
      ...(client.setMonthlyIllustration ? { onUploadIllustration: async (id: string, word: string, file: File) => {
        const uploaded = await client.uploadContentMedia("image", file, file.name);
        return client.setMonthlyIllustration!(id, { word, artifactKey: uploaded.artifactKey });
      } } : {}),
      ...(client.removeMonthlyIllustration ? { onRemoveIllustration: (id: string, word: string) => client.removeMonthlyIllustration!(id, { word }) } : {}),
      onPeekMonthlyFinal: async (id) => { try { const draft = await client.getMonthlyFinal(id); return Boolean(draft && "blueprint" in draft); } catch { return false; } },
      onOpenMonthlyFinal: async (id) => {
        // Read-only: no shared busy state or overview reload (that made every calendar AI button flash).
        const result = await client.getMonthlyFinal(id);
        if (!result || !("blueprint" in result)) throw new Error("Không tải được đề thi tháng.");
        return result;
      },
      onSaveMonthlyFinal: async (versionId, input) => {
        const result = await run(() => client.updateMonthlyFinal(versionId, input));
        if (!result) throw new Error("Không lưu được bản nháp đề tháng.");
        return result;
      },
      onPublishMonthlyFinal: async (versionId) => {
        const result = await run(() => client.publishMonthlyFinal(versionId), "Đã duyệt và phát hành đề tháng.");
        if (!result) throw new Error("Không phát hành được đề tháng.");
      },
      onSynthesizeMonthlyFinalAudio: (input) => client.synthesizeAssessmentEdgeTts(input),
      onUploadMonthlyFinalAudio: async (file, filename) => {
        const uploaded = await client.uploadContentMedia("audio", file, filename);
        return { url: uploaded.url };
      },
      onComposeDay: openDayEditor,
      onViewDay: (frameworkId, dayNumber) => navigate(`${paths.months}/lesson/${frameworkId}/${dayNumber}?month=${month}`),
      onSaveDay: async (id, dayNumber, lesson) => {
        const result = await run(() => client.saveContentMonthDay(id, dayNumber, lesson), `Đã lưu bản nháp ${monthDayLabel(dayNumber)}.`);
        if (!result) throw new Error("Không lưu được bản nháp tháng.");
        return result;
      },
      onGenerateDay: async (id, dayNumber) => {
        // A quality failure stores the failing candidate for the day view: reload so "Lỗi" appears.
        const result = await run(() => client.generateContentMonthDay(id, dayNumber), undefined, true).catch(async (reason: unknown) => { await load(); throw reason; });
        if (!result) throw new Error("AI không sinh được bài ngày đạt chuẩn.");
        return result;
      },
      onGenerateReview: async (id, dayNumber) => {
        const result = await run(() => client.generateContentMonthReview(id, dayNumber), undefined, true).catch(async (reason: unknown) => { await load(); throw reason; });
        if (!result) throw new Error("AI không sinh được bài ôn đạt chuẩn.");
        return result;
      },
      onAcknowledge: async (id, dayNumber, findingKeys) => { await run(() => client.acknowledgeContentMonthQuality(id, dayNumber, findingKeys)); },
      onApproveDay: async (id, dayNumber) => { await run(() => client.approveContentMonthDay(id, dayNumber), `Đã duyệt ${monthDayLabel(dayNumber)}.`); },
      onCreateCorrection: async (id, dayNumber, reason) => {
        const result = await run(() => client.createContentMonthCorrection(id, dayNumber, reason));
        if (!result) throw new Error("Không tạo được revision hiệu chỉnh.");
        return result.id;
      },
      onSaveCorrection: async (id, dayNumber, correctionId, lesson) => {
        const result = await run(() => client.saveContentMonthCorrection(id, dayNumber, correctionId, lesson));
        if (!result) throw new Error("Không lưu được revision hiệu chỉnh.");
        return result;
      },
      onAcknowledgeCorrection: async (correctionId, findingKeys) => { await run(() => client.acknowledgeContentMonthCorrection(correctionId, findingKeys)); },
      onApproveCorrection: async (correctionId) => { await run(() => client.approveContentMonthCorrection(correctionId)); }
    }}
  />{dayEditor}</>;
}

function DashboardRoute({ client, readOnly }: { client: OperatorApiClient; readOnly: boolean }) {
  const modal = useModal();
  const navigate = useNavigate();
  const paths = useOperatorRoutePaths();
  const [data, setData] = useState<AssessmentReviewOverviewView>();
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
  if (error) return <Status tone="error">Không tải được duyệt trình độ: {error}</Status>;
  if (!data) return <Status>Đang tải duyệt trình độ…</Status>;
  const adaptedView = adaptAssessmentOverview(data, {
    aiConnected: capabilities?.ai ?? false,
    ...(capabilities?.aiConfigured === undefined ? {} : { aiConfigured: capabilities.aiConfigured }),
    ...(capabilities?.aiProvider === undefined ? {} : { aiProvider: capabilities.aiProvider }),
    openAppeals: data.openAppeals ?? 0,
    rescoreBusy,
    placementDetails: Object.fromEntries(Object.entries(pendingAssessmentDetails).map(([attemptId, detail]) => [attemptId, placementDetail(detail, pendingProfiles[attemptId] ?? undefined)]))
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
    ...(typeof client.setAssessmentReviewLevelUpOverride !== "function" ? { levelUpOverride: unavailable("endpoint cho phép thi lên mức") } : {}),
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
    const evidence = await modal.prompt({ title: "Bằng chứng thay đổi mức", label: "Bằng chứng / ghi chú", confirmLabel: "Xác nhận" });
    if (evidence === null) return;
    refresh(client.changeAssessmentReviewLearnerLevel(learnerId, { mode, targetLevel, reason, evidence: evidence.trim() || "Người vận hành đã xem xét" }));
  };
  const toggleLevelUpOverride = async (learnerId: string, allowed: boolean) => {
    if (readOnly || typeof client.setAssessmentReviewLevelUpOverride !== "function") return;
    if (allowed) {
      const reason = (await modal.prompt({ title: "Cho phép thi lên mức", message: "Học viên được vào bài thi lên mức tiếp theo ngay, không cần đủ tín hiệu sẵn sàng.", label: "Lý do", confirmLabel: "Cho phép" }))?.trim();
      if (!reason) return;
      refresh(client.setAssessmentReviewLevelUpOverride(learnerId, { allowed: true, reason }));
      return;
    }
    if (!await modal.confirm({ title: "Huỷ cho phép thi lên mức?", message: "Học viên sẽ không vào được bài thi lên mức nữa.", confirmLabel: "Huỷ mở thi", tone: "danger", countdownSeconds: 0 })) return;
    refresh(client.setAssessmentReviewLevelUpOverride(learnerId, { allowed: false, reason: "" }));
  };
  const editGoal = async (learnerId: string) => {
    if (readOnly) return;
    const goal = (await modal.prompt({ title: "Cập nhật mục tiêu tháng", label: "Mục tiêu tháng mới", confirmLabel: "Lưu" }))?.trim();
    if (goal) refresh(client.updateAssessmentReviewMonthlyGoal(learnerId, goal));
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
  const rescore = async (attemptId: string) => {
    if (readOnly || typeof client.rescoreAssessment !== "function") return;
    if (!await modal.confirm({ title: "Chấm lại bằng AI?", message: "AI sẽ chấm lại phần Viết và các tiêu chí phần Nói có đủ bằng chứng.", confirmLabel: "Chấm lại", tone: "danger", countdownSeconds: 0 })) return;
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
      const pendingAssessment = data.pendingAssessments.find(item => item.attemptId === id);
      if (pendingAssessment?.kind === "final") {
        void modal.prompt({ title: "Duyệt bài thi tháng", message: "Quyết định này sẽ đồng thời xử lý kháng nghị đang chờ của học viên.", label: "Lý do", confirmLabel: "Duyệt bài thi" })
          .then(reason => { if (reason?.trim()) refresh(client.decideAssessment(id, { status: "approved", reason: reason.trim() })); });
        return;
      }
      if (pendingAssessment?.kind === "pass-course") {
        void modal.prompt({ title: "Cấp chứng chỉ Pass Course", message: "Mốc đề xuất là 85/100. Nếu quyết định khác đề xuất, hãy ghi rõ lý do. Học viên tiếp tục sử dụng tài khoản và có thể tải chứng chỉ sau khi duyệt.", label: "Lý do cấp chứng chỉ", confirmLabel: "Cấp chứng chỉ" })
          .then(reason => { if (reason?.trim()) refresh(client.decideAssessment(id, { status: "approved", reason: reason.trim() })); });
        return;
      }
      if (!cefr) return;
      void modal.prompt({ title: "Duyệt mức đầu vào", message: `Mức được duyệt: ${cefr}. Hãy ghi rõ lý do để lưu quyết định.`, label: "Lý do", confirmLabel: "Duyệt mức" })
        .then(reason => {
          // null = Huỷ / Esc / backdrop: just close, no error toast.
          if (reason === null) return;
          const trimmed = reason.trim();
          if (!trimmed) {
            notify("Lý do duyệt mức là bắt buộc; quyết định chưa được lưu.", "danger");
            return;
          }
          refresh(client.decideAssessment(id, { status: "approved", approvedLevel: cefr, reason: trimmed }));
        });
    },
    onApproveLevelRequest: async id => {
      const target = targetFor(id);
      if (readOnly || !target || typeof client.decideAssessment !== "function") return;
      if (!await modal.confirm({ title: "Duyệt lên mức?", message: `Trình độ mới của học viên sẽ là ${target}.`, confirmLabel: "Duyệt lên mức" })) return;
      refresh(client.decideAssessment(id, { status: "approved", approvedLevel: target, reason: "Duyệt yêu cầu lên mức" }));
    },
    onRejectLevelRequest: id => { if (readOnly || typeof client.decideAssessment !== "function") return; void modal.prompt({ title: "Từ chối yêu cầu lên mức", message: "Học viên sẽ nhìn thấy nội dung này.", label: "Lý do từ chối", confirmLabel: "Từ chối", tone: "danger" }).then(reason => { if (reason?.trim()) refresh(client.decideAssessment(id, { status: "needs_retry", reason: reason.trim() })); }); },
    onViewTest: showAttempt, onRescore: rescore, onDeleteLearner: id => requestDeletion(learnerIdFor(id)), onViewChallenge: showChallenge,
    onDemote: id => changeLevel(id, "recommend_lower"), onChangeLevel: id => changeLevel(id, "direct"), onEditGoal: editGoal, onToggleLevelUpOverride: (id, allowed) => { void toggleLevelUpOverride(id, allowed); }, onViewProfile: showProfile, onTogglePendingProfile: togglePendingProfile, onSetLevelDirect: id => changeLevel(id, "direct"),
    onOpenAppeals: () => readOnly ? navigate(paths.review, { state: { reviewTab: "appeals" } }) : navigate(`${paths.review}?tab=appeals`), onOpenSettings: () => navigate("/settings"), onOpenWeeks: () => navigate(paths.months), onOpenLevelForms: () => navigate(paths.levelForms)
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
    ["Lịch học", [profile.durationMinutes ? `${profile.durationMinutes} phút/buổi` : "", "5 ngày/tuần (T2–T6)", operatorProfileLabel("device", profile.device)].filter(Boolean).join(" · ")],
    ["Tự đánh giá", operatorProfileLabel("selfLevel", profile.selfLevel)],
    ["Chứng chỉ", (profile.certificates ?? []).map(formatOperatorCertificate).filter(Boolean).join(", ")],
    ["Đã học", profile.experience ?? ""],
    ["Lo ngại / mong muốn", profile.concerns ?? ""]
  ].filter((row): row is [string, string] => Boolean(row[1]));
  return <>
    <div className="card soft operator-profile-card">{profileRows.length ? <><div className="row between"><b>Hồ sơ cá nhân</b></div><OperatorProfileRows rows={profileRows} labelClassName="xs muted" /></> : <p className="small muted" style={{ margin: 0 }}>Chưa điền hồ sơ cá nhân.</p>}</div>
    <div className="grid cols-2"><div className="card soft"><h4>Tài khoản</h4><p className="small"><b>Trạng thái:</b> {detail.learner.status}</p><p className="small"><b>Email:</b> {detail.learner.email ?? "—"}</p><p className="small"><b>Mức hiện tại:</b> {detail.learner.currentLevel ?? "—"}</p></div><div className="card soft"><h4>Mục tiêu tháng</h4><p className="small">{detail.monthlyGoal ?? "—"}</p></div></div>
    <h4>Lịch sử đổi mức</h4>
    {detail.levelHistory.length ? <div className="list">{detail.levelHistory.map((item, index) => <div className="item small" key={`${item.changedAt}-${index}`}><b>{item.from ?? "—"} → {item.to}</b> · {item.mode} · {item.reason}<div className="xs muted">{item.changedAt} · bằng chứng: {item.evidence || "—"}</div></div>)}</div> : <p className="small muted">Chưa có lịch sử đổi mức.</p>}
    <h4>Bài test</h4>
    {detail.attempts.length ? <div className="list">{detail.attempts.map(item => <div className="item small" key={item.id}><b>{item.title}</b> · {item.kind} · {item.status} · tổng {item.totalScore == null ? "—" : formatScoreOutOf(item.totalScore, 100)}<div className="xs muted">Nộp: {item.submittedAt ?? "—"} · mức gợi ý: {item.suggestedLevel ?? "—"}</div></div>)}</div> : <p className="small muted">Chưa có bài test.</p>}
    {detail.deletionRequests.length > 0 && <><h4>Yêu cầu xoá</h4><div className="list">{detail.deletionRequests.map(item => <div className="item small" key={item.id}><b>{item.status}</b> · {item.reason}<div className="xs muted">Gửi lúc {item.requestedAt}</div></div>)}</div></>}
  </>;
}

function OperatorChallengeEvidence({ detail }: { detail: AssessmentReviewChallengeView }) {
  const progress = detail.progress;
  return <>
    <p className="small muted"><b>Tiến độ thử thách:</b> {progress.completedTurns}/{progress.requiredTurns} lượt · TB {formatScoreOutOf(progress.average, 5)} · {progress.offTopic} lượt lạc đề</p>
    <div className="row"><Badge tone={progress.passed ? "ok" : progress.complete ? "danger" : "warn"}>{progress.passed ? "Đạt" : progress.complete ? "Chưa đạt" : "Đang làm"}</Badge><Badge>Mức đích: {detail.targetLevel}</Badge></div>
    {detail.turns.length ? <div className="chat" style={{ background: "var(--bg)", padding: 12, borderRadius: 12 }}>{detail.turns.map(turn => <div className="item small" key={turn.id}><b>{turn.speaker === "learner" ? "Học viên" : "Coach"} · lượt {turn.turnNumber}</b><p>{turn.text}</p>{turn.coachText && <p className="muted"><b>Nhận xét:</b> {turn.coachText}</p>}{turn.feedback && <code style={{ display: "block", overflowWrap: "anywhere", whiteSpace: "pre-wrap" }}>{JSON.stringify(turn.feedback)}</code>}</div>)}</div> : <p className="small muted">Chưa có lượt hội thoại.</p>}
  </>;
}

type TestResultsTab = "placement" | "monthly" | "promotion" | "exit";
type AssessmentResultKind = "placement" | "level_up" | "final" | "pass_course";

const resultPreviewKind: Record<TestResultsTab, AssessmentResultKind> = {
  placement: "placement",
  monthly: "final",
  promotion: "level_up",
  exit: "pass_course"
};

function assessmentPreviewDefinition(form: AssessmentFormPreviewView): AssessmentDefinitionView & { sections: AssessmentFormPreviewView["sections"] } {
  return {
    key: form.versionId,
    kind: form.kind === "level_up" ? "level-up" : form.kind === "pass_course" ? "pass-course" : form.kind,
    title: form.title,
    version: form.version,
    totalMinutes: form.totalMinutes,
    totalScore: form.totalScore,
    sections: form.sections
  };
}

function AssessmentPreviewControl({
  client,
  kind,
  readOnly
}: {
  client: OperatorApiClient;
  kind: AssessmentResultKind;
  readOnly: boolean;
}) {
  const [forms, setForms] = useState<AssessmentFormPreviewView[]>();
  const [error, setError] = useState<string>();
  const [selected, setSelected] = useState<AssessmentFormPreviewView>();
  const [monthlyFinal, setMonthlyFinal] = useState<MonthlyFinalDraftView>();
  const [openingVersionId, setOpeningVersionId] = useState<string>();
  const [editorError, setEditorError] = useState<string>();
  const [notice, setNotice] = useState<string>();
  useEffect(() => {
    let alive = true;
    setForms(undefined);
    setError(undefined);
    void client.getAssessmentFormPreviews(kind)
      .then(result => { if (alive) setForms(result.forms); })
      .catch(reason => { if (alive) setError(message(reason)); });
    return () => { alive = false; };
  }, [client, kind]);

  const editMonthly = async (form: AssessmentFormPreviewView) => {
    if (readOnly || kind !== "final" || !form.editable || !form.monthlyFrameworkId || openingVersionId) return;
    setOpeningVersionId(form.versionId);
    setEditorError(undefined);
    setNotice(undefined);
    try {
      const draft = await client.getMonthlyFinal(form.monthlyFrameworkId);
      if (draft.versionId !== form.versionId || draft.definitionId !== form.definitionId) {
        await refreshForms();
        setSelected(undefined);
        setEditorError("Phiên bản đề thi tháng đã thay đổi. Hãy mở lại bản nháp mới nhất.");
        return;
      }
      setSelected(undefined);
      setMonthlyFinal(draft);
    } catch {
      setEditorError("Không tải được bản nháp đề thi tháng. Hãy thử lại.");
    } finally {
      setOpeningVersionId(undefined);
    }
  };
  const refreshForms = async () => {
    try { setForms((await client.getAssessmentFormPreviews(kind)).forms); }
    catch { setEditorError("Không tải lại được danh sách đề thi. Hãy mở lại tab để làm mới."); }
  };
  const canEditMonthly = (form: AssessmentFormPreviewView) => !readOnly && kind === "final" && form.editable && Boolean(form.monthlyFrameworkId);

  if (error) return <Status tone="error">Không tải được nội dung đề thi: {error}</Status>;
  if (!forms) return <Status>Đang tải nội dung đề thi…</Status>;
  if (!forms.length) {
    const emptyMessage = kind === "final"
      ? "Chưa có bài thi tháng từ khung tài nguyên đã duyệt. Người vận hành cần sinh đề trong Bài học trước."
      : kind === "level_up"
        ? "Chưa có đề lên mức được sinh theo mức đích và duyệt để xem."
        : kind === "pass_course"
          ? "Chưa có Form A chuẩn đã lưu để xem. Form A chỉ hiển thị khi nội dung cố định đã được nạp đầy đủ."
          : "Chưa có phiên bản đề đã lưu để xem.";
    return <section className="card" aria-label="Chưa có nội dung đề thi"><h2>{kind === "final" ? "Bài thi tháng" : "Chưa có đề"}</h2><p className="small muted">{emptyMessage}</p></section>;
  }
  return <>
    <section className="card operator-assessment-form-list" aria-label="Phiên bản đề thi đã lưu">
      <div className="row between"><div><p className="xs muted">PHIÊN BẢN ĐỀ ĐÃ LƯU</p><h2>{kind === "placement" ? "Đề đầu vào" : kind === "final" ? "Bài thi tháng" : kind === "level_up" ? "Đề lên mức" : "Đề đầu ra"}</h2></div><span className="badge">{forms.length} phiên bản</span></div>
      {notice ? <p role="status" className="small">{notice}</p> : null}
      {editorError && !selected ? <p role="alert" className="small form-error">{editorError}</p> : null}
      <div className="stack">{forms.map(form => <article className="item operator-assessment-form-row" key={form.versionId}>
        <div className="operator-assessment-form-info">
          <b>{form.title}</b>
          <p className="small muted">
            <span>Phiên bản {form.version} · {form.status === "published" ? "Đã phát hành" : form.status === "draft" ? "Bản nháp" : "Đã lưu lịch sử"}</span>
            <span className="operator-form-meta-divider"> · </span>
            <span className="operator-form-metrics"><span>{form.sections.length} kỹ năng</span> · <span>{form.totalMinutes} phút</span> · <span>{formatScore(form.totalScore)} điểm</span></span>
          </p>
          <p className="xs muted">Âm thanh: {form.audioConfigured ? "đã cấu hình nguồn audio" : "chưa đủ nguồn audio"}</p>
        </div>
        <div className="row"><button className="btn-sm" type="button" aria-label={`Xem ${form.title}`} disabled={Boolean(openingVersionId)} onClick={() => { setEditorError(undefined); setSelected(form); }}>Xem</button>{canEditMonthly(form) ? <button className="btn-sm btn-primary" type="button" disabled={Boolean(openingVersionId)} onClick={() => void editMonthly(form)}>{openingVersionId === form.versionId ? "Đang mở…" : "Sửa đề"}</button> : null}</div>
      </article>)}</div>
    </section>
    {selected ? <AssessmentPreviewDialog
      form={selected}
      readOnly={!canEditMonthly(selected)}
      busy={openingVersionId === selected.versionId}
      onClose={() => { if (!openingVersionId) setSelected(undefined); }}
      {...(canEditMonthly(selected) ? { onEdit: () => void editMonthly(selected) } : {})}
    >{editorError ? <p role="alert" className="small form-error">{editorError}</p> : null}</AssessmentPreviewDialog> : null}
    {monthlyFinal ? <MonthlyFinalReview
      draft={monthlyFinal}
      readOnly={readOnly}
      onClose={() => setMonthlyFinal(undefined)}
      onSave={async input => {
        const saved = await client.updateMonthlyFinal(monthlyFinal.versionId, input);
        if (saved.versionId !== monthlyFinal.versionId) throw new Error("Phiên bản đề thi tháng đã thay đổi.");
        setMonthlyFinal(saved);
        setNotice("Đã lưu bản nháp đề tháng.");
        await refreshForms();
      }}
      onPublish={async () => {
        await client.publishMonthlyFinal(monthlyFinal.versionId);
        await refreshForms();
        setMonthlyFinal(undefined);
        setNotice("Đã duyệt và phát hành đề tháng.");
      }}
      synthesize={input => client.synthesizeAssessmentEdgeTts(input)}
      uploadAudio={(file, filename) => client.uploadContentMedia("audio", file, filename)}
    /> : null}
  </>;
}

function AssessmentPreviewDialog({
  form,
  readOnly,
  onClose,
  onEdit,
  busy = false,
  children
}: {
  form: AssessmentFormPreviewView;
  readOnly: boolean;
  onClose: () => void;
  onEdit?: () => void;
  busy?: boolean;
  children?: ReactNode;
}) {
  const dialogRef = useRef<HTMLElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const scroll = useScrollJump(true);
  useDialog(true, dialogRef, onClose, closeRef);
  return <div className="modal-backdrop operator-modal-scope operator-detail-modal" role="presentation" onClick={event => { if (event.target === event.currentTarget) onClose(); }}><section ref={dialogRef} className="dialog wide operator-detail-dialog operator-assessment-preview-dialog operator-level-view-dialog" role="dialog" aria-modal="true" aria-label={`Xem đề ${form.title}`} tabIndex={-1}>
    <div className="operator-level-form-dialog-header"><div className="operator-level-form-dialog-title"><span className="operator-level-kicker">Xem đề thi</span><h3>{form.title}</h3><p className="small muted">Phiên bản {form.version} · {form.status === "published" ? "Đã phát hành" : form.status === "draft" ? "Bản nháp" : "Đã lưu lịch sử"}</p></div><div className="row operator-level-form-dialog-actions">{!readOnly && form.editable && onEdit ? <button className="btn-sm btn-primary" type="button" disabled={busy} onClick={onEdit}>{busy ? "Đang mở…" : "Sửa đề"}</button> : null}<button ref={closeRef} className="btn-sm" type="button" disabled={busy} onClick={onClose}>Đóng</button></div></div>
    <div className="operator-level-form-dialog-body">
      <div ref={scroll.start} className="app-scroll-edge" aria-hidden="true" />
      {children}
      <AssessmentDefinitionPreview definition={assessmentPreviewDefinition(form)} status={form.status} audioConfigured={form.audioConfigured} readOnly={readOnly} />
      <div ref={scroll.end} className="app-scroll-edge" aria-hidden="true" />
      {scroll.visible && <ScrollJumpButton atTop={scroll.atTop} onClick={scroll.jump} inExam />}
    </div>
  </section></div>;
}

function TestsRoute({ client, readOnly, initialTab }: { client: OperatorApiClient; readOnly: boolean; initialTab: "placement" | "promotion" }) {
  const location = useLocation();
  const navigate = useNavigate();
  const requestedTab = new URLSearchParams(location.search).get("tab");
  const activeTab = requestedTab === "placement" || requestedTab === "monthly" || requestedTab === "promotion" || requestedTab === "exit" ? requestedTab : initialTab;
  const setActiveTab = (tab: TestResultsTab) => navigate(`?tab=${tab}`, { replace: true, preventScrollReset: true });
  const kinds: Record<TestResultsTab, AssessmentResultKind[]> = {
    placement: ["placement"], monthly: ["final"], promotion: ["level_up"], exit: ["pass_course"]
  };
  return <OperatorPage title="Kết quả bài thi">
    <PageTitle><h1>Kết quả bài thi</h1><p className="muted">Xem đề và kết quả đầu vào, bài thi tháng, đề lên mức và đề đầu ra.</p></PageTitle>
    <div className="tabs operator-review-tabs" role="tablist" aria-label="Loại bài kiểm tra">
      <button type="button" role="tab" aria-selected={activeTab === "placement"} className={activeTab === "placement" ? "active" : ""} onClick={() => setActiveTab("placement")}>Đề đầu vào</button>
      <button type="button" role="tab" aria-selected={activeTab === "monthly"} className={activeTab === "monthly" ? "active" : ""} onClick={() => setActiveTab("monthly")}>Bài thi tháng</button>
      <button type="button" role="tab" aria-selected={activeTab === "promotion"} className={activeTab === "promotion" ? "active" : ""} onClick={() => setActiveTab("promotion")}>Đề lên mức</button>
      <button type="button" role="tab" aria-selected={activeTab === "exit"} className={activeTab === "exit" ? "active" : ""} onClick={() => setActiveTab("exit")}>Đề đầu ra</button>
    </div>
    {activeTab === "promotion" ? <LevelFormsRoute client={client} readOnly={readOnly} embedded /> : <AssessmentPreviewControl key={activeTab} client={client} kind={resultPreviewKind[activeTab]} readOnly={readOnly} />}
    <ReviewRoute client={client} readOnly={readOnly} canEditWeeklyPractice={false} assessmentOnly embedded assessmentKinds={kinds[activeTab]} />
  </OperatorPage>;
}

function promotionPreview(detail: AssessmentLevelFormDetailView): AssessmentFormPreviewView {
  const listening = detail.sections.filter(section => section.code === "listening").flatMap(section => section.groups);
  return {
    ...detail,
    kind: "level_up",
    editable: detail.status === "draft",
    totalMinutes: detail.sections.reduce((total, section) => total + section.durationMinutes, 0),
    totalScore: detail.sections.reduce((total, section) => total + section.maxScore, 0),
    audioConfigured: listening.length > 0 && listening.every(group => group.stimulus?.type === "audio_script" && Boolean(group.stimulus.audioSrc?.trim()))
  };
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
    onCreateManual: target => {
      if (readOnly) return;
      setGenerating(target);
      void client.createManualAssessmentLevelForm(target as Exclude<CefrLevel, "A1">)
        .then(form => client.getAssessmentLevelForm(form.versionId))
        .then(detail => { setDialog({ detail, editing: true }); return load(); })
        .catch(reason => setError(message(reason)))
        .finally(() => setGenerating(null));
    },
    onView: id => show(id), onEdit: (id, fromPublished) => {
      if (readOnly) return;
      if (fromPublished) void client.copyAssessmentLevelFormToDraft(id).then(detail => { setDialog({ detail, editing: true }); void load(); }).catch(reason => setError(message(reason)));
      else show(id, true);
    },
    onDelete: id => { if (readOnly || typeof client.deleteAssessmentLevelForm !== "function") return; void modal.confirm({ title: "Xoá bản nháp đề thi?", message: "Bản nháp này sẽ bị xoá khỏi danh sách đề lên mức.", confirmLabel: "Xoá bản nháp", tone: "danger" }).then(confirmed => { if (confirmed) refresh(client.deleteAssessmentLevelForm(id)); }); }
  }} />
    {dialog && !dialog.editing ? <AssessmentPreviewDialog
      form={promotionPreview(dialog.detail)}
      readOnly={readOnly || dialog.detail.status !== "draft"}
      onClose={() => setDialog(undefined)}
      onEdit={() => setDialog({ ...dialog, editing: true })}
    /> : null}
    {dialog?.editing ? <OperatorLevelFormDetail
      detail={dialog.detail}
      editing={!readOnly && dialog.detail.status === "draft"}
      readOnly={readOnly || dialog.detail.status !== "draft"}
      publicationReady={dialog.detail.publicationReady === true}
      synthesizeEdgeTts={input => client.synthesizeAssessmentEdgeTts(input)}
      uploadAudio={(file, filename) => client.uploadContentMedia("audio", file, filename)}
      onClose={() => setDialog(undefined)}
      onConfirmDiscard={() => modal.confirm({ title: "Bỏ thay đổi chưa lưu?", message: "Thay đổi trong bản nháp này sẽ mất khi đóng.", confirmLabel: "Bỏ thay đổi", cancelLabel: "Sửa tiếp" })}
      onSave={async input => {
        const updated = await client.updateAssessmentLevelForm(dialog.detail.versionId, input);
        setDialog({ detail: updated, editing: true });
        await load();
      }}
      onPublish={async (confirmation) => {
        const confirmed = await modal.confirm({ title: "Duyệt và phát hành đề lên mức?", message: "Phiên bản này sẽ dùng cho các lượt thi lên mức mới.", confirmLabel: "Duyệt & phát hành", cancelLabel: "Quay lại" });
        if (!confirmed) return;
        await client.publishAssessmentLevelForm(dialog.detail.versionId, confirmation);
        setDialog(undefined);
        await load();
      }}
    /> : null}
  </>;
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
    tone: "danger",
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

const reviewSections = [
  { key: "coach", title: "Phản hồi Season", label: "Phản hồi Season", compactLabel: "Season", description: "Kiểm tra phản hồi của Season." },
  { key: "appeals", title: "Kháng nghị", label: "Kháng nghị học viên", compactLabel: "Kháng nghị", description: "Xem và xử lý kháng nghị của học viên." },
  { key: "sent", title: "Yêu cầu", label: "Yêu cầu đã gửi", compactLabel: "Yêu cầu", description: "Theo dõi yêu cầu gửi Quản lý." },
  { key: "attempts", title: "Cảnh báo bài tập", label: "Cảnh báo bài tập", compactLabel: "Cảnh báo", description: "Theo dõi các lượt làm cần kiểm tra." }
] as const;

function OperatorReviewWorkspace({ client }: { client: OperatorApiClient }) {
  const location = useLocation();
  const requested = new URLSearchParams(location.search).get("tab") ?? (location.state as { reviewTab?: ReviewTab } | null)?.reviewTab;
  const current = reviewSections.find(section => section.key === requested) ?? reviewSections[0];
  return <OperatorPage title="Phản hồi & yêu cầu">
    <PageTitle><h1>{current.title}</h1><p className="muted section-tab-description">{current.description}</p></PageTitle>
    <div className="operator-review-navigation">
      <nav className="request-tabs" aria-label="Phản hồi & yêu cầu">
        {reviewSections.map(section => <Link to={`?tab=${section.key}`} aria-label={section.label} data-compact-label={section.compactLabel} aria-current={section.key === current.key ? "page" : undefined} key={section.key}><span>{section.label}</span></Link>)}
      </nav>
    </div>
    {current.key === "appeals" || current.key === "sent"
      ? <OperatorRequests client={client} />
      : <ReviewRoute client={client} readOnly={false} canEditWeeklyPractice embedded />}
  </OperatorPage>;
}

function ReviewRoute({ client, readOnly, canEditWeeklyPractice, assessmentOnly = false, embedded = false, assessmentKinds }: { client: OperatorApiClient; readOnly: boolean; canEditWeeklyPractice: boolean; assessmentOnly?: boolean; embedded?: boolean; assessmentKinds?: readonly AssessmentResultKind[] }) {
  const navigate = useNavigate();
  const modal = useModal();
  const toast = useToast();
  const paths = useOperatorRoutePaths();
  const location = useLocation();
  const requestedTab = new URLSearchParams(location.search).get("tab") ?? (location.state as { reviewTab?: ReviewTab } | null)?.reviewTab;
  const initialTab: ReviewTab = assessmentOnly ? "tests" : requestedTab === "coach" || requestedTab === "appeals" || requestedTab === "attempts" ? requestedTab : "coach";
  const [tab, setTab] = useState<ReviewTab>(initialTab);
  useEffect(() => { setTab(initialTab); }, [initialTab]);
  const [data, setData] = useState<ContentReviewView>();
  const [error, setError] = useState<string>();
  const [dialog, setDialog] = useState<ContentReviewAssessmentDetailView>();
  const [gradingAction, setGradingAction] = useState<"manual" | "ai">();
  const capabilities = useCapabilities(client);
  const load = async () => {
    try {
      const next = await client.getContentReview();
      if (typeof client.listAssessmentAudio !== "function") {
        setData(next);
        return;
      }
      // The file routes are only registered when object storage is configured;
      // without it the list endpoint 404s. Skip it so the review keeps its
      // neutral "no audio" rendering instead of firing a failing request.
      const systemCapabilities = typeof client.getSystemCapabilities === "function" ? await client.getSystemCapabilities().catch(() => null) : null;
      if (systemCapabilities?.objectStorage === false) {
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
  const attemptFromNotification = assessmentOnly ? new URLSearchParams(location.search).get("attemptId") : null;
  useEffect(() => {
    if (!assessmentOnly) return;
    setDialog(undefined);
    if (!attemptFromNotification || typeof client.getContentReviewAssessment !== "function") return;
    let active = true;
    void client.getContentReviewAssessment(attemptFromNotification).then(detail => {
      if (active) setDialog(detail);
    }).catch(() => {
      if (active) toast.show({ message: "Không mở được bài thi từ thông báo.", tone: "danger" });
    });
    return () => { active = false; };
  }, [assessmentOnly, attemptFromNotification, client, location.key]);
  if (error) return <Status tone="error">Không tải được dữ liệu đọc mẫu: {error}</Status>;
  if (!data) return <Status>Đang tải dữ liệu đọc mẫu…</Status>;
  const refresh = (promise: Promise<unknown>) => void promise.then(load).catch(reason => setError(message(reason)));
  const missing = {
    ...(typeof client.gradeReviewedSubmissionAi !== "function" ? { gradeAi: unavailable("endpoint chấm bài review bằng AI") } : {}),
    ...(typeof client.getContentReviewAssessment !== "function" ? { viewTest: unavailable("endpoint xem chi tiết bài test") } : {})
  };
  const confirmRegrade = (id: string) => data.submissions.some(item => item.id === id && item.total !== null)
    ? modal.confirm({ title: "Thay kết quả chấm hiện tại?", message: "Điểm và nhận xét mới sẽ thay kết quả đã lưu của bài này.", confirmLabel: "Thay kết quả", tone: "danger", countdownSeconds: 0 })
    : Promise.resolve(true);
  const gradeAi = async (id: string) => {
    if (readOnly || typeof client.gradeReviewedSubmissionAi !== "function" || !await confirmRegrade(id)) return;
    await client.gradeReviewedSubmissionAi(id);
    await load();
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
  const updateExamGrade = async (action: "manual" | "ai", attemptId: string, update: () => Promise<unknown>) => {
    setGradingAction(action);
    try {
      await update();
      const updated = await client.getContentReviewAssessment(attemptId);
      setDialog(current => current?.attemptId === attemptId ? updated : current);
      toast.show({ message: action === "manual" ? "Đã lưu điểm chấm tay." : "Đã cập nhật kết quả chấm AI.", tone: "ok" });
      await load();
    } catch (reason) {
      const label = reason instanceof Error ? reason.message : "";
      toast.show({ message: label === "AI_UNAVAILABLE" ? "AI hiện không khả dụng. Bạn vẫn có thể chấm tay."
        : action === "manual" ? "Chưa lưu được điểm. Hãy kiểm tra tiêu chí và bằng chứng của bài."
          : "AI chưa chấm lại được. Bạn có thể thử lại hoặc chấm tay.", tone: "danger" });
    } finally {
      setGradingAction(undefined);
    }
  };
  const canGrade = !readOnly && dialog && (dialog.status === "pending_review" || dialog.status === "submitted");
  const guardedManualGrade: OperatorReviewActions["onGradeManual"] = async (id, input) => {
    if (!readOnly && await confirmRegrade(id)) refresh(client.gradeReviewedSubmission(id, input));
  };
  const adaptedReview = adaptReview(data, reviewToApi[tab], { aiConnected: capabilities?.ai ?? false });
  const scopedReview = assessmentOnly && assessmentKinds ? { ...adaptedReview, tests: adaptedReview.tests.filter(item => assessmentKinds.includes(item.kind as AssessmentResultKind)) } : adaptedReview;
  return <><OperatorReview readOnly={readOnly} embedded={embedded} mode={assessmentOnly ? "assessment" : "weekly"} unavailable={missing} view={scopedReview} actions={{
    onTabChange: next => { if (next === "appeals" && !readOnly) navigate(`${paths.review}?tab=appeals`); else setTab(next); }, onMarkSubmission: (id, checked) => { if (!readOnly) refresh(client.setContentReviewChecked("submission", id, checked)); }, onMarkCoachTurn: (id, checked) => { if (!readOnly) refresh(client.setContentReviewChecked("coach", id, checked)); }, onGradeAi: gradeAi, onGradeManual: guardedManualGrade, onDecideAppeal: () => undefined, onViewTest: viewTest, ...(typeof client.confirmAssessmentAudioDeletion === "function" && typeof client.deleteAssessmentAudio === "function" && !readOnly ? { onDeleteAudio: deleteReviewedAudio } : {}),
    onOpenExercise: warning => navigate(`${paths.months}/lesson/${warning.frameworkId}/${warning.dayNumber}?month=${warning.month}&part=${warning.partCode}`),
    ...(!readOnly && client.correctExerciseWarning ? {
      onCorrectExerciseWarning: async warning => {
        const correction = await promptExerciseCorrection(modal, warning);
        if (correction) refresh(client.correctExerciseWarning!(warning.id, warning.exerciseVersionId, correction));
      }
    } : {}),
    ...(!readOnly && client.dismissExerciseWarning ? { onDismissExerciseWarning: async id => {
      if (!await modal.confirm({ title: "Xác nhận bài tập không lỗi?", message: "Cảnh báo này sẽ được đánh dấu đã xử lý.", confirmLabel: "Xác nhận" })) return;
      refresh(client.dismissExerciseWarning!(id));
    } } : {}),
    ...(canEditWeeklyPractice ? { onSaveWeeklyPractice: async input => {
      if (readOnly) return;
      await client.saveContentWeeklyPractice(input.week, input.cefr, { expectedVersion: input.expectedVersion, task: input.task, guidance: input.guidance, requiredVocabulary: input.requiredVocabulary });
      const next = await client.getContentReview();
      setData(next);
    } } : {})
  }} />{dialog && <OperatorReviewAssessmentDetail
    detail={dialog}
    onClose={() => setDialog(undefined)}
    {...(canGrade && client.manualScoreAssessment ? { onSaveManualScore: (input: ManualScoreInput) => void updateExamGrade("manual", dialog.attemptId, () => client.manualScoreAssessment!(dialog.attemptId, input)) } : {})}
    {...(canGrade && capabilities?.ai && typeof client.rescoreAssessment === "function" ? { onRescore: () => void updateExamGrade("ai", dialog.attemptId, () => client.rescoreAssessment(dialog.attemptId, crypto.randomUUID())) } : {})}
    savingManualScore={gradingAction === "manual"}
    rescoring={gradingAction === "ai"}
    {...(typeof client.confirmAssessmentAudioDeletion === "function" && typeof client.deleteAssessmentAudio === "function" && !readOnly ? { onDeleteAudio: deleteReviewedAudio } : {})}
  />}</>;
}

function PromptsRoute({ client, readOnly }: { client: OperatorApiClient; readOnly: boolean }) {
  const modal = useModal();
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
    onPublish: async (key, version) => {
      if (readOnly || !await modal.confirm({ title: "Phát hành hướng dẫn AI?", message: "Phiên bản này sẽ được dùng cho các lượt AI tiếp theo.", confirmLabel: "Phát hành" })) return;
      setSaving(true); void client.publishContentPrompt(promptToApi[key], version).then(group => setData(current => current ? { groups: current.groups.map(item => item.key === group.key ? group : item) } : current)).catch(reason => setError(message(reason))).finally(() => setSaving(false)); }
  }} />;
}

const operatorErrorMessages: Record<string, string> = {
  MONTHLY_DAY_DRAFT_NOT_FOUND: "Không tìm thấy bản nháp. Hãy tải lại lịch tháng.",
  MONTHLY_DAY_QUALITY_BLOCKED: "Bài chưa thể duyệt. Hãy mở bản nháp và sửa các mục chất lượng trước khi duyệt lại.",
  MONTHLY_DAY_QUALITY_ACK_REQUIRED: "Hãy kiểm tra và xác nhận từng cảnh báo trước khi duyệt.",
  NETWORK_UNAVAILABLE: "Không thể kết nối tới E4S. Kiểm tra mạng rồi thử lại.",
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
  CONTENT_LEVEL_NOT_ACTIVE: "Mức này đang không bật trong ma trận bài học.",
  MONTHLY_FINAL_EXAM_DATE_LOCKED: "Đã quá 00:00 ngày thi: đề thi tháng bị khóa, không sinh, sửa hay duyệt được nữa.",
  MONTHLY_FINAL_FRAMEWORK_NOT_APPROVED: "Hãy duyệt khung tháng trước khi sinh đề thi.",
  MONTHLY_FINAL_ALREADY_PUBLISHED: "Đề thi tháng đã phát hành; không sinh lại được.",
  MONTHLY_FINAL_NOT_FOUND: "Chưa có đề thi tháng cho trình độ này.",
  MONTHLY_FINAL_NOT_READY: "Đề chưa ở trạng thái READY nên chưa duyệt được.",
  MONTHLY_FINAL_AUDIO_NOT_REVIEWED: "Audio còn SCRIPT_ONLY: hãy nghe soát và tick trước khi phát hành.",
  MONTHLY_FINAL_SCOPE_STALE: "Khung tháng đã thay đổi sau khi sinh đề; hãy sinh lại đề.",
  MONTHLY_FINAL_STRUCTURE_LOCKED: "Không được thêm/bớt câu: cấu trúc đề v2.0 cố định theo khung.",
  MONTHLY_FINAL_GRAMMAR_COMPONENT_INVALID: "Thành phần chính/phụ phải là 2 bước khác nhau đã dạy của chủ điểm.",
  MONTHLY_FINAL_GRAMMAR_COMPONENT_LOCKED: "Tháng theo lộ trình ngữ pháp: thành phần chính là bước 1, thành phần phụ là bước 2 của mỗi chủ điểm; chỉ sửa nhãn và mẫu chấp nhận.",
  MONTHLY_FINAL_REGENERATE_REQUIRED: "Bản nháp cũ chưa theo cấu trúc v2.0; hãy sinh lại đề.",
  MONTHLY_FINAL_GENERATION_FAILED: "AI chưa sinh được đề thi tháng. Hãy thử lại."
};

function message(reason: unknown) {
  const raw = reason instanceof Error ? reason.message : String(reason);
  const label = operatorErrorMessages[raw] ?? raw;
  const details = reason && typeof reason === "object" && "details" in reason ? (reason as { details?: unknown }).details : undefined;
  const issues = details && typeof details === "object" && "issues" in details ? (details as { issues?: unknown }).issues : undefined;
  const missing = details && typeof details === "object" && "missing" in details ? (details as { missing?: unknown }).missing : undefined;
  if (raw === "MONTHLY_FINAL_INPUT_ERROR" && Array.isArray(missing)) return `INPUT_ERROR: khung tháng thiếu ${missing.map(String).join(", ")}.`;
  if (raw === "MONTHLY_FINAL_NOT_READY" && Array.isArray(issues)) return `Đề chưa READY. Còn: ${issues.map(String).join(", ")}.`;
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

