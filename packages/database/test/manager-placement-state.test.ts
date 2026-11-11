import { describe, expect, it } from "vitest";
import { managerPlacementState } from "../src/repositories.js";

describe("manager placement state", () => {
  it("only reports graded placements as waiting for a level decision, like the operator queue", () => {
    expect(managerPlacementState("pending_review")).toBe("placement_pending");
    expect(managerPlacementState("submitted")).toBe("placement_submitted");
    expect(managerPlacementState("in_progress")).toBe("placement_in_progress");
    expect(managerPlacementState("needs_retry")).toBe("placement_retry");
    expect(managerPlacementState(null)).toBe("unplaced");
  });
});
