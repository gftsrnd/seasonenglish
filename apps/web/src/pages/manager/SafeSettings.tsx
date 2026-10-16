import { useEffect, useState } from "react";
import type { ManagerSettingsView } from "@e4s/contracts";

export function ManagerPolicySettings({ view, saving, error, onSave }: {
  view: ManagerSettingsView;
  saving?: boolean | undefined;
  error?: string | undefined;
  onSave: (input: Pick<ManagerSettingsView, "reminderInactiveDays" | "weeklyReportEnabled">) => void;
}) {
  const [reminderInactiveDays, setReminderInactiveDays] = useState(view.reminderInactiveDays);
  const [weeklyReportEnabled, setWeeklyReportEnabled] = useState(view.weeklyReportEnabled);
  useEffect(() => {
    setReminderInactiveDays(view.reminderInactiveDays);
    setWeeklyReportEnabled(view.weeklyReportEnabled);
  }, [view]);
  return <section className="operator-section manager-policy" aria-label="Chính sách nhắc học và báo cáo">
    <header><h2>Chính sách nhắc học và báo cáo</h2><p>Chỉ cấu hình nghiệp vụ công khai; khoá API và secret provider không nằm trong màn này.</p></header>
    <label>Nhắc sau số ngày không hoạt động
      <input aria-label="Nhắc sau số ngày không hoạt động" type="number" min="1" max="30" value={reminderInactiveDays} onChange={(event) => setReminderInactiveDays(Number(event.target.value))} />
    </label>
    <label className="manager-policy-check"><input type="checkbox" checked={weeklyReportEnabled} onChange={(event) => setWeeklyReportEnabled(event.target.checked)} /> Bật báo cáo tuần</label>
    {error ? <p className="operator-warning">{error}</p> : null}
    <button type="button" className="button button--primary" disabled={saving} onClick={() => onSave({ reminderInactiveDays, weeklyReportEnabled })}>
      {saving ? "Đang lưu…" : "Lưu chính sách"}
    </button>
  </section>;
}
