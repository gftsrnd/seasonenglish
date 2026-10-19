// @vitest-environment node
// @ts-expect-error Vitest executes this test in Node; the web project intentionally omits Node ambient types.
import { existsSync, readFileSync } from "node:fs";
// @ts-expect-error Vitest executes this test in Node; the web project intentionally omits Node ambient types.
import { createHash } from "node:crypto";
// @ts-expect-error Vitest executes this test in Node; the web project intentionally omits Node ambient types.
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

declare const process: { cwd(): string };

type LedgerStatus =
  | "complete"
  | "missing_contract"
  | "missing_api"
  | "missing_ui"
  | "missing_evidence"
  | "approved_exception";

type LedgerRecord = {
  id: string;
  route: string;
  role: "Shared" | "Learner" | "Operator" | "Manager";
  condition: string;
  sourceAnchor: string;
  contract: string;
  api: string;
  ui: string;
  automatedProof: string;
  browserEvidence: string;
  blocker: boolean;
  owner: string;
  status: LedgerStatus;
};

type ParityLedger = {
  generatedFrom: string;
  sourceSha256: string;
  records: LedgerRecord[];
  summary: {
    total: number;
    blocked: number;
    inScope: number;
    approvedExceptions: number;
    implementationComplete: number;
    implementationIncomplete: number;
    missingContract: number;
    missingApi: number;
    missingUi: number;
    missingEvidence: number;
    complete: number;
  };
};

const allowedStatuses = new Set<LedgerStatus>([
  "complete",
  "missing_contract",
  "missing_api",
  "missing_ui",
  "missing_evidence",
  "approved_exception"
]);

function workspacePath(...segments: string[]) {
  const cwd = process.cwd().replaceAll("\\", "/");
  const root = cwd.endsWith("/apps/web") ? resolve(cwd, "../..") : cwd;
  return resolve(root, ...segments);
}

describe("executable app parity ledger", () => {
  it("exists and gives every app state a unique, reviewable classification", () => {
    const ledgerPath = workspacePath("docs", "app-parity", "parity-ledger.json");
    expect(existsSync(ledgerPath), "parity-ledger.json must be generated from the route-state matrix").toBe(true);

    const ledger = JSON.parse(readFileSync(ledgerPath, "utf8")) as ParityLedger;
    expect(ledger.generatedFrom).toBe("docs/app-parity/route-state-matrix.md");
    const matrix = readFileSync(workspacePath("docs", "app-parity", "route-state-matrix.md"));
    expect(ledger.sourceSha256, "ledger is stale; run pnpm parity:ledger").toBe(
      createHash("sha256").update(matrix).digest("hex")
    );
    expect(ledger.records.length).toBeGreaterThan(100);

    const ids = ledger.records.map((record) => record.id);
    expect(new Set(ids).size, "state IDs must be unique").toBe(ids.length);

    for (const record of ledger.records) {
      expect(record.id).not.toBe("");
      expect(record.route).not.toBe("");
      expect(record.condition).not.toBe("");
      expect(record.sourceAnchor).toMatch(/^research\/seasonenglish\/core\.js#/);
      expect(record.owner).not.toBe("");
      expect(allowedStatuses.has(record.status)).toBe(true);
      expect(typeof record.blocker).toBe("boolean");
      expect(record.contract).not.toBe("");
      expect(record.api).not.toBe("");
      expect(record.ui).not.toBe("");
      expect(record.automatedProof).not.toBe("");
      expect(record.browserEvidence).not.toBe("");
    }

    const count = (status: LedgerStatus) => ledger.records.filter((record) => record.status === status).length;
    expect(ledger.summary).toEqual({
      total: ledger.records.length,
      blocked: ledger.records.filter((record) => record.blocker).length,
      inScope: ledger.records.filter((record) => record.status !== "approved_exception").length,
      approvedExceptions: ledger.records.filter((record) => record.status === "approved_exception").length,
      implementationComplete: ledger.records.filter((record) => record.status === "missing_evidence" || record.status === "complete").length,
      implementationIncomplete: ledger.records.filter((record) => ["missing_contract", "missing_api", "missing_ui"].includes(record.status)).length,
      missingContract: count("missing_contract"),
      missingApi: count("missing_api"),
      missingUi: count("missing_ui"),
      missingEvidence: count("missing_evidence"),
      complete: count("complete")
    });

    expect(ledger.records.find((record) => record.id === "modal.operator-change-level")?.role).toBe("Operator");
    expect(ledger.records.find((record) => record.id === "modal.test-auto-countdown")?.role).toBe("Learner");
    expect(ledger.records.find((record) => record.id === "modal.vocab-family")?.role).toBe("Learner");
    expect(ledger.records.find((record) => record.id === "root.role-choice")?.condition).toBe(
      "root.role-choice: users exist and entryRole is null."
    );
  });
});
