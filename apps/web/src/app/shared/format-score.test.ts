import { describe, expect, it } from "vitest";
import { formatPercent, formatScore, formatScoreForExport, formatScoreOutOf, roundScore } from "./format-score.js";

describe("formatScore", () => {
  it("rounds to at most two decimals with a decimal comma", () => {
    expect(formatScore(16.176470588235297)).toBe("16,18");
    expect(formatScore(4.411764705882353)).toBe("4,41");
    expect(formatScore(2.9411764705882355)).toBe("2,94");
    expect(formatScore(18.77)).toBe("18,77");
    expect(formatScore(7.35)).toBe("7,35");
  });

  it("drops trailing zeros and keeps integers plain", () => {
    expect(formatScore(25)).toBe("25");
    expect(formatScore(4.4)).toBe("4,4");
    expect(formatScore(4.40000001)).toBe("4,4");
    expect(formatScore(19.999)).toBe("20");
    expect(formatScore(0)).toBe("0");
    expect(formatScore(100)).toBe("100");
  });

  it("rounds half away from zero without binary drift", () => {
    expect(roundScore(1.005)).toBe(1.01);
    expect(roundScore(2.675)).toBe(2.68);
    expect(formatScore(-2.675)).toBe("-2,68");
    expect(formatScore(-0.001)).toBe("0");
  });

  it("handles negatives, null, undefined, NaN and numeric strings", () => {
    expect(formatScore(-3.5)).toBe("-3,5");
    expect(formatScore(null)).toBe("—");
    expect(formatScore(undefined)).toBe("—");
    expect(formatScore(Number.NaN)).toBe("—");
    expect(formatScore(null, "Chờ chấm")).toBe("Chờ chấm");
    expect(formatScore("12.345")).toBe("12,35");
    expect(formatScore("")).toBe("—");
    expect(formatScore("chờ chấm")).toBe("chờ chấm");
  });
});

describe("formatScoreOutOf / formatPercent / formatScoreForExport", () => {
  it("formats both sides of a fraction", () => {
    expect(formatScoreOutOf(4.411764705882353, 16.176470588235297)).toBe("4,41/16,18");
    expect(formatScoreOutOf(18.77, 100)).toBe("18,77/100");
    expect(formatScoreOutOf(25, 25)).toBe("25/25");
    expect(formatScoreOutOf(null, 20)).toBe("—/20");
  });

  it("formats percentages", () => {
    expect(formatPercent(66.66666)).toBe("66,67%");
    expect(formatPercent(70)).toBe("70%");
    expect(formatPercent(null)).toBe("—");
  });

  it("keeps a machine-friendly dot for exports", () => {
    expect(formatScoreForExport(18.766666)).toBe("18.77");
    expect(formatScoreForExport(25)).toBe("25");
    expect(formatScoreForExport(null)).toBe("");
  });
});
