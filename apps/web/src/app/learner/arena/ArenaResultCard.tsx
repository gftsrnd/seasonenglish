import type { ReactNode } from "react";
import { ArrowDownRight, ArrowUpRight, Bell, Equal, Handshake, Swords, Trophy } from "lucide-react";
import { AccountAvatar } from "../../shared/AccountAvatar.js";
import type { ArenaMatch } from "../../../api/arena.js";
import { ARENA_GAME_NAMES, bandLabel, outcomeTitle, shortReason, signed } from "./arena-text.js";

const numberFormat = new Intl.NumberFormat("vi-VN");

function clock(ms: number | null | undefined): string {
  if (!ms || ms <= 0) return "";
  const seconds = Math.round(ms / 1000);
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
}

/** Why the round went this way, in one sentence under the two scores. */
function reasonSentence(match: ArenaMatch): string {
  const result = match.result;
  if (!result) return "";
  const special = shortReason(match);
  if (special) return `${special}.`;
  if (result.outcome === "draw") return "Hai bên bằng điểm và bằng thời gian.";
  return result.outcome === "win" ? "Điểm ván của bạn cao hơn." : "Điểm ván của đối thủ cao hơn.";
}

/**
 * Kết quả trận (owner reference 19/11): an outcome banner (win in the season colour, lose neutral,
 * draw amber), Bạn VS đối thủ side by side with the winner marked, one reason line, then the XH
 * box with the change and before → after. Waiting: my score and "Chờ đối thủ".
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
  const winner = (side: "me" | "them") => Boolean(result && result.outcome !== "draw" && ((side === "me") === (result.outcome === "win")));
  const Icon = state === "win" ? Trophy : state === "lose" ? Swords : state === "draw" ? Handshake : Bell;
  const Delta = !rating ? null : rating.change > 0 ? ArrowUpRight : rating.change < 0 ? ArrowDownRight : Equal;

  const side = (who: "me" | "them") => {
    const me = who === "me";
    // Owner 19/11: every side gets a clear border and badge – Thắng green, Thua red, Hoà amber on both.
    const tag = !result ? null : result.outcome === "draw" ? "draw" : winner(who) ? "win" : "lose";
    return <div className={`arena-result__side${tag ? ` is-${tag}` : ""}${tag === "win" ? " is-winner" : ""}`}>
      {tag ? <span className={`arena-result__crown is-${tag}`}>{tag === "win" ? "Thắng" : tag === "lose" ? "Thua" : "Hoà"}</span> : null}
      <span className={`arena-result__avatar${me ? " is-me" : ""}`} aria-hidden="true">{me || result ? <AccountAvatar avatar={me ? match.myAvatar : match.opponent?.avatar} name={me ? "Bạn" : opponent} size={52} /> : "?"}</span>
      <b>{me ? "Bạn" : result ? opponent : "Đối thủ"}</b>
      <strong className="arena-result__score">{me ? match.me.score ?? 0 : result ? match.them.score ?? 0 : "–"}</strong>
      <small>{me ? (clock(match.me.gameplayMs) ? `điểm ván · ${clock(match.me.gameplayMs)}` : "điểm ván") : result ? "điểm ván" : "chưa chơi"}</small>
    </div>;
  };

  return <section className={`card arena-result is-${state}`} data-arena-result={state} aria-live="polite">
    <header className="arena-result__banner">
      <span className="arena-result__badge" aria-hidden="true"><Icon size={26} strokeWidth={2} /></span>
      <span className="arena-result__title">
        <h2>{result ? outcomeTitle(result.outcome) : waiting ? "Chờ đối thủ" : "Trận đã đóng"}</h2>
        <small>{ARENA_GAME_NAMES[match.game]} · {mode} · {match.setTopic}</small>
      </span>
    </header>

    {result || waiting ? <div className="arena-result__versus">
      {side("me")}
      <span className="arena-result__vs" aria-hidden="true">VS</span>
      {side("them")}
    </div> : null}

    {result ? <p className="arena-result__reason">{reasonSentence(match)}</p> : waiting ? <p className="arena-result__reason"><Bell size={15} aria-hidden="true" /> Kết quả sẽ báo ở chuông.</p> : null}

    {result ? <div className={`arena-result__xh${rating ? rating.change > 0 ? " is-up" : rating.change < 0 ? " is-down" : " is-even" : " is-friendly"}`}>
      {rating && Delta
        ? <><span className="arena-result__delta"><Delta size={20} aria-hidden="true" /><b data-arena-chip>{signed(rating.change)} điểm xếp hạng</b></span>
          <span className="small muted">{numberFormat.format(rating.before)} → {numberFormat.format(rating.after)} · {[bandLabel(rating.base, result.outcome), rating.meetingIndex ? `lần gặp ${rating.meetingIndex}` : "", rating.decayPercent !== null && rating.decayPercent < 100 ? `tính ${rating.decayPercent}%` : ""].filter(Boolean).join(" · ")}</span></>
        : <b>Giao hữu không tính điểm xếp hạng</b>}
    </div> : null}

    {onAgain || link ? <div className="arena-result__actions">
      {onAgain ? <button className="btn-primary" type="button" disabled={againBusy} aria-busy={againBusy || undefined} onClick={onAgain}><Swords className="game-control-icon" size={16} strokeWidth={2} aria-hidden="true" />{againBusy ? "Đang tìm…" : "Đấu tiếp"}</button> : null}
      {link}
    </div> : null}
  </section>;
}
