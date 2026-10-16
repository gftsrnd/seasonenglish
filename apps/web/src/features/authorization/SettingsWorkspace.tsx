import { useEffect, useState, type ReactNode } from "react";
import type { ManagerSettingsInput, ManagerSettingsView, ProductPreferencesView, SystemCapabilitiesView } from "@e4s/contracts";
import type { StaffRole } from "./RoleScopeNotice.js";

const sectionNames = { listening: "Nghe", reading: "Đọc", writing: "Viết", speaking: "Nói" } as const;
const levelFields = [
  ["days", "Số ngày xét", 60], ["lessons", "Bài học hoàn thành ≥ (%)", 100],
  ["firstTry", "Đúng ngay lần đầu ≥ (%)", 100], ["submission", "Bài thực hành gần nhất ≥ (/100)", 100],
  ["coach", "Rubric Season trung bình ≥ (/5)", 5], ["coachTurns", "Số lượt chat tối thiểu", 100],
  ["wrong", "Hạ mức: tỉ lệ sai > (%)", 100], ["minParts", "Hạ mức: số phần tối thiểu/tuần", 50]
] as const;

export function SettingsWorkspace({ role, managerAccounts, managerConfiguration, capabilities, preferences, onSavePreferences, onSaveManagerSettings }: {
  role: StaffRole; managerAccounts?: ReactNode | undefined; managerConfiguration?: ManagerSettingsView | undefined;
  capabilities?: SystemCapabilitiesView | undefined; preferences?: ProductPreferencesView | undefined;
  onSavePreferences?: ((input: ProductPreferencesView) => Promise<void>) | undefined;
  onSaveManagerSettings?: ((input: ManagerSettingsInput) => Promise<void>) | undefined;
}) {
  const isManager = role === "manager";
  const [product, setProduct] = useState<ProductPreferencesView>(preferences ?? { theme: "auto", vocabImageSource: "wikimedia" });
  const [manager, setManager] = useState<ManagerSettingsView | undefined>(() => normalizeManagerSettings(managerConfiguration));
  const [reminderDaysInput, setReminderDaysInput] = useState(() => String(normalizeManagerSettings(managerConfiguration)?.reminderInactiveDays ?? 3));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => { if (preferences) setProduct(preferences); }, [preferences]);
  useEffect(() => { if (managerConfiguration) { const normalized = normalizeManagerSettings(managerConfiguration); setManager(normalized); setReminderDaysInput(String(normalized?.reminderInactiveDays ?? 3)); } }, [managerConfiguration]);
  const setValue = <K extends keyof ManagerSettingsView>(key: K, value: ManagerSettingsView[K]) => setManager((current) => current ? { ...current, [key]: value } : current);
  const saveProduct = () => { if (!isManager || !onSavePreferences) return; setSaving(true); setError(""); void onSavePreferences(product).catch(() => setError("Không lưu được giao diện và ảnh.")).finally(() => setSaving(false)); };
  const saveManager = () => {
    if (!manager || !onSaveManagerSettings) return;
    const reminderInactiveDays = Number(reminderDaysInput);
    if (!Number.isInteger(reminderInactiveDays) || reminderInactiveDays < 1 || reminderInactiveDays > 30) {
      setError("Số ngày nhắc học phải từ 1 đến 30.");
      return;
    }
    const nextManager = { ...manager, reminderInactiveDays };
    const { organizationName: _, ...input } = nextManager;
    setSaving(true); setError(""); void onSaveManagerSettings(input).catch(() => setError("Không lưu được cài đặt vận hành.")).finally(() => setSaving(false));
  };
  const saveButton = <button className="button button--primary" type="button" disabled={saving} onClick={saveManager}>{saving ? "Đang lưu…" : "Lưu"}</button>;
  const policySaveButton = <button aria-label="Lưu chính sách" className="button button--primary" type="button" disabled={saving} onClick={saveManager}>{saving ? "Đang lưu…" : "Lưu"}</button>;

  return <main className="operator-page settings-page">
    <header className="operator-heading"><h1>Cài đặt</h1></header>
    <section className="operator-section"><h3>Kết nối AI</h3><p className="small muted">AI được gọi qua API E4S khi sinh bài, chấm bài và chat coach. Khoá nhà cung cấp được giữ ở server.</p><label className="field"><span>Nhà cung cấp</span><select value="groq" disabled><option value="groq">OpenAI-compatible: Groq</option></select></label><div className="settings-two-columns"><label className="field"><span>Trạng thái</span><input value={capabilities?.ai ? "Đã kết nối" : "Chưa kết nối"} readOnly /></label><label className="field"><span>Tên model</span><input value="qwen/qwen3.8-27b" readOnly /></label></div><p className="xs muted">Đang dùng: <b>Groq</b> · model <code>qwen/qwen3.8-27b</code></p></section>

    {isManager && manager ? <section className="operator-section"><h3>Lịch pilot</h3><div className="settings-three-columns"><label className="field"><span>Ngày bắt đầu (Thứ Hai tuần 1)</span><input type="date" value={manager.pilotStartDate} onChange={(e) => setValue("pilotStartDate", e.target.value)} /></label><label className="field"><span>Số tuần</span><select value={manager.pilotWeeks} onChange={(e) => setValue("pilotWeeks", Number(e.target.value))}><option>2</option><option>3</option><option>4</option></select></label><label className="field"><span>Ép tuần hiện tại (0 = tự tính)</span><input type="number" min="0" max="4" value={manager.weekOverride} onChange={(e) => setValue("weekOverride", Number(e.target.value))} /></label></div><label className="field"><span>Khuyến nghị học tối thiểu (phút/ngày)</span><input type="number" min="5" max="60" value={manager.minMinutesPerDay} onChange={(e) => setValue("minMinutesPerDay", Number(e.target.value))} /></label><label className="field"><span>Chủ đề lớn của khoá (hiện ở Trang chủ học viên, phía trên chủ đề tuần)</span><input value={manager.courseTheme} onChange={(e) => setValue("courseTheme", e.target.value)} /></label><label className="field settings-short-field"><span>Giới hạn chat với Season (lượt/ngày cho mỗi học viên)</span><input type="number" min="1" max="200" value={manager.coachDailyLimit} onChange={(e) => setValue("coachDailyLimit", Number(e.target.value))} /></label>{saveButton}</section> : null}

    {!isManager ? <div className="operator-section"><div className="banner info"><div className="body small"><b>Phạm vi Người vận hành:</b> Bạn chỉ xem cấu hình cấp tổ chức do Quản lý áp dụng. Prompt và rubric được giao vẫn chỉnh tại lối tắt bên dưới.</div></div></div> : null}
    <section className="operator-section"><h3>Ảnh minh hoạ từ vựng</h3><p className="small muted">Ảnh lấy từ kho ảnh miễn phí theo từ tiếng Anh, không qua AI. Nguồn không có ảnh sẽ rơi về Wikimedia.</p><label className="field"><span>Nguồn ảnh</span><select value={product.vocabImageSource} disabled={!isManager} onChange={(e) => setProduct({ ...product, vocabImageSource: e.target.value as ProductPreferencesView["vocabImageSource"] })}><option value="pexels">Pexels, dự phòng Wikimedia</option><option value="pixabay">Pixabay, dự phòng Wikimedia</option><option value="openverse">Openverse, dự phòng Wikimedia</option><option value="wikimedia">Wikimedia / Wikimedia Commons (không cần key)</option><option value="disabled">Tắt ảnh minh hoạ</option></select></label>{isManager ? <button className="button button--primary" type="button" disabled={saving || !preferences} onClick={saveProduct}>Lưu</button> : <p className="xs muted">Chỉ Quản lý có thể thay đổi nguồn ảnh.</p>}</section>

    {isManager && manager ? <>
      <section className="operator-section"><h3>Bài test đầu vào / cuối kỳ</h3><p className="small muted">Đề “Workplace English CEFR Placement Test (Refined)”: Nghe 20 · Đọc, Ngữ pháp &amp; Từ vựng 40 · Viết 20 · Nói 20 = 100 điểm. Thời gian tính riêng từng phần; hết giờ tự chuyển phần và tự nộp.</p><label className="check"><input type="checkbox" checked={manager.testTimed} onChange={(e) => setValue("testTimed", e.target.checked)} /> Bật tính giờ</label><div className="settings-four-columns">{(Object.keys(sectionNames) as Array<keyof typeof sectionNames>).map((key) => <label className="field" key={key}><span>{sectionNames[key]} (phút)</span><input type="number" min="1" max="60" value={manager.testTimes[key]} onChange={(e) => setValue("testTimes", { ...manager.testTimes, [key]: Number(e.target.value) })} /></label>)}</div><label className="field settings-short-field"><span>Số lần cảnh báo khi rời màn hình</span><input type="number" min="1" max="10" value={manager.testWarnLimit} onChange={(e) => setValue("testWarnLimit", Number(e.target.value))} /></label>{saveButton}</section>
      <section className="operator-section"><h3>Ngưỡng xét lên / hạ mức</h3><p className="small muted">Tính trên số ngày gần nhất. Sẵn sàng thi lên level khi đủ các ngưỡng; hạ mức chỉ là tín hiệu để Quản lý xem xét.</p><div className="settings-four-columns">{levelFields.map(([key, label, max]) => <label className="field" key={key}><span>{label}</span><input type="number" min={key === "coach" ? 0 : 1} max={max} step={key === "coach" ? .5 : 1} value={manager.levelUp[key]} onChange={(e) => setValue("levelUp", { ...manager.levelUp, [key]: Number(e.target.value) })} /></label>)}</div>{saveButton}</section>
    </> : null}

    <section className="operator-section"><h3>Giao diện theo mùa / lễ</h3><p className="small muted">Chỉ bảng màu và icon chính thay đổi; bố cục, nội dung và dữ liệu giữ nguyên. Ở chế độ tự động, app chọn theo ngày và các mùa/lễ đã cấu hình.</p><label className="field"><span>Chủ đề giao diện (áp dụng ngay khi chọn)</span><select value={product.theme} disabled={!isManager} onChange={(e) => setProduct({ ...product, theme: e.target.value as ProductPreferencesView["theme"] })}><option value="auto">Tự động theo ngày</option><option value="spring">Mùa xuân</option><option value="summer">Mùa hạ</option><option value="autumn">Mùa thu</option><option value="winter">Mùa đông</option><option value="tet">Tết Nguyên đán</option><option value="midautumn">Trung thu</option><option value="christmas">Giáng sinh – Năm mới</option></select></label>{isManager ? <button className="button button--primary" type="button" disabled={saving || !preferences} onClick={saveProduct}>Lưu</button> : <p className="xs muted">Chỉ Quản lý có thể thay đổi giao diện.</p>}</section>

    {isManager && manager ? <>
      <section className="operator-section"><h3>Nhạc nền của Season</h3><p className="small muted">Dán link video hoặc playlist YouTube không bản quyền. Mỗi người vẫn tự bật / tắt nhạc trên thanh điều hướng.</p><label className="check"><input type="checkbox" checked={manager.backgroundMusic.enabled} onChange={(e) => setValue("backgroundMusic", { ...manager.backgroundMusic, enabled: e.target.checked })} /> Cho phép nhạc nền trong app</label><label className="field"><span>Link YouTube (video hoặc playlist)</span><input value={manager.backgroundMusic.url} onChange={(e) => setValue("backgroundMusic", { ...manager.backgroundMusic, url: e.target.value })} placeholder="https://www.youtube.com/watch?v=…&list=…" /></label><label className="field"><span>Âm lượng: <b>{manager.backgroundMusic.volume}</b>/100</span><input type="range" min="0" max="100" value={manager.backgroundMusic.volume} onChange={(e) => setValue("backgroundMusic", { ...manager.backgroundMusic, volume: Number(e.target.value) })} /></label>{saveButton}</section>
      <section className="operator-section"><h3>Nhắc học qua Base.vn (Base Message incoming webhook)</h3><p className="small muted">Dán URL incoming webhook của nhóm chat. Tin nhắn dùng trường <code>base_content</code>; mẫu hỗ trợ <code>{"{message}"}</code> và <code>{"{name}"}</code>.</p><label className="field"><span>Webhook URL</span><input value={manager.baseWebhookUrl} onChange={(e) => setValue("baseWebhookUrl", e.target.value)} placeholder="https://..." /></label><label className="field"><span>Mẫu payload (JSON)</span><textarea value={manager.baseWebhookTemplate} onChange={(e) => setValue("baseWebhookTemplate", e.target.value)} /></label>{saveButton}</section>
      <section className="operator-section manager-policy"><h3>Chính sách nhắc học và báo cáo</h3><label className="field settings-short-field"><span>Nhắc sau số ngày không hoạt động</span><input type="number" min="1" max="30" value={reminderDaysInput} onChange={(e) => { const raw = e.target.value; setReminderDaysInput(raw); if (raw !== "") setValue("reminderInactiveDays", Number(raw)); }} /></label><label className="check"><input type="checkbox" checked={manager.weeklyReportEnabled} onChange={(e) => setValue("weeklyReportEnabled", e.target.checked)} /> Bật báo cáo tuần</label>{policySaveButton}</section>
    </> : <section className="operator-section"><h3>Prompt &amp; rubric</h3><p className="small muted">Sửa hướng dẫn hệ thống cho AI sinh bài, coach và chấm bài.</p><a className="button" href="/op/prompts">Mở trình sửa prompt</a></section>}

    <section className="operator-section"><h3>Dữ liệu</h3><p className="small muted">Dữ liệu học tập lưu trong PostgreSQL và tệp bài nói lưu trong MinIO.</p><div className="settings-service-line"><span>API &amp; cơ sở dữ liệu</span><b>{capabilities?.api && capabilities.database ? "Đang hoạt động" : "Chưa sẵn sàng"}</b></div><div className="settings-service-line"><span>Kho tệp bài nói</span><b>{capabilities?.objectStorage ? "Đang hoạt động" : "Chưa sẵn sàng"}</b></div></section>
    {managerAccounts}
    {error ? <p className="operator-warning" role="alert">{error}</p> : null}
  </main>;
}

function normalizeManagerSettings(value: ManagerSettingsView | undefined): ManagerSettingsView | undefined {
  if (!value) return undefined;
  const runtimeValue = value as ManagerSettingsView & Partial<ManagerSettingsView>;
  return {
    ...runtimeValue,
    reminderInactiveDays: runtimeValue.reminderInactiveDays ?? 3,
    weeklyReportEnabled: runtimeValue.weeklyReportEnabled ?? true,
    pilotStartDate: runtimeValue.pilotStartDate ?? "2026-10-12",
    pilotWeeks: runtimeValue.pilotWeeks ?? 4,
    weekOverride: runtimeValue.weekOverride ?? 0,
    minMinutesPerDay: runtimeValue.minMinutesPerDay ?? 15,
    courseTheme: runtimeValue.courseTheme ?? "Tiếng Anh giao tiếp công sở",
    coachDailyLimit: runtimeValue.coachDailyLimit ?? 20,
    testTimed: runtimeValue.testTimed ?? true,
    testTimes: runtimeValue.testTimes ?? { listening: 15, reading: 20, writing: 20, speaking: 15 },
    testWarnLimit: runtimeValue.testWarnLimit ?? 3,
    levelUp: runtimeValue.levelUp ?? { days: 14, lessons: 80, firstTry: 70, submission: 70, coach: 3.5, coachTurns: 5, wrong: 50, minParts: 6 },
    backgroundMusic: runtimeValue.backgroundMusic ?? { enabled: true, url: "", volume: 30 },
    baseWebhookUrl: runtimeValue.baseWebhookUrl ?? "",
    baseWebhookTemplate: runtimeValue.baseWebhookTemplate ?? '{"base_content":"{message}"}'
  };
}
