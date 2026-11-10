import { useEffect, useState, type ReactNode } from "react";
import { Link, useNavigate, useSearchParams } from "react-router";
import type { ContentReviewAssessmentDetailView, ContentReviewView, ReopenRequestView } from "@e4s/contracts";
import type { OperatorApiClient } from "../../api/operator.js";
import { ApiError } from "../../api/runtime.js";
import { RequestDate, RequestTable } from "../shared/RequestTable.js";
import { useModal } from "../shared/ModalProvider.js";
import { adaptReviewAppeal } from "./adapters.js";
import { AppealReviewCard, OperatorReviewAssessmentDetail, promptExerciseCorrection } from "./Review.js";
import { Badge, Button } from "./primitives.js";

type Appeal = ContentReviewView["appeals"][number];
type AppealStatus = "all" | "pending" | "handled";
type RequestStatus = Appeal["status"] | "approved" | "cancelled";
const pageSize = 20;
const statusLabels: Record<RequestStatus, string> = {
  pending: "Chờ xử lý", accepted: "Đã chấp nhận", rejected: "Đã từ chối",
  approved: "Đã duyệt", cancelled: "Đã hủy"
};
const appealLabels: Record<Appeal["kind"], string> = {
  lesson_part: "Kháng nghị bài học", weekly_practice: "Kháng nghị bài thực hành tuần", assessment: "Kháng nghị bài kiểm tra"
};
const reopenLabels: Record<ReopenRequestView["target"], string> = {
  account: "Mở lại tài khoản", daily_lesson: "Mở lại bài học ngày", weekly_review: "Mở lại bài ôn",
  monthly_exam: "Mở lại đề thi tháng", monthly_resources: "Mở lại tài nguyên tháng"
};

function requestSearch(tab: "appeals" | "sent", status?: AppealStatus, id?: string, page = 0) {
  const params = new URLSearchParams({ tab });
  if (status && status !== "all") params.set("status", status);
  if (id) params.set("id", id);
  if (page > 0) params.set("page", String(page + 1));
  return `?${params}`;
}

export function OperatorRequests({ client }: { client: OperatorApiClient }) {
  const [params] = useSearchParams();
  const tab = params.get("tab") === "sent" ? "sent" : "appeals";
  const filter = params.get("status");
  const status = filter === "pending" || filter === "handled" ? filter : "all";
  const id = params.get("id") || undefined;
  const parsedPage = Number(params.get("page") ?? "1");
  const page = Number.isInteger(parsedPage) && parsedPage > 1 && parsedPage <= 50_001 ? parsedPage - 1 : 0;
  return <div className="operator-requests request-workspace">
    {tab === "appeals"
      ? <IncomingAppeals key={`${status}-${page}`} client={client} id={id} status={status} page={page} />
      : <SentRequests client={client} id={id} page={page} />}
  </div>;
}

function StatusBadge({ status }: { status: RequestStatus }) {
  return <Badge tone={status === "pending" ? "warn" : status === "rejected" ? "danger" : status === "cancelled" ? "" : "ok"}>{statusLabels[status]}</Badge>;
}

function useFocusedRow(id?: string) {
  useEffect(() => {
    if (id) document.getElementById(id)?.scrollIntoView?.({ block: "nearest" });
  }, [id]);
}

function RequestPagination({ page, hasMore, link }: { page: number; hasMore: boolean; link: (page: number) => string }) {
  if (page === 0 && !hasMore) return null;
  return <nav className="row operator-request-pagination" aria-label="Trang danh sách">
    {page > 0 && <Link to={link(page - 1)}>Trang trước</Link>}
    <span className="small muted">Trang {page + 1}</span>
    {hasMore && <Link to={link(page + 1)}>Trang sau</Link>}
  </nav>;
}

function LoadError({ children, retry }: { children: ReactNode; retry: () => void }) {
  return <p className="banner danger operator-request-error" role="alert">{children} <Button small onClick={retry}>Thử lại</Button></p>;
}

function IncomingAppeals({ client, id, status, page }: { client: OperatorApiClient; id: string | undefined; status: AppealStatus; page: number }) {
  const modal = useModal();
  const navigate = useNavigate();
  const [data, setData] = useState<{ appeals: Appeal[]; hasMore: boolean; status: AppealStatus; page: number }>();
  const [revision, setRevision] = useState(0);
  const [loadFailed, setLoadFailed] = useState(false);
  const [actionError, setActionError] = useState("");
  const [decision, setDecision] = useState<boolean>();
  const [removingId, setRemovingId] = useState<string>();
  const [assessmentBusy, setAssessmentBusy] = useState(false);
  const [decisionId, setDecisionId] = useState<string>();
  const [assessment, setAssessment] = useState<ContentReviewAssessmentDetailView>();
  const reload = () => setRevision(value => value + 1);
  useEffect(() => {
    let active = true;
    setLoadFailed(false);
    async function load() {
      if (!id) {
        const list = await client.getContentReviewAppeals({ status, offset: page * pageSize });
        return { ...list, status, page };
      }
      const [list, focused] = await Promise.all([
        client.getContentReviewAppeals({ status, offset: page * pageSize }),
        client.getContentReviewAppeals({ id }).catch(error => {
          if (error instanceof ApiError && (error.status === 400 || error.status === 404)) return { appeals: [] };
          throw error;
        })
      ]);
      const item = focused.appeals[0];
      if (!item) return { ...list, status, page };
      const targetStatus: AppealStatus = status === "all" ? status : item.status === "pending" ? "pending" : "handled";
      const targetPage = targetStatus === status ? page : 0;
      const target = targetStatus === status ? list : await client.getContentReviewAppeals({ status: targetStatus, offset: 0 });
      const appeals = target.appeals.some(appeal => appeal.id === id) ? target.appeals : [item, ...target.appeals];
      return { ...target, appeals, status: targetStatus, page: targetPage };
    }
    void load().then(
      next => { if (active) setData(next); },
      () => { if (active) setLoadFailed(true); }
    );
    return () => { active = false; };
  }, [client, id, status, page, revision]);

  const decide = async (item: Appeal, accepted: boolean) => {
    setDecision(accepted);
    setDecisionId(item.id);
    setActionError("");
    try {
      let newScore: number | undefined;
      let exerciseCorrection: import("@e4s/contracts").LessonExerciseCorrectionInput | undefined;
      if (accepted && item.kind === "lesson_part" && item.exerciseVersionId) {
        const correction = await promptExerciseCorrection(modal, item);
        if (!correction) return;
        exerciseCorrection = correction;
      }
      if (accepted && item.kind === "weekly_practice") {
        const score = await modal.prompt({
          title: "Chấm lại bài thực hành tuần", label: "Điểm mới (0–100)", inputType: "number", confirmLabel: "Tiếp tục"
        });
        if (score === null) return;
        newScore = Number(score);
        if (!score.trim() || !Number.isInteger(newScore) || newScore < 0 || newScore > 100) {
          setActionError("Điểm mới phải là số nguyên từ 0 đến 100.");
          return;
        }
      }
      const resolution = await modal.prompt({
        title: accepted ? "Chấp nhận kháng nghị" : "Từ chối kháng nghị",
        label: "Nội dung xử lý / giải thích cho học viên", multiline: { minLength: 1, maxLength: 2_000 },
        confirmLabel: accepted ? "Chấp nhận" : "Từ chối", tone: accepted ? "primary" : "danger"
      });
      if (!resolution?.trim()) return;
      const input = { status: accepted ? "accepted" as const : "rejected" as const, resolution: resolution.trim() };
      if (item.kind === "assessment") await client.decideAssessmentAppeal(item.id, input);
      else await client.decideReviewedAppeal(item.id, { ...input, ...(newScore === undefined ? {} : { newScore }), ...(exerciseCorrection ? { exerciseCorrection } : {}) });
      setData(undefined);
      reload();
    } catch {
      setActionError("Chưa lưu được quyết định. Hãy tải lại yêu cầu và thử lại.");
    } finally {
      setDecision(undefined);
      setDecisionId(undefined);
    }
  };
  const remove = async (item: Appeal) => {
    const confirmed = await modal.confirm({
      title: "Xóa kháng nghị",
      message: "Kháng nghị sẽ biến mất khỏi danh sách của Vận hành. Người học vẫn xem được kết quả xử lý.",
      confirmLabel: "Xóa",
      countdownSeconds: 0,
      tone: "danger"
    });
    if (!confirmed) return;
    setRemovingId(item.id);
    setActionError("");
    try {
      await client.deleteContentReviewAppeal(item.id);
      setData(current => current ? { ...current, appeals: current.appeals.filter(appeal => appeal.id !== item.id) } : current);
      const lastOnPage = data?.appeals.length === 1 && !data.hasMore;
      if (id === item.id || (listPage > 0 && lastOnPage)) {
        navigate(listLink(listPage > 0 && lastOnPage ? listPage - 1 : listPage), { replace: true });
      }
      reload();
    } catch {
      setActionError("Không xóa được kháng nghị. Hãy thử lại.");
    } finally {
      setRemovingId(undefined);
    }
  };
  const openAssessment = async (attemptId: string) => {
    setAssessmentBusy(true);
    setActionError("");
    try {
      setAssessment(await client.getContentReviewAssessment(attemptId));
    } catch {
      setActionError("Chưa tải được bài làm. Hãy thử lại.");
    } finally {
      setAssessmentBusy(false);
    }
  };
  const loading = loadFailed ? <LoadError retry={reload}>Chưa tải được kháng nghị.</LoadError>
    : !data ? <p role="status">Đang tải kháng nghị…</p> : null;
  const listStatus = data?.status ?? status;
  const listPage = data?.page ?? page;
  const focused = data?.appeals.find(item => item.id === id);
  useFocusedRow(focused?.id);
  const listLink = (next: number) => requestSearch("appeals", listStatus, undefined, next);
  return <section className="card request-card">
    <div className="request-filters">
      <label>Trạng thái <select value={listStatus} onChange={event => navigate(requestSearch("appeals", event.target.value as AppealStatus))}>
        <option value="all">Tất cả</option>
        <option value="pending">Chờ xử lý</option>
        <option value="handled">Đã xử lý</option>
      </select></label>
    </div>
    {actionError && <LoadError retry={reload}>{actionError}</LoadError>}
    {!loading && id && !focused ? <p role="status" className="muted">Kháng nghị này không còn khả dụng.</p> : null}
    <RequestTable label="Danh sách kháng nghị"
      rows={loadFailed ? [] : data?.appeals.map(item => {
        const open = item.id === id;
        const view = adaptReviewAppeal(item);
        const detailId = `appeal-detail-${item.id}`;
        return {
          id: item.id,
          kind: "Kháng nghị",
          content: <><b>{view.title}</b><p className="small muted">{item.learnerName} · {appealLabels[item.kind]}</p><p>{item.reason}</p>
            {item.resolution ? <p className="small muted">Phản hồi: {item.resolution}</p> : null}</>,
          status: item.overdue ? <Badge tone="danger">Quá hạn xử lý</Badge> : <StatusBadge status={item.status} />,
          date: item.createdAt,
          action: <>
            <Link to={requestSearch("appeals", listStatus, open ? undefined : item.id, listPage)} className="btn-sm"
              aria-expanded={open} aria-controls={open ? detailId : undefined}>{open ? "Thu gọn" : item.status === "pending" ? "Xử lý" : "Chi tiết"}</Link>
            {item.status !== "pending" ? <button className="btn-sm btn-danger" type="button" disabled={removingId !== undefined || decisionId !== undefined}
              onClick={() => void remove(item)}>{removingId === item.id ? "Đang xóa…" : "Xóa"}</button> : null}
          </>,
          detail: open ? <div className="operator-request-expanded" id={detailId}>
            {item.attemptId ? <Button small busy={assessmentBusy} onClick={() => void openAssessment(item.attemptId!)}>Xem bài làm</Button> : null}
            <AppealReviewCard item={view} readOnly={false}
              busy={accepted => decisionId === item.id && decision === accepted} itemBusy={decision !== undefined}
              onDecision={accepted => void decide(item, accepted)} />
          </div> : null
        };
      }) ?? []}
      empty={loading ?? (listStatus === "all" ? "Chưa có kháng nghị." : listStatus === "pending" ? "Chưa có kháng nghị chờ xử lý." : "Chưa có kháng nghị đã xử lý.")} />
    {data && <RequestPagination page={listPage} hasMore={data.hasMore} link={listLink} />}
    {assessment && <OperatorReviewAssessmentDetail detail={assessment} onClose={() => setAssessment(undefined)} />}
  </section>;
}

type SentRequest = {
  id: string; kind: string; title: string; context: string; reason: string; status: RequestStatus;
  submittedAt: string; decidedAt: string | null; response: string | null;
};

function SentRequests({ client, id, page }: { client: OperatorApiClient; id: string | undefined; page: number }) {
  const [requests, setRequests] = useState<SentRequest[]>();
  const [failed, setFailed] = useState(false);
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    let active = true;
    setFailed(false);
    void Promise.allSettled([client.getOwnReopenRequests(), client.getOwnDeletionRequests()]).then(([reopens, deletions]) => {
      if (!active) return;
      setFailed(reopens.status === "rejected" || deletions.status === "rejected");
      const rows: SentRequest[] = [];
      if (reopens.status === "fulfilled") {
        for (const item of reopens.value.requests) {
          const resources = item.monthlyResources;
          const lesson = item.lesson;
          rows.push({
            id: item.id, kind: "Mở khóa", title: reopenLabels[item.target], reason: item.reason, status: item.status,
            context: resources ? `${resources.month} · ${resources.cefr} · Phiên bản ${resources.frameworkVersion}`
              : lesson ? `${lesson.date} · ${lesson.cefr} · Bài ${lesson.number}` : "",
            submittedAt: item.createdAt, decidedAt: item.decidedAt, response: item.decisionReason
          });
        }
      }
      if (deletions.status === "fulfilled") {
        for (const item of deletions.value.requests) {
          rows.push({
            id: item.id, kind: "Xóa tài khoản", title: "Yêu cầu xóa tài khoản", context: item.learnerName, reason: item.reason, status: item.status,
            submittedAt: item.requestedAt, decidedAt: item.decidedAt ?? null, response: item.note ?? null
          });
        }
      }
      rows.sort((first, second) => Date.parse(second.submittedAt) - Date.parse(first.submittedAt));
      setRequests(rows);
    });
    return () => { active = false; };
  }, [client, revision]);

  const retry = () => setRevision(value => value + 1);
  const selectedIndex = id && requests ? requests.findIndex(request => request.id === id) : -1;
  const currentPage = selectedIndex >= 0 ? Math.floor(selectedIndex / pageSize) : page;
  const visible = requests?.slice(currentPage * pageSize, (currentPage + 1) * pageSize);
  useFocusedRow(selectedIndex >= 0 ? id : undefined);
  const loading = !requests ? <p role="status">Đang tải yêu cầu…</p> : null;
  const error = failed ? <LoadError retry={retry}>Chưa tải được đầy đủ yêu cầu gửi Quản lý.</LoadError> : null;
  return <section className="card request-card">
    {error}
    {!loading && !failed && id && selectedIndex < 0 ? <p role="status" className="muted">Yêu cầu này không còn khả dụng.</p> : null}
    <RequestTable label="Danh sách yêu cầu" rows={visible?.map(request => ({
      id: request.id,
      kind: request.kind,
      content: <><b>{request.title}</b>{request.context ? <p className="small muted">{request.context}</p> : null}
        <p>{request.reason}</p>
        {request.response ? <p className="small muted">Phản hồi: {request.response}</p> : null}
        {request.decidedAt ? <p className="small muted">Xử lý lúc <RequestDate date={request.decidedAt} /></p> : null}</>,
      status: <StatusBadge status={request.status} />,
      date: request.submittedAt
    })) ?? []} empty={loading ?? (failed ? "Danh sách hiện chưa đầy đủ." : "Chưa có yêu cầu gửi Quản lý.")} />
    {requests && <RequestPagination page={currentPage} hasMore={requests.length > (currentPage + 1) * pageSize} link={next => requestSearch("sent", undefined, undefined, next)} />}
  </section>;
}
