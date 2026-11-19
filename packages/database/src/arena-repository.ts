import { randomUUID } from "node:crypto";
import type { CefrLevel, GameKey, GameWordSetView } from "@e4s/contracts";
import {
  ARENA_ACCEPT_HOURS, ARENA_GAMES, ARENA_MAX_OPEN_RANKED, ARENA_MIN_ROUND_UNITS, ARENA_PLAY_HOURS, ARENA_SEASON_MONTHS,
  ARENA_START_RATING, GAME_RULES_VERSION, arenaEligible, arenaTotal, decideOutcome, gameRoundWords, scoreGameRound, settle,
  type GameAnswer, type GameEvent
} from "@e4s/domain/engagement";
import type { Pool, PoolClient } from "pg";
import { createRepositories, syncLearnerRewards } from "./repositories.js";

/**
 * Arena phase 2 (THIET-KE-DAU-TRUONG, DOT 2): XH ratings, open ranked challenges,
 * friendly invites and the match ledger. Every state change runs in one transaction
 * holding the match row lock (and, where two players are involved, both players'
 * advisory locks in a fixed order), so concurrent accepts, submits and the worker
 * sweep settle a match exactly once.
 */
export type ArenaSetKind = "curriculum" | "personal";
export type ArenaMatchStatus = "open" | "invited" | "accepted" | "settled" | "expired" | "cancelled" | "declined";

export class ArenaError extends Error {
  constructor(readonly code: string, readonly status: number, readonly details?: Record<string, unknown>) {
    super(code);
  }
}

export interface ArenaSeasonView { id: string; startsOn: string; endsOn: string; status: "scheduled" | "active" | "closed" }

export interface ArenaMatchView {
  id: string;
  mode: "ranked" | "friendly";
  game: GameKey;
  cefr: CefrLevel;
  status: ArenaMatchStatus;
  setKind: ArenaSetKind;
  setTopic: string;
  postedByMe: boolean;
  /** Hidden while a ranked challenge is open; known once accepted (and to the inviter of a friendly). */
  opponent: { id: string; displayName: string; cefr: CefrLevel | null } | null;
  createdAt: string;
  acceptDeadline: string;
  acceptedAt: string | null;
  playDeadline: string | null;
  settledAt: string | null;
  cancelReason: string | null;
  me: { started: boolean; played: boolean; score: number | null; gameplayMs: number | null };
  /** The other side's score shows only after the result. */
  them: { played: boolean; score: number | null };
  result: null | {
    outcome: "win" | "lose" | "draw";
    decidedBy: "score" | "time" | "forfeit" | "timeout";
    /** Ranked only: base points, repeat rate, meeting of the day and the change. */
    rating: null | { before: number; after: number; change: number; base: number | null; decayPercent: number | null; meetingIndex: number | null };
  };
}

export interface ArenaRoundView {
  match: ArenaMatchView;
  wordSet: GameWordSetView;
  attemptSeed: number;
  unitIds: string[];
}

export interface ArenaResultInput {
  requestId: string;
  answers: GameAnswer[];
  events?: GameEvent[] | undefined;
}

export interface ArenaResultView {
  id: string; game: GameKey; score: number; maxScore: 100; correct: number; total: number; gameplayMs: number | null; completedAt: string;
}

interface LearnerContext { id: string; organizationId: string; displayName: string; cefr: CefrLevel; today: string }

interface MatchRow {
  id: string; organization_id: string; mode: "ranked" | "friendly"; game_key: GameKey; cefr: CefrLevel; season_id: string | null;
  poster_id: string; opponent_id: string | null; poster_cefr: CefrLevel; opponent_cefr: CefrLevel | null;
  game_set_id: string; set_kind: ArenaSetKind; set_topic: string; status: ArenaMatchStatus; cancel_reason: string | null;
  created_at: Date; accept_deadline: Date; accepted_at: Date | null; play_deadline: Date | null; settled_at: Date | null;
  poster_rating_snapshot: number | null; opponent_rating_snapshot: number | null; meeting_day: Date | null; meeting_index: number | null;
  poster_started_at: Date | null; opponent_started_at: Date | null; poster_result_id: string | null; opponent_result_id: string | null;
  poster_score: number | null; opponent_score: number | null; poster_gameplay_ms: number | null; opponent_gameplay_ms: number | null;
  forfeited_by: string | null; outcome: "poster" | "opponent" | "draw" | null; decided_by: "score" | "time" | "forfeit" | "timeout" | null;
  base_points: number | null; decay_percent: number | null; transfer_points: number | null;
  poster_rating_before: number | null; poster_rating_after: number | null; opponent_rating_before: number | null; opponent_rating_after: number | null;
}

const ATTEMPT_SEED = 0;
const ACTIVE_STATUSES = ["open", "invited", "accepted"] as const;
/** A candidate another learner just took, that expired or whose pair got busy: try the next one. */
const QUICK_MATCH_SKIP = new Set(["ARENA_CHALLENGE_TAKEN", "ARENA_CHALLENGE_EXPIRED", "ARENA_PAIR_BUSY", "ARENA_MATCH_NOT_FOUND", "ARENA_OWN_CHALLENGE", "ARENA_SEASON_CHANGED", "ARENA_LEVEL_MISMATCH"]);

export class ArenaRepository {
  private readonly engagement;

  constructor(private readonly pool: Pool) {
    this.engagement = createRepositories(pool).engagement;
  }

  // ---------------------------------------------------------------- view

  async view(learnerId: string): Promise<{
    eligible: boolean; requiredLevel: "B1"; level: CefrLevel | null;
    season: ArenaSeasonView | null; ratings: Record<GameKey, number>; total: number;
    rank: { position: number; of: number } | null;
    /** The word set a new challenge uses: the learner's current Mini game set (own topic, else the curriculum set). */
    set: { topic: string; words: number; kind: ArenaSetKind } | null;
    openRanked: number; maxOpenRanked: number;
    matches: { open: ArenaMatchView[]; active: ArenaMatchView[]; done: ArenaMatchView[] };
  } | null> {
    const context = await this.learnerContext(learnerId);
    if (!context) return null;
    const eligible = arenaEligible(context.cefr);
    const season = eligible ? await this.withTx((client) => this.ensureSeason(client, context.organizationId, context.today)) : null;
    const ratings = Object.fromEntries(ARENA_GAMES.map((game) => [game, ARENA_START_RATING])) as Record<GameKey, number>;
    if (season) {
      const rows = await this.pool.query<{ game_key: GameKey; rating: number }>(
        "select game_key, rating from arena_ratings where learner_id = $1 and season_id = $2 and cefr = $3",
        [learnerId, season.id, context.cefr]);
      for (const row of rows.rows) ratings[row.game_key] = row.rating;
    }
    const board = season ? await this.board(context.organizationId, context.cefr, season.id, "total", true) : [];
    const own = board.find((entry) => entry.learnerId === learnerId);
    const matches = await this.myMatches(learnerId);
    const sources = eligible ? await this.engagement.arenaWordSources(learnerId) : null;
    const active = sources?.personal ? { set: sources.personal, kind: "personal" as const } : sources?.curriculum ? { set: sources.curriculum, kind: "curriculum" as const } : null;
    return {
      eligible, requiredLevel: "B1", level: context.cefr, season, ratings, total: arenaTotal(ratings),
      rank: own ? { position: own.rank, of: board.length } : null,
      set: active ? { topic: active.set.topic, words: active.set.words.length, kind: active.kind } : null,
      openRanked: await this.openRankedCount(this.pool, learnerId), maxOpenRanked: ARENA_MAX_OPEN_RANKED,
      matches: {
        open: matches.filter((match) => match.status === "open" || match.status === "invited"),
        active: matches.filter((match) => match.status === "accepted"),
        done: matches.filter((match) => !(ACTIVE_STATUSES as readonly string[]).includes(match.status)).slice(0, 50)
      }
    };
  }

  async match(learnerId: string, matchId: string): Promise<ArenaMatchView | null> {
    const row = await this.matchRow(this.pool, matchId);
    if (!row || (row.poster_id !== learnerId && row.opponent_id !== learnerId)) return null;
    return (await this.views(learnerId, [row]))[0] ?? null;
  }

  // ---------------------------------------------------------------- open challenges

  /** Open ranked challenges of the learner's level: game, set topic and deadline only, never the poster. */
  async openChallenges(learnerId: string): Promise<Array<{ id: string; game: GameKey; setKind: ArenaSetKind; setTopic: string; acceptDeadline: string; createdAt: string }>> {
    const context = await this.eligibleContext(learnerId);
    const season = await this.withTx((client) => this.ensureSeason(client, context.organizationId, context.today));
    if (!season) return [];
    const rows = await this.pool.query<{ id: string; game_key: GameKey; set_kind: ArenaSetKind; set_topic: string; accept_deadline: Date; created_at: Date }>(
      `select m.id, m.game_key, m.set_kind, m.set_topic, m.accept_deadline, m.created_at
       from arena_matches m
       where m.organization_id = $1 and m.mode = 'ranked' and m.status = 'open' and m.cefr = $2 and m.season_id = $3
         and m.accept_deadline > now() and m.poster_id <> $4
         and not exists (
           select 1 from arena_matches busy where busy.mode = 'ranked' and busy.status = 'accepted'
             and least(busy.poster_id, busy.opponent_id) = least(m.poster_id, $4::uuid)
             and greatest(busy.poster_id, busy.opponent_id) = greatest(m.poster_id, $4::uuid))
       order by m.accept_deadline asc, m.id limit 50`,
      [context.organizationId, context.cefr, season.id, learnerId]);
    return rows.rows.map((row) => ({ id: row.id, game: row.game_key, setKind: row.set_kind, setTopic: row.set_topic,
      acceptDeadline: row.accept_deadline.toISOString(), createdAt: row.created_at.toISOString() }));
  }

  async postChallenge(learnerId: string, request: { requestId: string; game: GameKey; setKind?: ArenaSetKind | undefined }): Promise<ArenaMatchView> {
    const context = await this.eligibleContext(learnerId);
    const existing = await this.byRequestKey(learnerId, request.requestId);
    if (existing) return existing;
    const input = { ...request, setKind: request.setKind ?? await this.activeSetKind(learnerId) };
    const snapshot = await this.snapshotSource(learnerId, input.game, input.setKind);
    const id = await this.withTx(async (client) => {
      await this.lockPlayers(client, [learnerId]);
      const season = await this.ensureSeason(client, context.organizationId, context.today);
      if (!season) throw new ArenaError("ARENA_SEASON_NOT_STARTED", 409);
      if (await this.openRankedCount(client, learnerId) >= ARENA_MAX_OPEN_RANKED) throw new ArenaError("ARENA_OPEN_LIMIT", 409, { max: ARENA_MAX_OPEN_RANKED });
      const setId = await this.insertSnapshot(client, snapshot, input.game, input.setKind);
      const inserted = await client.query<{ id: string }>(
        `insert into arena_matches (organization_id, mode, game_key, cefr, season_id, poster_id, poster_cefr, request_key,
           game_set_id, set_kind, set_topic, status, accept_deadline)
         values ($1, 'ranked', $2, $3, $4, $5, $3, $6, $7, $8, $9, 'open', now() + make_interval(hours => $10))
         on conflict (poster_id, request_key) do nothing returning id`,
        [context.organizationId, input.game, context.cefr, season.id, learnerId, input.requestId, setId, input.setKind, snapshot.topic, ARENA_ACCEPT_HOURS]);
      return inserted.rows[0]?.id ?? null;
    });
    return id ? (await this.match(learnerId, id))! : (await this.byRequestKey(learnerId, input.requestId))!;
  }

  /** First come, first served: the row lock lets exactly one of two simultaneous accepts through. */
  async acceptChallenge(learnerId: string, matchId: string): Promise<ArenaMatchView> {
    const context = await this.eligibleContext(learnerId);
    const peek = await this.matchRow(this.pool, matchId);
    if (!peek || peek.mode !== "ranked" || peek.organization_id !== context.organizationId) throw new ArenaError("ARENA_MATCH_NOT_FOUND", 404);
    if (peek.poster_id === learnerId) throw new ArenaError("ARENA_OWN_CHALLENGE", 409);
    await this.withTx(async (client) => {
      await this.lockPlayers(client, [learnerId, peek.poster_id]);
      const match = (await this.matchRow(client, matchId, true))!;
      if (match.status !== "open") throw new ArenaError("ARENA_CHALLENGE_TAKEN", 409);
      if (match.accept_deadline.getTime() <= Date.now()) throw new ArenaError("ARENA_CHALLENGE_EXPIRED", 409);
      if (match.cefr !== context.cefr) throw new ArenaError("ARENA_LEVEL_MISMATCH", 409);
      const season = await this.ensureSeason(client, context.organizationId, context.today);
      if (!season || season.id !== match.season_id) throw new ArenaError("ARENA_SEASON_CHANGED", 409);
      if (await this.openRankedCount(client, learnerId) >= ARENA_MAX_OPEN_RANKED) throw new ArenaError("ARENA_OPEN_LIMIT", 409, { max: ARENA_MAX_OPEN_RANKED });
      const busy = await client.query(
        `select 1 from arena_matches where mode = 'ranked' and status = 'accepted'
           and least(poster_id, opponent_id) = least($1::uuid, $2::uuid) and greatest(poster_id, opponent_id) = greatest($1::uuid, $2::uuid)`,
        [learnerId, match.poster_id]);
      if (busy.rowCount) throw new ArenaError("ARENA_PAIR_BUSY", 409);
      const ratings = await this.ratingsFor(client, season.id, match.cefr, match.game_key, [match.poster_id, learnerId], false);
      const meetings = await client.query<{ count: number }>(
        `select count(*)::int as count from arena_matches
         where mode = 'ranked' and meeting_day = $3::date and status in ('accepted', 'settled')
           and least(poster_id, opponent_id) = least($1::uuid, $2::uuid) and greatest(poster_id, opponent_id) = greatest($1::uuid, $2::uuid)`,
        [learnerId, match.poster_id, context.today]);
      await client.query(
        `update arena_matches set status = 'accepted', opponent_id = $2, opponent_cefr = $3, accepted_at = now(),
           play_deadline = now() + make_interval(hours => $4), poster_rating_snapshot = $5, opponent_rating_snapshot = $6,
           meeting_day = $7::date, meeting_index = $8
         where id = $1`,
        [matchId, learnerId, context.cefr, ARENA_PLAY_HOURS, ratings.get(match.poster_id), ratings.get(learnerId),
          context.today, (meetings.rows[0]?.count ?? 0) + 1]);
    }).catch((error: unknown) => {
      if (error && typeof error === "object" && "code" in error && error.code === "23505") throw new ArenaError("ARENA_PAIR_BUSY", 409);
      throw error;
    });
    return (await this.match(learnerId, matchId))!;
  }

  /**
   * "Đấu" on a Mini game card: join the oldest open ranked challenge of this game and level that the
   * learner may take (not their own, not a pair already in play, within the open cap); otherwise post
   * one with the learner's current Mini game set. Each step is the phase-2 accept/post transaction with
   * its row and player locks, so a challenge taken by someone else in between is skipped, never doubled.
   */
  async quickMatch(learnerId: string, input: { requestId: string; game: GameKey; setKind?: ArenaSetKind | undefined }): Promise<{ joined: boolean; match: ArenaMatchView }> {
    await this.eligibleContext(learnerId);
    const replay = await this.byRequestKey(learnerId, input.requestId);
    if (replay) return { joined: false, match: replay };
    if (await this.openRankedCount(this.pool, learnerId) >= ARENA_MAX_OPEN_RANKED) throw new ArenaError("ARENA_OPEN_LIMIT", 409, { max: ARENA_MAX_OPEN_RANKED });
    const candidates = (await this.openChallenges(learnerId)).filter((challenge) => challenge.game === input.game);
    for (const candidate of candidates) {
      try {
        return { joined: true, match: await this.acceptChallenge(learnerId, candidate.id) };
      } catch (error) {
        if (error instanceof ArenaError && QUICK_MATCH_SKIP.has(error.code)) continue;
        throw error;
      }
    }
    const setKind = input.setKind ?? await this.activeSetKind(learnerId);
    return { joined: false, match: await this.postChallenge(learnerId, { requestId: input.requestId, game: input.game, setKind }) };
  }

  /** The Mini game hub's current set: the learner's own topic set when one is active, else the curriculum set. */
  private async activeSetKind(learnerId: string): Promise<ArenaSetKind> {
    const sources = await this.engagement.arenaWordSources(learnerId);
    return sources?.personal ? "personal" : "curriculum";
  }

  // ---------------------------------------------------------------- friendly

  async inviteFriendly(learnerId: string, input: { requestId: string; opponentId: string; game: GameKey; setKind?: ArenaSetKind | undefined }): Promise<ArenaMatchView> {
    const context = await this.eligibleContext(learnerId);
    const existing = await this.byRequestKey(learnerId, input.requestId);
    if (existing) return existing;
    if (input.opponentId === learnerId) throw new ArenaError("ARENA_OPPONENT_NOT_ELIGIBLE", 400);
    const opponent = await this.learnerContext(input.opponentId);
    if (!opponent || opponent.organizationId !== context.organizationId || !arenaEligible(opponent.cefr)) {
      throw new ArenaError("ARENA_OPPONENT_NOT_ELIGIBLE", 400);
    }
    // Without an explicit set the invite uses the learner's current Mini game set, like "Đấu".
    const setKind = input.setKind ?? await this.activeSetKind(learnerId);
    const snapshot = await this.snapshotSource(learnerId, input.game, setKind);
    const id = await this.withTx(async (client) => {
      const setId = await this.insertSnapshot(client, snapshot, input.game, setKind);
      const inserted = await client.query<{ id: string }>(
        `insert into arena_matches (organization_id, mode, game_key, cefr, poster_id, poster_cefr, opponent_id, opponent_cefr,
           request_key, game_set_id, set_kind, set_topic, status, accept_deadline)
         values ($1, 'friendly', $2, $3, $4, $3, $5, $6, $7, $8, $9, $10, 'invited', now() + make_interval(hours => $11))
         on conflict (poster_id, request_key) do nothing returning id`,
        [context.organizationId, input.game, context.cefr, learnerId, opponent.id, opponent.cefr, input.requestId, setId,
          setKind, snapshot.topic, ARENA_ACCEPT_HOURS]);
      return inserted.rows[0]?.id ?? null;
    });
    return id ? (await this.match(learnerId, id))! : (await this.byRequestKey(learnerId, input.requestId))!;
  }

  async answerFriendly(learnerId: string, matchId: string, answer: "accept" | "decline"): Promise<ArenaMatchView> {
    await this.withTx(async (client) => {
      const match = await this.matchRow(client, matchId, true);
      if (!match || match.mode !== "friendly" || match.opponent_id !== learnerId) throw new ArenaError("ARENA_MATCH_NOT_FOUND", 404);
      if (match.status !== "invited") throw new ArenaError("ARENA_INVITE_CLOSED", 409);
      if (match.accept_deadline.getTime() <= Date.now()) throw new ArenaError("ARENA_CHALLENGE_EXPIRED", 409);
      if (answer === "accept") {
        await client.query(
          "update arena_matches set status = 'accepted', accepted_at = now(), play_deadline = now() + make_interval(hours => $2) where id = $1",
          [matchId, ARENA_PLAY_HOURS]);
      } else {
        await client.query("update arena_matches set status = 'declined', settled_at = now() where id = $1", [matchId]);
      }
    });
    return (await this.match(learnerId, matchId))!;
  }

  // ---------------------------------------------------------------- play

  /** Marks the side as started (idempotent, also after a reconnect) and returns the fixed round. */
  async start(learnerId: string, matchId: string): Promise<ArenaRoundView> {
    await this.withTx(async (client) => {
      const match = await this.matchRow(client, matchId, true);
      const side = match ? sideOf(match, learnerId) : null;
      if (!match || !side) throw new ArenaError("ARENA_MATCH_NOT_FOUND", 404);
      this.assertPlayable(match);
      if (match[`${side}_score` as const] !== null) throw new ArenaError("ARENA_ALREADY_PLAYED", 409);
      await client.query(`update arena_matches set ${side}_started_at = coalesce(${side}_started_at, now()) where id = $1`, [matchId]);
    });
    const match = (await this.match(learnerId, matchId))!;
    const round = await this.round(matchId);
    return { match, wordSet: round.wordSet, attemptSeed: ATTEMPT_SEED, unitIds: round.unitIds };
  }

  /**
   * Scores the round on the server with the phase-1 rule against the snapshot's units, stores it as an
   * ordinary mini game result (training points, shared 3-a-day cap) linked to the match, and settles the
   * match when both sides are done. A replayed request key returns the first result.
   */
  async submit(learnerId: string, matchId: string, input: ArenaResultInput): Promise<{ match: ArenaMatchView; result: ArenaResultView }> {
    const replay = await this.replayedResult(learnerId, matchId, input.requestId);
    if (replay) return replay;
    const peek = await this.matchRow(this.pool, matchId);
    if (!peek || !sideOf(peek, learnerId)) throw new ArenaError("ARENA_MATCH_NOT_FOUND", 404);
    const round = await this.round(matchId);
    const byId = new Map(round.wordSet.words.map((word) => [word.id, word]));
    const units = round.unitIds.map((id) => byId.get(id)).filter((word): word is NonNullable<typeof word> => Boolean(word));
    const scored = scoreGameRound(peek.game_key, round.wordSet.words, input.answers, { units, events: input.events });
    let resultRow: { id: string; completed_at: Date } | null = null;
    try {
      resultRow = await this.withTx(async (client) => {
        const match = (await this.matchRow(client, matchId, true))!;
        const side = sideOf(match, learnerId)!;
        this.assertPlayable(match);
        if (match[`${side}_score` as const] !== null) throw new ArenaError("ARENA_ALREADY_PLAYED", 409);
        const inserted = await client.query<{ id: string; completed_at: Date }>(
          `insert into game_results
             (id, game_set_id, learner_id, game_key, score, max_score, request_key, details,
              arena_score, raw_score, raw_max, gameplay_ms, units_assigned, rules_version, arena_match_id)
           values ($1, $2, $3, $4, $5, 100, $6, $7::jsonb, $5, $8, $9, $10, $11, $12, $13)
           on conflict (learner_id, request_key) where request_key is not null do nothing
           returning id, completed_at`,
          [randomUUID(), match.game_set_id, learnerId, match.game_key, scored.score, input.requestId,
            JSON.stringify({ correct: scored.correct, total: scored.total, evidence: {
              arenaMatchId: matchId, attemptSeed: ATTEMPT_SEED,
              units: scored.unitIds.map((wordId, index) => ({ wordId, outcome: scored.outcomes[index] })),
              answers: input.answers.map(({ wordId, attempts, usedHint, ms }) => ({ wordId, attempts, usedHint, ms }))
            } }),
            scored.raw, scored.rawMax, scored.gameplayMs, scored.total, GAME_RULES_VERSION, matchId]);
        const row = inserted.rows[0];
        if (!row) return null;
        // Each arena round is one mini game play: +5 from 50/100, within the shared 3-a-day cap.
        await client.query(
          `insert into activities (id, learner_id, activity_type, reference_type, reference_id, minutes, evidence)
           values ($1, $2, 'game', 'game_result', $3, 5, $4::jsonb)`,
          [randomUUID(), learnerId, row.id, JSON.stringify({
            game: match.game_key, score: scored.score, maxScore: 100, arenaScore: scored.score, rulesVersion: GAME_RULES_VERSION, arenaMatchId: matchId
          })]);
        await client.query(
          `update arena_matches set ${side}_result_id = $2, ${side}_score = $3, ${side}_gameplay_ms = $4,
             ${side}_started_at = coalesce(${side}_started_at, now()) where id = $1`,
          [matchId, row.id, scored.score, scored.gameplayMs]);
        const updated = (await this.matchRow(client, matchId))!;
        if (updated.poster_score !== null && updated.opponent_score !== null) {
          const decision = decideOutcome(
            { score: updated.poster_score, gameplayMs: updated.poster_gameplay_ms },
            { score: updated.opponent_score, gameplayMs: updated.opponent_gameplay_ms },
            { sameSet: true });
          await this.settleLocked(client, updated, decision.winner === "a" ? "poster" : decision.winner === "b" ? "opponent" : "draw", decision.decidedBy);
        }
        return row;
      });
    } catch (error) {
      if (error && typeof error === "object" && "code" in error && error.code === "23505") resultRow = null;
      else throw error;
    }
    if (!resultRow) {
      const raced = await this.replayedResult(learnerId, matchId, input.requestId);
      if (raced) return raced;
      throw new ArenaError("ARENA_ALREADY_PLAYED", 409);
    }
    await syncLearnerRewards(this.pool, learnerId);
    return {
      match: (await this.match(learnerId, matchId))!,
      result: { id: resultRow.id, game: peek.game_key, score: scored.score, maxScore: 100, correct: scored.correct, total: scored.total,
        gameplayMs: scored.gameplayMs, completedAt: resultRow.completed_at.toISOString() }
    };
  }

  /** Leaving a started match counts as a loss (A.11), settled at once. */
  /** The poster withdraws a challenge or friendly invite that nobody has accepted yet (no XH change). */
  async withdraw(learnerId: string, matchId: string): Promise<ArenaMatchView> {
    await this.withTx(async (client) => {
      const match = await this.matchRow(client, matchId, true);
      if (!match || match.poster_id !== learnerId) throw new ArenaError("ARENA_MATCH_NOT_FOUND", 404);
      if (match.status !== "open" && match.status !== "invited") throw new ArenaError("ARENA_MATCH_CLOSED", 409);
      await client.query("update arena_matches set status = 'cancelled', cancel_reason = 'withdrawn', settled_at = now() where id = $1", [matchId]);
    });
    return (await this.match(learnerId, matchId))!;
  }

  /** Giving up an accepted match, before or during play, counts as a loss (decided_by = forfeit). */
  async forfeit(learnerId: string, matchId: string): Promise<ArenaMatchView> {
    await this.withTx(async (client) => {
      const match = await this.matchRow(client, matchId, true);
      const side = match ? sideOf(match, learnerId) : null;
      if (!match || !side) throw new ArenaError("ARENA_MATCH_NOT_FOUND", 404);
      if (match.status !== "accepted") throw new ArenaError("ARENA_MATCH_CLOSED", 409);
      if (match[`${side}_score` as const] !== null) throw new ArenaError("ARENA_ALREADY_PLAYED", 409);
      await client.query("update arena_matches set forfeited_by = $2 where id = $1", [matchId, learnerId]);
      await this.settleLocked(client, match, side === "poster" ? "opponent" : "poster", "forfeit");
    });
    return (await this.match(learnerId, matchId))!;
  }

  // ---------------------------------------------------------------- worker sweep

  /**
   * Idempotent periodic job: unaccepted challenges and invites expire after 24 hours; after the play
   * deadline a side that has not played loses (decided_by = timeout), and a match nobody played is cancelled.
   */
  async sweep(limit = 200): Promise<{ expired: number; timedOut: number; cancelled: number }> {
    const expired = await this.pool.query(
      `update arena_matches set status = 'expired', settled_at = now()
       where status in ('open', 'invited') and accept_deadline <= now()`);
    const due = await this.pool.query<{ id: string }>(
      "select id from arena_matches where status = 'accepted' and play_deadline <= now() order by play_deadline limit $1", [limit]);
    let timedOut = 0;
    let cancelled = 0;
    for (const { id } of due.rows) {
      await this.withTx(async (client) => {
        const match = await this.matchRow(client, id, true);
        if (!match || match.status !== "accepted" || !match.play_deadline || match.play_deadline.getTime() > Date.now()) return;
        const posterPlayed = match.poster_score !== null;
        const opponentPlayed = match.opponent_score !== null;
        if (!posterPlayed && !opponentPlayed) {
          await client.query("update arena_matches set status = 'cancelled', cancel_reason = 'both_timeout', settled_at = now() where id = $1", [id]);
          cancelled += 1;
        } else if (posterPlayed !== opponentPlayed) {
          await this.settleLocked(client, match, posterPlayed ? "poster" : "opponent", "timeout");
          timedOut += 1;
        } else {
          const decision = decideOutcome({ score: match.poster_score!, gameplayMs: match.poster_gameplay_ms },
            { score: match.opponent_score!, gameplayMs: match.opponent_gameplay_ms }, { sameSet: true });
          await this.settleLocked(client, match, decision.winner === "a" ? "poster" : decision.winner === "b" ? "opponent" : "draw", decision.decidedBy);
        }
      });
    }
    return { expired: expired.rowCount ?? 0, timedOut, cancelled };
  }

  // ---------------------------------------------------------------- leaderboard

  async leaderboard(learnerId: string, input: { level?: CefrLevel | undefined; game?: GameKey | "total" | undefined; seasonId?: string | undefined }): Promise<{
    level: CefrLevel; game: GameKey | "total"; season: ArenaSeasonView | null;
    entries: Array<{ rank: number; learnerId: string; displayName: string; rating: number }>;
    me: { rank: number; of: number; rating: number } | null;
  }> {
    const context = await this.eligibleContext(learnerId);
    const level = input.level ?? context.cefr;
    if (!arenaEligible(level)) throw new ArenaError("ARENA_LEVEL_REQUIRED", 400);
    const game = input.game ?? "total";
    const current = await this.withTx((client) => this.ensureSeason(client, context.organizationId, context.today));
    let season = current;
    if (input.seasonId && input.seasonId !== current?.id) {
      const found = await this.pool.query<{ id: string; starts_on: string; ends_on: string; status: ArenaSeasonView["status"] }>(
        "select id, starts_on::text, ends_on::text, status from arena_seasons where id = $1 and organization_id = $2",
        [input.seasonId, context.organizationId]);
      const row = found.rows[0];
      if (!row) throw new ArenaError("ARENA_SEASON_NOT_FOUND", 404);
      season = { id: row.id, startsOn: row.starts_on, endsOn: row.ends_on, status: row.status };
    }
    const entries = season ? await this.board(context.organizationId, level, season.id, game, season.id === current?.id) : [];
    const own = entries.find((entry) => entry.learnerId === learnerId);
    return { level, game, season, entries, me: own ? { rank: own.rank, of: entries.length, rating: own.rating } : null };
  }

  // ---------------------------------------------------------------- manager season setting

  async seasonSetting(managerId: string): Promise<{
    firstSeasonStart: string | null; seasonMonths: number; current: ArenaSeasonView | null; next: ArenaSeasonView | null; hasMatches: boolean;
  }> {
    const organization = await this.managerOrganization(managerId);
    return this.withTx(async (client) => {
      const current = await this.ensureSeason(client, organization.id, organization.today);
      return this.seasonSummary(client, organization.id, organization.today, current);
    });
  }

  /**
   * Sets the first season's start date. Without matches in the current season the date applies now;
   * once matches exist it needs `confirm` and becomes the start of the next season, which must begin
   * on or after the current season's end.
   */
  async saveSeasonStart(managerId: string, input: { startsOn: string; confirm?: boolean | undefined }): Promise<Awaited<ReturnType<ArenaRepository["seasonSetting"]>>> {
    const organization = await this.managerOrganization(managerId);
    return this.withTx(async (client) => {
      await client.query("select pg_advisory_xact_lock(hashtext($1))", [`arena-season:${organization.id}`]);
      const current = await this.ensureSeason(client, organization.id, organization.today);
      const used = current ? await this.seasonHasMatches(client, current.id) : false;
      if (used && current) {
        if (!input.confirm) throw new ArenaError("ARENA_SEASON_CONFIRM_REQUIRED", 409, { currentSeasonEnds: current.endsOn });
        if (input.startsOn < current.endsOn) throw new ArenaError("ARENA_SEASON_START_TOO_EARLY", 409, { earliest: current.endsOn });
        await client.query(
          `delete from arena_seasons s where s.organization_id = $1 and s.starts_on >= $2::date
             and not exists (select 1 from arena_matches m where m.season_id = s.id)`, [organization.id, current.endsOn]);
      } else {
        await client.query(
          `delete from arena_seasons s where s.organization_id = $1 and s.ends_on > $2::date
             and not exists (select 1 from arena_matches m where m.season_id = s.id)`, [organization.id, organization.today]);
        const latest = await client.query<{ ends_on: string }>(
          "select max(ends_on)::text as ends_on from arena_seasons where organization_id = $1", [organization.id]);
        const earliest = latest.rows[0]?.ends_on;
        if (earliest && input.startsOn < earliest) throw new ArenaError("ARENA_SEASON_START_TOO_EARLY", 409, { earliest });
      }
      await client.query(
        `insert into arena_seasons (organization_id, starts_on, ends_on, status)
         values ($1, $2::date, ($2::date + make_interval(months => $3))::date, 'scheduled')
         on conflict (organization_id, starts_on) do nothing`,
        [organization.id, input.startsOn, ARENA_SEASON_MONTHS]);
      const next = await this.ensureSeason(client, organization.id, organization.today);
      return this.seasonSummary(client, organization.id, organization.today, next);
    });
  }

  // ---------------------------------------------------------------- internals

  private async seasonSummary(client: PoolClient, organizationId: string, today: string, current: ArenaSeasonView | null) {
    const rows = await client.query<{ id: string; starts_on: string; ends_on: string; status: ArenaSeasonView["status"] }>(
      "select id, starts_on::text, ends_on::text, status from arena_seasons where organization_id = $1 order by starts_on", [organizationId]);
    const next = rows.rows.find((row) => row.starts_on > today);
    return {
      firstSeasonStart: rows.rows[0]?.starts_on ?? null, seasonMonths: ARENA_SEASON_MONTHS, current,
      next: next ? { id: next.id, startsOn: next.starts_on, endsOn: next.ends_on, status: next.status } : null,
      hasMatches: current ? await this.seasonHasMatches(client, current.id) : false
    };
  }

  private async seasonHasMatches(client: PoolClient, seasonId: string): Promise<boolean> {
    return Boolean((await client.query("select 1 from arena_matches where season_id = $1 limit 1", [seasonId])).rowCount);
  }

  /**
   * The season containing `today`. With no season yet (the Manager never set a date) the first one
   * starts today; after the last season ends the next one follows on, three months each. Before a
   * scheduled first season there is none.
   */
  private async ensureSeason(client: PoolClient, organizationId: string, today: string): Promise<ArenaSeasonView | null> {
    await client.query("select pg_advisory_xact_lock(hashtext($1))", [`arena-season:${organizationId}`]);
    const count = await client.query<{ count: number }>("select count(*)::int as count from arena_seasons where organization_id = $1", [organizationId]);
    if (!count.rows[0]?.count) {
      await client.query(
        `insert into arena_seasons (organization_id, starts_on, ends_on, status)
         values ($1, $2::date, ($2::date + make_interval(months => $3))::date, 'active')`, [organizationId, today, ARENA_SEASON_MONTHS]);
    }
    // Follow on from the latest season until one contains today.
    for (let guard = 0; guard < 400; guard += 1) {
      const latest = await client.query<{ ends_on: string }>(
        "select ends_on::text from arena_seasons where organization_id = $1 order by starts_on desc limit 1", [organizationId]);
      const endsOn = latest.rows[0]!.ends_on;
      if (endsOn > today) break;
      await client.query(
        `insert into arena_seasons (organization_id, starts_on, ends_on, status)
         values ($1, $2::date, ($2::date + make_interval(months => $3))::date, 'scheduled')`, [organizationId, endsOn, ARENA_SEASON_MONTHS]);
    }
    await client.query(
      `update arena_seasons set status = case when ends_on <= $2::date then 'closed' when starts_on <= $2::date then 'active' else 'scheduled' end
       where organization_id = $1 and status is distinct from (case when ends_on <= $2::date then 'closed' when starts_on <= $2::date then 'active' else 'scheduled' end)`,
      [organizationId, today]);
    const current = await client.query<{ id: string; starts_on: string; ends_on: string }>(
      "select id, starts_on::text, ends_on::text from arena_seasons where organization_id = $1 and starts_on <= $2::date and ends_on > $2::date limit 1",
      [organizationId, today]);
    const row = current.rows[0];
    return row ? { id: row.id, startsOn: row.starts_on, endsOn: row.ends_on, status: "active" } : null;
  }

  /** Applies the result once: ranked moves XH (snapshot row, repeat rate, floor 0); friendly never does. */
  private async settleLocked(client: PoolClient, match: MatchRow, outcome: "poster" | "opponent" | "draw", decidedBy: "score" | "time" | "forfeit" | "timeout"): Promise<void> {
    if (match.status !== "accepted" || !match.opponent_id) return;
    let transfer: { base: number | null; percent: number | null; points: number; posterBefore: number | null; posterAfter: number | null; opponentBefore: number | null; opponentAfter: number | null }
      = { base: null, percent: null, points: 0, posterBefore: null, posterAfter: null, opponentBefore: null, opponentAfter: null };
    if (match.mode === "ranked" && match.season_id) {
      const ratings = await this.ratingsFor(client, match.season_id, match.cefr, match.game_key, [match.poster_id, match.opponent_id], true);
      const posterNow = ratings.get(match.poster_id)!;
      const opponentNow = ratings.get(match.opponent_id)!;
      if (outcome === "draw") {
        transfer = { base: null, percent: null, points: 0, posterBefore: posterNow, posterAfter: posterNow, opponentBefore: opponentNow, opponentAfter: opponentNow };
      } else {
        const posterWon = outcome === "poster";
        const result = settle({
          winnerSnapshot: (posterWon ? match.poster_rating_snapshot : match.opponent_rating_snapshot) ?? ARENA_START_RATING,
          loserSnapshot: (posterWon ? match.opponent_rating_snapshot : match.poster_rating_snapshot) ?? ARENA_START_RATING,
          meetingIndex: match.meeting_index ?? 1,
          winnerNow: posterWon ? posterNow : opponentNow,
          loserNow: posterWon ? opponentNow : posterNow
        });
        transfer = {
          base: result.base, percent: result.percent, points: result.transfer,
          posterBefore: posterNow, posterAfter: posterWon ? result.winnerAfter : result.loserAfter,
          opponentBefore: opponentNow, opponentAfter: posterWon ? result.loserAfter : result.winnerAfter
        };
        for (const [learner, rating] of [[match.poster_id, transfer.posterAfter!], [match.opponent_id, transfer.opponentAfter!]] as const) {
          await client.query(
            "update arena_ratings set rating = $5, updated_at = now() where season_id = $1 and cefr = $2 and game_key = $3 and learner_id = $4",
            [match.season_id, match.cefr, match.game_key, learner, rating]);
        }
      }
    }
    await client.query(
      `update arena_matches set status = 'settled', settled_at = now(), outcome = $2, decided_by = $3,
         base_points = $4, decay_percent = $5, transfer_points = $6,
         poster_rating_before = $7, poster_rating_after = $8, opponent_rating_before = $9, opponent_rating_after = $10
       where id = $1 and status = 'accepted'`,
      [match.id, outcome, decidedBy, transfer.base, transfer.percent, match.mode === "ranked" ? transfer.points : null,
        transfer.posterBefore, transfer.posterAfter, transfer.opponentBefore, transfer.opponentAfter]);
  }

  /** Current ratings of the given learners (created at 1 000 when missing), optionally row-locked. */
  private async ratingsFor(client: PoolClient, seasonId: string, cefr: CefrLevel, game: GameKey, learners: string[], lock: boolean): Promise<Map<string, number>> {
    await client.query(
      `insert into arena_ratings (season_id, cefr, game_key, learner_id, rating)
       select $1, $2, $3, learner, $5 from unnest($4::uuid[]) learner
       on conflict do nothing`, [seasonId, cefr, game, learners, ARENA_START_RATING]);
    const rows = await client.query<{ learner_id: string; rating: number }>(
      `select learner_id, rating from arena_ratings where season_id = $1 and cefr = $2 and game_key = $3 and learner_id = any($4::uuid[])
       order by learner_id ${lock ? "for update" : ""}`, [seasonId, cefr, game, learners]);
    return new Map(rows.rows.map((row) => [row.learner_id, row.rating]));
  }

  private async board(organizationId: string, level: CefrLevel, seasonId: string, game: GameKey | "total", includeCurrentMembers: boolean) {
    const rows = await this.pool.query<{ learner_id: string; display_name: string; rating: number }>(
      `with players as (
         select u.id, u.display_name from users u
         join enrollments e on e.learner_id = u.id and e.cefr_approved and e.cefr = $2
         join programs p on p.id = e.program_id and p.status = 'active'
         where $5::boolean and u.organization_id = $1 and u.role = 'learner' and u.status = 'active'
         union
         select u.id, u.display_name from arena_ratings r join users u on u.id = r.learner_id
         where r.season_id = $3 and r.cefr = $2 and u.organization_id = $1 and u.status = 'active'
       )
       select p.id as learner_id, p.display_name,
              (case when $4 = 'total'
                 then coalesce(sum(r.rating), 0) + (6 - count(r.game_key)) * ${ARENA_START_RATING}
                 else coalesce(max(r.rating) filter (where r.game_key = $4), ${ARENA_START_RATING}) end)::int as rating
       from players p
       left join arena_ratings r on r.learner_id = p.id and r.season_id = $3 and r.cefr = $2
       group by p.id, p.display_name
       order by rating desc, p.display_name, p.id`,
      [organizationId, level, seasonId, game, includeCurrentMembers]);
    // Equal ratings share a rank (no tie-breaker in the rules).
    let rank = 0;
    let previous: number | null = null;
    return rows.rows.map((row, index) => {
      if (row.rating !== previous) { rank = index + 1; previous = row.rating; }
      return { rank, learnerId: row.learner_id, displayName: row.display_name, rating: row.rating };
    });
  }

  private async snapshotSource(learnerId: string, game: GameKey, setKind: ArenaSetKind): Promise<GameWordSetView & { unitIds: string[] }> {
    const sources = await this.engagement.arenaWordSources(learnerId);
    const set = setKind === "personal" ? sources?.personal : sources?.curriculum;
    if (!set) throw new ArenaError("ARENA_SET_NOT_FOUND", 409, { setKind });
    const units = gameRoundWords(game, set.words, ATTEMPT_SEED);
    if (units.length < ARENA_MIN_ROUND_UNITS) throw new ArenaError("ARENA_NOT_ENOUGH_WORDS", 409, { minimum: ARENA_MIN_ROUND_UNITS, available: units.length });
    return { ...set, unitIds: units.map((unit) => unit.id) };
  }

  private async insertSnapshot(client: PoolClient, set: GameWordSetView & { unitIds: string[] }, game: GameKey, setKind: ArenaSetKind): Promise<string> {
    const id = randomUUID();
    await client.query(
      `insert into game_sets (id, learner_id, game_key, status, payload, round_units)
       values ($1, null, 'arena_snapshot', 'published', $2::jsonb, $3::jsonb)`,
      [id, JSON.stringify({
        topic: set.topic, cefr: set.cefr, words: set.words, ...(set.distractors ? { distractors: set.distractors } : {}),
        source: "arena", setKind, ...(set.id ? { sourceGameSetId: set.id } : {})
      }), JSON.stringify({ game, attemptSeed: ATTEMPT_SEED, unitIds: set.unitIds })]);
    return id;
  }

  private async round(matchId: string): Promise<{ wordSet: GameWordSetView; unitIds: string[] }> {
    const result = await this.pool.query<{ id: string; payload: Record<string, unknown>; round_units: { unitIds?: string[] } | null }>(
      "select gs.id, gs.payload, gs.round_units from arena_matches m join game_sets gs on gs.id = m.game_set_id where m.id = $1", [matchId]);
    const row = result.rows[0]!;
    const words = Array.isArray(row.payload.words) ? row.payload.words as GameWordSetView["words"] : [];
    return {
      wordSet: {
        id: row.id, topic: String(row.payload.topic ?? ""), cefr: String(row.payload.cefr ?? "B1") as CefrLevel,
        source: row.payload.setKind === "curriculum" ? "monthly" : "custom", words,
        ...(Array.isArray(row.payload.distractors) ? { distractors: row.payload.distractors as GameWordSetView["words"] } : {})
      },
      unitIds: Array.isArray(row.round_units?.unitIds) ? row.round_units.unitIds : []
    };
  }

  private assertPlayable(match: MatchRow): void {
    if (match.status !== "accepted") throw new ArenaError("ARENA_MATCH_CLOSED", 409);
    if (match.play_deadline && match.play_deadline.getTime() <= Date.now()) throw new ArenaError("ARENA_PLAY_DEADLINE_PASSED", 409);
  }

  private async replayedResult(learnerId: string, matchId: string, requestId: string): Promise<{ match: ArenaMatchView; result: ArenaResultView } | null> {
    const found = await this.pool.query<{ id: string; game_key: GameKey; score: number; details: Record<string, unknown>; gameplay_ms: number | null; completed_at: Date; arena_match_id: string | null }>(
      "select id, game_key, score, details, gameplay_ms, completed_at, arena_match_id from game_results where learner_id = $1 and request_key = $2 limit 1",
      [learnerId, requestId]);
    const row = found.rows[0];
    if (!row) return null;
    if (row.arena_match_id !== matchId) throw new ArenaError("ARENA_REQUEST_ID_REUSED", 409);
    const match = await this.match(learnerId, matchId);
    if (!match) throw new ArenaError("ARENA_MATCH_NOT_FOUND", 404);
    return { match, result: { id: row.id, game: row.game_key, score: row.score, maxScore: 100, correct: Number(row.details.correct ?? 0),
      total: Number(row.details.total ?? 0), gameplayMs: row.gameplay_ms, completedAt: row.completed_at.toISOString() } };
  }

  private async byRequestKey(learnerId: string, requestId: string): Promise<ArenaMatchView | null> {
    const found = await this.pool.query<{ id: string }>("select id from arena_matches where poster_id = $1 and request_key = $2", [learnerId, requestId]);
    return found.rows[0] ? this.match(learnerId, found.rows[0].id) : null;
  }

  private async openRankedCount(db: Pool | PoolClient, learnerId: string): Promise<number> {
    const result = await db.query<{ count: number }>(
      `select count(*)::int as count from arena_matches
       where mode = 'ranked' and (status = 'accepted' or (status = 'open' and accept_deadline > now()))
         and (poster_id = $1 or opponent_id = $1)`, [learnerId]);
    return result.rows[0]?.count ?? 0;
  }

  private async lockPlayers(client: PoolClient, learners: string[]): Promise<void> {
    for (const learner of [...new Set(learners)].sort()) {
      await client.query("select pg_advisory_xact_lock(hashtext($1))", [`arena-player:${learner}`]);
    }
  }

  private async matchRow(db: Pool | PoolClient, matchId: string, lock = false): Promise<MatchRow | null> {
    const result = await db.query<MatchRow>(
      `select * from arena_matches where id = $1 ${lock ? "for update" : ""}`, [matchId]);
    return result.rows[0] ?? null;
  }

  private async myMatches(learnerId: string): Promise<ArenaMatchView[]> {
    const rows = await this.pool.query<MatchRow>(
      `select * from arena_matches
       where poster_id = $1 or opponent_id = $1
       order by case when status in ('open', 'invited', 'accepted') then 0 else 1 end, coalesce(settled_at, created_at) desc
       limit 100`, [learnerId]);
    return this.views(learnerId, rows.rows);
  }

  private async views(learnerId: string, rows: MatchRow[]): Promise<ArenaMatchView[]> {
    const others = [...new Set(rows.map((row) => row.poster_id === learnerId ? row.opponent_id : row.poster_id).filter((id): id is string => Boolean(id)))];
    const names = new Map((await this.pool.query<{ id: string; display_name: string }>(
      "select id, display_name from users where id = any($1::uuid[])", [others])).rows.map((row) => [row.id, row.display_name]));
    return rows.map((row) => {
      const side = row.poster_id === learnerId ? "poster" : "opponent";
      const other = side === "poster" ? "opponent" : "poster";
      const otherId = side === "poster" ? row.opponent_id : row.poster_id;
      const settled = row.status === "settled";
      const outcome = !settled || !row.outcome ? null : row.outcome === "draw" ? "draw" : row.outcome === side ? "win" : "lose";
      const before = row[`${side}_rating_before` as const];
      const after = row[`${side}_rating_after` as const];
      return {
        id: row.id, mode: row.mode, game: row.game_key, cefr: row.cefr, status: row.status, setKind: row.set_kind, setTopic: row.set_topic,
        postedByMe: side === "poster",
        opponent: otherId && (row.mode === "friendly" || row.status !== "open")
          ? { id: otherId, displayName: names.get(otherId) ?? "", cefr: side === "poster" ? row.opponent_cefr : row.poster_cefr } : null,
        createdAt: row.created_at.toISOString(), acceptDeadline: row.accept_deadline.toISOString(),
        acceptedAt: row.accepted_at?.toISOString() ?? null, playDeadline: row.play_deadline?.toISOString() ?? null,
        settledAt: row.settled_at?.toISOString() ?? null, cancelReason: row.cancel_reason,
        me: { started: Boolean(row[`${side}_started_at` as const]), played: row[`${side}_score` as const] !== null, score: row[`${side}_score` as const], gameplayMs: row[`${side}_gameplay_ms` as const] },
        them: { played: row[`${other}_score` as const] !== null, score: settled ? row[`${other}_score` as const] : null },
        result: outcome && row.decided_by ? {
          outcome, decidedBy: row.decided_by,
          rating: row.mode === "ranked" && before !== null && after !== null
            ? { before, after, change: after - before, base: row.base_points, decayPercent: row.decay_percent, meetingIndex: row.meeting_index }
            : null
        } : null
      };
    });
  }

  private async eligibleContext(learnerId: string): Promise<LearnerContext> {
    const context = await this.learnerContext(learnerId);
    if (!context) throw new ArenaError("ARENA_CONTEXT_NOT_FOUND", 404);
    if (!arenaEligible(context.cefr)) throw new ArenaError("ARENA_LEVEL_REQUIRED", 403, { requiredLevel: "B1" });
    return context;
  }

  private async learnerContext(learnerId: string): Promise<LearnerContext | null> {
    const result = await this.pool.query<{ id: string; organization_id: string; display_name: string; cefr: CefrLevel; today: string }>(
      `select u.id, u.organization_id, u.display_name, e.cefr, organization_system_date(u.organization_id)::text as today
       from users u join enrollments e on e.learner_id = u.id and e.cefr_approved and e.cefr is not null
       join programs p on p.id = e.program_id and p.status = 'active'
       where u.id = $1 and u.role = 'learner' and u.status = 'active'
       order by e.enrolled_at desc limit 1`, [learnerId]);
    const row = result.rows[0];
    return row ? { id: row.id, organizationId: row.organization_id, displayName: row.display_name, cefr: row.cefr, today: row.today } : null;
  }

  private async managerOrganization(managerId: string): Promise<{ id: string; today: string }> {
    const result = await this.pool.query<{ organization_id: string; today: string }>(
      `select organization_id, organization_system_date(organization_id)::text as today
       from users where id = $1 and role = 'manager' and status = 'active'`, [managerId]);
    const row = result.rows[0];
    if (!row) throw new ArenaError("MANAGER_ORGANIZATION_NOT_FOUND", 404);
    return { id: row.organization_id, today: row.today };
  }

  private async withTx<T>(work: (client: PoolClient) => Promise<T>): Promise<T> {
    const client = await this.pool.connect();
    try {
      await client.query("begin");
      const result = await work(client);
      await client.query("commit");
      return result;
    } catch (error) {
      await client.query("rollback").catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }
  }
}

function sideOf(match: MatchRow, learnerId: string): "poster" | "opponent" | null {
  if (match.poster_id === learnerId) return "poster";
  if (match.opponent_id === learnerId) return "opponent";
  return null;
}
