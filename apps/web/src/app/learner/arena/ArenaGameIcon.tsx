import type { GameKey } from "@e4s/contracts";
import { ArrowLeftRight, Grid3X3, Keyboard, ShoppingBasket, Shuffle, Sun, type LucideIcon } from "lucide-react";

/** Same per-game icons as the Mini game cards. */
const ICONS: Record<GameKey, LucideIcon> = { scramble: Shuffle, crossword: Grid3X3, eggs: ShoppingBasket, mario: Sun, sort: ArrowLeftRight, typing: Keyboard };

export function ArenaGameIcon({ game, size = 18 }: { game: GameKey; size?: number }) {
  const Icon = ICONS[game];
  return <Icon className="arena-game-icon" size={size} strokeWidth={2} aria-hidden="true" />;
}
