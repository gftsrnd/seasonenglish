import type { ButtonHTMLAttributes, ReactNode } from "react";
import { Link, useInRouterContext, useLocation } from "react-router";
import type { Cefr, RubricScore, Suggestion } from "./types.js";

export function OperatorPage({ children, title, hideRouteBack = false }: { children: ReactNode; title: string; hideRouteBack?: boolean }) {
  const inRouter = useInRouterContext();
  if (!inRouter) {
    return <div className="app-operator" aria-label={title}>{children}</div>;
  }
  return <OperatorPageWithNavigation title={title} hideRouteBack={hideRouteBack}>{children}</OperatorPageWithNavigation>;
}

function OperatorPageWithNavigation({ children, title, hideRouteBack }: { children: ReactNode; title: string; hideRouteBack: boolean }) {
  const location = useLocation();
  const managerOperations = location.pathname.startsWith("/mgr/ops/");
  const rootPath = managerOperations ? "/mgr/ops" : "/op";
  const rootLabel = managerOperations ? "Hiệu suất vận hành" : "Vận hành";
  const isRoot = location.pathname === rootPath;
  return <div className="app-operator" aria-label={title}>
    {!isRoot && !hideRouteBack && <nav className="operator-route-back" aria-label="Điều hướng vận hành">
      <Link className="operator-route-back__link" to={rootPath}>← {rootLabel}</Link>
    </nav>}
    {children}
  </div>;
}

export function PageTitle({ children, actions }: { children: ReactNode; actions?: ReactNode }) {
  return <div className="page-title"><div>{children}</div>{actions}</div>;
}

export function Button({ small, primary, danger, busy = false, className = "", children, disabled, ...props }: ButtonHTMLAttributes<HTMLButtonElement> & { small?: boolean; primary?: boolean; danger?: boolean; busy?: boolean }) {
  const classes = [small && "btn-sm", primary && "btn-primary", danger && "btn-danger", className].filter(Boolean).join(" ");
  const isDisabled = Boolean(disabled || busy);
  const { title, ...buttonProps } = props;
  return <button {...buttonProps} {...(!isDisabled && title ? { title } : {})} className={classes} disabled={isDisabled} aria-busy={busy ? "true" : undefined}>{busy && <span className="spinner" aria-hidden="true" />}{children}</button>;
}

export function Badge({ children, tone = "" }: { children: ReactNode; tone?: "" | "ok" | "warn" | "danger" | "primary" }) {
  return <span className={`badge ${tone}`.trim()}>{children}</span>;
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
  return <span className="chips"><span className="chip">Ý: {value.meaning}/5</span><span className="chip">Từ: {value.vocab}/5</span><span className="chip">NP: {value.grammar}/5</span></span>;
}

export function Suggestions({ items = [] }: { items: Suggestion[] | undefined }) {
  if (!items.length) return null;
  return <ul className="sugg">{items.map((item, index) => <li key={`${item.original}-${index}`}><s className="muted">{item.original}</s> → <b>{item.corrected}</b> <span className="muted">– {item.explanation}</span></li>)}</ul>;
}
