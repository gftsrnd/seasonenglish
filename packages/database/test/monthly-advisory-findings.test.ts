import { describe, expect, it } from "vitest";
import { monthlyDayApprovalDecision } from "../src/monthly-content-repository.js";

const finding = (code: string, component: string) => ({ severity: "light" as const, code, message: code, dayNumber: 4, component });
const advisory = finding("MONTHLY_GRAMMAR_FORMULA_EXAMPLE_MISMATCH", "grammar");
const day = (light: unknown[], acknowledged: string[] = []) => ({
  lesson_id: "lesson", status: "draft" as const,
  quality_report: { severe: [], light, contractVersion: 1 } as never,
  quality_acknowledgement: acknowledged.length ? { actorId: "op", acknowledgedAt: "", findingCodes: acknowledged } : null
});

describe("advisory light findings (grammar formula vs examples)", () => {
  it("never block approval and need no acknowledgement", () => {
    expect(monthlyDayApprovalDecision(day([advisory]), false)).toEqual({ ok: true, override: null });
  });

  it("do not count toward the two-light-finding limit", () => {
    const counted = [finding("MONTHLY_SYNONYM_OR_ANTONYM_MISSING", "vocabulary"), finding("MONTHLY_REVIEW_VARIANT_MISSING", "listening")];
    const keys = ["MONTHLY_SYNONYM_OR_ANTONYM_MISSING:4:vocabulary", "MONTHLY_REVIEW_VARIANT_MISSING:4:listening"];
    expect(monthlyDayApprovalDecision(day([...counted, advisory], keys), false)).toEqual({ ok: true, override: null });
    expect(monthlyDayApprovalDecision(day([...counted, finding("MONTHLY_OTHER", "reading"), advisory], [...keys, "MONTHLY_OTHER:4:reading"]), false)).toMatchObject({ ok: false, code: "MONTHLY_DAY_QUALITY_BLOCKED" });
    expect(monthlyDayApprovalDecision(day([...counted, advisory]), false)).toMatchObject({ ok: false, code: "MONTHLY_DAY_QUALITY_ACK_REQUIRED" });
  });
});
