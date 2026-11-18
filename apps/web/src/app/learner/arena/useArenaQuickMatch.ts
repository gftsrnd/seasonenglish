import { useState } from "react";
import type { GameKey } from "@e4s/contracts";
import { arenaApiClient, type ArenaApiClient, type ArenaSetKind } from "../../../api/arena.js";

const QUICK_MATCH_ERRORS: Record<string, string> = {
  ARENA_OPEN_LIMIT: "Bạn đã có 3 trận xếp hạng đang mở.",
  ARENA_NOT_ENOUGH_WORDS: "Bộ từ chưa đủ từ để đấu.",
  ARENA_SET_NOT_FOUND: "Hãy chọn bộ từ ở Mini game trước khi đấu.",
  ARENA_SEASON_NOT_STARTED: "Mùa xếp hạng chưa bắt đầu.",
  ARENA_LEVEL_REQUIRED: "Đấu trường mở từ B1."
};

export function arenaErrorMessage(reason: unknown, fallback = "Chưa vào được trận. Vui lòng thử lại."): string {
  const code = reason instanceof Error ? reason.message : "";
  return QUICK_MATCH_ERRORS[code] ?? fallback;
}

/** "Đấu" / "Đấu tiếp": join the oldest open challenge or post one, then open the match screen. */
export function useArenaQuickMatch({ navigate, notify, client = arenaApiClient }: {
  navigate: (path: string) => void;
  notify: (message: string) => void;
  client?: Pick<ArenaApiClient, "quickMatch">;
}) {
  const [busyGame, setBusyGame] = useState<GameKey | null>(null);
  const start = async (game: GameKey, setKind?: ArenaSetKind) => {
    if (busyGame) return;
    setBusyGame(game);
    try {
      const { match } = await client.quickMatch({ requestId: crypto.randomUUID(), game, ...(setKind ? { setKind } : {}) });
      navigate(`/arena/match/${match.id}`);
    } catch (reason) {
      notify(arenaErrorMessage(reason));
    } finally {
      setBusyGame(null);
    }
  };
  return { busyGame, start };
}
