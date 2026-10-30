import { describe, expect, it } from "vitest";
import { generationFindingsFromPayload } from "../src/generation-findings.js";

describe("generation findings persistence", () => {
  it("reads only actionable findings from generation provenance", () => {
    expect(generationFindingsFromPayload({
      generation: {
        output: {
          findings: [
            { dayNumber: 2, component: "skills", code: "CEFR_OR_SKILL_CONSTRAINT", severity: "error", message: "B2 speaking needs two constraints.", issues: [], repairAction: "regenerate_component" },
            { dayNumber: 9, component: "unknown", code: "BAD", severity: "fatal", message: "bad", repairAction: "delete_everything" }
          ]
        }
      }
    })).toEqual([{
      dayNumber: 2,
      component: "skills",
      code: "CEFR_OR_SKILL_CONSTRAINT",
      severity: "error",
      message: "B2 speaking needs two constraints.",
      issues: [],
      repairAction: "regenerate_component"
    }]);
  });
});
