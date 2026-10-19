import { describe, expect, it } from "vitest";
import { shouldRedirectApprovedPlacement, shouldRedirectUnavailableChallenge } from "./LearnerRouteController.js";

describe("learner route guards", () => {
  it("returns an already-approved placement to Home", () => {
    expect(shouldRedirectApprovedPlacement("placement", "approved")).toBe(true);
    expect(shouldRedirectApprovedPlacement("placement", "in_progress")).toBe(false);
    expect(shouldRedirectApprovedPlacement("final", "approved")).toBe(false);
  });

  it("recognizes only the real no-challenge state as a Home redirect", () => {
    expect(shouldRedirectUnavailableChallenge("challenge", new Error("LEVEL_CHALLENGE_NOT_AVAILABLE"))).toBe(true);
    expect(shouldRedirectUnavailableChallenge("challenge", new Error("HTTP_500"))).toBe(false);
    expect(shouldRedirectUnavailableChallenge("coach", new Error("LEVEL_CHALLENGE_NOT_AVAILABLE"))).toBe(false);
  });
});
