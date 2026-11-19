import { useCallback, useEffect, useMemo, useState } from "react";
import type { CefrLevel, GameKey } from "@e4s/contracts";
import { ArrowLeft, ChevronDown, ChevronRight, CircleHelp, Inbox, Trophy, Users } from "lucide-react";
import { arenaApiClient, type ArenaApiClient, type ArenaBoardGame, type ArenaHome, type ArenaLeaderboard as Board, type ArenaMatch, type ArenaOpenChallenge } from "../../../api/arena.js";
import { InfoTip } from "../../shared/CompactUi.js";
import { useModal } from "../../shared/ModalProvider.js";
import { Pager } from "../../shared/Pager.js";
import { useMediaQuery } from "../../shared/useMediaQuery.js";
import { AppLink, Modal, Notice } from "../ui.js";
import { ArenaGameIcon } from "./ArenaGameIcon.js";
import { myMatchRows, useArenaSceneStyle } from "./ArenaHub.js";
import { ArenaResultCard } from "./ArenaResultCard.js";
import { ARENA_GAMES, ARENA_GAME_NAMES, ARENA_RULES, hoursLeft, isInviteForMe, isMyTurn, matchStatusLine } from "./arena-text.js";
import { arenaErrorMessage } from "./useArenaQuickMatch.js";
import "./arena.css";

type Client = Pick<ArenaApiClient, "home" | "leaderboard" | "challenges" | "postChallenge" | "acceptChallenge" | "inviteFriendly" | "answerFriendly" | "cancel" | "forfeit">;
type Tab = "play" | "board";
type Person = { id: string; name: string; level: CefrLevel };

const numberFormat = new Intl.NumberFormat("vi-VN");
const dateFormat = new Intl.DateTimeFormat("vi-VN", { day: "2-digit", month: "2-digit", year: "numeric" });
const LEVELS: CefrLevel[] = ["B1", "B2", "C1"];

/**
 * Đấu trường (`/arena`, owner reference 19/11): a season banner (season colours + scenery, no
 * character), then the app's segmented tabs "Đấu | Bảng xếp hạng".
 * - Đấu: left card Xếp hạng / Giao hữu (pick a game, the word set in use, one button);
 *   right card "Trận của bạn" (≤ 3, with Huỷ / Nhận / Chơi / Bỏ trận) and "Thách đấu đang mở".
 * - Bảng xếp hạng: Tổng / 6 game chips, level select, a table with the six games and the total
 *   (phone: rank · name · score, tap a row for the six games), "Bạn đang hạng x/y".
 */
export function ArenaLeaderboard({ navigate, notify, learnerId, client = arenaApiClient, initialTab = "play" }: {
  navigate: (path: string) => void;
  notify: (message: string) => void;
  learnerId?: string | undefined;
  client?: Client;
  initialTab?: Tab;
}) {
  const [home, setHome] = useState<ArenaHome | null>(null);
  const [error, setError] = useState("");
  const [tab, setTab] = useState<Tab>(initialTab);
  const scene = useArenaSceneStyle();

  const load = useCallback(async () => {
    try { setHome(await client.home()); setError(""); } catch { setError("Không tải được đấu trường."); }
  }, [client]);
  useEffect(() => { void load(); }, [load]);

  const back = <AppLink className="arena-back-link" href="/games" navigate={navigate}><ArrowLeft size={16} aria-hidden="true" />Về Mini game</AppLink>;
  if (error && !home) return <div className="app-learner-page arena-page">{back}<Notice tone="danger">{error}</Notice></div>;
  if (!home) return <div className="app-learner-page arena-page">{back}<section className="card" aria-live="polite">Đang tải đấu trường…</section></div>;
  if (!home.eligible) return <div className="app-learner-page arena-page">{back}<Notice tone="warn">Đấu trường mở từ B1. Bạn đang ở mức {home.level ?? "—"}.</Notice></div>;

  const rankLine = home.rank && home.rank.of > 1 ? `Hạng ${home.rank.position}/${home.rank.of}` : "Chưa xếp hạng";
  return <div className="app-learner-page arena-page">
    {back}
    <section className="arena-banner" aria-labelledby="arena-title">
      <span className="arena-banner__scene" style={scene} aria-hidden="true" />
      <div className="arena-banner__text">
        <span className="arena-banner__eyebrow"><Trophy size={15} aria-hidden="true" />Mùa xếp hạng{home.season ? ` · đến ${dateFormat.format(new Date(`${home.season.endsOn}T00:00:00+07:00`))}` : ""}</span>
        <h1 id="arena-title" className="info-title"><span className="info-title-text">Đấu trường {home.level}</span><InfoTip label="Luật đấu trường" text={<ol className="arena-rules">{ARENA_RULES.map((rule) => <li key={rule}>{rule}</li>)}</ol>} /></h1>
        <p>{numberFormat.format(home.total)} điểm XH tổng · {rankLine}</p>
      </div>
    </section>
    <div className="tabs arena-tabs" role="tablist" aria-label="Đấu trường">
      <button type="button" role="tab" aria-selected={tab === "play"} className={tab === "play" ? "active" : ""} onClick={() => setTab("play")}>Đấu</button>
      <button type="button" role="tab" aria-selected={tab === "board"} className={tab === "board" ? "active" : ""} onClick={() => setTab("board")}>Bảng xếp hạng</button>
    </div>
    {tab === "play"
      ? <ArenaPlayTab home={home} client={client} learnerId={learnerId} navigate={navigate} notify={notify} reload={load} />
      : <ArenaBoardTab level={home.level ?? "B1"} client={client} learnerId={learnerId} />}
  </div>;
}

/* ------------------------------------------------------------------ Đấu */

function ArenaPlayTab({ home, client, learnerId, navigate, notify, reload }: {
  home: ArenaHome; client: Client; learnerId: string | undefined; navigate: (path: string) => void; notify: (message: string) => void; reload: () => Promise<void>;
}) {
  const modal = useModal();
  const [mode, setMode] = useState<"ranked" | "friendly">("ranked");
  const [game, setGame] = useState<GameKey>("scramble");
  const [busy, setBusy] = useState<string | null>(null);
  const [challenges, setChallenges] = useState<ArenaOpenChallenge[] | null>(null);
  const [opponent, setOpponent] = useState("");
  const [result, setResult] = useState<ArenaMatch | null>(null);
  const people = useArenaPeople(client, learnerId, mode === "friendly");

  const loadChallenges = useCallback(async () => {
    try { setChallenges((await client.challenges()).challenges); } catch { setChallenges([]); }
  }, [client]);
  useEffect(() => { void loadChallenges(); }, [loadChallenges]);
  const refresh = async () => { await Promise.all([reload(), loadChallenges()]); };

  const run = async (key: string, work: () => Promise<void>, failure: string) => {
    setBusy(key);
    try { await work(); } catch (reason) { notify(arenaErrorMessage(reason, failure)); } finally { setBusy(null); }
  };

  const full = home.openRanked >= home.maxOpenRanked;
  const setLine = home.set ? `${home.set.topic} · ${home.set.words} từ` : "Chưa có bộ từ";

  const post = async () => {
    if (!await modal.confirm({ title: `Đăng thách đấu ${ARENA_GAME_NAMES[game]}?`, message: `Bộ từ: ${setLine}. Có người nhận sẽ báo ở chuông; mỗi bên có 24 giờ để chơi.`, confirmLabel: "Đăng", cancelLabel: "Để sau" })) return;
    await run("post", async () => { await client.postChallenge({ requestId: crypto.randomUUID(), game }); notify(`Đã đăng thách đấu ${ARENA_GAME_NAMES[game]}.`); await refresh(); }, "Chưa đăng được thách đấu.");
  };
  const invite = async () => {
    const person = people?.find((item) => item.id === opponent);
    if (!person) return;
    await run("invite", async () => { await client.inviteFriendly({ requestId: crypto.randomUUID(), opponentId: person.id, game }); notify(`Đã mời ${person.name} giao hữu ${ARENA_GAME_NAMES[game]}.`); await refresh(); }, "Chưa gửi được lời mời.");
  };
  const take = async (challenge: ArenaOpenChallenge) => {
    if (!await modal.confirm({ title: `Nhận thách đấu ${ARENA_GAME_NAMES[challenge.game]}?`, message: `Bộ từ: ${challenge.setTopic}. Đã nhận thì phải đấu trong 24 giờ; bỏ trận tính thua.`, confirmLabel: "Nhận", cancelLabel: "Để sau" })) return;
    await run(challenge.id, async () => { const match = await client.acceptChallenge(challenge.id); navigate(`/arena/match/${match.id}`); }, "Không nhận được thách đấu.");
  };
  const accept = (match: ArenaMatch) => run(match.id, async () => { await client.answerFriendly(match.id, "accept"); navigate(`/arena/match/${match.id}`); }, "Không nhận được lời mời.");
  const decline = async (match: ArenaMatch) => {
    if (await modal.confirm({ title: "Từ chối lời mời?", message: `${match.opponent?.displayName ?? "Bạn học"} mời bạn giao hữu ${ARENA_GAME_NAMES[match.game]}.`, confirmLabel: "Từ chối", cancelLabel: "Quay lại", tone: "danger", countdownSeconds: 0 }))
      await run(match.id, async () => { await client.answerFriendly(match.id, "decline"); await refresh(); }, "Chưa từ chối được.");
  };
  const withdraw = async (match: ArenaMatch) => {
    if (await modal.confirm({ title: "Huỷ thách đấu?", message: `${ARENA_GAME_NAMES[match.game]}: chưa có ai nhận nên huỷ không mất điểm.`, confirmLabel: "Huỷ thách đấu", cancelLabel: "Giữ lại", tone: "danger", countdownSeconds: 0 }))
      await run(match.id, async () => { await client.cancel(match.id); await refresh(); }, "Chưa huỷ được thách đấu.");
  };
  const giveUp = async (match: ArenaMatch) => {
    const message = match.mode === "ranked" ? "Bỏ trận sẽ tính thua và trừ điểm xếp hạng." : "Bỏ trận giao hữu tính thua, không trừ điểm xếp hạng.";
    if (await modal.confirm({ title: "Bỏ trận?", message, confirmLabel: "Bỏ trận", cancelLabel: "Quay lại", tone: "danger" }))
      await run(match.id, async () => { await client.forfeit(match.id); await refresh(); }, "Chưa bỏ trận được.");
  };

  const rows = myMatchRows(home);
  return <div className="arena-play">
    <section className="card arena-panel" aria-labelledby="arena-start-title">
      <div className="ltabs arena-mode-tabs" role="tablist" aria-label="Chế độ">
        <button type="button" role="tab" aria-selected={mode === "ranked"} className={mode === "ranked" ? "active" : ""} onClick={() => setMode("ranked")}>Xếp hạng</button>
        <button type="button" role="tab" aria-selected={mode === "friendly"} className={mode === "friendly" ? "active" : ""} onClick={() => setMode("friendly")}>Giao hữu</button>
      </div>
      <h2 id="arena-start-title">{mode === "ranked" ? "Đăng thách đấu" : "Mời bạn giao hữu"}</h2>
      <div className="arena-field">
        <span className="arena-field__label">Chọn trò</span>
        <div className="arena-game-picks" role="radiogroup" aria-label="Chọn trò">
          {ARENA_GAMES.map((key) => <button key={key} type="button" role="radio" aria-checked={game === key} className={`arena-game-pick${game === key ? " is-selected" : ""}`} onClick={() => setGame(key)}><ArenaGameIcon game={key} />{ARENA_GAME_NAMES[key]}</button>)}
        </div>
      </div>
      {mode === "friendly" ? <label className="arena-field">
        <span className="arena-field__label">Người nhận</span>
        <select value={opponent} onChange={(event) => setOpponent(event.target.value)} aria-label="Người nhận">
          <option value="">{people ? "Chọn bạn học" : "Đang tải…"}</option>
          {(people ?? []).map((person) => <option key={person.id} value={person.id}>{person.name} · {person.level}</option>)}
        </select>
      </label> : null}
      <div className="arena-set">
        <span><small>Bộ từ đang dùng</small><b>{setLine}</b></span>
        <AppLink className="arena-set__change" href="/games" navigate={navigate}>Đổi bộ</AppLink>
      </div>
      {mode === "ranked"
        ? <>
          <button className="btn-primary arena-submit" type="button" disabled={full || busy === "post" || !home.set} aria-busy={busy === "post" || undefined} onClick={() => void post()}>{busy === "post" ? "Đang đăng…" : "Đăng thách đấu"}</button>
          {full ? <p className="small muted arena-note">Đã đủ {home.maxOpenRanked} trận đang mở. Huỷ trận đang chờ để đăng thêm.</p> : null}
        </>
        : <>
          <button className="btn-primary arena-submit" type="button" disabled={!opponent || busy === "invite" || !home.set} aria-busy={busy === "invite" || undefined} onClick={() => void invite()}>{busy === "invite" ? "Đang gửi…" : "Gửi lời mời"}</button>
          <p className="small muted arena-note">Giao hữu không tính điểm xếp hạng.</p>
        </>}
    </section>

    <section className="card arena-panel" aria-labelledby="arena-mine-title">
      <div className="arena-panel__head"><h2 id="arena-mine-title">Trận của bạn</h2><span className="badge arena-open-badge">{home.openRanked}/{home.maxOpenRanked} đang mở</span></div>
      {rows.length ? <ul className="arena-list">{rows.map((match) => {
        const rowBusy = busy === match.id;
        const text = <><span className="arena-list__icon"><ArenaGameIcon game={match.game} /></span><span className="arena-list__text"><b>{ARENA_GAME_NAMES[match.game]}{match.mode === "friendly" ? <Users className="arena-mode-icon" size={12} role="img" aria-label="Giao hữu" /> : null}</b><small>{matchStatusLine(match)}</small></span></>;
        const actions = isInviteForMe(match)
          ? <><button className="btn-primary btn-sm arena-row-action" type="button" disabled={rowBusy} onClick={() => void accept(match)}>Nhận</button><button className="btn btn-sm arena-row-action" type="button" disabled={rowBusy} onClick={() => void decline(match)}>Từ chối</button></>
          : match.postedByMe && (match.status === "open" || match.status === "invited") ? <button className="btn btn-sm arena-row-action" type="button" disabled={rowBusy} onClick={() => void withdraw(match)}>Huỷ</button>
          : match.status === "accepted" && !match.me.played ? <><AppLink className="btn btn-primary btn-sm arena-row-action" href={`/arena/match/${match.id}`} navigate={navigate}>Chơi</AppLink><button className="btn btn-sm arena-row-action" type="button" disabled={rowBusy} onClick={() => void giveUp(match)}>Bỏ trận</button></>
          : null;
        return <li key={match.id} className="arena-list__row" data-arena-row={match.status}>
          {match.status === "settled"
            ? <button type="button" className="arena-list__open" aria-label={`Xem kết quả ${ARENA_GAME_NAMES[match.game]}`} onClick={() => setResult(match)}>{text}<ChevronRight className="arena-list__chevron" size={16} aria-hidden="true" /></button>
            : <span className="arena-list__open">{text}</span>}
          {actions ? <span className="arena-row-actions">{actions}</span> : null}
        </li>;
      })}</ul> : <p className="arena-empty"><Inbox size={18} aria-hidden="true" />Chưa có trận nào.</p>}

      <h2 className="arena-panel__sub">Thách đấu đang mở</h2>
      {!challenges ? <p className="small muted">Đang tải…</p> : challenges.length ? <ul className="arena-list">{challenges.slice(0, 5).map((challenge) => <li key={challenge.id} className="arena-list__row">
        <span className="arena-list__open"><span className="arena-list__icon"><ArenaGameIcon game={challenge.game} /></span><span className="arena-list__text"><b>{ARENA_GAME_NAMES[challenge.game]}</b><small>{challenge.setTopic} · còn {hoursLeft(challenge.acceptDeadline)} giờ</small></span></span>
        <span className="arena-row-actions"><button className="btn-primary btn-sm arena-row-action" type="button" disabled={full || busy === challenge.id} onClick={() => void take(challenge)}>Nhận</button></span>
      </li>)}</ul> : <p className="arena-empty"><Inbox size={18} aria-hidden="true" />Chưa có thách đấu nào để nhận.</p>}
    </section>

    {result ? <Modal className="arena-dialog" title="Kết quả trận" onClose={() => setResult(null)} dismissOnBackdrop>
      <ArenaResultCard match={result} />
    </Modal> : null}
  </div>;
}

/** Every B1+ learner on the three boards except me, for the friendly invite. */
function useArenaPeople(client: Pick<ArenaApiClient, "leaderboard">, learnerId: string | undefined, enabled: boolean) {
  const [people, setPeople] = useState<Person[] | null>(null);
  useEffect(() => {
    if (!enabled || people) return;
    let live = true;
    Promise.all(LEVELS.map((level) => client.leaderboard({ level }).then((board) => ({ level, board })).catch(() => null))).then((boards) => {
      if (!live) return;
      const seen = new Map<string, Person>();
      for (const item of boards) for (const entry of item?.board.entries ?? []) {
        if (entry.learnerId === learnerId || (item?.board.me && !learnerId && entry.rank === item.board.me.rank && entry.rating === item.board.me.rating)) continue;
        if (!seen.has(entry.learnerId)) seen.set(entry.learnerId, { id: entry.learnerId, name: entry.displayName, level: item!.level });
      }
      setPeople([...seen.values()].sort((a, b) => a.name.localeCompare(b.name, "vi")));
    });
    return () => { live = false; };
  }, [client, enabled, learnerId, people]);
  return people;
}

/* ------------------------------------------------------------------ Bảng xếp hạng */

function usePageSize() {
  const phone = useMediaQuery("(max-width: 600px)");
  const tablet = useMediaQuery("(max-width: 1024px)");
  return phone ? 6 : tablet ? 8 : 10;
}

type Row = { learnerId: string; displayName: string; rank: number; total: number; games: Partial<Record<GameKey, number>> };

function ArenaBoardTab({ level: myLevel, client, learnerId }: { level: CefrLevel; client: Client; learnerId: string | undefined }) {
  const [level, setLevel] = useState<CefrLevel>(myLevel);
  const [sort, setSort] = useState<ArenaBoardGame>("total");
  const [boards, setBoards] = useState<Partial<Record<ArenaBoardGame, Board>> | null>(null);
  const [page, setPage] = useState(1);
  const [openRow, setOpenRow] = useState<string | null>(null);
  // The 9-column table needs desktop width; phone and tablet get one row per player that opens the six games.
  const phone = useMediaQuery("(max-width: 900px)");
  const size = usePageSize();

  useEffect(() => {
    let live = true;
    setBoards(null);
    const keys: ArenaBoardGame[] = ["total", ...ARENA_GAMES];
    Promise.all(keys.map((game) => client.leaderboard({ game, level }).then((board) => [game, board] as const).catch(() => null))).then((pairs) => {
      if (live) setBoards(Object.fromEntries(pairs.filter((pair): pair is readonly [ArenaBoardGame, Board] => Boolean(pair))));
    });
    return () => { live = false; };
  }, [client, level]);

  const rows = useMemo<Row[]>(() => {
    const ranking = boards?.[sort]?.entries ?? [];
    return ranking.map((entry) => ({
      learnerId: entry.learnerId, displayName: entry.displayName, rank: entry.rank,
      total: boards?.total?.entries.find((item) => item.learnerId === entry.learnerId)?.rating ?? 0,
      games: Object.fromEntries(ARENA_GAMES.map((game) => [game, boards?.[game]?.entries.find((item) => item.learnerId === entry.learnerId)?.rating])) as Row["games"]
    }));
  }, [boards, sort]);
  useEffect(() => { setPage(1); setOpenRow(null); }, [sort, level]);

  const pages = Math.max(1, Math.ceil(rows.length / size));
  const current = Math.min(page, pages);
  const visible = rows.slice((current - 1) * size, current * size);
  const me = boards?.[sort]?.me ?? null;
  const isMe = (row: Row) => learnerId ? row.learnerId === learnerId : Boolean(me && row.rank === me.rank && (sort === "total" ? row.total : row.games[sort as GameKey]) === me.rating);
  const score = (row: Row) => sort === "total" ? row.total : row.games[sort as GameKey] ?? 0;

  return <section className="card arena-panel arena-board" aria-label="Bảng xếp hạng">
    <div className="arena-board__filters">
      <div className="chips" role="group" aria-label="Xếp theo">
        {(["total", ...ARENA_GAMES] as ArenaBoardGame[]).map((key) => <button key={key} type="button" className={`chip arena-filter${sort === key ? " is-active" : ""}`} aria-pressed={sort === key} onClick={() => setSort(key)}>{key === "total" ? "Tổng" : ARENA_GAME_NAMES[key]}</button>)}
      </div>
      <select className="arena-board__level" aria-label="Cấp" value={level} onChange={(event) => setLevel(event.target.value as CefrLevel)}>{LEVELS.map((item) => <option key={item} value={item}>{item}</option>)}</select>
    </div>
    {!boards ? <p className="small muted" aria-live="polite">Đang tải…</p> : !rows.length ? <p className="arena-empty"><Inbox size={18} aria-hidden="true" />Chưa ai đấu trong mùa này.</p> : phone
      ? <ol className="arena-list arena-board-list">{visible.map((row) => {
        const open = openRow === row.learnerId;
        return <li key={row.learnerId} className={`arena-board-row${isMe(row) ? " is-me" : ""}`} aria-current={isMe(row) || undefined}>
          <button type="button" className="arena-board-row__main" aria-expanded={open} onClick={() => setOpenRow(open ? null : row.learnerId)}>
            <RankPill rank={row.rank} /><span className="arena-board-row__name">{isMe(row) ? "Bạn" : row.displayName}</span><b>{numberFormat.format(score(row))}</b><ChevronDown className={`arena-board-row__chev${open ? " is-open" : ""}`} size={16} aria-hidden="true" />
          </button>
          {open ? <dl className="arena-board-row__games">{ARENA_GAMES.map((game) => <div key={game}><dt>{ARENA_GAME_NAMES[game]}</dt><dd>{numberFormat.format(row.games[game] ?? 0)}</dd></div>)}<div><dt>Tổng</dt><dd><b>{numberFormat.format(row.total)}</b></dd></div></dl> : null}
        </li>;
      })}</ol>
      : <div className="arena-table-wrap"><table className="arena-table">
        <thead><tr><th scope="col">Hạng</th><th scope="col">Người chơi</th>{ARENA_GAMES.map((game) => <th scope="col" key={game} className={sort === game ? "is-sorted" : ""}>{ARENA_GAME_NAMES[game]}</th>)}<th scope="col" className={sort === "total" ? "is-sorted" : ""}>Tổng</th></tr></thead>
        <tbody>{visible.map((row) => <tr key={row.learnerId} className={isMe(row) ? "is-me" : ""} aria-current={isMe(row) || undefined}>
          <td><RankPill rank={row.rank} /></td>
          <td className="arena-table__name">{isMe(row) ? "Bạn" : row.displayName}</td>
          {ARENA_GAMES.map((game) => <td key={game} className={sort === game ? "is-sorted" : ""}>{numberFormat.format(row.games[game] ?? 0)}</td>)}
          <td className={`arena-table__total${sort === "total" ? " is-sorted" : ""}`}>{numberFormat.format(row.total)}</td>
        </tr>)}</tbody>
      </table></div>}
    {rows.length ? <Pager page={current} pages={pages} setPage={setPage} label="xếp hạng" /> : null}
    <div className="arena-board__foot">
      <b>{me && rows.length > 1 && level === myLevel ? `Bạn đang hạng ${me.rank}/${me.of}` : level === myLevel ? "Chưa xếp hạng" : `Xếp hạng ${level}`}</b>
      <span className="small muted"><CircleHelp size={13} aria-hidden="true" /> Bằng điểm thì đồng hạng.</span>
    </div>
  </section>;
}

function RankPill({ rank }: { rank: number }) {
  const medal = rank === 1 ? " is-gold" : rank === 2 ? " is-silver" : rank === 3 ? " is-bronze" : "";
  return <span className={`arena-rank${medal}`} aria-label={`Hạng ${rank}`}>{rank}</span>;
}
