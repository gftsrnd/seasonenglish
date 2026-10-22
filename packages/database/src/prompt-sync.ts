export interface PromptVersionRecord {
  version: number;
  status: string;
  content: string;
}

export interface CanonicalPromptPublication {
  shouldPublish: boolean;
  nextVersion: number;
}

/**
 * Prompt versions are immutable once active. A local refresh therefore
 * publishes a new version when the latest active prompt differs from the
 * source-of-truth prompt; it never retires or edits an existing active row.
 */
export function planCanonicalPromptPublication(
  versions: readonly PromptVersionRecord[],
  canonicalContent: string
): CanonicalPromptPublication {
  const latestActive = versions
    .filter((version) => version.status === "active")
    .sort((left, right) => right.version - left.version)[0];
  const maxVersion = versions.reduce((max, version) => Math.max(max, version.version), 0);

  return {
    shouldPublish: latestActive?.content !== canonicalContent,
    nextVersion: maxVersion + 1
  };
}
