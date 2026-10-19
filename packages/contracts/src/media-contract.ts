export interface ContentImageAttribution {
  creator: string | null;
  licence: string;
  licenceUrl: string;
  sourceUrl: string;
}

export interface ContentImageRequest {
  term: string;
  partOfSpeech?: string;
  imageQuery?: string;
  explicitImageUrl?: string;
  explicitAttribution?: ContentImageAttribution;
}

export type ContentImageView =
  | { status: "unavailable" }
  | {
      status: "available";
      imageUrl: string;
      alt: string;
      attribution: ContentImageAttribution;
    };

export interface ContentImageDiagnosticView {
  image: ContentImageView;
  provider: "wikipedia" | "wikimedia" | "openverse" | "explicit" | null;
  cached: boolean;
}
