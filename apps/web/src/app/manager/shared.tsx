import type { ReactNode } from "react";

export type OperationalRequest = { id: string; title: string; detail: string };
export type TrashedAccount = { id: string; name: string; deletedAt: string };

export type ManagerOperationalProps = {
  deleteRequests?: readonly OperationalRequest[];
  trashedAccounts?: readonly TrashedAccount[];
  onOpenOperationalItem?: (kind: "delete" | "trash", id: string) => void;
  onPurgeOperationalItem?: (id: string) => void;
  /** Shared cards can render their loading/error state when a route owns the request. */
  loading?: boolean;
  error?: string;
  /** Manager pages may reuse the cards in an explicitly read-only or busy state. */
  readOnly?: boolean;
  busy?: boolean;
};

export function OperationalCards(props: ManagerOperationalProps) {
  const deleteRequests = props.deleteRequests ?? [];
  const trashedAccounts = props.trashedAccounts ?? [];
  const showCards = Boolean(deleteRequests.length || trashedAccounts.length);
  const actionState = { readOnly: Boolean(props.readOnly), busy: Boolean(props.busy) };
  return <>
    {props.error ? <div className="banner danger" role="alert"><div className="body small">{props.error}</div></div> : null}
    {props.loading ? <div className="card" role="status"><span className="spinner" aria-hidden="true" /> Đang tải tác vụ vận hành</div> : null}
    {!props.loading && showCards ? <>
      {deleteRequests.length ? <section className="card manager-section-card manager-operational-card manager-operational-card--delete" aria-busy={props.busy || undefined}><h3>Yêu cầu xoá tài khoản <Badge tone="warn">{deleteRequests.length} chờ duyệt</Badge></h3><p className="xs muted" style={{ margin: "2px 0 8px" }}>Người vận hành tạo yêu cầu; tài khoản chỉ bị xoá sau khi Quản lý duyệt. Mở yêu cầu để xác nhận trước khi đổi dữ liệu.</p><div className="list">{deleteRequests.map((item) => <OperationalRow key={item.id} item={item} action="Duyệt xoá" tone="danger" busy={props.busy} disabled={props.readOnly || props.busy || !props.onOpenOperationalItem} disabledTitle={actionTitle(actionState, props.onOpenOperationalItem)} onClick={props.onOpenOperationalItem ? () => props.onOpenOperationalItem?.("delete", item.id) : undefined} />)}</div></section> : null}
      {trashedAccounts.length ? <section className="card manager-section-card manager-operational-card" aria-busy={props.busy || undefined}><div className="row between"><h3>Tài khoản đã duyệt xoá <Badge>{trashedAccounts.length}</Badge></h3></div><p className="xs muted" style={{ margin: "2px 0 8px" }}>Tài khoản đã xoá và dữ liệu học không đăng nhập được. Khôi phục từng tài khoản, hoặc xoá vĩnh viễn khi chắc chắn không cần đối soát.</p><div className="list">{trashedAccounts.map((item) => {
        const purge = props.onPurgeOperationalItem;
        return <OperationalRow key={item.id} item={{ id: item.id, title: item.name, detail: `Xoá ${formatDateTime(item.deletedAt)}` }} action="Khôi phục" tone="primary" busy={props.busy} disabled={props.readOnly || props.busy || !props.onOpenOperationalItem} disabledTitle={actionTitle(actionState, props.onOpenOperationalItem)} onClick={props.onOpenOperationalItem ? () => props.onOpenOperationalItem?.("trash", item.id) : undefined} {...(purge && !props.readOnly ? { secondaryAction: { label: "Xoá vĩnh viễn", onClick: () => purge(item.id), disabled: Boolean(props.busy), disabledTitle: props.busy ? "Đang xử lý…" : undefined, opensDialog: true } } : {})} />;
      })}</div></section> : null}
    </> : null}
  </>;
}

function OperationalRow({ item, action, tone = "", busy = false, onClick, disabled = false, disabledTitle, secondaryAction }: { item: OperationalRequest; action: string; tone?: "" | "primary" | "danger"; busy?: boolean | undefined; onClick?: (() => void) | undefined; disabled?: boolean; disabledTitle?: string | undefined; secondaryAction?: { label: string; onClick: () => void; disabled?: boolean | undefined; disabledTitle?: string | undefined; opensDialog?: boolean | undefined } | undefined }) {
  const buttonClass = tone === "primary" ? "btn-sm btn-primary" : tone === "danger" ? "btn-sm btn-danger" : "btn-sm";
  const detailId = operationalId(item.id, "detail");
  const stateId = operationalId(item.id, "state");
  const describedBy = [detailId, disabled && disabledTitle ? stateId : undefined].filter(Boolean).join(" ");
  const secondaryDescribedBy = [detailId, secondaryAction?.disabled && secondaryAction.disabledTitle ? stateId : undefined].filter(Boolean).join(" ");
  return <div className="item manager-operational-row"><div className="body"><div className="title">{item.title}{tone === "danger" ? <Badge tone="warn">chờ duyệt</Badge> : tone === "primary" && action === "Đã báo lại" ? <Badge tone="warn">chờ cấp lại</Badge> : null}</div><p id={detailId} className="xs muted">{item.detail}</p>{(disabled && disabledTitle) || (secondaryAction?.disabled && secondaryAction.disabledTitle) ? <span id={stateId} className="sr-only">{disabledTitle || secondaryAction?.disabledTitle}</span> : null}</div><div className="row manager-operational-actions" role="group" aria-label={`Thao tác cho ${item.title}`} aria-busy={busy || undefined}><button className={buttonClass} type="button" onClick={onClick} disabled={disabled} aria-describedby={describedBy || undefined} title={disabled ? disabledTitle : undefined}>{action}</button>{secondaryAction ? <button className="btn-sm btn-danger" type="button" onClick={secondaryAction.onClick} disabled={secondaryAction.disabled} aria-describedby={secondaryDescribedBy || undefined} aria-haspopup={secondaryAction.opensDialog ? "dialog" : undefined} title={secondaryAction.disabled ? secondaryAction.disabledTitle : undefined}>{secondaryAction.label}</button> : null}</div></div>;
}

function operationalId(itemId: string, suffix: "detail" | "state") {
  return `operational-${encodeURIComponent(itemId)}-${suffix}`;
}

function actionTitle({ readOnly, busy }: Pick<ManagerOperationalProps, "readOnly" | "busy">, handler?: unknown) {
  if (readOnly) return "Chế độ chỉ xem: thay đổi do Quản lý thực hiện.";
  if (busy) return "Đang xử lý…";
  if (!handler) return "Tác vụ chưa được kết nối.";
  return undefined;
}

export function PageTitle({ children, actions }: { children: ReactNode; actions?: ReactNode }) {
  return <header className="page-title manager-page-title"><div className="manager-page-title__content">{children}</div>{actions ? <div className="row manager-page-title__actions">{actions}</div> : null}</header>;
}

export function Badge({ children, tone = "" }: { children: ReactNode; tone?: "" | "ok" | "warn" | "danger" | "primary" }) {
  return <span className={`badge ${tone}`}>{children}</span>;
}

export function formatDate(value: string) {
  return new Intl.DateTimeFormat("vi-VN", { day: "2-digit", month: "2-digit", year: "numeric" }).format(new Date(value));
}

export function formatDateTime(value: string) {
  return new Intl.DateTimeFormat("vi-VN", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" }).format(new Date(value));
}

export function percent(value: number, total: number) { return total ? Math.round(value / total * 100) : 0; }

export function copyText(text: string) {
  const writeText = navigator.clipboard?.writeText;
  if (writeText) {
    return Promise.race([
      writeText.call(navigator.clipboard, text),
      new Promise<never>((_, reject) => window.setTimeout(() => reject(new Error("CLIPBOARD_TIMEOUT")), 750))
    ]).catch(() => copyTextFallback(text));
  }
  return copyTextFallback(text);
}

function copyTextFallback(text: string): Promise<void> {
  const textarea = document.createElement("textarea");
  textarea.value = text;
  textarea.setAttribute("readonly", "");
  textarea.style.position = "fixed";
  textarea.style.opacity = "0";
  document.body.appendChild(textarea);
  textarea.select();
  const copied = typeof document.execCommand === "function" && document.execCommand("copy");
  textarea.remove();
  return copied ? Promise.resolve() : Promise.reject(new Error("CLIPBOARD_UNAVAILABLE"));
}

export function downloadText(filename: string, value: string, type: string) {
  const url = URL.createObjectURL(new Blob([value], { type }));
  const anchor = document.createElement("a");
  anchor.href = url; anchor.download = filename; anchor.click(); URL.revokeObjectURL(url);
}
