import { useCallback, useEffect, useMemo, useState } from "react";
import type { CefrLevel, GameKey } from "@e4s/contracts";
import { ChevronRight, Trophy, Users } from "lucide-react";
import { arenaApiClient, type ArenaApiClient, type ArenaBoardGame, type ArenaHome, type ArenaLeaderboard as Board, type ArenaMatch } from "../../../api/arena.js";
import { InfoTip } from "../../shared/CompactUi.js";
import { Pager } from "../../shared/Pager.js";
import { useMediaQuery } from "../../shared/useMediaQuery.js";
import { AppLink, Modal, Notice } from "../ui.js";
import { ArenaGameIcon } from "./ArenaGameIcon.js";
import { ArenaResultCard } from "./ArenaResultCard.js";
import { RankBadge } from "./RankBadge.js";
import { ARENA_GAMES, ARENA_GAME_NAMES, ARENA_RULES, isInviteForMe, isMyTurn, matchStatusLine } from "./arena-text.js";
import { arenaErrorMessage, useArenaQuickMatch } from "./useArenaQuickMatch.js";
import "./arena.css";

type Client = Pick<ArenaApiClient, "home" | "leaderboard" | "answerFriendly" | "inviteFriendly" | "quickMatch">;

const numberFormat = new Intl.NumberFormat("vi-VN");

/** Rows per leaderboard page: one screen on a phone, a balanced page on a tablet. */
function usePageSize() {
  const phone = useMediaQuery("(max-width: 600px)");
  const tablet = useMediaQuery("(max-width: 1024px)");
  return phone ? 6 : tablet ? 8 : 10;
}

/** "Trận của bạn": at most 3 rows — invites to me, my turn, waiting ones, then the latest result. */
export function myMatchRows(home: ArenaHome): ArenaMatch[] {
  const live = [...home.matches.open, ...home.matches.active];
  const rank = (match: ArenaMatch) => isInviteForMe(match) ? 0 : isMyTurn(match) ? 1 : 2;
  const ordered = [...live].sort((a, b) => rank(a) - rank(b));
  return [...ordered, ...home.matches.done].slice(0, 3);
}

/**
 * Đấu trường (`/arena`), opened from its own card on the Mini game page, built from the app's
 * list-page parts: page title "Đấu trường B1" with the rules in ⓘ (never "Hạng x/y"), the
 * "Chọn trò để đấu" picker (join an open challenge or post one), the "Trận của bạn" card (at most one action per row, only
 * when the learner must act), the Tổng / 6 game chips, the paged ranked list (my row lightly
 * highlighted, small medals for 1–3) and one small "Mời bạn giao hữu" link at the bottom.
 */
export function ArenaLeaderboard({ navigate, notify, learnerId, client = arenaApiClient }: {
  navigate: (path: string) => void;
  notify: (message: string) => void;
  learnerId?: string | undefined;
  client?: Client;
}) {
  const [home, setHome] = useState<ArenaHome | null>(null);
  const [board, setBoard] = useState<Board | null>(null);
  const [game, setGame] = useState<ArenaBoardGame>("total");
  const [page, setPage] = useState(1);
  const [error, setError] = useState("");
  const [result, setResult] = useState<ArenaMatch | null>(null);
  const [inviting, setInviting] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const again = useArenaQuickMatch({ navigate, notify, client });
  const size = usePageSize();

  const loadHome = useCallback(async () => {
    try { setHome(await client.home()); } catch { setError("Không tải được đấu trường."); }
  }, [client]);
  useEffect(() => { void loadHome(); }, [loadHome]);
  useEffect(() => {
    if (!home?.eligible) return;
    let live = true;
    client.leaderboard({ game }).then((next) => { if (live) { setBoard(next); setPage(1); } }).catch(() => { if (live) setError("Không tải được bảng xếp hạng."); });
    return () => { live = false; };
  }, [client, game, home?.eligible]);

  const accept = async (match: ArenaMatch) => {
    setBusyId(match.id);
    try { await client.answerFriendly(match.id, "accept"); navigate(`/arena/match/${match.id}`); }
    catch (reason) { notify(arenaErrorMessage(reason, "Không nhận được lời mời.")); }
    finally { setBusyId(null); }
  };

  const title = (level: string) => <header className="page-title"><div>
    <AppLink className="eyebrow arena-eyebrow-link" href="/games" navigate={navigate}>Mini game</AppLink>
    <h1 className="info-title"><span className="info-title-text">Đấu trường {level}</span><InfoTip label="Luật đấu trường" text={<ol className="arena-rules">{ARENA_RULES.map((rule) => <li key={rule}>{rule}</li>)}</ol>} /></h1>
  </div></header>;

  if (error && !home) return <div className="app-learner-page arena-page"><Notice tone="danger">{error}</Notice></div>;
  if (!home) return <div className="app-learner-page arena-page"><section className="card" aria-live="polite">Đang tải bảng xếp hạng…</section></div>;
  if (!home.eligible) return <div className="app-learner-page arena-page">{title("")}<Notice tone="warn">Đấu trường mở từ B1. Bạn đang ở mức {home.level ?? "—"}.</Notice></div>;

  const rows = myMatchRows(home);
  const entries = board?.entries ?? [];
  const pages = Math.max(1, Math.ceil(entries.length / size));
  const current = Math.min(page, pages);
  const visible = entries.slice((current - 1) * size, current * size);
  const mine = (entry: Board["entries"][number]) => learnerId ? entry.learnerId === learnerId : Boolean(board?.me && entry.rank === board.me.rank && entry.rating === board.me.rating);

  return <div className="app-learner-page arena-page arena-board-page">
    {title(home.level ?? "")}

    <section className="card arena-section" aria-labelledby="arena-pick-title">
      <h2 id="arena-pick-title">Chọn trò để đấu</h2>
      <div className="arena-pick-grid">{ARENA_GAMES.map((key) => <button key={key} type="button" className="btn arena-pick" disabled={Boolean(again.busyGame)} aria-busy={again.busyGame === key || undefined} aria-label={`Đấu ${ARENA_GAME_NAMES[key]}`} onClick={() => void again.start(key)}>
        <ArenaGameIcon game={key} /><span>{again.busyGame === key ? "Đang vào…" : ARENA_GAME_NAMES[key]}</span>
      </button>)}</div>
    </section>

    <section className="card arena-section" aria-labelledby="arena-my-matches">
      <h2 id="arena-my-matches">Trận của bạn</h2>
      {rows.length ? <ul className="arena-list">{rows.map((match) => {
        const settled = match.status === "settled" && Boolean(match.result);
        const text = <>
          <ArenaGameIcon game={match.game} />
          <span className="arena-list__text"><b>{ARENA_GAME_NAMES[match.game]}{match.mode === "ranked" ? <Trophy className="arena-mode-icon" size={12} role="img" aria-label="Xếp hạng" /> : <Users className="arena-mode-icon" size={12} role="img" aria-label="Giao hữu" />}</b><small>{matchStatusLine(match)}</small></span>
        </>;
        // One action only when the learner must act; otherwise the row itself opens the details.
        const action = isInviteForMe(match)
          ? <button className="btn-primary btn-sm arena-row-action" type="button" disabled={busyId === match.id} onClick={() => void accept(match)}>Nhận</button>
          : isMyTurn(match) ? <AppLink className="btn btn-primary btn-sm arena-row-action" href={`/arena/match/${match.id}`} navigate={navigate}>Chơi</AppLink> : null;
        return <li key={match.id} className="arena-list__row" data-arena-row={match.status}>
          {settled
            ? <button type="button" className="arena-list__open" aria-label={`Xem kết quả ${ARENA_GAME_NAMES[match.game]}`} onClick={() => setResult(match)}>{text}<ChevronRight className="arena-list__chevron" size={16} aria-hidden="true" /></button>
            : <AppLink className="arena-list__open" href={`/arena/match/${match.id}`} navigate={navigate} ariaLabel={`Mở trận ${ARENA_GAME_NAMES[match.game]}`}>{text}{action ? null : <ChevronRight className="arena-list__chevron" size={16} aria-hidden="true" />}</AppLink>}
          {action}
        </li>;
      })}</ul> : <p className="small muted">Chưa có trận. Chọn một trò ở trên để đấu.</p>}
    </section>

    <section className="card arena-section" aria-labelledby="arena-board-title">
      <h2 id="arena-board-title">Bảng xếp hạng</h2>
      <div className="chips" role="group" aria-label="Lọc theo trò">
        {(["total", ...ARENA_GAMES] as ArenaBoardGame[]).map((key) => <button key={key} type="button" className={`chip arena-filter${game === key ? " is-active" : ""}`} aria-pressed={game === key} onClick={() => setGame(key)}>{key === "total" ? "Tổng" : ARENA_GAME_NAMES[key]}</button>)}
      </div>
      {!board ? <p className="small muted" aria-live="polite">Đang tải…</p> : entries.length ? <ol className="arena-list arena-ranks">{visible.map((entry) => <li key={entry.learnerId} className={`arena-list__row arena-rank-row${mine(entry) ? " is-me" : ""}`} aria-current={mine(entry) || undefined} data-rank={entry.rank}>
        <RankBadge rank={entry.rank} />
        <span className="arena-rank-row__name">{entry.displayName}{mine(entry) ? <small className="muted"> (bạn)</small> : null}</span>
        <b className="arena-rank-row__rating">{numberFormat.format(entry.rating)}</b>
      </li>)}</ol> : <p className="small muted">Chưa ai đấu trong mùa này.</p>}
      <Pager page={current} pages={pages} setPage={setPage} label="xếp hạng" />
    </section>

    <button type="button" className="arena-text-link" onClick={() => setInviting(true)}>Mời bạn giao hữu</button>

    {result ? <Modal className="arena-dialog" title="Kết quả trận" onClose={() => setResult(null)} dismissOnBackdrop>
      <ArenaResultCard match={result} againBusy={again.busyGame === result.game} onAgain={() => void again.start(result.game)} />
    </Modal> : null}
    {inviting ? <ArenaInviteDialog client={client} learnerId={learnerId} myLevel={home.level} onClose={() => setInviting(false)} onSent={() => { setInviting(false); notify("Đã gửi lời mời giao hữu."); void loadHome(); }} notify={notify} /> : null}
  </div>;
}

/** "Mời bạn giao hữu": pick a learner from the B1 / B2 / C1 boards, then a game, then send. */
function ArenaInviteDialog({ client, learnerId, myLevel, onClose, onSent, notify }: {
  client: Client;
  learnerId?: string | undefined;
  myLevel: CefrLevel | null;
  onClose: () => void;
  onSent: () => void;
  notify: (message: string) => void;
}) {
  const [people, setPeople] = useState<Array<{ id: string; name: string; level: CefrLevel }> | null>(null);
  const [query, setQuery] = useState("");
  const [picked, setPicked] = useState<string | null>(null);
  const [game, setGame] = useState<GameKey | null>(null);
  const [page, setPage] = useState(1);
  const [sending, setSending] = useState(false);
  useEffect(() => {
    let live = true;
    const levels: CefrLevel[] = ["B1", "B2", "C1"];
    Promise.all(levels.map((level) => client.leaderboard({ level }).then((board) => ({ level, board })).catch(() => null))).then((boards) => {
      if (!live) return;
      const seen = new Map<string, { id: string; name: string; level: CefrLevel }>();
      for (const item of boards) for (const entry of item?.board.entries ?? []) {
        const isMe = learnerId ? entry.learnerId === learnerId : item?.level === myLevel && item.board.me?.rank === entry.rank && item.board.me.rating === entry.rating;
        if (!isMe && !seen.has(entry.learnerId)) seen.set(entry.learnerId, { id: entry.learnerId, name: entry.displayName, level: item!.level });
      }
      setPeople([...seen.values()].sort((a, b) => a.name.localeCompare(b.name, "vi")));
    });
    return () => { live = false; };
  }, [client, learnerId, myLevel]);
  const filtered = useMemo(() => (people ?? []).filter((person) => person.name.toLocaleLowerCase("vi").includes(query.trim().toLocaleLowerCase("vi"))), [people, query]);
  const size = 5;
  const pages = Math.max(1, Math.ceil(filtered.length / size));
  const current = Math.min(page, pages);
  const send = async () => {
    if (!picked || !game || sending) return;
    setSending(true);
    try { await client.inviteFriendly({ requestId: crypto.randomUUID(), opponentId: picked, game }); onSent(); }
    catch (reason) { notify(arenaErrorMessage(reason, "Chưa gửi được lời mời.")); }
    finally { setSending(false); }
  };
  return <Modal className="arena-dialog arena-invite-dialog" title="Mời bạn giao hữu" onClose={onClose}
    actions={<button className="btn-primary" type="button" disabled={!picked || !game || sending} aria-busy={sending || undefined} onClick={() => void send()}>{sending ? "Đang gửi…" : "Gửi lời mời"}</button>}>
    <input type="search" aria-label="Tìm bạn học" placeholder="Tìm tên" value={query} onChange={(event) => { setQuery(event.target.value); setPage(1); }} />
    {!people ? <p className="small muted">Đang tải…</p> : filtered.length ? <ul className="arena-list" role="listbox" aria-label="Bạn học">{filtered.slice((current - 1) * size, current * size).map((person) => <li key={person.id} className={`arena-list__row${picked === person.id ? " is-me" : ""}`}>
      <button type="button" role="option" aria-selected={picked === person.id} className="arena-list__open" onClick={() => setPicked(person.id)}><span className="arena-list__text"><b>{person.name}</b></span><small className="muted">{person.level}</small></button>
    </li>)}</ul> : <p className="small muted">Không có bạn học phù hợp.</p>}
    <Pager page={current} pages={pages} setPage={setPage} label="bạn học" />
    <div className="chips" role="group" aria-label="Chọn trò">
      {ARENA_GAMES.map((key) => <button key={key} type="button" className={`chip arena-filter${game === key ? " is-active" : ""}`} aria-pressed={game === key} onClick={() => setGame(key)}>{ARENA_GAME_NAMES[key]}</button>)}
    </div>
  </Modal>;
}
