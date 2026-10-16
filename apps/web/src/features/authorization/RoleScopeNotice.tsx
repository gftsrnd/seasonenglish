import type { ProductPreferencesView, SystemCapabilitiesView } from "@e4s/contracts";
import { useEffect, useState, type ReactNode } from "react";

export type StaffRole = "operator" | "manager";
export type StaffScreen = "settings" | "manager-progress" | "manager-operations" | "manager-reminders" | "manager-report" | "manager-rewards" | "staff-pending";
type NavigationStatus = "active" | "read" | "pending";

export interface StaffNavigationItem {
  readonly to: string;
  readonly label: string;
  readonly status: NavigationStatus;
  readonly visible?: boolean;
}

export const staffNavigation: Record<StaffRole, readonly StaffNavigationItem[]> = {
  operator: [
    { to: "/op", label: "Duyệt mức", status: "active" },
    { to: "/op/weeks", label: "Chủ đề", status: "active" },
    { to: "/op/lessons", label: "Bài học", status: "active" },
    { to: "/op/review", label: "Đọc mẫu", status: "active" },
    { to: "/settings", label: "Cài đặt", status: "read" }
  ],
  manager: [
    { to: "/mgr", label: "Tiến độ", status: "active" },
    { to: "/mgr/ops", label: "Vận hành", status: "active" },
    { to: "/mgr/reminders", label: "Nhắc học", status: "active" },
    { to: "/mgr/report", label: "Báo cáo", status: "active" },
    { to: "/settings", label: "Cài đặt", status: "active" },
    { to: "/op", label: "Duyệt mức", status: "active", visible: false },
    { to: "/op/weeks", label: "Chủ đề", status: "active", visible: false },
    { to: "/op/lessons", label: "Bài học", status: "active", visible: false },
    { to: "/op/review", label: "Đọc mẫu", status: "active", visible: false }
  ]
};

const screenStatus: Record<StaffScreen, { title: string; detail: string }> = {
  settings: {
    title: "Cài đặt",
    detail: "Phạm vi thao tác thay đổi theo vai trò đang đăng nhập."
  },
  "manager-progress": {
    title: "Tiến độ tổ chức",
    detail: "KPI và tiến độ nhóm được tổng hợp từ dữ liệu học trong tổ chức."
  },
  "manager-operations": {
    title: "Vận hành hệ thống",
    detail: "Theo dõi nội dung, hàng chờ duyệt, tác vụ nền và hoạt động gần đây."
  },
  "manager-reminders": {
    title: "Nhắc học",
    detail: "Chọn người học đủ điều kiện và đưa lời nhắc vào hàng đợi có lưu vết."
  },
  "manager-report": {
    title: "Báo cáo tổ chức",
    detail: "Tổng hợp và xuất báo cáo pilot từ dữ liệu hiện có."
  },
  "manager-rewards": {
    title: "Xem trước phần thưởng đang chờ kết nối",
    detail: "Quản lý chưa thể xem các trường hợp phần thưởng từ dữ liệu thật trên bản local này."
  },
  "staff-pending": {
    title: "Màn này đang chờ kết nối dữ liệu",
    detail: "Màn được giữ trong luồng đã chốt, nhưng chưa có thao tác nào được kích hoạt ở bản local này."
  }
};

const roleCopy: Record<StaffRole, { label: string; canDo: string[]; outOfScope: string[]; securityNote: string }> = {
  operator: {
    label: "Người vận hành",
    canDo: [
      "Cấu hình nội dung, prompt và rubric được giao để vận hành học tập.",
      "Xem cấu hình trải nghiệm và chính sách cấp tổ chức do Quản lý áp dụng.",
      "Theo dõi trạng thái AI để xử lý nội dung; không cần và không thấy provider key."
    ],
    outOfScope: ["Không thay đổi tài khoản, phân quyền, chính sách tổ chức hoặc cấu hình provider toàn hệ thống."],
    securityNote: "Secret của provider luôn ở phía server, không hiển thị trong browser."
  },
  manager: {
    label: "Quản lý",
    canDo: [
      "Quản lý tài khoản, phân quyền, cấu hình tổ chức, chính sách nhắc học và thiết lập báo cáo.",
      "Quyết định các cấu hình vận hành cấp tổ chức, bao gồm phạm vi cài đặt của Người vận hành.",
      "Theo dõi trạng thái AI và tích hợp để đưa ra quyết định vận hành; không phải nhập secret kỹ thuật."
    ],
    outOfScope: ["Không hiển thị hoặc cho nhập secret provider, migration hay chẩn đoán kỹ thuật nội bộ trên màn sản phẩm."],
    securityNote: "Secret và thao tác hạ tầng được bảo vệ phía server; quản lý chỉ thấy trạng thái an toàn cần cho vận hành."
  }
};

function ScopeGroup({ title, children }: { title: string; children: ReactNode }) {
  return <section className="role-scope-group"><h2>{title}</h2>{children}</section>;
}

export function RoleScopeNotice({ role, screen }: { role: StaffRole; screen: StaffScreen }) {
  const copy = roleCopy[role];
  const status = screenStatus[screen];
  const actionTitle = role === "operator" ? "Bạn có thể thực hiện" : "Bạn có thể thực hiện — gồm phạm vi của Người vận hành";
  const isSettings = screen === "settings";
  return <main className="operator-page role-scope-page">
    <header className="operator-heading operator-heading--stack"><div>
      <p className="eyebrow">Phạm vi quyền trên bản local</p>
      <h1>{status.title}</h1>
      <p>{status.detail}</p>
    </div></header>
    <section className="role-scope-card" aria-label={`Quyền của ${copy.label}`}>
      <h2>Quyền của {copy.label}</h2>
      <ScopeGroup title={actionTitle}><ul>{copy.canDo.map((item) => <li key={item}>{item}</li>)}</ul></ScopeGroup>
      <ScopeGroup title="Không thuộc phạm vi"><ul>{copy.outOfScope.map((item) => <li key={item}>{item}</li>)}</ul></ScopeGroup>
      <ScopeGroup title={isSettings ? "Bảo mật" : "Trạng thái màn hiện tại"}><p>{isSettings ? copy.securityNote : <><strong>Chưa thể thao tác:</strong> {status.detail}</>}</p></ScopeGroup>
    </section>
  </main>;
}

type SettingsCard = {
  readonly title: string;
  readonly description: string;
  readonly action?: { readonly href: string; readonly label: string };
  readonly status: "connected" | "pending";
};

const sharedSettings: readonly SettingsCard[] = [
  {
    title: "Prompt & rubric được giao",
    description: "Chỉnh bản nháp hướng dẫn AI và rubric; mọi lần lưu tạo phiên bản mới trong tổ chức.",
    action: { href: "/op/prompts", label: "Chỉnh prompt & rubric" },
    status: "connected"
  },
  {
    title: "Chủ đề và mục tiêu tuần",
    description: "Cập nhật khung chủ đề, mục tiêu và gợi ý từ vựng của chương trình đang vận hành.",
    action: { href: "/op/weeks", label: "Chỉnh chủ đề tuần" },
    status: "connected"
  }
];

const managerSettingsCards: readonly SettingsCard[] = [
  ...sharedSettings,
  {
    title: "Quản lý tài khoản và phân quyền",
    description: "Xem tài khoản, đổi vai trò và lưu vết thay đổi quyền theo tổ chức.",
    status: "connected"
  },
  {
    title: "Chính sách nhắc học và báo cáo",
    description: "Thiết lập lịch nhắc, người nhận và cấu hình báo cáo vận hành của tổ chức.",
    status: "connected"
  }
];

export function SettingsWorkspace({ role, managerAccounts, managerSettings, capabilities, preferences, onSavePreferences }: {
  role: StaffRole; managerAccounts?: ReactNode; managerSettings?: ReactNode; capabilities?: SystemCapabilitiesView | undefined;
  preferences?: ProductPreferencesView | undefined; onSavePreferences?: ((input: ProductPreferencesView) => Promise<void>) | undefined;
}) {
  const isManager = role === "manager";
  const [draft, setDraft] = useState<ProductPreferencesView>(preferences ?? { theme: "auto", vocabImageSource: "wikimedia" });
  const [saving, setSaving] = useState(false);
  const [preferenceError, setPreferenceError] = useState("");
  useEffect(() => { if (preferences) setDraft(preferences); }, [preferences]);
  const cards = isManager && (managerAccounts || managerSettings)
    ? managerSettingsCards.filter((card) => (managerAccounts ? card.title !== "Quản lý tài khoản và phân quyền" : true) && (managerSettings ? card.title !== "Chính sách nhắc học và báo cáo" : true))
    : isManager ? managerSettingsCards : sharedSettings;
  return <main className="operator-page settings-page">
    <header className="operator-heading operator-heading--stack"><div>
      <p className="eyebrow">Cấu hình có kiểm soát</p>
      <h1>Cài đặt vận hành</h1>
      <p>{isManager
        ? "Quản lý có toàn bộ phạm vi cấu hình của Người vận hành, cùng các thiết lập cấp tổ chức."
        : "Bạn chỉ xem cấu hình cấp tổ chức; các lối tắt nội dung bên dưới vẫn mở đúng phần việc được giao."}</p>
    </div></header>
    <section className="settings-grid" aria-label={isManager ? "Cài đặt của Quản lý" : "Cài đặt của Người vận hành"}>
      {cards.map((card) => <article className="settings-card" key={card.title}>
        <span className={`settings-state settings-state--${card.status}`}>{card.status === "connected" ? "Kết nối dữ liệu" : "Chưa kết nối dữ liệu"}</span>
        <h2>{card.title}</h2>
        <p>{card.description}</p>
        {card.action ? <a className="button button--primary" href={card.action.href}>{card.action.label}</a> : <p className="settings-connected">Bảng thao tác và dữ liệu hiện ở ngay bên dưới.</p>}
      </article>)}
    </section>
    <section className="operator-section" aria-label="Giao diện và ảnh minh hoạ">
      <h2>Giao diện & ảnh minh hoạ</h2>
      <div className="settings-preference-grid">
        <label>Giao diện theo mùa / lễ<select value={draft.theme} disabled={!isManager} onChange={(event) => setDraft({ ...draft, theme: event.target.value as ProductPreferencesView["theme"] })}>
          <option value="auto">Tự động theo ngày</option><option value="spring">Mùa xuân</option><option value="summer">Mùa hạ</option><option value="autumn">Mùa thu</option><option value="winter">Mùa đông</option><option value="tet">Tết</option><option value="midautumn">Trung thu</option><option value="christmas">Giáng sinh – Năm mới</option>
        </select></label>
        <label>Nguồn ảnh từ vựng<select value={draft.vocabImageSource} disabled={!isManager} onChange={(event) => setDraft({ ...draft, vocabImageSource: event.target.value as ProductPreferencesView["vocabImageSource"] })}>
          <option value="pexels">Pexels, dự phòng Wikimedia</option><option value="pixabay">Pixabay, dự phòng Wikimedia</option><option value="openverse">Openverse, dự phòng Wikimedia</option><option value="wikimedia">Wikimedia</option><option value="disabled">Tắt ảnh minh hoạ</option>
        </select></label>
      </div>
      <p className="supporting-text">Nguồn ảnh miễn phí được gọi từ API E4S; trình duyệt không nhận khoá dịch vụ.</p>
      {preferenceError ? <p className="form-error" role="alert">{preferenceError}</p> : null}
      {isManager ? <button className="button button--primary" type="button" disabled={saving || !preferences || !onSavePreferences} onClick={() => {
        if (!onSavePreferences) return; setSaving(true); setPreferenceError("");
        void onSavePreferences(draft).catch(() => setPreferenceError("Không lưu được giao diện và nguồn ảnh.")).finally(() => setSaving(false));
      }}>{saving ? "Đang lưu…" : "Lưu giao diện & ảnh"}</button> : <p className="settings-connected">Chỉ Quản lý có thể thay đổi giao diện và nguồn ảnh.</p>}
    </section>
    <section className="operator-section" aria-label="Trạng thái dịch vụ local">
      <h2>Trạng thái kết nối</h2>
      {!capabilities ? <p className="operator-warning">Chưa đọc được trạng thái dịch vụ từ API.</p> : <div className="settings-grid">
        <StatusCard label="API và cơ sở dữ liệu" connected={capabilities.api && capabilities.database} />
        <StatusCard label="AI sinh/chấm nội dung" connected={capabilities.ai} />
        <StatusCard label="Kho tệp bài nói" connected={capabilities.objectStorage} />
      </div>}
    </section>
    {managerAccounts}
    {managerSettings}
    <p className="settings-security">Khoá API, secret provider, migration và chẩn đoán hạ tầng luôn ở server; không hiển thị trong ứng dụng.</p>
  </main>;
}

function StatusCard({ label, connected }: { label: string; connected: boolean }) {
  return <article className="settings-card"><span className={`settings-state settings-state--${connected ? "connected" : "pending"}`}>{connected ? "Đang hoạt động" : "Chưa cấu hình"}</span><h3>{label}</h3><p>{connected ? "Dịch vụ đã sẵn sàng cho luồng local." : "Chức năng liên quan được giữ an toàn và không giả lập kết quả."}</p></article>;
}

export function navigationStatusLabel(status: NavigationStatus): string {
  return status === "active" ? "Thao tác" : status === "read" ? "Chỉ xem" : "Chờ nối dữ liệu";
}
