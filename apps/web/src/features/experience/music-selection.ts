import type { OrganisationBackgroundMusicView } from "@e4s/contracts";
import type { SeasonTheme } from "../../app/games/season-visual.js";
import { MUSIC_PRESETS, musicPresetFor, type StudyPeriod } from "./music-presets.js";

type SelectionInput = {
  readonly theme: SeasonTheme;
  readonly date: Date;
  readonly config: OrganisationBackgroundMusicView;
  readonly personalEnabled: boolean;
  readonly suspended: boolean;
};

export type BackgroundMusicSelection =
  | { readonly enabled: false; readonly volume: 0; readonly reason: "personal-off" | "organisation-off" | "suspended" }
  | { readonly enabled: true; readonly url: string; readonly volume: number; readonly source: "custom" | "preset"; readonly presetId?: string };

export function studyPeriodFor(date: Date): StudyPeriod {
  const hour = date.getHours();
  if (hour < 12) return "morning";
  if (hour < 18) return "afternoon";
  return "evening";
}

export function resolveBackgroundMusic(input: SelectionInput): BackgroundMusicSelection {
  if (!input.config.enabled) return { enabled: false, volume: 0, reason: "organisation-off" };
  if (!input.personalEnabled) return { enabled: false, volume: 0, reason: "personal-off" };
  if (input.suspended) return { enabled: false, volume: 0, reason: "suspended" };
  const volume = Math.max(0, Math.min(100, input.config.volume)) / 100;
  const customUrl = input.config.customUrl.trim();
  if (customUrl) return { enabled: true, url: customUrl, volume, source: "custom" };
  const named = input.config.playlistId === "auto" ? undefined : MUSIC_PRESETS.find((preset) => preset.id === input.config.playlistId);
  const preset = named ?? musicPresetFor(input.theme, studyPeriodFor(input.date));
  return { enabled: true, url: preset.embedUrl, volume, source: "preset", presetId: preset.id };
}
