import { useEffect, useState } from "react";
import { BrowserRouter, Navigate, NavLink, Route, Routes, useNavigate, useParams } from "react-router";
import type {
  AssessmentKind, AssessmentSectionCode, AssessmentView, LearnerAvatarData, LearnerHomeView, LearnerProfileData, LearnerProfileView, LearnerProgressView,
  LessonView, MicroLessonView, SessionView
} from "@e4s/contracts";
import { apiClient } from "./api-client.js";
import { EntryScreen } from "./features/auth/index.js";
import { Assessment, Home, Lesson, Micro, Onboard, Profile } from "./pages/learner/index.js";

export function App() {
  const [session, setSession] = useState<SessionView | null | undefined>(undefined);
  useEffect(() => { void apiClient.currentSession().then(setSession).catch(() => setSession(null)); }, []);
  if (session === undefined) return <Loading label="Đang mở E4S" />;
  if (!session) return <EntryScreen client={apiClient} onAuthenticated={setSession} />;
  if (session.role !== "learner") return <main className="learner-page"><h1>Khu vực nhân sự</h1><p>Các màn vận hành giữ nguyên theo prototype và đang được nối dữ liệu.</p><button onClick={() => void apiClient.logout().then(() => setSession(null))}>Đăng xuất</button></main>;
  return <BrowserRouter><LearnerShell session={session} onLogout={() => void apiClient.logout().then(() => setSession(null))} /></BrowserRouter>;
}

function LearnerShell({ session, onLogout }: { session: SessionView; onLogout: () => void }) {
  return <div className="app-shell">
    <aside className="sidebar">
      <a className="brand" href="/home"><span aria-hidden="true">◆</span><span>Season English <small>· GFT</small></span></a>
      <nav aria-label="Điều hướng người học">
        <NavLink to="/home">Trang chủ</NavLink><a href="/coach">Luyện với Season</a><a href="/practice">Bài tuần</a><a href="/games">Mini game</a><NavLink to="/profile">Tiến độ & hồ sơ</NavLink>
      </nav>
      <div className="sidebar-user"><strong>{session.user.displayName}</strong><span>Người học</span><button onClick={onLogout}>Đăng xuất</button></div>
    </aside>
    <div className="content-shell"><Routes>
      <Route path="/" element={<Navigate replace to="/home" />} />
      <Route path="/onboard" element={<OnboardRoute />} />
      <Route path="/home" element={<HomeRoute />} />
      <Route path="/test/:kind" element={<AssessmentRoute />} />
      <Route path="/lesson/:lessonId" element={<LessonRoute />} />
      <Route path="/micro/:microLessonId" element={<MicroRoute />} />
      <Route path="/profile" element={<ProfileRoute />} />
    </Routes></div>
  </div>;
}

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
