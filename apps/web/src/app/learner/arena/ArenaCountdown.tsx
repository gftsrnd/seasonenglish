import { useEffect, useState } from "react";

/** Live "HH:MM:SS" until a deadline, ticking every second; "Hết giờ" once it passes (owner, 19/11). */
export function ArenaCountdown({ until, prefix = "còn" }: { until: string | null | undefined; prefix?: string }) {
  const deadline = until ? Date.parse(until) : NaN;
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!Number.isFinite(deadline) || deadline <= Date.now()) return;
    const tick = window.setInterval(() => {
      const time = Date.now();
      setNow(time);
      if (time >= deadline) window.clearInterval(tick);
    }, 1000);
    return () => window.clearInterval(tick);
  }, [deadline]);
  if (!Number.isFinite(deadline)) return null;
  const seconds = Math.max(0, Math.ceil((deadline - now) / 1000));
  if (seconds === 0) return <span className="arena-countdown is-over" role="timer">Hết giờ</span>;
  const clock = [Math.floor(seconds / 3600), Math.floor(seconds / 60) % 60, seconds % 60].map((part) => String(part).padStart(2, "0")).join(":");
  return <span className="arena-countdown" role="timer" aria-label={`Còn ${clock}`}>{prefix} <b>{clock}</b></span>;
}
