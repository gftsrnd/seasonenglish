import { describe, expect, it } from "vitest";
import { coachPersonaPrompt } from "../src/modules/coach/routes.js";

describe("Season coach conduct rule", () => {
  it("tells Season to handle abusive messages politely without a hard block", () => {
    for (const persona of ["formal", "informal"] as const) {
      const prompt = coachPersonaPrompt("Base coach prompt", persona, "A2");
      expect(prompt).toContain("RESPECTFUL CONDUCT");
      expect(prompt).toContain("Do not repeat, translate, correct or praise the offensive words");
      expect(prompt).toContain("self-harm");
    }
  });
});
