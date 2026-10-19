import { describe, expect, it } from "vitest";
import { autoSeasonTheme, seasonVisual } from "./season-visual.js";

describe("season visual metadata", () => {
  it.each([
    ["2026-03-15", "spring"], ["2026-06-15", "summer"], ["2026-09-01", "autumn"],
    ["2026-11-15", "winter"], ["2026-02-17", "tet"], ["2026-09-25", "midautumn"], ["2026-12-24", "christmas"]
  ])("selects %s as %s", (iso, expected) => {
    expect(autoSeasonTheme(new Date(`${iso}T12:00:00`))).toBe(expected);
  });

  it("returns verified product-art ids without presentation markup", () => {
    expect(seasonVisual("spring")).toMatchObject({ heroArt: "hero-rabbit", food: { art: "food-rabbit" }, catchItem: { art: "catch-spring" } });
  });
});
