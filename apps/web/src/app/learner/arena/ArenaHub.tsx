import type { CefrLevel } from "@e4s/contracts";
import { ChevronRight, Swords } from "lucide-react";
import { AppLink } from "../ui.js";
import { arenaEligible } from "./arena-text.js";
import "./arena.css";

export { arenaEligible };

/**
 * Mini game › "Đấu trường": its own card under the personal game picker (owner, 19/11). The arena is
 * a separate place, never mixed into the personal Mini game cards. B1+ → the whole card opens
 * `/arena`; below B1 → the same card, muted, says the arena opens from B1.
 */
export function ArenaEntryCard({ level, navigate }: { level: CefrLevel | null | undefined; navigate: (path: string) => void }) {
  const head = <>
    <span className="game-icon arena-entry-card__icon" aria-hidden="true"><Swords size={22} strokeWidth={2} /></span>
    <span className="arena-entry-card__text">
      <h2 id="arena-entry-title">Đấu trường</h2>
      <span className="small muted">{arenaEligible(level) ? "Đấu xếp hạng với bạn cùng cấp." : `Mở từ B1. Bạn đang ở mức ${level ?? "—"}.`}</span>
    </span>
  </>;
  return arenaEligible(level)
    ? <section className="card games-section-card arena-entry-card" aria-labelledby="arena-entry-title">
      <AppLink className="arena-entry-card__link" href="/arena" navigate={navigate} ariaLabel="Vào đấu trường">{head}<ChevronRight className="arena-list__chevron" size={20} aria-hidden="true" /></AppLink>
    </section>
    : <section className="card games-section-card arena-entry-card is-locked" aria-labelledby="arena-entry-title">
      <div className="arena-entry-card__link">{head}</div>
    </section>;
}
