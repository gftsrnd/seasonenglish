import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from "react";
import type { SessionView } from "@e4s/contracts";
import type { AuthClient } from "../../features/auth/index.js";
import { AudioControls, SeasonMark } from "./PrototypeShell.js";

export function PrototypeEntry({ client, onAuthenticated }: { client: AuthClient; onAuthenticated: (session: SessionView) => void }) {
  const loginPanelId = "prototype-login-panel";
  const emailId = "prototype-login-email";
  const passwordId = "prototype-login-password";
  const errorId = "prototype-login-error";
  const [audience, setAudience] = useState<"learner" | "staff">("learner");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [pendingAction, setPendingAction] = useState<"login" | null>(null);
  const [error, setError] = useState("");
  const learnerTab = useRef<HTMLButtonElement>(null);
  const staffTab = useRef<HTMLButtonElement>(null);
  const emailInput = useRef<HTMLInputElement>(null);
  const errorRef = useRef<HTMLDivElement>(null);
  const busy = pendingAction !== null;

  const switchAudience = (next: "learner" | "staff") => {
    if (next === audience || busy) return;
    setAudience(next);
    setEmail("");
    setPassword("");
    setError("");
    emailInput.current?.focus();
  };

  useEffect(() => {
    if (error) errorRef.current?.focus();
  }, [error]);

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault(); setPendingAction("login"); setError("");
    try {
      const session = await (audience === "learner" ? client.learnerLogin({ email, password }) : client.staffLogin({ email, password }));
      onAuthenticated(session);
    } catch { setError("Không thể đăng nhập. Vui lòng kiểm tra email và mật khẩu."); }
    finally { setPendingAction(null); }
  };
  const navigateAudience = (event: KeyboardEvent<HTMLButtonElement>) => {
    const next = event.key === "Home" ? "learner" : event.key === "End" ? "staff" : event.key === "ArrowLeft" || event.key === "ArrowRight" ? (audience === "learner" ? "staff" : "learner") : null;
    if (!next) return;
    event.preventDefault(); setAudience(next); setEmail(""); setPassword(""); setError("");
    (next === "learner" ? learnerTab : staffTab).current?.focus();
  };

  return <>
    <header className="topbar prototype-entry-topbar">
      <span className="brand"><span className="avatar" style={{ width: 34, height: 34, background: "var(--primary-soft)", display: "inline-grid", placeItems: "center" }}><SeasonMark className="prototype-brand-mark" /></span><span>Season English <span className="muted" style={{ fontWeight: 400, fontSize: ".85rem" }}>· GFT</span></span></span>
      <div className="userchip"><AudioControls /></div>
    </header>
    <main className="prototype-entry-main">
      <section className="welcome prototype-entry">
        <div className="body">
          <div className="eyebrow">E4S · English for Every Season</div>
          <h1>Học tiếng Anh cho công việc</h1>
          <p>Học ngắn mỗi ngày, luyện tình huống thực tế và nhận phản hồi để làm tốt hơn ở lần tiếp theo.</p>
        </div>
        <div className="card prototype-entry-card" aria-label="Đăng nhập E4S" aria-busy={busy || undefined}>
          <div className="tabs" role="tablist" aria-label="Loại tài khoản" aria-orientation="horizontal">
            <button ref={learnerTab} id="prototype-login-learner-tab" className={audience === "learner" ? "active" : ""} type="button" role="tab" aria-controls={loginPanelId} aria-selected={audience === "learner"} tabIndex={audience === "learner" ? 0 : -1} disabled={busy} onKeyDown={navigateAudience} onClick={() => switchAudience("learner")}>Người học</button>
            <button ref={staffTab} id="prototype-login-staff-tab" className={audience === "staff" ? "active" : ""} type="button" role="tab" aria-controls={loginPanelId} aria-selected={audience === "staff"} tabIndex={audience === "staff" ? 0 : -1} disabled={busy} onKeyDown={navigateAudience} onClick={() => switchAudience("staff")}>Nhân sự</button>
          </div>
          <form id={loginPanelId} className="stack section" role="tabpanel" tabIndex={0} aria-labelledby={`prototype-login-${audience}-tab`} aria-busy={pendingAction === "login" || undefined} aria-describedby={error ? errorId : undefined} onSubmit={submit}>
            <label className="field" htmlFor={emailId}><span>Email</span><input ref={emailInput} id={emailId} name="email" type="email" autoComplete="username" required disabled={busy} value={email} aria-invalid={Boolean(error)} aria-describedby={error ? errorId : undefined} onChange={(event) => setEmail(event.target.value)} /></label>
            <label className="field" htmlFor={passwordId}><span>Mật khẩu</span><input id={passwordId} name="password" type="password" autoComplete="current-password" required disabled={busy} value={password} aria-invalid={Boolean(error)} aria-describedby={error ? errorId : undefined} onChange={(event) => setPassword(event.target.value)} /></label>
            {error ? <div ref={errorRef} id={errorId} className="banner danger" role="alert" tabIndex={-1}><div className="body small">{error}</div></div> : null}
            <button className="btn-primary btn-block" type="submit" disabled={busy} aria-busy={pendingAction === "login" || undefined}>{pendingAction === "login" ? "Đang đăng nhập…" : audience === "learner" ? "Đăng nhập người học" : "Đăng nhập nhân sự"}</button>
          </form>
        </div>
      </section>
    </main>
  </>;
}
