import { useCallback, useEffect, useRef, useState, type FormEvent, type KeyboardEvent, type ReactNode } from "react";
import { Award, BriefcaseBusiness, Clock3, Eye, EyeOff, MessageSquare } from "lucide-react";
import type { SessionView } from "@e4s/contracts";
import type { AuthClient } from "../../features/auth/index.js";
import { AudioControls, SeasonDecoration, SeasonMark } from "./AppShell.js";

type Mode = "login" | "register" | "forgotEmail" | "forgotOtp" | "forgotPin" | "forgotStaff";
type FieldErrors = Partial<Record<"displayName" | "email" | "credential" | "confirmation" | "code", string>>;
/** Same minimum interval as the API (`PIN_RESET_RESEND_INTERVAL_SECONDS`). */
const PIN_RESET_RESEND_SECONDS = 60;
const PIN_RESET_SENT_NOTICE = "Nếu email thuộc tài khoản người học, mã xác minh đã được gửi.";

function retryAfterSeconds(details: unknown): number {
  const value = details && typeof details === "object" && "retryAfterSeconds" in details ? Number(details.retryAfterSeconds) : NaN;
  return Number.isFinite(value) && value > 0 ? Math.min(PIN_RESET_RESEND_SECONDS, Math.ceil(value)) : PIN_RESET_RESEND_SECONDS;
}

function entryMode(staffEntryPath?: string | null): Mode {
  const path = window.location.pathname.replace(/\/+$/, "");
  if (staffEntryPath) return path === staffEntryPath + "/forgot-password" ? "forgotStaff" : "login";
  if (path === "/register") return "register";
  if (path === "/forgot-pin") return "forgotEmail";
  return "login";
}

export function EntryScreen({ client, onAuthenticated, staffEntryPath, separateStaffEntry = false }: { client: AuthClient; onAuthenticated: (session: SessionView) => void; staffEntryPath?: string | null; separateStaffEntry?: boolean }) {
  const initialAudience = staffEntryPath ? "staff" : "learner";
  const showRoleTabs = !staffEntryPath && !separateStaffEntry;
  const [audience, setAudience] = useState<"learner" | "staff">(initialAudience);
  const [mode, setMode] = useState<Mode>(() => entryMode(staffEntryPath));
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
  const [resendUntil, setResendUntil] = useState(0);
  const [clock, setClock] = useState(() => Date.now());
  const emailInput = useRef<HTMLInputElement>(null);
  const entryRevision = useRef(0);
  const resetForm = useCallback((next: Mode) => {
    entryRevision.current++;
    setMode(next); setDisplayName(""); setEmail(""); setCredential(""); setConfirmation(""); setCode("");
    setChallengeId(""); setResetToken(""); setErrors({}); setNotice(""); setShowPassword(false); setCapsLockOn(false); setBusy(false); setResendUntil(0);
  }, []);
  // `clock` only triggers the once-a-second re-render; the countdown reads the current time.
  const resendSeconds = mode === "forgotOtp" && resendUntil > clock ? Math.max(0, Math.ceil((resendUntil - Date.now()) / 1_000)) : 0;
  const cooling = resendSeconds > 0;
  useEffect(() => {
    if (!cooling) return;
    const timer = window.setInterval(() => setClock(Date.now()), 1_000);
    return () => window.clearInterval(timer);
  }, [cooling, resendUntil]);
  const startResendCooldown = (seconds = PIN_RESET_RESEND_SECONDS) => {
    const now = Date.now();
    setClock(now); setResendUntil(now + seconds * 1_000);
  };
  useEffect(() => {
    const onPopState = () => {
      setAudience(initialAudience);
      resetForm(entryMode(staffEntryPath));
    };
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, [initialAudience, staffEntryPath, resetForm]);

  const goTo = (next: Mode) => {
    const keepStaffEmail = staffEntryPath && (next === "forgotStaff" || mode === "forgotStaff");
    let path = window.location.pathname;
    if (staffEntryPath) path = next === "forgotStaff" ? staffEntryPath + "/forgot-password" : staffEntryPath;
    else if (next === "register") path = "/register";
    else if (next === "forgotEmail") path = "/forgot-pin";
    else if (next === "login") path = "/";
    if (path !== window.location.pathname) window.history.pushState(window.history.state, "", path);
    resetForm(next);
    if (keepStaffEmail) setEmail(email);
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
    if (Object.keys(validation).length) {
      setErrors(validation);
      const form = event.currentTarget;
      const invalidLabel = validation.displayName ? "Họ và tên"
        : validation.email ? "Email"
        : validation.code ? "Mã xác minh"
        : validation.credential ? (mode === "forgotPin" ? "Mã PIN mới" : audience === "staff" ? "Mật khẩu" : "Mã PIN")
        : "Nhập lại mã PIN";
      form.querySelector<HTMLInputElement>(`input[aria-label="${invalidLabel}"]`)?.focus();
      return;
    }
    const revision = entryRevision.current;
    setBusy(true);
    try {
      if (mode === "login") {
        const session = audience === "learner"
          ? await client.learnerLogin({ email, pin: credential })
          : await client.staffLogin({ email, password: credential });
        if (revision !== entryRevision.current) return;
        onAuthenticated(session);
      } else if (mode === "register") {
        const session = await client.registerLearner({ displayName: normalizeHumanName(displayName), email, pin: credential });
        if (revision !== entryRevision.current) return;
        window.history.replaceState(window.history.state, "", "/home");
        onAuthenticated(session);
      } else if (mode === "forgotEmail") {
        const challenge = await client.startLearnerPinReset({ email });
        if (revision !== entryRevision.current) return;
        setChallengeId(challenge.challengeId); setMode("forgotOtp"); setCode(""); startResendCooldown();
        setNotice(PIN_RESET_SENT_NOTICE);
      } else if (mode === "forgotOtp") {
        const verified = await client.verifyLearnerPinReset({ challengeId, code });
        if (revision !== entryRevision.current) return;
        setResetToken(verified.resetToken); setMode("forgotPin"); setCredential(""); setConfirmation("");
      } else if (mode === "forgotStaff") {
        await client.requestStaffPasswordHelp({ email });
        if (revision !== entryRevision.current) return;
        setNotice("Đã nhận yêu cầu. Nếu email thuộc tài khoản nhân sự, Quản lý sẽ nhận được yêu cầu đặt lại mật khẩu.");
      } else {
        await client.completeLearnerPinReset({ resetToken, pin: credential });
        if (revision !== entryRevision.current) return;
        window.history.replaceState(window.history.state, "", "/");
        resetForm("login"); setNotice("Đã cập nhật mã PIN. Bạn có thể đăng nhập bằng mã PIN mới.");
      }
    } catch (caught) {
      if (revision !== entryRevision.current) return;
      const codeValue = caught && typeof caught === "object" && "code" in caught && typeof caught.code === "string"
        ? caught.code : caught instanceof Error ? caught.message : "";
      const details = caught && typeof caught === "object" && "details" in caught ? caught.details : undefined;
      if (codeValue === "PIN_RESET_RESEND_TOO_SOON") startResendCooldown(retryAfterSeconds(details));
      setErrors(errorFor(mode, audience, codeValue, details, showRoleTabs));
    } finally {
      if (revision === entryRevision.current) setBusy(false);
    }
  };

  // "Gửi lại mã": requests a new code for the same email; the server enforces the same 60 s interval per email.
  const resendCode = async () => {
    if (busy || resendSeconds > 0 || mode !== "forgotOtp") return;
    const revision = entryRevision.current;
    setErrors({}); setNotice(""); setBusy(true);
    try {
      const challenge = await client.startLearnerPinReset({ email });
      if (revision !== entryRevision.current) return;
      setChallengeId(challenge.challengeId); setCode(""); startResendCooldown();
      setNotice(PIN_RESET_SENT_NOTICE);
    } catch (caught) {
      if (revision !== entryRevision.current) return;
      const codeValue = caught && typeof caught === "object" && "code" in caught && typeof caught.code === "string"
        ? caught.code : caught instanceof Error ? caught.message : "";
      const details = caught && typeof caught === "object" && "details" in caught ? caught.details : undefined;
      if (codeValue === "PIN_RESET_RESEND_TOO_SOON") startResendCooldown(retryAfterSeconds(details));
      // The email field is hidden on this screen, so the message is shown under the code field.
      const failure = errorFor("forgotEmail", audience, codeValue, details, showRoleTabs);
      setErrors({ code: failure.email ?? failure.credential ?? failure.code ?? "Không thể xử lý yêu cầu. Vui lòng thử lại." });
    } finally {
      if (revision === entryRevision.current) setBusy(false);
    }
  };

  const learnerPin = (audience === "learner" && mode === "login") || mode === "register" || mode === "forgotPin";
  const heading = mode === "register" ? "Đăng ký người học" : mode === "forgotEmail" ? "Quên mã PIN" : mode === "forgotOtp" ? "Nhập mã xác minh" : mode === "forgotPin" ? "Tạo mã PIN mới" : mode === "forgotStaff" ? "Quên mật khẩu nhân sự" : "";

  return <main className="app-entry-main">
    <section className="app-entry" aria-label="Tài khoản E4S">
      <header className="app-entry-header">
        <h1 className="app-entry-brand"><span className="avatar"><SeasonMark className="app-brand-mark" /></span><span>Season English</span><span className="muted app-entry-organisation"><span aria-hidden="true">· </span>GFT</span></h1>
        <AudioControls />
      </header>
      <div className="app-entry-content">
        <div className="app-entry-intro">
          <SeasonDecoration className="entry-hero-art" />
          <div className="entry-intro-copy">
            <div className="eyebrow">E4S · English for Every Season</div><h2>Mỗi ngày một chút nắng</h2>
            <p>Tựa cây non âm thầm lớn lên qua bốn mùa, hãy cho mình mỗi ngày một chút nắng: thực hành tình huống thực tế và nhận góp ý để ngày càng tự tin hơn.</p>
            <section className="entry-learning-card" aria-label="Điểm nổi bật của E4S"><div className="entry-benefit-row"><span className="entry-benefit-pill"><Clock3 size={17} /><span>10 phút mỗi ngày, T2–T6</span></span><span className="entry-benefit-pill"><MessageSquare size={17} /><span>Luyện chat với Season</span></span><span className="entry-benefit-pill"><Award size={17} /><span>Điểm thưởng và huy hiệu</span></span><span className="entry-benefit-pill"><BriefcaseBusiness size={17} /><span>Bài học sát công việc</span></span></div></section>
          </div>
        </div>
        <div className="card app-entry-card" aria-busy={busy || undefined}>
          {mode === "login" ? <>
            <div className="app-entry-form-heading">
              <div className="eyebrow">Tài khoản E4S</div>
              <h2>{staffEntryPath ? "Đăng nhập nhân sự" : "Đăng nhập"}</h2>
              <p className="small muted">{audience === "learner" ? "Nhập email và mã PIN để vào E4S." : "Nhập email và mật khẩu để vào E4S."}</p>
            </div>
            {showRoleTabs ? <div className="tabs" role="tablist" aria-label="Loại tài khoản"><button id="app-login-learner-tab" className={audience === "learner" ? "active" : ""} type="button" role="tab" aria-selected={audience === "learner"} onClick={() => switchAudience("learner")}>Người học</button><button id="app-login-staff-tab" className={audience === "staff" ? "active" : ""} type="button" role="tab" aria-selected={audience === "staff"} onClick={() => switchAudience("staff")}>Nhân sự</button></div> : null}
          </> : <div className="app-entry-form-heading"><div className="eyebrow">{mode === "forgotStaff" ? "Tài khoản nhân sự" : "Tài khoản người học"}</div><h2>{heading}</h2><p className="small muted">{mode === "forgotOtp" ? "Mã gồm 6 số và có hiệu lực trong 10 phút." : mode === "forgotPin" ? "Mã PIN mới gồm 6 chữ số." : mode === "forgotStaff" ? "Nhập email để gửi yêu cầu đặt lại mật khẩu cho Quản lý." : "Thông tin được bảo vệ và chỉ dùng cho tài khoản E4S."}</p></div>}
          <form className="stack section" role={mode === "login" && showRoleTabs ? "tabpanel" : undefined} aria-labelledby={mode === "login" && showRoleTabs ? `app-login-${audience}-tab` : undefined} noValidate onSubmit={submit}>
            {mode === "register" ? <Field label="Họ và tên" error={errors.displayName}><input aria-label="Họ và tên" autoComplete="name" placeholder="Ví dụ: Nguyễn Minh Anh" value={displayName} disabled={busy} onChange={(e) => updateDisplayName(e.target.value)} /></Field> : null}
            {["login", "register", "forgotEmail", "forgotStaff"].includes(mode) ? <Field label="Email" error={errors.email}><input ref={emailInput} aria-label="Email" name="username" type="email" autoComplete="username" placeholder="ten@email.com" value={email} disabled={busy} onChange={(e) => updateEmail(e.target.value)} onKeyDown={updateCapsLock} onKeyUp={updateCapsLock} onBlur={() => setCapsLockOn(false)} />{capsLockOn ? <span className="small muted" role="status">Caps Lock đang bật</span> : null}</Field> : null}
            {mode === "forgotOtp" ? <Field label="Mã xác minh" error={errors.code}><PinInput label="Mã xác minh" value={code} onChange={updateCode} disabled={busy} autoComplete="one-time-code" /></Field> : null}
            {mode === "login" || mode === "register" || mode === "forgotPin" ? <Field label={learnerPin ? (mode === "forgotPin" ? "Mã PIN mới" : "Mã PIN") : "Mật khẩu"} error={errors.credential}>
              {learnerPin ? <PinInput label={mode === "forgotPin" ? "Mã PIN mới" : "Mã PIN"} value={credential} onChange={updateCredential} disabled={busy} autoComplete={mode === "login" ? "current-password" : "new-password"} /> : <span className="password-control"><input aria-label="Mật khẩu" name="password" type={showPassword ? "text" : "password"} autoComplete="current-password" placeholder="Nhập mật khẩu" value={credential} disabled={busy} onChange={(e) => updateCredential(e.target.value)} onKeyDown={updateCapsLock} onKeyUp={updateCapsLock} /><button className="password-toggle" type="button" aria-label={showPassword ? "Ẩn mật khẩu" : "Hiện mật khẩu"} onClick={() => setShowPassword((v) => !v)}>{showPassword ? <EyeOff size={18} /> : <Eye size={18} />}</button></span>}
            </Field> : null}
            {mode === "register" || mode === "forgotPin" ? <Field label="Nhập lại mã PIN" error={errors.confirmation}><PinInput label="Nhập lại mã PIN" value={confirmation} onChange={updateConfirmation} disabled={busy} autoComplete="new-password" /></Field> : null}
            {notice ? <div className="banner info" role="status"><div className="body small">{notice}</div></div> : null}
            <button className="btn-primary btn-block" type="submit" disabled={busy}>{busy ? "Đang xử lý…" : mode === "login" && !showRoleTabs ? "Đăng nhập" : mode === "forgotStaff" && staffEntryPath ? "Gửi yêu cầu" : submitLabel(mode, audience)}</button>
            <div className="app-entry-secondary-actions">
              {mode === "login" && audience === "learner" ? <><button className="app-entry-link" type="button" onClick={() => goTo("register")}>Tạo tài khoản người học</button><span>·</span><button className="app-entry-link" type="button" onClick={() => goTo("forgotEmail")}>Quên mã PIN?</button></> : null}
              {mode === "login" && audience === "staff" ? <button className="app-entry-link" type="button" onClick={() => goTo("forgotStaff")}>Quên mật khẩu?</button> : null}
              {mode === "forgotOtp" ? <><button className="app-entry-link" type="button" disabled={busy || resendSeconds > 0} onClick={() => void resendCode()}>{resendSeconds > 0 ? `Gửi lại mã (${resendSeconds}s)` : "Gửi lại mã"}</button><span>·</span></> : null}
              {mode !== "login" ? <button className="app-entry-link" type="button" onClick={() => goTo("login")}>Quay lại đăng nhập</button> : null}
            </div>
            {mode === "login" ? <details className="app-shared-device-note"><summary>Đăng nhập trên thiết bị dùng chung?</summary><p className="small muted" role="note">Không lưu đăng nhập. Hãy đăng xuất sau khi học.</p></details> : null}
          </form>
        </div>
      </div>
    </section>
  </main>;
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
  return <span className="app-pin-input"><input ref={inputRef} aria-label={label} type={revealed ? "text" : "password"} inputMode="numeric" pattern="[0-9]*" maxLength={6} autoComplete={autoComplete} value={value} disabled={disabled} onChange={(event) => onChange(event.target.value.replace(/\D/g, "").slice(0, 6))} /><span className="app-pin-cells" aria-hidden="true">{Array.from({ length: 6 }, (_, index) => <span key={index}>{index < value.length ? (revealed ? value[index] : "•") : ""}</span>)}</span><button className="app-pin-toggle" type="button" disabled={disabled} aria-label={revealed ? `Ẩn ${label}` : `Hiện ${label}`} aria-pressed={revealed} onClick={toggleVisibility}>{revealed ? <EyeOff size={18} /> : <Eye size={18} />}</button></span>;
}

function validate(mode: Mode, audience: "learner" | "staff", values: { displayName: string; email: string; credential: string; confirmation: string; code: string }): FieldErrors {
  const errors: FieldErrors = {};
  if (["login", "register", "forgotEmail", "forgotStaff"].includes(mode) && !/^\S+@\S+\.\S+$/.test(values.email.trim())) errors.email = "Nhập email hợp lệ.";
  if (mode === "register" && !isValidHumanName(values.displayName)) errors.displayName = "Nhập đầy đủ họ và tên, không dùng số.";
  if (mode === "login" && audience === "staff" && values.credential.length === 0) errors.credential = "Nhập mật khẩu.";
  if (((mode === "login" && audience === "learner") || mode === "register" || mode === "forgotPin") && !/^\d{6}$/.test(values.credential)) errors.credential = "Mã PIN phải gồm đúng 6 chữ số.";
  if ((mode === "register" || mode === "forgotPin") && values.confirmation !== values.credential) errors.confirmation = "Mã PIN nhập lại chưa khớp.";
  if (mode === "forgotOtp" && !/^\d{6}$/.test(values.code)) errors.code = "Mã xác minh phải gồm 6 chữ số.";
  return errors;
}

function errorFor(mode: Mode, audience: "learner" | "staff", code: string, details: unknown, showRoleTabs: boolean): FieldErrors {
  if (code === "NETWORK_UNAVAILABLE") return { credential: "Không thể kết nối tới E4S. Kiểm tra mạng rồi thử lại." };
  if (code === "PIN_LOGIN_LOCKED") {
    const lockedUntil = details && typeof details === "object" && "lockedUntil" in details && typeof details.lockedUntil === "string"
      ? new Date(details.lockedUntil) : null;
    const unlockTime = lockedUntil && Number.isFinite(lockedUntil.getTime())
      ? new Intl.DateTimeFormat("vi-VN", { timeZone: "Asia/Ho_Chi_Minh", hour: "2-digit", minute: "2-digit", day: "2-digit", month: "2-digit" }).format(lockedUntil)
      : null;
    return { credential: unlockTime
      ? `Bạn đã nhập sai mã PIN quá nhiều lần. Hãy thử lại từ ${unlockTime} (giờ Việt Nam).`
      : "Bạn đã nhập sai mã PIN quá nhiều lần. Vui lòng thử lại sau." };
  }
  if (code === "LEARNER_REGISTRATION_EMAIL_EXISTS" || code === "LEARNER_REGISTRATION_EMAIL_DELETED") return { email: "Email này không khả dụng. Hãy dùng email khác." };
  if (code === "EMAIL_DELIVERY_FAILED" || code === "EMAIL_DELIVERY_UNAVAILABLE") return { email: "Chưa thể gửi mã xác minh. Vui lòng thử lại." };
  if (code === "PIN_RESET_RESEND_TOO_SOON") return { email: `Mã vừa được gửi. Vui lòng đợi ${retryAfterSeconds(details)} giây rồi gửi lại mã.` };
  if (code === "INVALID_OR_EXPIRED_CODE") return { code: "Mã không đúng hoặc đã hết hạn." };
  if (code === "WRONG_LOGIN_PATH" && showRoleTabs) return audience === "learner"
    ? { email: "Không thể đăng nhập. Vui lòng kiểm tra email, mã PIN và vai trò. Tài khoản nhân sự cần đăng nhập ở tab Nhân sự." }
    : { credential: "Không thể đăng nhập. Vui lòng kiểm tra email, mật khẩu và vai trò. Tài khoản người học cần đăng nhập ở tab Người học." };
  if (code === "ACCOUNT_DELETED") return { email: "Tài khoản này không còn hoạt động." };
  if (mode === "forgotPin") return { credential: "Không thể đổi PIN. Vui lòng yêu cầu mã mới." };
  return mode === "login" ? { credential: audience === "learner" ? "Email hoặc PIN chưa đúng." : "Email hoặc mật khẩu chưa đúng." } : { email: "Không thể xử lý yêu cầu. Vui lòng thử lại." };
}

function submitLabel(mode: Mode, audience: "learner" | "staff"): string {
  if (mode === "login") return audience === "learner" ? "Đăng nhập người học" : "Đăng nhập nhân sự";
  if (mode === "register") return "Đăng ký và bắt đầu";
  if (mode === "forgotEmail") return "Gửi mã qua email";
  if (mode === "forgotStaff") return "Thông báo cho Quản lý";
  if (mode === "forgotOtp") return "Xác minh mã";
  return "Lưu mã PIN mới";
}

function normalizeHumanName(value: string): string { return value.trim().replace(/\s+/g, " ").normalize("NFC"); }
function isValidHumanName(value: string): boolean { const tokens = normalizeHumanName(value).split(" "); return tokens.length >= 2 && tokens.every((token) => /^[\p{L}\p{M}]+(?:[-'][\p{L}\p{M}]+)*$/u.test(token)); }
