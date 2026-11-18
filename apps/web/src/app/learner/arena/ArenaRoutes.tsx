import { useNavigate } from "react-router";
import { useToast } from "../../shared/design-system.js";
import { ArenaLeaderboard } from "./ArenaLeaderboard.js";
import { ArenaMatchScreen } from "./ArenaMatchScreen.js";

/** `/arena` → Bảng xếp hạng; `/arena/match/:id` → the game in arena mode. Null for any other path. */
export function arenaRouteMatch(path: string): { screen: "board" } | { screen: "match"; id: string } | null {
  if (path === "/arena") return { screen: "board" };
  const found = /^\/arena\/match\/([0-9a-fA-F-]{36})$/u.exec(path);
  return found ? { screen: "match", id: found[1]! } : null;
}

export function ArenaRoute({ path, learnerId }: { path: string; learnerId?: string | undefined }) {
  const navigate = useNavigate();
  const toast = useToast();
  const notify = (message: string) => toast.show({ message, tone: "info", variant: "learner", durationMs: 3_500 });
  const route = arenaRouteMatch(path);
  if (!route) return null;
  return route.screen === "board"
    ? <ArenaLeaderboard navigate={navigate} notify={notify} learnerId={learnerId} />
    : <ArenaMatchScreen key={route.id} matchId={route.id} navigate={navigate} notify={notify} />;
}
