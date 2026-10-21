import { describe, expect, it } from "vitest";
import { classifyPlacementLifecycle } from "../src/modules/assessment/review-lifecycle.js";

describe("placement review lifecycle", () => {
  it("keeps pending and approved attempts out of the not-started buckets", () => {
    expect(classifyPlacementLifecycle(null)).toBe("not_started");
    expect(classifyPlacementLifecycle("in_progress")).toBe("in_progress");
    expect(classifyPlacementLifecycle("submitted")).toBe("in_progress");
    expect(classifyPlacementLifecycle("needs_retry")).toBe("needs_retry");
    expect(classifyPlacementLifecycle("pending_review")).toBe("pending_review");
    expect(classifyPlacementLifecycle("approved")).toBe("approved");
  });
});
