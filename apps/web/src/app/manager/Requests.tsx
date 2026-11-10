import { useEffect, useState } from "react";
import "../shared/request-workspace.css";
import { Link, useSearchParams } from "react-router";
import { RequestTable } from "../shared/RequestTable.js";
import { RequestEvidenceDetails } from "../shared/RequestEvidence.js";
import type { ManagerComplaintView, ReopenRequestView } from "@e4s/contracts";
import { managerApiClient } from "../../api/manager.js";
import { useModal } from "../shared/ModalProvider.js";
import { PageTitle } from "./shared.js";

type RequestRow = { kind: "reopen"; item: ReopenRequestView } | { kind: "complaint"; item: ManagerComplaintView };
const pageSize = 20;
const statusLabels = { pending: "Chờ xử lý", approved: "Đã duyệt", rejected: "Đã từ chối", auto_approved: "Tự duyệt quá hạn" };
const complaintLabels: Record<ManagerComplaintView["kind"], string> = {
  exam_eligibility: "Không đủ điều kiện thi",
  lesson_unlock: "Mở khóa bài tháng",
  account_unlock: "Mở khóa tài khoản",
  attendance: "Điểm danh sai",
  lesson_count: "Số lượng bài học",
  account: "Tài khoản"
};
const reopenLabels: Record<ReopenRequestView["target"], string> = {
  account: "Tài khoản học viên",
  daily_lesson: "Bài ngày",
  weekly_review: "Bài ôn",
  monthly_exam: "Đề thi",
  monthly_resources: "Tài nguyên tháng"
};

function reopenTitle(item: ReopenRequestView) {
  if (!item.monthlyResources) return reopenLabels[item.target];
  const [year, month] = item.monthlyResources.month.split("-");
  return `Tài nguyên tháng ${month}/${year} · ${item.monthlyResources.cefr}`;
}

function monthlyResourcesApprovalWarning(resources: NonNullable<ReopenRequestView["monthlyResources"]>): string {
  if (resources.lessonsWithContent > 0) {
    return `Cảnh báo: ${resources.lessonsWithContent}/${resources.lessonCount} bài đã có nội dung (đã soạn hoặc đã duyệt). Duyệt mở lại sẽ xoá toàn bộ ${resources.lessonCount} bài khỏi lịch, kể cả các bài này. Tài nguyên được giữ nguyên và trở về bản nháp.`;
  }
  return `Duyệt mở lại sẽ đưa tài nguyên về bản nháp và xoá ${resources.lessonCount} bài chưa có nội dung khỏi lịch.`;
}

function submittedAt(row: RequestRow) {
  return row.kind === "reopen" ? row.item.createdAt : row.item.submittedAt;
}

export function ManagerRequests() {
  const modal = useModal();
  const [params, setParams] = useSearchParams();
  const kindFilter = params.get("kind") === "complaint" ? "complaint" : "reopen";
  const complaintTab = kindFilter === "complaint";
  const focusedId = params.get("id");
  const tableLabel = complaintTab ? "Khiếu nại" : "Yêu cầu";
  const archivedOnly = params.get("archived") === "1";
  const [rows, setRows] = useState<RequestRow[]>();
  const [page, setPage] = useState(0);
  const [busy, setBusy] = useState(false);
  const [loadError, setLoadError] = useState("");
  const [actionError, setActionError] = useState("");

  const load = async () => {
    const [reopens, complaints] = await Promise.allSettled([managerApiClient.getManagerReopenRequests(), managerApiClient.getManagerComplaints()]);
    setLoadError(reopens.status === "rejected" || complaints.status === "rejected" ? "Chưa tải được đầy đủ yêu cầu. Hãy thử lại." : "");
    setRows(current => [
      ...(reopens.status === "fulfilled" ? reopens.value.requests.map(item => ({ kind: "reopen", item }) as const) : current?.filter(row => row.kind === "reopen") ?? []),
      ...(complaints.status === "fulfilled" ? complaints.value.complaints.map(item => ({ kind: "complaint", item }) as const) : current?.filter(row => row.kind === "complaint") ?? [])
    ]);
  };
  useEffect(() => { void load(); }, []);
  useEffect(() => { setPage(0); }, [kindFilter, archivedOnly]);

  const decide = async (row: RequestRow, decision: "approved" | "rejected") => {
    const approved = decision === "approved";
    const resources = row.kind === "reopen" ? row.item.monthlyResources : undefined;
    const action = approved ? row.kind === "reopen" ? "Duyệt mở khóa" : "Duyệt" : "Từ chối";
    const warning = approved && resources ? monthlyResourcesApprovalWarning(resources) : undefined;
    const response = await modal.prompt({
      title: action,
      label: row.kind === "reopen" ? "Lý do gửi cho vận hành và học viên" : "Phản hồi bắt buộc",
      confirmLabel: action,
      multiline: row.kind === "reopen" ? { minLength: 5, maxLength: 1000 } : { minLength: 1, maxLength: 2000 },
      ...(warning ? { message: warning } : {}),
      tone: approved && !resources?.lessonsWithContent ? "primary" : "danger"
    });
    if (!response?.trim()) return;
    setBusy(true);
    setActionError("");
    try {
      if (row.kind === "reopen") await managerApiClient.decideManagerReopenRequest(row.item.id, decision, response.trim());
      else await managerApiClient.decideManagerComplaint(row.item.id, decision, response.trim());
      await load();
    } catch {
      setActionError("Không lưu được quyết định. Hãy tải lại danh sách và thử lại.");
    } finally {
      setBusy(false);
    }
  };

  const archive = async (row: RequestRow) => {
    const archived = !row.item.archivedAt;
    const label = row.kind === "complaint" ? "khiếu nại" : "yêu cầu";
    const action = archived ? "Lưu trữ" : "Khôi phục";
    if (!await modal.confirm({
      title: action + " " + label + "?",
      message: archived ? "Mục này sẽ chuyển vào danh sách đã lưu trữ. Bạn có thể khôi phục sau." : "Mục này sẽ trở lại danh sách chính.",
      confirmLabel: action,
      countdownSeconds: 0
    })) return;
    setBusy(true);
    setActionError("");
    try {
      await managerApiClient.setManagerRequestArchived(row.kind, row.item.id, archived);
      await load();
    } catch {
      setActionError("Không cập nhật được lưu trữ. Hãy thử lại.");
    } finally {
      setBusy(false);
    }
  };

  const remove = async (row: RequestRow) => {
    const label = row.kind === "complaint" ? "khiếu nại" : "yêu cầu";
    const confirmed = await modal.confirm({
      title: `Xóa ${label}`,
      message: "Mục này sẽ biến mất khỏi danh sách của Quản lý, kể cả mục đã lưu trữ. Người gửi vẫn xem được kết quả xử lý.",
      confirmLabel: "Xóa",
      countdownSeconds: 0,
      tone: "danger"
    });
    if (!confirmed) return;
    setBusy(true);
    setActionError("");
    try {
      await managerApiClient.deleteManagerRequest(row.kind, row.item.id);
      setRows(current => current?.filter(entry => entry.kind !== row.kind || entry.item.id !== row.item.id));
    } catch {
      setActionError(`Không xóa được ${label}. Hãy thử lại.`);
    } finally {
      setBusy(false);
    }
  };

  const visible = (rows ?? []).filter(row => row.kind === kindFilter && Boolean(row.item.archivedAt) === archivedOnly);
  visible.sort((a, b) => Number(b.item.status === "pending") - Number(a.item.status === "pending")
    || Date.parse(submittedAt(b)) - Date.parse(submittedAt(a)));
  const lastPage = Math.max(0, Math.ceil(visible.length / pageSize) - 1);
  const currentPage = Math.min(page, lastPage);
  const focusedIndex = focusedId ? visible.findIndex(row => row.item.id === focusedId) : -1;
  useEffect(() => {
    if (focusedIndex >= 0) setPage(Math.floor(focusedIndex / pageSize));
  }, [focusedIndex]);
  useEffect(() => {
    if (focusedId && focusedIndex >= 0 && Math.floor(focusedIndex / pageSize) === currentPage) {
      document.getElementById(`${kindFilter}-${focusedId}`)?.scrollIntoView?.({ block: "nearest" });
    }
  }, [focusedId, focusedIndex, currentPage, kindFilter]);

  return <div className="manager-page request-workspace">
    <PageTitle>
      <h1>{tableLabel}</h1>
      <p className="muted">{complaintTab ? "Xem và phản hồi khiếu nại của học viên." : "Duyệt yêu cầu mở khóa tài khoản và nội dung học."} Mục chờ xử lý nằm đầu danh sách.</p>
    </PageTitle>
    <nav className="request-tabs" aria-label="Loại yêu cầu">
      <Link to={{ search: archivedOnly ? "?archived=1" : "" }} aria-current={!complaintTab ? "page" : undefined}>Yêu cầu mở khóa</Link>
      <Link to={{ search: archivedOnly ? "?kind=complaint&archived=1" : "?kind=complaint" }} aria-current={complaintTab ? "page" : undefined}>Khiếu nại học viên</Link>
    </nav>
    {loadError || actionError ? <div className="banner danger" role="alert">
      <span>{actionError || loadError}</span>
      {loadError ? <button type="button" className="btn-sm" disabled={busy} onClick={() => void load()}>Thử lại</button> : null}
    </div> : null}
    <section className="card manager-table-card manager-requests-card">
      <div className="manager-requests-filters">
        <label className="small"><input type="checkbox" checked={archivedOnly} onChange={event => {
          if (event.target.checked) params.set("archived", "1");
          else params.delete("archived");
          setParams(params, { replace: true });
        }} /> Xem mục đã lưu trữ</label>
      </div>
      <RequestTable label={tableLabel}
        rows={visible.slice(currentPage * pageSize, (currentPage + 1) * pageSize).map(row => {
          const { item } = row;
          const isPending = item.status === "pending";
          const resources = row.kind === "reopen" ? row.item.monthlyResources : undefined;
          const response = row.kind === "reopen" ? row.item.decisionReason : row.item.resolution;
          const date = submittedAt(row);
          return {
            id: `${row.kind}-${item.id}`,
            kind: row.kind === "reopen" ? "Mở khóa" : "Khiếu nại",
            content: <>
              <b>{row.kind === "reopen" ? reopenTitle(row.item) : complaintLabels[row.item.kind]}</b>
              {row.kind === "complaint" ? <p className="small muted">{row.item.learnerName}{row.item.dueAt && isPending ? ` · Hạn phản hồi ${new Date(row.item.dueAt).toLocaleString("vi-VN")}` : ""}</p> : null}
              {resources ? <p className="xs muted">Phiên bản tài nguyên v{resources.frameworkVersion}</p> : null}
              <p className="small">{item.reason}</p>
              {row.kind === "complaint" ? <RequestEvidenceDetails kind="complaint" item={row.item} /> : null}
              {isPending && resources && resources.lessonsWithContent > 0 ? <p className="xs manager-reopen-warning" role="alert">Cảnh báo: {resources.lessonsWithContent} bài đã có nội dung sẽ bị xoá khỏi lịch khi duyệt mở lại.</p> : null}
              {item.status === "approved" && resources?.removedLessonCount != null ? <p className="xs muted">Đã xoá {resources.removedLessonCount} bài khỏi lịch.</p> : null}
              {response ? <p className="small muted">Phản hồi: {response}</p> : null}
            </>,
            status: <span className={`badge ${isPending ? "warn" : item.status === "rejected" ? "danger" : "ok"}`}>{statusLabels[item.status]}</span>,
            date,
            action: isPending ? <>
                <button type="button" className="btn-sm btn-primary" aria-label={row.kind === "reopen" ? "Duyệt mở khóa" : undefined} disabled={busy} onClick={() => void decide(row, "approved")}>Duyệt</button>
                <button type="button" className="btn-sm" disabled={busy} onClick={() => void decide(row, "rejected")}>Từ chối</button>
              </> : <>
                {item.archivedAt !== undefined ? <button type="button" className="btn-sm" disabled={busy} onClick={() => void archive(row)}>{item.archivedAt ? "Khôi phục" : "Lưu trữ"}</button> : null}
                <button type="button" className="btn-sm btn-danger" disabled={busy} onClick={() => void remove(row)}>Xóa</button>
              </>
          };
        })}
        empty={!rows ? <span role="status">Đang tải {tableLabel.toLocaleLowerCase("vi-VN")}…</span> : archivedOnly ? "Chưa có mục đã lưu trữ." : loadError ? "Danh sách hiện chưa đầy đủ." : complaintTab ? "Chưa có khiếu nại." : "Chưa có yêu cầu."} />
      {lastPage > 0 ? <div className="row manager-requests-pagination">
        <button className="btn-sm" type="button" disabled={currentPage === 0} onClick={() => setPage(currentPage - 1)}>Trước</button>
        <span className="small muted">Trang {currentPage + 1}/{lastPage + 1}</span>
        <button className="btn-sm" type="button" disabled={currentPage === lastPage} onClick={() => setPage(currentPage + 1)}>Sau</button>
      </div> : null}
    </section>
  </div>;
}
