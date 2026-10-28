export interface AudioArtifactView {
  fileId?: string | null;
  artifactKey: string;
  signedUrl?: string | null;
  expiresAt?: string | null;
  createdAt?: string | null;
  mimeType?: string | null;
  sizeBytes?: number | null;
  transcript?: string | null;
  retentionUntil?: string | null;
  cleanupEligible?: boolean;
  deletedAt?: string | null;
  deletedBy?: string | null;
}

export type AudioArtifactInput = Omit<AudioArtifactView, "artifactKey"> & {
  artifactKey: string;
};
