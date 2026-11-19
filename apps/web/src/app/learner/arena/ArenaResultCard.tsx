import type { ReactNode } from "react";
import { Bell, Swords, Trophy } from "lucide-react";
import type { RoundUnitOutcome } from "@e4s/domain/engagement";
import type { ArenaMatch } from "../../../api/arena.js";
import { RoundBreakdown } from "../../games/RoundBreakdown.js";
import { ARENA_GAME_NAMES, bandLabel, outcomeTitle, shortReason, signed } from "./arena-text.js";

/**
 * The arena result is the solo Mini game result card (`.game-result`, same icon, score box and
 * actions). Settled: title = outcome, ONE line "Lan Anh 64 · +75 điểm xếp hạng", and a muted
 * second line ≤ 40 characters ("Đối thủ mạnh hơn · lần gặp 1"). Actions: ONE primary "Đấu tiếp"
 * plus an optional text link ("Về bảng xếp hạng").
 */
export function ArenaResultCard({ match, onAgain, againBusy = false, link, outcomes }: {
  match: ArenaMatch;
  /** Per-question outcomes of the round the learner just played (shown right after play only). */
  outcomes?: readonly RoundUnitOutcome[] | null | undefined;
  onAgain?: (() => void) | undefined;
  againBusy?: boolean;
  link?: ReactNode;
}) {
  const result = match.status === "settled" ? match.result : null;
  const waiting = !result && match.me.played && match.status === "accepted";
  const state = result ? result.outcome : waiting ? "waiting" : "closed";
  const mode = `${match.mode === "ranked" ? "Xếp hạng" : "Giao hữu"} · ${ARENA_GAME_NAMES[match.game]}`;
  const detail = result ? resultDetail(match) : "";
  return <section className={`card game-result ${waiting ? "is-pending" : "is-complete"} arena-result`} data-arena-result={state} aria-live="polite">
    <div className="game-result__icon" aria-hidden="true">{waiting ? <Bell size={30} strokeWidth={1.8} /> : <Trophy size={32} strokeWidth={1.8} />}</div>
    <div className="game-result__copy">
      <div className="eyebrow">{mode}</div>
      {result ? <>
        <h2>{outcomeTitle(result.outcome)}</h2>
        <p className="arena-result__line" data-arena-xh>{match.opponent?.displayName ?? "Đối thủ"} <b>{match.them.score ?? 0}</b>{match.mode === "ranked" && result.rating
          ? <> · <span data-arena-chip>{signed(result.rating.change)} điểm xếp hạng</span></> : " · Giao hữu"}</p>
        {detail ? <p className="small muted arena-result__detail">{detail}</p> : null}
      </> : waiting ? <>
        <h2>Chờ đối thủ</h2>
        <p>Kết quả sẽ báo ở chuông.</p>
      </> : <h2>Trận đã đóng</h2>}
    </div>
    {result || waiting ? <div className="game-result__score"><strong>{match.me.score ?? 0}</strong><span>điểm của bạn</span></div> : null}
    {outcomes?.length && (result || waiting) ? <RoundBreakdown outcomes={outcomes} /> : null}
    {onAgain || link ? <div className="game-result__actions">
      {onAgain ? <button className="btn-primary" type="button" disabled={againBusy} aria-busy={againBusy || undefined} onClick={onAgain}><Swords className="game-control-icon" size={16} strokeWidth={2} aria-hidden="true" />{againBusy ? "Đang tìm…" : "Đấu tiếp"}</button> : null}
      {link}
    </div> : null}
  </section>;
}

/** Muted second line, ≤ 40 characters: reason (only when unusual), band, meeting of the day, repeat rate. */
export function resultDetail(match: ArenaMatch): string {
  const result = match.result;
  if (!result) return "";
  const parts = [shortReason(match)];
  if (match.mode === "ranked" && result.rating) {
    parts.push(bandLabel(result.rating.base, result.outcome));
    if (result.rating.meetingIndex) parts.push(`lần gặp ${result.rating.meetingIndex}`);
    if (result.rating.decayPercent !== null && result.rating.decayPercent < 100) parts.push(`tính ${result.rating.decayPercent}%`);
  }
  return parts.filter(Boolean).join(" · ");
}
