import type { ReactNode } from "react";
import type { GameKey, GameWordSetView } from "@e4s/contracts";
import { Swords, Trophy } from "lucide-react";
import type { ArenaApiClient, ArenaSetKind } from "../../../api/arena.js";
import { useToast } from "../../shared/design-system.js";
import { AppLink } from "../ui.js";
import { ARENA_GAME_NAMES, arenaEligible } from "./arena-text.js";
import { useArenaQuickMatch } from "./useArenaQuickMatch.js";
import "./arena.css";

export { arenaEligible };

/** The hub's active set as the arena names it: the learner's own topic set, else the curriculum set. */
export function hubSetKind(wordSet: GameWordSetView | null | undefined): ArenaSetKind {
  return wordSet?.source === "custom" ? "personal" : "curriculum";
}

/** A Mini game card plus its "Đấu" button (B1+ only; the caller renders the plain card otherwise). */
export function ArenaGameSlot({ game, setKind, navigate, children, client }: {
  game: GameKey;
  setKind: ArenaSetKind;
  navigate: (path: string) => void;
  children: ReactNode;
  client?: Pick<ArenaApiClient, "quickMatch">;
}) {
  const toast = useToast();
  const quick = useArenaQuickMatch({ navigate, notify: (message) => toast.show({ message, tone: "info", variant: "learner", durationMs: 3_500 }), ...(client ? { client } : {}) });
  const busy = quick.busyGame === game;
  return <div className="arena-game-slot">
    {children}
    <button className="btn btn-sm arena-duel-button" type="button" disabled={busy} aria-busy={busy || undefined} aria-label={`Đấu ${ARENA_GAME_NAMES[game]}`} title="Đấu xếp hạng" onClick={() => void quick.start(game, setKind)}><Swords size={14} aria-hidden="true" /><span className="arena-duel-label">{busy ? "…" : "Đấu"}</span></button>
  </div>;
}

export function ArenaBoardLink({ navigate }: { navigate: (path: string) => void }) {
  return <AppLink className="btn btn-sm arena-board-link" href="/arena" navigate={navigate}><Trophy size={15} aria-hidden="true" />Bảng xếp hạng</AppLink>;
}
