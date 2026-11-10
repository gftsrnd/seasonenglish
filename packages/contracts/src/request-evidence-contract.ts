export const requestEvidenceMaxBytes = 512 * 1024;
export type RequestEvidenceKind = "complaint" | "assessment" | "lesson_part" | "weekly_practice";
export interface RequestEvidenceInput {
  scope?: string | undefined;
  screenshot?: { mimeType: "image/png" | "image/jpeg" | "image/webp"; base64: string } | undefined;
}
export interface RequestEvidenceView {
  scope?: string | null | undefined;
  hasEvidence?: boolean | undefined;
}
