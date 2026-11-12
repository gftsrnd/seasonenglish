/**
 * DEV-STACK TRIAL ONLY (the 4300 stack, project e4s-dev).
 *
 * Re-runs ONLY the L-042 slang / poetic phase (one batched generation + one
 * batched audit, under MONTHLY_RESOURCE_AI_CALL_LIMIT) for one month level and
 * writes a JSON report. Approved monthly pools are immutable by domain rule
 * (MONTHLY_FRAMEWORK_IMMUTABLE; changes go through a Manager reopen), so the
 * product route POST /month-frameworks/:id/resources/register-terms/regenerate
 * only accepts drafts. For trials on an APPROVED pool of the dev stack this
 * script can, with --apply, replace coreTerms[].registerTerms in place — and
 * nothing else: every other core field, the supports, grammar, sounds, day
 * specs, version and scope hash stay as they are (so lesson slots stay joined).
 * Already-generated lessons keep the lexical details they were generated with.
 *
 * Usage (inside the e4s-dev api container):
 *   E4S_REGISTER_TRIAL=dev-4300 node dist/src/scripts/monthly-register-trial.js --month 2026-12 --cefr B1 [--apply] [--out /tmp/report.json]
 */
import { writeFile } from "node:fs/promises";
import { AI_TASKS, createAiService, createAnthropicProvider } from "@e4s/ai";
import { monthlyRegisterTermsApply } from "@e4s/domain";
import { randomUUID } from "node:crypto";
import { Pool } from "pg";
import { createOrganizationAiRunnerFactory, normalizeAiMaxAttempts } from "../modules/ai/runtime.js";
import { budgetedMonthlyRegisterRunner, regenerateMonthlyRegisterTerms } from "../modules/content/monthly-register-phase.js";

type Core = { id: string; word: string; meaning: string; type: string; ipa?: string; registerTerms?: Array<Record<string, unknown>> };
type Support = { word: string; relatedCoreTermId?: string };

function arg(name: string): string | undefined {
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

async function main(): Promise<void> {
  if (process.env.E4S_REGISTER_TRIAL !== "dev-4300") throw new Error("Refusing to run: this trial script is for the 4300 dev stack only (set E4S_REGISTER_TRIAL=dev-4300 explicitly).");
  const month = arg("month");
  const cefr = arg("cefr");
  const apply = process.argv.includes("--apply");
  const out = arg("out") ?? `/tmp/register-trial-${month}-${cefr}.json`;
  if (!month || !/^\d{4}-(0[1-9]|1[0-2])$/u.test(month) || !cefr || !monthlyRegisterTermsApply(cefr)) throw new Error("Usage: --month YYYY-MM --cefr B1|B2|C1 [--apply] [--out file]");
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is required");
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  try {
    const rows = await pool.query<{ id: string; status: string; version: number; scope_hash: string; organization_id: string; created_by: string | null; approved_by: string | null; curriculum_contract: { theme: { title: string }; coreTerms: Core[]; supportTerms: Support[] } }>(
      `select mf.id, mf.status, mf.version, mf.scope_hash, pm.organization_id, mf.created_by, mf.approved_by, mf.curriculum_contract
       from month_frameworks mf join program_months pm on pm.id = mf.program_month_id
       where pm.month = $1 and mf.cefr = $2 and mf.status <> 'retired'`, [month, cefr]
    );
    if (rows.rows.length !== 1) throw new Error(`Expected exactly one non-retired ${cefr} framework for ${month}, found ${rows.rows.length}`);
    const row = rows.rows[0]!;
    const actorId = row.approved_by ?? row.created_by;
    if (!actorId) throw new Error("Framework has no operator actor to run AI as");
    const fallback = process.env.AI_PROVIDER === "anthropic" && process.env.ANTHROPIC_API_KEY
      ? createAiService({
        registry: AI_TASKS,
        provider: createAnthropicProvider({ apiKey: process.env.ANTHROPIC_API_KEY, ...(process.env.ANTHROPIC_MODEL ? { model: process.env.ANTHROPIC_MODEL } : {}) }),
        timeoutMs: Number(process.env.AI_TIMEOUT_MS ?? 60_000) || 60_000,
        maxAttempts: normalizeAiMaxAttempts(process.env.AI_MAX_ATTEMPTS),
        loadPrompt: async () => ""
      })
      : undefined;
    const baseRunner = await createOrganizationAiRunnerFactory(pool, fallback, { maxAttempts: normalizeAiMaxAttempts(process.env.AI_MAX_ATTEMPTS) })(actorId);
    if (!baseRunner) throw new Error("AI is unavailable for this organization");
    const contract = row.curriculum_contract;
    const before = contract.coreTerms.flatMap((core) => (core.registerTerms ?? []).map((term) => ({ core: core.word, ...term })));
    const { runner, usage } = budgetedMonthlyRegisterRunner(baseRunner);
    const startedAt = Date.now();
    const { coreTerms, phase } = await regenerateMonthlyRegisterTerms({ runner, cefr, theme: contract.theme.title, coreTerms: contract.coreTerms, supportTerms: contract.supportTerms });
    const after = coreTerms.flatMap((core) => (core.registerTerms ?? []).map((term) => ({ core: core.word, coreType: core.type, ...term })));
    let applied = false;
    if (apply && !phase.failed) {
      if (row.status !== "approved") throw new Error("Draft pools use the Operator route POST /api/v1/content/month-frameworks/:id/resources/register-terms/regenerate");
      const strip = (cores: readonly Core[]) => JSON.stringify(cores.map(({ registerTerms: _ignored, ...rest }) => rest));
      if (strip(coreTerms) !== strip(contract.coreTerms)) throw new Error("Refusing to apply: a core field other than registerTerms would change");
      const client = await pool.connect();
      try {
        await client.query("begin");
        const locked = await client.query<{ version: number; scope_hash: string }>("select version, scope_hash from month_frameworks where id = $1 for update", [row.id]);
        if (locked.rows[0]?.version !== row.version || locked.rows[0]?.scope_hash !== row.scope_hash) throw new Error("Framework changed during the trial; nothing applied");
        await client.query("update month_frameworks set curriculum_contract = jsonb_set(curriculum_contract, '{coreTerms}', $2::jsonb), updated_at = now() where id = $1", [row.id, JSON.stringify(coreTerms)]);
        await client.query(
          `insert into audit_events (id, organization_id, action, entity_type, entity_id, payload, trace_id)
           values ($1, $2, 'monthly.register_terms_trial_replaced', 'monthly_framework', $3, $4::jsonb, $5)`,
          [randomUUID(), row.organization_id, row.id, JSON.stringify({ month, cefr, before: before.length, after: after.length, calls: usage.calls, stack: "dev-4300" }), randomUUID()]
        );
        await client.query("commit");
        applied = true;
      } catch (error) {
        await client.query("rollback");
        throw error;
      } finally {
        client.release();
      }
    }
    const report = { month, cefr, frameworkId: row.id, status: row.status, cores: contract.coreTerms.length, applied, failed: phase.failed ?? null, usage, elapsedMs: Date.now() - startedAt, generated: phase.generated, accepted: phase.items.length, rejected: phase.rejected, before, after };
    await writeFile(out, JSON.stringify(report, null, 2));
    process.stdout.write(`${JSON.stringify({ out, applied, failed: report.failed, usage, generated: report.generated, accepted: report.accepted, before: before.length, after: after.length })}\n`);
  } finally {
    await pool.end();
  }
}

main().catch((error: unknown) => {
  process.stderr.write(`[monthly-register-trial] ${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
});
