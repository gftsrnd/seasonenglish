import { useEffect, useRef, useState, type ReactNode } from "react";
import { BrowserRouter, Navigate, NavLink, Route, Routes, useNavigate, useParams, useSearchParams } from "react-router";
import type {
  AssessmentKind, AssessmentLevelFormSlotView, AssessmentReviewOverviewView, AssessmentSectionCode, AssessmentView,
  CefrLevel, CoachView, ContentLessonDraftInput, ContentLessonMatrixView, ContentLessonSetVersionView, ContentPromptSettingsView,
  ArenaView, DuelView, GameFinishInput, GameHubView, GameKey, GameResultView, RewardView, SurveyView, WeeklyPracticeView,
  ContentReviewView, ContentWeekFrameView,
  LearnerAvatarData, LearnerHomeView, LearnerProfileData, LearnerProfileView, LearnerProgressView,
  LessonView, LevelChallengeView, ManagerAccountsView, ManagerOperationsView, ManagerProgressView, ManagerRemindersView, ManagerReportView, ManagerSettingsView, MicroLessonView, ProductPreferencesView, SessionView, SystemCapabilitiesView
} from "@e4s/contracts";
import { apiClient } from "./api-client.js";
import { EntryScreen } from "./features/auth/index.js";
import { staffNavigation } from "./features/authorization/RoleScopeNotice.js";
import { SettingsWorkspace } from "./features/authorization/SettingsWorkspace.js";
import { Arena, Assessment, Avatar, Challenge, Coach, Duel, Game as GameScreen, Games, Home, Lesson, Micro, Onboard, Practice, Profile, Reward, Survey } from "./pages/learner/index.js";
import { LessonSet, Lessons, LevelApproval, LevelForms, Prompts, Review, Weeks } from "./pages/operator/index.js";
import { ManagerOperations } from "./pages/manager/Operations.js";
import { ManagerProgress } from "./pages/manager/Progress.js";
import { ManagerAccounts } from "./pages/manager/Accounts.js";
import { ManagerReminders } from "./pages/manager/Reminders.js";
import { ManagerReport } from "./pages/manager/Report.js";
import { ManagerRewardPreview } from "./pages/manager/Rewards.js";
import { ExperienceProvider, useExperience } from "./features/experience/Experience.js";
import { autoSeasonTheme, SeasonMark } from "./pages/learner/games/season-art.js";

export function App() {
  const [session, setSession] = useState<SessionView | null | undefined>(undefined);
  useEffect(() => { void apiClient.currentSession().then(setSession).catch(() => setSession(null)); }, []);
  if (session === undefined) return <Loading label="Đang mở E4S" />;
  if (!session) return <EntryScreen client={apiClient} onAuthenticated={setSession} />;
  const logout = () => void apiClient.logout().then(() => setSession(null));
  return <ExperienceProvider><BrowserRouter>{session.role === "learner"
    ? <LearnerShell session={session} onLogout={logout} />
    : <StaffShell session={session} onLogout={logout} />}</BrowserRouter></ExperienceProvider>;
}

function StaffShell({ session, onLogout }: { session: SessionView; onLogout: () => void }) {
  const operator = session.role === "operator";
  const staffCanOperate = session.role === "operator";
  const role = operator ? "operator" : "manager";
  const [capabilities, setCapabilities] = useState<SystemCapabilitiesView>();
  const [preferences, setPreferences] = useState<ProductPreferencesView>();
  useEffect(() => {
    const load = apiClient.getSystemCapabilities?.();
    if (load) void load.then(setCapabilities).catch(() => setCapabilities(undefined));
    const preferenceLoad = apiClient.getProductPreferences?.();
    if (preferenceLoad) void preferenceLoad.then((next) => { setPreferences(next); applyProductTheme(next); }).catch(() => undefined);
  }, []);
  const operatorScreen = (screen: ReactNode) => staffCanOperate ? screen : <ManagerOperatorPreview>{screen}</ManagerOperatorPreview>;
  return <div className="app-shell">
    <aside className="sidebar">
      <a className="brand" href={operator ? "/op" : "/mgr"}><span aria-hidden="true"><SeasonMark /></span><span>Season English <small>· GFT</small></span></a>
      <nav aria-label={operator ? "Điều hướng người vận hành" : "Điều hướng quản lý"}>{staffNavigation[role].filter((item) => item.visible !== false).map((item) => <NavLink end={item.to === "/op" || item.to === "/mgr"} to={item.to} key={item.to}>{item.label}</NavLink>)}</nav>
      <SidebarControls name={session.user.displayName} roleLabel={operator ? "Người vận hành" : "Quản lý"} onLogout={onLogout} />
    </aside>
    <div className="content-shell"><Routes>
      <Route path="/" element={<Navigate replace to={operator ? "/op" : "/mgr"} />} />
      <Route path="/home" element={<Navigate replace to={operator ? "/op" : "/mgr"} />} />
      <Route path="/op" element={operatorScreen(<LevelApprovalRoute readOnly={!staffCanOperate} />)} />
      <Route path="/op/levelforms" element={operatorScreen(<LevelFormsRoute aiAvailable={capabilities?.ai ?? false} readOnly={!staffCanOperate} />)} />
      <Route path="/op/weeks" element={operatorScreen(<WeeksRoute readOnly={!staffCanOperate} />)} />
      <Route path="/op/lessons" element={operatorScreen(<LessonsRoute aiAvailable={capabilities?.ai ?? false} readOnly={!staffCanOperate} />)} />
      <Route path="/op/lessons/:week/:cefr" element={operatorScreen(<LessonSetRoute readOnly={!staffCanOperate} />)} />
      <Route path="/op/review" element={operatorScreen(<ReviewRoute readOnly={!staffCanOperate} />)} />
      <Route path="/op/prompts" element={operatorScreen(<PromptsRoute readOnly={!staffCanOperate} />)} />
      <Route path="/mgr" element={!operator ? <ManagerProgressRoute /> : <Navigate replace to="/op" />} />
      <Route path="/mgr/ops" element={!operator ? <ManagerOperationsRoute /> : <Navigate replace to="/op" />} />
      <Route path="/mgr/reminders" element={!operator ? <ManagerRemindersRoute /> : <Navigate replace to="/op" />} />
      <Route path="/mgr/report" element={!operator ? <ManagerReportRoute /> : <Navigate replace to="/op" />} />
      <Route path="/mgr/rewards" element={!operator ? <ManagerRewardPreviewRoute /> : <Navigate replace to="/op" />} />
      <Route path="/settings" element={<SettingsRoute role={role} currentUserId={session.user.id} capabilities={capabilities} preferences={preferences} onPreferences={setPreferences} />} />
      <Route path="*" element={<Navigate replace to={operator ? "/op" : "/mgr"} />} />
    </Routes></div>
  </div>;
}

function ManagerOperatorPreview({ children }: { children: ReactNode }) {
  const links = [
    ["/op", "Duyệt mức"], ["/op/weeks", "Chủ đề tuần"], ["/op/lessons", "Bài học"],
    ["/op/review", "Đọc mẫu"], ["/op/prompts", "Prompt"], ["/op/levelforms", "Đề lên mức"]
  ] as const;
  return <><section className="manager-operator-preview banner info" aria-label="Chế độ xem của Quản lý">
    <div className="body small"><strong>Chế độ xem của Quản lý</strong> – bạn thấy đúng màn hình của Người vận hành nhưng không thao tác được.
      <nav className="row" aria-label="Chuyển màn hình Người vận hành"><a className="button-link button-link--small" href="/mgr/ops">← Hiệu suất vận hành</a>{links.map(([to, label]) => <NavLink className={({ isActive }) => `button-link button-link--small${isActive ? " button--primary" : ""}`} end={to === "/op"} key={to} to={to}>{label}</NavLink>)}</nav>
    </div>
  </section>{children}</>;
}

function ManagerProgressRoute() {
  const [view, setView] = useState<ManagerProgressView>();
  const [error, setError] = useState("");
  useEffect(() => { void apiClient.getManagerProgress().then(setView).catch(() => setError("Không tải được tiến độ của tổ chức.")); }, []);
  if (!view) return error ? <ErrorState message={error} /> : <Loading label="Đang tải tiến độ nhóm" />;
  return <ManagerProgress view={view} />;
}

function ManagerOperationsRoute() {
  const [view, setView] = useState<ManagerOperationsView>();
  const [error, setError] = useState("");
  useEffect(() => { void apiClient.getManagerOperations().then(setView).catch(() => setError("Không tải được dữ liệu vận hành.")); }, []);
  if (!view) return error ? <ErrorState message={error} /> : <Loading label="Đang tải vận hành" />;
  return <ManagerOperations view={view} />;
}

function ManagerRemindersRoute() {
  const [view, setView] = useState<ManagerRemindersView>();
  const [error, setError] = useState("");
  const [sendingLearnerId, setSendingLearnerId] = useState<string>();
  const [notice, setNotice] = useState("");
  const { notify } = useExperience();
  useEffect(() => { void apiClient.getManagerReminders().then(setView).catch(() => setError("Không tải được danh sách nhắc học.")); }, []);
  if (!view) return error ? <ErrorState message={error} /> : <Loading label="Đang tải danh sách nhắc học" />;
  const send = async (learnerId: string) => {
    setError(""); setNotice(""); setSendingLearnerId(learnerId);
    try { await apiClient.sendManagerReminder(learnerId, crypto.randomUUID()); setNotice("Đã xếp hàng nhắc học và ghi nhận vào lịch sử vận hành."); notify("Đã xếp hàng nhắc học.", "success"); }
    catch { setError("Không gửi được nhắc học. Hãy thử lại với cùng chính sách hiện tại."); notify("Không gửi được nhắc học.", "error"); }
    finally { setSendingLearnerId(undefined); }
  };
  return <ManagerReminders view={view} sendingLearnerId={sendingLearnerId} notice={error || notice} onSend={send} />;
}

function ManagerReportRoute() {
  const [view, setView] = useState<ManagerReportView>();
  const [error, setError] = useState("");
  useEffect(() => { void apiClient.getManagerReport().then(setView).catch(() => setError("Không tải được báo cáo tổ chức.")); }, []);
  if (!view) return error ? <ErrorState message={error} /> : <Loading label="Đang tải báo cáo tổ chức" />;
  return <ManagerReport view={view} />;
}

function ManagerRewardPreviewRoute() {
  const [view, setView] = useState<ManagerProgressView>();
  const [error, setError] = useState("");
  useEffect(() => { void apiClient.getManagerProgress().then(setView).catch(() => setError("Không tải được dữ liệu phần thưởng.")); }, []);
  if (!view) return error ? <ErrorState message={error} /> : <Loading label="Đang tải điều kiện phần thưởng" />;
  return <ManagerRewardPreview view={view} />;
}

function SettingsRoute({ role, currentUserId, capabilities, preferences, onPreferences }: {
  role: "operator" | "manager"; currentUserId: string; capabilities?: SystemCapabilitiesView | undefined;
  preferences?: ProductPreferencesView | undefined; onPreferences: (value: ProductPreferencesView) => void;
}) {
  const [accounts, setAccounts] = useState<ManagerAccountsView>();
  const [settings, setSettings] = useState<ManagerSettingsView>();
  const [error, setError] = useState("");
  const [changingAccountId, setChangingAccountId] = useState<string>();
  const { notify } = useExperience();
  useEffect(() => {
    if (role === "manager") void Promise.all([apiClient.getManagerAccounts(), apiClient.getManagerSettings()])
      .then(([nextAccounts, nextSettings]) => { setAccounts(nextAccounts); setSettings(nextSettings); })
      .catch(() => setError("Không tải được cài đặt quản lý."));
  }, [role]);
  const savePreferences = async (input: ProductPreferencesView) => {
    const saved = await apiClient.saveProductPreferences(input); onPreferences(saved); applyProductTheme(saved); notify("Đã lưu giao diện và nguồn ảnh.", "success");
  };
  if (role === "operator") return <SettingsWorkspace role="operator" capabilities={capabilities} preferences={preferences} onSavePreferences={savePreferences} />;
  if (!accounts || !settings) return error ? <ErrorState message={error} /> : <Loading label="Đang tải cài đặt quản lý" />;
  const changeRole = async (accountId: string, nextRole: "learner" | "operator" | "manager") => {
    setError("");
    setChangingAccountId(accountId);
    try {
      const updated = await apiClient.updateManagerAccountRole(accountId, nextRole);
      setAccounts((current) => current && { ...current, accounts: current.accounts.map((account) => account.id === updated.id ? updated : account) });
      notify("Đã cập nhật vai trò tài khoản.", "success");
    } catch { setError("Không đổi được vai trò. Hãy kiểm tra lại quyền quản lý và trạng thái tài khoản."); notify("Không đổi được vai trò tài khoản.", "error"); }
    finally { setChangingAccountId(undefined); }
  };
  const createAccount = async (input: { displayName: string; email: string; role: "learner" | "operator" | "manager"; password: string }) => {
    setError("");
    try {
      const created = await apiClient.createManagerAccount(input);
      setAccounts((current) => current && { ...current, accounts: [...current.accounts, created] });
      notify("Đã tạo tài khoản và ghi nhận vào hệ thống.", "success");
    } catch { setError("Không tạo được tài khoản. Kiểm tra email chưa tồn tại và mật khẩu có ít nhất 8 ký tự."); notify("Không tạo được tài khoản.", "error"); throw new Error("ACCOUNT_CREATE_FAILED"); }
  };
  const changeStatus = async (accountId: string, status: "active" | "disabled" | "deleted") => {
    setError(""); setChangingAccountId(accountId);
    try {
      const updated = await apiClient.updateManagerAccountStatus(accountId, status);
      setAccounts((current) => current && { ...current, accounts: status === "deleted"
        ? current.accounts.filter((account) => account.id !== accountId)
        : current.accounts.map((account) => account.id === updated.id ? updated : account) });
      notify(status === "active" ? "Đã mở khóa tài khoản." : status === "disabled" ? "Đã khóa tài khoản." : "Đã xóa quyền truy cập tài khoản.", "success");
    } catch { setError("Không cập nhật được trạng thái tài khoản."); notify("Không cập nhật được tài khoản.", "error"); throw new Error("ACCOUNT_STATUS_FAILED"); }
    finally { setChangingAccountId(undefined); }
  };
  const resetPassword = async (accountId: string, password: string) => {
    setError("");
    try { await apiClient.resetManagerAccountPassword(accountId, password); notify("Đã đặt lại mật khẩu và đăng xuất các phiên cũ.", "success"); }
    catch { setError("Không đặt lại được mật khẩu."); notify("Không đặt lại được mật khẩu.", "error"); throw new Error("PASSWORD_RESET_FAILED"); }
  };
  const savePolicy = async (input: Omit<ManagerSettingsView, "organizationName">) => {
    setError("");
    try { setSettings(await apiClient.saveManagerSettings(input)); notify("Đã lưu chính sách vận hành.", "success"); }
    catch { setError("Không lưu được chính sách. Giá trị ngày nhắc phải từ 1 đến 30."); notify("Không lưu được chính sách vận hành.", "error"); }
  };
  return <SettingsWorkspace role="manager" capabilities={capabilities} preferences={preferences} onSavePreferences={savePreferences} managerConfiguration={settings} onSaveManagerSettings={savePolicy} managerAccounts={<ManagerAccounts
    view={accounts}
    currentUserId={currentUserId}
    changingAccountId={changingAccountId}
    error={error}
    onChangeRole={changeRole}
    onCreate={createAccount}
    onChangeStatus={changeStatus}
    onResetPassword={resetPassword}
  />} />;
}

function LevelApprovalRoute({ readOnly }: { readOnly: boolean }) {
  const [overview, setOverview] = useState<AssessmentReviewOverviewView>();
  const [error, setError] = useState("");
  const { notify } = useExperience();
  const load = () => apiClient.getAssessmentReviewOverview().then(setOverview).catch(() => setError("Không tải được dữ liệu duyệt trình độ."));
  useEffect(() => { void load(); }, []);
  if (!overview) return error ? <ErrorState message={error} /> : <Loading label="Đang tải dữ liệu duyệt" />;
  return <LevelApproval overview={overview} readOnly={readOnly} onDecision={async (attemptId, input) => {
    setError("");
    try { await apiClient.decideAssessment(attemptId, input); await load(); notify("Đã lưu quyết định duyệt trình độ.", "success"); }
    catch { setError("Không lưu được quyết định. Vui lòng kiểm tra lại trạng thái bài."); notify("Không lưu được quyết định duyệt trình độ.", "error"); }
  }} onResolveTopicReport={async (reportId) => {
    try { await apiClient.resolveTopicReport(reportId); await load(); notify("Đã đóng báo cáo chủ đề.", "success"); }
    catch { setError("Không xử lý được báo cáo chủ đề."); notify("Không xử lý được báo cáo chủ đề.", "error"); }
  }} />;
}

function LevelFormsRoute({ aiAvailable, readOnly }: { aiAvailable: boolean; readOnly: boolean }) {
  const [slots, setSlots] = useState<AssessmentLevelFormSlotView[]>();
  const [error, setError] = useState("");
  const load = () => apiClient.getAssessmentLevelForms().then(setSlots);
  useEffect(() => { void load().catch(() => setError("Không tải được danh sách đề lên mức.")); }, []);
  if (!slots) return error ? <ErrorState message={error} /> : <Loading label="Đang tải đề lên mức" />;
  return <LevelForms slots={slots} aiAvailable={aiAvailable} readOnly={readOnly} onGenerate={async (targetLevel) => {
    setError("");
    try { await apiClient.generateAssessmentLevelForm(targetLevel); await load(); }
    catch { setError("Không sinh được đề. Kiểm tra kết nối AI và prompt đang hoạt động."); }
  }} onPublish={async (versionId) => {
    setError("");
    try { await apiClient.publishAssessmentLevelForm(versionId); await load(); }
    catch { setError("Không duyệt được đề lên mức."); }
  }} />;
}

function WeeksRoute({ readOnly }: { readOnly: boolean }) {
  const [view, setView] = useState<ContentWeekFrameView>();
  const [error, setError] = useState("");
  const { notify } = useExperience();
  useEffect(() => { void apiClient.getContentWeeks().then(setView).catch(() => setError("Không tải được khung chủ đề tuần.")); }, []);
  if (!view) return error ? <ErrorState message={error} /> : <Loading label="Đang tải khung chủ đề" />;
  return <Weeks view={view} readOnly={readOnly} error={error} onSuggest={async (weekNumbers) => (await apiClient.suggestContentWeeks(weekNumbers)).weeks} onSave={async (weeks) => {
    setError("");
    try { setView(await apiClient.saveContentWeeks(weeks)); notify("Đã lưu khung chủ đề tuần.", "success"); }
    catch { setError("Không lưu được khung chủ đề tuần."); notify("Không lưu được khung chủ đề tuần.", "error"); }
  }} />;
}

function LessonsRoute({ aiAvailable, readOnly }: { aiAvailable: boolean; readOnly: boolean }) {
  const [view, setView] = useState<ContentLessonMatrixView>();
  const [error, setError] = useState("");
  const navigate = useNavigate();
  const { notify } = useExperience();
  useEffect(() => { void apiClient.getContentLessonMatrix().then(setView).catch(() => setError("Không tải được ma trận bài học.")); }, []);
  if (!view) return error ? <ErrorState message={error} /> : <Loading label="Đang tải bài học" />;
  return <Lessons view={view} aiAvailable={aiAvailable} readOnly={readOnly} error={error} onGenerate={async (weekNumber, cefr) => {
    setError("");
    try {
      const generated = await apiClient.generateContentLessonDraft(weekNumber, cefr);
      notify("AI đã sinh đủ 5 bài và lưu thành bản nháp để kiểm tra.", "success");
      navigate(`/op/lessons/${generated.weekNumber}/${generated.cefr}`);
    } catch { setError("Không sinh được bộ bài. Kiểm tra kết nối AI và prompt đang hoạt động."); notify("Không sinh được bộ bài bằng AI.", "error"); }
  }} onCreateStarter={async (weekNumber, cefr) => {
    const topic = view.weeks.find((week) => week.weekNumber === weekNumber)?.topic ?? `Tuần ${weekNumber}`;
    setError("");
    try {
      await apiClient.saveContentLessonDraft(weekNumber, cefr, Array.from({ length: 5 }, (_, index) => starterLesson(topic, cefr, index + 1)));
      notify("Đã tạo khung 5 bài để soạn và duyệt.", "success");
      navigate(`/op/lessons/${weekNumber}/${cefr}`);
    } catch { setError("Không tạo được khung 5 bài. Hãy kiểm tra lại chủ đề tuần trước khi thử lại."); notify("Không tạo được khung 5 bài.", "error"); }
  }} />;
}

function starterLesson(topic: string, cefr: CefrLevel, dayNumber: number): ContentLessonDraftInput {
  const focus = ["Mở đầu tình huống", "Từ vựng trọng tâm", "Mẫu câu công việc", "Luyện hội thoại", "Ôn và áp dụng"][dayNumber - 1] ?? "Luyện tập";
  const topicWord = topic.trim() || "work";
  const example = `I can talk about ${topicWord.toLowerCase()} at work.`;
  return {
    dayNumber,
    title: `${focus}: ${topicWord}`,
    durationMinutes: 10,
    parts: [
      { code: "objective", title: "Mục tiêu bài học", content: { text: `Người học dùng được một câu ngắn về ${topicWord} ở mức ${cefr}.` } },
      { code: "instruction", title: "Hướng dẫn làm bài", content: { steps: ["Đọc từ và câu mẫu", "Nghe, đọc thành tiếng", "Làm bài ngắn rồi tự sửa"] } },
      { code: "vocabulary", title: "Từ vựng", content: { items: [
        { word: topicWord, pronunciation: "/ˈwɜːrk/", meaning: `từ khóa của ${topicWord}`, examples: [`talk about ${topicWord}`] },
        { word: "team", pronunciation: "/tiːm/", meaning: "nhóm", examples: ["my team"] },
        { word: "update", pronunciation: "/ʌpˈdeɪt/", meaning: "cập nhật", examples: ["give an update"] }
      ] } },
      { code: "grammar", title: "Ngữ pháp", content: { formula: "I can + verb …", examples: [example, "I can give an update to my team."] } },
      { code: "pronunciation", title: "Phát âm", content: { focus: "/iː/", words: ["team", "meeting", "please"], instruction: "Kéo dài âm /iː/ trong từ mẫu." } },
      { code: "listening", title: "Nghe", content: { script: example, prompt: "What can the speaker talk about?", options: [topicWord, "weather", "food", "travel"], answer: topicWord } },
      { code: "reading", title: "Đọc", content: { text: `In a short meeting, I give an update about ${topicWord}.`, prompt: "What does the speaker give?", options: ["an update", "a gift", "a ticket", "a map"], answer: "an update" } },
      { code: "writing", title: "Viết", content: { type: "free", prompt: `Viết một câu về ${topicWord} trong công việc.`, options: [], answer: example } },
      { code: "speaking", title: "Nói", content: { instruction: "Nói to câu mẫu sau.", prompt: example } }
    ]
  };
}

function LessonSetRoute({ readOnly }: { readOnly: boolean }) {
  const params = useParams();
  const [searchParams] = useSearchParams();
  const week = Number(params.week);
  const cefr = params.cefr as CefrLevel | undefined;
  const [view, setView] = useState<ContentLessonSetVersionView>();
  const [error, setError] = useState("");
  const { notify } = useExperience();
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
    try { setView(await operation(view.versionId)); notify("Đã cập nhật trạng thái bộ bài.", "success"); }
    catch { setError(message); notify(message, "error"); }
  };
  return <LessonSet
    view={view}
    readOnly={readOnly}
    error={error}
    initialEditingDay={searchParams.get("edit") === "1" ? 1 : null}
    onSaveDraft={async (lessons) => {
      setError("");
      try { setView(await apiClient.saveContentLessonDraft(week, cefr!, lessons)); notify("Đã lưu bản nháp bộ bài.", "success"); }
      catch { setError("Không lưu được bản nháp. Hãy kiểm tra các mục bắt buộc trong bài."); notify("Không lưu được bản nháp.", "error"); }
    }}
    onSubmitReview={() => act(apiClient.submitContentLessonSet, "Không gửi duyệt được bộ bài.")}
    onPublish={() => act(apiClient.publishContentLessonSet, "Không duyệt được bộ bài. Người soạn không thể tự duyệt.")}
    onRetire={() => act(apiClient.retireContentLessonSet, "Không thu hồi được bộ bài.")}
  />;
}

function ReviewRoute({ readOnly }: { readOnly: boolean }) {
  const [view, setView] = useState<ContentReviewView>();
  const [error, setError] = useState("");
  useEffect(() => { void apiClient.getContentReview().then(setView).catch(() => setError("Không tải được dữ liệu kiểm tra AI.")); }, []);
  if (!view) return error ? <ErrorState message={error} /> : <Loading label="Đang tải dữ liệu kiểm tra" />;
  const reload = () => apiClient.getContentReview().then(setView);
  return <Review view={view} readOnly={readOnly} onChecked={async (kind, id, checked) => {
    await apiClient.setContentReviewChecked(kind, id, checked); await reload();
  }} onDeleteMicro={async (id) => {
    await apiClient.deleteReviewedMicroLesson(id); await reload();
  }} onManualGrade={async (id, input) => {
    await apiClient.gradeReviewedSubmission(id, input); await reload();
  }} onAppealDecision={async (id, status, resolution) => {
    await apiClient.decideReviewedAppeal(id, { status, resolution }); await reload();
  }} />;
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

function LearnerShell({ session, onLogout }: { session: SessionView; onLogout: () => void }) {
  const [avatar, setAvatar] = useState<LearnerAvatarData>();
  useEffect(() => {
    void apiClient.getProfile().then((profile) => setAvatar(profile.profile.avatar)).catch(() => undefined);
    void apiClient.getProductPreferences().then(applyProductTheme).catch(() => undefined);
  }, []);
  return <div className="app-shell">
    <aside className="sidebar">
      <a className="brand" href="/home"><span aria-hidden="true"><SeasonMark /></span><span>Season English <small>· GFT</small></span></a>
      <nav aria-label="Điều hướng người học">
        <NavLink to="/home">Trang chủ</NavLink><NavLink to="/coach">Luyện với Season</NavLink><NavLink to="/practice">Bài tuần</NavLink><NavLink to="/games">Mini game</NavLink><NavLink to="/profile">Tiến độ & hồ sơ</NavLink>
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
      <Route path="/challenge" element={<ChallengeRoute />} />
      <Route path="/practice" element={<PracticeRoute />} />
      <Route path="/games" element={<GamesRoute />} />
      <Route path="/games/:game" element={<GameRoute />} />
      <Route path="/arena" element={<ArenaRoute />} />
      <Route path="/duel/:duelId" element={<DuelRoute />} />
      <Route path="/profile" element={<ProfileRoute />} />
      <Route path="/reward/:mode" element={<RewardRoute />} />
      <Route path="/survey" element={<SurveyRoute />} />
      <Route path="*" element={<Navigate replace to="/home" />} />
    </Routes></div>
  </div>;
}

function SidebarControls({ name, roleLabel, avatar, onLogout }: { name: string; roleLabel: string; avatar?: LearnerAvatarData | undefined; onLogout: () => void }) {
  const { effectsOn, musicOn, toggleEffects, toggleMusic } = useExperience();
  return <div className="sidebar-user">
    <div className="sidebar-sound" role="group" aria-label="Âm thanh">
      <button type="button" aria-pressed={effectsOn} aria-label={`Hiệu ứng âm thanh: ${effectsOn ? "bật" : "tắt"}`} onClick={toggleEffects}><SpeakerIcon /></button>
      <button type="button" aria-pressed={musicOn} aria-label={`Nhạc nền: ${musicOn ? "bật" : "tắt"}`} onClick={toggleMusic}><MusicIcon /></button>
    </div>
    <div className="sidebar-identity">{avatar ? <a className="sidebar-avatar" href="/profile" aria-label="Mở hồ sơ và đổi avatar"><Avatar avatar={avatar} name={name} /></a> : <span className="sidebar-avatar" aria-hidden="true">✣</span>}<div><strong>{name}</strong><span>{roleLabel}</span></div></div>
    <button className="sidebar-logout" onClick={onLogout}>Đăng xuất</button>
  </div>;
}

function SpeakerIcon() { return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4.5 9.5h3l4.5-4v13l-4.5-4h-3z" /><path d="M15.5 9a4 4 0 0 1 0 6" /></svg>; }
function MusicIcon() { return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 18V6l10-2v12" /></svg>; }

function applyProductTheme(preferences: ProductPreferencesView) {
  document.documentElement.dataset.theme = preferences.theme === "auto" ? autoSeasonTheme() : preferences.theme;
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
    onUploadAudio={async (file, filename) => (await apiClient.uploadAssessmentAudio(file, filename)).artifactKey}
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
    onAppeal={async (reason) => {
      if (!attemptId) return;
      const appeal = await apiClient.createAssessmentAppeal(attemptId, reason);
      setView((current) => current ? { ...current, appeal } : current);
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
  return <Home view={view} onGenerateMicro={async () => {
    const lesson = await apiClient.generateMicroLesson(crypto.randomUUID());
    window.location.assign(`/micro/${lesson.id}`);
  }} />;
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

function ChallengeRoute() {
  const [view, setView] = useState<LevelChallengeView>();
  const [error, setError] = useState("");
  const pending = useRef<{ requestId: string; message: string } | undefined>(undefined);
  useEffect(() => { void apiClient.getLevelChallenge().then(setView).catch(() => setError("Chưa có thử thách lên mức đang mở.")); }, []);
  if (!view) return error ? <ErrorState message={error} /> : <Loading label="Đang mở thử thách lên mức" />;
  return <Challenge view={view} onSend={async (message) => {
    const request = pending.current?.message === message ? pending.current : { requestId: crypto.randomUUID(), message };
    pending.current = request;
    const next = await apiClient.sendLevelChallengeMessage(request);
    pending.current = undefined;
    setView(next);
  }} />;
}

function PracticeRoute() {
  const [view, setView] = useState<WeeklyPracticeView>();
  const [error, setError] = useState("");
  useEffect(() => { void apiClient.getWeeklyPractice().then(setView).catch(() => setError("Không tải được bài thực hành tuần.")); }, []);
  if (!view) return error ? <ErrorState message={error} /> : <Loading label="Đang mở bài thực hành" />;
  return <Practice view={view} onSubmit={async (text) => setView(await apiClient.submitWeeklyPractice({ requestId: crypto.randomUUID(), text }))} />;
}

function GamesRoute() {
  const [view, setView] = useState<GameHubView>();
  const [error, setError] = useState("");
  useEffect(() => { void apiClient.getGames().then(setView).catch(() => setError("Chưa có bộ từ cho mini game.")); }, []);
  if (!view) return error ? <ErrorState message={error} /> : <Loading label="Đang mở mini game" />;
  return <Games view={view} aiAvailable={Boolean(view.aiAvailable)}
    onGenerate={async (topic) => setView(await apiClient.generateGameWordSet({ requestId: crypto.randomUUID(), topic }))}
    onUseWeekly={async () => setView(await apiClient.useWeeklyGameWordSet())}
    onDelete={async () => setView(await apiClient.useWeeklyGameWordSet())} />;
}

function GameRoute() {
  const { game } = useParams();
  const [view, setView] = useState<GameHubView>();
  const [result, setResult] = useState<GameResultView>();
  const [error, setError] = useState("");
  const pendingSubmission = useRef<{ input: GameFinishInput; requestId: string } | undefined>(undefined);
  useEffect(() => { void apiClient.getGames().then(setView).catch(() => setError("Chưa có bộ từ cho mini game.")); }, []);
  if (!view) return error ? <ErrorState message={error} /> : <Loading label="Đang mở trò chơi" />;
  const descriptor = view.games.find((item) => item.key === game);
  if (!descriptor) return <Navigate to="/games" replace />;
  return <GameScreen descriptor={descriptor} wordSet={view.wordSet}
    onResolveWordImage={async (setId, wordId) => (await apiClient.resolveGameWordImage(setId, wordId)).imageUrl}
    onFinish={async (input) => {
    const pending = pendingSubmission.current?.input === input
      ? pendingSubmission.current
      : { input, requestId: crypto.randomUUID() };
    pendingSubmission.current = pending;
    const nextResult = await apiClient.submitGameResult(descriptor.key, {
      requestId: pending.requestId,
      answers: input.answers,
      ...(input.hintsUsed === undefined ? {} : { hintsUsed: input.hintsUsed }),
      ...(input.events?.length ? { events: input.events } : {})
    });
    pendingSubmission.current = undefined;
    setResult(nextResult);
  }} result={result} onReplay={() => { pendingSubmission.current = undefined; setResult(undefined); }} />;
}

function ArenaRoute() {
  const [view, setView] = useState<ArenaView>();
  const [error, setError] = useState("");
  const navigate = useNavigate();
  useEffect(() => { void apiClient.getArena().then(setView).catch(() => setError("Không tải được đấu trường.")); }, []);
  if (!view) return error ? <ErrorState message={error} /> : <Loading label="Đang mở đấu trường" />;
  return <Arena view={view} onChallenge={async (opponentId, game) => navigate(`/duel/${(await apiClient.createDuel({ opponentId, game })).id}`)} />;
}

function DuelRoute() {
  const { duelId } = useParams();
  const [view, setView] = useState<DuelView>();
  const [completion, setCompletion] = useState<DuelView>();
  const [hub, setHub] = useState<GameHubView>();
  const [error, setError] = useState("");
  useEffect(() => {
    if (!duelId) return;
    void Promise.all([apiClient.getDuel(duelId), apiClient.getGames()]).then(([duel, games]) => { setView(duel); setHub(games); }).catch(() => setError("Không tải được trận đấu."));
  }, [duelId]);
  if (!view || !hub) return error ? <ErrorState message={error} /> : <Loading label="Đang mở trận đấu" />;
  const descriptor = hub.games.find((item) => item.key === view.game);
  if (!descriptor || !duelId) return <Navigate to="/arena" replace />;
  if (view.myScore && !completion) return <Navigate to="/arena" replace />;
  return <Duel view={view} completion={completion} descriptor={descriptor} onFinish={async ({ answers }) => setCompletion(await apiClient.submitDuelResult(duelId, { requestId: crypto.randomUUID(), answers }))} />;
}

function RewardRoute() {
  const { mode } = useParams();
  const [view, setView] = useState<RewardView>();
  const [error, setError] = useState("");
  const selected = mode === "done" ? "done" : "preview";
  useEffect(() => { void apiClient.getReward(selected).then(setView).catch(() => setError("Chứng nhận chưa sẵn sàng.")); }, [selected]);
  if (!view) return error ? <ErrorState message={error} /> : <Loading label="Đang tạo chứng nhận" />;
  return <Reward view={view} />;
}

function SurveyRoute() {
  const [view, setView] = useState<SurveyView>();
  const [error, setError] = useState("");
  useEffect(() => { void apiClient.getSurvey().then(setView).catch(() => setError("Không tải được khảo sát.")); }, []);
  if (!view) return error ? <ErrorState message={error} /> : <Loading label="Đang mở khảo sát" />;
  return <Survey view={view} onSubmit={async (answers) => setView(await apiClient.submitSurvey(answers))} />;
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
