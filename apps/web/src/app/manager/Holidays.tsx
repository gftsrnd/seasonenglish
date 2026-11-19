import { useEffect, useRef, useState, type FormEvent } from "react";
import { managerApiClient } from "../../api/manager.js";
import { useModal } from "../shared/ModalProvider.js";
import { ManagerTitle, PageTitle } from "./shared.js";
import { Trash2 } from "lucide-react";
import { ActionLabel, useCompactUi } from "../shared/CompactUi.js";
import { Pager, usePaged } from "../shared/Pager.js";

type Holiday = Awaited<ReturnType<typeof managerApiClient.getManagerHolidays>>["holidays"][number];
type HolidayFilter = "all" | "national" | "organization";

function filterHolidays(holidays: Holiday[], filter: HolidayFilter) {
  return holidays.filter(holiday => filter === "all" || (holiday.source === "national") === (filter === "national"))
    .sort((a, b) => b.date.localeCompare(a.date));
}

function holidayDate(date: string) {
  return date.split("-").reverse().join("/");
}

export function ManagerHolidays() {
  const modal = useModal();
  const [holidays, setHolidays] = useState<Holiday[]>();
  const [date, setDate] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [filter, setFilter] = useState<HolidayFilter>("all");
  const holidayList = useRef<HTMLUListElement>(null);
  const changeFilter = (next: HolidayFilter) => {
    setFilter(next);
    if (holidayList.current) holidayList.current.scrollTop = 0;
  };
  const load = async () => {
    try {
      const { holidays: next } = await managerApiClient.getManagerHolidays();
      setHolidays(next);
      setError("");
      return next;
    }
    catch { setError("Không tải được lịch nghỉ lễ."); }
  };
  useEffect(() => { void load(); }, []);
  const add = async (event: FormEvent) => {
    event.preventDefault(); if (!date || busy) return;
    setBusy(true); setError("");
    try {
      await managerApiClient.addManagerHoliday(date);
      setDate("");
      const next = await load();
      if (next) changeFilter("organization");
    }
    catch { setError("Không lưu được ngày nghỉ. Chỉ chọn ngày trong tuần, không trùng ngày thi và không thêm ngày đã có."); }
    finally { setBusy(false); }
  };
  const remove = async (holiday: Holiday) => {
    if (holiday.source === "national") return;
    const confirmed = await modal.confirm({
      title: "Xóa ngày nghỉ",
      message: `Xóa ngày nghỉ công ty ${holidayDate(holiday.date)}? Hệ thống sẽ thôi tự động điểm danh theo ngày nghỉ này.`,
      confirmLabel: "Xóa",
      countdownSeconds: 0,
      tone: "danger"
    });
    if (!confirmed) return;
    setBusy(true); setError("");
    try {
      await managerApiClient.removeManagerHoliday(holiday.id);
      setHolidays(current => current?.filter(item => item.id !== holiday.id));
    }
    catch { setError("Không xóa được ngày nghỉ."); }
    finally { setBusy(false); }
  };
  const filtered = filterHolidays(holidays ?? [], filter);
  const compact = useCompactUi();
  const paged = usePaged(filtered);
  return <div className="manager-page manager-holidays-page">
    <PageTitle><h1>Ngày nghỉ lễ</h1></PageTitle>
    {error ? <div className="banner danger" role="alert"><div className="body small">{error}</div></div> : null}
    <form className="card manager-holiday-form" onSubmit={(event) => void add(event)}>
      <label>Ngày nghỉ<input type="date" value={date} onChange={(event) => setDate(event.target.value)} required /></label>
      <button className="btn btn-primary" type="submit" disabled={busy || !date}>{compact ? "Thêm" : "Thêm ngày nghỉ"}</button>
    </form>
    <section className="card manager-holiday-calendar">
      <header className="manager-holiday-header">
        <ManagerTitle as="h2" title="Lịch nghỉ lễ" tip="Ngày lễ Việt Nam được tự nhận diện. Ngày nghỉ T2–T6 vẫn tính là ngày hiệu lực và học viên đang học được tự động điểm danh." />
        <select aria-label="Loại ngày nghỉ" value={filter} onChange={event => changeFilter(event.target.value as HolidayFilter)}>
          <option value="all">Tất cả</option>
          <option value="national">Ngày lễ Việt Nam</option>
          <option value="organization">Ngày nghỉ công ty</option>
        </select>
      </header>
      {compact ? null : <p className="small muted">Ngày lễ Việt Nam được tự nhận diện. Ngày nghỉ T2–T6 vẫn tính là ngày hiệu lực và học viên đang học được tự động điểm danh.</p>}
      {holidays === undefined ? <p role="status">{error ? "Chưa tải được danh sách." : "Đang tải…"}</p>
        : !filtered.length ? <p className="muted">Chưa có ngày nghỉ trong mục này.</p>
        : <ul ref={holidayList} className="manager-holiday-list" aria-label="Danh sách ngày nghỉ" tabIndex={0}>{(compact ? paged.visible : filtered).map(holiday => <li key={holiday.id}>
          <div className="manager-holiday-description">
            <b><time dateTime={holiday.date}>{holidayDate(holiday.date)}</time>{holiday.name ? ` · ${holiday.name}` : ""}</b>
            <small className="muted">
              {holiday.source === "national" ? compact ? "Lễ Việt Nam · cố định" : "Lịch lễ Việt Nam · cố định, không xóa" : holiday.created_by_name ? `Thêm bởi ${holiday.created_by_name}` : "Ngày nghỉ công ty"}
              {holiday.source === "national" && holiday.sourceUrl ? <> · <a href={holiday.sourceUrl} target="_blank" rel="noreferrer">{compact ? "Nguồn" : "Nguồn chính thức"}</a></> : null}
            </small>
          </div>
          {holiday.source !== "national" ? <button className="btn-sm btn-danger" type="button" disabled={busy} onClick={() => void remove(holiday)}><ActionLabel icon={Trash2} label="Xóa" /></button> : null}
        </li>)}</ul>}
      {compact ? <Pager {...paged} label="ngày nghỉ" /> : null}
    </section>
  </div>;
}
