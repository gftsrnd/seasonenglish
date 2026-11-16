import "./brand-mark.css";

/** Accessible name for every place the E4S logo stands in for the product name. */
export const BRAND_NAME = "E4S – English for Every Season";

export type BrandMarkVariant = "icon" | "wordmark";

/**
 * The owner-approved E4S logo. The artwork lives in /public/brand as static SVG
 * files (glyphs already converted to outlines) and never follows the seasonal
 * theme. `tone="on-dark"` swaps the wordmark's "e" and "s" to white for dark
 * surfaces; the icon is a dark tile and works on any background.
 */
export function BrandMark({ variant, tone = "on-light", className, label }: {
  variant: BrandMarkVariant;
  tone?: "on-light" | "on-dark";
  className?: string;
  /** Omit when the surrounding link or heading already carries the brand name. */
  label?: string;
}) {
  const src = variant === "icon" ? "/brand/e4s-icon.svg" : tone === "on-dark" ? "/brand/e4s-wordmark-on-dark.svg" : "/brand/e4s-wordmark.svg";
  return <img
    className={`brand-mark brand-mark--${variant} ${className ?? ""}`.trim()}
    data-testid={`brand-mark-${variant}`}
    src={src}
    alt={label ?? ""}
    aria-hidden={label ? undefined : true}
    draggable={false}
    decoding="async"
  />;
}

/**
 * Top-bar brand: the icon alone on phone widths, the wordmark alone from tablet
 * up. Both are rendered and CSS shows exactly one of them.
 */
export function ResponsiveBrandMark({ tone = "on-light" }: { tone?: "on-light" | "on-dark" }) {
  return <>
    <BrandMark variant="icon" className="brand-mark--phone-only" />
    <BrandMark variant="wordmark" tone={tone} className="brand-mark--tablet-up" />
  </>;
}
