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
  readonly attribution: string;
};

const allThemes: readonly SeasonTheme[] = ["spring", "summer", "autumn", "winter", "tet", "midautumn", "christmas"];

export const MUSIC_PRESETS: readonly MusicPreset[] = [
  {
    id: "bright-morning",
    label: "Buổi sáng tươi sáng",
    themes: allThemes,
    period: "morning",
    embedUrl: "https://commons.wikimedia.org/wiki/Special:Redirect/file/Sascha_Ende_-_Total_Happy_Up_And_Sunny_(cc-by)_(filmmusic.io).ogg",
    sourceUrl: "https://commons.wikimedia.org/wiki/File:Sascha_Ende_-_Total_Happy_Up_And_Sunny_(cc-by)_(filmmusic.io).ogg",
    licence: "CC BY 4.0",
    attribution: "Total Happy Up And Sunny — Sascha Ende"
  },
  {
    id: "steady-afternoon",
    label: "Buổi chiều tập trung",
    themes: allThemes,
    period: "afternoon",
    embedUrl: "https://commons.wikimedia.org/wiki/Special:Redirect/file/Soft_Corporate_by_MusicLFiles.ogg",
    sourceUrl: "https://commons.wikimedia.org/wiki/File:Soft_Corporate_by_MusicLFiles.ogg",
    licence: "CC BY 4.0",
    attribution: "Soft Corporate — MusicLFiles"
  },
  {
    id: "driving-evening",
    label: "Buổi tối nhẹ và tỉnh táo",
    themes: allThemes,
    period: "evening",
    embedUrl: "https://commons.wikimedia.org/wiki/Special:Redirect/file/Audionautix-com-ccby-azimuth.mp3",
    sourceUrl: "https://commons.wikimedia.org/wiki/File:Audionautix-com-ccby-azimuth.mp3",
    licence: "CC BY 3.0",
    attribution: "Azimuth — Jason Shaw / Audionautix"
  }
];

export function musicPresetFor(theme: SeasonTheme, period: StudyPeriod): MusicPreset {
  const preset = MUSIC_PRESETS.find((candidate) => candidate.period === period && candidate.themes.includes(theme));
  if (!preset) throw new Error(`No music preset for ${theme}/${period}`);
  return preset;
}
