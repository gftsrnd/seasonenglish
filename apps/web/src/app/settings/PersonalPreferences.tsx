import { useExperience } from "../../features/experience/Experience.js";

export function PersonalPreferences() {
  const { effectsOn, musicOn, musicAllowed, toggleEffects, toggleMusic } = useExperience();
  return <section className="card settings-personal-preferences" aria-labelledby="personal-preferences-title">
    <h3 id="personal-preferences-title">Tùy chọn cá nhân</h3>
    <p className="small muted">Chỉ áp dụng trên trình duyệt và thiết bị này.</p>
    <div className="row settings-personal-preferences__controls">
      <label className="check"><input type="checkbox" checked={effectsOn} onChange={toggleEffects} /> Hiệu ứng âm thanh</label>
      <label className="check" title={!musicAllowed ? "Quản lý đang tắt nhạc nền cho tổ chức" : undefined}><input type="checkbox" checked={musicOn} disabled={!musicAllowed} onChange={toggleMusic} /> Nhạc nền</label>
    </div>
    {!musicAllowed ? <p className="xs muted">Nhạc nền đang bị tắt theo cấu hình của tổ chức.</p> : null}
  </section>;
}
