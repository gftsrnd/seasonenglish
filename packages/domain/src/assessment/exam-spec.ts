import type { AssessmentDefinitionView } from "@e4s/contracts";

export type AssessmentReleaseCode =
  | "MONTHLY_FINAL_DURATION_INVALID"
  | "MONTHLY_FINAL_SCORE_INVALID"
  | "MONTHLY_FINAL_FOUR_SKILLS_REQUIRED"
  | "MONTHLY_FINAL_SECTION_SCORE_INVALID"
  | "LISTENING_AUDIO_SOURCE_MISSING"
  | "LISTENING_AUDIO_SCRIPT_MISSING"
  | "PASS_COURSE_C1_REQUIRED"
  | "PASS_COURSE_DURATION_INVALID"
  | "PASS_COURSE_SCORE_INVALID"
  | "PASS_COURSE_FOUR_SKILLS_REQUIRED";

/**
 * The monthly final is deliberately a compact assessment. Its content comes
 * from a locked month framework, while this invariant keeps its release shape
 * stable across all CEFR levels.
 */
export function monthlyFinalReleaseReadiness(definition: Pick<AssessmentDefinitionView, "kind" | "totalMinutes" | "totalScore" | "sections">): AssessmentReleaseCode[] {
  const failures: AssessmentReleaseCode[] = [];
  if (definition.kind !== "final" || definition.totalMinutes !== 30) failures.push("MONTHLY_FINAL_DURATION_INVALID");
  if (definition.totalScore !== 100) failures.push("MONTHLY_FINAL_SCORE_INVALID");
  if (definition.sections.length !== 4 || new Set(definition.sections.map((section) => section.code)).size !== 4) failures.push("MONTHLY_FINAL_FOUR_SKILLS_REQUIRED");
  if (definition.sections.some((section) => section.maxScore !== 25)) failures.push("MONTHLY_FINAL_SECTION_SCORE_INVALID");
  return [...failures, ...assessmentAudioReadiness(definition)];
}

/** A listener must be able to preview both the exact script and its audio. */
export function assessmentAudioReadiness(definition: Pick<AssessmentDefinitionView, "sections">): AssessmentReleaseCode[] {
  const listening = definition.sections.find((section) => section.code === "listening");
  if (!listening) return ["LISTENING_AUDIO_SOURCE_MISSING", "LISTENING_AUDIO_SCRIPT_MISSING"];
  const failures: AssessmentReleaseCode[] = [];
  for (const group of listening.groups) {
    const stimulus = group.stimulus;
    if (stimulus?.type !== "audio_script" || !stimulus.audioSrc?.trim()) failures.push("LISTENING_AUDIO_SOURCE_MISSING");
    if (stimulus?.type !== "audio_script" || !stimulus.lines?.some((line) => line.text.trim())) failures.push("LISTENING_AUDIO_SCRIPT_MISSING");
  }
  return [...new Set(failures)];
}

/** Fixed Form A gate. Persistence and certificate workflow remain API-owned. */
export function passCourseReadiness(input: { eligibleCefr: string | null; totalMinutes: number; totalScore: number; sections: number }): AssessmentReleaseCode[] {
  const failures: AssessmentReleaseCode[] = [];
  if (input.eligibleCefr !== "C1") failures.push("PASS_COURSE_C1_REQUIRED");
  if (input.totalMinutes !== 90) failures.push("PASS_COURSE_DURATION_INVALID");
  if (input.totalScore !== 100) failures.push("PASS_COURSE_SCORE_INVALID");
  if (input.sections !== 4) failures.push("PASS_COURSE_FOUR_SKILLS_REQUIRED");
  return failures;
}
