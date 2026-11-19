import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router";
import type { InboxNotificationView } from "@e4s/contracts";
import { getNotificationInbox, markInboxRead } from "../../api/notifications.js";
import { hasAssessmentLogoutGuard } from "./assessment-logout-guard.js";
import { ModalCloseButton } from "./CompactUi.js";
import { RewardBadgeImage } from "./RewardIcon.js";
import { rewardBadgeKeyForLabel } from "./reward-badge-icons.js";
import "./badge-celebration.css";

const CELEBRATED_KEY = "e4s:badge-celebrated";
const POLL_MS = 45_000;
/** Older unread badges stay in the bell only; the popup celebrates recent ones. */
const RECENT_MS = 14 * 24 * 60 * 60 * 1000;

function celebrated(): string[] {
  try { return (JSON.parse(window.localStorage.getItem(CELEBRATED_KEY) ?? "[]") as unknown[]).filter((id): id is string => typeof id === "string"); } catch { return []; }
}
function remember(ids: readonly string[]) {
  try { window.localStorage.setItem(CELEBRATED_KEY, JSON.stringify([...new Set([...celebrated(), ...ids])].slice(-200))); } catch { /* may pop again next visit */ }
}

/**
 * Chúc mừng huy hiệu (owner 19/11): a new badge opens a celebration popup, not only a bell item.
 * Unread `badge_earned` notifications from the last 14 days that this browser has not celebrated yet;
 * several at once are shown together. Closing marks them read so the bell does not repeat them.
 * Never over a running test or another popup.
 */
export function BadgeCelebration() {
  const navigate = useNavigate();
  const [badges, setBadges] = useState<InboxNotificationView[]>([]);
  const open = badges.length > 0;
  const openRef = useRef(open);
  openRef.current = open;

  const check = useCallback(async (signal?: AbortSignal) => {
    if (openRef.current || hasAssessmentLogoutGuard() || document.body.classList.contains("app-modal-open")) return;
    try {
      const inbox = await getNotificationInbox(20, true, undefined, signal);
      const seen = new Set(celebrated());
      const fresh = inbox.items.filter((item) => item.kind === "badge_earned" && !item.readAt && !seen.has(item.id)
        && Date.now() - Date.parse(item.createdAt) < RECENT_MS);
      if (fresh.length && !signal?.aborted && !openRef.current) setBadges(fresh);
    } catch { /* the bell still shows it */ }
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    void check(controller.signal);
    const timer = window.setInterval(() => void check(controller.signal), POLL_MS);
    const onFocus = () => void check(controller.signal);
    window.addEventListener("focus", onFocus);
    return () => { controller.abort(); window.clearInterval(timer); window.removeEventListener("focus", onFocus); };
  }, [check]);

  const close = (goToProfile: boolean) => {
    const ids = badges.map((item) => item.id);
    remember(ids);
    setBadges([]);
    void markInboxRead({ ids }).catch(() => undefined);
    if (goToProfile) void navigate("/profile");
  };

  if (!open) return null;
  const [first, ...more] = badges;
  const label = first!.context ?? "mới";
  return <div className="modal-backdrop badge-celebration-backdrop" role="presentation" onClick={(event) => { if (event.target === event.currentTarget) close(false); }}>
    <section className="dialog badge-celebration" role="dialog" aria-modal="true" aria-labelledby="badge-celebration-title">
      <div className="badge-celebration__close"><ModalCloseButton iconOnly label="Đóng" onClick={() => close(false)} /></div>
      <div className="badge-celebration__burst" aria-hidden="true">{Array.from({ length: 12 }, (_, index) => <i key={index} style={{ ["--i" as string]: index }} />)}</div>
      <div className="badge-celebration__medal" aria-hidden="true" data-badge={first!.context ? rewardBadgeKeyForLabel(first!.context) ?? "other" : "other"}><RewardBadgeImage label={first!.context} size={78} className="badge-celebration__img" /></div>
      {/* Owner 19/11: the title stays on one line – the lead-in is the small line, the badge name is the title. */}
      <p className="badge-celebration__eyebrow">Chúc mừng! Bạn vừa nhận huy hiệu</p>
      <h2 id="badge-celebration-title" aria-label={`Bạn vừa nhận huy hiệu ${label}`}>{label}</h2>
      {more.length ? <p className="badge-celebration__more">Cùng {more.length} huy hiệu khác: {more.map((item, index) => <span className="badge-celebration__more-item" key={item.id}>{index ? ", " : ""}<RewardBadgeImage label={item.context} size={18} />{item.context}</span>)}</p> : null}
      <p className="small muted">Huy hiệu được giữ mãi, kể cả khi đổi trình độ.</p>
      <div className="badge-celebration__actions">
        <button type="button" className="btn" onClick={() => close(true)}>Xem huy hiệu</button>
        <button type="button" className="btn-primary" onClick={() => close(false)} autoFocus>Tiếp tục học</button>
      </div>
    </section>
  </div>;
}
