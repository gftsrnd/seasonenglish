import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from "react";
import type { SessionView } from "@e4s/contracts";
import type { AuthClient } from "../../features/auth/index.js";
import { AudioControls, SeasonMark } from "./AppShell.js";

export function EntryScreen({ client, onAuthenticated }: { client: AuthClient; onAuthenticated: (session: SessionView) => void }) {
  const loginPanelId = "app-login-panel";
  const emailId = "app-login-email";
  const passwordId = "app-login-password";
  const displayNameId = "app-register-display-name";
  const confirmPasswordId = "app-register-confirm-password";
  const errorId = "app-login-error";
  const [audience, setAudience] = useState<"learner" | "staff">("learner");
  const [mode, setMode] = useState<"login" | "register">(() => window.location.pathname === "/register" ? "register" : "login");
  const [displayName, setDisplayName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [pendingAction, setPendingAction] = useState<"login" | "register" | null>(null);
  const [error, setError] = useState("");
  const learnerTab = useRef<HTMLButtonElement>(null);
  const staffTab = useRef<HTMLButtonElement>(null);
  const emailInput = useRef<HTMLInputElement>(null);
  const errorRef = useRef<HTMLDivElement>(null);
  const busy = pendingAction !== null;

  useEffect(() => {
    const onPopState = () => setMode(window.location.pathname === "/register" ? "register" : "login");
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, []);

  const navigateEntry = (next: "login" | "register") => {
    const path = next === "register" ? "/register" : "/";
    window.history.pushState(window.history.state, "", path);
    setMode(next);
    setDisplayName("");
    setEmail("");
    setPassword("");
    setConfirmPassword("");
    setError("");
  };

  const switchAudience = (next: "learner" | "staff") => {
    if (next === audience || busy) return;
    setAudience(next);
    navigateEntry("login");
    emailInput.current?.focus();
  };

  useEffect(() => {
    if (error) errorRef.current?.focus();
  }, [error]);

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault(); setError("");
    if (mode === "register" && password !== confirmPassword) {
      setError("Mật khẩu xác nhận chưa khớp.");
      return;
    }
    setPendingAction(mode);
    try {
      const session = mode === "register"
        ? await client.registerLearner({ displayName, email, password })
        : await (audience === "learner" ? client.learnerLogin({ email, password }) : client.staffLogin({ email, password }));
      if (mode === "register") window.history.replaceState(window.history.state, "", "/onboard");
      onAuthenticated(session);
    } catch (caught) {
      const code = caught instanceof Error ? caught.message : "";
      setError(mode === "register" ? registrationError(code) : "Không thể đăng nhập. Vui lòng kiểm tra email và mật khẩu.");
    }
    finally { setPendingAction(null); }
  };
  const navigateAudience = (event: KeyboardEvent<HTMLButtonElement>) => {
    const next = event.key === "Home" ? "learner" : event.key === "End" ? "staff" : event.key === "ArrowLeft" || event.key === "ArrowRight" ? (audience === "learner" ? "staff" : "learner") : null;
    if (!next) return;
    event.preventDefault(); setAudience(next); navigateEntry("login");
    (next === "learner" ? learnerTab : staffTab).current?.focus();
  };

  const showRegistration = () => navigateEntry("register");
  const showLogin = () => navigateEntry("login");

  return <>
    <header className="topbar app-entry-topbar">
      <span className="brand"><span className="avatar" style={{ width: 34, height: 34, background: "var(--primary-soft)", display: "inline-grid", placeItems: "center" }}><SeasonMark className="app-brand-mark" /></span><span>Season English <span className="muted" style={{ fontWeight: 400, fontSize: ".85rem" }}>· GFT</span></span></span>
      <div className="userchip"><AudioControls /></div>
    </header>
    <main className="app-entry-main">
      <section className="welcome app-entry">
        <div className="body">
          <div className="eyebrow">E4S · English for Every Season</div>
          <h1>Học tiếng Anh cho công việc</h1>
          <p>Học ngắn mỗi ngày, luyện tình huống thực tế và nhận phản hồi để làm tốt hơn ở lần tiếp theo.</p>
        </div>
        <div className="card app-entry-card" aria-label={mode === "register" ? "Đăng ký E4S" : "Đăng nhập E4S"} aria-busy={busy || undefined}>
          {mode === "login" ? <div className="tabs" role="tablist" aria-label="Loại tài khoản" aria-orientation="horizontal">
            <button ref={learnerTab} id="app-login-learner-tab" className={audience === "learner" ? "active" : ""} type="button" role="tab" aria-controls={loginPanelId} aria-selected={audience === "learner"} tabIndex={audience === "learner" ? 0 : -1} disabled={busy} onKeyDown={navigateAudience} onClick={() => switchAudience("learner")}>Người học</button>
            <button ref={staffTab} id="app-login-staff-tab" className={audience === "staff" ? "active" : ""} type="button" role="tab" aria-controls={loginPanelId} aria-selected={audience === "staff"} tabIndex={audience === "staff" ? 0 : -1} disabled={busy} onKeyDown={navigateAudience} onClick={() => switchAudience("staff")}>Nhân sự</button>
          </div> : <div id="app-register-heading" className="app-register-heading"><div className="eyebrow">Tài khoản mới · Không cần mã tổ chức</div><h2>Đăng ký người học</h2><p className="small muted">Tạo tài khoản miễn phí để điền hồ sơ và bắt đầu học.</p></div>}
          <form id={loginPanelId} className="stack section" role="tabpanel" tabIndex={0} aria-labelledby={mode === "register" ? "app-register-heading" : `app-login-${audience}-tab`} aria-busy={busy || undefined} aria-describedby={error ? errorId : undefined} onSubmit={submit}>
            {mode === "register" ? <label className="field" htmlFor={displayNameId}><span>Họ và tên</span><input id={displayNameId} name="displayName" autoComplete="name" minLength={2} maxLength={120} required disabled={busy} value={displayName} onChange={(event) => setDisplayName(event.target.value)} /></label> : null}
            <label className="field" htmlFor={emailId}><span>Email</span><input ref={emailInput} id={emailId} name="email" type="email" autoComplete="username" required disabled={busy} value={email} aria-invalid={Boolean(error)} aria-describedby={error ? errorId : undefined} onChange={(event) => setEmail(event.target.value)} /></label>
            <label className="field" htmlFor={passwordId}><span>Mật khẩu</span><input id={passwordId} name="password" type="password" autoComplete={mode === "register" ? "new-password" : "current-password"} minLength={mode === "register" ? 8 : undefined} required disabled={busy} value={password} aria-invalid={Boolean(error)} aria-describedby={error ? errorId : undefined} onChange={(event) => setPassword(event.target.value)} /></label>
            {mode === "register" ? <label className="field" htmlFor={confirmPasswordId}><span>Xác nhận mật khẩu</span><input id={confirmPasswordId} name="confirmPassword" type="password" autoComplete="new-password" minLength={8} required disabled={busy} value={confirmPassword} aria-invalid={Boolean(error)} aria-describedby={error ? errorId : undefined} onChange={(event) => setConfirmPassword(event.target.value)} /></label> : null}
            {error ? <div ref={errorRef} id={errorId} className="banner danger" role="alert" tabIndex={-1}><div className="body small">{error}</div></div> : null}
            <button className="btn-primary btn-block" type="submit" disabled={busy} aria-busy={busy || undefined}>{pendingAction === "register" ? "Đang tạo tài khoản…" : pendingAction === "login" ? "Đang đăng nhập…" : mode === "register" ? "Đăng ký và bắt đầu" : audience === "learner" ? "Đăng nhập người học" : "Đăng nhập nhân sự"}</button>
            {mode === "register" ? <button className="btn-ghost btn-block" type="button" disabled={busy} onClick={showLogin}>Đã có tài khoản? Đăng nhập</button> : audience === "learner" ? <button className="btn-ghost btn-block" type="button" disabled={busy} onClick={showRegistration}>Tạo tài khoản người học</button> : null}
          </form>
        </div>
      </section>
    </main>
  </>;
}

function registrationError(code: string): string {
  if (code === "LEARNER_REGISTRATION_EMAIL_EXISTS") return "Email này đã có tài khoản. Hãy đăng nhập hoặc dùng email khác.";
  if (code === "LEARNER_REGISTRATION_UNAVAILABLE") return "Hiện chưa thể đăng ký. Vui lòng liên hệ quản lý chương trình.";
  return "Không thể tạo tài khoản. Vui lòng kiểm tra thông tin và thử lại.";
}
