import { useCallback, useEffect, useMemo, useState } from "react";
import type { CefrLevel, GameKey } from "@e4s/contracts";
import { ArrowLeft, ChevronRight, Swords, Trophy, Users } from "lucide-react";
import { useModal } from "../../shared/ModalProvider.js";
import { arenaApiClient, type ArenaApiClient, type ArenaBoardGame, type ArenaHome, type ArenaLeaderboard as Board, type ArenaMatch } from "../../../api/arena.js";
import { InfoTip } from "../../shared/CompactUi.js";
import { Pager } from "../../shared/Pager.js";
import { useMediaQuery } from "../../shared/useMediaQuery.js";
import { AppLink, Modal, Notice } from "../ui.js";
import { ArenaGameIcon } from "./ArenaGameIcon.js";
import { ArenaResultCard } from "./ArenaResultCard.js";
import { RankBadge } from "./RankBadge.js";
import { ARENA_GAMES, ARENA_GAME_DESCRIPTIONS, ARENA_GAME_NAMES, ARENA_RULES, isInviteForMe, isMyTurn, matchStatusLine } from "./arena-text.js";
import { arenaErrorMessage, useArenaQuickMatch } from "./useArenaQuickMatch.js";
import "./arena.css";

type Client = Pick<ArenaApiClient, "home" | "leaderboard" | "answerFriendly" | "inviteFriendly" | "quickMatch" | "cancel" | "forfeit">;

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

  const modal = useModal();
  const act = async (match: ArenaMatch, work: () => Promise<unknown>, failure: string, after?: () => void) => {
    setBusyId(match.id);
    try { await work(); if (after) after(); else await loadHome(); }
    catch (reason) { notify(arenaErrorMessage(reason, failure)); }
    finally { setBusyId(null); }
  };
  const accept = (match: ArenaMatch) => act(match, () => client.answerFriendly(match.id, "accept"), "Không nhận được lời mời.", () => navigate(`/arena/match/${match.id}`));
  const decline = async (match: ArenaMatch) => {
    if (await modal.confirm({ title: "Từ chối lời mời?", message: `${match.opponent?.displayName ?? "Bạn học"} mời bạn giao hữu ${ARENA_GAME_NAMES[match.game]}.`, confirmLabel: "Từ chối", cancelLabel: "Quay lại", tone: "danger", countdownSeconds: 0 }))
      await act(match, () => client.answerFriendly(match.id, "decline"), "Chưa từ chối được.");
  };
  const withdraw = async (match: ArenaMatch) => {
    if (await modal.confirm({ title: "Huỷ thách đấu?", message: `${ARENA_GAME_NAMES[match.game]}: chưa có ai nhận nên huỷ không mất điểm.`, confirmLabel: "Huỷ thách đấu", cancelLabel: "Giữ lại", tone: "danger", countdownSeconds: 0 }))
      await act(match, () => client.cancel(match.id), "Chưa huỷ được thách đấu.");
  };
  const giveUp = async (match: ArenaMatch) => {
    const ranked = match.mode === "ranked";
    if (await modal.confirm({ title: "Bỏ trận?", message: ranked ? "Trận đã có người nhận. Bỏ trận sẽ tính thua và trừ điểm xếp hạng." : "Bỏ trận giao hữu sẽ tính thua, không trừ điểm xếp hạng.", confirmLabel: "Bỏ trận", cancelLabel: "Quay lại", tone: "danger" }))
      await act(match, () => client.forfeit(match.id), "Chưa bỏ trận được.");
  };
  const pick = async (key: GameKey) => {
    const ok = await modal.confirm({
      title: `Đấu ${ARENA_GAME_NAMES[key]}?`,
      message: <ul className="arena-confirm-list"><li>Vào thách đấu đang chờ cùng cấp; nếu không có thì đăng thách đấu mới.</li><li>Dùng bộ từ đang chọn ở Mini game.</li><li>Có người nhận thì mỗi bên có 24 giờ để chơi; bỏ trận tính thua.</li></ul>,
      confirmLabel: "Đấu", cancelLabel: "Để sau"
    });
    if (ok) await again.start(key);
  };

  const title = (level: string, detail?: string) => <>
    <AppLink className="arena-back-link" href="/games" navigate={navigate}><ArrowLeft size={16} aria-hidden="true" />Về Mini game</AppLink>
    <header className="page-title"><div>
      <div className="eyebrow">Mini game</div>
      <h1 className="info-title"><span className="info-title-text">Đấu trường {level}</span><InfoTip label="Luật đấu trường" text={<ol className="arena-rules">{ARENA_RULES.map((rule) => <li key={rule}>{rule}</li>)}</ol>} /></h1>
      {detail ? <p className="muted">{detail}</p> : null}
    </div></header>
  </>;

  if (error && !home) return <div className="app-learner-page arena-page"><Notice tone="danger">{error}</Notice></div>;
  if (!home) return <div className="app-learner-page arena-page"><section className="card" aria-live="polite">Đang tải bảng xếp hạng…</section></div>;
  if (!home.eligible) return <div className="app-learner-page arena-page">{title("")}<Notice tone="warn">Đấu trường mở từ B1. Bạn đang ở mức {home.level ?? "—"}.</Notice></div>;

  const rows = myMatchRows(home);
  const entries = board?.entries ?? [];
  const pages = Math.max(1, Math.ceil(entries.length / size));
  const current = Math.min(page, pages);
  const visible = entries.slice((current - 1) * size, current * size);
  const mine = (entry: Board["entries"][number]) => learnerId ? entry.learnerId === learnerId : Boolean(board?.me && entry.rank === board.me.rank && entry.rating === board.me.rating);

  const daysLeft = home.season ? Math.max(0, Math.ceil((Date.parse(`${home.season.endsOn}T00:00:00+07:00`) - Date.now()) / 86_400_000)) : null;
  const usePodium = current === 1 && entries.length >= 3;
  return <div className="app-learner-page games-page arena-page arena-board-page">
    {title(home.level ?? "", `Tổng ${numberFormat.format(home.total)} điểm · ${home.openRanked}/${home.maxOpenRanked} trận đang mở${daysLeft !== null ? ` · mùa còn ${daysLeft} ngày` : ""}.`)}

    <section className="card games-section-card arena-section" aria-labelledby="arena-pick-title">
      <h2 id="arena-pick-title">1. Chọn trò để đấu</h2>
      <div className="grid cols-3 game-grid arena-game-grid">{ARENA_GAMES.map((key) => <button key={key} type="button" className={`tile game-tile game-${key} arena-game-tile`} disabled={Boolean(again.busyGame)} aria-busy={again.busyGame === key || undefined} aria-label={`Đấu ${ARENA_GAME_NAMES[key]}`} onClick={() => void pick(key)}>
        <span className="game-icon" aria-hidden="true"><ArenaGameIcon game={key} size={28} /></span>
        <h3>{ARENA_GAME_NAMES[key]}</h3>
        <p>{ARENA_GAME_DESCRIPTIONS[key]}</p>
        <b className="arena-game-tile__foot"><span>Điểm: {numberFormat.format(home.ratings[key] ?? 1000)}</span><span className="arena-game-tile__cta"><Swords size={14} aria-hidden="true" />{again.busyGame === key ? "Đang vào…" : "Đấu"}</span></b>
      </button>)}</div>
    </section>

    <section className="card games-section-card arena-section" aria-labelledby="arena-my-matches">
      <h2 id="arena-my-matches">2. Trận của bạn</h2>
      {rows.length ? <ul className="arena-list">{rows.map((match) => {
        const settled = match.status === "settled" && Boolean(match.result);
        const text = <>
          <ArenaGameIcon game={match.game} />
          <span className="arena-list__text"><b>{ARENA_GAME_NAMES[match.game]}{match.mode === "ranked" ? <Trophy className="arena-mode-icon" size={12} role="img" aria-label="Xếp hạng" /> : <Users className="arena-mode-icon" size={12} role="img" aria-label="Giao hữu" />}</b><small>{matchStatusLine(match)}</small></span>
        </>;
        const busy = busyId === match.id;
        const mineToWithdraw = match.postedByMe && (match.status === "open" || match.status === "invited");
        const canGiveUp = match.status === "accepted" && !match.me.played;
        const actions = isInviteForMe(match)
          ? <><button className="btn-primary btn-sm arena-row-action" type="button" disabled={busy} onClick={() => void accept(match)}>Nhận</button><button className="btn btn-sm arena-row-action" type="button" disabled={busy} onClick={() => void decline(match)}>Từ chối</button></>
          : mineToWithdraw ? <button className="btn btn-sm arena-row-action" type="button" disabled={busy} onClick={() => void withdraw(match)}>Huỷ</button>
          : canGiveUp ? <>{isMyTurn(match) ? <AppLink className="btn btn-primary btn-sm arena-row-action" href={`/arena/match/${match.id}`} navigate={navigate}>Chơi</AppLink> : null}<button className="btn btn-sm arena-row-action" type="button" disabled={busy} onClick={() => void giveUp(match)}>Bỏ trận</button></>
          : null;
        return <li key={match.id} className="arena-list__row" data-arena-row={match.status}>
          {settled
            ? <button type="button" className="arena-list__open" aria-label={`Xem kết quả ${ARENA_GAME_NAMES[match.game]}`} onClick={() => setResult(match)}>{text}<ChevronRight className="arena-list__chevron" size={16} aria-hidden="true" /></button>
            : <AppLink className="arena-list__open" href={`/arena/match/${match.id}`} navigate={navigate} ariaLabel={`Mở trận ${ARENA_GAME_NAMES[match.game]}`}>{text}{actions ? null : <ChevronRight className="arena-list__chevron" size={16} aria-hidden="true" />}</AppLink>}
          {actions ? <span className="arena-row-actions">{actions}</span> : null}
        </li>;
      })}</ul> : <p className="small muted">Chưa có trận. Chọn một trò ở trên để đấu.</p>}
    </section>

    <section className="card games-section-card arena-section" aria-labelledby="arena-board-title">
      <h2 id="arena-board-title">3. Bảng xếp hạng</h2>
      <div className="chips" role="group" aria-label="Lọc theo trò">
        {(["total", ...ARENA_GAMES] as ArenaBoardGame[]).map((key) => <button key={key} type="button" className={`chip arena-filter${game === key ? " is-active" : ""}`} aria-pressed={game === key} onClick={() => setGame(key)}>{key === "total" ? "Tổng" : ARENA_GAME_NAMES[key]}</button>)}
      </div>
      {board && usePodium ? <ol className="arena-podium" aria-label="Ba hạng đầu">{[entries[1]!, entries[0]!, entries[2]!].map((entry, index) => <li key={entry.learnerId} className={`arena-podium__step arena-podium__step--${[2, 1, 3][index]}${mine(entry) ? " is-me" : ""}`}>
        <RankBadge rank={entry.rank} size="large" />
        <b className="arena-podium__name">{entry.displayName}{mine(entry) ? <small> (bạn)</small> : null}</b>
        <span className="arena-podium__rating">{numberFormat.format(entry.rating)}</span>
      </li>)}</ol> : null}
      {!board ? <p className="small muted" aria-live="polite">Đang tải…</p> : entries.length ? <ol className="arena-list arena-ranks">{(usePodium ? visible.slice(3) : visible).map((entry) => <li key={entry.learnerId} className={`arena-list__row arena-rank-row${mine(entry) ? " is-me" : ""}`} aria-current={mine(entry) || undefined} data-rank={entry.rank}>
        <RankBadge rank={entry.rank} />
        <span className="arena-rank-row__name">{entry.displayName}{mine(entry) ? <small className="muted"> (bạn)</small> : null}</span>
        <b className="arena-rank-row__rating">{numberFormat.format(entry.rating)}</b>
      </li>)}</ol> : <p className="small muted">Chưa ai đấu trong mùa này.</p>}
      <Pager page={current} pages={pages} setPage={setPage} label="xếp hạng" />
    </section>

    <section className="card games-section-card arena-section arena-friendly-card" aria-labelledby="arena-friendly-title">
      <div className="arena-friendly-card__row">
        <span className="game-icon arena-friendly-card__icon" aria-hidden="true"><Users size={22} strokeWidth={2} /></span>
        <span className="arena-friendly-card__text"><h2 id="arena-friendly-title">4. Giao hữu</h2><span className="small muted">Mời một bạn học (khác cấp cũng được), không tính điểm xếp hạng.</span></span>
        <button type="button" className="btn btn-primary arena-friendly-card__button" onClick={() => setInviting(true)}><Users size={16} aria-hidden="true" />Mời bạn</button>
      </div>
    </section>

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
