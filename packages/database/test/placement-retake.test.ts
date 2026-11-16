import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import { placementDefinition } from "../src/assessment-blueprints.js";
import {
  PLACEMENT_RETAKE_LIMIT, PLACEMENT_RETAKE_REQUEST_WINDOW_HOURS, PLACEMENT_RETAKE_STRUCTURE, placementRetakeGrantRefusal,
  placementRetakeRequestWindow, placementRetakeStatus, placementRetakeStructureIssues
} from "../src/placement-retake.js";

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

  it("keeps the 'Xin thi lại' window 72 hours after an approved placement, and open while sent back", () => {
    const decidedAt = new Date("2026-11-13T02:00:00Z");
    const until = new Date("2026-11-16T02:00:00Z");
    expect(PLACEMENT_RETAKE_REQUEST_WINDOW_HOURS).toBe(72);
    expect(placementRetakeRequestWindow({ status: "approved", decidedAt, now: new Date("2026-11-16T01:59:00Z") })).toEqual({ open: true, availableUntil: until });
    expect(placementRetakeRequestWindow({ status: "approved", decidedAt, now: new Date("2026-11-16T02:01:00Z") })).toEqual({ open: false, availableUntil: until });
    expect(placementRetakeRequestWindow({ status: "needs_retry", decidedAt, now: new Date("2026-12-30T00:00:00Z") })).toEqual({ open: true, availableUntil: null });
    for (const status of ["in_progress", "pending_review", "submitted"]) {
      expect(placementRetakeRequestWindow({ status, decidedAt, now: decidedAt }).open).toBe(false);
    }
  });

  it("requires exactly placement-a's counts and points on the retake form", () => {
    expect(placementRetakeStructureIssues(placementDefinition)).toEqual([]);
    expect(PLACEMENT_RETAKE_STRUCTURE.sections.map((section) => section.groups.map((group) => group.map((task) => task.maxScore)))).toEqual([
      [[1, 1, 1, 1], [1, 1, 1, 1, 1, 1], [2, 2, 2, 2, 2]],
      Array.from({ length: 4 }, () => Array.from({ length: 10 }, () => 1)),
      [[7], [13]],
      [[5], [5], [5], [5]]
    ]);
    const listening = placementDefinition.sections[0]!;
    const twentyItems = { ...placementDefinition, sections: [{ ...listening, groups: [...listening.groups, { ...listening.groups[0]!, key: "LD" }] }, ...placementDefinition.sections.slice(1)] };
    expect(placementRetakeStructureIssues(twentyItems)).toEqual(["Phần Nghe phải có 3 nhóm với 4 + 6 + 5 câu (hiện có 4 + 6 + 5 + 4)."]);
    const rescored = { ...placementDefinition, sections: placementDefinition.sections.map((section) => section.code !== "writing" ? section : {
      ...section, groups: section.groups.map((group) => ({ ...group, tasks: group.tasks.map((task) => ({ ...task, maxScore: 10 })) }))
    }) };
    expect(placementRetakeStructureIssues(rescored)).toEqual([
      "Phần Viết, nhóm 1, câu 1: phải là 7 điểm, 50–80 từ như đề đầu vào gốc.",
      "Phần Viết, nhóm 2, câu 1: phải là 13 điểm, 120–150 từ như đề đầu vào gốc."
    ]);
  });

  it("stores 'Xin thi lại' on the appeal plumbing with its own bell context", async () => {
    const sql = await readFile(new URL("../migrations/0125_placement_retake_requests.sql", import.meta.url), "utf8");
    expect(sql).toMatch(/add column if not exists request_kind text not null default 'appeal'/);
    expect(sql).toMatch(/context := 'retake'/);
  });

  it("enforces the single retake durably and notifies the learner's bell", async () => {
    const sql = await readFile(new URL("../migrations/0124_assessment_retake_grants.sql", import.meta.url), "utf8");
    expect(sql).toMatch(/constraint assessment_retake_grants_once unique \(learner_id, kind\)/);
    expect(sql).toMatch(/notify_inbox\(new\.organization_id, 'learner', new\.learner_id,\s*'retake:' \|\| new\.id \|\| ':granted', 'retake_granted'/);
  });
});
