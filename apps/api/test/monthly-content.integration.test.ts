import { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildMonthlyCalendar, buildMonthlyCurriculum, createCredentialHash } from "@e4s/domain";
import { DEMO_IDS, migrateDatabase, resetPublicSchema, seedDemo } from "@e4s/database";
import { buildApi } from "../src/app.js";

const databaseUrl = process.env.TEST_DATABASE_URL ?? "postgres://e4s:e4s_test_password@127.0.0.1:55432/e4s_test";

describe("monthly content API", () => {
  const pool = new Pool({ connectionString: databaseUrl });
  const app = buildApi({ pool, secureCookies: false });
  let cookie = "";

  beforeAll(async () => {
    const client = await pool.connect();
    try {
      await resetPublicSchema(client);
      await migrateDatabase(client);
      await seedDemo(client);
      await client.query("insert into user_credentials (user_id, credential_hash) values ($1, $2)", [DEMO_IDS.operator, await createCredentialHash("operator-pass")]);
    } finally { client.release(); }
    await app.ready();
    const login = await app.inject({ method: "POST", url: "/api/auth/staff/login", payload: { email: "thu.ha.tran@e4s.local", password: "operator-pass" } });
    expect(login.statusCode, login.body).toBe(200);
    cookie = String(login.headers["set-cookie"]).split(";")[0] ?? "";
  }, 30_000);

  afterAll(async () => { await app.close(); await pool.end(); });

  it("keeps one shared brief and locks a submitted framework through the Operator API", async () => {
    const brief = await app.inject({
      method: "PUT", url: "/api/v1/content/months/2026-11/brief", headers: { cookie },
      payload: { title: "Quarterly budget review", brief: "Prepare a quarterly budget review.", context: "Finance meeting", communicationGoal: "Explain a cost." }
    });
    expect(brief.statusCode, brief.body).toBe(200);
    const saved = await app.inject({
      method: "POST", url: "/api/v1/content/months/2026-11/frameworks/generate", headers: { cookie }, payload: { contract: contract() }
    });
    expect(saved.statusCode, saved.body).toBe(200);
    const frameworkId = saved.json<{ id: string }>().id;
    const approved = await app.inject({ method: "POST", url: `/api/v1/content/month-frameworks/${frameworkId}/approve`, headers: { cookie } });
    expect(approved.statusCode, approved.body).toBe(204);
    const overview = await app.inject({ method: "GET", url: "/api/v1/content/months/2026-11", headers: { cookie } });
    expect(overview.statusCode, overview.body).toBe(200);
    expect(overview.json()).toMatchObject({ brief: { title: "Quarterly budget review" }, frameworks: [{ id: frameworkId, status: "approved" }] });
  });
});

function contract() {
  const month = "2026-11";
  const calendar = buildMonthlyCalendar(month);
  const count = calendar.effectiveDays.filter((date) => new Date(`${date}T00:00:00Z`).getUTCDay() !== 5).length * 3;
  return buildMonthlyCurriculum({
    month, cefr: "A1", theme: { version: 1, title: "Quarterly budget review", brief: "Prepare a quarterly budget review.", context: "Finance meeting", communicationGoal: "Explain a cost." },
    coreTerms: Array.from({ length: count }, (_, index) => ({ id: `term-${index}`, word: `term-${index}`, meaning: "nghĩa", type: "noun", ipa: "/tɜːm/" })),
    supportTerms: [], grammarTopics: Array.from({ length: 4 }, (_, index) => ({ id: `g-${index}`, title: `Grammar ${index}`, steps: [{ id: `g-${index}-s`, focus: "focus", formula: "S + V", usage: "usage", examples: ["Example."] }] })),
    sounds: Array.from({ length: 4 }, (_, index) => ({ id: `s-${index}`, ipa: "/t/", label: "T", examples: Array.from({ length: 15 }, (_, example) => ({ id: `s-${index}-${example}`, word: `sound-${index}-${example}`, ipa: "/t/" })) }))
  });
}
