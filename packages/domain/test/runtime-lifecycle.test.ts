import { describe, expect, it } from "vitest";
import {
  effectiveSystemDate,
  isLifecycleTransitionAllowed,
  type ContentLifecycleStatus
} from "../src/runtime-lifecycle.js";

describe("shared simulated date and content lifecycle", () => {
  it("uses the Manager-selected date when available and safely falls back to the server date", () => {
    expect(effectiveSystemDate("2026-11-14", new Date("2026-11-03T12:00:00.000Z"))).toBe("2026-11-14");
    expect(effectiveSystemDate(undefined, new Date("2026-11-03T12:00:00.000Z"))).toBe("2026-11-03");
  });

  it("keeps the approved content lifecycle immutable until a Manager grants a reopen", () => {
    const approved: ContentLifecycleStatus = "approved";
    expect(isLifecycleTransitionAllowed(approved, "draft")).toBe(false);
    expect(isLifecycleTransitionAllowed(approved, "reopen_requested")).toBe(true);
    expect(isLifecycleTransitionAllowed("reopen_requested", "reopened")).toBe(true);
    expect(isLifecycleTransitionAllowed("reopened", "draft")).toBe(true);
  });
});
