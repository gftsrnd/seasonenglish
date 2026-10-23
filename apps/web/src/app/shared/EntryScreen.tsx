import { useRef, useState, type FormEvent, type KeyboardEvent, type ReactNode } from "react";
import { Award, BriefcaseBusiness, Clock3, Eye, EyeOff, Leaf, MessageSquare } from "lucide-react";
import type { SessionView } from "@e4s/contracts";
import type { AuthClient } from "../../features/auth/index.js";
import { AudioControls, SeasonMark } from "./AppShell.js";

type Mode = "login" | "register" | "forgotEmail" | "forgotOtp" | "forgotPin";
type FieldErrors = Partial<Record<"displayName" | "email" | "credential" | "confirmation" | "code", string>>;

export function EntryScreen({ client, onAuthenticated }: { client: AuthClient; onAuthenticated: (session: SessionView) => void }) {
  const [audience, setAudience] = useState<"learner" | "staff">("learner");
  const [mode, setMode] = useState<Mode>(() => window.location.pathname === "/register" ? "register" : "login");
  const [displayName, setDisplayName] = useState("");
  const [email, setEmail] = useState("");
  const [credential, setCredential] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [code, setCode] = useState("");
  const [challengeId, setChallengeId] = useState("");
  const [resetToken, setResetToken] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [capsLockOn, setCapsLockOn] = useState(false);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const emailInput = useRef<HTMLInputElement>(null);

  const resetForm = (next: Mode) => {
    setMode(next); setDisplayName(""); setEmail(""); setCredential(""); setConfirmation(""); setCode("");
    setChallengeId(""); setResetToken(""); setErrors({}); setNotice(""); setShowPassword(false); setCapsLockOn(false);
  };
  const goTo = (next: Mode) => {
    window.history.pushState(window.history.state, "", next === "register" ? "/register" : "/");
    resetForm(next);
  };
  const switchAudience = (next: "learner" | "staff") => {
    if (busy) return;
    setAudience(next); goTo("login");
    queueMicrotask(() => emailInput.current?.focus());
  };
  const updateCapsLock = (event: KeyboardEvent<HTMLInputElement>) => {
    if (["Tab", "Shift", "Control", "Alt", "Meta"].includes(event.key)) return;
    setCapsLockOn(event.getModifierState("CapsLock"));
  };
  const validationFor = (overrides: Partial<{ displayName: string; email: string; credential: string; confirmation: string; code: string }> = {}) => validate(mode, audience, {
    displayName, email, credential, confirmation, code, ...overrides
  });
  const updateDisplayName = (value: string) => {
    setDisplayName(value);
    setErrors((current) => withFieldError(current, "displayName", validationFor({ displayName: value }).displayName));
  };
  const updateEmail = (value: string) => {
    setEmail(value);
    setErrors((current) => withFieldError(current, "email", validationFor({ email: value }).email));
  };
  const updateCredential = (value: string) => {
    setCredential(value);
    const validation = validationFor({ credential: value });
    setErrors((current) => {
      const next = withFieldError(current, "credential", validation.credential);
      return (confirmation || current.confirmation)
        ? withFieldError(next, "confirmation", validation.confirmation)
        : next;
    });
  };
  const updateConfirmation = (value: string) => {
    setConfirmation(value);
    setErrors((current) => withFieldError(current, "confirmation", validationFor({ confirmation: value }).confirmation));
  };
  const updateCode = (value: string) => {
    setCode(value);
    setErrors((current) => withFieldError(current, "code", validationFor({ code: value }).code));
  };

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault(); setErrors({}); setNotice("");
    const validation = validate(mode, audience, { displayName, email, credential, confirmation, code });
    if (Object.keys(validation).length) { setErrors(validation); return; }
    setBusy(true);
    try {
      if (mode === "login") {
        const session = audience === "learner"
          ? await client.learnerLogin({ email, pin: credential })
          : await client.staffLogin({ email, password: credential });
        onAuthenticated(session);
      } else if (mode === "register") {
        const session = await client.registerLearner({ displayName: normalizeHumanName(displayName), email, pin: credential });
        window.history.replaceState(window.history.state, "", "/home");
        onAuthenticated(session);
      } else if (mode === "forgotEmail") {
        const challenge = await client.startLearnerPinReset({ email });
        setChallengeId(challenge.challengeId); setMode("forgotOtp"); setCode("");
        setNotice("Nếu email thuộc tài khoản người học, mã xác minh đã được gửi.");
      } else if (mode === "forgotOtp") {
        const verified = await client.verifyLearnerPinReset({ challengeId, code });
        setResetToken(verified.resetToken); setMode("forgotPin"); setCredential(""); setConfirmation("");
      } else {
        await client.completeLearnerPinReset({ resetToken, pin: credential });
        resetForm("login"); setNotice("Đã cập nhật mã PIN. Bạn có thể đăng nhập bằng mã PIN mới.");
      }
    } catch (caught) {
      const codeValue = caught instanceof Error ? caught.message : "";
      setErrors(errorFor(mode, audience, codeValue));
    } finally { setBusy(false); }
  };

  const learnerPin = (audience === "learner" && mode === "login") || mode === "register" || mode === "forgotPin";
  const heading = mode === "register" ? "Đăng ký người học" : mode === "forgotEmail" ? "Quên mã PIN" : mode === "forgotOtp" ? "Nhập mã xác minh" : mode === "forgotPin" ? "Tạo mã PIN mới" : "";

  return <>
    <header className="topbar app-entry-topbar">
      <span className="brand"><span className="avatar" style={{ width: 34, height: 34, background: "var(--primary-soft)", display: "inline-grid", placeItems: "center" }}><SeasonMark className="app-brand-mark" /></span><span>Season English <span className="muted" style={{ fontWeight: 400, fontSize: ".85rem" }}>· GFT</span></span></span>
      <div className="userchip"><AudioControls /></div>
    </header>
    <main className="app-entry-main">
      <section className="welcome app-entry">
        <div className="body">
          <div className="entry-hero-art" aria-hidden="true"><Leaf className="entry-hero-leaf entry-hero-leaf-main" size={58} strokeWidth={1.35} /><Leaf className="entry-hero-leaf entry-hero-leaf-small" size={30} /><Leaf className="entry-hero-leaf entry-hero-leaf-wide" size={42} /><Leaf className="entry-hero-leaf entry-hero-leaf-light" size={25} /><Leaf className="entry-hero-leaf entry-hero-leaf-tiny" size={22} /></div>
          <div className="eyebrow">E4S · English for Every Season</div><h1>Mỗi ngày một chút nắng</h1>
          <p>Tựa cây non âm thầm lớn lên qua bốn mùa, hãy cho mình mỗi ngày một chút nắng: thực hành tình huống thực tế và nhận góp ý để ngày càng tự tin hơn.</p>
          <section className="entry-learning-card" aria-label="Điểm nổi bật của E4S"><div className="entry-benefit-row"><span className="entry-benefit-pill"><Clock3 size={17} /><span>10 phút mỗi ngày, T2–T6</span></span><span className="entry-benefit-pill"><MessageSquare size={17} /><span>Luyện chat với Season</span></span><span className="entry-benefit-pill"><Award size={17} /><span>Điểm thưởng và huy hiệu</span></span><span className="entry-benefit-pill"><BriefcaseBusiness size={17} /><span>Bài học sát công việc</span></span></div></section>
        </div>
        <div className="card app-entry-card" aria-busy={busy || undefined}>
          {mode === "login" ? <div className="tabs" role="tablist" aria-label="Loại tài khoản"><button id="app-login-learner-tab" className={audience === "learner" ? "active" : ""} type="button" role="tab" aria-selected={audience === "learner"} onClick={() => switchAudience("learner")}>Người học</button><button id="app-login-staff-tab" className={audience === "staff" ? "active" : ""} type="button" role="tab" aria-selected={audience === "staff"} onClick={() => switchAudience("staff")}>Nhân sự</button></div> : <div className="app-register-heading"><div className="eyebrow">Tài khoản người học</div><h2>{heading}</h2><p className="small muted">{mode === "forgotOtp" ? "Mã gồm 6 số và có hiệu lực trong 10 phút." : mode === "forgotPin" ? "Mã PIN mới gồm 6 chữ số." : "Thông tin được bảo vệ và chỉ dùng cho tài khoản E4S."}</p></div>}
          <form className="stack section" role={mode === "login" ? "tabpanel" : undefined} aria-labelledby={mode === "login" ? `app-login-${audience}-tab` : undefined} noValidate onSubmit={submit}>
            {mode === "register" ? <Field label="Họ và tên" error={errors.displayName}><input aria-label="Họ và tên" autoComplete="name" placeholder="Ví dụ: Nguyễn Minh Anh" value={displayName} disabled={busy} onChange={(e) => updateDisplayName(e.target.value)} /></Field> : null}
            {["login", "register", "forgotEmail"].includes(mode) ? <Field label="Email" error={errors.email}><input ref={emailInput} aria-label="Email" type="email" autoComplete="username" placeholder="ten@email.com" value={email} disabled={busy} onChange={(e) => updateEmail(e.target.value)} onKeyDown={updateCapsLock} onKeyUp={updateCapsLock} onBlur={() => setCapsLockOn(false)} />{capsLockOn ? <span className="small muted" role="status">Caps Lock đang bật</span> : null}</Field> : null}
            {mode === "forgotOtp" ? <Field label="Mã xác minh" error={errors.code}><PinInput label="Mã xác minh" value={code} onChange={updateCode} disabled={busy} autoComplete="one-time-code" /></Field> : null}
            {mode === "login" || mode === "register" || mode === "forgotPin" ? <Field label={learnerPin ? (mode === "forgotPin" ? "Mã PIN mới" : "Mã PIN") : "Mật khẩu"} error={errors.credential}>
              {learnerPin ? <PinInput label={mode === "forgotPin" ? "Mã PIN mới" : "Mã PIN"} value={credential} onChange={updateCredential} disabled={busy} autoComplete={mode === "login" ? "current-password" : "new-password"} /> : <span className="password-control"><input aria-label="Mật khẩu" type={showPassword ? "text" : "password"} autoComplete="current-password" placeholder="Nhập mật khẩu" value={credential} disabled={busy} onChange={(e) => updateCredential(e.target.value)} onKeyDown={updateCapsLock} onKeyUp={updateCapsLock} /><button className="password-toggle" type="button" aria-label={showPassword ? "Ẩn mật khẩu" : "Hiện mật khẩu"} onClick={() => setShowPassword((v) => !v)}>{showPassword ? <EyeOff size={18} /> : <Eye size={18} />}</button></span>}
            </Field> : null}
            {mode === "register" || mode === "forgotPin" ? <Field label="Nhập lại mã PIN" error={errors.confirmation}><PinInput label="Nhập lại mã PIN" value={confirmation} onChange={updateConfirmation} disabled={busy} autoComplete="new-password" /></Field> : null}
            {notice ? <div className="banner info" role="status"><div className="body small">{notice}</div></div> : null}
            <button className="btn-primary btn-block" type="submit" disabled={busy}>{busy ? "Đang xử lý…" : submitLabel(mode, audience)}</button>
            <div className="app-entry-secondary-actions">
              {mode === "login" && audience === "learner" ? <><button className="app-entry-link" type="button" onClick={() => goTo("register")}>Tạo tài khoản người học</button><span>·</span><button className="app-entry-link" type="button" onClick={() => goTo("forgotEmail")}>Quên mã PIN?</button></> : null}
              {mode !== "login" ? <button className="app-entry-link" type="button" onClick={() => goTo("login")}>Quay lại đăng nhập</button> : null}
            </div>
            {mode === "login" ? <details className="app-shared-device-note"><summary>Đăng nhập trên thiết bị dùng chung?</summary><p className="small muted" role="note">Không lưu đăng nhập. Hãy đăng xuất sau khi học.</p></details> : null}
          </form>
        </div>
      </section>
    </main>
  </>;
}

function Field({ label, error, children }: { label: string; error: string | undefined; children: ReactNode }) {
  return <label className="field"><span>{label}</span>{children}{error ? <span className="app-field-error" role="alert">{error}</span> : null}</label>;
}

function withFieldError(current: FieldErrors, field: keyof FieldErrors, error?: string): FieldErrors {
  const next = { ...current };
  if (error) next[field] = error;
  else delete next[field];
  return next;
}

function PinInput({ label, value, onChange, disabled, autoComplete }: { label: string; value: string; onChange: (value: string) => void; disabled: boolean; autoComplete: string }) {
  const [revealed, setRevealed] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const toggleVisibility = () => {
    setRevealed((current) => !current);
    inputRef.current?.focus();
  };
  return <span className="app-pin-input"><input ref={inputRef} aria-label={label} type="password" inputMode="numeric" pattern="[0-9]*" maxLength={6} autoComplete={autoComplete} value={value} disabled={disabled} onChange={(event) => onChange(event.target.value.replace(/\D/g, "").slice(0, 6))} /><span className="app-pin-cells" aria-hidden="true">{Array.from({ length: 6 }, (_, index) => <span key={index}>{index < value.length ? (revealed ? value[index] : "•") : ""}</span>)}</span><button className="app-pin-toggle" type="button" disabled={disabled} aria-label={revealed ? `Ẩn ${label}` : `Hiện ${label}`} aria-pressed={revealed} onClick={toggleVisibility}>{revealed ? <EyeOff size={18} /> : <Eye size={18} />}</button></span>;
}

function validate(mode: Mode, audience: "learner" | "staff", values: { displayName: string; email: string; credential: string; confirmation: string; code: string }): FieldErrors {
  const errors: FieldErrors = {};
  if (["login", "register", "forgotEmail"].includes(mode) && !/^\S+@\S+\.\S+$/.test(values.email.trim())) errors.email = "Nhập email hợp lệ.";
  if (mode === "register" && !isValidHumanName(values.displayName)) errors.displayName = "Nhập đầy đủ họ và tên, không dùng số.";
  if (mode === "login" && audience === "staff" && values.credential.length < 8) errors.credential = "Mật khẩu cần ít nhất 8 ký tự.";
  if (((mode === "login" && audience === "learner") || mode === "register" || mode === "forgotPin") && !/^\d{6}$/.test(values.credential)) errors.credential = "Mã PIN phải gồm đúng 6 chữ số.";
  if ((mode === "register" || mode === "forgotPin") && values.confirmation !== values.credential) errors.confirmation = "Mã PIN nhập lại chưa khớp.";
  if (mode === "forgotOtp" && !/^\d{6}$/.test(values.code)) errors.code = "Mã xác minh phải gồm 6 chữ số.";
  return errors;
}

function errorFor(mode: Mode, audience: "learner" | "staff", code: string): FieldErrors {
  if (code === "LEARNER_REGISTRATION_EMAIL_EXISTS" || code === "LEARNER_REGISTRATION_EMAIL_DELETED") return { email: "Email này không khả dụng. Hãy dùng email khác." };
  if (code === "EMAIL_DELIVERY_FAILED" || code === "EMAIL_DELIVERY_UNAVAILABLE") return { email: "Chưa thể gửi mã xác minh. Vui lòng thử lại." };
  if (code === "INVALID_OR_EXPIRED_CODE") return { code: "Mã không đúng hoặc đã hết hạn." };
  if (code === "WRONG_LOGIN_PATH") return { email: audience === "learner" ? "Tài khoản này cần đăng nhập ở tab Nhân sự." : "Tài khoản này cần đăng nhập ở tab Người học." };
  if (code === "ACCOUNT_DELETED") return { email: "Tài khoản này không còn hoạt động." };
  if (mode === "forgotPin") return { credential: "Không thể đổi PIN. Vui lòng yêu cầu mã mới." };
  return mode === "login" ? { credential: audience === "learner" ? "Email hoặc PIN chưa đúng." : "Email hoặc mật khẩu chưa đúng." } : { email: "Không thể xử lý yêu cầu. Vui lòng thử lại." };
}

function submitLabel(mode: Mode, audience: "learner" | "staff"): string {
  if (mode === "login") return audience === "learner" ? "Đăng nhập người học" : "Đăng nhập nhân sự";
  if (mode === "register") return "Đăng ký và bắt đầu";
  if (mode === "forgotEmail") return "Gửi mã qua email";
  if (mode === "forgotOtp") return "Xác minh mã";
  return "Lưu mã PIN mới";
}

function normalizeHumanName(value: string): string { return value.trim().replace(/\s+/g, " ").normalize("NFC"); }
function isValidHumanName(value: string): boolean { const tokens = normalizeHumanName(value).split(" "); return tokens.length >= 2 && tokens.every((token) => /^[\p{L}\p{M}]+(?:[-'][\p{L}\p{M}]+)*$/u.test(token)); }
