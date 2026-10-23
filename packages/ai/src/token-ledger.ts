import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";

export interface AiTokenLedgerEntry {
  suite: string;
  caseId: string;
  provider: string;
  model: string;
  promptVersion: number | string;
  inputTokens: number;
  outputTokens: number;
  latencyMs: number;
  result: string;
}

export class AiTokenLedger {
  private readonly entries: Array<AiTokenLedgerEntry & { totalTokens: number }> = [];
  private inputTokens = 0;
  private outputTokens = 0;
  private writeChain: Promise<void> = Promise.resolve();

  constructor(private readonly options: {
    directory?: string;
    hardLimit?: number;
    schedulingCutoff?: number;
  } = {}) {}

  assertCanSchedule(declaredMaximumTokens: number): void {
    if (!Number.isFinite(declaredMaximumTokens) || declaredMaximumTokens <= 0) throw new RangeError("AI_TOKEN_DECLARATION_INVALID");
    const total = this.inputTokens + this.outputTokens;
    const hardLimit = this.options.hardLimit ?? 1_000_000;
    const cutoff = this.options.schedulingCutoff ?? 950_000;
    if (total + declaredMaximumTokens > hardLimit) throw new Error("AI_TOKEN_BUDGET_EXCEEDED");
    if (total >= cutoff) throw new Error("AI_TOKEN_SCHEDULING_CLOSED");
  }

  async record(entry: AiTokenLedgerEntry): Promise<void> {
    for (const value of [entry.inputTokens, entry.outputTokens, entry.latencyMs]) {
      if (!Number.isFinite(value) || value < 0) throw new RangeError("AI_TOKEN_LEDGER_VALUE_INVALID");
    }
    const recorded = { ...entry, totalTokens: entry.inputTokens + entry.outputTokens };
    this.entries.push(recorded);
    this.inputTokens += entry.inputTokens;
    this.outputTokens += entry.outputTokens;
    if (!this.options.directory) return;
    this.writeChain = this.writeChain.then(() => this.persist());
    await this.writeChain;
  }

  snapshot() {
    const totalTokens = this.inputTokens + this.outputTokens;
    const hardLimit = this.options.hardLimit ?? 1_000_000;
    return {
      inputTokens: this.inputTokens,
      outputTokens: this.outputTokens,
      totalTokens,
      remainingTokens: Math.max(0, hardLimit - totalTokens),
      entries: this.entries.map((entry) => ({ ...entry }))
    };
  }

  private async persist(): Promise<void> {
    const directory = this.options.directory;
    if (!directory) return;
    await mkdir(directory, { recursive: true });
    const snapshot = this.snapshot();
    await writeFile(join(directory, "ai-token-ledger.json"), `${JSON.stringify(snapshot, null, 2)}\n`, "utf8");
    const header = "suite,caseId,provider,model,promptVersion,inputTokens,outputTokens,totalTokens,latencyMs,result";
    const rows = snapshot.entries.map((entry) => [
      entry.suite, entry.caseId, entry.provider, entry.model, entry.promptVersion,
      entry.inputTokens, entry.outputTokens, entry.totalTokens, entry.latencyMs, entry.result
    ].map(csvCell).join(","));
    await writeFile(join(directory, "ai-token-ledger.csv"), `${[header, ...rows].join("\n")}\n`, "utf8");
  }
}

function csvCell(value: string | number): string {
  const text = String(value);
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}
