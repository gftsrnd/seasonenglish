import { useEffect, useState } from "react";
import { Check, Clock3, LockKeyhole, TriangleAlert } from "lucide-react";
import type { LearnerMonthView } from "@e4s/contracts";
import type { LearnerCallbacks } from "./contracts.js";
import { AppLink, Notice, PageTitle, Progress } from "./ui.js";

/**
 * Màn bài thi tháng của học viên: (1) báo cáo điểm danh, (2) khu vực bài thi.
 * Bài thi mở 00:00 ngày thi, khoá lúc 24:00 − thời lượng − 5 phút; làm bài bằng runtime bài kiểm tra đầu vào (/test/monthly-exam).
 */
export function LearnerMonthExam({ view, actions }: { view: LearnerMonthView; actions: LearnerCallbacks }) {
  const [reason, setReason] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => { const timer = window.setInterval(() => setNow(Date.now()), 30_000); return () => window.clearInterval(timer); }, []);
  const exam = view.exam;
  const attendance = view.attendance;
  const opens = new Date(exam.opensAt);
  const locks = new Date(exam.locksAt);
  const remainingPercent = attendance.effectiveDays ? Math.round((attendance.attendedDays / attendance.effectiveDays) * 100) : 0;
  const appeal = exam.appeal;
  const canAppeal = view.enrollment && !attendance.eligible && !appeal && exam.attemptStatus === "none";
  const submitAppeal = async () => {
    if (reason.trim().length < 5) { setError("Hãy nêu lý do ít nhất 5 ký tự."); return; }
    setSending(true); setError("");
    try { await actions.appealMonthlyExam(reason.trim()); setReason(""); } catch { setError("Chưa gửi được khiếu nại. Hãy thử lại."); } finally { setSending(false); }
  };
  return <div className="app-learner-page exam-page" style={{ width: "100%", maxWidth: 960, minWidth: 0, boxSizing: "border-box" }}>
    <PageTitle eyebrow={`${view.label} · ${view.cefr ?? ""}`} title="Bài thi tháng" detail={`Thi ngày ${formatDate(exam.date)} · ${exam.durationMinutes} phút · 4 kỹ năng · 100 điểm`} />

    <section className="card" data-exam-block="attendance" aria-labelledby="exam-attendance-title">
      <div className="row between"><h3 id="exam-attendance-title" style={{ margin: 0 }}>1. Báo cáo điểm danh</h3>
        <span className={`badge ${attendance.eligible ? "ok" : "warn"}`}>{attendance.eligible ? "Đủ điều kiện thi" : "Chưa đủ điều kiện"}</span></div>
      {view.enrollment ? <>
        <div className="grid cols-3" style={{ marginTop: 12 }}>
          <Stat label="Ngày điểm danh" value={`${attendance.attendedDays}/${attendance.effectiveDays}`} hint="ngày học T2–T6 có hoàn thành ≥ 1 bài" />
          <Stat label="Ngày vắng" value={`${attendance.absentDays}/${attendance.maxAbsences}`} hint="vắng tối đa = 30% ngày hiệu lực, làm tròn xuống" {...(attendance.absentDays > attendance.maxAbsences ? { tone: "warn" as const } : {})} />
          <Stat label="Bài đã học" value={`${view.completedLessons}/${view.lessonCount}`} hint="học bù không ảnh hưởng điều kiện thi" />
        </div>
        <Progress value={attendance.attendedDays} max={Math.max(1, attendance.effectiveDays)} label={`Điểm danh ${remainingPercent}%`} />
        {view.enrollment.mode === "join_current_month" && view.enrollment.effectiveDayCount < view.lessonCount ? <p className="small muted" style={{ marginTop: 8 }}>Bạn vào tháng này từ {formatDate(view.enrollment.startsOn ?? view.today)} ({view.enrollment.ratioPercent ?? 0}% ngày hiệu lực còn lại), nên số ngày hiệu lực của bạn là {view.enrollment.effectiveDayCount} và vắng tối đa {view.enrollment.maxAbsences}.</p> : null}
      </> : <Notice>Chưa có ghi danh tháng. Hoàn thành bài kiểm tra đầu vào và chờ duyệt mức để bắt đầu.</Notice>}
    </section>

    <section className="card" style={{ marginTop: 16 }} data-exam-block="exam" aria-labelledby="exam-area-title">
      <h3 id="exam-area-title" style={{ marginTop: 0 }}>2. Bài thi tháng</h3>
      <p className="small muted">Mở <b>{formatDateTime(opens)}</b> · khoá vào <b>{formatDateTime(locks)}</b> (vào sau giờ khoá sẽ không làm được). Trong lúc thi, nhạc nền tắt, có đồng hồ đếm ngược và chống thoát như bài kiểm tra đầu vào.</p>
      {exam.attemptStatus !== "none" && exam.attemptStatus !== "in_progress" ? <Notice tone="ok"><Check className="status-icon" aria-hidden="true" /> Bạn đã nộp bài thi tháng này ({attemptLabel(exam.attemptStatus)}).</Notice>
        : exam.canStart ? <div className="row" style={{ gap: 12, flexWrap: "wrap" }}><AppLink className="btn-primary" href="/test/monthly-exam" navigate={actions.navigate}>{exam.attemptStatus === "in_progress" ? "Tiếp tục bài thi" : "Vào bài thi"}</AppLink><span className="small muted">Còn {countdown(locks.getTime() - now)} trước giờ khoá.</span></div>
          : exam.blockedReason === "not_open_yet" ? <Notice><Clock3 className="status-icon" aria-hidden="true" /> Bài thi mở sau {countdown(opens.getTime() - now)} ({formatDateTime(opens)}).</Notice>
            : exam.blockedReason === "locked" ? <Notice tone="warn"><LockKeyhole className="status-icon" aria-hidden="true" /> Đã quá giờ khoá ({formatDateTime(locks)}). Bạn không thể vào thi tháng này; bài học tháng sau sẽ khoá cho tới khi Quản lý mở.</Notice>
              : exam.blockedReason === "not_eligible" ? <Notice tone="warn"><TriangleAlert className="status-icon" aria-hidden="true" /> Bạn vắng {attendance.absentDays} ngày, vượt mức tối đa {attendance.maxAbsences}, nên chưa đủ điều kiện thi.</Notice>
                : exam.blockedReason === "no_exam" ? <Notice>Đề thi tháng cho level {view.cefr} chưa được Vận hành duyệt.</Notice>
                  : <Notice>Bạn chưa học tháng này nên chưa có bài thi tháng.</Notice>}
      {appeal ? <div className="card soft" style={{ marginTop: 12 }} data-exam-block="appeal">
        <b>Khiếu nại lên Quản lý</b>
        <div className="small">{appealLabel(appeal.status)}{appeal.status === "pending" ? ` · Quản lý có tới ${formatDateTime(new Date(appeal.deadlineAt))} để xử lý; quá hạn hệ thống tự cho thi.` : ""}</div>
        {appeal.resolution ? <div className="small muted">{appeal.resolution}</div> : null}
      </div> : null}
      {canAppeal ? <form className="card soft" style={{ marginTop: 12 }} data-exam-block="appeal-form" onSubmit={(event) => { event.preventDefault(); void submitAppeal(); }}>
        <label className="field"><span>Khiếu nại lên Quản lý (lý do vắng)</span><textarea value={reason} onChange={(event) => setReason(event.target.value)} rows={3} placeholder="Ví dụ: nghỉ ốm có giấy, công tác đột xuất…" /></label>
        {error ? <div className="small" role="alert" style={{ color: "var(--danger, #b42318)" }}>{error}</div> : null}
        <div className="row"><button className="btn-primary" type="submit" disabled={sending}>{sending ? "Đang gửi…" : "Gửi khiếu nại"}</button><span className="small muted">Quản lý có 24 giờ để duyệt; quá hạn hệ thống tự cho thi.</span></div>
      </form> : null}
    </section>

    <div className="row" style={{ marginTop: 12 }}><AppLink className="btn" href="/home" navigate={actions.navigate}>← Về trang chủ</AppLink></div>
  </div>;
}

function Stat({ label, value, hint, tone }: { label: string; value: string; hint: string; tone?: "warn" }) {
  return <div className="stat" style={{ display: "grid", gap: 2 }}><span className="small muted">{label}</span><b style={{ fontSize: "1.4rem", color: tone === "warn" ? "var(--danger, #b42318)" : undefined }}>{value}</b><span className="small muted">{hint}</span></div>;
}

function formatDate(value: string): string {
  const [year, month, day] = value.split("-");
  return `${day}/${month}/${year}`;
}

function formatDateTime(value: Date): string {
  return new Intl.DateTimeFormat("vi-VN", { timeZone: "Asia/Ho_Chi_Minh", hour: "2-digit", minute: "2-digit", day: "2-digit", month: "2-digit" }).format(value);
}

function countdown(ms: number): string {
  if (ms <= 0) return "0 phút";
  const minutes = Math.floor(ms / 60_000);
  const days = Math.floor(minutes / 1440);
  const hours = Math.floor((minutes % 1440) / 60);
  const rest = minutes % 60;
  if (days > 0) return `${days} ngày ${hours} giờ`;
  if (hours > 0) return `${hours} giờ ${rest} phút`;
  return `${rest} phút`;
}

function attemptLabel(status: LearnerMonthView["exam"]["attemptStatus"]): string {
  if (status === "submitted" || status === "pending_review") return "đang chờ chấm";
  if (status === "approved") return "đã có kết quả";
  if (status === "needs_retry") return "đã chấm";
  return status;
}

function appealLabel(status: NonNullable<LearnerMonthView["exam"]["appeal"]>["status"]): string {
  if (status === "pending") return "Đang chờ Quản lý duyệt";
  if (status === "approved") return "Quản lý đã duyệt: bạn được thi";
  if (status === "auto_approved") return "Quá 24 giờ chưa xử lý: hệ thống tự cho thi";
  return "Quản lý từ chối: không được thi tháng này";
}
