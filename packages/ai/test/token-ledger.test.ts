import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { AiTokenLedger } from "../src/token-ledger.js";

const cleanup: string[] = [];
afterEach(async () => Promise.all(cleanup.splice(0).map((path) => rm(path, { recursive: true, force: true }))));

describe("real-AI token ledger", () => {
  it("counts input and output tokens and persists inspectable JSON and CSV", async () => {
    const directory = await mkdtemp(join(tmpdir(), "e4s-ai-ledger-"));
    cleanup.push(directory);
    const ledger = new AiTokenLedger({ directory, hardLimit: 1_000_000, schedulingCutoff: 950_000 });
    ledger.assertCanSchedule(10_000);
    await ledger.record({ suite: "objectives-gold", caseId: "A006-T01", provider: "anthropic", model: "fixture", promptVersion: 7, inputTokens: 120, outputTokens: 80, latencyMs: 15, result: "pass" });

    expect(ledger.snapshot()).toMatchObject({ inputTokens: 120, outputTokens: 80, totalTokens: 200, remainingTokens: 999_800 });
    expect(JSON.parse(await readFile(join(directory, "ai-token-ledger.json"), "utf8"))).toMatchObject({ totalTokens: 200 });
    expect(await readFile(join(directory, "ai-token-ledger.csv"), "utf8")).toContain("A006-T01,anthropic,fixture,7,120,80,200,15,pass");
  });

  it("stops scheduling at the reserve cutoff and rejects a declared call that can exceed the hard limit", async () => {
    const ledger = new AiTokenLedger({ hardLimit: 1_000_000, schedulingCutoff: 950_000 });
    await ledger.record({ suite: "seed", caseId: "used", provider: "fixture", model: "fixture", promptVersion: 1, inputTokens: 949_900, outputTokens: 0, latencyMs: 1, result: "pass" });
    expect(() => ledger.assertCanSchedule(50_101)).toThrowError("AI_TOKEN_BUDGET_EXCEEDED");
    await ledger.record({ suite: "seed", caseId: "cutoff", provider: "fixture", model: "fixture", promptVersion: 1, inputTokens: 100, outputTokens: 0, latencyMs: 1, result: "pass" });
    expect(() => ledger.assertCanSchedule(1)).toThrowError("AI_TOKEN_SCHEDULING_CLOSED");
  });
});
