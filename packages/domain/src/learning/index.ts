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
