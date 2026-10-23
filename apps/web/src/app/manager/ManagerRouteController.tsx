import { useEffect, useRef, useState, type FormEvent } from "react";
import "./manager.css";
import { Navigate, Route, Routes, useLocation } from "react-router";
import type { ManagerAccountView, ManagerAccountsView, ManagerDeleteRequestsView, ManagerLearnerProfileView, ManagerMaintenanceAction, ManagerMaintenanceConfirmationInput, ManagerMaintenanceConfirmationView, ManagerOperationsView, ManagerPinReportsView, ManagerProgressView, ManagerProviderSettingsInput, ManagerProviderSettingsView, ManagerPurgeConfirmationView, ManagerRemindersView, ManagerReportView, ManagerSettingsInput, ManagerSettingsView, ManagerTrashView, OperatorSettingsOverviewView, OrganisationExperienceInput, OrganisationExperienceView, ProductPreferencesView, SystemCapabilitiesView } from "@e4s/contracts";
import { managerApiClient as apiClient } from "../../api/manager.js";
import { providerTestLabel, SettingsPage, webhookTestLabel } from "../settings/index.js";
import { ManagerOperations } from "./Operations.js";
import { ManagerProgress } from "./Progress.js";
import { ManagerRecovery } from "./Recovery.js";
import { ManagerReminders } from "./Reminders.js";
import { ManagerReport } from "./Report.js";
import { ManagerRewards } from "./Rewards.js";
import { ManagerRewardCertificate } from "./RewardCertificate.js";
import { downloadText, PageTitle } from "./shared.js";
import { useDialog, useModal } from "../shared/ModalProvider.js";
import { autoSeasonTheme } from "../games/season-visual.js";
import { OperationsRouteController } from "../operator/OperatorRouteController.js";
import { useTheme } from "../shared/ThemeProvider.js";
import { useToast } from "../shared/design-system.js";
import { ArchiveRestore, ChevronDown, Eye, EyeOff, ShieldCheck } from "lucide-react";

export type ManagerRouteControllerProps = { role: "manager" | "operator"; currentUserId: string };

export function ManagerRouteController({ role, currentUserId }: ManagerRouteControllerProps) {
  const location = useLocation();
  useEffect(() => {
    if (window.innerWidth < 761 || window.innerWidth > 960) return;
    const revealActiveLink = () => {
      const activeLink = document.querySelector<HTMLElement>('nav[aria-label="Điều hướng quản lý"] a.active');
      const nav = activeLink?.closest<HTMLElement>("nav");
      if (!activeLink || !nav) return;
      activeLink.scrollIntoView({ block: "nearest", inline: "nearest" });
      const navRect = nav.getBoundingClientRect();
      const linkRect = activeLink.getBoundingClientRect();
      if (linkRect.left < navRect.left) nav.scrollLeft -= navRect.left - linkRect.left;
      if (linkRect.right > navRect.right) nav.scrollLeft += linkRect.right - navRect.right;
    };
    if (typeof window.requestAnimationFrame === "function") {
      const frame = window.requestAnimationFrame(revealActiveLink);
      return () => window.cancelAnimationFrame(frame);
    }
    const timer = window.setTimeout(revealActiveLink, 0);
    return () => window.clearTimeout(timer);
  }, [location.pathname]);
  return <Routes>
    <Route path="/mgr" element={role === "manager" ? <ProgressRoute /> : <Navigate replace to="/op" />} />
    <Route path="/mgr/ops" element={role === "manager" ? <OperationsRoute /> : <Navigate replace to="/op" />} />
    <Route path="/mgr/ops/*" element={role === "manager" ? <OperationsRouteController basePath="/mgr/ops" session={{ role: "manager", user: { id: currentUserId, displayName: "Quản lý", email: null }, permissions: [] }} /> : <Navigate replace to="/op" />} />
    <Route path="/mgr/recovery" element={<Navigate replace to={role === "manager" ? "/settings" : "/op"} />} />
    <Route path="/mgr/reminders" element={role === "manager" ? <RemindersRoute /> : <Navigate replace to="/op" />} />
    <Route path="/mgr/report" element={role === "manager" ? <ReportRoute currentUserId={currentUserId} /> : <Navigate replace to="/op" />} />
    <Route path="/mgr/rewards" element={role === "manager" ? <ManagerRewards /> : <Navigate replace to="/op" />} />
    <Route path="/reward/preview" element={role === "manager" ? <ManagerRewardCertificate /> : <Navigate replace to="/op" />} />
    <Route path="/settings" element={<SettingsRoute role={role} currentUserId={currentUserId} />} />
  </Routes>;
}

function ProgressRoute() {
  const [view, setView] = useState<ManagerProgressView>(); const [error, setError] = useState(""); const [notice, setNotice] = useState("");
  const [deleteRequests, setDeleteRequests] = useState<ManagerDeleteRequestsView>(); const [reminders, setReminders] = useState<ManagerRemindersView>(); const [profile, setProfile] = useState<ManagerLearnerProfileView>();
  const modal = useModal();
  const load = async () => {
    const [progress, requests] = await Promise.all([apiClient.getManagerProgress(), apiClient.getManagerDeleteRequests()]);
    setView(progress); setDeleteRequests(requests);
    const queue = await apiClient.getManagerReminders().catch(() => undefined);
    if (queue) setReminders(queue);
  };
  useEffect(() => { void load().catch(() => setError("Không tải được tiến độ nhóm.")); }, []);
  if (!view) return <RouteState error={error} title="Tiến độ nhóm" label="Đang tải tiến độ nhóm" />;
  const openOperationalItem = async (kind: "delete" | "trash", id: string) => {
    setError("");
    try {
      if (kind === "delete") {
        const request = deleteRequests?.requests.find((item) => item.id === id);
        if (request?.status === "pending" && await modal.confirm({ title: "Duyệt xoá tài khoản", message: <>Duyệt xoá quyền truy cập của <b>{request.learnerName}</b>? Dữ liệu học và audit vẫn được giữ để đối soát.</>, confirmLabel: "Duyệt xoá", cancelLabel: "Huỷ", tone: "danger" })) { await apiClient.decideManagerDeleteRequest(id, { status: "approved", note: "Đã xác nhận từ hàng đợi Quản lý." }); setNotice("Đã duyệt yêu cầu xoá tài khoản."); await load(); }
        return;
      }
      if (kind === "trash") return;
    } catch { setError("Không cập nhật được tác vụ vận hành."); }
  };
  const openProfile = async (learnerId: string) => { setError(""); try { setProfile(await apiClient.getManagerLearnerProfile(learnerId)); } catch { setError("Không tải được hồ sơ học viên."); } };
  const assignWeeklyPractice = async (learnerId: string) => {
    const learner = view.learners.find((item) => item.learnerId === learnerId);
    if (!learner) return;
    const confirmed = await modal.confirm({
      title: "Giao bài thực hành tuần",
      message: <>Giao bài thực hành của tuần hiện tại cho <b>{learner.learnerName}</b>? Nếu bài đã được giao, hệ thống sẽ giữ nguyên bài cũ.</>,
      confirmLabel: "Giao bài tuần",
      cancelLabel: "Huỷ"
    });
    if (!confirmed) return;
    setError("");
    try {
      const assignment = await apiClient.assignManagerWeeklyPractice(learnerId);
      setNotice(assignment.status === "assigned" ? `Đã giao bài tuần ${assignment.weekNumber}: ${assignment.topic}.` : `Bài tuần ${assignment.weekNumber} đã được giao trước đó.`);
      await load();
    } catch { setError("Không giao được bài tuần. Hãy kiểm tra tuần và bộ bài đã publish cho mức của học viên."); }
  };
  const operationalProps = {
    ...(deleteRequests ? { deleteRequests: deleteRequests.requests.filter((item) => item.status === "pending").map((item) => ({ id: item.id, title: item.learnerName, detail: `${item.reason} · ${item.status}` })) } : {}),
    onOpenOperationalItem: openOperationalItem
  };
  const deleteLearner = async (learnerId: string) => {
    const learner = view.learners.find((item) => item.learnerId === learnerId);
    if (!learner) return;
    const confirmed = await modal.confirm({
      title: "Xoá quyền truy cập học viên",
      message: <>Xoá quyền truy cập của <b>{learner.learnerName}</b>? Dữ liệu học và audit vẫn được giữ để đối soát.</>,
      confirmLabel: "Xoá học viên",
      cancelLabel: "Huỷ",
      tone: "danger"
    });
    if (!confirmed) return;
    setError("");
    try { await apiClient.updateManagerAccountStatus(learnerId, "deleted"); await load(); setNotice("Đã xoá quyền truy cập của học viên."); } catch { setError("Không xoá được tài khoản học viên."); }
  };
  return <>{notice ? <div className="banner ok"><div className="body small">{notice}</div></div> : null}<ManagerProgress view={view} {...(reminders ? { pendingReminderCount: reminders.candidates.length } : {})} onOpenLearnerProfile={openProfile} onAssignWeeklyPractice={assignWeeklyPractice} {...operationalProps} onDeleteLearner={deleteLearner} />{profile ? <LearnerProfileDialog view={profile} onClose={() => setProfile(undefined)} /> : null}{error ? <div className="banner danger" role="alert"><div className="body small">{error}</div></div> : null}</>;
}

function LearnerProfileDialog({ view, onClose }: { view: ManagerLearnerProfileView; onClose: () => void }) {
  const dialogRef = useRef<HTMLElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  useDialog(true, dialogRef, onClose, closeRef);
  const profile = view.profile;
  const level = view.learner.currentLevel;
  const rows: Array<[string, string]> = [
    ["Công việc", [profile.position, profile.department].filter(Boolean).join(" · ")],
    ["Email", profile.email ?? view.learner.email ?? ""],
    ["Base", profile.contact ?? ""],
    ["Dùng tiếng Anh để", managerProfileLabels("goals", profile.goals)],
    ["Mức độ dùng ở công ty", managerProfileLabel("environmentUse", profile.environmentUse)],
    ["Dùng trong gia đình", managerProfileLabel("familyUse", profile.familyUse)],
    ["Thói quen ngoài việc", managerProfileLabels("habits", profile.habits)],
    ["Tình huống", profile.situations ?? ""],
    ["Cách học thích", managerProfileLabels("learningStyles", profile.learningStyles)],
    ["Giải thích bằng", level ? (level === "A1" || level === "A2" ? `Tiếng Việt (tự động theo mức ${level})` : `Tiếng Anh (tự động theo mức ${level})`) : "Tự động theo trình độ"],
    ["Phong cách Season", profile.persona === "formal" ? "Formal · Trang trọng" : "Informal · Thân thiện"],
    ["Lịch học", [profile.durationMinutes ? `${profile.durationMinutes} phút/buổi` : "", "5 ngày/tuần (T2–T6)", managerProfileLabel("device", profile.device)].filter(Boolean).join(" · ")],
    ["Tự đánh giá", managerProfileLabel("selfLevel", profile.selfLevel)],
    ["Chứng chỉ", (profile.certificates ?? []).map(formatManagerCertificate).filter(Boolean).join(", ")],
    ["Đã học", profile.experience ?? ""],
    ["Lo ngại / mong muốn", profile.concerns ?? ""]
  ].filter((row): row is [string, string] => Boolean(row[1]));
  return <div className="modal-backdrop manager-modal-backdrop" role="presentation" onClick={(event) => { if (event.target === event.currentTarget) onClose(); }}><section ref={dialogRef} className="dialog manager-learner-profile-dialog" role="dialog" aria-modal="true" aria-label={`Hồ sơ ${view.learner.displayName}`} tabIndex={-1}><div className="row between manager-dialog-heading"><h3><span className="name">{view.learner.displayName}</span></h3><button ref={closeRef} className="btn-sm" type="button" onClick={onClose}>Đóng</button></div><div className="card soft manager-profile-card">{rows.length ? <><div className="manager-profile-title"><b>Hồ sơ cá nhân</b></div><div className="manager-profile-rows">{rows.map(([label, value]) => <div className="manager-profile-row" key={label}><span className="xs muted manager-profile-label">{label}</span><span className="small manager-profile-value">{value}</span></div>)}</div></> : <p className="small muted" style={{ margin: 0 }}>Chưa điền hồ sơ cá nhân.</p>}</div></section></div>;
}

const managerProfileOptions: Record<string, Record<string, string>> = {
  goals: { customer: "Nói chuyện với khách hàng / đối tác", email: "Viết email, tin nhắn công việc", meeting: "Họp và trình bày", docs: "Đọc tài liệu, spec kỹ thuật", career: "Thăng tiến / phỏng vấn", confidence: "Tự tin hơn khi nói" },
  environmentUse: { daily: "Hằng ngày", weekly: "Vài lần mỗi tuần", monthly: "Thỉnh thoảng (vài lần/tháng)", rarely: "Hiếm khi / chưa dùng" },
  familyUse: { daily: "Hằng ngày (người thân nói tiếng Anh)", weekly: "Vài lần mỗi tuần", monthly: "Thỉnh thoảng", never: "Không dùng", none: "Không dùng" },
  habits: { movies: "Xem phim / video tiếng Anh", music: "Nghe nhạc / podcast", podcast: "Nghe nhạc / podcast", reading: "Đọc tin tức, tài liệu", documents: "Đọc tin tức, tài liệu", social: "Mạng xã hội, chat tiếng Anh", speak: "Nói chuyện với người nước ngoài", app: "Học qua app / khoá học", none: "Chưa có thói quen nào" },
  learningStyles: { reading: "Đọc và ghi chú", listening: "Nghe và nhắc lại", speaking: "Nói / hội thoại", quiz: "Trắc nghiệm, điền từ", writing: "Viết câu, viết email", examples: "Ví dụ sát việc đang làm", games: "Thử thách ngắn, có điểm" },
  device: { phone: "Điện thoại", computer: "Máy tính", laptop: "Máy tính", both: "Cả hai" },
  selfLevel: { unknown: "Không rõ", A1: "Mới bắt đầu (A1)", A2: "Sơ cấp (A2)", B1: "Trung cấp (B1)", B2: "Khá (B2)", C1: "Tốt (C1)" },
  certificate: { ielts: "IELTS", toeic: "TOEIC", toefl: "TOEFL iBT", cambridge: "Cambridge (KET/PET/FCE/CAE)", vstep: "VSTEP", other: "Khác" }
};

function managerProfileLabel(group: string, value: string | undefined): string {
  return value ? managerProfileOptions[group]?.[value] ?? value : "";
}

function managerProfileLabels(group: string, values: readonly string[] | undefined): string {
  return (values ?? []).map((value) => managerProfileLabel(group, value)).filter(Boolean).join(", ");
}

function formatManagerCertificate(certificate: { type: string; result: string; year?: string }): string {
  const name = managerProfileLabel("certificate", certificate.type);
  return [name, certificate.result, certificate.year ? `(${certificate.year})` : ""].filter(Boolean).join(" ");
}

export function PurgeConfirmationDialog({ accountName, confirmation, busy, onCancel, onConfirm }: { accountName: string; confirmation: ManagerPurgeConfirmationView; busy: boolean; onCancel: () => void; onConfirm: (phrase: string) => void | Promise<void> }) {
  const [remaining, setRemaining] = useState<number>(confirmation.countdownSeconds);
  const [phrase, setPhrase] = useState("");
  const dialogRef = useRef<HTMLElement>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);
  useDialog(true, dialogRef, onCancel, cancelRef);
  useEffect(() => {
    if (remaining <= 0) return undefined;
    const timer = window.setTimeout(() => setRemaining((current) => Math.max(0, current - 1)), 1000);
    return () => window.clearTimeout(timer);
  }, [remaining]);
  const ready = remaining === 0 && phrase.trim() === confirmation.confirmationPhrase;
  return <div className="modal-backdrop manager-modal-backdrop" role="presentation" onClick={(event) => { if (event.target === event.currentTarget && !busy) onCancel(); }}><section ref={dialogRef} className="dialog manager-purge-dialog" role="dialog" aria-modal="true" aria-label="Xác nhận xoá vĩnh viễn" tabIndex={-1}><h2>Xoá vĩnh viễn tài khoản?</h2><p>Thông tin đăng nhập và dữ liệu cá nhân sẽ bị xoá; lịch sử học được giữ ẩn danh. Tài khoản: <b>{accountName}</b>.</p><p className="small muted">{remaining > 0 ? `Có thể xác nhận sau ${remaining} giây…` : "Đã sẵn sàng xác nhận."}</p><div className="countdown" aria-live="assertive">{remaining}</div><label className="field"><span>Nhập <code>{confirmation.confirmationPhrase}</code> để xác nhận</span><input aria-label="Cụm từ xác nhận" value={phrase} onChange={(event) => setPhrase(event.target.value)} autoComplete="off" /></label><div className="manager-purge-dialog__actions"><button ref={cancelRef} className="btn-sm" type="button" onClick={onCancel} disabled={busy}>Dừng lại</button><button className="btn-sm btn-danger" type="button" aria-label="Xoá vĩnh viễn tài khoản" disabled={!ready || busy} onClick={() => void onConfirm(phrase)}>{busy ? "Đang xoá…" : "Xoá vĩnh viễn"}</button></div></section></div>;
}

export function MaintenanceConfirmationDialog({ confirmation, busy, onCancel, onConfirm }: { confirmation: ManagerMaintenanceConfirmationView; busy: boolean; onCancel: () => void; onConfirm: (phrase: string) => void | Promise<void> }) {
  const [remaining, setRemaining] = useState<number>(confirmation.countdownSeconds);
  const [phrase, setPhrase] = useState("");
  const dialogRef = useRef<HTMLElement>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);
  useDialog(true, dialogRef, onCancel, cancelRef);
  useEffect(() => {
    if (remaining <= 0) return undefined;
    const timer = window.setTimeout(() => setRemaining((current) => Math.max(0, current - 1)), 1000);
    return () => window.clearTimeout(timer);
  }, [remaining]);
  const isWipe = confirmation.action === "wipe_data";
  const ready = remaining === 0 && phrase.trim() === confirmation.confirmationPhrase;
  return <div className="modal-backdrop manager-modal-backdrop" role="presentation" onClick={(event) => { if (event.target === event.currentTarget && !busy) onCancel(); }}><section ref={dialogRef} className="dialog" role="dialog" aria-modal="true" aria-label={isWipe ? "Xác nhận xoá toàn bộ" : "Xác nhận nạp dữ liệu mẫu"} tabIndex={-1}><h2>{isWipe ? "Xoá toàn bộ dữ liệu?" : "Nạp lại dữ liệu mẫu?"}</h2><p>{isWipe ? "Máy chủ sẽ xoá dữ liệu tổ chức local hiện tại. Bản sao server đã được lưu trước khi xác nhận." : "Máy chủ sẽ ghi đè dữ liệu demo hiện tại bằng fixture mẫu. Bản sao server đã được lưu trước khi xác nhận."}</p><p className="small muted">{remaining > 0 ? `Có thể xác nhận sau ${remaining} giây…` : "Đã sẵn sàng xác nhận."}</p><div className="countdown" aria-live="assertive">{remaining}</div><label className="field"><span>Nhập <code>{confirmation.confirmationPhrase}</code> để xác nhận</span><input aria-label="Cụm từ xác nhận dữ liệu" value={phrase} onChange={(event) => setPhrase(event.target.value)} autoComplete="off" /></label><div className="row"><button ref={cancelRef} className="btn-sm" type="button" onClick={onCancel} disabled={busy}>Dừng lại</button><button className="btn-sm btn-danger" type="button" disabled={!ready || busy} onClick={() => void onConfirm(phrase)}>{busy ? "Đang xử lý…" : isWipe ? "Xoá toàn bộ" : "Nạp dữ liệu mẫu"}</button></div></section></div>;
}

function OperationsRoute() {
  const [view, setView] = useState<ManagerOperationsView>(); const [deleteRequests, setDeleteRequests] = useState<ManagerDeleteRequestsView>(); const [error, setError] = useState("");
  const load = async () => {
    setView(await apiClient.getManagerOperations());
    const requests = await apiClient.getManagerDeleteRequests().catch(() => undefined);
    if (requests) setDeleteRequests(requests);
  };
  useEffect(() => { void load().catch(() => setError("Không tải được hiệu suất vận hành.")); }, []);
  if (!view) return <RouteState error={error} title="Hiệu suất vận hành" label="Đang tải hiệu suất vận hành" />;
  const deleteRequestCounts = deleteRequests?.requests.reduce<Record<string, number>>((counts, request) => { counts[request.requestedBy] = (counts[request.requestedBy] ?? 0) + 1; return counts; }, {});
  return <>{error ? <div className="banner danger" role="alert"><div className="body small">{error}</div></div> : null}<ManagerOperations view={view} {...(deleteRequestCounts ? { deleteRequestCounts } : {})} /></>;
}

function RemindersRoute() {
  const toast = useToast();
  const [view, setView] = useState<ManagerRemindersView>(); const [loadError, setLoadError] = useState(""); const [contextNotice, setContextNotice] = useState(""); const [sending, setSending] = useState<string | null>(null);
  const load = () => apiClient.getManagerReminders().then(setView);
  useEffect(() => { void load().catch(() => setLoadError("Không tải được danh sách nhắc học.")); }, []);
  if (!view) return <RouteState error={loadError} title="Nhắc học" label="Đang tải danh sách nhắc học" />;
  const reminderError = (cause: unknown, fallback: string) => {
    const code = cause instanceof Error ? cause.message : "";
    if (code === "MANAGER_REMINDER_NOT_ELIGIBLE") return "Người học không còn đủ điều kiện nhắc. Danh sách đã được cập nhật; có thể họ vừa học lại hoặc đã được xử lý trong hôm nay.";
    if (code === "BASE_WEBHOOK_NOT_CONFIGURED") return "Webhook Base.vn chưa được cấu hình. Hãy ghi nhận để gửi tay hoặc cập nhật trong Cài đặt.";
    if (code === "BASE_WEBHOOK_TIMEOUT") return "Webhook Base.vn phản hồi quá chậm. Hãy thử lại hoặc gửi tay.";
    if (code === "BASE_WEBHOOK_NETWORK_ERROR") return "Không kết nối được webhook Base.vn. Kiểm tra mạng hoặc gửi tay.";
    return fallback;
  };
  const reportReminderError = (cause: unknown, fallback: string) => {
    const message = reminderError(cause, fallback);
    if (cause instanceof Error && cause.message === "BASE_WEBHOOK_NOT_CONFIGURED") setContextNotice(message);
    else toast.show({ message, tone: "danger" });
  };
  return <ManagerReminders view={view} sendingLearnerId={sending} notice={contextNotice} noticeTone="danger" onSend={async (learnerId) => { setSending(learnerId); try { const result = await apiClient.sendManagerReminder(learnerId, crypto.randomUUID()); await load(); setContextNotice(""); toast.show({ message: result.provider === "local_queue" ? "Đã ghi nhận để gửi tay và lưu vào lịch sử." : "Đã xếp hàng gửi qua Base.vn và lưu vào lịch sử.", tone: "ok" }); } catch (cause) { reportReminderError(cause, "Không xử lý được nhắc học. Vui lòng thử lại."); } finally { setSending(null); } }} onDismiss={async (learnerId) => { try { await apiClient.dismissManagerReminder(learnerId); await load(); setContextNotice(""); toast.show({ message: "Đã ghi nhận đã nhắc qua kênh khác.", tone: "ok" }); } catch (cause) { reportReminderError(cause, "Không ghi nhận được trạng thái đã nhắc qua kênh khác."); throw new Error("REMINDER_DISMISS_FAILED"); } }} onCopy={async (learnerId) => { try { await apiClient.copyManagerReminder(learnerId); await load(); setContextNotice(""); toast.show({ message: "Đã copy tin nhắn và ghi nhận vào lịch sử.", tone: "ok" }); } catch (cause) { reportReminderError(cause, "Không ghi nhận được việc copy tin nhắn."); } }} />;
}

function ReportRoute({ currentUserId }: { currentUserId: string }) {
  const [view, setView] = useState<ManagerReportView>(); const [settings, setSettings] = useState<ManagerSettingsView>(); const [accounts, setAccounts] = useState<ManagerAccountsView>(); const [error, setError] = useState("");
  useEffect(() => { void (async () => {
    try {
      const [[report, nextSettings], directory] = await Promise.all([Promise.all([apiClient.getManagerReport(), apiClient.getManagerSettings()]), apiClient.getManagerAccounts().catch(() => undefined)]);
      setView(report); setSettings(nextSettings); setAccounts(directory);
    } catch { setError("Không tải được báo cáo tổ chức."); }
  })(); }, []);
  const managerName = accounts?.accounts.find((account) => account.id === currentUserId)?.displayName;
  return view && settings ? <ManagerReport view={view} courseTheme={settings.courseTheme} pilotStartDate={settings.pilotStartDate} {...(managerName ? { managerName } : {})} /> : <RouteState error={error} title="Báo cáo tổng kết" label="Đang tải báo cáo" />;
}

function SettingsRoute({ role, currentUserId }: ManagerRouteControllerProps) {
  const { setTheme } = useTheme();
  const toast = useToast();
  const [manager, setManager] = useState<ManagerSettingsView>(); const [provider, setProvider] = useState<ManagerProviderSettingsView>(); const [operatorOverview, setOperatorOverview] = useState<OperatorSettingsOverviewView>(); const [product, setProduct] = useState<ProductPreferencesView>(); const [experience, setExperience] = useState<OrganisationExperienceView>(); const [capabilities, setCapabilities] = useState<SystemCapabilitiesView>(); const [accounts, setAccounts] = useState<ManagerAccountsView>(); const [pinReports, setPinReports] = useState<ManagerPinReportsView>(); const [loadError, setLoadError] = useState(""); const [maintenanceDialog, setMaintenanceDialog] = useState<{ action: ManagerMaintenanceAction; confirmation: ManagerMaintenanceConfirmationView }>(); const [maintenanceBusy, setMaintenanceBusy] = useState(false);
  const loadAccounts = () => apiClient.getManagerAccounts().then(setAccounts);
  const notify = (message: string, tone: "ok" | "danger" = "ok") => { toast.show({ message, tone }); };
  const providerClientAvailable = role === "manager" && typeof apiClient.getManagerProviderSettings === "function";
  useEffect(() => {
    const requests: Promise<unknown>[] = [apiClient.getProductPreferences().then(setProduct), apiClient.getOrganisationExperience().then(setExperience).catch(() => undefined), apiClient.getSystemCapabilities().then(setCapabilities)];
    if (role === "manager") {
      requests.push(apiClient.getManagerSettings().then(setManager), loadAccounts(), apiClient.getManagerPinReports().then(setPinReports));
    } else requests.push(apiClient.getOperatorSettingsOverview().then(setOperatorOverview));
    if (providerClientAvailable) requests.push(apiClient.getManagerProviderSettings().then(setProvider));
    void Promise.all(requests).catch(() => setLoadError("Không tải được cấu hình hệ thống."));
  }, [providerClientAvailable, role]);
  useEffect(() => {
    if (experience || !product) return;
    const legacySettings = manager ?? operatorOverview?.settings;
    if (!legacySettings) return;
    setExperience({
      theme: product.theme,
      backgroundMusic: {
        enabled: legacySettings.backgroundMusic.enabled,
        playlistId: "auto",
        customUrl: legacySettings.backgroundMusic.url,
        volume: legacySettings.backgroundMusic.volume
      }
    });
  }, [experience, manager, operatorOverview, product]);
  if (!product || !experience || !capabilities || (providerClientAvailable && !provider) || (role === "manager" && (!manager || !accounts)) || (role === "operator" && !operatorOverview)) return <RouteState error={loadError} title="Cài đặt" label="Đang tải cài đặt" />;
  const saveAi = providerClientAvailable ? async (input: ManagerProviderSettingsInput) => { try { setProvider(await apiClient.saveManagerProviderSettings(input)); setCapabilities(await apiClient.getSystemCapabilities()); notify("Đã lưu cấu hình AI an toàn trên server."); } catch { notify("Không lưu được cấu hình AI.", "danger"); } } : undefined;
  const testAi = providerClientAvailable ? async (input: ManagerProviderSettingsInput) => { try { const result = await apiClient.testManagerProviderSettings(input); setProvider((current) => current ? { ...current, lastTest: result } : current); notify(result.status === "success" ? "Kết nối AI hoạt động. Hãy bấm Lưu kết nối AI để áp dụng." : providerTestLabel(result.code)); } catch { notify("Không kiểm tra được kết nối AI.", "danger"); } } : undefined;
  const saveManager = async (input: ManagerSettingsInput) => { try { const saved = role === "manager" ? await apiClient.saveManagerSettings(input) : await apiClient.saveOperatorSettings(input); setManager(saved); if (role === "operator") setOperatorOverview(current => current ? { ...current, settings: saved, pilot: { startDate: saved.pilotStartDate, weeks: saved.pilotWeeks, weekOverride: saved.weekOverride, minMinutesPerDay: saved.minMinutesPerDay, courseTheme: saved.courseTheme, coachDailyLimit: saved.coachDailyLimit }, test: { timed: saved.testTimed, times: saved.testTimes, warnLimit: saved.testWarnLimit }, levelUp: saved.levelUp } : current); notify("Đã lưu cấu hình vận hành."); } catch { notify("Không lưu được cấu hình vận hành.", "danger"); } };
  const saveProduct = async (input: ProductPreferencesView) => { try { const saved = await apiClient.saveProductPreferences(input); setProduct(saved); document.documentElement.dataset.theme = saved.theme === "auto" ? autoSeasonTheme() : saved.theme; notify("Đã lưu cấu hình sản phẩm."); } catch { notify("Không lưu được cấu hình sản phẩm.", "danger"); } };
  const saveExperience = async (input: OrganisationExperienceInput) => { try { const saved = await apiClient.saveOrganisationExperience(input); setExperience(saved); setTheme(saved.theme); notify("Đã lưu giao diện và nhạc nền cho toàn tổ chức."); } catch (error) { notify("Không lưu được trải nghiệm tổ chức.", "danger"); throw error; } };
  const requestMaintenance = async (action: ManagerMaintenanceAction) => { try { const confirmation = action === "seed_demo" ? await apiClient.requestManagerSeedConfirmation() : await apiClient.requestManagerWipeConfirmation(); setMaintenanceDialog({ action, confirmation }); } catch { notify("Thao tác chỉ khả dụng ở môi trường local-development có bật bảo trì an toàn.", "danger"); } };
  const confirmMaintenance = async (input: ManagerMaintenanceConfirmationInput) => { if (!maintenanceDialog) return; setMaintenanceBusy(true); try { const result = maintenanceDialog.action === "seed_demo" ? await apiClient.seedManagerData(input) : await apiClient.wipeManagerData(input); setMaintenanceDialog(undefined); notify(result.action === "seed_demo" ? "Đã nạp lại dữ liệu mẫu qua API local an toàn." : "Đã xoá dữ liệu tổ chức sau khi lưu bản sao server."); setManager(await apiClient.getManagerSettings()); setProduct(await apiClient.getProductPreferences()); if (role === "manager" && providerClientAvailable) setProvider(await apiClient.getManagerProviderSettings()); await loadAccounts(); } catch { notify("Không hoàn tất được thao tác dữ liệu. Token có thể đã hết hạn hoặc máy chủ đã tắt maintenance.", "danger"); } finally { setMaintenanceBusy(false); } };
  const managerActions = role === "manager" ? {
    onTestImage: async (input: ProductPreferencesView) => { try { const result = await apiClient.testManagerImage({ source: input.vocabImageSource }); if (result.status !== "available") { notify("Nguồn mở chưa trả về ảnh phù hợp cho từ thử."); return; } const attribution = [result.attribution?.creator, result.attribution?.licence].filter(Boolean).join(" · "); notify(`Đã tìm thấy ảnh từ ${result.provider ?? "nguồn mở"}${result.cached ? " (đã lưu trong cache)" : ""}${attribution ? ` · ${attribution}` : ""}.`); } catch { notify("Không kiểm tra được nguồn ảnh.", "danger"); } },
    onClearImageCache: async () => { try { const result = await apiClient.clearManagerImageCache(); notify(`Đã xoá cache ảnh (${result.cleared} bộ từ).`); } catch { notify("Không xoá được cache ảnh.", "danger"); } },
    onTestMusic: async (input: ManagerSettingsView["backgroundMusic"]) => { try { const result = await apiClient.testManagerMusic(input); notify(result.status === "valid" ? "Link nhạc YouTube hợp lệ." : "Link nhạc phải là video hoặc playlist YouTube.", result.status === "valid" ? "ok" : "danger"); } catch { notify("Không kiểm tra được link nhạc.", "danger"); } },
    onResetMusic: async () => { try { const backgroundMusic = await apiClient.resetManagerMusic(); setManager((current) => current ? { ...current, backgroundMusic } : current); notify("Đã đưa nhạc nền về mặc định."); } catch { notify("Không đặt lại được nhạc nền.", "danger"); } },
    onTestWebhook: async (url: string, template: string) => { try { const result = await apiClient.testManagerWebhook({ url, template }); notify(webhookTestLabel(result), result.status === "success" ? "ok" : "danger"); return result; } catch { notify("Không kiểm tra được webhook.", "danger"); throw new Error("WEBHOOK_TEST_FAILED"); } },
    onExportJson: async () => { try { const snapshot = await apiClient.exportManagerData(); downloadText("e4s-export.json", JSON.stringify(snapshot, null, 2), "application/json;charset=utf-8"); notify("Đã xuất bản sao cấu hình an toàn."); } catch { notify("Không xuất được dữ liệu.", "danger"); } },
    onImportJson: async (file: File) => { try { const snapshot = JSON.parse(await file.text()) as unknown; await apiClient.importManagerData(snapshot); const next = await apiClient.getManagerSettings(); setManager(next); notify("Đã nhập cấu hình được cho phép."); } catch { notify("Tệp JSON không hợp lệ hoặc không thể nhập.", "danger"); } },
    onExportCsv: async () => { try { const progress = await apiClient.getManagerProgress(); const header = "learnerId,learnerName,cefr,completedLessons,totalLessonsThisWeek,rewardPoints,lastActivityAt"; const rows = progress.learners.map((learner) => [learner.learnerId, learner.learnerName, learner.cefr ?? "", learner.completedLessons, learner.totalLessonsThisWeek, learner.rewardPoints, learner.lastActivityAt ?? ""].map(csvCell).join(",")); downloadText("e4s-tien-do.csv", [header, ...rows].join("\n"), "text/csv;charset=utf-8"); notify("Đã xuất CSV tiến độ nhóm."); } catch { notify("Không xuất được CSV tiến độ.", "danger"); } }
  } : {};
  const maintenanceActions = role === "manager" && capabilities.maintenance === true ? { onSeedData: () => requestMaintenance("seed_demo"), onWipeData: () => requestMaintenance("wipe_data") } : {};
  const securityNotices = role === "manager" && pinReports ? <section className="card manager-security-notices" aria-label="Thông báo bảo mật"><div className="manager-security-notices__heading"><span className="manager-security-notices__icon" aria-hidden="true"><ShieldCheck /></span><div><h3>Thông báo bảo mật</h3><p className="small muted">Theo dõi các thay đổi xác thực gần đây của người dùng.</p></div></div>{pinReports.reports.length ? <ul className="manager-security-notices__list">{pinReports.reports.map((report) => <li className="manager-security-notice" key={report.id}><div className="manager-security-notice__copy"><b>{report.subjectName}</b><span>{report.note}</span></div><time className="small muted" dateTime={report.createdAt}>{new Date(report.createdAt).toLocaleString("vi-VN", { timeZone: "Asia/Ho_Chi_Minh", hour: "2-digit", minute: "2-digit", day: "2-digit", month: "2-digit", year: "numeric" })}</time></li>)}</ul> : <p className="manager-security-notices__empty small muted">Chưa có hoạt động đổi PIN mới.</p>}</section> : null;
  return <>
    {loadError ? <div className="banner danger" role="alert"><div className="body small">{loadError}</div></div> : null}
    {securityNotices}
    <SettingsPage role={role} {...(manager ? { manager } : {})} {...(operatorOverview ? { operatorOverview } : {})} {...(provider ? { ai: provider } : {})} product={product} experience={experience} capabilities={capabilities} actions={{ onSaveManager: saveManager, onSaveProduct: saveProduct, onSaveExperience: saveExperience, ...(saveAi ? { onSaveAi: saveAi } : {}), ...(testAi ? { onTestAi: testAi } : {}), ...managerActions, ...maintenanceActions }} {...(accounts ? { accounts: <AccountsPanel view={accounts} currentUserId={currentUserId} reload={loadAccounts} notify={notify} /> } : {})} />
    {maintenanceDialog ? <MaintenanceConfirmationDialog confirmation={maintenanceDialog.confirmation} busy={maintenanceBusy} onCancel={() => setMaintenanceDialog(undefined)} onConfirm={(phrase) => confirmMaintenance({ confirmationToken: maintenanceDialog.confirmation.token, confirmationPhrase: phrase })} /> : null}
  </>;
}

function csvCell(value: unknown): string {
  const text = String(value ?? "");
  return /[",\n]/.test(text) ? `"${text.replaceAll("\"", "\"\"")}"` : text;
}

function AccountsPanel({ view, currentUserId, reload, notify }: { view: ManagerAccountsView; currentUserId: string; reload: () => Promise<void>; notify: (message: string, tone?: "ok" | "danger") => void }) {
  const [busyId, setBusyId] = useState<string>(); const [creating, setCreating] = useState(false); const [showPassword, setShowPassword] = useState(false);
  const [trash, setTrash] = useState<ManagerTrashView>(); const [recoveryLoading, setRecoveryLoading] = useState(false); const [recoveryError, setRecoveryError] = useState(""); const [recoveryBusy, setRecoveryBusy] = useState(false);
  const [purgeDialog, setPurgeDialog] = useState<{ accountId: string; accountName: string; confirmation: ManagerPurgeConfirmationView }>(); const [purging, setPurging] = useState(false);
  const modal = useModal();
  const run = async (id: string, action: () => Promise<unknown>, message: string) => { setBusyId(id); try { await action(); await reload(); notify(message); } catch { notify("Không cập nhật được tài khoản. Kiểm tra quyền và dữ liệu nhập.", "danger"); } finally { setBusyId(undefined); } };
  const changeRole = async (account: ManagerAccountView, nextRole: ManagerAccountView["role"]) => {
    if (nextRole === account.role) return;
    const confirmed = await modal.confirm({ title: "Đổi vai trò tài khoản?", message: <>Tài khoản <b>{account.displayName}</b> sẽ chuyển từ <b>{accountRoleLabel(account.role)}</b> sang <b>{accountRoleLabel(nextRole)}</b>. Quyền truy cập thay đổi ngay sau khi lưu.</>, confirmLabel: "Đổi vai trò", cancelLabel: "Huỷ", tone: "primary", countdownSeconds: 0 });
    if (confirmed) await run(account.id, () => apiClient.updateManagerAccountRole(account.id, nextRole), "Đã đổi vai trò tài khoản.");
  };
  const toggleStatus = async (account: ManagerAccountView) => {
    const nextStatus = account.status === "active" ? "disabled" : "active";
    const locking = nextStatus === "disabled";
    const confirmed = await modal.confirm({ title: locking ? "Khoá tài khoản?" : "Mở tài khoản?", message: <>Tài khoản <b>{account.displayName}</b> sẽ {locking ? "không thể đăng nhập cho đến khi được mở lại" : "được phép đăng nhập trở lại"}.</>, confirmLabel: locking ? "Khoá tài khoản" : "Mở tài khoản", cancelLabel: "Huỷ", tone: locking ? "danger" : "primary", countdownSeconds: 0 });
    if (confirmed) await run(account.id, () => apiClient.updateManagerAccountStatus(account.id, nextStatus), locking ? "Đã khoá tài khoản." : "Đã mở tài khoản.");
  };
  const resetPassword = async (account: ManagerAccountView) => {
    const password = await modal.prompt({ title: `Mật khẩu mới cho ${account.displayName}`, message: "Mật khẩu phải có ít nhất 8 ký tự.", label: "Mật khẩu mới", placeholder: "Nhập mật khẩu mới", inputType: "password", confirmLabel: "Đặt lại mật khẩu", cancelLabel: "Huỷ" });
    if (password) void run(account.id, () => apiClient.resetManagerAccountPassword(account.id, password), "Đã đặt lại mật khẩu.");
  };
  const deleteAccount = async (account: ManagerAccountView) => {
    const confirmed = await modal.confirm({ title: "Xoá tài khoản?", message: <>Tài khoản <b>{account.displayName}</b> sẽ mất quyền truy cập và được chuyển vào thùng rác. Email vẫn được giữ nên chưa thể đăng ký tài khoản mới bằng email này. Bạn có thể khôi phục hoặc xoá vĩnh viễn trong mục <b>Khôi phục tài khoản</b>.</>, confirmLabel: "Xoá tài khoản", cancelLabel: "Huỷ", tone: "danger", countdownSeconds: 0 });
    if (confirmed) await run(account.id, () => apiClient.updateManagerAccountStatus(account.id, "deleted"), "Đã xoá quyền truy cập tài khoản.");
  };
  const loadTrash = async () => {
    setRecoveryLoading(true); setRecoveryError("");
    try { setTrash(await apiClient.getManagerTrash()); } catch { setRecoveryError("Không tải được danh sách khôi phục."); } finally { setRecoveryLoading(false); }
  };
  const restore = async (accountId: string) => {
    const account = trash?.accounts.find((item) => item.id === accountId);
    if (!account || !(await modal.confirm({ title: "Khôi phục tài khoản", message: <>Khôi phục tài khoản <b>{account.displayName}</b> khỏi thùng rác?</>, confirmLabel: "Khôi phục", cancelLabel: "Huỷ" }))) return;
    setRecoveryBusy(true); setRecoveryError("");
    try { await apiClient.restoreManagerTrashAccount(accountId); notify("Đã khôi phục tài khoản."); await loadTrash(); } catch { setRecoveryError("Không khôi phục được tài khoản."); } finally { setRecoveryBusy(false); }
  };
  const requestPurge = async (accountId: string) => {
    setRecoveryError("");
    try {
      const confirmation = await apiClient.requestManagerTrashPurgeConfirmation(accountId);
      const accountName = trash?.accounts.find((account) => account.id === accountId)?.displayName ?? "tài khoản này";
      setPurgeDialog({ accountId, accountName, confirmation });
    } catch { setRecoveryError("Không tạo được xác nhận xoá vĩnh viễn."); }
  };
  const confirmPurge = async (confirmationPhrase: string) => {
    if (!purgeDialog) return;
    setPurging(true); setRecoveryError("");
    try {
      await apiClient.purgeManagerTrashAccount(purgeDialog.accountId, { confirmationToken: purgeDialog.confirmation.token, confirmationPhrase });
      setPurgeDialog(undefined); notify("Đã xoá vĩnh viễn tài khoản."); await loadTrash();
    } catch { setRecoveryError("Không xoá vĩnh viễn được tài khoản. Token có thể đã hết hạn hoặc dữ liệu đang được tham chiếu."); }
    finally { setPurging(false); }
  };
  const create = async (event: FormEvent<HTMLFormElement>) => { event.preventDefault(); const formElement = event.currentTarget; const form = new FormData(formElement); setCreating(true); try { await apiClient.createManagerAccount({ displayName: String(form.get("displayName") ?? ""), email: String(form.get("email") ?? ""), role: String(form.get("role") ?? "learner") as ManagerAccountView["role"], password: String(form.get("password") ?? "") }); await reload(); formElement.reset(); setShowPassword(false); notify("Đã tạo tài khoản."); } catch { notify("Không tạo được tài khoản. Email phải chưa tồn tại và mật khẩu có ít nhất 8 ký tự.", "danger"); } finally { setCreating(false); } };
  return <section className="card manager-accounts-card"><div className="row between manager-accounts-heading"><h3>Người dùng</h3><span className="badge">{view.accounts.length} tài khoản</span></div><div className="table-wrap settings-action-table manager-accounts-table" data-manager-action-table><table className="manager-accounts-table__table"><thead><tr><th>Tên</th><th>Email</th><th>Vai trò</th><th>Trạng thái</th><th>Thao tác</th></tr></thead><tbody>{view.accounts.map((account) => { const self = account.id === currentUserId; const busy = busyId === account.id; return <tr key={account.id}><td><b>{account.displayName}</b>{self ? <span className="xs muted"> (bạn)</span> : null}</td><td>{account.email ?? "—"}</td><td><select className="manager-account-role" aria-label={`Vai trò ${account.displayName}`} title={self ? "Không thể đổi vai trò tài khoản đang đăng nhập" : undefined} aria-busy={busy || undefined} disabled={busy || self} value={account.role} onChange={(event) => void changeRole(account, event.target.value as ManagerAccountView["role"])}><option value="learner">Người học</option><option value="operator">Người vận hành</option><option value="manager">Quản lý</option></select></td><td><span className={`badge ${account.status === "active" ? "ok" : "warn"}`}>{accountStatusLabel(account.status)}</span></td><td><div className="manager-account-actions" role="group" aria-label={`Thao tác tài khoản ${account.displayName}`}><button className="btn-sm" type="button" aria-busy={busy || undefined} title={self ? "Không thể khoá tài khoản đang đăng nhập" : undefined} disabled={busy || self} onClick={() => void toggleStatus(account)}>{account.status === "active" ? "Khoá" : "Mở"}</button><button className="btn-sm" type="button" aria-busy={busy || undefined} disabled={busy} onClick={() => void resetPassword(account)}>Đặt lại mật khẩu</button><button className="btn-sm btn-danger" type="button" title={self ? "Không thể xoá tài khoản đang đăng nhập" : undefined} disabled={busy || self} onClick={() => void deleteAccount(account)}>Xoá</button></div></td></tr>; })}</tbody></table></div>
    <form className="card soft section manager-account-create" onSubmit={create}><h4 style={{ marginTop: 0 }}>Tạo tài khoản mới</h4><p className="small muted">Mặc định là Người học. Người học có thể đăng nhập ngay bằng email và mật khẩu ban đầu sau khi tạo.</p><div className="manager-account-create__grid"><label className="field"><span>Tên</span><input name="displayName" required /></label><label className="field"><span>Email</span><input name="email" type="email" required /></label><label className="field"><span>Vai trò</span><select className="manager-account-role" name="role" defaultValue="learner"><option value="learner">Người học</option><option value="operator">Người vận hành</option><option value="manager">Quản lý</option></select></label><label className="field manager-password-field"><span>Mật khẩu ban đầu</span><span className="manager-password-control"><input name="password" type={showPassword ? "text" : "password"} minLength={8} required /><button className="manager-password-toggle" type="button" aria-label={showPassword ? "Ẩn mật khẩu ban đầu" : "Hiện mật khẩu ban đầu"} aria-pressed={showPassword} onClick={() => setShowPassword((visible) => !visible)}>{showPassword ? <EyeOff aria-hidden="true" /> : <Eye aria-hidden="true" />}</button></span></label></div><button className="btn-primary manager-account-create__submit" type="submit" disabled={creating}>{creating ? "Đang tạo…" : "+ Thêm người dùng"}</button></form>
    <details className="settings-recovery" onToggle={(event) => { if (event.currentTarget.open && !trash && !recoveryLoading) void loadTrash(); }}><summary><span className="settings-recovery__title"><ArchiveRestore aria-hidden="true" />Khôi phục tài khoản</span><span className="settings-recovery__meta">{trash ? <span className="badge">{trash.accounts.length}</span> : <span className="small muted">Mở khi cần</span>}<ChevronDown className="settings-recovery__chevron" aria-hidden="true" /></span></summary><div className="settings-recovery__body">{recoveryError ? <div className="banner danger" role="alert"><div className="body small">{recoveryError}</div></div> : null}{trash ? <ManagerRecovery trashedAccounts={trash.accounts.map((item) => ({ id: item.id, name: item.displayName, deletedAt: item.deletedAt }))} onRestore={restore} onPurge={requestPurge} busy={recoveryBusy || purging} /> : recoveryLoading ? <ManagerRecovery trashedAccounts={[]} loading /> : <p className="small muted">Mở mục này để tải danh sách tài khoản đã xoá.</p>}</div></details>
    {purgeDialog ? <PurgeConfirmationDialog accountName={purgeDialog.accountName} confirmation={purgeDialog.confirmation} busy={purging} onCancel={() => setPurgeDialog(undefined)} onConfirm={confirmPurge} /> : null}
  </section>;
}

function accountRoleLabel(role: ManagerAccountView["role"]) {
  return role === "manager" ? "Quản lý" : role === "operator" ? "Người vận hành" : "Người học";
}

function accountStatusLabel(status: ManagerAccountView["status"]) {
  return status === "active" ? "Đang hoạt động" : status === "disabled" ? "Đã khoá" : "Đã xoá";
}

function RouteState({ error, title, label }: { error: string; title: string; label: string }) {
  return <div className="manager-page manager-route-state"><PageTitle><h1>{title}</h1></PageTitle>{error
    ? <div className="banner danger" role="alert"><div className="body small">{error}</div></div>
    : <div className="card" role="status" aria-live="polite"><span className="spinner" aria-hidden="true" /> {label}</div>}</div>;
}
