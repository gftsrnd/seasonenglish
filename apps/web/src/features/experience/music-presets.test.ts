import { describe, expect, it } from "vitest";
import { MUSIC_PRESETS, musicPresetFor, type StudyPeriod } from "./music-presets.js";
import type { SeasonTheme } from "../../app/games/season-visual.js";

const themes: readonly SeasonTheme[] = ["spring", "summer", "autumn", "winter", "tet", "midautumn", "christmas"];
const periods: readonly StudyPeriod[] = ["morning", "afternoon", "evening"];

describe("music preset catalog", () => {
  it("contains unique, attributable HTTPS sources with explicit licences", () => {
    expect(new Set(MUSIC_PRESETS.map((preset) => preset.id)).size).toBe(MUSIC_PRESETS.length);
    for (const preset of MUSIC_PRESETS) {
      expect(preset.label.trim()).not.toBe("");
      expect(preset.embedUrl).toMatch(/^https:\/\//);
      expect(preset.sourceUrl).toMatch(/^https:\/\//);
      expect(preset.licence).toMatch(/CC BY/);
      expect(preset.attribution.trim()).not.toBe("");
    }
  });

  it.each(themes.flatMap((theme) => periods.map((period) => [theme, period] as const)))(
    "resolves a deterministic preset for %s/%s",
    (theme, period) => {
      const first = musicPresetFor(theme, period);
      const second = musicPresetFor(theme, period);
      expect(first).toEqual(second);
      expect(first.themes).toContain(theme);
      expect(first.period).toBe(period);
    }
  );
});
