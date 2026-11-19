import type { CefrLevel, GameKey } from "@e4s/contracts";
import type { ArenaMatch } from "../../../api/arena.js";

export const ARENA_GAMES: readonly GameKey[] = ["scramble", "crossword", "eggs", "mario", "sort", "typing"];

export const ARENA_GAME_NAMES: Record<GameKey, string> = {
  scramble: "Xếp chữ", crossword: "Ô chữ", eggs: "Season catch", mario: "Season-rio", sort: "Phân loại từ", typing: "Đua gõ từ"
};

/** Same one-line descriptions as the Mini game cards, so the arena cards read the same. */
export const ARENA_GAME_DESCRIPTIONS: Record<GameKey, string> = {
  scramble: "Xếp chữ thành từ đúng.", crossword: "Điền từ theo gợi ý.", eggs: "Hứng đúng vật phẩm, giữ 3 mạng.",
  mario: "Vượt cổng, đánh boss từ vựng.", sort: "Xếp từ theo nhóm nghĩa.", typing: "Gõ từ trước khi hết giờ."
};

/** ⓘ next to "Xếp hạng B1": the five rules (DAU-TRUONG-YEU-CAU-GIAO-DIEN, "Popup và chữ cố định"). */
export const ARENA_RULES: readonly string[] = [
  "Thắng thua so điểm ván; bằng điểm thì ai nhanh hơn thắng.",
  "Mỗi trò bắt đầu 1.000 điểm. Thắng người mạnh hơn được nhiều hơn; thua người yếu hơn mất nhiều hơn.",
  "Gặp lại cùng người trong ngày: lần 2 tính 50%, lần 3 tính 25%, từ lần 4 không tính.",
  "Không biết trước đối thủ; đã nhận phải đấu; 24 giờ để chơi; quá hạn tính thua; tối đa 3 trận đang mở.",
  "Mỗi mùa 3 tháng."
];

/** Arena is open from B1. */
export function arenaEligible(level: CefrLevel | null | undefined): boolean {
  return level === "B1" || level === "B2" || level === "C1";
}

export function hoursLeft(iso: string | null, now = Date.now()): number {
  if (!iso) return 0;
  return Math.max(0, Math.ceil((new Date(iso).getTime() - now) / 3_600_000));
}

/** Who moves: a row is "your turn" when the match is in play and you have not played yet. */
export function isMyTurn(match: ArenaMatch): boolean {
  return match.status === "accepted" && !match.me.played;
}

export function isInviteForMe(match: ArenaMatch): boolean {
  return match.mode === "friendly" && match.status === "invited" && !match.postedByMe;
}

export function outcomeTitle(outcome: "win" | "lose" | "draw"): string {
  return outcome === "win" ? "Bạn thắng!" : outcome === "lose" ? "Bạn thua" : "Hoà";
}

/** One short status line (≤ ~30 characters) per "Trận của bạn" row; the mode is an icon on line 1. */
/** The deadline a live row counts down to: accept for open/invited, play for accepted; none otherwise. */
export function matchDeadline(match: ArenaMatch): string | null {
  if (match.status === "open" || match.status === "invited") return match.acceptDeadline;
  if (match.status === "accepted") return match.playDeadline;
  return null;
}

/** The status words of a row without the time left (the live countdown follows it). */
export function matchStatusLabel(match: ArenaMatch): string {
  if (isInviteForMe(match)) return `${match.opponent?.displayName ?? "Bạn học"} mời bạn`;
  if (match.status === "open" || match.status === "invited") return "Chờ người nhận";
  if (match.status === "accepted") return match.me.played ? "Chờ đối thủ" : "Tới lượt bạn";
  return matchStatusLine(match);
}

export function matchStatusLine(match: ArenaMatch, now = Date.now()): string {
  if (isInviteForMe(match)) return `${match.opponent?.displayName ?? "Bạn học"} mời bạn`;
  if (match.status === "open" || match.status === "invited") return `Chờ người nhận · ${hoursLeft(match.acceptDeadline, now)} giờ`;
  if (match.status === "accepted") return match.me.played
    ? `Chờ đối thủ · ${hoursLeft(match.playDeadline, now)} giờ`
    : `Tới lượt bạn · ${hoursLeft(match.playDeadline, now)} giờ`;
  if (match.status === "settled" && match.result) {
    const word = match.result.outcome === "win" ? "Thắng" : match.result.outcome === "lose" ? "Thua" : "Hoà";
    const change = match.result.rating ? ` · ${signed(match.result.rating.change)} điểm` : "";
    return `${word} ${match.me.score ?? 0}–${match.them.score ?? 0}${change}`;
  }
  if (match.status === "declined") return "Đã từ chối";
  if (match.status === "cancelled") return "Đã huỷ";
  return "Hết hạn";
}

export function signed(value: number): string {
  return value > 0 ? `+${value}` : value < 0 ? `−${Math.abs(value)}` : "+0";
}

/** The band label behind the base points of the 5-row table (base = the winner's gain). */
export function bandLabel(base: number | null, outcome: "win" | "lose" | "draw"): string {
  if (base === null || outcome === "draw") return "Ngang sức";
  if (base === 50) return "Ngang sức";
  const winnerWasWeaker = base > 50;
  const opponentStronger = outcome === "win" ? winnerWasWeaker : !winnerWasWeaker;
  return opponentStronger ? "Đối thủ mạnh hơn" : "Đối thủ yếu hơn";
}

export function decidedByLine(match: ArenaMatch): string {
  const result = match.result;
  if (!result) return "";
  const mine = result.outcome === "win";
  if (result.decidedBy === "forfeit") return mine ? "Đối thủ bỏ trận." : "Bạn đã thoát trận.";
  if (result.decidedBy === "timeout") return mine ? "Đối thủ không chơi trong 24 giờ." : "Bạn không chơi trong 24 giờ.";
  if (result.decidedBy === "time") return mine ? "Bằng điểm; bạn nhanh hơn." : "Bằng điểm; đối thủ nhanh hơn.";
  return result.outcome === "draw" ? "Hai bên bằng điểm." : mine ? "Điểm ván của bạn cao hơn." : "Điểm ván của đối thủ cao hơn.";
}

/** The few words behind an unusual result; nothing for a plain score win/loss (the scores say it). */
export function shortReason(match: ArenaMatch): string {
  const result = match.result;
  if (!result) return "";
  const mine = result.outcome === "win";
  if (result.decidedBy === "forfeit") return mine ? "Đối thủ bỏ trận" : "Bạn đã thoát";
  if (result.decidedBy === "timeout") return mine ? "Đối thủ quá hạn" : "Bạn quá hạn";
  if (result.decidedBy === "time") return mine ? "Bằng điểm, bạn nhanh hơn" : "Bằng điểm, chậm hơn";
  return "";
}
