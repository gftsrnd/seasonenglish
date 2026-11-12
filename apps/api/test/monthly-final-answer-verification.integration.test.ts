import { randomUUID } from "node:crypto";
import { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createCredentialHash } from "@e4s/domain";
import { DEMO_IDS, migrateDatabase, resetPublicSchema, seedDemo } from "@e4s/database";
import type { AiTaskRunner } from "@e4s/ai";
import { buildApi } from "../src/app.js";
import { assembleMonthlyFinalFromAi, buildMonthlyFinalGenerationInput } from "../src/modules/assessment/monthly-final-builder.js";
import { fakeMonthlyFinalAiOutput, frameworkRef, monthlyFinalContract } from "./support/monthly-final-fixture.js";

/**
 * December 2026 re-run §12.5: the published A1 final had R04 with two correct
 * answers. The generation route now runs one independent answer check per
 * form; a disputed Reading item gets one targeted repair and one re-check, and
 * anything left fails the generation without touching the current draft.
 */
describe.skipIf(!process.env.TEST_DATABASE_URL)("monthly final independent answer check", () => {
  const pool = new Pool({ connectionString: process.env.TEST_DATABASE_URL });
  const contract = monthlyFinalContract("B1");
  const input = buildMonthlyFinalGenerationInput(contract, frameworkRef);
  const ai = fakeMonthlyFinalAiOutput(input);
  const good = assembleMonthlyFinalFromAi(contract, frameworkRef, ai.receptive, ai.productive);
  const firstReading = good.sections.find((section) => section.code === "reading")!.groups[0]!.tasks[0]!;
  // Objective items: the key's label; W / SB: the first option ("OK: ...").
  const keyByRef = new Map(good.sections.flatMap((section) => section.groups.flatMap((group) => group.tasks)).map((task) => [task.key, task.options?.find((option) => option.value === task.correctAnswer)?.label] as const));
  const oldVersion = randomUUID();
  const definitionId = randomUUID();
  const calls: Array<{ taskId: string; repair: boolean; refs?: string[] }> = [];
  let cookie = "";
  const metadata = (taskId: string) => ({ provider: "test", mode: "test", model: "fixture", traceId: randomUUID(), inputHash: "fixture", taskId, schemaValid: true, attempts: 1, latencyMs: 1, usage: {} });
  const runner = { runTask: async (taskId: string, raw: any, options?: { messages?: unknown[] }) => {
    if (taskId === "monthly_final_grammar_evidence_review") return { output: { items: raw.items.map((item: any) => ({ key: item.key, matches: true, reason: "Matches selected component." })) }, metadata: metadata(taskId) };
    calls.push({ taskId, repair: Boolean(options?.messages?.length), ...(taskId === "monthly_answer_verification" ? { refs: raw.items.map((item: any) => item.ref) } : {}) });
    if (taskId === "monthly_answer_verification") {
      // The checker always accepts a second option for the first Reading item, so the repair does not resolve it.
      return { output: { items: raw.items.map((item: any) => ({ ref: item.ref, correctOptions: item.ref === firstReading.key ? item.options.slice(0, 2) : [keyByRef.get(item.ref) ?? item.options[0]], note: "checked" })) }, metadata: metadata(taskId) };
    }
    return { output: taskId === "monthly_final_listening_message_generation" ? ai.receptive.listening.messages.find((message) => message.label === raw.messageLabel) : taskId.includes("reading") ? { reading: ai.receptive.reading } : ai.productive, metadata: metadata(taskId) };
  } } as unknown as AiTaskRunner;
  const app = buildApi({ pool, secureCookies: false, aiRunner: runner });

  beforeAll(async () => {
    const client = await pool.connect();
    try {
      await resetPublicSchema(client);
      await migrateDatabase(client);
      await seedDemo(client);
      await client.query("insert into user_credentials(user_id,credential_hash) values($1,$2)", [DEMO_IDS.operator, await createCredentialHash("operator-pass")]);
      await client.query("update organization_settings set configuration=configuration || '{\"simulatedSystemDate\":\"2026-11-06\"}'::jsonb where organization_id=$1", [DEMO_IDS.organization]);
      const monthId = randomUUID();
      await client.query("insert into program_months(id,organization_id,month,exam_date,lesson_count,brief_status) values($1,$2,'2026-11','2026-11-30',21,'approved')", [monthId, DEMO_IDS.organization]);
      await client.query("insert into month_frameworks(id,program_month_id,cefr,status,version,curriculum_contract,scope_hash,created_by) values($1,$2,'B1','approved',$3,$4::jsonb,$5,$6)", [frameworkRef.id, monthId, frameworkRef.version, JSON.stringify(contract), frameworkRef.scopeHash, DEMO_IDS.operator]);
      await client.query("insert into assessment_definitions(id,organization_id,assessment_key,kind,title) values($1,$2,$3,'final',$4)", [definitionId, DEMO_IDS.organization, good.key, good.title]);
      await client.query("insert into assessment_versions(id,definition_id,version,status,blueprint) values($1,$2,1,'draft',$3::jsonb)", [oldVersion, definitionId, JSON.stringify(good)]);
    } finally { client.release(); }
    await app.ready();
    const login = await app.inject({ method: "POST", url: "/api/auth/staff/login", payload: { email: "thu.ha.tran@e4s.local", password: "operator-pass" } });
    expect(login.statusCode, login.body).toBe(200);
    cookie = String(login.headers["set-cookie"]).split(";")[0] ?? "";
  }, 30_000);
  afterAll(async () => { await app.close(); await pool.end(); });

  it("checks the form once, repairs the disputed Reading item once, re-checks only it, then fails GEN05 keeping the draft", async () => {
    const response = await app.inject({ method: "POST", url: `/api/v1/month-frameworks/${frameworkRef.id}/monthly-final`, headers: { cookie } });
    expect(response.statusCode, response.body).toBe(422);
    expect(response.json()).toMatchObject({ code: "MONTHLY_FINAL_GENERATION_QUALITY_FAILED", report: { checks: [expect.objectContaining({ code: "GEN05", status: "fail", detail: expect.stringContaining(`${firstReading.key}: `) })] } });
    const verification = calls.filter((call) => call.taskId === "monthly_answer_verification");
    expect(verification).toHaveLength(2);
    expect(verification[0]!.refs).toEqual(expect.arrayContaining([firstReading.key, "W", "SB"]));
    expect(verification[1]!.refs).toEqual([firstReading.key]);
    expect(calls.filter((call) => call.taskId === "monthly_final_reading_generation" && call.repair)).toHaveLength(1);
    const versions = await pool.query("select id,status,blueprint from assessment_versions where definition_id=$1", [definitionId]);
    expect(versions.rows).toEqual([{ id: oldVersion, status: "draft", blueprint: good }]);
    const failed = await pool.query("select status,error_code from ai_runs where request_key like 'monthly-final:%'");
    expect(failed.rows).toEqual([{ status: "failed", error_code: "MONTHLY_FINAL_GENERATION_QUALITY_FAILED" }]);
  });
});
