import { describe, expect, it } from "vitest";
import { resolveBackgroundMusic, studyPeriodFor } from "./music-selection.js";

const automatic = { enabled: true, playlistId: "auto", customUrl: "", volume: 22 };

describe("automatic study music selection", () => {
  it.each([
    ["2026-10-22T11:59:59", "morning"],
    ["2026-10-22T12:00:00", "afternoon"],
    ["2026-10-22T17:59:59", "afternoon"],
    ["2026-10-22T18:00:00", "evening"]
  ] as const)("maps %s to %s", (iso, expected) => {
    expect(studyPeriodFor(new Date(iso))).toBe(expected);
  });

  it("uses the prototype playlist for every season and study period", () => {
    const result = resolveBackgroundMusic({ theme: "autumn", date: new Date("2026-10-22T12:00:00"), config: automatic, personalEnabled: true, suspended: false });
    expect(result).toMatchObject({ enabled: true, presetId: "prototype-in-dreamland", volume: 0.22, source: "preset" });
    expect(result.enabled && result.url).toContain("PLQwRmTwWx0uaoRXVcKbUDW0wm8G_WJzDI");
  });

  it("honours a named preset and a custom URL override", () => {
    expect(resolveBackgroundMusic({ theme: "winter", date: new Date("2026-10-22T08:00:00"), config: { ...automatic, playlistId: "prototype-in-dreamland" }, personalEnabled: true, suspended: false })).toMatchObject({ presetId: "prototype-in-dreamland", source: "preset" });
    expect(resolveBackgroundMusic({ theme: "winter", date: new Date("2026-10-22T08:00:00"), config: { ...automatic, customUrl: "https://example.test/custom.mp3" }, personalEnabled: true, suspended: false })).toMatchObject({ url: "https://example.test/custom.mp3", source: "custom" });
  });

  it.each([
    [false, true, false, "personal-off"],
    [true, false, false, "organisation-off"],
    [true, true, true, "suspended"]
  ] as const)("does not play when personal=%s organisation=%s suspended=%s", (personalEnabled, organisationEnabled, suspended, reason) => {
    expect(resolveBackgroundMusic({ theme: "spring", date: new Date("2026-10-22T08:00:00"), config: { ...automatic, enabled: organisationEnabled }, personalEnabled, suspended })).toEqual({ enabled: false, volume: 0, reason });
  });

  it("clamps organisation volume", () => {
    expect(resolveBackgroundMusic({ theme: "summer", date: new Date("2026-10-22T08:00:00"), config: { ...automatic, volume: 140 }, personalEnabled: true, suspended: false }).volume).toBe(1);
  });
});
