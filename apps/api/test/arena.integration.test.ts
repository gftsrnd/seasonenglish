import { randomUUID } from "node:crypto";
import { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { ArenaRepository, migrateDatabase, resetPublicSchema, seedDemo } from "@e4s/database";
import { createCredentialHash, createPinHash } from "@e4s/domain/identity";
import { gameRoundWords } from "@e4s/domain/engagement";
import { DEMO_IDS } from "@e4s/test-support";
import { buildApi } from "../src/app.js";

const databaseUrl = process.env.TEST_DATABASE_URL
  ?? "postgres://e4s:e4s_test_password@127.0.0.1:55432/e4s_test";

const WORDS = ["alpha", "bravo", "charlie", "delta", "echo", "foxtrot", "golf", "hotel", "india", "juliet", "kilo", "lima"];

describe("arena phase 2: XH, open challenges, friendly invites and the ledger", () => {
  const pool = new Pool({ connectionString: databaseUrl });
  const app = buildApi({ pool, allowDemoLogin: true, secureCookies: false });
  const arena = new ArenaRepository(pool);
  const learners = Array.from({ length: 7 }, (_, index) => ({
    id: `20000000-0000-4000-8000-0000000000${String(index + 11)}`,
    email: `arena${index + 1}@e4s.local`,
    name: `Arena Learner ${index + 1}`,
    cefr: index === 5 ? "B2" : "B1",
    cookie: ""
  }));
  const [l1, l2, l3, l4, l5, l6, l7] = learners as [typeof learners[number], typeof learners[number], typeof learners[number],
    typeof learners[number], typeof learners[number], typeof learners[number], typeof learners[number]];
  let a2Cookie = "";
  let managerCookie = "";

  beforeAll(async () => {
    const client = await pool.connect();
    try {
      await resetPublicSchema(client);
      await migrateDatabase(client);
      await seedDemo(client);
      await client.query("insert into user_credentials (user_id, credential_hash) values ($1, $2), ($3, $4)",
        [DEMO_IDS.learner, await createPinHash("123456"), DEMO_IDS.manager, await createCredentialHash("manager-pass")]);
      for (const [index, learner] of learners.entries()) {
        await client.query("insert into users (id, organization_id, role, display_name, email) values ($1, $2, 'learner', $3, $4)",
          [learner.id, DEMO_IDS.organization, learner.name, learner.email]);
        await client.query("insert into user_credentials (user_id, credential_hash) values ($1, $2)", [learner.id, await createPinHash("123456")]);
        await client.query("insert into enrollments (id, program_id, learner_id, cefr, cefr_approved) values ($1, $2, $3, $4, true)",
          [`20000000-0000-4000-8000-0000000002${String(index + 11)}`, DEMO_IDS.program, learner.id, learner.cefr]);
        await client.query(
          `insert into game_sets (id, learner_id, game_key, status, payload)
           values ($1, $2, 'monthly_vocabulary', 'published',
                   $3::jsonb || jsonb_build_object('month', to_char(organization_system_date($4), 'YYYY-MM')))`,
          [randomUUID(), learner.id, JSON.stringify({
            topic: "Radio alphabet", cefr: learner.cefr, source: "ai",
            words: WORDS.map((english, wordIndex) => ({ id: `w-${wordIndex + 1}`, english, vietnamese: `từ ${wordIndex + 1}`, definition: english, partOfSpeech: "noun" }))
          }), DEMO_IDS.organization]);
      }
    } finally {
      client.release();
    }
    await app.ready();
    const login = async (url: string, payload: Record<string, string>) => {
      const response = await app.inject({ method: "POST", url, payload });
      expect(response.statusCode, response.body).toBe(200);
      return String(response.headers["set-cookie"]).split(";")[0] ?? "";
    };
    for (const learner of learners) learner.cookie = await login("/api/auth/learner/login", { email: learner.email, pin: "123456" });
    a2Cookie = await login("/api/auth/learner/login", { email: "minh.anh.nguyen@e4s.local", pin: "123456" });
    managerCookie = await login("/api/auth/staff/login", { email: "quoc.bao.le@e4s.local", password: "manager-pass" });
  }, 60_000);

  afterAll(async () => { await app.close(); await pool.end(); });

  const call = (cookie: string, method: "GET" | "POST" | "PUT", url: string, payload?: unknown) =>
    app.inject({ method, url, headers: { cookie }, ...(payload === undefined ? {} : { payload: payload as Record<string, unknown> }) });

  async function post(learner: { cookie: string }, game = "scramble") {
    const response = await call(learner.cookie, "POST", "/api/v1/arena/challenges", { requestId: randomUUID(), game, setKind: "personal" });
    expect(response.statusCode, response.body).toBe(201);
    return response.json().id as string;
  }

  async function accept(learner: { cookie: string }, matchId: string) {
    const response = await call(learner.cookie, "POST", `/api/v1/arena/challenges/${matchId}/accept`);
    expect(response.statusCode, response.body).toBe(200);
    return response.json();
  }

  /** Starts and submits one round: the first `correct` units right first time, `ms` each. */
  async function play(learner: { cookie: string }, matchId: string, correct: number, ms = 1_000, requestId: string = randomUUID()) {
    const start = await call(learner.cookie, "POST", `/api/v1/arena/matches/${matchId}/start`);
    expect(start.statusCode, start.body).toBe(200);
    const { unitIds, wordSet } = start.json() as { unitIds: string[]; wordSet: { words: Array<{ id: string; english: string }> } };
    const english = new Map(wordSet.words.map((word) => [word.id, word.english]));
    const answers = unitIds.map((wordId, index) => ({ wordId, answer: index < correct ? english.get(wordId)! : "zzz", attempts: 1, ms }));
    return call(learner.cookie, "POST", `/api/v1/arena/matches/${matchId}/result`, { requestId, answers });
  }

  async function rating(learnerId: string, game = "scramble"): Promise<number | null> {
    const result = await pool.query<{ rating: number }>(
      "select rating from arena_ratings where learner_id = $1 and game_key = $2 and cefr = 'B1'", [learnerId, game]);
    return result.rows[0]?.rating ?? null;
  }

  async function matchRow(matchId: string) {
    return (await pool.query("select * from arena_matches where id = $1", [matchId])).rows[0];
  }

  it("keeps the arena to B1+ and shows the 6 ratings, total and rank", async () => {
    const refused = await call(a2Cookie, "POST", "/api/v1/arena/challenges", { requestId: randomUUID(), game: "scramble", setKind: "personal" });
    expect(refused.statusCode).toBe(403);
    expect(refused.json()).toMatchObject({ code: "ARENA_LEVEL_REQUIRED" });
    const view = await call(l1.cookie, "GET", "/api/v1/arena");
    expect(view.statusCode, view.body).toBe(200);
    expect(view.json()).toMatchObject({
      eligible: true, level: "B1", total: 6_000, maxOpenRanked: 3,
      ratings: { scramble: 1_000, crossword: 1_000, eggs: 1_000, mario: 1_000, sort: 1_000, typing: 1_000 },
      rank: { position: 1, of: 6 }
    });
    expect(view.json().season).toMatchObject({ status: "active" });
    // The old duel URLs stay retired.
    expect((await call(l1.cookie, "GET", "/api/v1/engagement/arena")).statusCode).toBe(410);
  });

  it("lists an open challenge to the same level without the poster, and one of two simultaneous accepts wins", async () => {
    const matchId = await post(l1);
    const listed = await call(l2.cookie, "GET", "/api/v1/arena/challenges");
    expect(listed.statusCode, listed.body).toBe(200);
    const challenge = listed.json().challenges.find((item: { id: string }) => item.id === matchId);
    expect(challenge).toMatchObject({ game: "scramble", setKind: "personal", setTopic: "Radio alphabet" });
    expect(Object.keys(challenge).sort()).toEqual(["acceptDeadline", "createdAt", "game", "id", "setKind", "setTopic"]);
    expect(JSON.stringify(listed.json())).not.toContain(l1.name);
    expect((await call(l1.cookie, "GET", "/api/v1/arena/challenges")).json().challenges).toEqual([]);
    // Another level does not see it.
    expect((await call(l6.cookie, "GET", "/api/v1/arena/challenges")).json().challenges).toEqual([]);

    const [first, second] = await Promise.all([
      call(l2.cookie, "POST", `/api/v1/arena/challenges/${matchId}/accept`),
      call(l3.cookie, "POST", `/api/v1/arena/challenges/${matchId}/accept`)
    ]);
    expect([first.statusCode, second.statusCode].sort()).toEqual([200, 409]);
    const loser = first.statusCode === 409 ? first : second;
    expect(loser.json()).toMatchObject({ code: "ARENA_CHALLENGE_TAKEN" });
    const winner = first.statusCode === 200 ? l2 : l3;
    const row = await matchRow(matchId);
    expect(row).toMatchObject({ status: "accepted", opponent_id: winner.id, poster_rating_snapshot: 1_000, opponent_rating_snapshot: 1_000, meeting_index: 1 });
    expect(row.play_deadline.getTime() - row.accepted_at.getTime()).toBe(24 * 3_600_000);
    // Poster gets "Tới lượt bạn chơi"; the accepted view now names the opponent but shows no +/-.
    const turn = await pool.query("select kind, context from inbox_notifications where recipient_id = $1 and event_key = $2", [l1.id, `arena:${matchId}:turn`]);
    expect(turn.rows).toEqual([{ kind: "arena_turn", context: "games" }]);
    const mine = await call(l1.cookie, "GET", `/api/v1/arena/matches/${matchId}`);
    expect(mine.json()).toMatchObject({ status: "accepted", opponent: { id: winner.id }, result: null });
  });

  it("settles once on score, replays do not count twice, and repeats decay 50 → 25 → 13 → 0", async () => {
    // Clean slate for the pair l1/l2 on scramble.
    await pool.query("update arena_matches set status = 'cancelled', cancel_reason = 'season_changed' where status in ('open', 'accepted')");
    await pool.query("delete from arena_matches where status = 'cancelled'");
    await pool.query("delete from arena_ratings");
    const transfers: Array<[number, number, number]> = [];
    for (let round = 1; round <= 4; round += 1) {
      const matchId = await post(l1);
      await accept(l2, matchId);
      if (round === 1) {
        // 1 open ranked match per pair: while this one is in play, l2 cannot take another l1 challenge.
        const second = await post(l1);
        expect((await call(l2.cookie, "GET", "/api/v1/arena/challenges")).json().challenges.map((item: { id: string }) => item.id)).not.toContain(second);
        const busy = await call(l2.cookie, "POST", `/api/v1/arena/challenges/${second}/accept`);
        expect(busy.statusCode).toBe(409);
        expect(busy.json()).toMatchObject({ code: "ARENA_PAIR_BUSY" });
        await pool.query("delete from arena_matches where id = $1", [second]);
      }
      const requestId = randomUUID();
      const posterRound = await play(l1, matchId, 8, 1_000, requestId);
      expect(posterRound.statusCode, posterRound.body).toBe(200);
      expect(posterRound.json()).toMatchObject({ result: { score: 100, maxScore: 100 }, match: { status: "accepted", them: { played: false } } });
      const opponentRound = await play(l2, matchId, 4);
      expect(opponentRound.statusCode, opponentRound.body).toBe(200);
      expect(opponentRound.json().match).toMatchObject({ status: "settled", result: { outcome: "lose", decidedBy: "score" } });
      if (round === 1) {
        // Replaying the same submit returns the first result and changes nothing.
        const replay = await call(l1.cookie, "POST", `/api/v1/arena/matches/${matchId}/result`, {
          requestId, answers: [{ wordId: "w-1", answer: "zzz" }]
        });
        expect(replay.statusCode, replay.body).toBe(200);
        expect(replay.json()).toMatchObject({ result: { id: posterRound.json().result.id, score: 100 }, match: { status: "settled" } });
        const counts = await pool.query(
          `select (select count(*)::int from game_results where arena_match_id = $1) as results,
                  (select count(*)::int from activities a join game_results g on g.id = a.reference_id where g.arena_match_id = $1) as activities`, [matchId]);
        expect(counts.rows[0]).toEqual({ results: 2, activities: 2 });
        const another = await call(l1.cookie, "POST", `/api/v1/arena/matches/${matchId}/result`, { requestId: randomUUID(), answers: [{ wordId: "w-1", answer: "x" }] });
        expect(another.statusCode).toBe(409);
        // Both get "Trận đã có kết quả".
        const results = await pool.query("select recipient_id from inbox_notifications where event_key = $1 and kind = 'arena_result' order by recipient_id", [`arena:${matchId}:result`]);
        expect(results.rows.map((item) => item.recipient_id).sort()).toEqual([l1.id, l2.id].sort());
      }
      const row = await matchRow(matchId);
      expect(row).toMatchObject({ outcome: "poster", decided_by: "score", meeting_index: round, base_points: 50 });
      transfers.push([row.transfer_points, row.poster_rating_after, row.opponent_rating_after]);
    }
    expect(transfers).toEqual([[50, 1_050, 950], [25, 1_075, 925], [13, 1_088, 912], [0, 1_088, 912]]);
    const mine = await call(l1.cookie, "GET", "/api/v1/arena");
    expect(mine.json()).toMatchObject({ ratings: { scramble: 1_088 }, total: 6_088, rank: { position: 1 } });
    const board = await call(l2.cookie, "GET", "/api/v1/arena/leaderboard?game=scramble");
    expect(board.statusCode, board.body).toBe(200);
    expect(board.json().entries[0]).toMatchObject({ rank: 1, learnerId: l1.id, rating: 1_088 });
    expect(board.json().me).toMatchObject({ rating: 912, of: 6 });
    expect(board.json().me.rank).toBe(6);
    const typing = await call(l2.cookie, "GET", "/api/v1/arena/leaderboard?game=typing");
    expect(typing.statusCode, typing.body).toBe(200);
    expect(typing.json().entries).toHaveLength(6);
    expect(typing.json().entries).toEqual(Array.from({ length: 6 }, () => expect.objectContaining({ rank: 1, rating: 1_000 })));
    expect(typing.json().me).toMatchObject({ rank: 1, rating: 1_000, of: 6 });
    // Changing game does not reset the meeting count: a 5th meeting today on sort moves 0.
    const sortMatch = await post(l1, "sort");
    await accept(l2, sortMatch);
    expect((await matchRow(sortMatch)).meeting_index).toBe(5);
  });

  it("wins on time on equal scores, and giving up an accepted match loses (before or after start)", async () => {
    await pool.query("update arena_matches set status = 'cancelled' where status in ('open', 'accepted')");
    const matchId = await post(l3, "typing");
    await accept(l4, matchId);
    expect((await play(l3, matchId, 5, 2_000)).statusCode).toBe(200);
    const settled = await play(l4, matchId, 5, 1_000);
    expect(settled.json().match).toMatchObject({ status: "settled", result: { outcome: "win", decidedBy: "time", rating: { change: 50 } } });

    const forfeitMatch = await post(l3, "typing");
    await accept(l4, forfeitMatch);
    expect((await call(l3.cookie, "POST", `/api/v1/arena/matches/${forfeitMatch}/start`)).statusCode).toBe(200);
    const quit = await call(l3.cookie, "POST", `/api/v1/arena/matches/${forfeitMatch}/forfeit`);
    expect(quit.statusCode, quit.body).toBe(200);
    expect(quit.json()).toMatchObject({ status: "settled", result: { outcome: "lose", decidedBy: "forfeit" } });
    expect(await matchRow(forfeitMatch)).toMatchObject({ outcome: "opponent", decided_by: "forfeit", forfeited_by: l3.id });

    const unplayed = await post(l3, "typing");
    await accept(l4, unplayed);
    const giveUp = await call(l4.cookie, "POST", `/api/v1/arena/matches/${unplayed}/forfeit`);
    expect(giveUp.statusCode, giveUp.body).toBe(200);
    expect(giveUp.json()).toMatchObject({ status: "settled", result: { outcome: "lose", decidedBy: "forfeit" } });
  });

  it("shows a challenge's round words to the same level before accepting, never to another level", async () => {
    await pool.query("update arena_matches set status = 'cancelled' where status in ('open', 'accepted')");
    const matchId = await post(l3, "scramble");
    const seen = await call(l4.cookie, "GET", `/api/v1/arena/matches/${matchId}/words`);
    expect(seen.statusCode, seen.body).toBe(200);
    expect(seen.json().words.length).toBeGreaterThan(0);
    expect(seen.json().words[0]).toEqual(expect.objectContaining({ english: expect.any(String), vietnamese: expect.any(String) }));
    expect((await call(l6.cookie, "GET", `/api/v1/arena/matches/${matchId}/words`)).statusCode).toBe(404);
    expect((await call(l3.cookie, "GET", `/api/v1/arena/matches/${matchId}/words`)).statusCode).toBe(200);
  });

  it("lets only the poster withdraw a challenge nobody accepted, without XH change", async () => {
    await pool.query("update arena_matches set status = 'cancelled' where status in ('open', 'accepted')");
    const matchId = await post(l3, "sort");
    expect((await call(l4.cookie, "POST", `/api/v1/arena/matches/${matchId}/cancel`)).statusCode).toBe(404);
    const withdrawn = await call(l3.cookie, "POST", `/api/v1/arena/matches/${matchId}/cancel`);
    expect(withdrawn.statusCode, withdrawn.body).toBe(200);
    expect(withdrawn.json()).toMatchObject({ status: "cancelled", cancelReason: "withdrawn", result: null });
    expect((await call(l3.cookie, "POST", `/api/v1/arena/matches/${matchId}/cancel`)).statusCode).toBe(409);
    const accepted = await post(l3, "sort");
    await accept(l4, accepted);
    expect((await call(l3.cookie, "POST", `/api/v1/arena/matches/${accepted}/cancel`)).statusCode).toBe(409);
  });

  it("caps open ranked matches at 3 per player, posted and accepted together", async () => {
    await pool.query("update arena_matches set status = 'cancelled' where status in ('open', 'accepted')");
    await post(l4, "eggs");
    await post(l4, "mario");
    const third = await post(l5, "sort");
    await accept(l4, third);
    const refused = await call(l4.cookie, "POST", "/api/v1/arena/challenges", { requestId: randomUUID(), game: "crossword", setKind: "personal" });
    expect(refused.statusCode).toBe(409);
    expect(refused.json()).toMatchObject({ code: "ARENA_OPEN_LIMIT", max: 3 });
    const other = await post(l5, "typing");
    const refusedAccept = await call(l4.cookie, "POST", `/api/v1/arena/challenges/${other}/accept`);
    expect(refusedAccept.statusCode).toBe(409);
    expect(refusedAccept.json()).toMatchObject({ code: "ARENA_OPEN_LIMIT" });
    // An idempotent repost with the same request id returns the same match, not a new one.
    const requestId = randomUUID();
    const once = await call(l5.cookie, "POST", "/api/v1/arena/challenges", { requestId, game: "eggs", setKind: "personal" });
    const twice = await call(l5.cookie, "POST", "/api/v1/arena/challenges", { requestId, game: "eggs", setKind: "personal" });
    expect(twice.json().id).toBe(once.json().id);
  });

  it("cancels every open match of a learner who changes level, without XH changes", async () => {
    const before = await pool.query("select id from arena_matches where status in ('open', 'accepted') and (poster_id = $1 or opponent_id = $1)", [l4.id]);
    expect(before.rows.length).toBe(3);
    const ratingBefore = await rating(l5.id, "sort");
    await pool.query("update enrollments set cefr = 'B2' where learner_id = $1", [l4.id]);
    const after = await pool.query("select status, cancel_reason from arena_matches where id = any($1::uuid[])", [before.rows.map((row) => row.id)]);
    expect(after.rows).toEqual(before.rows.map(() => ({ status: "cancelled", cancel_reason: "level_changed" })));
    expect(await rating(l5.id, "sort")).toBe(ratingBefore);
    await pool.query("update enrollments set cefr = 'B1' where learner_id = $1", [l4.id]);
  });

  it("expires unaccepted challenges after 24h and judges the play deadline once (timeout loss, both late → cancel)", async () => {
    await pool.query("update arena_matches set status = 'cancelled' where status in ('open', 'accepted', 'invited')");
    const stale = await post(l5, "crossword");
    await pool.query("update arena_matches set accept_deadline = now() - interval '1 minute' where id = $1", [stale]);
    const late = await call(l7.cookie, "POST", `/api/v1/arena/challenges/${stale}/accept`);
    expect(late.json()).toMatchObject({ code: "ARENA_CHALLENGE_EXPIRED" });

    const oneSided = await post(l5, "crossword");
    await accept(l7, oneSided);
    expect((await play(l5, oneSided, 3)).statusCode).toBe(200);
    const nobody = await post(l5, "eggs");
    await accept(l3, nobody);
    await pool.query("update arena_matches set play_deadline = now() - interval '1 minute' where id = any($1::uuid[])", [[oneSided, nobody]]);
    const tooLate = await call(l7.cookie, "POST", `/api/v1/arena/matches/${oneSided}/start`);
    expect(tooLate.statusCode).toBe(409);
    expect(tooLate.json()).toMatchObject({ code: "ARENA_PLAY_DEADLINE_PASSED" });

    const first = await arena.sweep();
    expect(first).toEqual({ expired: 1, timedOut: 1, cancelled: 1 });
    expect(await matchRow(stale)).toMatchObject({ status: "expired" });
    expect(await matchRow(oneSided)).toMatchObject({ status: "settled", outcome: "poster", decided_by: "timeout", transfer_points: 50 });
    expect(await matchRow(nobody)).toMatchObject({ status: "cancelled", cancel_reason: "both_timeout" });
    const ratings = [await rating(l5.id, "crossword"), await rating(l7.id, "crossword")];
    expect(ratings).toEqual([1_050, 950]);
    // Idempotent: a second sweep changes nothing.
    expect(await arena.sweep()).toEqual({ expired: 0, timedOut: 0, cancelled: 0 });
    expect([await rating(l5.id, "crossword"), await rating(l7.id, "crossword")]).toEqual(ratings);
  });

  it("floors the loser at 0 so the winner gains exactly what the loser had", async () => {
    const matchId = await post(l5, "mario");
    const season = (await pool.query("select season_id from arena_matches where id = $1", [matchId])).rows[0].season_id;
    await pool.query(
      `insert into arena_ratings (season_id, cefr, game_key, learner_id, rating) values ($1, 'B1', 'mario', $2, 30), ($1, 'B1', 'mario', $3, 10)
       on conflict (season_id, cefr, game_key, learner_id) do update set rating = excluded.rating`, [season, l5.id, l7.id]);
    await accept(l7, matchId);
    // Season-rio: answers by word id work the same way.
    expect((await play(l5, matchId, 6)).statusCode).toBe(200);
    expect((await play(l7, matchId, 1)).statusCode).toBe(200);
    expect(await matchRow(matchId)).toMatchObject({ base_points: 50, transfer_points: 10, poster_rating_after: 40, opponent_rating_after: 0 });
    expect(await rating(l7.id, "mario")).toBe(0);
  });

  it("friendly invites name the opponent, may cross levels, can be declined and never change XH", async () => {
    const invite = await call(l1.cookie, "POST", "/api/v1/arena/friendly", { requestId: randomUUID(), opponentId: l6.id, game: "scramble", setKind: "personal" });
    expect(invite.statusCode, invite.body).toBe(201);
    const inviteId = invite.json().id as string;
    expect(invite.json()).toMatchObject({ mode: "friendly", status: "invited", opponent: { id: l6.id, cefr: "B2" } });
    const bell = await pool.query("select kind from inbox_notifications where recipient_id = $1 and event_key = $2", [l6.id, `arena:${inviteId}:turn`]);
    expect(bell.rows).toEqual([{ kind: "arena_turn" }]);
    const declined = await call(l6.cookie, "POST", `/api/v1/arena/friendly/${inviteId}/decline`);
    expect(declined.json()).toMatchObject({ status: "declined" });

    const ratingsBefore = (await pool.query("select learner_id, game_key, rating from arena_ratings order by 1, 2")).rows;
    const second = await call(l1.cookie, "POST", "/api/v1/arena/friendly", { requestId: randomUUID(), opponentId: l2.id, game: "scramble", setKind: "personal" });
    const friendlyId = second.json().id as string;
    const accepted = await call(l2.cookie, "POST", `/api/v1/arena/friendly/${friendlyId}/accept`);
    expect(accepted.json()).toMatchObject({ status: "accepted" });
    expect((await play(l1, friendlyId, 8)).statusCode).toBe(200);
    const done = await play(l2, friendlyId, 2);
    expect(done.json().match).toMatchObject({ status: "settled", result: { outcome: "lose", rating: null } });
    expect(await matchRow(friendlyId)).toMatchObject({ mode: "friendly", transfer_points: null, season_id: null, meeting_index: null });
    expect((await pool.query("select learner_id, game_key, rating from arena_ratings order by 1, 2")).rows).toEqual(ratingsBefore);
    // Not counted as a ranked meeting: four settled ranked meetings today, so the next is the 5th.
    const next = await post(l1, "typing");
    await accept(l2, next);
    expect((await matchRow(next)).meeting_index).toBe(5);
  });

  it("counts each arena round as one mini game play within the shared 3 paid plays a day", async () => {
    await pool.query("update arena_matches set status = 'cancelled' where status in ('open', 'accepted', 'invited')");
    const player = l7;
    await pool.query("delete from reward_events where learner_id = $1", [player.id]);
    await pool.query("delete from activities where learner_id = $1 and activity_type = 'game'", [player.id]);
    const hub = await call(player.cookie, "GET", "/api/v1/engagement/games");
    const words = hub.json().wordSet.words as Array<{ id: string; english: string }>;
    const regular = () => call(player.cookie, "POST", "/api/v1/engagement/games/scramble/results", {
      requestId: randomUUID(), answers: gameRoundWords("scramble", words, 0).map((word) => ({ wordId: word.id, answer: word.english }))
    });
    expect((await regular()).statusCode).toBe(200);
    expect((await regular()).statusCode).toBe(200);
    const matchId = await post(l5, "sort");
    await accept(player, matchId);
    const start = await call(player.cookie, "POST", `/api/v1/arena/matches/${matchId}/start`);
    const { unitIds } = start.json() as { unitIds: string[] };
    const arenaRound = await call(player.cookie, "POST", `/api/v1/arena/matches/${matchId}/result`, {
      requestId: randomUUID(), answers: unitIds.map((wordId) => ({ wordId, answer: "noun" }))
    });
    expect(arenaRound.statusCode, arenaRound.body).toBe(200);
    expect(arenaRound.json().result.score).toBe(100);
    expect((await regular()).statusCode).toBe(200);
    const paid = await pool.query<{ arena: boolean; points: number }>(
      `select (a.evidence ? 'arenaMatchId') as arena, coalesce(re.points, 0) as points
       from activities a left join reward_events re on re.source_type = 'activity_points' and re.source_id = a.id and re.badge_id is null
       where a.learner_id = $1 and a.activity_type = 'game' order by a.occurred_at, a.id`, [player.id]);
    expect(paid.rows).toEqual([
      { arena: false, points: 5 }, { arena: false, points: 5 }, { arena: true, points: 5 }, { arena: false, points: 0 }
    ]);
    // XH never feeds season points or badges: the only reward rows are the three +5 plays.
    const rewards = await pool.query("select coalesce(sum(points), 0)::int as total from reward_events where learner_id = $1 and badge_id is null", [player.id]);
    expect(rewards.rows[0].total).toBe(15);
  });

  it("lets the Manager set the first season start; once matches exist it applies from the next season", async () => {
    const current = await call(managerCookie, "GET", "/api/v1/manager/arena-season");
    expect(current.statusCode, current.body).toBe(200);
    expect(current.json()).toMatchObject({ seasonMonths: 3, hasMatches: true, next: null });
    const endsOn = current.json().current.endsOn as string;
    const unconfirmed = await call(managerCookie, "PUT", "/api/v1/manager/arena-season", { startsOn: endsOn });
    expect(unconfirmed.statusCode).toBe(409);
    expect(unconfirmed.json()).toMatchObject({ code: "ARENA_SEASON_CONFIRM_REQUIRED", currentSeasonEnds: endsOn });
    const early = await call(managerCookie, "PUT", "/api/v1/manager/arena-season", { startsOn: current.json().current.startsOn, confirm: true });
    expect(early.json()).toMatchObject({ code: "ARENA_SEASON_START_TOO_EARLY" });
    const later = new Date(`${endsOn}T00:00:00Z`);
    later.setUTCDate(later.getUTCDate() + 10);
    const startsOn = later.toISOString().slice(0, 10);
    const saved = await call(managerCookie, "PUT", "/api/v1/manager/arena-season", { startsOn, confirm: true });
    expect(saved.statusCode, saved.body).toBe(200);
    expect(saved.json()).toMatchObject({ current: { endsOn }, next: { startsOn, status: "scheduled" } });
    expect((await call(l1.cookie, "GET", "/api/v1/manager/arena-season")).statusCode).toBe(403);
  });
});
