import { useEffect, useState } from "react";
import { Save } from "lucide-react";
import { arenaApiClient, type ArenaApiClient, type ArenaSeasonSetting as Setting } from "../../api/arena.js";
import { ApiError } from "../../api/runtime.js";
import { useModal } from "../shared/ModalProvider.js";

/**
 * Manager › Cài đặt › "Ngày bắt đầu mùa xếp hạng" (GET/PUT /api/v1/manager/arena-season).
 * Once the current season has matches the new date needs a confirmation and starts the next season.
 */
export function ArenaSeasonSetting({ notify, client = arenaApiClient }: {
  notify: (message: string, tone?: "ok" | "danger") => void;
  client?: Pick<ArenaApiClient, "seasonSetting" | "saveSeasonStart">;
}) {
  const modal = useModal();
  const [setting, setSetting] = useState<Setting | null>(null);
  const [date, setDate] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    let live = true;
    client.seasonSetting().then((value) => { if (live) { setSetting(value); setDate(value.next?.startsOn ?? value.current?.startsOn ?? value.firstSeasonStart ?? ""); } })
      .catch(() => { if (live) setError("Không tải được mùa xếp hạng."); });
    return () => { live = false; };
  }, [client]);

  const save = async () => {
    if (!setting || !date || busy) return;
    let confirm = false;
    if (setting.hasMatches) {
      confirm = await modal.confirm({
        title: "Đổi ngày bắt đầu mùa?",
        message: <>Mùa hiện tại đã có trận. Ngày <b>{date}</b> sẽ là ngày bắt đầu mùa sau (từ {setting.current?.endsOn ?? "—"}).</>,
        confirmLabel: "Áp dụng từ mùa sau",
        countdownSeconds: 0
      });
      if (!confirm) return;
    }
    setBusy(true);
    try {
      const saved = await client.saveSeasonStart({ startsOn: date, ...(confirm ? { confirm: true } : {}) });
      setSetting(saved);
      notify("Đã lưu ngày bắt đầu mùa xếp hạng.", "ok");
    } catch (reason) {
      const earliest = reason instanceof ApiError && reason.code === "ARENA_SEASON_START_TOO_EARLY"
        ? (reason.details as { earliest?: string } | undefined)?.earliest : undefined;
      notify(earliest ? `Ngày bắt đầu phải từ ${earliest} trở đi.` : "Không lưu được ngày bắt đầu mùa.", "danger");
    } finally {
      setBusy(false);
    }
  };

  return <section className="card arena-season-setting" aria-label="Mùa xếp hạng">
    <h3>Mùa xếp hạng</h3>
    {error ? <p className="small muted">{error}</p> : null}
    {setting ? <>
      <p className="small muted">{setting.current ? `Mùa hiện tại: ${setting.current.startsOn} → ${setting.current.endsOn}` : "Chưa có mùa đang chạy"}{setting.next ? ` · Mùa sau: ${setting.next.startsOn}` : ""} · mỗi mùa {setting.seasonMonths} tháng</p>
      <label className="field"><span>Ngày bắt đầu mùa xếp hạng</span><input type="date" value={date} onChange={(event) => setDate(event.target.value)} /></label>
      <div className="row"><button className="btn-primary" type="button" disabled={!date || busy} aria-busy={busy || undefined} aria-label="Lưu ngày bắt đầu mùa" onClick={() => void save()}><Save size={16} aria-hidden="true" />{busy ? "Đang lưu…" : "Lưu"}</button></div>
    </> : error ? null : <p className="small muted">Đang tải…</p>}
  </section>;
}
