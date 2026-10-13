import { describe, expect, it } from "vitest";
import { DEMO_IDS } from "../src/seed.js";

describe("shared deterministic test seed", () => {
  it("exports stable identities for API and browser tests", () => {
    expect(DEMO_IDS).toMatchObject({
      learner: "00000000-0000-4000-8000-000000000101",
      operator: "00000000-0000-4000-8000-000000000102",
      manager: "00000000-0000-4000-8000-000000000103"
    });
  });
});
