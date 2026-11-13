import { describe, expect, it } from "vitest";
import { compactPoints } from "./Home.js";

describe("compactPoints keeps the points ring to at most 5 characters", () => {
  it.each([
    [0, "0"], [60, "60"], [999, "999"], [1250, "1.250"], [9999, "9.999"],
    [12345, "12,3k"], [99999, "99,9k"], [250000, "250k"], [1234567, "1,2tr"], [-5, "0"]
  ])("%i → %s", (points, expected) => {
    const shown = compactPoints(points);
    expect(shown).toBe(expected);
    expect(shown.length).toBeLessThanOrEqual(5);
  });
});
