import { useEffect, useRef, useState, type ButtonHTMLAttributes, type CSSProperties, type ReactNode } from "react";
import type { ManagerProviderSettingsInput, ManagerProviderSettingsView, ManagerSettingsInput, ManagerSettingsView, ManagerWebhookTestView, OperatorSettingsOverviewView, OrganisationExperienceInput, OrganisationExperienceView, ProductPreferencesView, SystemCapabilitiesView } from "@e4s/contracts";
import { ChevronDown, Flower2, Gift, Leaf, MoonStar, Snowflake, Sparkles, Star, Sun } from "lucide-react";
import { autoSeasonTheme } from "../games/season-visual.js";
import { MUSIC_PRESETS } from "../../features/experience/music-presets.js";
import { resolveBackgroundMusic } from "../../features/experience/music-selection.js";
import { createMusicPlayer, type MusicPlayer } from "../../features/experience/music-player.js";
import { useTheme } from "../shared/ThemeProvider.js";
import { useMediaQuery } from "../shared/useMediaQuery.js";

export type AiConfigurationView = ManagerProviderSettingsView;
export type AiConfigurationInput = ManagerProviderSettingsInput;

const aiProviderDefaults: Record<AiConfigurationInput["provider"], Pick<AiConfigurationInput, "baseUrl" | "model" | "speechToTextModel">> = {
  claude: {
    baseUrl: "https://api.anthropic.com/v1",
    model: "claude-haiku-5-5",
    speechToTextModel: ""
  },
  gemini: {
    baseUrl: "https://generativelanguage.googleapis.com/v1beta",
    model: "gemini-1.5-flash",
    speechToTextModel: ""
  },
  openai: {
    baseUrl: "https://api.groq.com/openai/v1",
    model: "qwen/qwen3.8-27b",
    speechToTextModel: "whisper-large-v3-turbo"
  }
};

const openAiBaseUrlPresets = {
  groq: "https://api.groq.com/openai/v1",
  openrouter: "https://openrouter.ai/api/v1",
  cerebras: "https://api.cerebras.ai/v1",
  ollama: "http://localhost:11434/v1"
} as const;

type OpenAiBaseUrlPreset = keyof typeof openAiBaseUrlPresets | "custom";

function openAiPresetFor(baseUrl: string): OpenAiBaseUrlPreset {
  const preset = (Object.entries(openAiBaseUrlPresets) as [Exclude<OpenAiBaseUrlPreset, "custom">, string][]).find(([, url]) => url === baseUrl);
  return preset?.[0] ?? "custom";
}
export type SettingsActions = {
  onSaveAi: (input: AiConfigurationInput) => void | Promise<void>;
  onTestAi: (input: AiConfigurationInput) => void | Promise<void>;
  onSaveManager: (input: ManagerSettingsInput) => void | Promise<void>;
  onSaveProduct: (input: ProductPreferencesView) => void | Promise<void>;
  onSaveExperience: (input: OrganisationExperienceInput) => void | Promise<void>;
  onTestImage: (input: ProductPreferencesView) => void | Promise<void>;
  onClearImageCache: () => void | Promise<void>;
  onTestMusic: (input: ManagerSettingsView["backgroundMusic"]) => void | Promise<void>;
  onResetMusic: () => void | Promise<void>;
  onTestWebhook: (url: string, template: string) => Promise<ManagerWebhookTestView>;
  onExportJson: () => void | Promise<void>;
  onImportJson: (file: File) => void | Promise<void>;
  onExportCsv: () => void | Promise<void>;
  onSeedData: () => void | Promise<void>;
  onWipeData: () => void | Promise<void>;
  onRequestPlacementTestChange: (developerEmail: string, note: string) => void | Promise<void>;
  onRequestFinalTestChange: (developerEmail: string, note: string) => void | Promise<void>;
};
export type SettingsProps = {
  role: "manager" | "operator";
  manager?: ManagerSettingsView;
  product: ProductPreferencesView;
  experience?: OrganisationExperienceView;
  capabilities: SystemCapabilitiesView;
  ai?: AiConfigurationView;
  operatorOverview?: OperatorSettingsOverviewView;
  actions: Partial<SettingsActions>;
  accounts?: ReactNode;
  securityNotices?: ReactNode;
};

type SettingsPanel = { id: string; label: string; content: ReactNode };

export function SettingsPage({ role, manager, product, experience, capabilities, ai, operatorOverview, actions, accounts, securityNotices }: SettingsProps) {
  const compact = useMediaQuery("(max-width: 1180px)");
  const [openPanels, setOpenPanels] = useState<Readonly<Record<string, boolean>>>({});
  const [aiDraft, setAiDraft] = useState<AiConfigurationInput | null>(ai ? { provider: ai.provider, baseUrl: ai.baseUrl, model: ai.model, speechToTextModel: ai.speechToTextModel } : null);
  const [managerDraft, setManagerDraft] = useState(manager ?? operatorOverview?.settings);
  const [productDraft, setProductDraft] = useState(() => normalizeProductPreferences(product));
  const [experienceDraft, setExperienceDraft] = useState<OrganisationExperienceView>(() => experience ?? legacyExperience(product, manager ?? operatorOverview?.settings));
  useEffect(() => setAiDraft(ai ? { provider: ai.provider, baseUrl: ai.baseUrl, model: ai.model, speechToTextModel: ai.speechToTextModel } : null), [ai]);
  useEffect(() => setManagerDraft(manager ?? operatorOverview?.settings), [manager, operatorOverview]);
  useEffect(() => setProductDraft(normalizeProductPreferences(product)), [product]);
  useEffect(() => setExperienceDraft(experience ?? legacyExperience(product, manager ?? operatorOverview?.settings)), [experience, manager, operatorOverview, product]);
  const saveExperienceDraft = actions.onSaveExperience ? async () => {
    try {
      await actions.onSaveExperience!(experienceDraft);
    } catch (error) {
      setExperienceDraft(experience ?? legacyExperience(product, manager ?? operatorOverview?.settings));
      throw error;
    }
  } : undefined;
  const themePanel: SettingsPanel = { id: "theme", label: "Giao diện theo mùa / lễ", content: <ThemeSection value={experienceDraft} onChange={setExperienceDraft} {...(saveExperienceDraft ? { onSave: saveExperienceDraft } : actions.onSaveProduct ? { onSave: () => actions.onSaveProduct!({ ...productDraft, theme: experienceDraft.theme }) } : {})} /> };
  const musicPanel: SettingsPanel = { id: "music", label: "Nhạc nền của Season", content: <MusicSection value={experienceDraft} onChange={setExperienceDraft} {...(saveExperienceDraft ? { onSave: saveExperienceDraft } : {})} /> };
  const learningPanel: SettingsPanel = { id: "monthly", label: "Học theo tháng", content: managerDraft && <MonthlyLearningSection value={managerDraft} onChange={setManagerDraft} coachLimitReadOnly={role === "operator"} {...(actions.onSaveManager ? { onSave: () => actions.onSaveManager!(toInput(managerDraft)) } : {})} /> };
  const levelPanel: SettingsPanel = { id: "levels", label: "Ngưỡng xét lên / hạ mức", content: managerDraft && <LevelSection value={managerDraft} onChange={setManagerDraft} {...(actions.onSaveManager ? { onSave: () => actions.onSaveManager!(toInput(managerDraft)) } : {})} /> };
  const panels: SettingsPanel[] = role === "manager" ? [
    { id: "security", label: "Thông báo bảo mật", content: securityNotices },
    { id: "prompts", label: "Prompt & rubric", content: <section className="card" aria-label="Cấu hình Prompt & rubric"><h3>Prompt & rubric</h3><p className="small muted">Quản lý hướng dẫn AI và rubric chấm trong khu vực Cài đặt, tách khỏi các thao tác vận hành hằng ngày.</p><a className="btn" href="/settings/prompts">Mở Prompt & rubric</a></section> },
    { id: "ai", label: "Kết nối AI", content: aiDraft && ai ? <AiSection draft={aiDraft} configured={ai.configured} lastTest={ai.lastTest} capabilities={capabilities} onChange={setAiDraft} aiTestDisabled={managerDraft?.aiTestDisabled ?? false} onAiTestDisabledChange={(aiTestDisabled) => setManagerDraft((current) => current ? { ...current, aiTestDisabled } : current)} {...(actions.onSaveAi ? { onSave: () => actions.onSaveAi!(aiDraft) } : {})} {...(actions.onTestAi ? { onTest: () => actions.onTestAi!(aiDraft) } : {})} {...(actions.onSaveManager && managerDraft ? { onSaveAiTestMode: () => actions.onSaveManager!(toInput(managerDraft)) } : {})} /> : <UnavailableAiSection capabilities={capabilities} role={role} /> },
    ...(managerDraft ? [
      { id: "test-date", label: "Ngày hệ thống thử", content: <SystemTestDateSection value={managerDraft} onChange={setManagerDraft} {...(actions.onSaveManager ? { onSave: () => actions.onSaveManager!(toInput(managerDraft)) } : {})} /> },
      learningPanel,
      { id: "images", label: "Ảnh minh hoạ từ vựng", content: <ImageSection value={productDraft} onChange={setProductDraft} {...(actions.onSaveProduct ? { onSave: () => actions.onSaveProduct!(productDraft) } : {})} {...(actions.onTestImage ? { onTest: () => actions.onTestImage!(productDraft) } : {})} {...(actions.onClearImageCache ? { onClear: actions.onClearImageCache } : {})} /> },
      levelPanel,
      themePanel,
      musicPanel,
      { id: "policy", label: "Nhắc học và báo cáo", content: <PolicySection value={managerDraft} onChange={setManagerDraft} {...(actions.onSaveManager ? { onSave: () => actions.onSaveManager!(toInput(managerDraft)) } : {})} /> },
      { id: "data", label: "Dữ liệu", content: <DataSection actions={actions} capabilities={capabilities} /> },
      { id: "accounts", label: "Người dùng", content: accounts }
    ] satisfies SettingsPanel[] : [])
  ] : [
    themePanel,
    musicPanel,
    ...(operatorOverview && managerDraft ? [
      learningPanel,
      levelPanel,
      { id: "exam-requests", label: "Yêu cầu đổi đề", content: <AssessmentTestChangeRequests
        {...(actions.onRequestPlacementTestChange ? { onPlacementSend: actions.onRequestPlacementTestChange } : {})}
        {...(actions.onRequestFinalTestChange ? { onFinalSend: actions.onRequestFinalTestChange } : {})}
      /> },
      { id: "accounts", label: "Người dùng", content: <OperatorAccountsSection overview={operatorOverview} /> }
    ] satisfies SettingsPanel[] : [])
  ];
  const availablePanels = panels.filter(panel => panel.content);

  return <div className="settings-page" data-settings-role={role} data-compact={compact || undefined}>
    <div className="page-title"><h1>Cài đặt</h1></div>
    {availablePanels.map(panel => {
      const expanded = openPanels[panel.id] ?? (panel.id === (role === "manager" ? "security" : "theme"));
      const contentId = `setting-${panel.id}`;
      return <div className="settings-panel" key={panel.id} data-expanded={compact && expanded || undefined}>
        {compact && <button className="settings-panel-toggle" type="button" aria-expanded={expanded} aria-controls={contentId}
          onClick={(event) => {
            const button = event.currentTarget;
            setOpenPanels(current => ({ ...current, [panel.id]: !expanded }));
            if (!expanded && button.getBoundingClientRect().bottom > window.innerHeight * 0.65) {
              window.requestAnimationFrame(() => {
                const behavior = window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "instant" : "smooth";
                const main = button.closest("main");
                if (main && getComputedStyle(main).overflowY === "auto") {
                  main.scrollTo({ top: main.scrollTop + button.getBoundingClientRect().top - main.getBoundingClientRect().top - 12, behavior });
                } else {
                  button.scrollIntoView({ block: "start", behavior });
                }
              });
            }
          }}>
          {panel.label}<ChevronDown size={16} aria-hidden="true" />
        </button>}
        <div id={contentId} className="settings-panel-content" hidden={compact && !expanded}>{panel.content}</div>
      </div>;
    })}
  </div>;
}

function SystemTestDateSection({ value, onChange, onSave }: ManagerSectionProps) {
  return <section className="card" aria-label="Thiết lập ngày hệ thống thử">
    <h3>Ngày hệ thống thử</h3>
    <p className="small muted">Ngày này điều khiển lịch học, quyền vào bài, điểm danh, Season AI Coach và thông báo của toàn tổ chức. Chỉ Quản lý được thay đổi.</p>
    <Field label="Ngày hệ thống thử"><input type="date" value={value.simulatedSystemDate} onChange={(event) => onChange({ ...value, simulatedSystemDate: event.target.value })} /></Field>
    <Save label="Lưu ngày hệ thống thử" onSave={onSave} />
  </section>;
}

function AssessmentTestChangeRequests({ onPlacementSend, onFinalSend }: { onPlacementSend?: (developerEmail: string, note: string) => void | Promise<void>; onFinalSend?: (developerEmail: string, note: string) => void | Promise<void> }) {
  return <section className="card"><h3>Yêu cầu đổi đề</h3><p className="small muted">Người vận hành không có quyền sửa trực tiếp thời lượng hoặc cấu trúc đề. Yêu cầu gửi tới đội phát triển sẽ được ghi nhận.</p><div className="grid cols-2"><TestChangeRequestForm title="Yêu cầu đổi đề đầu vào" description="Mô tả nội dung cần đổi trong đề đầu vào." buttonLabel="Gửi yêu cầu đổi đề đầu vào" {...(onPlacementSend ? { onSend: onPlacementSend } : {})} /><TestChangeRequestForm title="Yêu cầu đổi đề đầu ra" description="Mô tả nội dung cần đổi trong bài thi tháng hoặc đề C1." buttonLabel="Gửi yêu cầu đổi đề đầu ra" {...(onFinalSend ? { onSend: onFinalSend } : {})} /></div></section>;
}

function TestChangeRequestForm({ title, description, buttonLabel, onSend }: { title: string; description: string; buttonLabel: string; onSend?: (developerEmail: string, note: string) => void | Promise<void> }) {
  const [developerEmail, setDeveloperEmail] = useState("");
  const [note, setNote] = useState("");
  const [error, setError] = useState("");
  const send = async () => {
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(developerEmail)) { setError("Nhập email đội phát triển hợp lệ."); return; }
    if (!note.trim()) { setError(description); return; }
    setError("");
    await onSend?.(developerEmail.trim(), note.trim());
    setNote("");
  };
  return <div className="settings-test-change-request"><h4>{title}</h4><Field label={`Email đội phát triển cho ${title.toLowerCase().replace("yêu cầu đổi ", "")}`}><input type="email" value={developerEmail} onChange={event => setDeveloperEmail(event.target.value)} placeholder="dev@example.com" /></Field><Field label={`Nội dung cần đổi cho ${title.toLowerCase().replace("yêu cầu đổi ", "")}`}><textarea rows={3} value={note} onChange={event => setNote(event.target.value)} placeholder="Mô tả rõ phần đề cần cập nhật…" /></Field>{error ? <p className="small danger" role="alert">{error}</p> : null}<Save label={buttonLabel} onSave={onSend ? send : undefined} /></div>;
}

function OperatorAccountsSection({ overview }: { overview: OperatorSettingsOverviewView }) {
  const roleLabel = (role: string) => role === "learner" ? "Người học" : role === "operator" ? "Người vận hành" : "Quản lý";
  return <section className="card settings-operator-accounts">
    <h3>Người dùng</h3>
    <p className="small muted">Danh sách tài khoản trong tổ chức. Người vận hành được chỉnh cấu hình vận hành nhưng không được thêm, xoá hoặc đổi thông tin học viên.</p>
    <div className="table-wrap settings-operator-accounts__table">
      <table role="table" aria-label="Người dùng">
        <thead><tr><th scope="col">Tên</th><th scope="col">Email</th><th scope="col">Vai trò</th><th scope="col">Mức</th><th scope="col">Điểm đầu vào</th><th scope="col">Trạng thái</th></tr></thead>
        <tbody role="rowgroup">{overview.accounts.map(account => <tr role="row" key={account.id} data-account-role={account.role}>
          <td role="cell" className="settings-account-name">{account.displayName}</td>
          <td role="cell" className="settings-account-email">{account.email || "—"}</td>
          <td role="cell" className="settings-account-role">{roleLabel(account.role)}</td>
          <td role="cell" className="settings-account-level"><span className="settings-account-label" aria-hidden="true">Mức</span>{account.role === "learner" ? account.cefr ?? "—" : "—"}</td>
          <td role="cell" className="settings-account-score"><span className="settings-account-label" aria-hidden="true">Điểm đầu vào</span>{account.role !== "learner" ? "—" : account.placementScore == null ? "Chưa có bài test" : `${account.placementScore}/100`}</td>
          <td role="cell" className="settings-account-status"><AccountStatusBadge status={account.status} /></td>
        </tr>)}</tbody>
      </table>
    </div>
  </section>;
}

export function AccountStatusBadge({ status }: { status: string }) {
  if (status === "active") return <span className="badge ok">Đang hoạt động</span>;
  if (status === "disabled") return <span className="badge account-status-locked">Đã khoá</span>;
  if (status === "deleted") return <span className="badge warn">Đã xoá</span>;
  return <span className="badge warn">Không rõ</span>;
}

function UnavailableAiSection({ capabilities, role }: { capabilities: SystemCapabilitiesView; role: "manager" | "operator" }) { return <section className="card"><h3>Kết nối AI</h3><div className="banner info"><div className="body small">{role === "operator" ? <>Chỉ xem trạng thái kết nối AI ({capabilities.ai ? "đang hoạt động" : "chưa hoạt động"}). Nhà cung cấp, model và khoá do Quản lý quản trị; khoá không hiển thị trên trình duyệt.</> : <>API chỉ trả trạng thái AI {capabilities.ai ? "đang hoạt động" : "chưa hoạt động"}; chưa có endpoint lưu hoặc kiểm tra cấu hình. Điều khiển được tắt để tránh tạo cấu hình giả.</>}</div></div>{role === "operator" ? <span className={`badge ${capabilities.ai ? "ok" : "warn"}`}>{capabilities.ai ? "đang hoạt động" : "chưa sẵn sàng"}</span> : <div className="row"><button className="btn-primary" type="button" disabled>Lưu kết nối AI</button><button type="button" disabled>Kiểm tra kết nối</button></div>}</section>; }

function AiSection({ draft, configured, lastTest, capabilities, aiTestDisabled, onChange, onAiTestDisabledChange, onSave, onTest, onSaveAiTestMode }: { draft: AiConfigurationInput; configured: boolean; lastTest?: ManagerProviderSettingsView["lastTest"]; capabilities: SystemCapabilitiesView; aiTestDisabled: boolean; onChange: (value: AiConfigurationInput) => void; onAiTestDisabledChange: (disabled: boolean) => void; onSave?: () => void | Promise<void>; onTest?: () => void | Promise<void>; onSaveAiTestMode?: () => void | Promise<void> }) {
  const openAiPreset = draft.provider === "openai" ? openAiPresetFor(draft.baseUrl) : "custom";
  const connectionLabel = configured && capabilities.ai ? "đã kết nối" : lastTest?.status === "success" ? "đã kiểm tra · chưa lưu" : "chưa sẵn sàng";
  const changeProvider = (provider: AiConfigurationInput["provider"]) => onChange({ ...draft, provider, ...aiProviderDefaults[provider], credential: undefined });
  return <section className="card"><h3>Kết nối AI</h3><p className="small muted">Khoá nhà cung cấp được lưu an toàn ở server; trình duyệt chỉ gửi giá trị mới khi bạn chủ động thay đổi.</p>
    <div className="settings-ai-provider"><label className="field"><span>Nhà cung cấp</span><select value={draft.provider} onChange={(event) => changeProvider(event.target.value as AiConfigurationInput["provider"])}><option value="claude">Claude (Anthropic)</option><option value="gemini">Google Gemini</option><option value="openai">OpenAI-compatible</option></select></label>
    {draft.provider === "openai" ? <label className="field"><span>Preset OpenAI-compatible</span><select value={openAiPreset} onChange={(event) => { const preset = event.target.value as OpenAiBaseUrlPreset; onChange({ ...draft, baseUrl: preset === "custom" ? "" : openAiBaseUrlPresets[preset] }); }}><option value="groq">Groq</option><option value="openrouter">OpenRouter</option><option value="cerebras">Cerebras</option><option value="ollama">Ollama (local)</option><option value="custom">Tuỳ chỉnh</option></select></label> : null}
    {draft.provider === "openai" ? <label className="field settings-ai-base-url"><span>Base URL</span><input value={draft.baseUrl} onChange={(event) => onChange({ ...draft, baseUrl: event.target.value })} placeholder="https://api.groq.com/openai/v1" /></label> : null}</div>
    <div className="grid cols-2"><label className="field"><span>API key mới (để trống = giữ key đang lưu)</span><input type="password" autoComplete="new-password" value={draft.credential ?? ""} onChange={(event) => onChange(withCredential(draft, event.target.value))} /></label><label className="field"><span>Tên model</span><input value={draft.model} onChange={(event) => onChange({ ...draft, model: event.target.value })} /></label></div>
    {draft.provider === "openai" ? <label className="field"><span>Model chép lời file ghi âm</span><input value={draft.speechToTextModel} onChange={(event) => onChange({ ...draft, speechToTextModel: event.target.value })} /></label> : null}
    <div className="row"><AsyncButton className="btn-primary" action={onSave} disabled={!onSave} busyLabel="Đang lưu…">Lưu kết nối AI</AsyncButton><AsyncButton action={onTest} disabled={!onTest} busyLabel="Đang kiểm tra…" aria-label="Kiểm tra kết nối AI">Kiểm tra kết nối</AsyncButton><span className={`badge ${configured && capabilities.ai ? "ok" : "warn"}`}>{connectionLabel}</span><span className="small muted" role="status" aria-live="polite">{lastTestLabel(lastTest)}</span></div>
    <div className="settings-ai-fallback-control"><div className="settings-ai-fallback-copy"><strong>Chế độ dự phòng không AI</strong><span className="small muted">Khoá API vẫn được giữ nguyên. Bật công tắc để kiểm tra toàn bộ luồng dự phòng của tổ chức.</span></div><label className="settings-switch"><input role="switch" type="checkbox" checked={aiTestDisabled} onChange={(event) => onAiTestDisabledChange(event.target.checked)} aria-label="Tắt AI để kiểm thử chế độ dự phòng" /><span className="settings-switch__track" aria-hidden="true"><span /></span><span className="settings-switch__state">{aiTestDisabled ? "Đang tắt AI" : "AI đang bật"}</span></label><AsyncButton className="btn" action={onSaveAiTestMode} disabled={!onSaveAiTestMode} aria-label="Lưu chế độ kiểm thử AI" busyLabel="Đang lưu…">Lưu chế độ</AsyncButton></div>
  </section>;
}

function MonthlyLearningSection({ value, onChange, onSave, coachLimitReadOnly = false }: ManagerSectionProps & { coachLimitReadOnly?: boolean }) {
  return <section className="card"><h3>Học theo tháng</h3>
    <p className="small muted">Bài học được mở theo lịch tháng từ Thứ Hai đến Thứ Sáu. Ngày học cuối cùng là Bài thi tháng; thời lượng và cấu trúc đề được quản lý trong mục Bài kiểm tra.</p>
    <div className="grid cols-2 settings-monthly-fields"><NumberField label="Khuyến nghị học tối thiểu (phút/ngày)" value={value.minMinutesPerDay} min={5} max={60} onChange={(minMinutesPerDay) => onChange({ ...value, minMinutesPerDay })} /><NumberField label="Giới hạn chat với Season (1–200 lượt/ngày cho mỗi học viên)" value={value.coachDailyLimit} min={1} max={200} disabled={coachLimitReadOnly} onChange={(coachDailyLimit) => onChange({ ...value, coachDailyLimit })} /></div>
    <p className="small muted">{coachLimitReadOnly ? "Quản lý thiết lập giới hạn Season."
      : "Giới hạn Season mới áp dụng từ ngày 1 của tháng kế tiếp."}
      {value.coachDailyLimitStartsMonth ? ` Hạn mức đã lưu có hiệu lực từ 01/${value.coachDailyLimitStartsMonth.slice(5)}/${value.coachDailyLimitStartsMonth.slice(0, 4)}.` : ""}</p>
    <Save label="Lưu thiết lập học theo tháng" onSave={onSave} />
  </section>;
}

function ImageSection({ value, onChange, onSave, onTest, onClear, readOnly = false }: { value: ProductPreferencesView; onChange: (value: ProductPreferencesView) => void; onSave?: () => void | Promise<void>; onTest?: () => void | Promise<void>; onClear?: () => void | Promise<void>; readOnly?: boolean }) { return <section className="card"><h3>Ảnh minh hoạ từ vựng</h3><p className="small muted">Tự động tìm ảnh có giấy phép mở từ Wikipedia, Wikimedia Commons và Openverse. Ảnh được lưu vào kho E4S kèm thông tin tác giả và giấy phép.</p><Field label="Nguồn ảnh"><select value={normalizeImageSource(value.vocabImageSource)} disabled={readOnly} onChange={(event) => onChange({ ...value, vocabImageSource: event.target.value as ProductPreferencesView["vocabImageSource"] })}><option value="wikimedia">Tự động từ nguồn mở</option><option value="disabled">Tắt ảnh minh hoạ</option></select></Field>{readOnly ? null : <div className="row"><Save label="Lưu nguồn ảnh" onSave={onSave} /><AsyncButton action={onTest} disabled={!onTest || value.vocabImageSource === "disabled"} busyLabel="Đang thử…" title={!onTest ? "Chưa có endpoint kiểm tra ảnh" : undefined}>Thử ảnh cho &quot;notebook&quot;</AsyncButton><AsyncButton className="btn-danger" action={onClear} disabled={!onClear} busyLabel="Đang xoá…" title={!onClear ? "Chưa có endpoint xoá cache ảnh" : undefined}>Xoá cache ảnh</AsyncButton></div>}</section>; }

function normalizeImageSource(source: ProductPreferencesView["vocabImageSource"]): "wikimedia" | "disabled" {
  return source === "disabled" ? "disabled" : "wikimedia";
}

function normalizeProductPreferences(value: ProductPreferencesView): ProductPreferencesView {
  return { ...value, vocabImageSource: normalizeImageSource(value.vocabImageSource) };
}

function legacyExperience(product: ProductPreferencesView, settings?: ManagerSettingsView): OrganisationExperienceView {
  return {
    theme: product.theme,
    backgroundMusic: {
      enabled: settings?.backgroundMusic.enabled ?? true,
      playlistId: "auto",
      customUrl: settings?.backgroundMusic.url ?? "",
      volume: settings?.backgroundMusic.volume ?? 22
    }
  };
}

function LevelSection({ value, onChange, onSave }: ManagerSectionProps) { const labels: Record<keyof ManagerSettingsView["levelUp"], string> = { days: "Số ngày xét", lessons: "Bài học hoàn thành ≥ (%)", firstTry: "Đúng ngay lần đầu ≥ (%)", submission: "Bài thực hành gần nhất ≥ (/100)", coach: "Rubric Season trung bình ≥ (/5)", coachTurns: "Số lượt chat tối thiểu", wrong: "Hạ mức: tỉ lệ sai > (%)", minParts: "Hạ mức: số phần tối thiểu/tháng" }; return <section className="card"><h3>Ngưỡng xét lên / hạ mức</h3><p className="small muted">Xét trong số ngày gần nhất: đủ 4 ngưỡng đầu = &quot;Sẵn sàng thi lên level&quot; (trừ C1). Khi kết quả chưa đạt ngưỡng trong nhiều lần xét liên tiếp, hệ thống gợi ý xem xét hạ mức (trừ A1).</p><div className="grid cols-4 settings-level-fields">{(Object.keys(labels) as (keyof ManagerSettingsView["levelUp"])[]).map((key) => <NumberField key={key} label={labels[key]} value={value.levelUp[key]} min={key === "coach" ? 0 : 1} max={key === "coach" ? 5 : key === "days" ? 60 : 100} step={key === "coach" ? 0.5 : 1} onChange={(next) => onChange({ ...value, levelUp: { ...value.levelUp, [key]: next } })} />)}</div><Save label="Lưu ngưỡng" onSave={onSave} /></section>; }

function ThemeSection({ value, onChange, onSave, readOnly = false }: { value: OrganisationExperienceView; onChange: (value: OrganisationExperienceView) => void; onSave?: () => void | Promise<void>; readOnly?: boolean }) {
  const { previewTheme, clearThemePreview } = useTheme();
  const themes: [OrganisationExperienceView["theme"], string][] = [["auto", "Tự động theo ngày"], ["spring", "Mùa xuân"], ["summer", "Mùa hạ"], ["autumn", "Mùa thu"], ["winter", "Mùa đông"], ["tet", "Tết Nguyên đán"], ["midautumn", "Trung thu"], ["christmas", "Giáng sinh – Năm mới"]];
  useEffect(() => {
    previewTheme(value.theme);
    return clearThemePreview;
  }, [clearThemePreview, previewTheme, value.theme]);
  return <section className="card"><h3>Giao diện theo mùa / lễ</h3><p className="small muted">Đổi màu và icon; không đổi bố cục, nội dung, dữ liệu. Thiết lập áp dụng cho toàn tổ chức và cập nhật ngay trên các thiết bị đang mở E4S.</p><fieldset className="settings-theme-picker" disabled={readOnly}><legend>Chủ đề giao diện (áp dụng ngay khi chọn)</legend>{themes.map(([id, label]) => <label className={`settings-theme-choice${value.theme === id ? " active" : ""}`} key={id}><input type="radio" name="organisation-theme" value={id} checked={value.theme === id} onChange={() => onChange({ ...value, theme: id })} />{id === "auto" ? <Star className="settings-theme-mark" size={16} strokeWidth={2} aria-hidden="true" /> : <ThemeMark theme={id as Exclude<OrganisationExperienceView["theme"], "auto">} />}<span>{label}</span></label>)}</fieldset>{readOnly ? null : <Save label="Lưu giao diện" onSave={onSave} />}</section>;
}

function ThemeMark({ theme }: { theme: Exclude<ProductPreferencesView["theme"], "auto"> }) {
  const props = { className: "settings-theme-mark", size: 16, strokeWidth: 2, "aria-hidden": true } as const;
  if (theme === "summer") return <Sun {...props} />;
  if (theme === "spring") return <Flower2 {...props} />;
  if (theme === "autumn") return <Leaf {...props} />;
  if (theme === "winter") return <Snowflake {...props} />;
  if (theme === "tet") return <Sparkles {...props} />;
  if (theme === "midautumn") return <MoonStar {...props} />;
  if (theme === "christmas") return <Gift {...props} />;
  return <Sparkles {...props} />;
}

function MusicSection({ value, onChange, onSave }: { value: OrganisationExperienceView; onChange: (value: OrganisationExperienceView) => void; onSave?: () => void | Promise<void> }) {
  const music = value.backgroundMusic;
  const preview = useRef<MusicPlayer | null>(null);
  const [previewStatus, setPreviewStatus] = useState("");
  const [playlistOpen, setPlaylistOpen] = useState(false);
  const setMusic = (next: Partial<OrganisationExperienceView["backgroundMusic"]>) => onChange({ ...value, backgroundMusic: { ...music, ...next } });
  const activeTheme = value.theme === "auto" ? autoSeasonTheme() : value.theme;
  const playlistChoices: readonly (readonly [string, string])[] = [["auto", "Tự động chọn theo giờ học"], ...MUSIC_PRESETS.map((preset) => [preset.id, preset.label] as const)];
  const selectedPlaylistLabel = playlistChoices.find(([id]) => id === music.playlistId)?.[1] ?? "Tự động chọn theo giờ học";
  const stopPreview = () => { preview.current?.pause(); preview.current = null; };
  useEffect(() => () => stopPreview(), []);
  useEffect(() => {
    if (!preview.current) return;
    preview.current.volume = music.volume / 100;
    setPreviewStatus(`Đang phát nhạc thử ở âm lượng ${music.volume}/100.`);
  }, [music.volume]);
  const playPreview = async (draft = music) => {
    stopPreview();
    setPreviewStatus("");
    const selection = resolveBackgroundMusic({ theme: activeTheme, date: new Date(), config: { ...draft, enabled: true }, personalEnabled: true, suspended: false });
    if (!selection.enabled) return;
    try {
      const player = createMusicPlayer(selection.url);
      player.preload = "auto";
      player.volume = selection.volume;
      preview.current = player;
      player.onerror = () => {
        stopPreview();
        setPreviewStatus("Nguồn nhạc không tải được. Hãy chọn danh sách khác hoặc thử lại khi mạng ổn định.");
      };
      await player.play();
      setPreviewStatus(`Đang phát nhạc thử ở âm lượng ${draft.volume}/100.`);
    } catch {
      stopPreview();
      setPreviewStatus("Không phát được nguồn nhạc này. Cấu hình đang lưu không bị thay đổi.");
    }
  };
  return <section className="card"><h3>Nhạc nền của Season</h3><p className="small muted">Danh sách nhạc mặc định lấy đúng từ prototype và cần mạng để phát qua YouTube. Thiết lập áp dụng toàn tổ chức; mỗi người vẫn có thể bật/tắt và nhạc sẽ dừng khi làm phần Nghe hoặc phát giọng đọc.</p>
    <label className="check"><input type="checkbox" checked={music.enabled} onChange={(event) => setMusic({ enabled: event.target.checked })} /> Cho phép nhạc nền trong app</label>
    <div className="settings-music-select"><span className="settings-music-select-label">Danh sách bài nhạc</span><button className="settings-music-select-trigger" type="button" aria-haspopup="listbox" aria-expanded={playlistOpen} onClick={() => setPlaylistOpen((open) => !open)}><span>{selectedPlaylistLabel}</span><span aria-hidden="true">⌄</span></button>{playlistOpen ? <div className="settings-music-options" role="listbox" aria-label="Danh sách bài nhạc">{playlistChoices.map(([id, label]) => <button className={music.playlistId === id ? "active" : ""} type="button" role="option" aria-selected={music.playlistId === id} key={id} onClick={() => { const nextMusic = { ...music, playlistId: id }; const restartPreview = Boolean(preview.current); onChange({ ...value, backgroundMusic: nextMusic }); setPlaylistOpen(false); if (restartPreview) void playPreview(nextMusic); }}><span>{label}</span>{music.playlistId === id ? <span aria-hidden="true">✓</span> : null}</button>)}</div> : null}</div>
    <Field label="Link YouTube tùy chỉnh (không bắt buộc)"><input value={music.customUrl} onChange={(event) => setMusic({ customUrl: event.target.value })} placeholder="https://www.youtube.com/watch?v=…" /></Field>
    <Field label={`Âm lượng: ${music.volume}/100`}><input className="settings-volume-range" style={{ "--range-value": `${music.volume}%` } as CSSProperties} type="range" min="0" max="100" value={music.volume} onChange={(event) => setMusic({ volume: Number(event.target.value) })} /></Field>
    <div className="row"><Save label="Lưu nhạc nền" onSave={onSave} /><AsyncButton action={playPreview} busyLabel="Đang mở…">Nghe thử</AsyncButton><button className="btn-ghost" type="button" onClick={() => { stopPreview(); setMusic({ playlistId: "auto", customUrl: "" }); setPreviewStatus("Đã trở về nhạc tự động. Nhấn Lưu để áp dụng cho tổ chức."); }}>Về nhạc tự động</button>{previewStatus ? <span className="small muted" role="status">{previewStatus}</span> : null}</div>
  </section>;
}

function PolicySection({ value, onChange, onSave }: ManagerSectionProps) { return <section className="card"><h3>Chính sách nhắc học và báo cáo</h3><NumberField label="Số ngày không hoạt động trước khi nhắc" value={value.reminderInactiveDays} min={1} max={30} onChange={(reminderInactiveDays) => onChange({ ...value, reminderInactiveDays })} /><label className="check"><input type="checkbox" checked={value.weeklyReportEnabled} onChange={(event) => onChange({ ...value, weeklyReportEnabled: event.target.checked })} /> Bật báo cáo tháng</label><Save label="Lưu chính sách" onSave={onSave} /></section>; }

function DataSection({ actions, capabilities }: { actions: Partial<SettingsActions>; capabilities: SystemCapabilitiesView }) { const reason = "Chưa có endpoint hệ thống cho thao tác này"; return <section className="card"><h3>Dữ liệu</h3><p className="small muted">Sao lưu, chuyển dữ liệu hoặc nạp dữ liệu kiểm thử qua API hệ thống. Trạng thái: API ✓ · Database ✓ · AI {capabilities.ai ? "✓" : "—"} · Object storage {capabilities.objectStorage ? "✓" : "—"}.</p><div className="row"><AsyncButton action={actions.onExportJson} disabled={!actions.onExportJson} busyLabel="Đang xuất…" title={!actions.onExportJson ? reason : undefined}>Xuất JSON</AsyncButton><ImportJsonButton action={actions.onImportJson} disabled={!actions.onImportJson} reason={reason} /><AsyncButton action={actions.onExportCsv} disabled={!actions.onExportCsv} busyLabel="Đang xuất…" title={!actions.onExportCsv ? reason : undefined}>Xuất CSV tiến độ</AsyncButton>{actions.onSeedData ? <AsyncButton className="btn-danger" action={actions.onSeedData} busyLabel="Đang chuẩn bị…">Nạp dữ liệu mẫu</AsyncButton> : null}{actions.onWipeData ? <AsyncButton className="btn-danger" action={actions.onWipeData} busyLabel="Đang chuẩn bị…">Xoá toàn bộ</AsyncButton> : null}</div></section>; }

function ImportJsonButton({ action, disabled, reason }: { action: SettingsActions["onImportJson"] | undefined; disabled: boolean; reason: string }) {
  const fileInput = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const importFile = async (file: File) => {
    if (!action || busy) return;
    setBusy(true);
    try { await action(file); } finally { setBusy(false); }
  };
  return <>
    <button className="btn-danger" type="button" disabled={Boolean(disabled || busy)} aria-busy={busy ? "true" : undefined} aria-controls="settings-import-json" title={disabled ? reason : undefined} onClick={() => fileInput.current?.click()}>Nhập JSON</button>
    <input id="settings-import-json" ref={fileInput} type="file" accept="application/json,.json" hidden onChange={(event) => { const file = event.target.files?.[0]; if (file) void importFile(file); event.target.value = ""; }} />
  </>;
}

type ManagerSectionProps = { value: ManagerSettingsView; onChange: (value: ManagerSettingsView) => void; onSave?: () => void | Promise<void> };
function Field({ label, children }: { label: string; children: ReactNode }) { return <label className="field"><span>{label}</span>{children}</label>; }
function NumberField({ label, value, min, max, step = 1, disabled, onChange }: { label: string; value: number; min: number; max: number; step?: number; disabled?: boolean; onChange: (value: number) => void }) { return <Field label={label}><input type="number" value={value} min={min} max={max} step={step} disabled={disabled} onChange={(event) => onChange(Number(event.target.value))} /></Field>; }
function Save({ label, onSave, disabled = false, disabledTitle }: { label: string; onSave: (() => void | Promise<void>) | undefined; disabled?: boolean; disabledTitle?: string }) { return <AsyncButton className="btn-primary" action={onSave} disabled={disabled || !onSave} aria-label={label} title={disabledTitle ?? (!onSave ? "Chưa có endpoint lưu cấu hình" : undefined)} busyLabel="Đang lưu…">Lưu</AsyncButton>; }
type AsyncButtonProps = Omit<ButtonHTMLAttributes<HTMLButtonElement>, "children" | "onClick"> & { action: (() => void | Promise<void>) | undefined; busyLabel?: ReactNode; children: ReactNode };
function AsyncButton({ action, busyLabel = "Đang xử lý…", children, disabled, type = "button", ...props }: AsyncButtonProps) {
  const [busy, setBusy] = useState(false);
  const run = async () => {
    if (!action || busy) return;
    setBusy(true);
    try { await action(); } catch { /* The owning controller renders the actionable error. */ } finally { setBusy(false); }
  };
  return <button {...props} type={type} disabled={Boolean(disabled || !action || busy)} aria-busy={busy ? "true" : undefined} onClick={() => void run()}>{busy ? <><span className="spinner" aria-hidden="true" /> {busyLabel}</> : children}</button>;
}
function toInput(value: ManagerSettingsView): ManagerSettingsInput { const { organizationName: _organizationName, pilotCycle: _pilotCycle, coachDailyLimitStartsMonth: _coachDailyLimitStartsMonth, ...input } = value; return input; }
function withCredential(value: AiConfigurationInput, credential: string): AiConfigurationInput { const { credential: _oldCredential, ...rest } = value; return credential ? { ...rest, credential } : rest; }
function lastTestLabel(test: ManagerProviderSettingsView["lastTest"]): string {
  if (!test || test.status === "never") return "Chưa kiểm tra kết nối";
  if (test.status === "success") return "Kiểm tra gần nhất: thành công.";
  return providerTestLabel(test.code);
}

export function providerTestLabel(code: string | null | undefined): string {
  if (code === "PROVIDER_NOT_CONFIGURED") return "Chưa lưu API key. Hãy nhập key, lưu rồi kiểm tra lại.";
  if (code === "PROVIDER_ENDPOINT_INVALID") return "Base URL không hợp lệ. Hãy kiểm tra địa chỉ nhà cung cấp.";
  if (code === "PROVIDER_NETWORK_ERROR") return "Không kết nối được nhà cung cấp. Hãy kiểm tra mạng và Base URL.";
  if (code === "PROVIDER_TIMEOUT") return "Nhà cung cấp phản hồi quá thời gian. Hãy thử lại sau.";
  if (code === "PROVIDER_UNAVAILABLE") return "Nhà cung cấp đang tạm thời không sẵn sàng. Hãy thử lại sau.";
  if (code?.startsWith("PROVIDER_HTTP_")) return `Nhà cung cấp từ chối yêu cầu (HTTP ${code.slice("PROVIDER_HTTP_".length)}). Hãy kiểm tra key, model và quyền truy cập.`;
  return "Kiểm tra AI chưa thành công. Hãy kiểm tra cấu hình rồi thử lại.";
}

export function webhookTestLabel(test: ManagerWebhookTestView): string {
  if (test.status === "success") return "Webhook đã nhận tin thử.";
  if (test.code === "WEBHOOK_URL_INVALID") return "Webhook URL không hợp lệ.";
  if (test.code === "WEBHOOK_URL_HTTPS_REQUIRED") return "Webhook URL phải dùng HTTPS.";
  if (test.code === "WEBHOOK_TEMPLATE_INVALID") return "Mẫu payload chưa phải JSON hợp lệ.";
  if (test.code === "WEBHOOK_TIMEOUT") return "Webhook phản hồi quá thời gian. Hãy thử lại hoặc kiểm tra phía Base.vn.";
  if (test.code === "WEBHOOK_NETWORK_ERROR") return "Server không kết nối được webhook. Hãy kiểm tra URL và mạng.";
  if (test.code?.startsWith("WEBHOOK_HTTP_")) return `Webhook từ chối yêu cầu (HTTP ${test.statusCode ?? test.code.slice("WEBHOOK_HTTP_".length)}).`;
  return "Webhook chưa nhận được tin thử.";
}
