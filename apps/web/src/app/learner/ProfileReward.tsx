import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent as ReactKeyboardEvent, type MouseEvent, type ReactNode } from "react";
import { AVATAR_CHARACTERS } from "@e4s/contracts";
import type { AssessmentPlacementRetakeRequestView, LearnerAvatarData, RewardView, SurveyView } from "@e4s/contracts";
import type { LearnerCallbacks, ProfileView } from "./contracts.js";
import { ProductArt } from "../shared/media/ProductArt.js";
import { ErrorText, Notice, PageTitle, AppLink, LearnerSupportCard } from "./ui.js";
import { BadgeCertificate, CertificateActions } from "./CertificateDocument.js";
import { learnerApiClient } from "../../api/learner.js";
import { OriginalPlacementModal } from "./PlacementRetakeRequest.js";
import { CourseAssessmentResult } from "./CourseCompletion.js";
import { SeasonProgressCard } from "../shared/SeasonProgressCard.js";
import { useCompactUi } from "../shared/CompactUi.js";
import { formatPercent, formatScore, formatScoreOutOf } from "../shared/format-score.js";
import { AccountAvatar, AvatarCharacterArt, AvatarMark, AVATAR_BG, AVATAR_CHARACTER_NAMES, AVATAR_COLOR_HEX } from "../shared/AccountAvatar.js";

export function LearnerSurvey({ view, actions }: { view: SurveyView; actions: LearnerCallbacks }) {
  const [rating, setRating] = useState<number | null>(view.answers?.rating ?? null);
  const [comment, setComment] = useState(view.answers?.comment ?? "");
  const [studyTime, setStudyTime] = useState<"work" | "outside" | "both">(view.answers?.studyTime ?? "work");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  if (view.state === "submitted") return <div className="app-learner-page survey-page">
    <PageTitle title="Khảo sát cuối pilot" />
    <section className="card survey-complete">
      <div className="bao-row"><ProductArt id="mascot" className="learner-mascot learner-mascot--survey" decorative /><div><h3>Cảm ơn bạn!</h3><p className="small">Bạn đã đánh giá {view.answers?.rating ?? "—"}/5. {view.answers?.comment ? `“${view.answers.comment}”` : ""}</p><AppLink className="btn" href="/profile" navigate={actions.navigate}>Xem tiến độ</AppLink></div></div>
    </section>
  </div>;
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (submitting || rating === null) return;
    setSubmitting(true); setError("");
    try { await actions.submitSurvey({ rating, comment, studyTime }); }
    catch { setError("Chưa gửi được phản hồi. Hãy kiểm tra kết nối rồi thử lại."); }
    finally { setSubmitting(false); }
  };
  return <div className="app-learner-page survey-page">
    <PageTitle title="Khảo sát cuối pilot" />
    <form className="card" aria-busy={submitting || undefined} onSubmit={(event) => void submit(event)}>
      <div className="bao-row"><ProductArt id="mascot" className="learner-mascot learner-mascot--survey" decorative /><div className="bubble">Học với mình 2 tuần qua có hữu ích không?</div></div>
      <fieldset className="survey-rating"><legend className="sr-only">Mức độ hữu ích</legend><div className="row">{[1, 2, 3, 4, 5].map((n) => <button type="button" className={`btn-lg${rating === n ? " active" : ""}`} aria-pressed={rating === n} aria-label={`${n} trên 5`} onClick={() => setRating(n)} key={n}>{n}</button>)}</div><p className="xs muted">1 = không hữu ích · 5 = rất hữu ích</p></fieldset>
      <label className="field"><span>Điều gì hữu ích nhất? Điều gì nên đổi?</span><textarea value={comment} onChange={(event) => setComment(event.target.value)} /></label>
      <label className="field"><span>Bạn học chủ yếu lúc nào?</span><select value={studyTime} onChange={(event) => setStudyTime(event.target.value as typeof studyTime)}><option value="work">Trong giờ làm</option><option value="outside">Ngoài giờ</option><option value="both">Cả hai</option></select></label>
      <ErrorText message={error} />
      <button className="btn-primary" type="submit" disabled={submitting || rating === null} aria-busy={submitting || undefined}>{submitting ? "Đang gửi…" : "Gửi khảo sát"}</button>
    </form>
  </div>;
}

export function LearnerProfile({ view, actions, courseCompleted = false }: { view: ProfileView; actions: LearnerCallbacks; courseCompleted?: boolean }) {
  const [avatarOpen, setAvatarOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const compactUi = useCompactUi();
  const avatarReturnRef = useRef<HTMLButtonElement | null>(null);
  const openAvatar = (event: MouseEvent<HTMLButtonElement>) => {
    avatarReturnRef.current = event.currentTarget;
    setAvatarOpen(true);
  };
  const closeAvatar = () => {
    const returnTarget = avatarReturnRef.current;
    setAvatarOpen(false);
    returnTarget?.focus();
  };
  if (view.profileMissing) return <div className="app-learner-page" style={{ width: "100%", maxWidth: 960, minWidth: 0, boxSizing: "border-box", paddingBottom: "calc(88px + env(safe-area-inset-bottom))" }}><PageTitle title="Tiến độ & hồ sơ" /><Notice tone="warn">Bạn chưa hoàn thành hồ sơ cá nhân.</Notice><AppLink className="btn btn-primary" href="/onboard" navigate={actions.navigate}>Điền hồ sơ</AppLink></div>;
  const level = view.learner.cefr;
  const goals = labels(view.learner.profile.goals, GOALS);
  const detail = level ? `Trình độ ${level} – ${CEFR_LABELS[level]}${goals ? ` · ${goals}.` : ""}` : "Chưa duyệt trình độ";
  return <div className="app-learner-page profile-page" style={{ width: "100%", maxWidth: 960, minWidth: 0, boxSizing: "border-box", paddingBottom: "calc(88px + env(safe-area-inset-bottom))" }}>
    <PageTitle eyebrow="Tiến độ & hồ sơ" title={view.learner.displayName} detail={detail} aside={level ? <span className={`badge lvl lvl-${level}`}>{level}</span> : null} />
    <section className="card learner-summary-card learner-summary-card--profile profile-identity-card" aria-label="Hồ sơ cá nhân">
      <div className="profile-identity-header">
        <button ref={avatarReturnRef} className="btn-ghost profile-avatar-button" type="button" aria-label="Đổi avatar" onClick={openAvatar}><AccountAvatar avatar={view.learner.profile.avatar} name={view.learner.displayName} /></button>
        <div className="profile-identity-title"><h2>Hồ sơ cá nhân</h2><div className="small muted">{avatarDescription(view.learner.profile.avatar)}</div></div>
        <div className="profile-identity-actions"><button className="btn-primary" type="button" onClick={openAvatar}>Đổi avatar</button><button className="btn" type="button" aria-expanded={profileOpen} aria-controls={profileOpen ? "profile-identity-details" : undefined} onClick={() => setProfileOpen((value) => !value)}>{profileOpen ? "Đóng thông tin" : "Xem hồ sơ"}</button></div>
      </div>
      {profileOpen ? <ProfileDetails view={view} navigate={actions.navigate} /> : null}
    </section>
    <LearnerSupportCard from="profile" navigate={actions.navigate} />
    {courseCompleted ? <section className="card profile-progress-section"><div className="profile-completion-heading"><div><div className="eyebrow">Pass Course</div><h2>Đã hoàn thành khóa E4S</h2></div><AppLink className="btn" href="/reward/course" navigate={actions.navigate}>Xem chứng nhận</AppLink></div></section> : null}
    {level ? <SeasonProgressCard compact={compactUi} view={{ ...view, badgeCount: view.badges.length }} certificateAction={
      // Only a learner who can open the certificate gets the link to it; everyone else sees its preview.
      <AppLink className="btn btn-sm" href={view.badgeCertificateAvailable ? "/reward/done" : "/reward/preview"} navigate={actions.navigate}>
        {view.badgeCertificateAvailable ? "Xem chứng nhận huy hiệu" : "Xem trước chứng nhận"}
      </AppLink>
    } /> : null}
    <section className="card profile-progress-section profile-assessment-section" aria-label="Kết quả đánh giá" style={{ background: "var(--mint)" }}><div className="profile-section-heading"><div><div className="eyebrow">Đánh giá năng lực</div><h2>Kết quả đánh giá</h2></div></div><div className={`profile-assessment-grid${courseCompleted || view.assessments.passCourse ? " grid cols-2" : ""}`}><AssessmentResult label={view.assessments.placement?.isPlacementRetake ? "Điểm thi lại đầu vào" : "Điểm đầu vào"} result={view.assessments.placement} action={view.assessments.placement ? <PlacementSubmissionReview hasRetake={view.assessments.placement.isPlacementRetake === true} /> : null} />{courseCompleted ? <CourseAssessmentResult /> : view.assessments.passCourse ? <AssessmentResult label="Điểm đầu ra" result={view.assessments.passCourse} /> : null}</div>{view.surveyAvailable && !view.monthlyProgress && !view.monthlyPreparation ? <div className="row profile-assessment-actions"><AppLink className="btn" href="/survey" navigate={actions.navigate}>Trả lời khảo sát cuối pilot</AppLink></div> : null}</section>
    {avatarOpen ? <AvatarDialog initial={view.learner.profile.avatar} name={view.learner.displayName} onClose={closeAvatar} onSave={async (avatar) => { await actions.saveAvatar(avatar); closeAvatar(); }} /> : null}
  </div>;
}

function ProfileDetails({ view, navigate }: { view: ProfileView; navigate: LearnerCallbacks["navigate"] }) {
  const { basics, preferences } = profileRows(view);
  // A short summary first (who, job, level, purpose, schedule); everything else stays behind "Xem đủ hồ sơ" so the
  // card does not become a long list of label/value rows on a phone.
  const all = [...basics, ...preferences];
  const summaryLabels = ["Họ và tên", "Vị trí công việc", "Tự đánh giá", "Mục tiêu", "Lịch học"];
  const summary = summaryLabels.flatMap(label => all.filter(([key]) => key === label));
  const rest = all.filter(([key]) => !summaryLabels.includes(key));
  return <div className="profile-identity-details" id="profile-identity-details">
    <ProfileDetailsList rows={summary} compact />
    {rest.length > 0 && <details className="profile-preferences">
      <summary>Xem đủ hồ sơ</summary>
      <ProfileDetailsList rows={rest} />
    </details>}
    <AppLink className="btn btn-sm profile-edit-link" href="/onboard" navigate={navigate}>Cập nhật hồ sơ</AppLink>
  </div>;
}

function ProfileDetailsList({ rows, compact = false }: { rows: Array<[string, string]>; compact?: boolean }) {
  return <dl className={`profile-details${compact ? " profile-details--summary" : ""}`}>
    {rows.map(([label, value]) => <div className={`profile-detail-row${value.length > 28 ? " is-long" : ""}`} key={label}>
      <dt className="small muted profile-detail-label">{label}</dt>
      <dd className="small profile-detail-value">{value}</dd>
    </div>)}
  </dl>;
}

function AssessmentResult({ label, result, action }: { label: string; result: ProfileView["assessments"]["placement"]; action?: ReactNode }) {
  const shortLabel = label === "Điểm đầu vào" ? "Đầu vào" : label;
  if (!result) return <div className="profile-assessment-result profile-assessment-result--empty" role="region" aria-label={label}>
    <div className="eyebrow">{shortLabel}</div>
    <span className="muted">Chưa có</span>
    {action}
  </div>;
  return <div className="profile-assessment-result" role="region" aria-label={label}>
    <div className="eyebrow">{shortLabel}{result.approvedLevel ? ` · ${result.approvedLevel}` : ""}</div>
    <strong className="profile-assessment-total">{formatScore(result.totalScore)}</strong>
    <div className="profile-assessment-skills">{ASSESSMENT_SKILLS.map((section) => {
      const score = result.sections[section] ?? 0;
      const max = result.sectionMaxScores?.[section];
      const percent = Math.max(0, Math.min(100, max ? score / max * 100 : score));
      return <div className="profile-assessment-skill" key={section}><span>{SECTION_LABELS[section]}</span><i aria-hidden="true"><b style={{ width: `${percent}%` }} /></i><small>{max ? formatScoreOutOf(score, max) : formatPercent(percent)}</small></div>;
    })}</div>
    {action}
  </div>;
}

function PlacementSubmissionReview({ hasRetake }: { hasRetake: boolean }) {
  const [submission, setSubmission] = useState<{ attempt: NonNullable<AssessmentPlacementRetakeRequestView["original"]>; retake: boolean }>();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);

  async function open(retake: boolean) {
    setLoading(true);
    setError(false);
    try {
      const view = await learnerApiClient.getPlacementRetakeRequest?.();
      const attempt = retake ? view?.completedRetake : view?.original;
      if (attempt) setSubmission({ attempt, retake });
      else setError(true);
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }

  return <>
    <div className="row">
      {hasRetake ? <button type="button" className="btn" disabled={loading} onClick={() => void open(true)}>Xem bài thi lại</button> : null}
      <button type="button" className="btn" disabled={loading} onClick={() => void open(false)}>{hasRetake ? "Xem bài lần đầu" : "Xem lại bài làm"}</button>
    </div>
    {error ? <ErrorText message="Chưa mở được bài làm. Vui lòng thử lại." /> : null}
    {submission ? <OriginalPlacementModal submission={submission.attempt} retake={submission.retake} onClose={() => setSubmission(undefined)} /> : null}
  </>;
}
export function AvatarDialog({ initial, name = "Avatar xem trước", onClose, onSave }: { initial: Partial<LearnerAvatarData> | undefined; name?: string; onClose: () => void; onSave: (avatar: LearnerAvatarData) => void | Promise<void> }) {
  const [avatar, setAvatar] = useState<LearnerAvatarData>({
    acc: initial?.acc ?? "none", color: initial?.color ?? "olive", bg: initial?.bg ?? 0,
    ...(initial?.character ? { character: initial.character } : {})
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const dialogRef = useRef<HTMLElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  useEffect(() => { closeRef.current?.focus({ preventScroll: true }); }, []);
  const accessories = Object.entries(AVATAR_ACC_LABELS) as Array<[LearnerAvatarData["acc"], string]>;
  const colors = Object.entries(AVATAR_COLOR_LABELS) as Array<[LearnerAvatarData["color"], string]>;
  const save = async () => {
    if (saving) return;
    setSaving(true); setError("");
    dialogRef.current?.focus({ preventScroll: true });
    try { await onSave(avatar); }
    catch { setError("Chưa lưu được avatar. Hãy kiểm tra kết nối rồi thử lại."); }
    finally { setSaving(false); }
  };
  const handleDialogKeyDown = (event: ReactKeyboardEvent<HTMLElement>) => {
    if (event.key === "Escape") {
      event.preventDefault();
      if (!saving) onClose();
      return;
    }
    if (event.key !== "Tab") return;
    const focusable = Array.from(event.currentTarget.querySelectorAll<HTMLElement>("button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [href], [tabindex]:not([tabindex='-1'])"));
    if (!focusable.length) {
      event.preventDefault();
      event.currentTarget.focus();
      return;
    }
    const first = focusable[0]!;
    const last = focusable[focusable.length - 1]!;
    if (event.shiftKey && (document.activeElement === first || document.activeElement === event.currentTarget)) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  };
  return <div className="modal-backdrop avatar-dialog-backdrop"><section ref={dialogRef} className="dialog avatar-dialog" role="dialog" tabIndex={-1} aria-modal="true" aria-labelledby="avatar-dialog-title" aria-busy={saving || undefined} onKeyDown={handleDialogKeyDown}>
    <header className="avatar-dialog-preview"><AccountAvatar avatar={avatar} name={name} size={48} /><div><h2 id="avatar-dialog-title">Avatar của bạn</h2><p>{name}</p></div></header>
    <div className="avatar-dialog-options">
      <fieldset disabled={saving}>
        <legend>Nhân vật Season English</legend>
        <div className="avatar-character-options">
          {AVATAR_CHARACTERS.map(character => <button key={character} type="button" aria-pressed={avatar.character === character}
            onClick={() => setAvatar({ ...avatar, character })}>
            <AvatarCharacterArt character={character} />{AVATAR_CHARACTER_NAMES[character]}
          </button>)}
        </div>
      </fieldset>
      <fieldset disabled={saving}>
        <legend>Biểu tượng</legend>
        <div className="avatar-symbol-options">
          {accessories.map(([key, text]) => <button key={key} type="button" aria-pressed={!avatar.character && avatar.acc === key}
            onClick={() => setAvatar({ acc: key, color: avatar.color, bg: avatar.bg })}>
            {key === "none" ? <span aria-hidden="true" className="avatar-symbol-initials">Aa</span> : <AvatarMark acc={key} size={20} />}
            <span className="avatar-option-label">{text}</span>
          </button>)}
        </div>
      </fieldset>
      {!avatar.character && <fieldset disabled={saving}><legend>Màu nét <span>· {AVATAR_COLOR_LABELS[avatar.color]}</span></legend><div className="avatar-swatch-options">{colors.map(([key, text]) => <button type="button" aria-label={text} title={text} aria-pressed={avatar.color === key} onClick={() => setAvatar({ ...avatar, color: key })} key={key}><span aria-hidden="true" style={{ background: AVATAR_COLOR_HEX[key] }} /></button>)}</div></fieldset>}
      <fieldset disabled={saving}><legend>Màu nền <span>· {AVATAR_BG_LABELS[avatar.bg]}</span></legend><div className="avatar-swatch-options">{AVATAR_BG.map((background, bg) => <button type="button" aria-label={`Màu nền ${AVATAR_BG_LABELS[bg]}`} title={AVATAR_BG_LABELS[bg]} aria-pressed={avatar.bg === bg} onClick={() => setAvatar({ ...avatar, bg: bg as LearnerAvatarData["bg"] })} key={background}><span aria-hidden="true" style={{ background }} /></button>)}</div></fieldset>
      <ErrorText message={error} />
    </div>
    <footer className="avatar-dialog-actions"><button ref={closeRef} type="button" disabled={saving} onClick={onClose}>Huỷ</button><button className="btn-primary" type="button" disabled={saving} aria-busy={saving || undefined} onClick={() => void save()}>{saving ? "Đang lưu…" : "Lưu avatar"}</button></footer>
  </section></div>;
}
function profileRows(view: ProfileView) {
  const p = view.learner.profile;
  const level = view.learner.cefr;
  const explanation = p.explanationLanguage === "vi" ? "Tiếng Việt" : p.explanationLanguage === "en" ? "Tiếng Anh" : level ? `${level === "A1" || level === "A2" ? "Tiếng Việt" : "Tiếng Anh"} (tự động theo mức ${level})` : "Tự động theo trình độ";
  const basics: Array<[string, string]> = [
    ["Họ và tên", p.fullName ?? view.learner.displayName],
    ["Email", p.email ?? ""],
    ["Phòng ban / team", p.department ?? ""],
    ["Vị trí công việc", p.position ?? ""],
    ["Base", p.contact ?? ""]
  ];
  const preferences: Array<[string, string]> = [
    ["Mục tiêu", labels(p.goals, GOALS)],
    ["Mức độ dùng ở công ty", label(p.environmentUse, ENVIRONMENT_USE)],
    ["Dùng trong gia đình", label(p.familyUse, FAMILY_USE)],
    ["Thói quen ngoài việc", labels(p.habits, HABITS)],
    ["Tình huống", p.situations ?? ""],
    ["Cách học thích", labels(p.learningStyles, LEARNING_STYLES)],
    ["Giải thích bằng", explanation],
    ["Thời lượng mỗi buổi", p.durationMinutes ? p.durationMinutes === 20 ? "20+ phút" : `${p.durationMinutes} phút` : ""],
    ["Thiết bị hay dùng", p.device ? label(p.device, DEVICES) : ""],
    ["Lịch học", p.durationMinutes ? "5 ngày/tuần (T2–T6)" : ""],
    ["Tự đánh giá", label(p.selfLevel, SELF_LEVELS)],
    ["Chứng chỉ", (p.certificates ?? []).map((certificate) => `${certificate.type} ${certificate.result}${certificate.year ? ` (${certificate.year})` : ""}`).join(", ")],
    ["Đã học", p.experience ?? ""],
    ["Lo ngại / mong muốn", p.concerns ?? ""]
  ];
  return {
    basics: basics.filter(([, value]) => value),
    preferences: preferences.filter(([, value]) => value)
  };
}

const CEFR_LABELS = { A1: "Mới bắt đầu", A2: "Sơ cấp", B1: "Trung cấp", B2: "Khá", C1: "Tốt" } as const;
const GOALS: Record<string, string> = { customer: "Nói chuyện với khách hàng / đối tác", email: "Viết email, tin nhắn công việc", meeting: "Họp và trình bày", docs: "Đọc tài liệu, spec kỹ thuật", career: "Thăng tiến / phỏng vấn", confidence: "Tự tin hơn khi nói", travel: "Du lịch" };
const ENVIRONMENT_USE: Record<string, string> = { daily: "Hằng ngày", weekly: "Vài lần mỗi tuần", monthly: "Thỉnh thoảng (vài lần/tháng)", rarely: "Hiếm khi / chưa dùng" };
const FAMILY_USE: Record<string, string> = { daily: "Hằng ngày (người thân nói tiếng Anh)", often: "Thường xuyên", weekly: "Vài lần mỗi tuần", sometimes: "Thỉnh thoảng", monthly: "Thỉnh thoảng", never: "Không dùng", none: "Không dùng" };
const HABITS: Record<string, string> = { movies: "Xem phim / video tiếng Anh", music: "Nghe nhạc / podcast", podcast: "Nghe nhạc / podcast", reading: "Đọc tin tức, tài liệu", documents: "Đọc tin tức, tài liệu", social: "Mạng xã hội, chat tiếng Anh", speak: "Nói chuyện với người nước ngoài", app: "Học qua app / khoá học", none: "Chưa có thói quen nào" };
const LEARNING_STYLES: Record<string, string> = { reading: "Đọc và ghi chú", listening: "Nghe và nhắc lại", speaking: "Nói / hội thoại", quiz: "Trắc nghiệm, điền từ", practice: "Thử thách ngắn", writing: "Viết câu, viết email", examples: "Ví dụ sát việc đang làm", games: "Thử thách ngắn, có điểm" };
const DEVICES: Record<string, string> = { phone: "Điện thoại", laptop: "Máy tính", computer: "Máy tính", both: "Cả hai" };
const SELF_LEVELS: Record<string, string> = { unknown: "Không rõ", A1: "Mới bắt đầu (A1)", A2: "Sơ cấp (A2)", B1: "Trung cấp (B1)", B2: "Khá (B2)", C1: "Tốt (C1)" };
const ASSESSMENT_SKILLS = ["listening", "reading", "writing", "speaking"] as const;
const SECTION_LABELS: Record<string, string> = { listening: "Nghe", reading: "Đọc", writing: "Viết", speaking: "Nói" };
const AVATAR_ACC_LABELS: Record<string, string> = { none: "Chữ cái đầu", leaf: "Lá", sun: "Nắng", flower: "Hoa", cloud: "Mây", star: "Sao", drop: "Giọt mưa", snow: "Tuyết" };
const AVATAR_COLOR_LABELS: Record<string, string> = { ink: "Mực", brown: "Nâu", olive: "Ô liu", taupe: "Xám nâu", orange: "Cam", rose: "Đỏ hồng" };
const AVATAR_BG_LABELS = ["Vàng", "Hồng nhạt", "Tím nhạt", "Xanh nhạt", "Kem", "Be"] as const;
function label(value: string | undefined, dictionary: Record<string, string>) { return value ? dictionary[value] ?? value : ""; }
function labels(values: readonly string[] | undefined, dictionary: Record<string, string>) { return (values ?? []).map((value) => label(value, dictionary)).join(", "); }
function avatarDescription(avatar: Partial<LearnerAvatarData> | undefined) {
  if (avatar?.character && AVATAR_CHARACTER_NAMES[avatar.character]) return AVATAR_CHARACTER_NAMES[avatar.character];
  return avatar ? `${label(avatar.acc, AVATAR_ACC_LABELS)} · nét ${label(avatar.color, AVATAR_COLOR_LABELS).toLowerCase()}` : "Chưa chọn – đang hiện chữ cái đầu";
}

export function LearnerReward({ view, actions }: { view: RewardView; actions: LearnerCallbacks }) {
  const preview = view.mode === "preview";
  const backHref = preview ? "/profile" : "/home";
  const printingRequirement = "Bạn có thể in chứng nhận sau khi đạt C1 và được duyệt bài thi cuối tháng.";
  return <div className="app-learner-page reward-page rw">
    <BadgeCertificate view={view} preview={preview} {...(preview ? { previewInfo: printingRequirement } : {})} />
    <CertificateActions>{preview ? <span className="xs muted reward-print-note">{printingRequirement}</span> : <button className="btn" type="button" disabled={!view.printable} onClick={actions.printReward}>In / lưu chứng nhận (PDF, 1 trang A4 ngang)</button>}<AppLink className="btn btn-primary" href={backHref} navigate={actions.navigate}>{preview ? "← Quay lại" : "Tiếp tục học"}</AppLink></CertificateActions>
  </div>;
}


