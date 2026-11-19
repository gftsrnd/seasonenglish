import { useCallback, useEffect, useMemo, useState } from "react";
import type { CefrLevel, GameKey } from "@e4s/contracts";
import { ChevronRight, Swords, Trophy, Users } from "lucide-react";
import { arenaApiClient, type ArenaApiClient, type ArenaHome, type ArenaMatch } from "../../../api/arena.js";
import { InfoTip } from "../../shared/CompactUi.js";
import { useToast } from "../../shared/design-system.js";
import { useModal } from "../../shared/ModalProvider.js";
import { AppLink, Modal, Notice } from "../ui.js";
import { ArenaGameIcon } from "./ArenaGameIcon.js";
import { ArenaResultCard } from "./ArenaResultCard.js";
import { ARENA_GAMES, ARENA_GAME_NAMES, ARENA_RULES, arenaEligible, isInviteForMe, isMyTurn, matchStatusLine } from "./arena-text.js";
import { arenaErrorMessage } from "./useArenaQuickMatch.js";
import "./arena.css";

export { arenaEligible };

type Client = Pick<ArenaApiClient, "home" | "quickMatch" | "answerFriendly" | "cancel" | "forfeit" | "inviteFriendly" | "leaderboard">;
type Person = { id: string; name: string; level: CefrLevel };

/** "Trận của bạn": at most 3 live rows (invites to me, my turn, waiting), then the latest results. Withdrawn, expired and declined matches drop out. */
export function myMatchRows(home: ArenaHome): ArenaMatch[] {
  const live = [...home.matches.open, ...home.matches.active];
  const rank = (match: ArenaMatch) => isInviteForMe(match) ? 0 : isMyTurn(match) ? 1 : 2;
  const ordered = [...live].sort((a, b) => rank(a) - rank(b));
  const results = home.matches.done.filter((match) => match.status === "settled" && match.result);
  return [...ordered, ...results].slice(0, 3);
}

/** Every B1+ learner on the three boards except me, for the friendly invite search. */
export function useArenaPeople(client: Pick<ArenaApiClient, "leaderboard">, learnerId: string | undefined, enabled: boolean) {
  const [people, setPeople] = useState<Person[] | null>(null);
  useEffect(() => {
    if (!enabled || people) return;
    let live = true;
    const levels: CefrLevel[] = ["B1", "B2", "C1"];
    Promise.all(levels.map((level) => client.leaderboard({ level }).then((board) => ({ level, board })).catch(() => null))).then((boards) => {
      if (!live) return;
      const seen = new Map<string, Person>();
      for (const item of boards) for (const entry of item?.board.entries ?? []) {
        if (entry.learnerId === learnerId || seen.has(entry.learnerId)) continue;
        seen.set(entry.learnerId, { id: entry.learnerId, name: entry.displayName, level: item!.level });
      }
      setPeople([...seen.values()].sort((a, b) => a.name.localeCompare(b.name, "vi")));
    });
    return () => { live = false; };
  }, [client, enabled, learnerId, people]);
  return people;
}

/**
 * Mini game › "4. Đấu trường" (owner, 19/11): the arena lives inside the Mini game page and uses the
 * word set of section 2. Pick a game → Đấu xếp hạng (confirm) joins an open challenge and plays at
 * once, or posts one and stays here (the bell tells when someone accepts) – no waiting screen.
 * Mời giao hữu opens a name search inside the card (no popup). "Trận của bạn" keeps ≤ 3 rows.
 */
export function ArenaSection({ level, setTopic, hasWords, learnerId, navigate, compact = false, client = arenaApiClient }: {
  level: CefrLevel | null | undefined;
  /** Phone/tablet Mini game drops the step numbers and keeps the word set in "Bộ từ đang chơi". */
  compact?: boolean;
  setTopic: string | null;
  hasWords: boolean;
  learnerId?: string | undefined;
  navigate: (path: string) => void;
  client?: Client;
}) {
  const eligible = arenaEligible(level);
  const modal = useModal();
  const toast = useToast();
  const notify = useCallback((message: string) => toast.show({ message, tone: "info", variant: "learner", durationMs: 4_000 }), [toast]);
  const [home, setHome] = useState<ArenaHome | null>(null);
  const [failed, setFailed] = useState(false);
  const [game, setGame] = useState<GameKey>("scramble");
  const [busy, setBusy] = useState<string | null>(null);
  const [inviting, setInviting] = useState(false);
  const [query, setQuery] = useState("");
  const [picked, setPicked] = useState<string | null>(null);
  const [result, setResult] = useState<ArenaMatch | null>(null);
  const people = useArenaPeople(client, learnerId, inviting);

  const load = useCallback(async () => {
    try { setHome(await client.home()); setFailed(false); } catch { setFailed(true); }
  }, [client]);
  useEffect(() => { if (eligible) void load(); }, [eligible, load]);

  const run = async (key: string, work: () => Promise<void>, failure: string) => {
    setBusy(key);
    try { await work(); } catch (reason) { notify(arenaErrorMessage(reason, failure)); } finally { setBusy(null); }
  };

  const play = async (key: GameKey) => {
    const ok = await modal.confirm({
      title: `Đấu xếp hạng ${ARENA_GAME_NAMES[key]}?`,
      message: <ul className="arena-confirm-list"><li>Bộ từ: {setTopic ?? "bộ đang chọn"}.</li><li>Có người đang chờ thì vào chơi ngay; chưa có thì đăng thách đấu, có người nhận sẽ báo ở chuông.</li><li>Có người nhận thì mỗi bên có 24 giờ để chơi; bỏ trận tính thua.</li></ul>,
      confirmLabel: "Đấu", cancelLabel: "Để sau"
    });
    if (!ok) return;
    await run("play", async () => {
      const { joined, match } = await client.quickMatch({ requestId: crypto.randomUUID(), game: key });
      if (joined) { navigate(`/arena/match/${match.id}`); return; }
      notify(`Đã đăng thách đấu ${ARENA_GAME_NAMES[key]}. Có người nhận sẽ báo ở chuông.`);
      setResult(null);
      await load();
    }, "Chưa vào được trận. Vui lòng thử lại.");
  };

  const sendInvite = async () => {
    if (!picked) return;
    await run("invite", async () => {
      await client.inviteFriendly({ requestId: crypto.randomUUID(), opponentId: picked, game });
      notify(`Đã mời giao hữu ${ARENA_GAME_NAMES[game]}.`);
      setInviting(false); setPicked(null); setQuery("");
      await load();
    }, "Chưa gửi được lời mời.");
  };

  const accept = (match: ArenaMatch) => run(match.id, async () => { await client.answerFriendly(match.id, "accept"); navigate(`/arena/match/${match.id}`); }, "Không nhận được lời mời.");
  const decline = async (match: ArenaMatch) => {
    if (await modal.confirm({ title: "Từ chối lời mời?", message: `${match.opponent?.displayName ?? "Bạn học"} mời bạn giao hữu ${ARENA_GAME_NAMES[match.game]}.`, confirmLabel: "Từ chối", cancelLabel: "Quay lại", tone: "danger", countdownSeconds: 0 }))
      await run(match.id, async () => { await client.answerFriendly(match.id, "decline"); await load(); }, "Chưa từ chối được.");
  };
  const withdraw = async (match: ArenaMatch) => {
    if (await modal.confirm({ title: "Huỷ thách đấu?", message: `${ARENA_GAME_NAMES[match.game]}: chưa có ai nhận nên huỷ không mất điểm.`, confirmLabel: "Huỷ thách đấu", cancelLabel: "Giữ lại", tone: "danger", countdownSeconds: 0 }))
      await run(match.id, async () => { await client.cancel(match.id); await load(); }, "Chưa huỷ được thách đấu.");
  };
  const giveUp = async (match: ArenaMatch) => {
    const message = match.mode === "ranked" ? "Bỏ trận sẽ tính thua và trừ điểm xếp hạng." : "Bỏ trận giao hữu tính thua, không trừ điểm xếp hạng.";
    if (await modal.confirm({ title: "Bỏ trận?", message, confirmLabel: "Bỏ trận", cancelLabel: "Quay lại", tone: "danger" }))
      await run(match.id, async () => { await client.forfeit(match.id); await load(); }, "Chưa bỏ trận được.");
  };

  const filtered = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase("vi");
    return (people ?? []).filter((person) => person.name.toLocaleLowerCase("vi").includes(needle)).slice(0, 5);
  }, [people, query]);

  const title = <h2 id="arena-section-title" className="info-title"><span className="info-title-text">{compact ? "" : "4. "}Đấu trường{eligible && level ? ` ${level}` : ""}</span>{eligible ? <InfoTip label="Luật đấu trường" text={<ol className="arena-rules">{ARENA_RULES.map((rule) => <li key={rule}>{rule}</li>)}</ol>} /> : null}</h2>;

  if (!eligible) return <section className="card games-section-card arena-section-card is-locked" aria-labelledby="arena-section-title">
    <div className="arena-section-head"><span className="arena-section-icon" aria-hidden="true"><Swords size={20} /></span>{title}</div>
    <p className="small muted">Mở từ B1. Bạn đang ở mức {level ?? "—"}.</p>
  </section>;

  const rows = home ? myMatchRows(home) : [];
  const full = Boolean(home && home.openRanked >= home.maxOpenRanked);
  return <section className="card games-section-card arena-section-card" aria-labelledby="arena-section-title">
    <div className="arena-section-head">
      <span className="arena-section-icon" aria-hidden="true"><Swords size={20} /></span>
      {title}
      <AppLink className="arena-board-link" href="/arena" navigate={navigate}><Trophy size={15} aria-hidden="true" />Bảng xếp hạng<ChevronRight size={15} aria-hidden="true" /></AppLink>
    </div>
    {!hasWords ? <Notice>Chọn bộ từ trước khi đấu.</Notice> : <>
      <p className="small muted arena-section-lead">Đấu bằng bộ từ <b>{setTopic}</b>{compact ? " đang chơi." : " ở mục 2."}</p>
      {full ? <Notice tone="warn">Bạn đã có {home!.maxOpenRanked} trận xếp hạng đang mở. Chơi xong hoặc huỷ bớt để đấu tiếp.</Notice> : null}
      <div className="arena-start-row">
        <select aria-label="Chọn trò để đấu" value={game} onChange={(event) => setGame(event.target.value as GameKey)}>
          {ARENA_GAMES.map((key) => <option key={key} value={key}>{ARENA_GAME_NAMES[key]}</option>)}
        </select>
        <button className="btn-primary arena-start-button" type="button" disabled={full || busy === "play"} aria-busy={busy === "play" || undefined} onClick={() => void play(game)}><Swords size={16} aria-hidden="true" />{busy === "play" ? "Đang vào…" : "Đấu xếp hạng"}</button>
        <button className="btn arena-start-button" type="button" aria-expanded={inviting} onClick={() => { setInviting((open) => !open); setPicked(null); }}><Users size={16} aria-hidden="true" />Mời giao hữu</button>
      </div>
      {inviting ? <div className="arena-invite-inline" role="group" aria-label="Mời giao hữu">
        <input type="search" aria-label="Tìm bạn học" placeholder="Nhập tên bạn học" value={query} onChange={(event) => { setQuery(event.target.value); setPicked(null); }} />
        {!people ? <p className="small muted">Đang tải…</p> : filtered.length ? <ul className="arena-list" role="listbox" aria-label="Bạn học">{filtered.map((person) => <li key={person.id} className={`arena-list__row${picked === person.id ? " is-me" : ""}`}>
          <button type="button" role="option" aria-selected={picked === person.id} className="arena-list__open" onClick={() => setPicked(person.id)}><span className="arena-list__text"><b>{person.name}</b></span><small className="muted">{person.level}</small></button>
        </li>)}</ul> : <p className="small muted">Không tìm thấy bạn học.</p>}
        <div className="arena-invite-inline__actions">
          <span className="small muted">Giao hữu {ARENA_GAME_NAMES[game]} · không tính điểm xếp hạng</span>
          <button className="btn btn-sm" type="button" onClick={() => setInviting(false)}>Đóng</button>
          <button className="btn-primary btn-sm" type="button" disabled={!picked || busy === "invite"} aria-busy={busy === "invite" || undefined} onClick={() => void sendInvite()}>Gửi lời mời</button>
        </div>
      </div> : null}
    </>}
    <h3 className="arena-subhead">Trận của bạn</h3>
    {failed ? <p className="small muted">Không tải được trận đấu.</p> : !home ? <p className="small muted" aria-live="polite">Đang tải…</p> : rows.length ? <ul className="arena-list">{rows.map((match) => {
      const settled = match.status === "settled";
      const rowBusy = busy === match.id;
      const text = <><ArenaGameIcon game={match.game} /><span className="arena-list__text"><b>{ARENA_GAME_NAMES[match.game]}{match.mode === "ranked" ? <Trophy className="arena-mode-icon" size={12} role="img" aria-label="Xếp hạng" /> : <Users className="arena-mode-icon" size={12} role="img" aria-label="Giao hữu" />}</b><small>{matchStatusLine(match)}</small></span></>;
      const actions = isInviteForMe(match)
        ? <><button className="btn-primary btn-sm arena-row-action" type="button" disabled={rowBusy} onClick={() => void accept(match)}>Nhận</button><button className="btn btn-sm arena-row-action" type="button" disabled={rowBusy} onClick={() => void decline(match)}>Từ chối</button></>
        : match.postedByMe && (match.status === "open" || match.status === "invited") ? <button className="btn btn-sm arena-row-action" type="button" disabled={rowBusy} onClick={() => void withdraw(match)}>Huỷ</button>
        : match.status === "accepted" && !match.me.played ? <><AppLink className="btn btn-primary btn-sm arena-row-action" href={`/arena/match/${match.id}`} navigate={navigate}>Chơi</AppLink><button className="btn btn-sm arena-row-action" type="button" disabled={rowBusy} onClick={() => void giveUp(match)}>Bỏ trận</button></>
        : null;
      return <li key={match.id} className="arena-list__row" data-arena-row={match.status}>
        {settled
          ? <button type="button" className="arena-list__open" aria-label={`Xem kết quả ${ARENA_GAME_NAMES[match.game]}`} onClick={() => setResult(match)}>{text}<ChevronRight className="arena-list__chevron" size={16} aria-hidden="true" /></button>
          : <span className="arena-list__open">{text}</span>}
        {actions ? <span className="arena-row-actions">{actions}</span> : null}
      </li>;
    })}</ul> : <p className="small muted">Chưa có trận.</p>}
    {result ? <Modal className="arena-dialog" title="Kết quả trận" onClose={() => setResult(null)} dismissOnBackdrop>
      <ArenaResultCard match={result} againBusy={busy === "play"} onAgain={() => { setResult(null); void play(result.game); }} />
    </Modal> : null}
  </section>;
}
