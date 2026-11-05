import { useEffect, useState, type FormEvent } from "react";
import { managerApiClient } from "../../api/manager.js";
import { PageTitle } from "./shared.js";

type Holiday = { id: string; date: string; created_at: string; created_by_name: string | null };

export function ManagerHolidays() {
  const [holidays, setHolidays] = useState<Holiday[]>();
  const [date, setDate] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const load = async () => {
    try { setHolidays((await managerApiClient.getManagerHolidays()).holidays); setError(""); }
    catch { setError("Không tải được lịch nghỉ lễ."); }
  };
  useEffect(() => { void load(); }, []);
  const add = async (event: FormEvent) => {
    event.preventDefault(); if (!date || busy) return;
    setBusy(true); setError("");
    try { await managerApiClient.addManagerHoliday(date); setDate(""); await load(); }
    catch { setError("Không lưu được ngày nghỉ. Chỉ chọn ngày trong tuần, không trùng ngày thi và không thêm ngày đã có."); }
    finally { setBusy(false); }
  };
  const remove = async (holiday: Holiday) => {
    if (!window.confirm(`Xóa ngày nghỉ ${holiday.date}? Bài học trong ngày đó sẽ không còn được tự động điểm danh.`)) return;
    setBusy(true); setError("");
    try { await managerApiClient.removeManagerHoliday(holiday.id); await load(); }
    catch { setError("Không xóa được ngày nghỉ."); }
    finally { setBusy(false); }
  };
  return <div className="manager-page manager-holidays-page">
    <PageTitle><h1>Ngày nghỉ lễ</h1><p className="muted">Ngày nghỉ từ thứ Hai đến thứ Sáu vẫn tính là ngày hiệu lực và tự động điểm danh cho học viên đang học.</p></PageTitle>
    {error ? <div className="banner danger" role="alert"><div className="body small">{error}</div></div> : null}
    <form className="card manager-holiday-form" onSubmit={(event) => void add(event)}>
      <label>Ngày nghỉ<input type="date" value={date} onChange={(event) => setDate(event.target.value)} required /></label>
      <button className="btn btn-primary" type="submit" disabled={busy || !date}>Thêm ngày nghỉ</button>
    </form>
    <section className="card"><h2>Ngày đã khai báo</h2>{holidays === undefined ? <p role="status">Đang tải…</p> : holidays.length === 0 ? <p className="muted">Chưa có ngày nghỉ lễ.</p> : <ul className="manager-holiday-list">{holidays.map((holiday) => <li key={holiday.id}><span><b>{holiday.date}</b>{holiday.created_by_name ? <small> · Thêm bởi {holiday.created_by_name}</small> : null}</span><button className="btn-sm" type="button" disabled={busy} onClick={() => void remove(holiday)}>Xóa</button></li>)}</ul>}</section>
  </div>;
}
