import type { ReactNode } from "react";
import { Bell, Swords } from "lucide-react";
import type { ArenaMatch } from "../../../api/arena.js";
import { ARENA_GAME_NAMES, bandLabel, outcomeTitle, shortReason, signed } from "./arena-text.js";

const numberFormat = new Intl.NumberFormat("vi-VN");

function clock(ms: number | null | undefined): string {
  if (!ms || ms <= 0) return "";
  const seconds = Math.round(ms / 1000);
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/u);
  return ((parts.at(-1)?.[0] ?? "") + (parts.length > 1 ? parts[0]![0] ?? "" : "")).toUpperCase() || "?";
}

/** Why the round went this way, in one sentence under the two scores. */
function reasonSentence(match: ArenaMatch): string {
  const result = match.result;
  if (!result) return "";
  const special = shortReason(match);
  if (special) return `${special}.`;
  if (result.outcome === "draw") return "Hai bên bằng điểm.";
  return result.outcome === "win" ? "Điểm ván của bạn cao hơn." : "Điểm ván của đối thủ cao hơn.";
}

/**
 * Kết quả trận (owner reference 19/11): a side-by-side comparison – title (Bạn thắng! / Bạn thua /
 * Hoà), "game · mode · set", Bạn VS đối thủ with the two scores, one reason line, then the XH box
 * (+N điểm xếp hạng with the rating change, or "Giao hữu không tính điểm xếp hạng").
 * Waiting: only my score and "Chờ đối thủ". Actions: one primary "Đấu tiếp" plus an optional link.
 */
export function ArenaResultCard({ match, onAgain, againBusy = false, link }: {
  match: ArenaMatch;
  onAgain?: (() => void) | undefined;
  againBusy?: boolean;
  link?: ReactNode;
}) {
  const result = match.status === "settled" ? match.result : null;
  const waiting = !result && match.me.played && match.status === "accepted";
  const state = result ? result.outcome : waiting ? "waiting" : "closed";
  const mode = match.mode === "ranked" ? "Xếp hạng" : "Giao hữu";
  const opponent = match.opponent?.displayName ?? "Đối thủ";
  const rating = match.mode === "ranked" ? result?.rating ?? null : null;
  const winner = (side: "me" | "them") => result && result.outcome !== "draw" && ((side === "me") === (result.outcome === "win"));

  return <section className={`card arena-result is-${state}`} data-arena-result={state} aria-live="polite">
    <header className="arena-result__head">
      <h2>{result ? outcomeTitle(result.outcome) : waiting ? "Chờ đối thủ" : "Trận đã đóng"}</h2>
      <p className="small muted">{ARENA_GAME_NAMES[match.game]} · {mode} · {match.setTopic}</p>
    </header>

    {result || waiting ? <div className="arena-result__versus">
      <div className={`arena-result__side${winner("me") ? " is-winner" : ""}`}>
        <span className="arena-result__avatar is-me" aria-hidden="true">Bạn</span>
        <b>Bạn</b>
        <strong className="arena-result__score">{match.me.score ?? 0}</strong>
        {clock(match.me.gameplayMs) ? <small>{clock(match.me.gameplayMs)}</small> : null}
      </div>
      <span className="arena-result__vs" aria-hidden="true">VS</span>
      <div className={`arena-result__side${winner("them") ? " is-winner" : ""}`}>
        <span className="arena-result__avatar" aria-hidden="true">{result ? initials(opponent) : "?"}</span>
        <b>{result ? opponent : "Đối thủ"}</b>
        <strong className="arena-result__score">{result ? match.them.score ?? 0 : "–"}</strong>
        {!result ? <small>Chưa chơi</small> : null}
      </div>
    </div> : null}

    {result ? <p className="arena-result__reason" data-arena-xh>{reasonSentence(match)}</p> : waiting ? <p className="arena-result__reason"><Bell size={15} aria-hidden="true" /> Kết quả sẽ báo ở chuông.</p> : null}

    {result ? <div className="arena-result__xh">
      {rating
        ? <><b data-arena-chip>{signed(rating.change)} điểm xếp hạng</b>
          <span className="small muted">{numberFormat.format(rating.before)} → {numberFormat.format(rating.after)} · {[bandLabel(rating.base, result.outcome), rating.meetingIndex ? `lần gặp ${rating.meetingIndex}` : "", rating.decayPercent !== null && rating.decayPercent < 100 ? `tính ${rating.decayPercent}%` : ""].filter(Boolean).join(" · ")}</span></>
        : <b>Giao hữu không tính điểm xếp hạng</b>}
    </div> : null}

    {onAgain || link ? <div className="arena-result__actions">
      {onAgain ? <button className="btn-primary" type="button" disabled={againBusy} aria-busy={againBusy || undefined} onClick={onAgain}><Swords className="game-control-icon" size={16} strokeWidth={2} aria-hidden="true" />{againBusy ? "Đang tìm…" : "Đấu tiếp"}</button> : null}
      {link}
    </div> : null}
  </section>;
}
