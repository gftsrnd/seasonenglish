import { useEffect, useState } from "react";
import type { GameKey } from "@e4s/contracts";
import { ArrowLeft } from "lucide-react";
import { arenaApiClient, type ArenaApiClient, type ArenaBoardGame, type ArenaLeaderboard as Board } from "../../../api/arena.js";
import { InfoTip } from "../../shared/CompactUi.js";
import { Pager } from "../../shared/Pager.js";
import { useMediaQuery } from "../../shared/useMediaQuery.js";
import { AppLink, Notice } from "../ui.js";
import { RankBadge } from "./RankBadge.js";
import { ARENA_GAMES, ARENA_GAME_NAMES, ARENA_RULES } from "./arena-text.js";
import { arenaErrorMessage } from "./useArenaQuickMatch.js";
import "./arena.css";

type Client = Pick<ArenaApiClient, "home" | "leaderboard" | "inviteFriendly">;

const numberFormat = new Intl.NumberFormat("vi-VN");

/** Rows per leaderboard page: one screen on a phone, a balanced page on a tablet. */
function usePageSize() {
  const phone = useMediaQuery("(max-width: 600px)");
  const tablet = useMediaQuery("(max-width: 1024px)");
  return phone ? 6 : tablet ? 8 : 10;
}

/**
 * Màn 2 – Bảng xếp hạng (`/arena`, opened from Mini game › 4. Đấu trường). Back link to Mini game,
 * "Xếp hạng B1" with the rules ⓘ (never "Hạng x/y"), Tổng / 6 game chips and the paged list:
 * medals for single holders of ranks 1–3, my row highlighted, and a "Mời" on every other row that
 * opens a game picker inside the row (friendly, no popup). Nobody separated yet → one short line.
 */
export function ArenaLeaderboard({ navigate, notify, learnerId, client = arenaApiClient }: {
  navigate: (path: string) => void;
  notify: (message: string) => void;
  learnerId?: string | undefined;
  client?: Client;
}) {
  const [level, setLevel] = useState<string | null>(null);
  const [eligible, setEligible] = useState<boolean | null>(null);
  const [board, setBoard] = useState<Board | null>(null);
  const [game, setGame] = useState<ArenaBoardGame>("total");
  const [page, setPage] = useState(1);
  const [error, setError] = useState("");
  const [inviteFor, setInviteFor] = useState<string | null>(null);
  const [inviteGame, setInviteGame] = useState<GameKey>("scramble");
  const [sending, setSending] = useState(false);
  const size = usePageSize();

  useEffect(() => {
    let live = true;
    client.home().then((home) => { if (live) { setEligible(home.eligible); setLevel(home.level); } }).catch(() => { if (live) setError("Không tải được bảng xếp hạng."); });
    return () => { live = false; };
  }, [client]);
  useEffect(() => {
    if (!eligible) return;
    let live = true;
    client.leaderboard({ game }).then((next) => { if (live) { setBoard(next); setPage(1); } }).catch(() => { if (live) setError("Không tải được bảng xếp hạng."); });
    return () => { live = false; };
  }, [client, game, eligible]);

  const send = async (opponentId: string, name: string) => {
    if (sending) return;
    setSending(true);
    try {
      await client.inviteFriendly({ requestId: crypto.randomUUID(), opponentId, game: inviteGame });
      notify(`Đã mời ${name} giao hữu ${ARENA_GAME_NAMES[inviteGame]}.`);
      setInviteFor(null);
    } catch (reason) { notify(arenaErrorMessage(reason, "Chưa gửi được lời mời.")); }
    finally { setSending(false); }
  };

  const header = <>
    <AppLink className="arena-back-link" href="/games" navigate={navigate}><ArrowLeft size={16} aria-hidden="true" />Về Mini game</AppLink>
    <header className="page-title"><div>
      <h1 className="info-title"><span className="info-title-text">Xếp hạng {level ?? ""}</span><InfoTip label="Luật đấu trường" text={<ol className="arena-rules">{ARENA_RULES.map((rule) => <li key={rule}>{rule}</li>)}</ol>} /></h1>
    </div></header>
  </>;

  if (error && eligible === null) return <div className="app-learner-page arena-page">{header}<Notice tone="danger">{error}</Notice></div>;
  if (eligible === null) return <div className="app-learner-page arena-page"><section className="card" aria-live="polite">Đang tải bảng xếp hạng…</section></div>;
  if (!eligible) return <div className="app-learner-page arena-page">{header}<Notice tone="warn">Đấu trường mở từ B1. Bạn đang ở mức {level ?? "—"}.</Notice></div>;

  const entries = board?.entries ?? [];
  const pages = Math.max(1, Math.ceil(entries.length / size));
  const current = Math.min(page, pages);
  const visible = entries.slice((current - 1) * size, current * size);
  const isMe = (entry: Board["entries"][number]) => learnerId ? entry.learnerId === learnerId : Boolean(board?.me && entry.rank === board.me.rank && entry.rating === board.me.rating);
  // Nobody separated yet (everyone still on the same score): no ranks to show.
  const undecided = entries.length > 0 && entries.every((entry) => entry.rating === entries[0]!.rating);
  // Medals only for a single holder of ranks 1, 2, 3; ties show the plain number.
  const medal = (rank: number) => rank <= 3 && entries.filter((entry) => entry.rank === rank).length === 1;

  return <div className="app-learner-page arena-page arena-board-page">
    {header}
    <section className="card games-section-card arena-section" aria-label="Bảng xếp hạng">
      <div className="chips" role="group" aria-label="Lọc theo trò">
        {(["total", ...ARENA_GAMES] as ArenaBoardGame[]).map((key) => <button key={key} type="button" className={`chip arena-filter${game === key ? " is-active" : ""}`} aria-pressed={game === key} onClick={() => setGame(key)}>{key === "total" ? "Tổng" : ARENA_GAME_NAMES[key]}</button>)}
      </div>
      {!board ? <p className="small muted" aria-live="polite">Đang tải…</p>
        : !entries.length ? <p className="small muted">Chưa ai đấu trong mùa này.</p>
        : undecided ? <p className="small muted">Chưa có trận nào có kết quả. {entries.length} bạn đang cùng {numberFormat.format(entries[0]!.rating)} điểm khởi đầu.</p>
        : <ol className="arena-list arena-ranks">{visible.map((entry) => {
          const me = isMe(entry);
          const open = inviteFor === entry.learnerId;
          return <li key={entry.learnerId} className={`arena-list__row arena-rank-row${me ? " is-me" : ""}${open ? " is-open" : ""}`} aria-current={me || undefined} data-rank={entry.rank}>
            <RankBadge rank={medal(entry.rank) ? entry.rank : 99} label={entry.rank} />
            <span className="arena-rank-row__name">{entry.displayName}{me ? <small className="muted"> (bạn)</small> : null}</span>
            <b className="arena-rank-row__rating">{numberFormat.format(entry.rating)}</b>
            {me ? <span className="arena-rank-row__invite" /> : <button type="button" className="btn btn-sm arena-row-action arena-rank-row__invite" aria-expanded={open} aria-label={`Mời ${entry.displayName} giao hữu`} onClick={() => setInviteFor(open ? null : entry.learnerId)}>Mời</button>}
            {open ? <div className="arena-rank-invite" role="group" aria-label={`Chọn trò giao hữu với ${entry.displayName}`}>
              <select aria-label="Trò giao hữu" value={inviteGame} onChange={(event) => setInviteGame(event.target.value as GameKey)}>
                {ARENA_GAMES.map((key) => <option key={key} value={key}>{ARENA_GAME_NAMES[key]}</option>)}
              </select>
              <button type="button" className="btn-primary btn-sm" disabled={sending} aria-busy={sending || undefined} onClick={() => void send(entry.learnerId, entry.displayName)}>Gửi lời mời</button>
              <span className="small muted">Giao hữu không tính điểm xếp hạng.</span>
            </div> : null}
          </li>;
        })}</ol>}
      {undecided ? null : <Pager page={current} pages={pages} setPage={setPage} label="xếp hạng" />}
    </section>
  </div>;
}
