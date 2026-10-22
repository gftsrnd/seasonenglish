export const organisationExperienceThemes = [
  "auto", "spring", "summer", "autumn", "winter", "tet", "midautumn", "christmas"
] as const;

export type OrganisationExperienceTheme = typeof organisationExperienceThemes[number];

export interface OrganisationBackgroundMusicView {
  readonly enabled: boolean;
  readonly playlistId: string;
  readonly customUrl: string;
  readonly volume: number;
}

export interface OrganisationExperienceView {
  readonly theme: OrganisationExperienceTheme;
  readonly backgroundMusic: OrganisationBackgroundMusicView;
}

export type OrganisationExperienceInput = OrganisationExperienceView;
