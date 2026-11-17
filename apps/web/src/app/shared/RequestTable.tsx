import { Fragment, type ReactNode } from "react";
import "./request-workspace.css";

type RequestRow = {
  id: string;
  kind: string;
  content: ReactNode;
  status: ReactNode;
  date: string;
  action?: ReactNode;
  detail?: ReactNode;
  detailInActionColumn?: boolean;
};

const requestTime = new Intl.DateTimeFormat("vi-VN", { dateStyle: "short", timeStyle: "short", timeZone: "Asia/Ho_Chi_Minh" });

export function RequestDate({ date }: { date: string }) {
  return <time dateTime={date}>{requestTime.format(new Date(date))}</time>;
}

export function RequestTable({ label, rows, empty }: {
  label: string;
  rows: RequestRow[];
  empty: ReactNode;
}) {
  return <div className="request-table" role="region" aria-label={label} tabIndex={rows.length ? 0 : undefined}>
    <table role="table" aria-label={label}>
      <thead><tr><th scope="col">Loại</th><th scope="col">Nội dung</th><th scope="col">Trạng thái</th><th scope="col">Ngày gửi</th><th scope="col">Thao tác</th></tr></thead>
      <tbody>{rows.length ? rows.map(row => <Fragment key={row.id}><tr className="request-record" role="row" id={row.id}>
        <td role="cell" className="request-kind">{row.kind}</td>
        <td role="cell" className="request-content">{row.content}</td>
        <td role="cell" className="request-state">{row.status}</td>
        <td role="cell" className="request-date"><RequestDate date={row.date} /></td>
        <td role="cell" className="request-commands" data-empty={row.action == null || undefined}>{row.action == null ? null : <div className="row request-actions">{row.action}</div>}</td>
      </tr>{row.detail ? <tr className="request-expanded-row" role="row">
        {row.detailInActionColumn ? <td className="request-expanded-spacer" colSpan={4} aria-hidden="true" /> : null}
        <td role="cell" colSpan={row.detailInActionColumn ? undefined : 5}>{row.detail}</td>
      </tr> : null}</Fragment>) : <tr><td className="muted" colSpan={5}>{empty}</td></tr>}</tbody>
    </table>
  </div>;
}
