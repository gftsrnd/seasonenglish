import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import { PLACEMENT_RETAKE_LIMIT, placementRetakeGrantRefusal, placementRetakeStatus } from "../src/placement-retake.js";

describe("placement retake rule (one retake per learner)", () => {
  it("grants once after a placement result and refuses a second grant", () => {
    expect(PLACEMENT_RETAKE_LIMIT).toBe(1);
    expect(placementRetakeGrantRefusal({ grantCount: 0, latestPlacementStatus: "needs_retry", publishedRetakeForm: true })).toBeNull();
    expect(placementRetakeGrantRefusal({ grantCount: 0, latestPlacementStatus: "approved", publishedRetakeForm: true })).toBeNull();
    expect(placementRetakeGrantRefusal({ grantCount: 1, latestPlacementStatus: "needs_retry", publishedRetakeForm: true })).toBe("PLACEMENT_RETAKE_ALREADY_GRANTED");
  });

  it("needs a decided placement and a published retake form", () => {
    for (const status of [null, "in_progress", "submitted", "pending_review"]) {
      expect(placementRetakeGrantRefusal({ grantCount: 0, latestPlacementStatus: status, publishedRetakeForm: true })).toBe("PLACEMENT_RETAKE_NOT_AVAILABLE");
    }
    expect(placementRetakeGrantRefusal({ grantCount: 0, latestPlacementStatus: "needs_retry", publishedRetakeForm: false })).toBe("PLACEMENT_RETAKE_FORM_NOT_PUBLISHED");
  });

  it("reports not granted / granted / used", () => {
    expect(placementRetakeStatus(null)).toBe("not_granted");
    expect(placementRetakeStatus({ usedAt: null, retakeAttemptId: null })).toBe("granted");
    expect(placementRetakeStatus({ usedAt: new Date(), retakeAttemptId: "attempt" })).toBe("used");
  });

  it("enforces the single retake durably and notifies the learner's bell", async () => {
    const sql = await readFile(new URL("../migrations/0124_assessment_retake_grants.sql", import.meta.url), "utf8");
    expect(sql).toMatch(/constraint assessment_retake_grants_once unique \(learner_id, kind\)/);
    expect(sql).toMatch(/notify_inbox\(new\.organization_id, 'learner', new\.learner_id,\s*'retake:' \|\| new\.id \|\| ':granted', 'retake_granted'/);
  });
});
