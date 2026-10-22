import { useEffect, useState, type ReactNode } from "react";
import { BrowserRouter } from "react-router";
import type { LearnerAvatarData, LearnerProfileView, OrganisationBackgroundMusicView, SessionView } from "@e4s/contracts";
import { sharedApiClient } from "../api/shared.js";
import { ApiError } from "../api/runtime.js";
import { ExperienceProvider } from "../features/experience/Experience.js";
import { EntryScreen } from "./shared/EntryScreen.js";
import { AppShell } from "./shared/AppShell.js";
import { ModalProvider } from "./shared/ModalProvider.js";
import { ToastProvider } from "./shared/design-system.js";
import { useToast } from "./shared/design-system.js";
import { ThemeProvider, useTheme } from "./shared/ThemeProvider.js";
import { RoleRoutes } from "./RoleRoutes.js";
import { AvatarDialog } from "./learner/ProfileReward.js";
import "./app-layout.css";

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
  const [routeReady, setRouteReady] = useState(false);
  const [bootstrapError, setBootstrapError] = useState(false);
  const [bootstrapAttempt, setBootstrapAttempt] = useState(0);
  const [profileRecord, setProfileRecord] = useState<LearnerProfileView>();
  const [avatarOpen, setAvatarOpen] = useState(false);
  const [musicAllowed, setMusicAllowed] = useState(true);
  const [musicConfig, setMusicConfig] = useState<OrganisationBackgroundMusicView>({ enabled: true, playlistId: "auto", customUrl: "", volume: 22 });
  const [sandboxMode, setSandboxMode] = useState(() => typeof window !== "undefined" && (new URL(window.location.href).searchParams.get("sandbox") === "1" || window.sessionStorage.getItem("e4s:sandbox:active") === "1"));
  useEffect(() => {
    if (!sandboxMode || typeof window === "undefined") return;
    window.sessionStorage.setItem("e4s:sandbox:active", "1");
  }, [sandboxMode]);
  useEffect(() => {
    let live = true;
    void sharedApiClient.currentSession().then((nextSession) => {
      if (!live) return;
      // Resolve a stale role route before rendering after a shared-device
      // bootstrap. Otherwise a session can briefly open a different role's
      // fallback (or an empty page) instead of its own home screen. The
      // resolver preserves routes that already belong to the active role.
      if (nextSession) applySessionEntryRoute(nextSession);
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
  }, [bootstrapAttempt]);
  useEffect(() => {
    if (!session) return;
    void sharedApiClient.getOrganisationExperience().then((experience) => {
      setTheme(experience.theme);
      setMusicAllowed(experience.backgroundMusic.enabled);
      setMusicConfig(experience.backgroundMusic);
    }).catch(() => { /* Keep device preferences when organisation experience is unavailable. */ });
  }, [session, setTheme]);
  useEffect(() => {
    if (session?.role !== "learner") { setProfileRecord(undefined); setAvatarOpen(false); return; }
    void import("../api/learner.js").then(({ learnerApiClient }) => learnerApiClient.getProfile())
      .then(setProfileRecord).catch(() => setProfileRecord(undefined));
  }, [session]);
  if (bootstrapError) return <AppStatus tone="error" onRetry={() => { setBootstrapError(false); setSession(undefined); setRouteReady(false); setBootstrapAttempt((attempt) => attempt + 1); }}>E4S hiện chưa thể kết nối. Kiểm tra mạng hoặc máy chủ rồi thử lại.</AppStatus>;
  if (session === undefined || (session && !routeReady)) return <AppStatus>Đang mở E4S…</AppStatus>;
  if (!session) return <ExperienceProvider musicAllowed={musicAllowed} musicConfig={musicConfig} musicTheme={resolvedTheme}><EntryScreen client={sharedApiClient} onAuthenticated={(nextSession) => { applySessionEntryRoute(nextSession); setRouteReady(true); setSession(nextSession); }} /></ExperienceProvider>;
  if (!isSupportedSessionRole(session.role)) return <AppStatus>Không thể mở tài khoản này. Vui lòng đăng nhập lại.</AppStatus>;
  const logout = async () => {
    try {
      await sharedApiClient.logout();
      setRouteReady(true);
      setSession(null);
    } catch {
      showToast({ message: "Không đăng xuất được. Vui lòng thử lại.", tone: "danger" });
    }
  };
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
  return <ExperienceProvider musicAllowed={musicAllowed} musicConfig={musicConfig} musicTheme={resolvedTheme}><BrowserRouter><ModalProvider><AppShell session={session} avatar={avatar} onboardingComplete={learnerProfileComplete} onAvatarClick={avatarReady ? () => setAvatarOpen(true) : undefined} onLogout={logout}>{sandboxMode ? <div role="status" data-sandbox-mode="true" className="banner info">Chế độ thử (sandbox): dữ liệu hồ sơ chỉ lưu trong trình duyệt này.</div> : null}{children ? children(session) : <RoleRoutes session={session} />}</AppShell>{avatarOpen && avatarReady ? <AvatarDialog initial={avatar} onClose={() => setAvatarOpen(false)} onSave={(nextAvatar) => void saveAvatar(nextAvatar)} /> : null}</ModalProvider></BrowserRouter></ExperienceProvider>;
}

function isUnauthenticatedSessionError(error: unknown): error is ApiError {
  return error instanceof ApiError && (error.status === 401 || error.code === "UNAUTHENTICATED");
}

export function AppStatus({ children, tone = "loading", onRetry }: { children: ReactNode; tone?: "loading" | "error"; onRetry?: () => void }) {
  return <section className={`card${tone === "error" ? " danger" : ""}`} role={tone === "error" ? "alert" : "status"}><div className="row">{tone === "loading" ? <span className="spinner" aria-hidden="true" /> : null}<div><p>{children}</p>{onRetry ? <button className="btn-primary" type="button" onClick={onRetry}>Thử lại</button> : null}</div></div></section>;
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
    return isStaffOnlyPath(current) || current === "/register" ? "/home" : current === "/" ? "/home" : current;
  }
  if (role === "operator") {
    return current === "/" || current === "/register" || current === "/home" || isLearnerPath(current) || isManagerPath(current) ? "/op" : current;
  }
  return current === "/" || current === "/register" || current === "/home" || isLearnerPath(current) ? "/mgr" : current;
}

function applySessionEntryRoute(nextSession: SessionView): void {
  const current = normalizePathname(window.location.pathname);
  const target = resolveSessionEntryPath(nextSession.role, current);
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
  return ["/home", "/onboard", "/coach", "/challenge", "/practice", "/survey", "/profile", "/games", "/arena", "/lesson", "/micro", "/test", "/duel"].some((route) => isRouteOrChild(pathname, route)) || isRouteOrChild(pathname, "/reward/done");
}

function isRouteOrChild(pathname: string, route: string): boolean {
  return pathname === route || pathname.startsWith(`${route}/`);
}

function isSupportedSessionRole(role: unknown): role is SessionView["role"] {
  return role === "learner" || role === "operator" || role === "manager";
}
