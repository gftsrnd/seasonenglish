import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import type { CefrLevel, GameHubView, GameKey } from "@e4s/contracts";
import { ArrowLeft, ChevronDown, ChevronRight, Inbox, Users } from "lucide-react";
import { arenaApiClient, type ArenaApiClient, type ArenaBoardGame, type ArenaHome, type ArenaLeaderboard as Board, type ArenaMatch, type ArenaOpenChallenge } from "../../../api/arena.js";
import { learnerApiClient, type LearnerApiClient } from "../../../api/learner.js";
import { useModal } from "../../shared/ModalProvider.js";
import { Pager } from "../../shared/Pager.js";
import { useMediaQuery } from "../../shared/useMediaQuery.js";
import { AppLink, Modal, Notice } from "../ui.js";
import { ArenaGameIcon } from "./ArenaGameIcon.js";
import { myMatchRows } from "./ArenaHub.js";
import { ArenaResultCard } from "./ArenaResultCard.js";
import { ArenaWords } from "./ArenaWords.js";
import { ArenaCountdown } from "./ArenaCountdown.js";
import { ARENA_GAMES, ARENA_GAME_NAMES, isInviteForMe, matchDeadline, matchStatusLabel } from "./arena-text.js";
import { arenaErrorMessage } from "./useArenaQuickMatch.js";
import "../../shared/request-workspace.css";
import "./arena.css";

type Client = Pick<ArenaApiClient, "home" | "leaderboard" | "challenges" | "postChallenge" | "acceptChallenge" | "inviteFriendly" | "answerFriendly" | "cancel" | "forfeit" | "words">;
type SetClient = Pick<LearnerApiClient, "getGames" | "generateGameWordSet" | "useWeeklyGameWordSet">;
type Tab = "play" | "board";
type Person = { id: string; name: string; level: CefrLevel };

const numberFormat = new Intl.NumberFormat("vi-VN");
const dateFormat = new Intl.DateTimeFormat("vi-VN", { day: "2-digit", month: "2-digit", year: "numeric" });
const LEVELS: CefrLevel[] = ["B1", "B2", "C1"];
const TAB_TITLES: Record<Tab, string> = { play: "Thi đấu", board: "Bảng xếp hạng" };

/** Vocabulary arena with separate play and leaderboard tabs. */
export function ArenaLeaderboard({ navigate, notify, learnerId, client = arenaApiClient, setClient = learnerApiClient, initialTab = "play" }: {
  navigate: (path: string) => void;
  notify: (message: string) => void;
  learnerId?: string | undefined;
  client?: Client;
  setClient?: SetClient;
  initialTab?: Tab;
}) {
  const [home, setHome] = useState<ArenaHome | null>(null);
  const [error, setError] = useState("");
  const [tab, setTab] = useState<Tab>(initialTab);

  const load = useCallback(async () => {
    try { setHome(await client.home()); setError(""); } catch { setError("Không tải được đấu trường."); }
  }, [client]);
  useEffect(() => { void load(); }, [load]);

  const back = <AppLink className="btn arena-back-button" href="/games" navigate={navigate}><ArrowLeft size={16} aria-hidden="true" />Về Game từ vựng</AppLink>;
  const simpleHeader = <header className="page-title arena-page-title"><div><h1>Đấu trường từ vựng</h1></div>{back}</header>;
  if (error && !home) return <div className="app-learner-page arena-page">{simpleHeader}<Notice tone="danger">{error}</Notice></div>;
  if (!home) return <div className="app-learner-page arena-page">{simpleHeader}<section className="card" aria-live="polite">Đang tải đấu trường…</section></div>;
  if (!home.eligible) return <div className="app-learner-page arena-page">{simpleHeader}<Notice tone="warn">Đấu trường mở từ B1. Bạn đang ở mức {home.level ?? "—"}.</Notice></div>;

  return <div className="app-learner-page arena-page">
    <header className="page-title arena-page-title"><div>
      <h1>Đấu trường từ vựng</h1>
      <p className="muted">Thách đấu bạn cùng cấp bằng bộ từ đang học và leo bảng xếp hạng mùa.</p>
    </div>{back}</header>
    <nav className="request-tabs arena-tabs" aria-label="Đấu trường">
      {(["play", "board"] as Tab[]).map((key) => <a key={key} href={key === "board" ? "/arena?tab=board" : "/arena"} role="tab" aria-selected={tab === key} aria-current={tab === key ? "page" : undefined} onClick={(event) => { event.preventDefault(); setTab(key); }}><span>{TAB_TITLES[key]}</span></a>)}
    </nav>
    {tab === "play"
      ? <ArenaPlayTab home={home} client={client} setClient={setClient} learnerId={learnerId} navigate={navigate} notify={notify} reload={load} />
      : <ArenaBoardTab level={home.level ?? "B1"} season={home.season} client={client} learnerId={learnerId} />}
  </div>;
}

/* ------------------------------------------------------------------ Giao đấu */

function ArenaPlayTab({ home, client, setClient, learnerId, navigate, notify, reload }: {
  home: ArenaHome; client: Client; setClient: SetClient; learnerId: string | undefined; navigate: (path: string) => void; notify: (message: string) => void; reload: () => Promise<void>;
}) {
  const modal = useModal();
  const [mode, setMode] = useState<"ranked" | "friendly">("ranked");
  const [game, setGame] = useState<GameKey>("scramble");
  const [busy, setBusy] = useState<string | null>(null);
  const [challenges, setChallenges] = useState<ArenaOpenChallenge[] | null>(null);
  const [opponent, setOpponent] = useState("");
  const [result, setResult] = useState<ArenaMatch | null>(null);
  const [wordsFor, setWordsFor] = useState<string | null>(null);
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
  const wordsToggle = (id: string) => <button type="button" className="btn btn-sm arena-row-action" aria-expanded={wordsFor === id} onClick={() => setWordsFor(wordsFor === id ? null : id)}>{wordsFor === id ? "Ẩn từ" : "Xem từ"}</button>;

  const rows = myMatchRows(home);
  return <>
    <section className="card games-section-card arena-panel" aria-labelledby="arena-start-title">
      <div className="arena-panel__head">
        <h2 id="arena-start-title">{mode === "ranked" ? "Đăng thách đấu" : "Mời bạn giao hữu"}</h2>
        <div className="ltabs arena-mode-tabs" role="tablist" aria-label="Chế độ">
          <button type="button" role="tab" aria-selected={mode === "ranked"} className={mode === "ranked" ? "active" : ""} onClick={() => setMode("ranked")}>Xếp hạng</button>
          <button type="button" role="tab" aria-selected={mode === "friendly"} className={mode === "friendly" ? "active" : ""} onClick={() => setMode("friendly")}>Giao hữu</button>
        </div>
      </div>
      <div className="arena-field">
        <div className="arena-game-picks" role="radiogroup" aria-label="Chọn trò">
          {ARENA_GAMES.map((key) => <button key={key} type="button" role="radio" aria-checked={game === key} className={`arena-game-pick${game === key ? " is-selected" : ""}`} onClick={() => setGame(key)}><ArenaGameIcon game={key} />{ARENA_GAME_NAMES[key]}</button>)}
        </div>
      </div>
      {mode === "friendly" ? <label className="arena-field">
        <select value={opponent} onChange={(event) => setOpponent(event.target.value)} aria-label="Người nhận">
          <option value="">{people ? "Chọn người nhận" : "Đang tải bạn học…"}</option>
          {(people ?? []).map((person) => <option key={person.id} value={person.id}>{person.name} · {person.level}</option>)}
        </select>
      </label> : null}
      <ArenaSetBlock setClient={setClient} notify={notify} onChanged={reload} />
      <div className="arena-submit-row">
        {mode === "ranked"
          ? <><button className="btn-primary arena-submit" type="button" disabled={full || busy === "post" || !home.set} aria-busy={busy === "post" || undefined} onClick={() => void post()}>{busy === "post" ? "Đang đăng…" : "Đăng thách đấu"}</button>
            {full ? <span className="small muted">Đã đủ {home.maxOpenRanked} trận đang mở. Huỷ trận đang chờ để đăng thêm.</span> : null}</>
          : <><button className="btn-primary arena-submit" type="button" disabled={!opponent || busy === "invite" || !home.set} aria-busy={busy === "invite" || undefined} onClick={() => void invite()}>{busy === "invite" ? "Đang gửi…" : "Gửi lời mời"}</button>
            <span className="small muted">Giao hữu không tính điểm xếp hạng.</span></>}
      </div>
    </section>

    <section className="card games-section-card arena-panel" aria-labelledby="arena-mine-title">
      <div className="arena-panel__head"><h2 id="arena-mine-title">Trận của bạn</h2><span className="badge arena-open-badge">{home.openRanked}/{home.maxOpenRanked} đang mở</span></div>
      {rows.length ? <ul className="arena-list">{rows.map((match) => {
        const rowBusy = busy === match.id;
        const text = <><span className="arena-list__icon"><ArenaGameIcon game={match.game} /></span><span className="arena-list__text"><b>{ARENA_GAME_NAMES[match.game]}{match.mode === "friendly" ? <Users className="arena-mode-icon" size={12} role="img" aria-label="Giao hữu" /> : null}</b><small>{match.setTopic} · {matchStatusLabel(match)}{matchDeadline(match) ? <> · <ArenaCountdown until={matchDeadline(match)} /></> : null}</small></span></>;
        const canReview = match.status !== "settled";
        const actions = isInviteForMe(match)
          ? <><button className="btn-primary btn-sm arena-row-action" type="button" disabled={rowBusy} onClick={() => void accept(match)}>Nhận</button><button className="btn btn-sm arena-row-action" type="button" disabled={rowBusy} onClick={() => void decline(match)}>Từ chối</button></>
          : match.postedByMe && (match.status === "open" || match.status === "invited") ? <button className="btn btn-sm arena-row-action" type="button" disabled={rowBusy} onClick={() => void withdraw(match)}>Huỷ</button>
          : match.status === "accepted" && !match.me.played ? <><AppLink className="btn btn-primary btn-sm arena-row-action" href={`/arena/match/${match.id}`} navigate={navigate}>Chơi</AppLink><button className="btn btn-sm arena-row-action" type="button" disabled={rowBusy} onClick={() => void giveUp(match)}>Bỏ trận</button></>
          : null;
        return <li key={match.id} className="arena-list__row" data-arena-row={match.status}>
          <div className="arena-list__line">
            {match.status === "settled"
              ? <button type="button" className="arena-list__open" aria-label={`Xem kết quả ${ARENA_GAME_NAMES[match.game]}`} onClick={() => setResult(match)}>{text}<ChevronRight className="arena-list__chevron" size={16} aria-hidden="true" /></button>
              : <span className="arena-list__open">{text}</span>}
            {canReview || actions ? <span className="arena-row-actions">{canReview ? wordsToggle(match.id) : null}{actions}</span> : null}
          </div>
          {wordsFor === match.id ? <ArenaWords matchId={match.id} client={client} /> : null}
        </li>;
      })}</ul> : <p className="arena-empty"><Inbox size={18} aria-hidden="true" />Chưa có trận nào.</p>}

      <h2 className="arena-panel__sub" id="arena-open-title">Thách đấu đang mở</h2>
      {!challenges ? <p className="small muted">Đang tải…</p> : challenges.length ? <ul className="arena-list" aria-labelledby="arena-open-title">{challenges.slice(0, 5).map((challenge) => <li key={challenge.id} className="arena-list__row">
        <div className="arena-list__line">
          <span className="arena-list__open"><span className="arena-list__icon"><ArenaGameIcon game={challenge.game} /></span><span className="arena-list__text"><b>{ARENA_GAME_NAMES[challenge.game]}</b><small>{challenge.setTopic} · <ArenaCountdown until={challenge.acceptDeadline} /></small></span></span>
          <span className="arena-row-actions">{wordsToggle(challenge.id)}<button className="btn-primary btn-sm arena-row-action" type="button" disabled={full || busy === challenge.id} onClick={() => void take(challenge)}>Nhận</button></span>
        </div>
        {wordsFor === challenge.id ? <ArenaWords matchId={challenge.id} client={client} /> : null}
      </li>)}</ul> : <p className="arena-empty"><Inbox size={18} aria-hidden="true" />Chưa có thách đấu nào để nhận.</p>}
    </section>

    {result ? <Modal className="arena-dialog" title="Kết quả trận" onClose={() => setResult(null)} dismissOnBackdrop>
      <ArenaResultCard match={result} />
    </Modal> : null}
  </>;
}

/** "Bộ từ đang dùng" inside the challenge card: the Mini game set, its words on demand, and changing it right here. */
function ArenaSetBlock({ setClient, notify, onChanged }: { setClient: SetClient; notify: (message: string) => void; onChanged: () => Promise<void> }) {
  const [hub, setHub] = useState<GameHubView | null>(null);
  const [failed, setFailed] = useState(false);
  const [editing, setEditing] = useState(false);
  const [showWords, setShowWords] = useState(false);
  const [topic, setTopic] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    let live = true;
    setClient.getGames().then((next) => { if (live) setHub(next); }).catch(() => { if (live) setFailed(true); });
    return () => { live = false; };
  }, [setClient]);
  const apply = async (work: () => Promise<GameHubView>, done: string) => {
    setBusy(true);
    try { const next = await work(); setHub(next); setEditing(false); setTopic(""); notify(done); await onChanged(); }
    catch { notify("Chưa đổi được bộ từ. Hãy thử chủ đề khác."); }
    finally { setBusy(false); }
  };
  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (!topic.trim()) return;
    void apply(() => setClient.generateGameWordSet({ requestId: crypto.randomUUID(), topic: topic.trim() }), "Đã tạo bộ từ mới cho Mini game và Đấu trường.");
  };
  const words = hub?.wordSet?.words ?? [];
  return <div className="arena-set">
    <div className="arena-set__row">
      <span><small>Bộ từ đang dùng</small><b>{failed ? "Không tải được bộ từ" : !hub ? "Đang tải…" : hub.wordSet ? `${hub.wordSet.topic} · ${words.length} từ` : "Chưa có bộ từ"}</b></span>
      <span className="arena-set__actions">
        {words.length ? <button type="button" className="btn btn-sm" aria-expanded={showWords} onClick={() => setShowWords((open) => !open)}>{showWords ? "Ẩn từ" : "Xem từ"}</button> : null}
        <button type="button" className="btn btn-sm" aria-expanded={editing} onClick={() => setEditing((open) => !open)}>{editing ? "Đóng" : "Đổi bộ"}</button>
      </span>
    </div>
    {showWords && words.length ? <ul className="arena-word-chips" aria-label="Từ của bộ đang dùng">{words.map((word) => <li key={word.id}><b>{word.english}</b> · {word.vietnamese}</li>)}</ul> : null}
    {editing ? <div className="arena-set-edit">
      {hub?.aiAvailable ? <form className="arena-set-form" onSubmit={submit}>
        <input aria-label="Chủ đề bộ từ" placeholder="1–3 từ tiếng Anh, ví dụ coffee shop" value={topic} disabled={busy} onChange={(event) => setTopic(event.target.value)} />
        <button className="btn-primary" type="submit" disabled={busy || !topic.trim()} aria-busy={busy || undefined}>{busy ? "Đang tạo…" : "Tạo bộ từ"}</button>
      </form> : null}
      {hub?.learnedVocabularyAvailable ? <button className="btn btn-sm" type="button" disabled={busy} onClick={() => void apply(() => setClient.useWeeklyGameWordSet(), "Đã dùng từ đã học trong tháng.")}>Dùng từ đã học trong tháng</button> : null}
      <p className="small muted">Bộ mới cũng là bộ của Mini game.</p>
    </div> : null}
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
        if (entry.learnerId === learnerId) continue;
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

function ArenaBoardTab({ level: myLevel, season, client, learnerId }: { level: CefrLevel; season: ArenaHome["season"]; client: Client; learnerId: string | undefined }) {
  const [level, setLevel] = useState<CefrLevel>(myLevel);
  const [sort, setSort] = useState<ArenaBoardGame>("total");
  const [seasonId, setSeasonId] = useState("");
  const [pastSeasons, setPastSeasons] = useState<NonNullable<Board["seasons"]>>([]);
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
    Promise.all(keys.map((game) => client.leaderboard({ game, level, ...(seasonId ? { season: seasonId } : {}) }).then((board) => [game, board] as const).catch(() => null))).then((pairs) => {
      if (!live) return;
      const nextBoards = Object.fromEntries(pairs.filter((pair): pair is readonly [ArenaBoardGame, Board] => Boolean(pair)));
      setBoards(nextBoards);
      if (nextBoards.total?.seasons) setPastSeasons(nextBoards.total.seasons);
    });
    return () => { live = false; };
  }, [client, level, seasonId]);

  const rows = useMemo<Row[]>(() => {
    const ranking = boards?.[sort]?.entries ?? [];
    return ranking.map((entry) => ({
      learnerId: entry.learnerId, displayName: entry.displayName, rank: entry.rank,
      total: boards?.total?.entries.find((item) => item.learnerId === entry.learnerId)?.rating ?? 0,
      games: Object.fromEntries(ARENA_GAMES.map((game) => [game, boards?.[game]?.entries.find((item) => item.learnerId === entry.learnerId)?.rating])) as Row["games"]
    }));
  }, [boards, sort]);
  useEffect(() => { setPage(1); setOpenRow(null); }, [sort, level, seasonId]);

  const pages = Math.max(1, Math.ceil(rows.length / size));
  const current = Math.min(page, pages);
  const visible = rows.slice((current - 1) * size, current * size);
  const me = boards?.[sort]?.me ?? null;
  const isMe = (row: Row) => row.learnerId === learnerId;
  const score = (row: Row) => sort === "total" ? row.total : row.games[sort as GameKey] ?? 0;
  const shownSeason = seasonId ? pastSeasons.find((item) => item.id === seasonId) ?? null : season;
  const seasonEnd = shownSeason ? dateFormat.format(new Date(`${shownSeason.endsOn}T00:00:00+07:00`)) : "";

  return <section className="card games-section-card arena-panel arena-board" aria-label="Bảng xếp hạng">
    <div className="arena-board__filters">
      <select className="arena-board__filter" aria-label="Cấp" value={level} onChange={(event) => setLevel(event.target.value as CefrLevel)}>{LEVELS.map((item) => <option key={item} value={item}>Cấp {item}</option>)}</select>
      <select className="arena-board__filter" aria-label="Trò" value={sort} onChange={(event) => setSort(event.target.value as ArenaBoardGame)}><option value="total">Tổng 6 trò</option>{ARENA_GAMES.map((key) => <option key={key} value={key}>{ARENA_GAME_NAMES[key]}</option>)}</select>
      <select className="arena-board__filter" aria-label="Mùa" value={seasonId} onChange={(event) => setSeasonId(event.target.value)}>
        <option value="">{season ? "Mùa hiện tại" : "Chưa mở mùa"}</option>
        {pastSeasons.map((item) => <option key={item.id} value={item.id}>Mùa {dateFormat.format(new Date(`${item.startsOn}T00:00:00+07:00`))} – {dateFormat.format(new Date(`${item.endsOn}T00:00:00+07:00`))}</option>)}
      </select>
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
    {rows.length ? <div className="arena-board__pager"><Pager page={current} pages={pages} setPage={setPage} label="xếp hạng" /></div> : null}
    <div className="arena-board__foot">
      <b>{me && rows.length > 1 && level === myLevel ? `Bạn đang hạng ${me.rank}/${me.of} · ${numberFormat.format(me.rating)} điểm` : level === myLevel ? "Chưa xếp hạng" : `Xếp hạng ${level}`}</b>
      <span className="small muted">{seasonEnd ? `Mùa kết thúc ${seasonEnd} · ` : ""}Bằng điểm: ai đạt trước xếp trên.</span>
    </div>
  </section>;
}

function RankPill({ rank }: { rank: number }) {
  const medal = rank === 1 ? " is-gold" : rank === 2 ? " is-silver" : rank === 3 ? " is-bronze" : "";
  return <span className={`arena-rank${medal}`} aria-label={`Hạng ${rank}`}>{rank}</span>;
}
