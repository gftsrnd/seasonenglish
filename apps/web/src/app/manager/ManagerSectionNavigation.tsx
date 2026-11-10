import "../shared/request-workspace.css";
import { useId, useRef } from "react";
import { ChevronDown } from "lucide-react";
import { useMediaQuery } from "../shared/useMediaQuery.js";
import { Link, useInRouterContext, useLocation } from "react-router";
import { managerOperationTabs, managerNavigationPath, managerSectionForPath, operatorReadOnlyTabs } from "./navigation.js";

/** Related Manager tools share one primary destination while retaining their URLs. */
export function ManagerSectionNavigation({ readOnly = false }: { readOnly?: boolean } = {}) {
  return useInRouterContext() ? <SectionLinks readOnly={readOnly} /> : null;
}

function SectionLinks({ readOnly }: { readOnly: boolean }) {
  const pathname = managerNavigationPath(useLocation().pathname);
  const section = managerSectionForPath(pathname);
  const compactOperations = useMediaQuery("(max-width: 1180px)");
  const shortLabels = useMediaQuery("(max-width: 540px)");
  const readOnlyId = useId();
  const readOnlyMenu = useRef<HTMLDivElement>(null);
  if (!section?.items.length) return null;
  const renderLink = (item: { to: string; label: string }, shortLabel?: string) => {
    const active = pathname === item.to || (item.to !== "/mgr" && item.to !== "/mgr/ops" && pathname.startsWith(`${item.to}/`));
    return <Link key={item.to} to={item.to} aria-label={shortLabel ? item.label : undefined} aria-current={active ? "page" : undefined} onClick={() => readOnlyMenu.current?.hidePopover?.()}>{shortLabel ?? item.label}</Link>;
  };
  if (section.id === "operations" && compactOperations) return <nav className="request-tabs manager-operation-compact" aria-label="Các mục vận hành">
    {managerOperationTabs.map((item, index) => renderLink(item, shortLabels ? ["Hiệu suất", "Ngày nghỉ"][index] : undefined))}
    <button type="button" className="manager-operation-menu-trigger" popoverTarget={readOnlyId} data-active={readOnly || undefined}>Chỉ xem <ChevronDown size={16} aria-hidden="true" /></button>
    <div ref={readOnlyMenu} id={readOnlyId} className="manager-operation-menu" popover="auto" role="group" aria-label="Màn hình Vận hành chỉ xem">
      {operatorReadOnlyTabs.map((item) => renderLink(item))}
    </div>
  </nav>;
  if (section.id === "operations") return <nav className="manager-operation-tabs" aria-label="Các mục vận hành">
    <div className="request-tabs manager-operation-tabs__group" role="group" aria-label="Công cụ Quản lý">{managerOperationTabs.map((item) => renderLink(item))}</div>
    <div className="request-tabs manager-operation-tabs__group manager-operation-tabs__group--read-only" role="group" aria-label="Màn hình Vận hành chỉ xem">
      {operatorReadOnlyTabs.map((item) => renderLink(item))}
      {readOnly ? <span className="badge">Chỉ xem</span> : null}
    </div>
  </nav>;
  return <nav className="request-tabs manager-tracking-tabs" aria-label={`Các mục ${section.label.toLocaleLowerCase("vi-VN")}`}>
    {section.items.map((item, index) => renderLink(item, shortLabels ? ["Tiến độ", "Nhắc học", "Báo cáo", "Khảo sát"][index] : undefined))}
  </nav>;
}
