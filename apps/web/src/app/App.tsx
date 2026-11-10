import { useEffect, useRef, useState, type ReactNode } from "react";
import { BrowserRouter, useLocation } from "react-router";
import { RefreshCw, WifiOff } from "lucide-react";
import type { CefrLevel, LearnerAvatarData, LearnerProfileView, OrganisationBackgroundMusicView, SessionView } from "@e4s/contracts";
import { sharedApiClient } from "../api/shared.js";
import { ApiError } from "../api/runtime.js";
import { apiUrl } from "../api/runtime.js";
import { ExperienceProvider } from "../features/experience/Experience.js";
import { EntryScreen } from "./shared/EntryScreen.js";
import { AppShell } from "./shared/AppShell.js";
import { SeasonMark } from "./shared/SeasonMark.js";
import { ModalProvider } from "./shared/ModalProvider.js";
import { ToastProvider } from "./shared/design-system.js";
import { useToast } from "./shared/design-system.js";
import { ThemeProvider, useTheme } from "./shared/ThemeProvider.js";
import { RoleRoutes } from "./RoleRoutes.js";
import { AvatarDialog } from "./learner/ProfileReward.js";
import { LockedLearnerSupport } from "./shared/LockedLearnerSupport.js";
import "./app-layout.css";
import { cancelAllExclusiveAudio } from "../features/experience/audio-precedence.js";

const authChangeStorageKey = "e4s:auth:changed";
const staffEntryStorageKey = "e4s:manager-entry";
const separateStaffEntry = import.meta.env.VITE_E4S_STAFF_DIRECT_ENTRY === "1";

/**
 * New E4S presentation root. It intentionally owns authentication and the
 * app shell without importing any component from the superseded pages.
 */
export function App({ children }: { children?: (session: SessionView) => ReactNode }) {
  return <ThemeProvider><ToastProvider><AppContent>{children}</AppContent></ToastProvider></ThemeProvider>;
}

function AppContent({ children }: { children?: ((session: SessionView) => ReactNode) | undefined }) {
  const { resolvedTheme, setTheme } = useTheme();
  const { show: showToast } = useToast();
  const [session, setSession] = useState<SessionView | null | undefined>(undefined);
  const [staffEntryPath] = useState(() => separateStaffEntry && document.querySelector('meta[name="e4s-entry"][content="staff"]')
    ? normalizePathname(window.location.pathname).replace(/\/forgot-password$/, "")
    : null);
  const [staffReturnPath] = useState(() => staffEntryPath ?? window.sessionStorage.getItem(staffEntryStorageKey));
  useEffect(() => {
    if (staffEntryPath) window.sessionStorage.setItem(staffEntryStorageKey, staffEntryPath);
  }, [staffEntryPath]);
  const [routeReady, setRouteReady] = useState(false);
  const [themeReadyFor, setThemeReadyFor] = useState<string | null>();
  const [bootstrapError, setBootstrapError] = useState(false);
  const [bootstrapAttempt, setBootstrapAttempt] = useState(0);
  const [profileRecord, setProfileRecord] = useState<LearnerProfileView>();
  const [learnerCefr, setLearnerCefr] = useState<CefrLevel>();
  const [avatarOpen, setAvatarOpen] = useState(false);
  const [musicAllowed, setMusicAllowed] = useState(true);
  const [musicConfig, setMusicConfig] = useState<OrganisationBackgroundMusicView>({ enabled: true, playlistId: "auto", customUrl: "", volume: 22 });
  const [sandboxMode, setSandboxMode] = useState(() => typeof window !== "undefined" && (new URL(window.location.href).searchParams.get("sandbox") === "1" || window.sessionStorage.getItem("e4s:sandbox:active") === "1"));
  useEffect(() => {
    if (!sandboxMode || typeof window === "undefined") return;
    window.sessionStorage.setItem("e4s:sandbox:active", "1");
  }, [sandboxMode]);
  useEffect(() => {
    const syncAuthentication = (event: StorageEvent) => {
      if (event.key !== authChangeStorageKey) return;
      setBootstrapError(false);
      setRouteReady(false);
      setSession(undefined);
      setBootstrapAttempt((attempt) => attempt + 1);
    };
    window.addEventListener("storage", syncAuthentication);
    return () => window.removeEventListener("storage", syncAuthentication);
  }, []);
  useEffect(() => {
    let live = true;
    void sharedApiClient.currentSession().then((nextSession) => {
      if (!live) return;
      // Resolve a stale role route before rendering after a shared-device
      // bootstrap. Otherwise a session can briefly open a different role's
      // fallback (or an empty page) instead of its own home screen. The
      // resolver preserves routes that already belong to the active role.
      if (nextSession) applySessionEntryRoute(nextSession, staffEntryPath);
      setSession(nextSession);
      setRouteReady(true);
    }).catch((caught: unknown) => {
      if (!live) return;
      if (isUnauthenticatedSessionError(caught)) {
        setSession(null);
        setRouteReady(true);
        return;
      }
      // A failed session probe is not an unauthenticated session. Keep the
      // entry screen hidden so a degraded API cannot look like a logout.
      setSession(undefined);
      setRouteReady(false);
      setBootstrapError(true);
    });
    return () => { live = false; };
  }, [bootstrapAttempt, staffEntryPath]);
  useEffect(() => {
    if (session === undefined) return;
    let live = true;
    let loading = false;
    const themeOwner = session?.user.id ?? null;
    const syncOrganisationExperience = async () => {
      if (loading) return;
      loading = true;
      try {
        const signal = AbortSignal.timeout(4000);
        if (session && session.accountStatus !== "disabled") {
          const experience = await sharedApiClient.getOrganisationExperience(signal);
          if (!live) return;
          setTheme(experience.theme);
          setMusicAllowed(experience.backgroundMusic.enabled);
          setMusicConfig(experience.backgroundMusic);
        } else {
          const { theme } = await sharedApiClient.getPublicOrganisationTheme(signal);
          if (live) setTheme(theme);
        }
      } catch {
        // A transient sync failure must not replace the last usable theme or
        // the device's personal audio preferences.
      } finally {
        loading = false;
        if (live) setThemeReadyFor(themeOwner);
      }
    };
    const syncWhenActive = () => {
      if (document.visibilityState !== "hidden") void syncOrganisationExperience();
    };
    void syncOrganisationExperience();
    const stream = !session || session.accountStatus === "disabled" || typeof EventSource === "undefined" ? undefined : new EventSource(apiUrl("/api/v1/organisation-experience/events"), { withCredentials: true });
    const applyPushedExperience = (event: Event) => {
      try {
        const experience = JSON.parse((event as MessageEvent<string>).data) as { theme: Parameters<typeof setTheme>[0]; backgroundMusic: OrganisationBackgroundMusicView };
        if (!live) return;
        setTheme(experience.theme);
        setMusicAllowed(experience.backgroundMusic.enabled);
        setMusicConfig(experience.backgroundMusic);
      } catch {
        // Ignore malformed events; focus and interval sync remain available.
      }
    };
    stream?.addEventListener("experience", applyPushedExperience);
    const interval = window.setInterval(syncWhenActive, 30_000);
    window.addEventListener("focus", syncWhenActive);
    window.addEventListener("online", syncWhenActive);
    document.addEventListener("visibilitychange", syncWhenActive);
    return () => {
      live = false;
      stream?.close();
      window.clearInterval(interval);
      window.removeEventListener("focus", syncWhenActive);
      window.removeEventListener("online", syncWhenActive);
      document.removeEventListener("visibilitychange", syncWhenActive);
    };
  }, [session, setTheme]);
  useEffect(() => {
    if (session?.role !== "learner" || session.accountStatus === "disabled") { setProfileRecord(undefined); setLearnerCefr(undefined); setAvatarOpen(false); return; }
    void import("../api/learner.js").then(({ learnerApiClient }) => {
      void learnerApiClient.getProfile().then(setProfileRecord).catch(() => setProfileRecord(undefined));
      void learnerApiClient.getProgress().then((progress) => setLearnerCefr(progress.learner.cefr ?? undefined)).catch(() => setLearnerCefr(undefined));
    });
  }, [session]);
  if (bootstrapError) return <AppStatus tone="error" onRetry={() => { setBootstrapError(false); setSession(undefined); setRouteReady(false); setBootstrapAttempt((attempt) => attempt + 1); }}>E4S hiện chưa thể kết nối. Kiểm tra mạng hoặc máy chủ rồi thử lại.</AppStatus>;
  if (session === undefined || !routeReady || themeReadyFor !== (session?.user.id ?? null)) return <AppStatus>Đang mở E4S…</AppStatus>;
  if (!session) return <ExperienceProvider musicAllowed={musicAllowed} musicConfig={musicConfig} musicTheme={resolvedTheme}><EntryScreen client={sharedApiClient} staffEntryPath={staffEntryPath} separateStaffEntry={separateStaffEntry} onAuthenticated={(nextSession) => { applySessionEntryRoute(nextSession, staffEntryPath); announceAuthChange(); setRouteReady(true); setSession(nextSession); }} /></ExperienceProvider>;
  if (!isSupportedSessionRole(session.role)) return <AppStatus>Không thể mở tài khoản này. Vui lòng đăng nhập lại.</AppStatus>;
  const clearSession = () => {
    announceAuthChange();
    if (session.role !== "learner" && separateStaffEntry && staffReturnPath && /^(?:\/[a-z0-9-]+)+$/.test(staffReturnPath)) {
      window.location.replace(staffReturnPath);
      return;
    }
    setRouteReady(true);
    setSession(null);
  };
  const logout = async () => {
    try {
      await sharedApiClient.logout();
      clearSession();
    } catch {
      showToast({ message: "Không đăng xuất được. Vui lòng thử lại.", tone: "danger" });
    }
  };
  if (session.role === "learner" && session.accountStatus === "disabled") {
    return <main className="app-status-page"><section className="app-status-card" aria-labelledby="locked-account-title">
      <h1 id="locked-account-title">Tài khoản đang bị khóa</h1>
      <p>Tài khoản của bạn đang tạm dừng. Bạn có thể gửi yêu cầu để Quản lý xem xét mở khóa.</p>
      <LockedLearnerSupport key={session.user.id} onLogout={() => void logout()} />
    </section></main>;
  }

  const saveAvatar = async (avatar: LearnerAvatarData) => {
    if (session.role === "learner") {
      if (!profileRecord) return;
      const { learnerApiClient } = await import("../api/learner.js");
      const saved = await learnerApiClient.saveProfile({ ...profileRecord.profile, avatar }, profileRecord.version);
      setProfileRecord(saved);
    } else {
      setSession(await sharedApiClient.saveSessionAvatar(avatar));
    }
    setAvatarOpen(false);
  };
  const avatar = session.role === "learner" ? profileRecord?.profile.avatar : session.user.avatar;
  const avatarReady = session.role !== "learner" || Boolean(profileRecord);
  const learnerProfileComplete = session.role !== "learner" || profileRecord?.completed === true;
  return <ExperienceProvider musicAllowed={musicAllowed} musicConfig={musicConfig} musicTheme={resolvedTheme}><BrowserRouter><RouteAudioStopper /><ModalProvider><AppShell session={session} avatar={avatar} onboardingComplete={learnerProfileComplete} learnerHomeOnly={session.role === "learner" && learnerCefr === undefined} {...(learnerCefr ? { learnerCefr } : {})} onAvatarClick={avatarReady ? () => setAvatarOpen(true) : undefined} onLogout={logout}>{sandboxMode ? <div role="status" data-sandbox-mode="true" className="banner info">Chế độ thử (sandbox): dữ liệu hồ sơ chỉ lưu trong trình duyệt này.</div> : null}{children ? children(session) : <RoleRoutes session={session} onSessionRevoked={clearSession} />}</AppShell>{avatarOpen && avatarReady ? <AvatarDialog initial={avatar} onClose={() => setAvatarOpen(false)} onSave={(nextAvatar) => void saveAvatar(nextAvatar)} /> : null}</ModalProvider></BrowserRouter></ExperienceProvider>;
}

export function RouteAudioStopper() {
  const location = useLocation();
  const previousRoute = useRef(`${location.pathname}${location.search}`);
  useEffect(() => {
    const route = `${location.pathname}${location.search}`;
    if (previousRoute.current === route) return;
    previousRoute.current = route;
    cancelAllExclusiveAudio();
    window.speechSynthesis?.cancel();
    document.querySelectorAll("audio").forEach((audio) => {
      audio.pause();
      audio.currentTime = 0;
    });
  }, [location.pathname, location.search]);
  return null;
}

function announceAuthChange() {
  try { window.localStorage.setItem(authChangeStorageKey, `${Date.now()}:${crypto.randomUUID()}`); }
  catch { /* Cross-tab sync is optional when storage is blocked. */ }
}

function isUnauthenticatedSessionError(error: unknown): error is ApiError {
  return error instanceof ApiError && (error.status === 401 || error.code === "UNAUTHENTICATED");
}

export function AppStatus({ children, tone = "loading", onRetry }: { children: ReactNode; tone?: "loading" | "error"; onRetry?: () => void }) {
  if (tone === "loading") {
    return <main className="app-status-page app-status-page--loading"><section className="app-status-card" role="status"><span className="spinner" aria-hidden="true" /><p>{children}</p></section></main>;
  }
  return <main className="app-status-page app-status-page--error">
    <section className="app-status-card" role="alert" aria-labelledby="app-status-title">
      <div className="app-status-mark" aria-hidden="true"><SeasonMark className="app-status-season-mark" /><WifiOff className="app-status-offline-icon" /></div>
      <p className="app-status-eyebrow">Kết nối bị gián đoạn</p>
      <h1 id="app-status-title">Chưa thể mở E4S</h1>
      <p className="app-status-message">{children}</p>
      <p className="app-status-note">Bạn có thể kiểm tra kết nối mạng rồi thử lại. Dữ liệu đã lưu trên hệ thống không bị ảnh hưởng.</p>
      {onRetry ? <button className="btn-primary app-status-retry" type="button" onClick={onRetry}><RefreshCw size={18} aria-hidden="true" />Thử kết nối lại</button> : null}
    </section>
  </main>;
}

/**
 * A session can be opened while the browser still points at the previous
 * role's route (for example, a learner session at /mgr after a shared-device
 * sign-in). Resolve that stale entry before mounting the role router so the
 * first visible screen is always the account's own home screen.
 */
export function resolveSessionEntryPath(role: SessionView["role"], pathname: string): string {
  const current = normalizePathname(pathname);
  if (role === "learner") {
    return isLearnerPath(current) || current === "/reward/preview" ? current : "/home";
  }
  const isPublicEntry = ["/", "/login", "/register", "/forgot-pin"].includes(current);
  if (role === "operator") {
    return isPublicEntry || current === "/home" || isLearnerPath(current) || isManagerPath(current) ? "/op" : current;
  }
  return isPublicEntry || current === "/home" || isLearnerPath(current) ? "/mgr" : current;
}

function applySessionEntryRoute(nextSession: SessionView, staffEntryPath: string | null): void {
  const current = normalizePathname(window.location.pathname);
  const isStaffEntry = staffEntryPath && (current === staffEntryPath || current === staffEntryPath + "/forgot-password");
  const target = resolveSessionEntryPath(nextSession.role, isStaffEntry ? "/" : current);
  if (target !== current) window.history.replaceState(window.history.state, "", `${target}${window.location.search}${window.location.hash}`);
}

function normalizePathname(pathname: string): string {
  const normalized = pathname.replace(/\/+$/, "");
  return normalized || "/";
}

function isStaffOnlyPath(pathname: string): boolean {
  return isRouteOrChild(pathname, "/op") || isRouteOrChild(pathname, "/mgr") || isRouteOrChild(pathname, "/settings");
}

function isManagerPath(pathname: string): boolean {
  return isRouteOrChild(pathname, "/mgr") || pathname === "/reward/preview";
}

function isLearnerPath(pathname: string): boolean {
  return ["/home", "/onboard", "/coach", "/monthly", "/challenge", "/practice", "/survey", "/support", "/profile", "/games", "/lesson", "/test"].some((route) => isRouteOrChild(pathname, route)) || isRouteOrChild(pathname, "/reward/done") || pathname === "/reward/course";
}

function isRouteOrChild(pathname: string, route: string): boolean {
  return pathname === route || pathname.startsWith(`${route}/`);
}

function isSupportedSessionRole(role: unknown): role is SessionView["role"] {
  return role === "learner" || role === "operator" || role === "manager";
}
