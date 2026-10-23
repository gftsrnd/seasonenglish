import type { SeasonTheme } from "../../app/games/season-visual.js";

export type StudyPeriod = "morning" | "afternoon" | "evening";

export type MusicPreset = {
  readonly id: string;
  readonly label: string;
  readonly themes: readonly SeasonTheme[];
  readonly period: StudyPeriod;
  readonly embedUrl: string;
  readonly sourceUrl: string;
  readonly licence: string;
  readonly licenceUrl: string;
  readonly attribution: string;
};

const allThemes: readonly SeasonTheme[] = ["spring", "summer", "autumn", "winter", "tet", "midautumn", "christmas"];

/** Audionautix/Jason Shaw CC BY 4.0 fallback shipped with the app. */
export const BUNDLED_CALM_MUSIC_URL = "/media/audio/emerald-therapy.mp3";
export const PROTOTYPE_MUSIC_PLAYLIST_URL = "https://www.youtube.com/watch?v=DSWYAclv2I8&list=PLQwRmTwWx0uaoRXVcKbUDW0wm8G_WJzDI";

export const MUSIC_PRESETS: readonly MusicPreset[] = [
  {
    id: "prototype-in-dreamland",
    label: "In Dreamland · playlist từ prototype",
    themes: allThemes,
    period: "morning",
    embedUrl: PROTOTYPE_MUSIC_PLAYLIST_URL,
    sourceUrl: PROTOTYPE_MUSIC_PLAYLIST_URL,
    licence: "Nguồn playlist từ prototype",
    licenceUrl: PROTOTYPE_MUSIC_PLAYLIST_URL,
    attribution: "In Dreamland · playlist nhạc nền mặc định của prototype"
  }
];

export function musicPresetFor(theme: SeasonTheme, period: StudyPeriod): MusicPreset {
  const preset = MUSIC_PRESETS.find((candidate) => candidate.themes.includes(theme));
  if (!preset) throw new Error(`No music preset for ${theme}/${period}`);
  return preset;
}
