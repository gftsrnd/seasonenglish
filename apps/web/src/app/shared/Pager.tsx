import { Fragment, useState, type ReactNode } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { useMediaQuery } from "./useMediaQuery.js";

/** Rows per page on phones. */
export const PHONE_PAGE_SIZE = 3;
/** Rows per page on tablets (medium pages: never fewer than 6 rows). */
export const TABLET_PAGE_SIZE = 7;
const TABLET_MIN_PAGE_SIZE = 6;

/**
 * Long lists on phones and tablets are paged (3 rows per page on a phone,
 * 6–8 on a tablet) so the page keeps a fixed height; desktop (> 1024px) always
 * shows every row, exactly as before.
 */
export function usePaged<T>(items: readonly T[], { phone = PHONE_PAGE_SIZE, tablet = TABLET_PAGE_SIZE }: { phone?: number; tablet?: number } = {}) {
  const isPhone = useMediaQuery("(max-width: 600px)");
  const isTablet = useMediaQuery("(max-width: 1024px)");
  const [requested, setPage] = useState(1);
  const size = isPhone ? phone : isTablet ? Math.max(TABLET_MIN_PAGE_SIZE, tablet) : Infinity;
  const pages = Number.isFinite(size) ? Math.max(1, Math.ceil(items.length / size)) : 1;
  const page = Math.min(Math.max(1, requested), pages);
  const offset = pages > 1 ? (page - 1) * size : 0;
  const visible = pages > 1 ? items.slice(offset, offset + size) : items;
  return { visible, page, pages, setPage, offset };
}

/** Compact pager: ‹ Trang 2/9 ›. Renders nothing when everything fits on one page. */
export function Pager({ page, pages, setPage, label }: { page: number; pages: number; setPage: (page: number) => void; label?: string; offset?: number; visible?: unknown }) {
  if (pages <= 1) return null;
  const what = label ? ` ${label}` : "";
  return <nav className="list-pager" aria-label={`Trang danh sách${what}`}>
    <button type="button" className="btn-sm btn-ghost list-pager-step" aria-label={`Trang trước${what}`} disabled={page <= 1} onClick={() => setPage(page - 1)}><ChevronLeft size={16} aria-hidden="true" /></button>
    <span className="list-pager-status" aria-live="polite">Trang {page}/{pages}</span>
    <button type="button" className="btn-sm btn-ghost list-pager-step" aria-label={`Trang sau${what}`} disabled={page >= pages} onClick={() => setPage(page + 1)}><ChevronRight size={16} aria-hidden="true" /></button>
  </nav>;
}

/** Paged rows for use inside `.map()` where a hook cannot run. */
export function PagedList<T>({ items, children, label, phone, tablet }: { items: readonly T[]; children: (item: T, index: number) => ReactNode; label?: string; phone?: number; tablet?: number }) {
  const paged = usePaged(items, { ...(phone ? { phone } : {}), ...(tablet ? { tablet } : {}) });
  return <>{paged.visible.map((item, index) => <Fragment key={index}>{children(item, index)}</Fragment>)}<Pager {...paged} {...(label ? { label } : {})} /></>;
}

/** Render-prop variant: `children` receives the rows of the current page (e.g. a table body). */
export function Paged<T>({ items, children, label, phone, tablet }: { items: readonly T[]; children: (visible: readonly T[], offset: number) => ReactNode; label?: string; phone?: number; tablet?: number }) {
  const paged = usePaged(items, { ...(phone ? { phone } : {}), ...(tablet ? { tablet } : {}) });
  return <>{children(paged.visible, paged.offset)}<Pager {...paged} {...(label ? { label } : {})} /></>;
}
