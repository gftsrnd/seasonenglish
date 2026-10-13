import { useEffect, useRef, useState } from "react";
import { BrowserRouter, Navigate, NavLink, Route, Routes, useNavigate, useParams, useSearchParams } from "react-router";
import type {
  AssessmentKind, AssessmentLevelFormSlotView, AssessmentReviewOverviewView, AssessmentSectionCode, AssessmentView,
  CefrLevel, CoachView, ContentLessonMatrixView, ContentLessonSetVersionView, ContentPromptSettingsView,
  ContentReviewView, ContentWeekFrameView,
  LearnerAvatarData, LearnerHomeView, LearnerProfileData, LearnerProfileView, LearnerProgressView,
  LessonView, MicroLessonView, SessionView
} from "@e4s/contracts";
import { apiClient } from "./api-client.js";
import { EntryScreen } from "./features/auth/index.js";
import { Assessment, Avatar, Coach, Home, Lesson, Micro, Onboard, Profile } from "./pages/learner/index.js";
import { LessonSet, Lessons, LevelApproval, LevelForms, Prompts, Review, Weeks } from "./pages/operator/index.js";

export function App() {
  const [session, setSession] = useState<SessionView | null | undefined>(undefined);
  useEffect(() => { void apiClient.currentSession().then(setSession).catch(() => setSession(null)); }, []);
  if (session === undefined) return <Loading label="Đang mở E4S" />;
  if (!session) return <EntryScreen client={apiClient} onAuthenticated={setSession} />;
  const logout = () => void apiClient.logout().then(() => setSession(null));
  return <BrowserRouter>{session.role === "learner"
    ? <LearnerShell session={session} onLogout={logout} />
    : <StaffShell session={session} onLogout={logout} />}</BrowserRouter>;
}

function StaffShell({ session, onLogout }: { session: SessionView; onLogout: () => void }) {
  const operator = session.role === "operator";
  return <div className="app-shell">
    <aside className="sidebar">
      <a className="brand" href={operator ? "/op" : "/mgr"}><span aria-hidden="true">◆</span><span>Season English <small>· GFT</small></span></a>
      <nav aria-label={operator ? "Điều hướng người vận hành" : "Điều hướng quản lý"}>{operator ? <>
        <NavLink end to="/op">Duyệt mức</NavLink><NavLink to="/op/weeks">Chủ đề</NavLink><NavLink to="/op/lessons">Bài học</NavLink><NavLink to="/op/review">Đọc mẫu</NavLink><NavLink to="/settings">Cài đặt</NavLink>
      </> : <>
        <a href="/mgr">Tiến độ</a><a href="/mgr/ops">Vận hành</a><a href="/mgr/reminders">Nhắc học</a><a href="/mgr/report">Báo cáo</a><a href="/settings">Cài đặt</a>
      </>}</nav>
      <SidebarControls name={session.user.displayName} roleLabel={operator ? "Người vận hành" : "Quản lý"} onLogout={onLogout} />
    </aside>
    <div className="content-shell"><Routes>
      <Route path="/" element={<Navigate replace to={operator ? "/op" : "/mgr"} />} />
      <Route path="/home" element={<Navigate replace to={operator ? "/op" : "/mgr"} />} />
      <Route path="/op" element={<LevelApprovalRoute readOnly={!operator} />} />
      <Route path="/op/levelforms" element={<LevelFormsRoute />} />
      <Route path="/op/weeks" element={<WeeksRoute readOnly={!operator} />} />
      <Route path="/op/lessons" element={<LessonsRoute />} />
      <Route path="/op/lessons/:week/:cefr" element={<LessonSetRoute readOnly={!operator} />} />
      <Route path="/op/review" element={<ReviewRoute />} />
      <Route path="/op/prompts" element={<PromptsRoute readOnly={!operator} />} />
      <Route path="/settings" element={<SettingsPending />} />
      <Route path="*" element={<StaffPending />} />
    </Routes></div>
  </div>;
}

function LevelApprovalRoute({ readOnly }: { readOnly: boolean }) {
  const [overview, setOverview] = useState<AssessmentReviewOverviewView>();
  const [error, setError] = useState("");
  const load = () => apiClient.getAssessmentReviewOverview().then(setOverview).catch(() => setError("Không tải được dữ liệu duyệt trình độ."));
  useEffect(() => { void load(); }, []);
  if (!overview) return error ? <ErrorState message={error} /> : <Loading label="Đang tải dữ liệu duyệt" />;
  return <LevelApproval overview={overview} readOnly={readOnly} onDecision={async (attemptId, input) => {
    setError("");
    try { await apiClient.decideAssessment(attemptId, input); await load(); }
    catch { setError("Không lưu được quyết định. Vui lòng kiểm tra lại trạng thái bài."); }
  }} />;
}

function LevelFormsRoute() {
  const [slots, setSlots] = useState<AssessmentLevelFormSlotView[]>();
  const [error, setError] = useState("");
  useEffect(() => { void apiClient.getAssessmentLevelForms().then(setSlots).catch(() => setError("Không tải được danh sách đề lên mức.")); }, []);
  if (!slots) return error ? <ErrorState message={error} /> : <Loading label="Đang tải đề lên mức" />;
  return <LevelForms slots={slots} aiAvailable={false} />;
}

function WeeksRoute({ readOnly }: { readOnly: boolean }) {
  const [view, setView] = useState<ContentWeekFrameView>();
  const [error, setError] = useState("");
  useEffect(() => { void apiClient.getContentWeeks().then(setView).catch(() => setError("Không tải được khung chủ đề tuần.")); }, []);
  if (!view) return error ? <ErrorState message={error} /> : <Loading label="Đang tải khung chủ đề" />;
  return <Weeks view={view} readOnly={readOnly} onSave={async (weeks) => {
    setError("");
    try { setView(await apiClient.saveContentWeeks(weeks)); }
    catch { setError("Không lưu được khung chủ đề tuần."); }
  }} />;
}

function LessonsRoute() {
  const [view, setView] = useState<ContentLessonMatrixView>();
  const [error, setError] = useState("");
  useEffect(() => { void apiClient.getContentLessonMatrix().then(setView).catch(() => setError("Không tải được ma trận bài học.")); }, []);
  if (!view) return error ? <ErrorState message={error} /> : <Loading label="Đang tải bài học" />;
  return <Lessons view={view} aiAvailable={false} />;
}

function LessonSetRoute({ readOnly }: { readOnly: boolean }) {
  const params = useParams();
  const [searchParams] = useSearchParams();
  const week = Number(params.week);
  const cefr = params.cefr as CefrLevel | undefined;
  const [view, setView] = useState<ContentLessonSetVersionView>();
  const [error, setError] = useState("");
  const load = async () => {
    if (!Number.isInteger(week) || !cefr) return Promise.reject(new Error("INVALID_ROUTE"));
    try {
      setView(await apiClient.getContentLessonSet(week, cefr));
    } catch (reason) {
      if (!(reason instanceof Error) || reason.message !== "CONTENT_LESSON_SET_NOT_FOUND") throw reason;
      const frame = await apiClient.getContentWeeks();
      setView({
        lessonSetId: "", versionId: "", version: 0, status: "draft", weekNumber: week,
        topic: frame.weeks.find((item) => item.weekNumber === week)?.topic ?? `Tuần ${week}`,
        cefr, explanationLanguage: cefr === "A1" || cefr === "A2" ? "Tiếng Việt" : "English",
        createdBy: null, approvedBy: null, createdAt: new Date().toISOString(), publishedAt: null, lessons: []
      });
    }
  };
  useEffect(() => { void load().catch(() => setError("Không tải được bộ bài học.")); }, [week, cefr]);
  if (!view) return error ? <ErrorState message={error} /> : <Loading label="Đang tải bộ bài" />;
  const act = async (operation: (versionId: string) => Promise<ContentLessonSetVersionView>, message: string) => {
    setError("");
    try { setView(await operation(view.versionId)); }
    catch { setError(message); }
  };
  return <LessonSet
    view={view}
    readOnly={readOnly}
    initialEditingDay={searchParams.get("edit") === "1" ? 1 : null}
    onSaveDraft={async (lessons) => {
      setError("");
      try { setView(await apiClient.saveContentLessonDraft(week, cefr!, lessons)); }
      catch { setError("Không lưu được bản nháp. Hãy kiểm tra các mục bắt buộc trong bài."); }
    }}
    onSubmitReview={() => act(apiClient.submitContentLessonSet, "Không gửi duyệt được bộ bài.")}
    onPublish={() => act(apiClient.publishContentLessonSet, "Không duyệt được bộ bài. Người soạn không thể tự duyệt.")}
    onRetire={() => act(apiClient.retireContentLessonSet, "Không thu hồi được bộ bài.")}
  />;
}

function ReviewRoute() {
  const [view, setView] = useState<ContentReviewView>();
  const [error, setError] = useState("");
  useEffect(() => { void apiClient.getContentReview().then(setView).catch(() => setError("Không tải được dữ liệu kiểm tra AI.")); }, []);
  if (!view) return error ? <ErrorState message={error} /> : <Loading label="Đang tải dữ liệu kiểm tra" />;
  return <Review view={view} />;
}

function PromptsRoute({ readOnly }: { readOnly: boolean }) {
  const [view, setView] = useState<ContentPromptSettingsView>();
  const [error, setError] = useState("");
  useEffect(() => { void apiClient.getContentPrompts().then(setView).catch(() => setError("Không tải được prompt và rubric.")); }, []);
  if (!view) return error ? <ErrorState message={error} /> : <Loading label="Đang tải prompt" />;
  return <Prompts view={view} readOnly={readOnly} onSave={async (groups) => {
    setError("");
    try { setView(await apiClient.saveContentPrompts(groups)); }
    catch { setError("Không lưu được prompt và rubric."); }
  }} />;
}

function StaffPending() { return <main className="operator-page"><h1>Nội dung đang được nối dữ liệu</h1><p>Màn này giữ nguyên trong danh sách đã chốt và sẽ được hoàn thiện ở bước tương ứng.</p></main>; }
function SettingsPending() { return <main className="operator-page"><h1>Cài đặt</h1><p>Các khối cấu hình đã chốt được giữ tại màn này và sẽ được nối dữ liệu ở bước cài đặt chung.</p></main>; }

function LearnerShell({ session, onLogout }: { session: SessionView; onLogout: () => void }) {
  const [avatar, setAvatar] = useState<LearnerAvatarData>();
  useEffect(() => { void apiClient.getProfile().then((profile) => setAvatar(profile.profile.avatar)).catch(() => undefined); }, []);
  return <div className="app-shell">
    <aside className="sidebar">
      <a className="brand" href="/home"><span aria-hidden="true">◆</span><span>Season English <small>· GFT</small></span></a>
      <nav aria-label="Điều hướng người học">
        <NavLink to="/home">Trang chủ</NavLink><a href="/coach">Luyện với Season</a><a href="/practice">Bài tuần</a><a href="/games">Mini game</a><NavLink to="/profile">Tiến độ & hồ sơ</NavLink>
      </nav>
      <SidebarControls name={session.user.displayName} roleLabel="Người học" avatar={avatar} onLogout={onLogout} />
    </aside>
    <div className="content-shell"><Routes>
      <Route path="/" element={<Navigate replace to="/home" />} />
      <Route path="/onboard" element={<OnboardRoute />} />
      <Route path="/home" element={<HomeRoute />} />
      <Route path="/test/:kind" element={<AssessmentRoute />} />
      <Route path="/lesson/:lessonId" element={<LessonRoute />} />
      <Route path="/micro/:microLessonId" element={<MicroRoute />} />
      <Route path="/coach" element={<CoachRoute />} />
      <Route path="/profile" element={<ProfileRoute />} />
    </Routes></div>
  </div>;
}

function SidebarControls({ name, roleLabel, avatar, onLogout }: { name: string; roleLabel: string; avatar?: LearnerAvatarData | undefined; onLogout: () => void }) {
  const [effectsOn, setEffectsOn] = useState(true);
  const [musicOn, setMusicOn] = useState(true);
  return <div className="sidebar-user">
    <div className="sidebar-sound" role="group" aria-label="Âm thanh">
      <button type="button" aria-pressed={effectsOn} aria-label={`Hiệu ứng âm thanh: ${effectsOn ? "bật" : "tắt"}`} onClick={() => setEffectsOn((value) => !value)}><SpeakerIcon /></button>
      <button type="button" aria-pressed={musicOn} aria-label={`Nhạc nền: ${musicOn ? "bật" : "tắt"}`} onClick={() => setMusicOn((value) => !value)}><MusicIcon /></button>
    </div>
    <div className="sidebar-identity"><button className="sidebar-avatar" type="button" aria-label="Đổi avatar">{avatar ? <Avatar avatar={avatar} name={name} /> : <span aria-hidden="true">✣</span>}</button><div><strong>{name}</strong><span>{roleLabel}</span></div></div>
    <button className="sidebar-logout" onClick={onLogout}>Đăng xuất</button>
  </div>;
}

function SpeakerIcon() { return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 9v6h4l5 4V5L8 9H4Zm12 1.2c.8 1.1.8 2.5 0 3.6M18.5 8a6 6 0 0 1 0 8" /></svg>; }
function MusicIcon() { return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 18V6l10-2v12M9 10l10-2M9 18a3 2 0 1 1-6 0 3 2 0 1 1 6 0Zm10-2a3 2 0 1 1-6 0 3 2 0 1 1 6 0Z" /></svg>; }

function AssessmentRoute() {
  const { kind: rawKind = "placement" } = useParams();
  const kind: AssessmentKind | "levelup" = rawKind === "levelup" || rawKind === "level-up"
    ? "levelup"
    : rawKind === "final" ? "final" : "placement";
  const [view, setView] = useState<AssessmentView>();
  const [error, setError] = useState("");
  useEffect(() => {
    setView(undefined); setError("");
    void apiClient.getAssessment(kind).then(setView).catch(() => setError("Không tải được bài test."));
  }, [kind]);
  if (!view) return error ? <ErrorState message={error} /> : <Loading label="Đang tải bài test" />;
  const attemptId = view.attempt?.id;
  return <Assessment
    view={view}
    onStart={async () => setView(await apiClient.startAssessment(kind))}
    onSaveResponse={async (section, taskKey, input) => {
      if (!attemptId) return;
      const response = await apiClient.saveAssessmentResponse(attemptId, section, taskKey, input);
      setView((current) => current?.attempt ? {
        ...current,
        attempt: {
          ...current.attempt,
          responses: [...current.attempt.responses.filter((item) => item.taskKey !== taskKey), response]
        }
      } : current);
    }}
    onCompleteSection={async (section: AssessmentSectionCode) => {
      if (!attemptId) return;
      setView(await apiClient.completeAssessmentSection(attemptId, section));
    }}
    onRecordAudioPlay={async (section, groupKey) => {
      if (!attemptId) throw new Error("Assessment attempt is not active");
      const recorded = await apiClient.recordAssessmentAudioPlay(attemptId, section, groupKey);
      setView((current) => current?.attempt ? {
        ...current,
        attempt: {
          ...current.attempt,
          audioPlayCounts: {
            ...current.attempt.audioPlayCounts,
            [`${section}:${groupKey}`]: recorded.playCount
          }
        }
      } : current);
      return recorded;
    }}
    onSubmit={async () => {
      if (!attemptId) return;
      setView(await apiClient.submitAssessment(attemptId));
    }}
  />;
}

function HomeRoute() {
  const [view, setView] = useState<LearnerHomeView>();
  const [error, setError] = useState("");
  useEffect(() => { void apiClient.getHome().then(setView).catch(() => setError("Không tải được trang chủ.")); }, []);
  if (error) return <ErrorState message={error} />;
  if (!view) return <Loading label="Đang tải trang chủ" />;
  if (view.onboardingRequired) return <Navigate replace to="/onboard" />;
  return <Home view={view} />;
}

function OnboardRoute() {
  const [view, setView] = useState<LearnerProfileView>();
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const navigate = useNavigate();
  useEffect(() => { void apiClient.getProfile().then(setView).catch(() => setError("Không tải được hồ sơ.")); }, []);
  if (!view) return error ? <ErrorState message={error} /> : <Loading label="Đang tải hồ sơ" />;
  const save = async (profile: LearnerProfileData) => {
    setSaving(true); setError("");
    try { const saved = await apiClient.saveProfile(profile, view.version); setView(saved); navigate("/home"); }
    catch { setError("Không lưu được hồ sơ. Dữ liệu trên màn hình vẫn được giữ để bạn thử lại."); }
    finally { setSaving(false); }
  };
  return <Onboard initialProfile={view.profile} onSave={save} saving={saving} {...(error ? { error } : {})} />;
}

function LessonRoute() {
  const { lessonId = "" } = useParams();
  const [lesson, setLesson] = useState<LessonView>();
  const [error, setError] = useState("");
  useEffect(() => { void apiClient.getLesson(lessonId).then(setLesson).catch(() => setError("Không tải được bài học.")); }, [lessonId]);
  if (!lesson) return error ? <ErrorState message={error} /> : <Loading label="Đang tải bài học" />;
  return <Lesson lesson={lesson} onSaveProgress={async (progress) => {
    const saved = await apiClient.saveLessonProgress(lesson.id, progress);
    setLesson({ ...lesson, progress: saved });
  }} />;
}

function MicroRoute() {
  const { microLessonId = "" } = useParams();
  const [lesson, setLesson] = useState<MicroLessonView>();
  const [error, setError] = useState("");
  useEffect(() => { void apiClient.getMicroLesson(microLessonId).then(setLesson).catch(() => setError("Không tải được bài siêu ngắn.")); }, [microLessonId]);
  if (!lesson) return error ? <ErrorState message={error} /> : <Loading label="Đang tải bài siêu ngắn" />;
  return <Micro
    lesson={lesson}
    onSubmit={async (answer) => setLesson(await apiClient.submitMicroAttempt(lesson.id, answer))}
    onComplete={async () => setLesson(await apiClient.completeMicroLesson(lesson.id))}
  />;
}

function CoachRoute() {
  const [view, setView] = useState<CoachView>();
  const [error, setError] = useState("");
  const pending = useRef<{ requestId: string; message: string } | undefined>(undefined);
  useEffect(() => { void apiClient.getCoach().then(setView).catch(() => setError("Không tải được cuộc trò chuyện với Season.")); }, []);
  if (!view) return error ? <ErrorState message={error} /> : <Loading label="Đang mở cuộc trò chuyện" />;
  return <Coach
    view={view}
    onSend={async (message) => {
      const request = pending.current?.message === message
        ? pending.current
        : { requestId: crypto.randomUUID(), message };
      pending.current = request;
      const next = await apiClient.sendCoachMessage(request);
      pending.current = undefined;
      setView(next);
    }}
    onPersonaChange={async (persona) => setView(await apiClient.setCoachPersona(persona))}
    onNewChat={async () => { pending.current = undefined; setView(await apiClient.clearCoach()); }}
  />;
}

function ProfileRoute() {
  const [view, setView] = useState<LearnerProgressView>();
  const [profile, setProfile] = useState<LearnerProfileView>();
  const [error, setError] = useState("");
  const [savingAvatar, setSavingAvatar] = useState(false);
  useEffect(() => { void Promise.all([apiClient.getProgress(), apiClient.getProfile()]).then(([nextView, nextProfile]) => { setView(nextView); setProfile(nextProfile); }).catch(() => setError("Không tải được tiến độ.")); }, []);
  if (!view || !profile) return error ? <ErrorState message={error} /> : <Loading label="Đang tải tiến độ" />;
  const saveAvatar = async (avatar: LearnerAvatarData) => {
    setSavingAvatar(true); setError("");
    try {
      const saved = await apiClient.saveProfile({ ...profile.profile, avatar }, profile.version);
      setProfile(saved);
      setView({ ...view, learner: { ...view.learner, profile: saved.profile } });
    } catch { setError("Không lưu được avatar. Lựa chọn trên màn hình vẫn được giữ để bạn thử lại."); }
    finally { setSavingAvatar(false); }
  };
  return <Profile view={view} onSaveAvatar={saveAvatar} savingAvatar={savingAvatar} />;
}

function Loading({ label }: { label: string }) { return <main className="status-page" aria-busy="true"><div className="spinner" aria-hidden="true" /><p>{label}…</p></main>; }
function ErrorState({ message }: { message: string }) { return <main className="status-page" role="alert"><h1>Chưa mở được nội dung</h1><p>{message}</p><button onClick={() => location.reload()}>Thử lại</button></main>; }
