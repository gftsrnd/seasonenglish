import { useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useNavigate } from "react-router";
import { Bell, X } from "lucide-react";
import type { InboxNotificationView, NotificationInboxView } from "@e4s/contracts";
import { getNotificationInbox, markInboxRead } from "../../api/notifications.js";
import { hasAssessmentLogoutGuard } from "./assessment-logout-guard.js";
import { useDialog } from "./ModalProvider.js";
import { rewardBadgeIconForLabel } from "./reward-badge-icons.js";
import { monthlyUncountedCountsFromText } from "./monthly-uncounted.js";
import "./notification-bell.css";

const assessmentNames: Record<string, string> = {
  placement: "bài đầu vào",
  final: "bài thi tháng",
  level_up: "bài thi lên mức",
  pass_course: "bài thi đầu ra"
};
const assessmentTabs: Record<string, string> = {
  placement: "placement", final: "monthly", level_up: "promotion", pass_course: "exit"
};
const notificationTime = new Intl.DateTimeFormat("vi-VN", { dateStyle: "short", timeStyle: "short", timeZone: "Asia/Ho_Chi_Minh" });
const complaintNames: Record<string, string> = {
  exam_eligibility: "điều kiện dự thi", lesson_unlock: "mở khóa bài học", account_unlock: "mở khóa tài khoản",
  attendance: "điểm danh", lesson_count: "số bài học", account: "tài khoản"
};
const seasonNames: Record<string, string> = { "2": "☀️ Mùa hạ", "3": "🍂 Mùa thu", "4": "❄️ Mùa đông" }; // media-scan: allow-avatar-reward -- deliberate reward symbols
const categoryLabels = { support: "Khiếu nại", reopen: "Yêu cầu mở lại", appeal: "Kháng nghị học tập", exam: "Bài thi", account: "Tài khoản", learning: "Học tập" };
function notificationCategory(value: InboxNotificationView["kind"]): keyof typeof categoryLabels {
  // Server kinds are free text in the database; unknown kinds must never break the inbox.
  const kind: string = typeof value === "string" ? value : "";
  if (kind.startsWith("complaint_")) return "support";
  if (kind.startsWith("reopen_")) return "reopen";
  if (kind.startsWith("appeal_")) return "appeal";
  if (kind.includes("exam_") || kind.startsWith("assessment_") || kind === "course_ready" || kind === "certificate_issued") return "exam";
  if (kind.startsWith("account_") || kind.startsWith("deletion_") || kind === "credential_changed" || kind === "security_report") return "account";
  return "learning";
}

/** "2026-11-09" -> "09/11"; anything else is shown as given. */
function dayMonth(date: string): string {
  const match = /^\d{4}-(\d{2})-(\d{2})$/.exec(date);
  return match ? `${match[2]}/${match[1]}` : date;
}

const securityClock = new Intl.DateTimeFormat("en-GB", { hour: "2-digit", minute: "2-digit", day: "2-digit", month: "2-digit", hourCycle: "h23", timeZone: "Asia/Ho_Chi_Minh" });
/** "18:28 12/11" in Vietnam time. */
function securityMoment(date: Date): string {
  const part = (type: Intl.DateTimeFormatPartTypes) => securityClock.formatToParts(date).find((item) => item.type === type)?.value ?? "";
  return `${part("hour")}:${part("minute")} ${part("day")}/${part("month")}`;
}

/** PIN and password activity of a user, shown to Managers. Context counts repeats of the same activity. */
function securityReportContent(item: InboxNotificationView): { title: string; description: string; path: string; action: string } {
  const report = item.securityReport;
  const target = { path: "/settings", action: "Mở Người dùng" };
  if (!report) return { title: "Có báo cáo bảo mật tài khoản", description: "Xem tài khoản người dùng trong Cài đặt.", ...target };
  const repeats = /^\d+$/.test(item.context) ? Number(item.context) : 1;
  const created = new Date(item.createdAt);
  const at = Number.isNaN(created.getTime()) ? "" : ` lúc ${securityMoment(created)}`;
  const note = report.note.toLocaleLowerCase("vi-VN");
  const changedPin = note.includes("đổi pin") || note.includes("đổi mã pin");
  const activity = changedPin ? "Đổi mã PIN"
    : note.includes("pin") ? "Hỗ trợ mã PIN"
    : note.includes("mật khẩu") ? "Hỗ trợ mật khẩu"
    : "Báo cáo bảo mật";
  const title = `${activity} · ${report.subjectName}${repeats > 1 ? ` · ${repeats} lần` : ""}`;
  const description = changedPin
    ? `${report.subjectName} vừa đổi mã PIN${at}.`
    : `${report.note.replace(/[.\s]+$/, "")}${at ? ` (${at.trim()})` : ""}.`;
  return { title, description, ...target };
}

function notificationContent(item: InboxNotificationView): { title: string; description: string; path: string; action: string } {
  const exam = assessmentNames[item.context] ?? "bài thi";
  const examTab = assessmentTabs[item.context] ?? "placement";
  const examAttempt = item.relatedId ? `&attemptId=${encodeURIComponent(item.relatedId)}` : "";
  const reopen = item.context === "resources" ? "tài nguyên tháng" : "bài học";
  const complaint = complaintNames[item.context];
  const focus = item.relatedId ? `&id=${encodeURIComponent(item.relatedId)}` : "";
  const appealSubject = item.context === "assessment" ? "bài thi" : item.context === "practice" ? "bài thực hành" : "bài học";
  switch (item.kind as string) {
    case "complaint_received":
      return { title: complaint ? `Khiếu nại về ${complaint}` : "Có khiếu nại mới", description: "Học viên đã gửi đơn. Quản lý cần xem xét và phản hồi.", path: `/mgr/requests?kind=complaint${focus}`, action: "Mở khiếu nại" };
    case "complaint_approved":
    case "complaint_rejected":
      return { title: `Khiếu nại${complaint ? ` về ${complaint}` : ""} ${item.kind === "complaint_approved" ? "đã được duyệt" : "bị từ chối"}`, description: "Bạn có thể đọc phản hồi của Quản lý tại Hỗ trợ học tập.", path: `/support?tab=complaints${focus}`, action: "Xem khiếu nại" };
    case "reopen_received":
      return { title: `Có yêu cầu mở lại ${reopen}`, description: "Người vận hành đang chờ Quản lý xem xét.", path: `/mgr/requests?kind=reopen${focus}`, action: "Mở yêu cầu" };
    case "reopen_approved":
    case "reopen_rejected":
      return { title: `Yêu cầu mở lại ${reopen} ${item.kind === "reopen_approved" ? "đã được duyệt" : "đã được từ chối"}`, description: "Xem quyết định và phản hồi của Quản lý trong yêu cầu đã gửi.", path: `/op/review?tab=sent${focus}`, action: "Xem yêu cầu" };
    case "assessment_received":
      return { title: `Có ${exam} chờ duyệt`, description: "Một lượt đã nộp và đang chờ kiểm tra.", path: item.context === "placement" ? "/op" : `/op/tests?tab=${examTab}`, action: "Mở hàng duyệt" };
    case "assessment_manual_review":
      return { title: `Có ${exam} cần chấm tay`, description: "Chấm tự động chưa hoàn tất. Mở bài đã nộp để kiểm tra và chấm phần Viết, Nói.", path: `/op/tests?tab=${examTab}${examAttempt}`, action: "Mở bài cần chấm" };
    case "assessment_submission_saved":
      return { title: `Đã nộp ${exam}`, description: "Bài làm đã được lưu. Vận hành sẽ kiểm tra và cập nhật kết quả.", path: item.context === "final" ? "/monthly" : item.context === "pass_course" ? "/test/pass-course" : "/profile", action: "Xem trạng thái" };
    case "assessment_grading_interrupted":
      return { title: `Chấm tự động ${exam} bị gián đoạn`, description: "Bài nộp đã được lưu. Vận hành có thể chấm tay phần Viết và Nói.", path: `/mgr/ops/tests?tab=${examTab}`, action: "Xem kết quả bài thi" };
    case "season_turn_credited":
      return { title: "Season đã ghi nhận lượt luyện", description: "Lượt luyện hợp lệ vẫn được tính khi nhận xét tự động gián đoạn.", path: "/coach", action: "Mở Season" };
    case "season_feedback_interrupted":
      return { title: "Nhận xét Season bị gián đoạn", description: "Các lượt luyện hợp lệ vẫn được ghi nhận. Xem phản hồi Season để theo dõi.", path: "/op/review?tab=coach", action: "Xem phản hồi Season" };
    case "season_service_interrupted":
      return { title: "Nhận xét Season bị gián đoạn", description: "Tiến độ lượt luyện hợp lệ vẫn được ghi nhận. Bạn có thể kiểm tra kết nối AI trong Cài đặt.", path: "/settings", action: "Mở Cài đặt" };
    case "assessment_result":
    case "assessment_retry":
      return { title: item.kind === "assessment_retry" ? `Có hướng dẫn thi lại ${exam}` : `Có kết quả ${exam}`, description: "Mở trang học để xem kết quả và bước tiếp theo.", path: item.context === "pass_course" ? item.kind === "assessment_result" ? "/reward/course" : "/support?tab=appeals" : item.context === "final" ? "/monthly" : "/profile", action: "Xem kết quả" };
    case "appeal_received":
      return { title: `Có kháng nghị ${appealSubject}`, description: "Học viên đã gửi lý do để Vận hành xem xét và phản hồi.", path: `/op/review?tab=appeals${focus}`, action: "Mở kháng nghị" };
    case "appeal_approved":
    case "appeal_rejected":
      return { title: `Kháng nghị ${appealSubject} ${item.kind === "appeal_approved" ? "đã được chấp nhận" : "bị từ chối"}`, description: "Bạn có thể đọc phản hồi của Vận hành tại Hỗ trợ học tập.", path: `/support?tab=appeals${focus}`, action: "Xem kháng nghị" };
    case "learning_reminder":
      return { title: "Nhắc bạn tiếp tục học", description: "Quản lý đã nhắc bạn quay lại mục tiêu học tập.", path: "/home", action: "Về Trang chủ" };
    case "security_report":
      return securityReportContent(item);
    case "deletion_received":
      return { title: "Có yêu cầu xóa tài khoản", description: "Vận hành đang chờ quyết định của Quản lý.", path: "/mgr/ops", action: "Mở Vận hành" };
    case "deletion_resolved":
      return { title: item.context === "approved" ? "Yêu cầu xóa tài khoản đã được duyệt" : "Yêu cầu xóa tài khoản đã bị từ chối", description: "Quản lý đã xử lý yêu cầu của bạn.", path: `/op/review?tab=sent${focus}`, action: "Xem yêu cầu" };
    case "level_changed": {
      const [direction, level] = (item.context ?? "").split(":");
      if (level === "C1" && direction !== "lower") return { title: "Bạn đã đạt mức cao nhất C1", description: "C1 là trình độ cao nhất. Trang chủ hiển thị trạng thái Bài thi đầu ra.", path: "/home", action: "Về Trang chủ" };
      return { title: direction === "lower" ? `Mức học được điều chỉnh xuống ${level}` : `Mức ${level} đã có hiệu lực`, description: "Xem mức hiện tại và lộ trình học trong hồ sơ.", path: "/profile", action: "Xem hồ sơ" };
    }
    case "credential_changed":
      return { title: "Thông tin đăng nhập đã được đặt lại", description: "Các phiên đăng nhập cũ đã hết hiệu lực.", path: "/", action: "Về trang chính" };
    case "account_reopened":
      return { title: "Tài khoản của bạn đã được mở lại", description: "Bạn đã có thể sử dụng E4S theo quyền của mình.", path: "/", action: "Về trang chính" };
    case "lesson_availability_changed":
      return { title: "Lịch học tháng đã thay đổi", description: "Mở lịch để xem các bài hiện có.", path: "/monthly", action: "Xem lịch học" };
    case "lesson_reopened":
      return { title: "Một bài học đang được cập nhật", description: "Kết quả đã hoàn thành của bạn vẫn được giữ nguyên. Bài sẽ mở lại khi được duyệt.", path: "/monthly", action: "Xem lịch học" };
    case "monthly_uncounted":
      return { title: "Tháng này bạn học thử để làm quen", description: monthlyUncountedCountsFromText(item.context), path: "/home", action: "Học bài ngay" };
    case "absence_warning": {
      const days = /^\d+$/.test(item.context) ? Number(item.context) : 3;
      const left = Math.max(1, 5 - days);
      return { title: `Bạn đã vắng ${days} ngày học liên tiếp`, description: `Vắng thêm ${left} ngày học liên tiếp sẽ bị khóa tài khoản.`, path: "/home", action: "Học bài hôm nay" };
    }
    case "lesson_published":
      return { title: "Lịch học có bài mới hoặc bài cập nhật", description: "Lịch tháng hiển thị ngày mở của từng bài.", path: "/monthly", action: "Xem lịch học" };
    case "monthly_exam_published":
      return { title: "Đã phát hành đề thi tháng", description: "Mở Bài tháng để xem ngày thi và điều kiện của bạn.", path: "/monthly", action: "Xem điều kiện" };
    case "level_exam_published":
      return { title: `Đã phát hành đề lên mức ${item.context}`, description: "Đường lên mức hiển thị điều kiện dự thi của bạn.", path: "/profile", action: "Xem điều kiện" };
    case "monthly_survey_open":
      return { title: "Khảo sát tháng đã mở", description: "Chia sẻ trải nghiệm học tập của bạn với Quản lý.", path: `/support?type=feedback&month=${encodeURIComponent(item.context)}`, action: "Mở khảo sát" };
    case "monthly_exam_ready":
      return { title: "Bài thi tháng của bạn đã mở", description: "Mở trang thi để xem hướng dẫn và thời gian.", path: "/monthly", action: "Mở bài thi" };
    case "level_exam_ready":
      return { title: `Bạn đủ điều kiện thi lên mức ${item.context}`, description: "Mở hồ sơ để xem hướng dẫn trước khi thi.", path: "/profile", action: "Mở Đường lên mức" };
    case "topic_report_received":
      return { title: "Có báo cáo chủ đề Mini game", description: "Vận hành có thể kiểm tra báo cáo trong hàng chờ.", path: "/op", action: "Xem hàng chờ" };
    case "topic_report_resolved":
      return { title: "Báo cáo chủ đề Mini game đã được xử lý", description: "Bạn có thể mở lại Mini game để tiếp tục.", path: "/games", action: "Mở Mini game" };
    case "duel_invited":
    case "duel_completed":
      return { title: item.kind === "duel_invited" ? "Bạn có lời mời thách đấu" : "Đã có kết quả thách đấu", description: "Xem chi tiết trong Mini game.", path: "/games", action: "Mở Mini game" };
    case "course_ready":
      return { title: "Bạn đã đủ điều kiện thi đầu ra", description: "Mở bài thi để xem hướng dẫn và kiểm tra thiết bị.", path: "/test/pass-course", action: "Mở bài thi đầu ra" };
    case "certificate_issued":
      return { title: "Đã cấp chứng nhận hoàn thành E4S", description: "Quyết định đã được lưu cùng kết quả thi đầu ra.", path: "/op/tests", action: "Xem kết quả" };
    case "challenge_received":
      return { title: "Có thử thách Season chờ duyệt mức", description: "Học viên đã hoàn thành thử thách.", path: "/op", action: "Mở hàng duyệt" };
    case "lesson_window_unapproved":
    case "lesson_window_unapproved_manager": {
      const [lessonDate = "", level = ""] = (item.context ?? "").split(":");
      return { title: `Bài ngày ${dayMonth(lessonDate)} của ${level} chưa được duyệt`, description: "Học viên sẽ không có bài ngày đó cho tới khi bài được duyệt.", path: item.kind === "lesson_window_unapproved" ? "/op/months" : "/mgr/ops/months", action: "Mở lịch tháng" };
    }
    case "test_date_active": {
      const [testDate = "", realDate = ""] = (item.context ?? "").split(":");
      return { title: `Ngày thử đang là ${dayMonth(testDate)} (ngày thật ${dayMonth(realDate)})`, description: "Nhớ trả về ngày thật sau khi thử.", path: "/settings", action: "Mở Cài đặt" };
    }
    case "challenge_passed":
    case "challenge_retry":
      return { title: item.kind === "challenge_passed" ? "Đã hoàn thành thử thách lên mức" : "Có kết quả thử thách lên mức", description: "Xem kết quả và bước tiếp theo trong hồ sơ.", path: "/profile", action: "Xem hồ sơ" };
    case "badge_earned":
    {
      const icon = item.context ? rewardBadgeIconForLabel(item.context) : undefined;
      return { title: `Bạn vừa nhận huy hiệu ${item.context ? `${icon ? `${icon} ` : ""}${item.context}` : "mới"}`, description: "Huy hiệu được giữ mãi, kể cả khi đổi trình độ. Xem tiến độ Season trong hồ sơ.", path: "/profile", action: "Xem huy hiệu" };
    }
    case "season_reached": {
      // Context "3:B1" (Season 3 of B1); older notifications carry the Season only ("3").
      const [seasonLevel = "", level] = item.context.split(":");
      const season = seasonNames[seasonLevel];
      return { title: season ? `Chúc mừng! Bạn đã lên ${season}${level ? ` · ${level}` : ""}` : "Chúc mừng! Bạn đã lên Season mới", description: "Xem Season hiện tại và huy hiệu của Season tiếp theo trong hồ sơ.", path: "/profile", action: "Xem Season" };
    }
    default:
      // Unknown or newer server kinds get a neutral row instead of crashing the whole inbox.
      return { title: "Có thông báo mới", description: "Mở trang chính để xem cập nhật mới nhất.", path: "/", action: "Về trang chính" };
  }
}

export function NotificationBell() {
  const navigate = useNavigate();
  const dialog = useRef<HTMLElement>(null);
  const feed = useRef<HTMLDivElement>(null);
  const titleId = useId();
  const [open, setOpen] = useState(false);
  const [unreadOnly, setUnreadOnly] = useState(false);
  const [count, setCount] = useState(0);
  const [loadingHeight, setLoadingHeight] = useState<number>();
  const [pages, setPages] = useState<Record<"all" | "unread", NotificationInboxView | undefined>>({ all: undefined, unread: undefined });
  const filter = unreadOnly ? "unread" : "all";
  const page = pages[filter];
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);
  const [reload, setReload] = useState(0);
  const close = () => setOpen(false);
  useDialog(open, dialog, close);
  useLayoutEffect(() => { if (feed.current) feed.current.scrollTop = 0; }, [open, filter]);

  useEffect(() => {
    const controller = new AbortController();
    let loading = false;
    const refresh = async (list: boolean) => {
      if (loading || document.visibilityState === "hidden") return;
      loading = true;
      try {
        const result = await getNotificationInbox(list ? 20 : 0, unreadOnly, undefined, controller.signal);
        if (controller.signal.aborted) return;
        setCount(result.unreadCount);
        if (list) {
          setPages((current) => ({ ...current, [filter]: result }));
          setLoadingHeight(undefined);
          setError("");
        }
      } catch {
        if (list && !controller.signal.aborted) {
          setLoadingHeight(undefined);
          setError("Không tải được thông báo. Hãy thử lại.");
        }
      } finally {
        loading = false;
      }
    };
    void refresh(open);
    const refreshCount = () => void refresh(false);
    const timer = window.setInterval(refreshCount, 30_000);
    document.addEventListener("visibilitychange", refreshCount);
    window.addEventListener("focus", refreshCount);
    return () => {
      controller.abort();
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", refreshCount);
      window.removeEventListener("focus", refreshCount);
    };
  }, [open, unreadOnly, filter, reload]);

  const loadMore = async () => {
    if (!page?.nextCursor || pending) return;
    setPending(true);
    try {
      const result = await getNotificationInbox(20, unreadOnly, page.nextCursor);
      setPages((current) => ({ ...current, [filter]: { ...result, items: [...page.items, ...result.items] } }));
      setCount(result.unreadCount);
      setError("");
    } catch {
      setError("Không tải được thông báo cũ hơn. Hãy thử lại.");
    } finally {
      setPending(false);
    }
  };

  const read = async (item?: InboxNotificationView) => {
    if (pending) return;
    if (item && hasAssessmentLogoutGuard()) {
      setError("Hãy hoàn thành bài thi hiện tại trước khi mở màn khác.");
      return;
    }
    setPending(true);
    try {
      if (!item?.readAt) {
        const result = await markInboxRead(item ? { ids: [item.id] } : { all: true });
        setCount(result.unreadCount);
        setLoadingHeight(dialog.current?.offsetHeight);
        setPages({ all: undefined, unread: undefined });
      }
      setError("");
      setReload((version) => version + 1);
      if (item) {
        close();
        navigate(notificationContent(item).path);
      }
    } catch {
      setError("Chưa đánh dấu được thông báo. Hãy thử lại.");
    } finally {
      setPending(false);
    }
  };

  const show = () => {
    setError("");
    setLoadingHeight(undefined);
    setUnreadOnly(false);
    setOpen(true);
  };

  const changeFilter = (next: boolean) => {
    if (unreadOnly === next) return;
    const cached = pages[next ? "unread" : "all"];
    setLoadingHeight(cached ? undefined : dialog.current?.offsetHeight);
    setError("");
    setUnreadOnly(next);
  };

  return <>
    <button className="btn-sm btn-ghost inbox-trigger" type="button" aria-label={count ? `Thông báo · ${count} chưa đọc` : "Thông báo"} title="Thông báo" aria-haspopup="dialog" aria-expanded={open} onClick={show}>
      <Bell size={18} strokeWidth={1.7} aria-hidden="true" />
      {count > 0 ? <span className="inbox-count" aria-hidden="true">{count > 99 ? "99+" : count}</span> : null}
    </button>
    {open ? createPortal(<div className="inbox-backdrop" onClick={(event) => { if (event.target === event.currentTarget) close(); }}>
      <section ref={dialog} className="dialog inbox-dialog" style={loadingHeight ? { minHeight: `min(${loadingHeight}px, calc(100dvh - 32px))` } : undefined} role="dialog" aria-modal="true" aria-labelledby={titleId} tabIndex={-1}>
        <header className="inbox-heading">
          <h3 id={titleId}>Thông báo</h3>
          <button type="button" className="app-modal-close" aria-label="Đóng thông báo" onClick={close}><X size={20} aria-hidden="true" /></button>
        </header>
        <div className="inbox-controls">
          <button type="button" className={unreadOnly ? "btn-sm" : "btn-sm btn-primary"} aria-pressed={!unreadOnly} disabled={pending} onClick={() => changeFilter(false)}>Tất cả</button>
          <button type="button" className={unreadOnly ? "btn-sm btn-primary" : "btn-sm"} aria-pressed={unreadOnly} disabled={pending} onClick={() => changeFilter(true)}>Chưa đọc</button>
          <button type="button" className="btn-sm btn-ghost inbox-mark-all" disabled={pending || count === 0} onClick={() => void read()}>Đánh dấu tất cả đã đọc</button>
        </div>
        {error ? <div className="inbox-error"><p role="alert">{error}</p><button type="button" className="btn-sm" onClick={() => setReload((version) => version + 1)}>Tải lại danh sách</button></div> : null}
        <div ref={feed} className="inbox-feed" aria-busy={pending || (!page && !error)}>
          {!page && !error ? <p role="status" className="muted">Đang tải thông báo…</p> : null}
          {page?.items.length === 0 ? <p className="muted">{unreadOnly ? "Bạn đã đọc hết thông báo." : "Chưa có thông báo."}</p> : null}
          {page?.items.length ? <ul>
            {page.items.map((item) => {
              const content = notificationContent(item);
              const category = notificationCategory(item.kind);
              return <li key={item.id} data-category={category} className={item.readAt ? "inbox-item" : "inbox-item inbox-item--unread"}>
                <div className="inbox-item-heading"><span className="inbox-category">{categoryLabels[category]}</span><time dateTime={item.createdAt}>{notificationTime.format(new Date(item.createdAt))}</time></div>
                <strong className="inbox-item-title">{content.title}</strong>
                <p>{content.description}</p>
                <button type="button" className="btn-sm inbox-item-action" disabled={pending} onClick={() => void read(item)}>{content.action}</button>
              </li>;
            })}
          </ul> : null}
          {page?.nextCursor ? <button type="button" className="btn-sm" disabled={pending} onClick={() => void loadMore()}>Xem thông báo cũ hơn</button> : null}
        </div>
      </section>
    </div>, document.body) : null}
  </>;
}
