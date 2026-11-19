import type { ReactNode } from "react";
import { ArrowLeft } from "lucide-react";
import "./page-back-link.css";

/**
 * The page's "back to …" button (owner 19/11: one look everywhere). Desktop/tablet: "← Về …";
 * phones: the ← square only, on the title row, with the label kept for screen readers and the tooltip.
 */
export function PageBackContent({ label }: { label: string }): ReactNode {
  return <><ArrowLeft size={16} aria-hidden="true" /><span className="page-back-label">{label}</span></>;
}
