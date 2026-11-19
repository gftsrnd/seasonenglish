import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import type { GameFinishInput } from "@e4s/contracts";
import { Clock3, LogOut, Play } from "lucide-react";
import { arenaApiClient, type ArenaApiClient, type ArenaMatch, type ArenaRound } from "../../../api/arena.js";
import { useModal } from "../../shared/ModalProvider.js";
import { GameEngine } from "../Games.js";
import { AppLink, Notice } from "../ui.js";
import { ArenaGameIcon } from "./ArenaGameIcon.js";
import { ArenaResultCard } from "./ArenaResultCard.js";
import { ArenaWords } from "./ArenaWords.js";
import { ARENA_GAME_NAMES, hoursLeft, isInviteForMe, matchStatusLine } from "./arena-text.js";
import { arenaErrorMessage, useArenaQuickMatch } from "./useArenaQuickMatch.js";
import "./arena.css";

type Client = Pick<ArenaApiClient, "match" | "start" | "submit" | "forfeit" | "answerFriendly" | "quickMatch"> & Partial<Pick<ArenaApiClient, "words">>;

/**
 * Screen 1 – the game in arena mode (`/arena/match/:id`): the existing game engine with one small
 * line "Xếp hạng · đối thủ ẩn", results to /arena/matches/:id/result, the result card after play,
 * "Thoát" = forfeit after a confirm, and resume when the match is reopened.
 */
export function ArenaMatchScreen({ matchId, navigate, notify, client = arenaApiClient }: {
  matchId: string;
  navigate: (path: string) => void;
  notify: (message: string) => void;
  client?: Client;
}) {
  const modal = useModal();
  const [match, setMatch] = useState<ArenaMatch | null>(null);
  const [round, setRound] = useState<ArenaRound | null>(null);
  const [loadError, setLoadError] = useState("");
  const [busy, setBusy] = useState(false);
  const [submitError, setSubmitError] = useState("");
  const pending = useRef<{ input: GameFinishInput; requestId: string } | null>(null);
  const again = useArenaQuickMatch({ navigate, notify, client });

  const load = useCallback(async () => {
    setLoadError("");
    try { setMatch(await client.match(matchId)); } catch { setLoadError("Không tìm thấy trận này."); }
  }, [client, matchId]);
  useEffect(() => { setMatch(null); setRound(null); pending.current = null; void load(); }, [load]);

  const run = async (work: () => Promise<void>, failure: string) => {
    if (busy) return;
    setBusy(true);
    try { await work(); } catch (reason) { notify(arenaErrorMessage(reason, failure)); } finally { setBusy(false); }
  };
  const start = () => run(async () => { const next = await client.start(matchId); setRound(next); setMatch(next.match); }, "Chưa mở được ván đấu.");
  const answer = (value: "accept" | "decline") => run(async () => {
    const next = await client.answerFriendly(matchId, value);
    if (value === "decline") navigate("/arena"); else setMatch(next);
  }, "Không trả lời được lời mời.");
  const submit = async (input: GameFinishInput) => {
    const entry = pending.current?.input === input ? pending.current : { input, requestId: crypto.randomUUID() };
    pending.current = entry;
    setSubmitError("");
    setBusy(true);
    try {
      const saved = await client.submit(matchId, { ...input, requestId: entry.requestId });
      pending.current = null;
      setRound(null);
      setMatch(saved.match);
    } catch {
      setSubmitError("Chưa lưu được kết quả. Kiểm tra kết nối rồi thử lại.");
    } finally {
      setBusy(false);
    }
  };
  const exit = async () => {
    if (!round) return;
    const leave = await modal.confirm({
      title: "Thoát trận?", message: "Thoát sẽ tính thua.", confirmLabel: "Thoát và chịu thua", cancelLabel: "Tiếp tục chơi", tone: "danger", countdownSeconds: 0
    });
    if (!leave) return;
    await run(async () => { const next = await client.forfeit(matchId); setRound(null); setMatch(next); }, "Chưa thoát được trận.");
  };

  const boardLink = <AppLink className="arena-text-link" href="/arena" navigate={navigate}>Về Đấu trường</AppLink>;
  if (loadError) return <div className="app-learner-page game-page arena-page"><Notice tone="warn">{loadError}</Notice>{boardLink}</div>;
  if (!match) return <div className="app-learner-page game-page arena-page"><section className="card" aria-live="polite">Đang tải trận…</section></div>;

  const name = ARENA_GAME_NAMES[match.game];
  const modeLine = match.mode === "ranked" ? "Xếp hạng · đối thủ ẩn" : `Giao hữu · ${match.opponent?.displayName ?? ""}`;
  const playing = Boolean(round) && match.status === "accepted" && !match.me.played;
  const preparing = !round && match.status === "accepted" && !match.me.played;

  return <div className={`app-learner-page game-page arena-page${preparing ? " arena-page--ready" : playing ? "" : " arena-page--narrow"}`} data-arena-match={match.id}>
    <header className="row between game-running-header arena-match-header">
      <div className="arena-match-header__text">
        <div className="eyebrow game-running-title"><span className="game-title-icon" aria-hidden="true"><ArenaGameIcon game={match.game} size={18} /></span><span>{name}</span></div>
        <h1>{match.setTopic}</h1>
        <p className="small muted arena-mode-line" data-arena-mode-line>{modeLine}</p>
      </div>
      {playing
        ? <button className="btn btn-sm btn-danger game-exit-link" type="button" disabled={busy} onClick={() => void exit()}><LogOut size={15} strokeWidth={2.2} aria-hidden="true" />Thoát</button>
        : <AppLink className="btn btn-sm btn-danger game-exit-link" href="/arena" navigate={navigate}><LogOut size={15} strokeWidth={2.2} aria-hidden="true" />Thoát</AppLink>}
    </header>
    <section id="gm-board" className="game-board">
      {playing && round
        ? (submitError
          ? <section className="card game-result is-error" aria-live="polite"><div className="game-result__icon" aria-hidden="true">!</div><div><div className="eyebrow">Kết quả chưa được lưu</div><h2>Gửi lại lượt chơi</h2></div><Notice tone="danger">{submitError}</Notice><div className="game-result__actions"><button className="btn-primary" type="button" disabled={busy || !pending.current} onClick={() => pending.current ? void submit(pending.current.input) : undefined}>{busy ? "Đang gửi lại…" : "Thử gửi lại"}</button></div></section>
          : busy && pending.current
            ? <section className="card game-result is-pending" aria-live="polite"><div className="game-result__icon game-result__spinner" aria-hidden="true" /><div><div className="eyebrow">Đang hoàn tất</div><h2>Đang ghi kết quả…</h2></div></section>
            : <GameEngine game={match.game} wordSet={round.wordSet} attempt={round.attemptSeed} finish={submit} />)
        : <ArenaMatchState match={match} busy={busy} onStart={start} onAnswer={answer} again={again} link={boardLink} client={client} />}
    </section>
  </div>;
}

/** Non-playing states of the match screen: one action at most, plus the text link back to the board. */
function ArenaMatchState({ match, busy, onStart, onAnswer, again, link, client }: {
  client: Client;
  match: ArenaMatch;
  busy: boolean;
  onStart: () => void;
  onAnswer: (value: "accept" | "decline") => void;
  again: ReturnType<typeof useArenaQuickMatch>;
  link: ReactNode;
}) {
  if (isInviteForMe(match)) {
    // Invite details: the one place with Từ chối next to Nhận.
    return <section className="card arena-state" data-arena-state="invite">
      <h2>{match.opponent?.displayName ?? "Bạn học"} mời bạn</h2>
      <p className="small muted">Giao hữu · {hoursLeft(match.acceptDeadline)} giờ để nhận</p>
      <div className="row arena-actions">
        <button className="btn-primary" type="button" disabled={busy} onClick={() => onAnswer("accept")}>Nhận</button>
        <button className="btn" type="button" disabled={busy} onClick={() => onAnswer("decline")}>Từ chối</button>
      </div>
    </section>;
  }
  if (match.status === "open" || match.status === "invited") {
    return <section className="card arena-state" data-arena-state="posted">
      <h2>{match.mode === "ranked" ? "Đã đăng thách đấu" : "Đã gửi lời mời"}</h2>
      <p className="small muted">Chờ người nhận · {hoursLeft(match.acceptDeadline)} giờ</p>
      {link}
    </section>;
  }
  if (match.status === "accepted" && !match.me.played) {
    return <ArenaReady match={match} busy={busy} onStart={onStart} link={link} wordsClient={client.words ? client as Pick<ArenaApiClient, "words"> : undefined} />;
  }
  if (match.status === "accepted" || match.status === "settled") {
    return <ArenaResultCard match={match} againBusy={again.busyGame === match.game} onAgain={() => void again.start(match.game)} />;
  }
  return <section className="card arena-state" data-arena-state="closed"><h2>{matchStatusLine(match)}</h2>{link}</section>;
}

function ArenaReady({ match, busy, onStart, link, wordsClient }: {
  match: ArenaMatch;
  busy: boolean;
  onStart: () => void;
  link: ReactNode;
  wordsClient: Pick<ArenaApiClient, "words"> | undefined;
}) {
  const deadline = match.playDeadline ? Date.parse(match.playDeadline) : NaN;
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!Number.isFinite(deadline) || deadline <= Date.now()) return;
    const tick = window.setInterval(() => {
      const time = Date.now();
      setNow(time);
      if (time >= deadline) window.clearInterval(tick);
    }, 1000);
    return () => window.clearInterval(tick);
  }, [deadline]);
  const seconds = Number.isFinite(deadline) ? Math.max(0, Math.ceil((deadline - now) / 1000)) : null;
  const expired = seconds === 0;
  const clock = seconds === null ? null : [Math.floor(seconds / 3600), Math.floor(seconds / 60) % 60, seconds % 60]
    .map((part) => String(part).padStart(2, "0")).join(":");

  return <section className="card arena-state arena-ready" data-arena-state="ready">
    <div className="arena-ready__head">
      <h2>{match.me.started ? "Chơi tiếp ván đấu" : "Sẵn sàng đấu"}</h2>
      {clock ? <span className="arena-match-countdown" role="timer" aria-label="Thời gian còn lại"><Clock3 size={16} aria-hidden="true" />Còn <strong>{clock}</strong></span> : null}
    </div>
    {expired ? <p role="status" className="small">Đã hết thời gian hoàn thành lượt.</p> : null}
    {wordsClient ? <div className="arena-ready__words">
      <h3 className="arena-words-title">Ôn từ trước khi chơi</h3>
      <ArenaWords matchId={match.id} client={wordsClient} />
    </div> : null}
    <div className="arena-ready__actions">
      <button className="btn-primary" type="button" disabled={busy || expired} aria-busy={busy || undefined} onClick={onStart}>
        <Play className="game-control-icon" size={16} aria-hidden="true" />{match.me.started ? "Chơi tiếp" : "Bắt đầu"}
      </button>
    </div>
  </section>;
}
