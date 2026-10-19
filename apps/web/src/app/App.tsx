import { useEffect, useState, type ReactNode } from "react";
import { BrowserRouter } from "react-router";
import type { LearnerAvatarData, LearnerProfileView, SessionView } from "@e4s/contracts";
import { sharedApiClient } from "../api/shared.js";
import { ExperienceProvider } from "../features/experience/Experience.js";
import { EntryScreen } from "./shared/EntryScreen.js";
import { AppShell } from "./shared/AppShell.js";
import { ModalProvider } from "./shared/ModalProvider.js";
import { autoSeasonTheme } from "./games/season-visual.js";
import { RoleRoutes } from "./RoleRoutes.js";
import { AvatarDialog } from "./learner/ProfileReward.js";
import "./app-layout.css";

/**
 * New E4S presentation root. It intentionally owns authentication and the
 * app shell without importing any component from the superseded pages.
 */
export function App({ children }: { children?: (session: SessionView) => ReactNode }) {
  const [session, setSession] = useState<SessionView | null | undefined>(undefined);
  const [routeReady, setRouteReady] = useState(false);
  const [profileRecord, setProfileRecord] = useState<LearnerProfileView>();
  const [avatarOpen, setAvatarOpen] = useState(false);
  const [musicAllowed, setMusicAllowed] = useState(true);
  const [logoutError, setLogoutError] = useState("");
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
    }).catch(() => {
      if (!live) return;
      setSession(null);
      setRouteReady(true);
    });
    return () => { live = false; };
  }, []);
  useEffect(() => {
    if (!session) {
      document.documentElement.dataset.theme = autoSeasonTheme();
      return;
    }
    void sharedApiClient.getProductPreferences().then((preferences) => {
      document.documentElement.dataset.theme = preferences.theme === "auto" ? autoSeasonTheme() : preferences.theme;
    }).catch(() => { document.documentElement.dataset.theme = autoSeasonTheme(); });
  }, [session]);
  useEffect(() => {
    if (session?.role !== "manager") { setMusicAllowed(true); return; }
    void import("../api/manager.js").then(({ managerApiClient }) => managerApiClient.getManagerSettings())
      .then((settings) => setMusicAllowed(settings.backgroundMusic.enabled))
      .catch(() => setMusicAllowed(true));
  }, [session]);
  useEffect(() => {
    if (session?.role !== "learner") { setProfileRecord(undefined); setAvatarOpen(false); return; }
    void import("../api/learner.js").then(({ learnerApiClient }) => learnerApiClient.getProfile())
      .then(setProfileRecord).catch(() => setProfileRecord(undefined));
  }, [session]);
  if (session === undefined || (session && !routeReady)) return <AppStatus>Đang mở E4S…</AppStatus>;
  if (!session) return <ExperienceProvider musicAllowed={musicAllowed}><EntryScreen client={sharedApiClient} onAuthenticated={(nextSession) => { applySessionEntryRoute(nextSession); setRouteReady(true); setSession(nextSession); }} /></ExperienceProvider>;
  if (!isSupportedSessionRole(session.role)) return <AppStatus>Không thể mở tài khoản này. Vui lòng đăng nhập lại.</AppStatus>;
  const logout = () => {
    setLogoutError("");
    void sharedApiClient.logout().then(() => { setRouteReady(true); setSession(null); }).catch(() => setLogoutError("Không đăng xuất được. Vui lòng thử lại."));
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
  return <ExperienceProvider musicAllowed={musicAllowed}><BrowserRouter><ModalProvider><AppShell session={session} avatar={avatar} onAvatarClick={avatarReady ? () => setAvatarOpen(true) : undefined} onLogout={logout}>{logoutError ? <div className="banner danger" role="alert"><div className="body small">{logoutError}</div></div> : null}{children ? children(session) : <RoleRoutes session={session} />}</AppShell>{avatarOpen && avatarReady ? <AvatarDialog initial={avatar} onClose={() => setAvatarOpen(false)} onSave={(nextAvatar) => void saveAvatar(nextAvatar)} /> : null}</ModalProvider></BrowserRouter></ExperienceProvider>;
}

export function AppStatus({ children }: { children: ReactNode }) {
  return <section className="card" role="status"><div className="row"><span className="spinner" aria-hidden="true" /><p>{children}</p></div></section>;
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
  if (target !== current) window.history.replaceState(window.history.state, "", target);
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
