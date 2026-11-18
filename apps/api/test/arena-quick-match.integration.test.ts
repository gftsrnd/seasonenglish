import { randomUUID } from "node:crypto";
import { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { migrateDatabase, resetPublicSchema, seedDemo } from "@e4s/database";
import { createPinHash } from "@e4s/domain/identity";
import { DEMO_IDS } from "@e4s/test-support";
import { buildApi } from "../src/app.js";

const databaseUrl = process.env.TEST_DATABASE_URL
  ?? "postgres://e4s:e4s_test_password@127.0.0.1:55432/e4s_test";

const WORDS = ["alpha", "bravo", "charlie", "delta", "echo", "foxtrot", "golf", "hotel", "india", "juliet", "kilo", "lima"];

describe("arena quick match (Đấu on a Mini game card)", () => {
  const pool = new Pool({ connectionString: databaseUrl });
  const app = buildApi({ pool, allowDemoLogin: true, secureCookies: false });
  const learners = Array.from({ length: 8 }, (_, index) => ({
    id: `20000000-0000-4000-8000-0000000003${String(index + 11)}`,
    email: `quick${index + 1}@e4s.local`,
    name: `Quick Learner ${index + 1}`,
    cookie: ""
  }));
  const [q1, q2, q3, q4, q5, q6, q7, q8] = learners as Array<typeof learners[number]> as [
    typeof learners[number], typeof learners[number], typeof learners[number], typeof learners[number],
    typeof learners[number], typeof learners[number], typeof learners[number], typeof learners[number]];
  let a2Cookie = "";

  beforeAll(async () => {
    const client = await pool.connect();
    try {
      await resetPublicSchema(client);
      await migrateDatabase(client);
      await seedDemo(client);
      await client.query("insert into user_credentials (user_id, credential_hash) values ($1, $2)", [DEMO_IDS.learner, await createPinHash("123456")]);
      for (const [index, learner] of learners.entries()) {
        await client.query("insert into users (id, organization_id, role, display_name, email) values ($1, $2, 'learner', $3, $4)",
          [learner.id, DEMO_IDS.organization, learner.name, learner.email]);
        await client.query("insert into user_credentials (user_id, credential_hash) values ($1, $2)", [learner.id, await createPinHash("123456")]);
        await client.query("insert into enrollments (id, program_id, learner_id, cefr, cefr_approved) values ($1, $2, $3, 'B1', true)",
          [`20000000-0000-4000-8000-0000000004${String(index + 11)}`, DEMO_IDS.program, learner.id]);
        await client.query(
          `insert into game_sets (id, learner_id, game_key, status, payload)
           values ($1, $2, 'monthly_vocabulary', 'published',
                   $3::jsonb || jsonb_build_object('month', to_char(organization_system_date($4), 'YYYY-MM')))`,
          [randomUUID(), learner.id, JSON.stringify({
            topic: "Radio alphabet", cefr: "B1", source: "ai",
            words: WORDS.map((english, wordIndex) => ({ id: `w-${wordIndex + 1}`, english, vietnamese: `từ ${wordIndex + 1}`, definition: english, partOfSpeech: "noun" }))
          }), DEMO_IDS.organization]);
      }
    } finally {
      client.release();
    }
    await app.ready();
    const login = async (email: string) => {
      const response = await app.inject({ method: "POST", url: "/api/auth/learner/login", payload: { email, pin: "123456" } });
      expect(response.statusCode, response.body).toBe(200);
      return String(response.headers["set-cookie"]).split(";")[0] ?? "";
    };
    for (const learner of learners) learner.cookie = await login(learner.email);
    a2Cookie = await login("minh.anh.nguyen@e4s.local");
  }, 60_000);

  afterAll(async () => { await app.close(); await pool.end(); });

  const quick = (cookie: string, game = "scramble", requestId: string = randomUUID()) =>
    app.inject({ method: "POST", url: "/api/v1/arena/quick-match", headers: { cookie }, payload: { requestId, game } });

  async function quickOk(learner: { cookie: string }, game = "scramble", requestId?: string) {
    const response = await quick(learner.cookie, game, requestId);
    expect(response.statusCode, response.body).toBe(200);
    return response.json() as { joined: boolean; match: { id: string; status: string; game: string; mode: string; setKind: string; postedByMe: boolean } };
  }

  it("is B1+ only and validates the body", async () => {
    expect((await quick(a2Cookie)).statusCode).toBe(403);
    const invalid = await app.inject({ method: "POST", url: "/api/v1/arena/quick-match", headers: { cookie: q1.cookie }, payload: { requestId: randomUUID(), game: "chess" } });
    expect(invalid.statusCode).toBe(400);
  });

  it("posts a challenge with the current Mini game set when nothing is open, and a replay returns it", async () => {
    const requestId = randomUUID();
    const first = await quickOk(q1, "scramble", requestId);
    expect(first).toMatchObject({ joined: false, match: { mode: "ranked", status: "open", game: "scramble", setKind: "personal", postedByMe: true } });
    const replay = await quickOk(q1, "scramble", requestId);
    expect(replay.match.id).toBe(first.match.id);
    // Never joins your own challenge: a second tap posts another one.
    const second = await quickOk(q1, "scramble");
    expect(second).toMatchObject({ joined: false, match: { status: "open", postedByMe: true } });
    expect(second.match.id).not.toBe(first.match.id);
    // Another learner joins the oldest open challenge of the same game.
    const joined = await quickOk(q2, "scramble");
    expect(joined).toMatchObject({ joined: true, match: { id: first.match.id, status: "accepted", postedByMe: false } });
    // A different game does not match: it posts.
    expect(await quickOk(q2, "typing")).toMatchObject({ joined: false, match: { status: "open", game: "typing" } });
  });

  it("skips a pair already in play and stays within the 3-open cap", async () => {
    // q1 and q2 already play each other; q1's remaining scramble challenge is not for q2.
    const posted = await quickOk(q2, "scramble");
    expect(posted).toMatchObject({ joined: false, match: { status: "open", postedByMe: true } });
    // q2 now has 3 open ranked matches (accepted + typing + scramble).
    const capped = await quick(q2.cookie, "eggs");
    expect(capped.statusCode).toBe(409);
    expect(capped.json()).toMatchObject({ code: "ARENA_OPEN_LIMIT", max: 3 });
    // A free learner takes the oldest one: q1's second scramble (older than q2's).
    const joined = await quickOk(q3, "scramble");
    expect(joined.joined).toBe(true);
    const row = (await pool.query("select poster_id from arena_matches where id = $1", [joined.match.id])).rows[0];
    expect(row.poster_id).toBe(q1.id);
  });

  it("lets exactly one of two simultaneous quick matches take a single open challenge", async () => {
    const open = await quickOk(q4, "sort");
    expect(open.joined).toBe(false);
    const [a, b] = await Promise.all([quickOk(q5, "sort"), quickOk(q6, "sort")]);
    expect([a.joined, b.joined].sort()).toEqual([false, true]);
    const taken = a.joined ? a : b;
    expect(taken.match.id).toBe(open.match.id);
    const accepted = await pool.query("select count(*)::int as count from arena_matches where id = $1 and status = 'accepted'", [open.match.id]);
    expect(accepted.rows[0].count).toBe(1);
    // The loser of the race posted its own challenge instead.
    const other = a.joined ? b : a;
    expect(other.match).toMatchObject({ status: "open", postedByMe: true, game: "sort" });
  });

  it("friendly invites default to the inviter's current Mini game set", async () => {
    const invite = await app.inject({ method: "POST", url: "/api/v1/arena/friendly", headers: { cookie: q7.cookie },
      payload: { requestId: randomUUID(), opponentId: q8.id, game: "mario" } });
    expect(invite.statusCode, invite.body).toBe(201);
    expect(invite.json()).toMatchObject({ mode: "friendly", status: "invited", setKind: "personal" });
  });
});
