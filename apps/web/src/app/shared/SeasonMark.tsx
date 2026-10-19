import { currentSeasonTheme } from "../games/season-visual.js";

/** Existing Season English brand mark. Kept unchanged by the artwork cleanup. */
export function SeasonMark({ className }: { className?: string }) {
  const theme = currentSeasonTheme();
  const shared = { className: `season-mark ${className ?? ""}`.trim(), "data-testid": "season-mark", viewBox: "0 0 32 32", "aria-hidden": true } as const;
  // media-scan: allow-brand -- existing product branding, not content artwork
  if (theme === "summer") return <svg {...shared}><g stroke="var(--accent)" strokeWidth="2.6" strokeLinecap="round"><path d="M16 2.5v3.5M16 26v3.5M2.5 16H6M26 16h3.5M6.5 6.5l2.4 2.4M23.1 23.1l2.4 2.4M6.5 25.5l2.4-2.4M23.1 8.9l2.4-2.4" /></g><circle cx="16" cy="16" r="7.5" fill="var(--accent)" /></svg>;
  // media-scan: allow-brand -- existing product branding, not content artwork
  if (theme === "spring") return <svg {...shared}><g fill="var(--accent)"><circle cx="16" cy="7.5" r="4.6" /><circle cx="24.1" cy="13.4" r="4.6" /><circle cx="21" cy="22.9" r="4.6" /><circle cx="11" cy="22.9" r="4.6" /><circle cx="7.9" cy="13.4" r="4.6" /></g><circle cx="16" cy="16" r="3.6" fill="var(--primary)" /></svg>;
  // media-scan: allow-brand -- existing product branding, not content artwork
  if (theme === "autumn") return <svg {...shared}><path d="M6 26C6 13 14 6 27 6c0 13-7 21-21 20z" fill="var(--primary)" /><path d="M6 26c4-7 9-12 15-16" fill="none" stroke="var(--accent)" strokeWidth="2.2" strokeLinecap="round" /></svg>;
  // media-scan: allow-brand -- existing product branding, not content artwork
  if (theme === "winter") return <svg {...shared}><g fill="none" stroke="var(--accent)" strokeWidth="2.4" strokeLinecap="round"><path d="M16 3v26M4.7 9.5l22.6 13M4.7 22.5l22.6-13" /><path d="M16 3l-3 3M16 3l3 3M16 29l-3-3M16 29l3-3M4.7 9.5l4 1M4.7 9.5l1-4M27.3 22.5l-4-1M27.3 22.5l-1 4M4.7 22.5l1 4M4.7 22.5l4-1M27.3 9.5l-1-4M27.3 9.5l-4 1" /></g></svg>;
  // media-scan: allow-brand -- existing product branding, not content artwork
  if (theme === "tet") return <svg {...shared}><path d="M16 4.5c2.6 0 4.2 2.4 3.4 5.2 2.9-.3 4.9 1.8 4.1 4.3 2.5 1.4 2.5 4.4 0 5.8.8 2.5-1.2 4.6-4.1 4.3.8 2.8-.8 5.2-3.4 5.2s-4.2-2.4-3.4-5.2c-2.9.3-4.9-1.8-4.1-4.3-2.5-1.4-2.5-4.4 0-5.8-.8-2.5 1.2-4.6 4.1-4.3-.8-2.8.8-5.2 3.4-5.2z" fill="var(--primary)" stroke="var(--accent)" strokeWidth="1.2" /><circle cx="16" cy="16" r="3.2" fill="var(--accent)" /></svg>;
  // media-scan: allow-brand -- existing product branding, not content artwork
  if (theme === "midautumn") return <svg {...shared}><path d="M16 3v3" stroke="var(--accent)" strokeWidth="2.2" strokeLinecap="round" /><rect x="11" y="6" width="10" height="3" rx="1.5" fill="var(--accent)" /><path d="M8 11c0-1.7 3.6-2.5 8-2.5s8 .8 8 2.5v9c0 1.7-3.6 2.5-8 2.5s-8-.8-8-2.5z" fill="var(--primary)" /><path d="M12.5 9v13.5M19.5 9v13.5" stroke="var(--accent)" strokeWidth="1.4" opacity=".6" /><rect x="11" y="22" width="10" height="3" rx="1.5" fill="var(--accent)" /><path d="M14 25v4M18 25v4" stroke="var(--accent)" strokeWidth="1.8" strokeLinecap="round" /></svg>;
  // media-scan: allow-brand -- existing product branding, not content artwork
  return <svg {...shared}><path d="M16 3l3.6 7.6 8.3 1-6.1 5.7 1.6 8.2L16 21.4l-7.4 4.1 1.6-8.2-6.1-5.7 8.3-1z" fill="var(--primary)" stroke="var(--accent)" strokeWidth="1.6" strokeLinejoin="round" /></svg>;
}
