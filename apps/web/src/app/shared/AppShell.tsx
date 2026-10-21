import { useEffect, useRef, useState, type ReactNode } from "react";
import { Link, useLocation } from "react-router";
import { Bell, BookOpen, CalendarDays, ChartColumn, Check, FileText, Gamepad2, House, LogOut, MessageSquare, Music2, Pencil, Search, Settings, UserRound, Volume2 } from "lucide-react";
import type { AccountRole, SessionView } from "@e4s/contracts";
import { SeasonMark } from "./SeasonMark.js";
import { AvatarMark } from "../learner/ProfileReward.js";
import { useExperience } from "../../features/experience/Experience.js";
import "./shared.css";

export { SeasonMark } from "./SeasonMark.js";

type ShellRole = Extract<AccountRole, "learner" | "operator" | "manager">;

type NavItem = {
  readonly to: string;
  readonly label: string;
  readonly icon: ReactNode;
};

const navIconProps = { width: 24, height: 24, strokeWidth: 2.5, "aria-hidden": true } as const;
// The gamepad has a compact silhouette, but it still needs the same visual
// weight as the other bottom-nav icons. Keeping it just a little smaller than
// the 24px navigation marks prevents the controls from looking misaligned.
const compactNavIconProps = { width: 22, height: 22, strokeWidth: 2.35, "aria-hidden": true } as const;
const checkIconProps = { width: 18, height: 18, strokeWidth: 3, "aria-hidden": true } as const;
const audioIconProps = { width: 18, height: 18, strokeWidth: 1.7, "aria-hidden": true } as const;
const visuallyHiddenStyle = {
  position: "absolute",
  width: 1,
  height: 1,
  padding: 0,
  margin: -1,
  overflow: "hidden",
  clip: "rect(0, 0, 0, 0)",
  whiteSpace: "nowrap",
  border: 0
} as const;

const roleNames: Record<ShellRole, string> = {
  learner: "Người học",
  operator: "Người vận hành",
  manager: "Quản lý"
};

const icons = {
  home: <House {...navIconProps} />,
  chat: <MessageSquare {...navIconProps} />,
  pen: <Pencil {...navIconProps} />,
  game: <Gamepad2 {...compactNavIconProps} />,
  user: <UserRound {...navIconProps} />,
  check: <Check {...checkIconProps} />,
  cal: <CalendarDays {...navIconProps} />,
  book: <BookOpen {...navIconProps} />,
  search: <Search {...navIconProps} />,
  cog: <Settings {...navIconProps} />,
  bars: <ChartColumn {...navIconProps} />,
  bell: <Bell {...navIconProps} />,
  doc: <FileText {...navIconProps} />
} as const;

const nav: Record<ShellRole, readonly NavItem[]> = {
  learner: [
    { to: "/home", icon: icons.home, label: "Trang chủ" },
    { to: "/coach", icon: icons.chat, label: "Luyện với Season" },
    { to: "/practice", icon: icons.pen, label: "Bài tuần" },
    { to: "/games", icon: icons.game, label: "Mini game" },
    { to: "/profile", icon: icons.user, label: "Tiến độ & hồ sơ" }
  ],
  operator: [
    { to: "/op", icon: icons.check, label: "Duyệt mức" },
    { to: "/op/weeks", icon: icons.cal, label: "Chủ đề" },
    { to: "/op/lessons", icon: icons.book, label: "Bài học" },
    { to: "/op/review", icon: icons.search, label: "Đọc mẫu" },
    { to: "/settings", icon: icons.cog, label: "Cài đặt" }
  ],
  manager: [
    { to: "/mgr", icon: icons.bars, label: "Tiến độ" },
    { to: "/mgr/ops", icon: icons.check, label: "Vận hành" },
    { to: "/mgr/reminders", icon: icons.bell, label: "Nhắc học" },
    { to: "/mgr/report", icon: icons.doc, label: "Báo cáo" },
    { to: "/settings", icon: icons.cog, label: "Cài đặt" }
  ]
};

export function AppShell({ session, children, onLogout, onAvatarClick, organisationName = "GFT", avatar, onboardingComplete = true, learnerHomeOnly = false }: {
  session: SessionView;
  children: ReactNode;
  onLogout: () => void | Promise<void>;
  onAvatarClick?: (() => void) | undefined;
  organisationName?: string;
  avatar?: { color?: string; acc?: string; bg?: number } | undefined;
  onboardingComplete?: boolean;
  learnerHomeOnly?: boolean;
  }) {
  const location = useLocation();
  const role = session.role as ShellRole;
  const items = role === "learner" && (onboardingComplete === false || learnerHomeOnly) ? nav[role].slice(0, 1) : nav[role];
  const [logoutPending, setLogoutPending] = useState(false);
  const logoutTimer = useRef<number | undefined>(undefined);
  useEffect(() => () => {
    if (logoutTimer.current !== undefined) window.clearTimeout(logoutTimer.current);
  }, []);

  const matchesPath = (path: string, to: string) => path === to || path.startsWith(`${to}/`);
  const active = (to: string) => {
    if (to === "/home") return location.pathname === "/home" || location.pathname.startsWith("/lesson") || location.pathname.startsWith("/test");
    if (role === "operator" && to === "/op") {
      return location.pathname === "/op" || (location.pathname.startsWith("/op/") && !items.some((item) => item.to !== "/op" && matchesPath(location.pathname, item.to)));
    }
    if (role === "manager" && to === "/mgr") {
      return location.pathname === "/mgr" || (location.pathname.startsWith("/mgr/") && !items.some((item) => item.to !== "/mgr" && matchesPath(location.pathname, item.to)));
    }
    if (to === "/op" || to === "/mgr") return location.pathname === to;
    if (to === "/mgr/ops") return location.pathname.startsWith(to);
    return location.pathname.startsWith(to);
  };
  const links = (mobile = false) => items.map((item) => <Link className={active(item.to) ? "active" : ""} key={item.to} to={item.to} aria-current={active(item.to) ? "page" : undefined}>{mobile ? <span className="ico">{item.icon}</span> : null}{item.label}</Link>);
  const logout = () => {
    if (logoutPending) return;
    setLogoutPending(true);
    clearSharedDeviceState();
    // App removes BrowserRouter when the session becomes null. Keep
    // the browser URL at the entry route without letting the still-authenticated
    // role router immediately redirect it back to its home screen.
    window.history.replaceState(window.history.state, "", "/");
    try {
      const result = onLogout();
      if (result && typeof result.then === "function") {
        void result.finally(() => setLogoutPending(false));
      } else {
        logoutTimer.current = window.setTimeout(() => setLogoutPending(false), 8000);
      }
    } catch {
      setLogoutPending(false);
    }
  };
  return <>
    <header className="topbar">
      <Link className="brand" style={{ color: "inherit", textDecoration: "none" }} to={role === "learner" ? "/home" : role === "operator" ? "/op" : "/mgr"}>
        <span className="avatar" style={{ width: 34, height: 34, background: "var(--primary-soft)", display: "inline-grid", placeItems: "center", flexShrink: 0 }}><SeasonMark className="app-brand-mark" /></span>
        <span>Season English <span className="muted" style={{ fontWeight: 400, fontSize: ".85rem" }}>· {organisationName}</span></span>
      </Link>
      <nav aria-label={role === "learner" ? "Điều hướng người học" : role === "operator" ? "Điều hướng người vận hành" : "Điều hướng quản lý"}>{links()}</nav>
      <div className="userchip" aria-busy={logoutPending || undefined}>
        <AudioControls />
        <button className="btn-ghost" type="button" aria-label="Đổi avatar" title="Đổi avatar" disabled={!onAvatarClick} onClick={onAvatarClick} style={{ padding: 0, border: 0, background: "transparent" }}><AccountAvatar name={session.user.displayName} avatar={avatar} size={32} /></button>
        <span className="small"><b>{session.user.displayName}</b> <span className="muted">· {roleNames[role]}</span></span>
        <button className="btn-sm btn-ghost" type="button" data-action="logout" onClick={logout} disabled={logoutPending} title={logoutPending ? "Đang đăng xuất…" : "Đăng xuất khỏi tài khoản này"} aria-label={logoutPending ? "Đang đăng xuất…" : "Đăng xuất khỏi tài khoản này"}>{logoutPending ? <span className="logout-label">Đang đăng xuất…</span> : <><LogOut size={16} strokeWidth={2} aria-hidden="true" /><span className="logout-label">Đăng xuất</span></>}</button>
        <span role="status" aria-label="Trạng thái đăng xuất" aria-live="polite" style={visuallyHiddenStyle}>{logoutPending ? "Đang đăng xuất…" : ""}</span>
      </div>
    </header>
    <main>{children}</main>
    <nav className="bottomnav" aria-label="Điều hướng trên thiết bị di động">{links(true)}</nav>
    <div id="toast" />
    <div id="saved" aria-live="polite">✓ Đã lưu</div>
  </>;
}

function clearSharedDeviceState() {
  for (const storage of [window.localStorage, window.sessionStorage]) {
    try {
      for (let index = storage.length - 1; index >= 0; index -= 1) {
        const key = storage.key(index);
        if (key?.startsWith("e4s:")) storage.removeItem(key);
      }
    } catch {
      // Storage can be unavailable in privacy mode; logout still proceeds.
    }
  }
  document.body.classList.remove("app-modal-open");
}

export function AudioControls() {
  const { effectsOn: sfx, musicOn: bgm, musicAllowed, toggleEffects, toggleMusic } = useExperience();
  const [feedback, setFeedback] = useState("");
  return <span className="audio-ctl row" style={{ gap: 4, flexWrap: "nowrap" }} role="group" aria-label="Âm thanh">
    <button className={`btn-sm btn-ghost ${sfx ? "on" : ""}`} type="button" onClick={() => { toggleEffects(); setFeedback(`Đã ${sfx ? "tắt" : "bật"} hiệu ứng âm thanh.`); }} title={`Hiệu ứng âm thanh: ${sfx ? "bật" : "tắt"}`} aria-label={`Hiệu ứng âm thanh: ${sfx ? "bật" : "tắt"}`} aria-pressed={sfx}><Volume2 {...audioIconProps} /></button>
    <button className={`btn-sm btn-ghost ${bgm ? "on" : ""}`} type="button" onClick={() => { toggleMusic(); setFeedback(`Đã ${bgm ? "tắt" : "bật"} nhạc nền.`); }} disabled={!musicAllowed} title={!musicAllowed ? "Nhạc nền đã bị tắt bởi quản lý" : `Nhạc nền: ${bgm ? "bật" : "tắt"}`} aria-label={`Nhạc nền: ${bgm ? "bật" : "tắt"}`} aria-pressed={bgm}><Music2 {...audioIconProps} /></button>
    <span role="status" aria-label="Phản hồi âm thanh" aria-live="polite" style={visuallyHiddenStyle}>{feedback}</span>
  </span>;
}

function AccountAvatar({ name, avatar, size }: { name: string; avatar?: { color?: string; acc?: string; bg?: number } | undefined; size: number }) {
  const initials = name.trim().split(/\s+/).slice(-2).map((word) => word[0]).join("").toUpperCase();
  const backgrounds = ["#FBB829", "#F6D3CB", "#E3DCFB", "#DCE8C8", "#FFF4D9", "#D6CCBF"];
  const colors: Record<string, string> = { ink: "#1E1E1E", brown: "#6E3B32", olive: "#4B6120", taupe: "#7A7064", orange: "#F28C28", rose: "#B4374B" };
  const mark = avatar?.acc && avatar.acc !== "none" ? avatar.acc as "leaf" | "sun" | "flower" | "cloud" | "star" | "drop" | "snow" : null;
  return <span className="avatar" style={{ width: size, height: size, background: backgrounds[avatar?.bg ?? 0] ?? backgrounds[0], color: colors[avatar?.color ?? "ink"] ?? colors.ink, display: "inline-grid", placeItems: "center", fontSize: Math.max(10, Math.round(size * .36)) }}>{mark ? <AvatarMark acc={mark} size={Math.round(size * .65)} /> : initials || "?"}</span>;
}
