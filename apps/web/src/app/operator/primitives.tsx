import type { ButtonHTMLAttributes, ReactNode } from "react";
import { useManagerSectionHeader } from "../manager/shared.js";
import type { Cefr, RubricScore, Suggestion } from "./types.js";
import { formatScoreOutOf } from "../shared/format-score.js";
import { ActionLabel } from "../shared/CompactUi.js";
import { Archive, CheckCheck, Download, Eye, Pencil, RefreshCw, Save, Send, Trash2, UserRound, X } from "lucide-react";

export function OperatorPage({ children, title }: { children: ReactNode; title: string; hideRouteBack?: boolean }) {
  return <div className="app-operator" aria-label={title}>{children}</div>;
}

export function PageTitle({ children, actions }: { children: ReactNode; actions?: ReactNode }) {
  if (useManagerSectionHeader()) return actions ? <div className="page-title">{actions}</div> : null;
  return <div className="page-title"><div>{children}</div>{actions}</div>;
}

/** Actions shown as an icon on phones and tablets (desktop keeps the text). Ambiguous or high-stakes actions are not listed. */
const COMPACT_ACTION_ICONS: Record<string, typeof Eye> = {
  "Xem": Eye,
  "Xem bài làm": Eye,
  "Hồ sơ": UserRound,
  "Xoá": Trash2,
  "Xóa": Trash2,
  "Xoá học viên": Trash2,
  "Sửa": Pencil,
  "Sửa đề": Pencil,
  "Sửa tay": Pencil,
  "Đóng": X,
  "Lưu": Save,
  "Tải xuống": Download,
  "Xuất CSV": Download,
  "Làm mới": RefreshCw,
  "Lưu trữ": Archive,
  "Gửi": Send,
  "Đánh dấu đã kiểm": CheckCheck,
  "Đã kiểm": CheckCheck
};

export function Button({ small, primary, danger, busy = false, className = "", children, disabled, ...props }: ButtonHTMLAttributes<HTMLButtonElement> & { small?: boolean; primary?: boolean; danger?: boolean; busy?: boolean }) {
  const classes = [small && "btn-sm", primary && "btn-primary", danger && "btn-danger", className].filter(Boolean).join(" ");
  const isDisabled = Boolean(disabled || busy);
  const { title, ...buttonProps } = props;
  // Phones/tablets: well-known actions ("Xem", "Hồ sơ", "Xoá"…) become icon buttons; the label stays as name and tooltip.
  const icon = typeof children === "string" ? COMPACT_ACTION_ICONS[children] : undefined;
  return <button {...buttonProps} {...(!isDisabled && title ? { title } : {})} className={classes} disabled={isDisabled} aria-busy={busy ? "true" : undefined}>{busy && <span className="spinner" aria-hidden="true" />}{icon && typeof children === "string" ? <ActionLabel icon={icon} label={children} /> : children}</button>;
}

export function Badge({ children, tone = "", className = "" }: { children: ReactNode; tone?: "" | "ok" | "warn" | "danger" | "primary"; className?: string }) {
  return <span className={`badge ${tone} ${className}`.trim()}>{children}</span>;
}

export function LevelChip({ level }: { level: Cefr }) {
  return <span className={`badge lvl lvl-${level}`}>{level}</span>;
}

export function Empty({ children }: { children: ReactNode }) {
  return <div className="empty">{children}</div>;
}

export function Banner({ tone, icon, children }: { tone: "warn" | "info" | "ok" | "danger"; icon?: ReactNode; children: ReactNode }) {
  return <div className={`banner ${tone}`} role={tone === "danger" ? "alert" : "note"}>{icon && <span className="operator-banner-icon" aria-hidden="true">{icon}</span>}<div className="body">{children}</div></div>;
}

export function Rubric({ value }: { value: RubricScore | null | undefined }) {
  if (!value) return null;
  return <span className="chips"><span className="chip">Ý: {formatScoreOutOf(value.meaning, 5)}</span><span className="chip">Từ: {formatScoreOutOf(value.vocab, 5)}</span><span className="chip">NP: {formatScoreOutOf(value.grammar, 5)}</span></span>;
}

export function Suggestions({ items = [] }: { items: Suggestion[] | undefined }) {
  if (!items.length) return null;
  return <ul className="sugg">{items.map((item, index) => <li key={`${item.original}-${index}`}><s className="muted">{item.original}</s> → <b>{item.corrected}</b> <span className="muted">– {item.explanation}</span></li>)}</ul>;
}
