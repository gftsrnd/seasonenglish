import type { CefrLevel } from "@e4s/contracts";
import { ChevronRight, Lock, Swords } from "lucide-react";
import { seasonAssetUrl, useGameSeason } from "../../games/seven-season-art.js";
import { AppLink } from "../ui.js";
import { arenaEligible, isInviteForMe, isMyTurn } from "./arena-text.js";
import type { ArenaHome, ArenaMatch } from "../../../api/arena.js";
import "./arena.css";

export { arenaEligible };

/** "Trận của bạn": at most 3 live rows (invites to me, my turn, waiting), then the latest results. Withdrawn, expired and declined matches drop out. */
export function myMatchRows(home: ArenaHome): ArenaMatch[] {
  const live = [...home.matches.open, ...home.matches.active];
  const rank = (match: ArenaMatch) => isInviteForMe(match) ? 0 : isMyTurn(match) ? 1 : 2;
  const ordered = [...live].sort((a, b) => rank(a) - rank(b));
  const results = home.matches.done.filter((match) => match.status === "settled" && match.result);
  return [...ordered, ...results].slice(0, 3);
}

/** Background of the arena card and banner: the season colours plus the current season's scenery (no character). */
export function useArenaSceneStyle() {
  const season = useGameSeason();
  return { backgroundImage: `url(${seasonAssetUrl(season, "background")})` };
}

/**
 * Mini game › last card "Đấu trường B1" (owner, 19/11): one card under the game picker, in the season
 * colours with the season scenery. B1+ → the whole card opens /arena; below B1 → the same card, muted,
 * says the arena opens from B1.
 */
export function ArenaEntryCard({ level, navigate }: { level: CefrLevel | null | undefined; navigate: (path: string) => void }) {
  const scene = useArenaSceneStyle();
  const open = arenaEligible(level);
  const body = <>
    <span className="arena-entry__icon" aria-hidden="true">{open ? <Swords size={22} strokeWidth={2} /> : <Lock size={20} strokeWidth={2} />}</span>
    <span className="arena-entry__text">
      <b>Đấu trường{open && level ? ` ${level}` : ""}</b>
      <small>{open ? "Thách đấu và bảng xếp hạng" : `Mở từ B1. Bạn đang ở mức ${level ?? "—"}.`}</small>
    </span>
    <span className="arena-entry__scene" style={scene} aria-hidden="true" />
    {open ? <ChevronRight className="arena-entry__chevron" size={20} aria-hidden="true" /> : null}
  </>;
  return open
    ? <AppLink className="arena-entry" href="/arena" navigate={navigate} ariaLabel={`Vào Đấu trường ${level ?? ""}`.trim()}>{body}</AppLink>
    : <div className="arena-entry is-locked" role="note">{body}</div>;
}
