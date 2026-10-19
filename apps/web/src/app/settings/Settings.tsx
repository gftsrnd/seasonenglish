import { useEffect, useRef, useState, type ButtonHTMLAttributes, type ReactNode } from "react";
import type { ManagerProviderSettingsInput, ManagerProviderSettingsView, ManagerSettingsInput, ManagerSettingsView, ManagerWebhookTestView, ProductPreferencesView, SystemCapabilitiesView } from "@e4s/contracts";
import { Flower2, Gift, Leaf, MoonStar, Snowflake, Sparkles, Star, Sun } from "lucide-react";
import { autoSeasonTheme } from "../games/season-visual.js";

export type AiConfigurationView = ManagerProviderSettingsView;
export type AiConfigurationInput = ManagerProviderSettingsInput;

const aiProviderDefaults: Record<AiConfigurationInput["provider"], Pick<AiConfigurationInput, "baseUrl" | "model" | "speechToTextModel">> = {
  claude: {
    baseUrl: "https://api.anthropic.com/v1",
    model: "claude-3-5-sonnet-latest",
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
};
export type SettingsProps = {
  role: "manager" | "operator";
  manager?: ManagerSettingsView;
  product: ProductPreferencesView;
  capabilities: SystemCapabilitiesView;
  ai?: AiConfigurationView;
  actions: Partial<SettingsActions>;
  accounts?: ReactNode;
};

export function SettingsPage({ role, manager, product, capabilities, ai, actions, accounts }: SettingsProps) {
  const [aiDraft, setAiDraft] = useState<AiConfigurationInput | null>(ai ? { provider: ai.provider, baseUrl: ai.baseUrl, model: ai.model, speechToTextModel: ai.speechToTextModel } : null);
  const [managerDraft, setManagerDraft] = useState(manager);
  const [productDraft, setProductDraft] = useState(() => normalizeProductPreferences(product));
  useEffect(() => setAiDraft(ai ? { provider: ai.provider, baseUrl: ai.baseUrl, model: ai.model, speechToTextModel: ai.speechToTextModel } : null), [ai]);
  useEffect(() => setManagerDraft(manager), [manager]);
  useEffect(() => setProductDraft(normalizeProductPreferences(product)), [product]);
  return <div className="settings-page" data-settings-role={role}>
    <div className="page-title"><h1>Cài đặt</h1></div>
    {role === "manager" ? aiDraft && ai ? <AiSection draft={aiDraft} configured={ai.configured} lastTest={ai.lastTest} capabilities={capabilities} onChange={setAiDraft} {...(actions.onSaveAi ? { onSave: () => actions.onSaveAi!(aiDraft) } : {})} {...(actions.onTestAi ? { onTest: () => actions.onTestAi!(aiDraft) } : {})} /> : <UnavailableAiSection capabilities={capabilities} role={role} /> : null}
    {role === "manager" && managerDraft ? <>
      <PilotSection value={managerDraft} onChange={setManagerDraft} {...(actions.onSaveManager ? { onSave: () => actions.onSaveManager!(toInput(managerDraft)) } : {})} />
      <ImageSection value={productDraft} onChange={setProductDraft} {...(actions.onSaveProduct ? { onSave: () => actions.onSaveProduct!(productDraft) } : {})} {...(actions.onTestImage ? { onTest: () => actions.onTestImage!(productDraft) } : {})} {...(actions.onClearImageCache ? { onClear: actions.onClearImageCache } : {})} />
      <TestSection value={managerDraft} onChange={setManagerDraft} {...(actions.onSaveManager ? { onSave: () => actions.onSaveManager!(toInput(managerDraft)) } : {})} />
      <LevelSection value={managerDraft} onChange={setManagerDraft} {...(actions.onSaveManager ? { onSave: () => actions.onSaveManager!(toInput(managerDraft)) } : {})} />
      <ThemeSection value={productDraft} onChange={setProductDraft} {...(actions.onSaveProduct ? { onSave: () => actions.onSaveProduct!(productDraft) } : {})} />
      <MusicSection value={managerDraft} onChange={setManagerDraft} {...(actions.onSaveManager ? { onSave: () => actions.onSaveManager!(toInput(managerDraft)) } : {})} {...(actions.onTestMusic ? { onTest: actions.onTestMusic } : {})} {...(actions.onResetMusic ? { onReset: actions.onResetMusic } : {})} />
      <WebhookSection value={managerDraft} onChange={setManagerDraft} {...(actions.onSaveManager ? { onSave: () => actions.onSaveManager!(toInput(managerDraft)) } : {})} {...(actions.onTestWebhook ? { onTest: actions.onTestWebhook } : {})} />
      <PolicySection value={managerDraft} onChange={setManagerDraft} {...(actions.onSaveManager ? { onSave: () => actions.onSaveManager!(toInput(managerDraft)) } : {})} />
      <DataSection actions={actions} capabilities={capabilities} />
      {accounts}
    </> : <>
      <section className="card"><h3>Prompt & rubric</h3><p className="small muted">Sửa hướng dẫn AI sinh bài, coach và chấm bài. Để trống dùng mặc định.</p><a className="btn" href="/op/prompts">Mở trình sửa prompt</a></section>
    </>}
  </div>;
}

function UnavailableAiSection({ capabilities, role }: { capabilities: SystemCapabilitiesView; role: "manager" | "operator" }) { return <section className="card"><h3>Kết nối AI</h3><div className="banner info"><div className="body small">{role === "operator" ? <>Chỉ xem trạng thái kết nối AI ({capabilities.ai ? "đang hoạt động" : "chưa hoạt động"}). Nhà cung cấp, model và khoá do Quản lý quản trị; khoá không hiển thị trên trình duyệt.</> : <>API chỉ trả trạng thái AI {capabilities.ai ? "đang hoạt động" : "chưa hoạt động"}; chưa có endpoint lưu hoặc kiểm tra cấu hình. Điều khiển được tắt để tránh tạo cấu hình giả.</>}</div></div>{role === "operator" ? <span className={`badge ${capabilities.ai ? "ok" : "warn"}`}>{capabilities.ai ? "đang hoạt động" : "chưa sẵn sàng"}</span> : <div className="row"><button className="btn-primary" type="button" disabled>Lưu kết nối AI</button><button type="button" disabled>Kiểm tra kết nối</button></div>}</section>; }

function AiSection({ draft, configured, lastTest, capabilities, onChange, onSave, onTest }: { draft: AiConfigurationInput; configured: boolean; lastTest?: ManagerProviderSettingsView["lastTest"]; capabilities: SystemCapabilitiesView; onChange: (value: AiConfigurationInput) => void; onSave?: () => void | Promise<void>; onTest?: () => void | Promise<void> }) {
  const openAiPreset = draft.provider === "openai" ? openAiPresetFor(draft.baseUrl) : "custom";
  const changeProvider = (provider: AiConfigurationInput["provider"]) => onChange({ ...draft, provider, ...aiProviderDefaults[provider], credential: undefined });
  return <section className="card"><h3>Kết nối AI</h3><p className="small muted">Khoá nhà cung cấp được lưu an toàn ở server; trình duyệt chỉ gửi giá trị mới khi bạn chủ động thay đổi.</p>
    <label className="field"><span>Nhà cung cấp</span><select value={draft.provider} onChange={(event) => changeProvider(event.target.value as AiConfigurationInput["provider"])}><option value="claude">Claude (Anthropic)</option><option value="gemini">Google Gemini</option><option value="openai">OpenAI-compatible</option></select></label>
    {draft.provider === "openai" ? <label className="field"><span>Preset OpenAI-compatible</span><select value={openAiPreset} onChange={(event) => { const preset = event.target.value as OpenAiBaseUrlPreset; onChange({ ...draft, baseUrl: preset === "custom" ? "" : openAiBaseUrlPresets[preset] }); }}><option value="groq">Groq</option><option value="openrouter">OpenRouter</option><option value="cerebras">Cerebras</option><option value="ollama">Ollama (local)</option><option value="custom">Tuỳ chỉnh</option></select></label> : null}
    {draft.provider === "openai" ? <label className="field"><span>Base URL</span><input value={draft.baseUrl} onChange={(event) => onChange({ ...draft, baseUrl: event.target.value })} placeholder="https://api.groq.com/openai/v1" /></label> : null}
    <div className="grid cols-2"><label className="field"><span>API key mới (để trống = giữ key đang lưu)</span><input type="password" autoComplete="new-password" value={draft.credential ?? ""} onChange={(event) => onChange(withCredential(draft, event.target.value))} /></label><label className="field"><span>Tên model</span><input value={draft.model} onChange={(event) => onChange({ ...draft, model: event.target.value })} /></label></div>
    {draft.provider === "openai" ? <label className="field"><span>Model chép lời file ghi âm</span><input value={draft.speechToTextModel} onChange={(event) => onChange({ ...draft, speechToTextModel: event.target.value })} /></label> : null}
    <div className="row"><AsyncButton className="btn-primary" action={onSave} disabled={!onSave} busyLabel="Đang lưu…">Lưu kết nối AI</AsyncButton><AsyncButton action={onTest} disabled={!onTest} busyLabel="Đang kiểm tra…" aria-label="Kiểm tra kết nối AI">Kiểm tra kết nối</AsyncButton><span className={`badge ${configured && capabilities.ai ? "ok" : "warn"}`}>{configured && capabilities.ai ? "đã kết nối" : "chưa sẵn sàng"}</span><span className="small muted" role="status" aria-live="polite">{lastTestLabel(lastTest)}</span></div>
  </section>;
}

function PilotSection({ value, onChange, onSave }: ManagerSectionProps) { return <section className="card"><h3>Lịch pilot</h3><div className="grid cols-3"><Field label="Ngày bắt đầu (Thứ Hai tuần 1)"><input type="date" value={value.pilotStartDate} onChange={(event) => onChange({ ...value, pilotStartDate: event.target.value })} /></Field><Field label="Số tuần"><select value={value.pilotWeeks} onChange={(event) => onChange({ ...value, pilotWeeks: Number(event.target.value) })}><option>2</option><option>3</option><option>4</option></select></Field><NumberField label="Ép tuần hiện tại (0 = tự tính)" value={value.weekOverride} min={0} max={4} onChange={(weekOverride) => onChange({ ...value, weekOverride })} /></div><NumberField label="Khuyến nghị học tối thiểu (phút/ngày)" value={value.minMinutesPerDay} min={5} max={60} onChange={(minMinutesPerDay) => onChange({ ...value, minMinutesPerDay })} /><Field label="Chủ đề lớn của khoá (hiện ở Trang chủ học viên, phía trên chủ đề tuần)"><input value={value.courseTheme} placeholder="Tiếng Anh giao tiếp công sở" onChange={(event) => onChange({ ...value, courseTheme: event.target.value })} /></Field><NumberField label="Giới hạn chat với Season (lượt/ngày cho mỗi học viên)" value={value.coachDailyLimit} min={1} max={200} onChange={(coachDailyLimit) => onChange({ ...value, coachDailyLimit })} /><p className="xs muted settings-pilot-status" role="status">{pilotWeekSummary(value)}</p><Save label="Lưu lịch pilot" onSave={onSave} /></section>; }

function ImageSection({ value, onChange, onSave, onTest, onClear, readOnly = false }: { value: ProductPreferencesView; onChange: (value: ProductPreferencesView) => void; onSave?: () => void | Promise<void>; onTest?: () => void | Promise<void>; onClear?: () => void | Promise<void>; readOnly?: boolean }) { return <section className="card"><h3>Ảnh minh hoạ từ vựng</h3><p className="small muted">Tự động tìm ảnh có giấy phép mở từ Wikipedia, Wikimedia Commons và Openverse. Ảnh được lưu vào kho E4S kèm thông tin tác giả và giấy phép.</p><Field label="Nguồn ảnh"><select value={normalizeImageSource(value.vocabImageSource)} disabled={readOnly} onChange={(event) => onChange({ ...value, vocabImageSource: event.target.value as ProductPreferencesView["vocabImageSource"] })}><option value="wikimedia">Tự động từ nguồn mở</option><option value="disabled">Tắt ảnh minh hoạ</option></select></Field>{readOnly ? null : <div className="row"><Save label="Lưu nguồn ảnh" onSave={onSave} /><AsyncButton action={onTest} disabled={!onTest || value.vocabImageSource === "disabled"} busyLabel="Đang thử…" title={!onTest ? "Chưa có endpoint kiểm tra ảnh" : undefined}>Thử ảnh cho &quot;notebook&quot;</AsyncButton><AsyncButton className="btn-ghost" action={onClear} disabled={!onClear} busyLabel="Đang xoá…" title={!onClear ? "Chưa có endpoint xoá cache ảnh" : undefined}>Xoá cache ảnh</AsyncButton></div>}</section>; }

function normalizeImageSource(source: ProductPreferencesView["vocabImageSource"]): "wikimedia" | "disabled" {
  return source === "disabled" ? "disabled" : "wikimedia";
}

function normalizeProductPreferences(value: ProductPreferencesView): ProductPreferencesView {
  return { ...value, vocabImageSource: normalizeImageSource(value.vocabImageSource) };
}

function TestSection({ value, onChange, onSave }: ManagerSectionProps) { const updateTime = (key: keyof ManagerSettingsView["testTimes"], next: number) => onChange({ ...value, testTimes: { ...value.testTimes, [key]: next } }); return <section className="card"><h3>Bài test đầu vào / cuối kỳ</h3><p className="small muted">&quot;Workplace English CEFR Placement Test (Refined)&quot;: Nghe 20 · Đọc, Ngữ pháp &amp; Từ vựng 40 · Viết 20 (2 task) · Nói 20 (4 task), tổng 100 điểm. Mỗi phần tính giờ riêng; hết giờ tự nộp. Rời màn hình bị cảnh báo; quá số lần cho phép cũng tự nộp.</p><label className="check"><input type="checkbox" checked={value.testTimed} onChange={(event) => onChange({ ...value, testTimed: event.target.checked })} /> Bật tính giờ</label><div className="grid cols-4">{(["listening", "reading", "writing", "speaking"] as const).map((key) => <NumberField key={key} label={`${({ listening: "Nghe", reading: "Đọc", writing: "Viết", speaking: "Nói" })[key]} (phút)`} value={value.testTimes[key]} min={1} max={60} onChange={(next) => updateTime(key, next)} />)}</div><NumberField label="Số lần cảnh báo (kèm âm thanh) khi rời màn hình; vi phạm lần kế tiếp thì tự nộp" value={value.testWarnLimit} min={1} max={10} onChange={(testWarnLimit) => onChange({ ...value, testWarnLimit })} /><Save label="Lưu bài test" onSave={onSave} /></section>; }

function LevelSection({ value, onChange, onSave }: ManagerSectionProps) { const labels: Record<keyof ManagerSettingsView["levelUp"], string> = { days: "Số ngày xét", lessons: "Bài học hoàn thành ≥ (%)", firstTry: "Đúng ngay lần đầu ≥ (%)", submission: "Bài thực hành gần nhất ≥ (/100)", coach: "Rubric Season trung bình ≥ (/5)", coachTurns: "Số lượt chat tối thiểu", wrong: "Hạ mức: tỉ lệ sai > (%)", minParts: "Hạ mức: số phần tối thiểu/tuần" }; return <section className="card"><h3>Ngưỡng xét lên / hạ mức</h3><p className="small muted">Xét trong số ngày gần nhất: đủ 4 ngưỡng đầu = &quot;Sẵn sàng thi lên level&quot; (trừ C1). Hai tuần liền sai quá số lượt cho phép = &quot;Nên xem xét hạ mức&quot; (trừ A1).</p><div className="grid cols-4">{(Object.keys(labels) as (keyof ManagerSettingsView["levelUp"])[]).map((key) => <NumberField key={key} label={labels[key]} value={value.levelUp[key]} min={key === "coach" ? 0 : 1} max={key === "coach" ? 5 : key === "days" ? 60 : 100} step={key === "coach" ? 0.5 : 1} onChange={(next) => onChange({ ...value, levelUp: { ...value.levelUp, [key]: next } })} />)}</div><Save label="Lưu ngưỡng" onSave={onSave} /></section>; }

function ThemeSection({ value, onChange, onSave, readOnly = false }: { value: ProductPreferencesView; onChange: (value: ProductPreferencesView) => void; onSave?: () => void | Promise<void>; readOnly?: boolean }) {
  const themes: [ProductPreferencesView["theme"], string][] = [["auto", "Tự động theo ngày"], ["spring", "Mùa xuân"], ["summer", "Mùa hạ"], ["autumn", "Mùa thu"], ["winter", "Mùa đông"], ["tet", "Tết Nguyên đán"], ["midautumn", "Trung thu"], ["christmas", "Giáng sinh – Năm mới"]];
  useEffect(() => {
    document.documentElement.dataset.theme = value.theme === "auto" ? autoSeasonTheme() : value.theme;
  }, [value.theme]);
  return <section className="card"><h3>Giao diện theo mùa / lễ</h3><p className="small muted">Đổi màu và icon; không đổi bố cục, nội dung, dữ liệu. Tự động: Tết (−7/+10 ngày), Trung thu (±5 ngày), Giáng sinh–Năm mới (15/12–2/1); còn lại theo mùa: xuân 2–4, hạ 5–7, thu 8–10, đông 11–1.</p><Field label="Chủ đề giao diện (áp dụng ngay khi chọn)"><select value={value.theme} disabled={readOnly} onChange={(event) => onChange({ ...value, theme: event.target.value as ProductPreferencesView["theme"] })}>{themes.map(([id, label]) => <option value={id} key={id}>{label}</option>)}</select></Field><div className="row">{themes.slice(1).map(([id, label]) => <span className="badge settings-theme-badge" key={id}><ThemeMark theme={id as Exclude<ProductPreferencesView["theme"], "auto">} />{label}</span>)}</div>{readOnly ? null : <Save label="Lưu giao diện" onSave={onSave} />}</section>;
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

function MusicSection({ value, onChange, onSave, onTest, onReset }: ManagerSectionProps & { onTest?: SettingsActions["onTestMusic"]; onReset?: SettingsActions["onResetMusic"] }) { const music = value.backgroundMusic; const setMusic = (next: Partial<ManagerSettingsView["backgroundMusic"]>) => onChange({ ...value, backgroundMusic: { ...music, ...next } }); return <section className="card"><h3>Nhạc nền của Season</h3><p className="small muted">Nhạc YouTube ẩn, cần mạng; chỉ dùng nhạc không bản quyền. Dán link video/playlist; để trống dùng mặc định. Mỗi người bật/tắt trên đầu trang; nhạc tự tắt khi làm phần Nghe hoặc có giọng đọc.</p><label className="check"><input type="checkbox" checked={music.enabled} onChange={(event) => setMusic({ enabled: event.target.checked })} /> Cho phép nhạc nền trong app</label><Field label="Link YouTube (video hoặc playlist)"><input value={music.url} onChange={(event) => setMusic({ url: event.target.value })} /></Field><Field label={`Âm lượng: ${music.volume}/100`}><input type="range" min="0" max="100" value={music.volume} onChange={(event) => setMusic({ volume: Number(event.target.value) })} /></Field><div className="row"><Save label="Lưu nhạc nền" onSave={onSave} /><AsyncButton action={onTest ? () => onTest(music) : undefined} disabled={!onTest} busyLabel="Đang kiểm tra…" title={!onTest ? "Chưa có endpoint nghe thử nhạc" : undefined}>Lưu &amp; nghe thử</AsyncButton><AsyncButton className="btn-ghost" action={onReset} disabled={!onReset} busyLabel="Đang đặt lại…" title={!onReset ? "Chưa có endpoint đặt lại nhạc" : undefined}>Về nhạc mặc định</AsyncButton></div></section>; }

function WebhookSection({ value, onChange, onSave, onTest }: ManagerSectionProps & { onTest?: SettingsActions["onTestWebhook"] }) {
  const [lastTest, setLastTest] = useState<ManagerWebhookTestView>();
  const test = onTest ? async () => { setLastTest(await onTest(value.baseWebhookUrl, value.baseWebhookTemplate)); } : undefined;
  return <section className="card"><h3>Nhắc học qua Base.vn (Base Message incoming webhook)</h3><p className="small muted">Dán URL incoming webhook của Base Message. Payload dùng <code>base_content</code>; hỗ trợ <code>{"{message}"}</code> và <code>{"{name}"}</code>. Việc kiểm tra được thực hiện ở server và không hiển thị URL, payload hoặc phản hồi thô.</p><Field label="Webhook URL"><input value={value.baseWebhookUrl} onChange={(event) => onChange({ ...value, baseWebhookUrl: event.target.value })} /></Field><Field label="Mẫu payload (JSON)"><textarea value={value.baseWebhookTemplate} onChange={(event) => onChange({ ...value, baseWebhookTemplate: event.target.value })} /></Field><div className="row"><Save label="Lưu webhook" onSave={onSave} /><AsyncButton action={test} disabled={!test} busyLabel="Đang gửi…" title={!test ? "Chưa có endpoint gửi webhook thử" : undefined}>Gửi tin thử</AsyncButton>{lastTest ? <span className="small muted" role="status" aria-live="polite">{webhookTestLabel(lastTest)}</span> : null}</div></section>;
}

function PolicySection({ value, onChange, onSave }: ManagerSectionProps) { return <section className="card"><h3>Chính sách nhắc học và báo cáo</h3><NumberField label="Số ngày không hoạt động trước khi nhắc" value={value.reminderInactiveDays} min={1} max={30} onChange={(reminderInactiveDays) => onChange({ ...value, reminderInactiveDays })} /><label className="check"><input type="checkbox" checked={value.weeklyReportEnabled} onChange={(event) => onChange({ ...value, weeklyReportEnabled: event.target.checked })} /> Bật báo cáo tuần</label><Save label="Lưu chính sách" onSave={onSave} /></section>; }

function DataSection({ actions, capabilities }: { actions: Partial<SettingsActions>; capabilities: SystemCapabilitiesView }) { const reason = "Chưa có endpoint hệ thống cho thao tác này"; return <section className="card"><h3>Dữ liệu</h3><p className="small muted">Sao lưu, chuyển dữ liệu hoặc nạp dữ liệu kiểm thử qua API hệ thống. Trạng thái: API ✓ · Database ✓ · AI {capabilities.ai ? "✓" : "—"} · Object storage {capabilities.objectStorage ? "✓" : "—"}.</p><div className="row"><AsyncButton action={actions.onExportJson} disabled={!actions.onExportJson} busyLabel="Đang xuất…" title={!actions.onExportJson ? reason : undefined}>Xuất JSON</AsyncButton><ImportJsonButton action={actions.onImportJson} disabled={!actions.onImportJson} reason={reason} /><AsyncButton action={actions.onExportCsv} disabled={!actions.onExportCsv} busyLabel="Đang xuất…" title={!actions.onExportCsv ? reason : undefined}>Xuất CSV tiến độ</AsyncButton>{actions.onSeedData ? <AsyncButton action={actions.onSeedData} busyLabel="Đang chuẩn bị…">Nạp dữ liệu mẫu</AsyncButton> : null}{actions.onWipeData ? <AsyncButton className="btn-danger" action={actions.onWipeData} busyLabel="Đang chuẩn bị…">Xoá toàn bộ</AsyncButton> : null}</div></section>; }

function ImportJsonButton({ action, disabled, reason }: { action: SettingsActions["onImportJson"] | undefined; disabled: boolean; reason: string }) {
  const fileInput = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const importFile = async (file: File) => {
    if (!action || busy) return;
    setBusy(true);
    try { await action(file); } finally { setBusy(false); }
  };
  return <>
    <button type="button" disabled={Boolean(disabled || busy)} aria-busy={busy ? "true" : undefined} aria-controls="settings-import-json" title={disabled ? reason : undefined} onClick={() => fileInput.current?.click()}>Nhập JSON</button>
    <input id="settings-import-json" ref={fileInput} type="file" accept="application/json,.json" hidden onChange={(event) => { const file = event.target.files?.[0]; if (file) void importFile(file); event.target.value = ""; }} />
  </>;
}

type ManagerSectionProps = { value: ManagerSettingsView; onChange: (value: ManagerSettingsView) => void; onSave?: () => void | Promise<void> };
function Field({ label, children }: { label: string; children: ReactNode }) { return <label className="field"><span>{label}</span>{children}</label>; }
function NumberField({ label, value, min, max, step = 1, onChange }: { label: string; value: number; min: number; max: number; step?: number; onChange: (value: number) => void }) { return <Field label={label}><input type="number" value={value} min={min} max={max} step={step} onChange={(event) => onChange(Number(event.target.value))} /></Field>; }
function Save({ label, onSave }: { label: string; onSave: (() => void | Promise<void>) | undefined }) { return <AsyncButton className="btn-primary" action={onSave} disabled={!onSave} aria-label={label} title={!onSave ? "Chưa có endpoint lưu cấu hình" : undefined} busyLabel="Đang lưu…">Lưu</AsyncButton>; }
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
function toInput(value: ManagerSettingsView): ManagerSettingsInput { const { organizationName: _organizationName, ...input } = value; return input; }
function withCredential(value: AiConfigurationInput, credential: string): AiConfigurationInput { const { credential: _oldCredential, ...rest } = value; return credential ? { ...rest, credential } : rest; }
function pilotWeekSummary(value: ManagerSettingsView): string {
  const [year, month, day] = value.pilotStartDate.split("-").map(Number);
  if (![year, month, day].every(Number.isFinite) || !year || !month || !day) return "Tuần hiện tại theo cấu hình: chưa đủ ngày bắt đầu.";
  const dayMs = 24 * 60 * 60 * 1000;
  const start = Date.UTC(year, month - 1, day);
  const now = new Date();
  const today = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate());
  const week = value.weekOverride > 0 ? clampNumber(value.weekOverride, 1, value.pilotWeeks) : clampNumber(Math.floor((today - start) / dayMs) + 1, 1, value.pilotWeeks);
  const weekStart = new Date(start + (week - 1) * 7 * dayMs);
  const weekEnd = new Date(start + (week * 7 - 1) * dayMs);
  const format = new Intl.DateTimeFormat("vi-VN", { day: "2-digit", month: "2-digit", year: "numeric", timeZone: "UTC" });
  return `Tuần hiện tại theo cấu hình: Tuần ${week} (${format.format(weekStart)} → ${format.format(weekEnd)}).`;
}
function clampNumber(value: number, min: number, max: number): number { return Math.min(Math.max(value, min), Math.max(min, max)); }
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
