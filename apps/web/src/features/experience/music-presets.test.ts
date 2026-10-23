import { describe, expect, it } from "vitest";
import { BUNDLED_CALM_MUSIC_URL, MUSIC_PRESETS, PROTOTYPE_MUSIC_PLAYLIST_URL, musicPresetFor, type StudyPeriod } from "./music-presets.js";
import type { SeasonTheme } from "../../app/games/season-visual.js";

const themes: readonly SeasonTheme[] = ["spring", "summer", "autumn", "winter", "tet", "midautumn", "christmas"];
const periods: readonly StudyPeriod[] = ["morning", "afternoon", "evening"];

describe("music preset catalog", () => {
  it("uses the exact default playlist from the prototype instead of the old catalog", () => {
    expect(MUSIC_PRESETS).toHaveLength(1);
    expect(MUSIC_PRESETS.map((preset) => preset.label)).toEqual(["In Dreamland · playlist từ prototype"]);
    expect(MUSIC_PRESETS[0]?.embedUrl).toBe(PROTOTYPE_MUSIC_PLAYLIST_URL);
    expect(PROTOTYPE_MUSIC_PLAYLIST_URL).toContain("DSWYAclv2I8");
    expect(PROTOTYPE_MUSIC_PLAYLIST_URL).toContain("PLQwRmTwWx0uaoRXVcKbUDW0wm8G_WJzDI");
    expect(BUNDLED_CALM_MUSIC_URL).toBe("/media/audio/emerald-therapy.mp3");
  });

  it("contains unique, attributable sources with an explicit licence URL", () => {
    expect(new Set(MUSIC_PRESETS.map((preset) => preset.id)).size).toBe(MUSIC_PRESETS.length);
    for (const preset of MUSIC_PRESETS) {
      expect(preset.label.trim()).not.toBe("");
      expect(preset.embedUrl).toMatch(/^https:\/\/www\.youtube\.com\/watch\?/);
      expect(preset.sourceUrl).toMatch(/^https:\/\//);
      expect(preset.licence).toBe("Nguồn playlist từ prototype");
      expect(preset.licenceUrl).toBe(preset.sourceUrl);
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
      expect(first.id).toBe("prototype-in-dreamland");
    }
  );
});
