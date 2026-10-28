export interface AudioDeletionMetadata {
  deletedAt?: string | null;
  deletedBy?: string | null;
  reason?: string | null;
}

export interface AudioEvidence {
  fileId?: string | null;
  artifactKey?: string;
  signedUrl?: string;
  expiresAt?: string | null;
  createdAt?: string | null;
  mimeType?: string | null;
  sizeBytes?: number | null;
  transcript?: string | null;
  retentionUntil?: string | null;
  cleanupEligible?: boolean;
  deletedAt?: string | null;
  deletedBy?: string | null;
  deletion?: AudioDeletionMetadata | null;
}

const DAY_MS = 24 * 60 * 60 * 1_000;

type UnknownRecord = Record<string, unknown>;

function record(value: unknown): UnknownRecord | null {
  return value && typeof value === "object" && !Array.isArray(value) ? value as UnknownRecord : null;
}

function text(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function nullableText(value: unknown): string | null | undefined {
  if (value === null) return null;
  return text(value);
}

function deletionMetadata(value: unknown): AudioDeletionMetadata | null | undefined {
  const source = record(value);
  if (!source) return value === null ? null : undefined;
  const deletedAt = nullableText(source.deletedAt ?? source.deleted_at);
  const deletedBy = nullableText(source.deletedBy ?? source.deleted_by);
  const reason = nullableText(source.reason);
  if (deletedAt === undefined && deletedBy === undefined && reason === undefined) return undefined;
  return { ...(deletedAt === undefined ? {} : { deletedAt }), ...(deletedBy === undefined ? {} : { deletedBy }), ...(reason === undefined ? {} : { reason }) };
}

/** Normalizes current assessment fields and future signed playback shapes at the UI boundary. */
export function normalizeAudioEvidence(value: unknown): AudioEvidence | null {
  const source = record(value);
  if (!source) return null;
  const nested = record(source.audioArtifact) ?? record(source.audio) ?? source;
  const fileId = nullableText(source.fileId ?? nested.fileId);
  const transcript = nullableText(source.transcript ?? source.transcription ?? nested.transcript ?? nested.transcription);
  const artifactKey = text(source.artifactKey ?? source.audioArtifactKey ?? nested.artifactKey ?? nested.key ?? nested.audioKey);
  const signedUrl = text(source.signedUrl ?? source.playbackUrl ?? source.audioUrl ?? nested.signedUrl ?? nested.playbackUrl ?? nested.url ?? nested.readUrl);
  const expiresAt = nullableText(source.expiresAt ?? nested.expiresAt ?? nested.urlExpiresAt);
  const createdAt = nullableText(source.createdAt ?? source.uploadedAt ?? source.savedAt ?? nested.createdAt ?? nested.uploadedAt ?? nested.savedAt);
  const retentionUntil = nullableText(source.retentionUntil ?? nested.retentionUntil);
  const cleanupEligible = typeof (source.cleanupEligible ?? nested.cleanupEligible) === "boolean"
    ? Boolean(source.cleanupEligible ?? nested.cleanupEligible)
    : undefined;
  const mimeType = nullableText(source.mimeType ?? nested.mimeType);
  const sizeBytes = typeof (source.sizeBytes ?? nested.sizeBytes) === "number" ? Number(source.sizeBytes ?? nested.sizeBytes) : null;
  const deletedAt = nullableText(source.deletedAt ?? nested.deletedAt);
  const deletedBy = nullableText(source.deletedBy ?? nested.deletedBy);
  const hasFlatDeletion = (deletedAt !== undefined && deletedAt !== null) || (deletedBy !== undefined && deletedBy !== null);
  const deletion = deletionMetadata(source.deletion ?? nested.deletion ?? (hasFlatDeletion ? source : undefined));
  if (!artifactKey && !signedUrl && !transcript && !fileId && !deletion) return null;
  return {
    ...(fileId === undefined ? {} : { fileId }),
    ...(artifactKey ? { artifactKey } : {}),
    ...(signedUrl ? { signedUrl } : {}),
    ...(expiresAt === undefined ? {} : { expiresAt }),
    ...(createdAt === undefined ? {} : { createdAt }),
    ...(retentionUntil === undefined ? {} : { retentionUntil }),
    ...(cleanupEligible === undefined ? {} : { cleanupEligible }),
    ...(mimeType === undefined ? {} : { mimeType }),
    ...(sizeBytes === null ? {} : { sizeBytes }),
    ...(transcript === undefined ? {} : { transcript }),
    ...(deletedAt === undefined ? {} : { deletedAt }),
    ...(deletedBy === undefined ? {} : { deletedBy }),
    ...(deletion === undefined ? {} : { deletion })
  };
}

export function audioCleanupEligible(evidence: Pick<AudioEvidence, "createdAt" | "retentionUntil" | "cleanupEligible" | "deletedAt" | "deletion">, now = new Date(), retentionDays = 60): boolean {
  if (evidence.deletion?.deletedAt || evidence.deletedAt) return false;
  if (evidence.cleanupEligible !== undefined) return evidence.cleanupEligible;
  if (evidence.retentionUntil) {
    const retention = Date.parse(evidence.retentionUntil);
    return Number.isFinite(retention) && now.getTime() >= retention;
  }
  if (!evidence.createdAt) return false;
  const created = Date.parse(evidence.createdAt);
  const current = now.getTime();
  return Number.isFinite(created) && Number.isFinite(current) && current - created >= retentionDays * DAY_MS;
}

export function formatAudioDate(value: string): string {
  const parsed = new Date(value);
  if (!Number.isFinite(parsed.getTime())) return value;
  return new Intl.DateTimeFormat("vi-VN", { day: "2-digit", month: "2-digit", year: "numeric", timeZone: "UTC" }).format(parsed);
}
