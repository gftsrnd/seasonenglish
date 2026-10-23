import type {
  LearnerProfileData,
  LessonPartCode,
  LessonProgressView,
  PartEvidence
} from "@e4s/contracts";

export const canonicalLessonPartOrder = [
  "objective",
  "instruction",
  "vocabulary",
  "grammar",
  "pronunciation",
  "listening",
  "reading",
  "writing",
  "word_class",
  "word_use",
  "speaking"
] as const satisfies readonly LessonPartCode[];

const orderIndex = new Map<LessonPartCode, number>(
  canonicalLessonPartOrder.map((part, index) => [part, index])
);

export function validateLessonPartOrder(parts: readonly LessonPartCode[]): {
  valid: boolean;
  misplaced: LessonPartCode[];
} {
  const misplaced: LessonPartCode[] = [];
  let last = -1;
  for (const part of parts) {
    const index = orderIndex.get(part) ?? -1;
    if (index < last) misplaced.push(part);
    else last = index;
  }
  return { valid: misplaced.length === 0, misplaced };
}

export function isLearnerProfileComplete(profile: Partial<LearnerProfileData>): profile is LearnerProfileData {
  return Boolean(
    profile.fullName?.trim()
      && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(profile.email ?? "")
      && profile.goals?.length
      && profile.environmentUse
      && profile.familyUse
      && profile.habits?.length
      && profile.learningStyles?.length
      && profile.persona
      && profile.durationMinutes
      && profile.device
      && profile.selfLevel
  );
}

export interface ProgressUpdate {
  completedPartCodes: readonly LessonPartCode[];
  evidence: Partial<Record<LessonPartCode, PartEvidence>>;
  markComplete?: boolean | undefined;
  score?: number | undefined;
}

export function mergeLessonProgress(
  current: LessonProgressView | null,
  update: ProgressUpdate,
  requiredParts: readonly LessonPartCode[]
): LessonProgressView {
  const completedPartCodes = canonicalLessonPartOrder.filter((part) =>
    new Set([...(current?.completedPartCodes ?? []), ...update.completedPartCodes]).has(part)
  );
  const evidence = { ...(current?.evidence ?? {}), ...update.evidence };
  const canComplete = requiredParts.every((part) => completedPartCodes.includes(part) && evidence[part]);
  const status = update.markComplete && canComplete
    ? "completed"
    : completedPartCodes.length > 0
      ? "in_progress"
      : current?.status ?? "not_started";

  return {
    status,
    completedPartCodes,
    evidence,
    ...(update.score !== undefined || current?.score !== undefined
      ? { score: update.score ?? current?.score }
      : {})
  };
}

export interface SpeakingCompletenessResult {
  passed: boolean;
  missingWords: number;
  totalWords: number;
  missingRatio: number;
}

export function evaluateSpeakingCompleteness(
  reference: string,
  transcript: string,
  maximumMissingRatio = 0.2
): SpeakingCompletenessResult {
  const expected = speakingWords(reference);
  const actual = speakingWords(transcript);
  if (expected.length === 0) {
    return { passed: false, missingWords: 0, totalWords: 0, missingRatio: 1 };
  }

  const matchedWords = longestCommonWordSubsequence(expected, actual);
  const missingWords = expected.length - matchedWords;
  const missingRatio = missingWords / expected.length;
  return {
    passed: missingRatio <= maximumMissingRatio,
    missingWords,
    totalWords: expected.length,
    missingRatio
  };
}

function speakingWords(value: string): string[] {
  return (value.toLocaleLowerCase("en-US").match(/[\p{L}\p{N}]+(?:['’][\p{L}\p{N}]+)*/gu) ?? [])
    .map((word) => word.replaceAll("’", "'"));
}

function longestCommonWordSubsequence(expected: readonly string[], actual: readonly string[]): number {
  const row = new Array<number>(actual.length + 1).fill(0);
  for (const expectedWord of expected) {
    let diagonal = 0;
    for (let index = 1; index <= actual.length; index += 1) {
      const previous = row[index] ?? 0;
      row[index] = expectedWord === actual[index - 1]
        ? diagonal + 1
        : Math.max(row[index] ?? 0, row[index - 1] ?? 0);
      diagonal = previous;
    }
  }
  return row[actual.length] ?? 0;
}
