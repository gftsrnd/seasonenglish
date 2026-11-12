import { z } from "zod";
import type { AiValidationIssue } from "./types.js";

/**
 * Daily-lesson Speaking (and self-written Writing) grading — docs/pronunciation-roadmap.md
 * "Chấm speaking hằng ngày": only the day's pronunciation item and the task requirement,
 * three levels (đạt / gần đạt / chưa đạt), intelligibility not accent, feedback of at
 * most two sentences, failed positions kept for M1 error review and the Friday review.
 */
export const LESSON_PRODUCTIVE_GRADING_TASK = "lesson_productive_grading";

const cefr = z.enum(["A1", "A2", "B1", "B2", "C1"]);
const shortText = z.string().trim().max(600);

export const lessonProductiveGradingInputSchema = z.object({
  mode: z.enum(["speaking", "writing"]),
  cefr,
  feedbackLanguage: z.enum(["vi", "en"]),
  task: z.object({
    prompt: z.string().trim().min(1).max(1_200),
    sample: shortText.optional(),
    passage: shortText.optional(),
    requiredWords: z.array(z.string().trim().min(1).max(80)).max(12),
    minRequiredWords: z.number().int().min(0).max(12),
    grammarFocus: shortText.optional()
  }),
  pronunciation: z.object({
    focus: z.string().trim().max(80),
    words: z.array(z.object({ word: z.string().trim().min(1).max(80), ipa: z.string().trim().max(80).optional() })).max(12)
  }).optional(),
  response: z.object({
    text: z.string().trim().min(1).max(4_000),
    uncertainWords: z.array(z.string().trim().min(1).max(80)).max(40),
    durationSeconds: z.number().nonnegative().optional()
  })
});
export type LessonProductiveGradingInput = z.infer<typeof lessonProductiveGradingInputSchema>;

export const lessonProductiveGradingOutputSchema = z.object({
  audioClear: z.boolean(),
  level: z.enum(["pass", "near", "fail"]),
  feedback: z.string().trim().min(1).max(320),
  failedPositions: z.array(z.object({
    target: z.string().trim().min(1).max(120),
    kind: z.enum(["pronunciation", "required_word", "grammar"]),
    note: z.string().trim().max(160)
  })).max(12),
  usedRequiredWords: z.array(z.string().trim().min(1).max(80)).max(12)
});
export type LessonProductiveGradingOutput = z.infer<typeof lessonProductiveGradingOutputSchema>;

export const lessonProductiveGradingOutputJsonSchema: Record<string, unknown> = {
  type: "object",
  additionalProperties: false,
  required: ["audioClear", "level", "feedback", "failedPositions", "usedRequiredWords"],
  properties: {
    audioClear: { type: "boolean", description: "Speaking: false only when the transcript is empty, noise, unrelated or too short to judge (the learner records again). Writing: always true." },
    level: { type: "string", enum: ["pass", "near", "fail"], description: "pass = đạt, near = gần đạt, fail = chưa đạt." },
    feedback: { type: "string", description: "At most 2 short sentences in feedbackLanguage." },
    failedPositions: {
      type: "array",
      maxItems: 12,
      items: {
        type: "object",
        additionalProperties: false,
        required: ["target", "kind", "note"],
        properties: {
          target: { type: "string", description: "Exact word from pronunciation.words or task.requiredWords, or the grammar focus." },
          kind: { type: "string", enum: ["pronunciation", "required_word", "grammar"] },
          note: { type: "string", description: "What was not achieved, at most 12 words." }
        }
      }
    },
    usedRequiredWords: { type: "array", maxItems: 12, items: { type: "string" } }
  }
};

export const lessonProductiveGradingDefaultPrompt = [
  "Task: grade ONE daily-lesson response from a Vietnamese office learner. Return JSON only, matching the supplied schema.",
  "SPEAKING (mode speaking): response.text is an automatic speech-to-text transcript of the learner's real recording; response.uncertainWords are words the recogniser was unsure about. Judge only (1) today's pronunciation item: pronunciation.words and the focus sound must be intelligible. A target word transcribed correctly is intelligible. A target word that the task or passage requires but is missing, replaced by a different word, or listed in uncertainWords is a failed position. (2) The task requirement: at least task.minRequiredWords of task.requiredWords used with their taught meaning, and task.grammarFocus when the task asks for it.",
  "Never penalise a Vietnamese accent, word stress or intonation that a listener can still understand: the criterion is intelligibility. Ignore fillers, hesitations, self-corrections and slips unrelated to today's item. Do not grade fluency, length or content beyond the task requirement.",
  "audioClear=false only when the transcript is empty, mostly noise, not an attempt at the task, or too short to judge; the app then asks the learner to record again, which is not a fail.",
  "WRITING (mode writing): response.text is typed by the learner; audioClear is always true and pronunciation is ignored. Judge only the task requirement: required words with their taught meaning, the grammar focus of the day, and a meaningful sentence. Ignore spelling slips that keep the word recognisable.",
  "LEVELS: pass = today's item intelligible and the task requirement met; near = mostly met with one small miss (one target word unclear or one required element missing); fail = today's item not intelligible or the task requirement clearly not met.",
  "failedPositions: one entry per word or position not achieved; target is the exact word from pronunciation.words or task.requiredWords (or the grammar focus text); note at most 12 words. Empty when level is pass; at least one entry when level is near or fail.",
  "feedback: at most 2 short sentences in feedbackLanguage (vi = Vietnamese, en = simple English). Say what to fix and name the word; when passed, say briefly what was good. No scores, no mention of accent.",
  "usedRequiredWords: the task.requiredWords actually present in response.text."
].join("\n");

export function buildLessonProductiveGradingSystemPrompt(prompt: string, input: Pick<LessonProductiveGradingInput, "cefr" | "feedbackLanguage" | "mode">): string {
  const base = prompt.trim() || lessonProductiveGradingDefaultPrompt;
  const language = input.feedbackLanguage === "vi"
    ? "Write feedback in natural Vietnamese (the learner is A1-A2); English words being corrected stay in English."
    : "Write feedback in simple English the learner understands at their CEFR level.";
  return `${base}\n\nLearner CEFR: ${input.cefr}. Mode: ${input.mode}. ${language} Maximum 2 sentences.`;
}

const vietnameseLetters = /[ăâđêôơưạảấầẩẫậắằẳẵặẹẻẽếềểễệỉịọỏốồổỗộớờởỡợụủứừửữựỳỵỷỹáàãéèíìóòõúùýđ]/iu;

export function countSentences(text: string): number {
  return text.trim().split(/(?<=[.!?…])\s+/u).filter((part) => /[\p{L}\p{N}]/u.test(part)).length;
}

export function validateLessonProductiveGrading(output: LessonProductiveGradingOutput, input: LessonProductiveGradingInput): AiValidationIssue[] {
  const issues: AiValidationIssue[] = [];
  if (countSentences(output.feedback) > 2) issues.push({ path: "feedback", message: "Feedback must be at most 2 sentences." });
  if (input.feedbackLanguage === "en" && vietnameseLetters.test(output.feedback)) issues.push({ path: "feedback", message: "Feedback must be simple English for this learner." });
  if (input.feedbackLanguage === "vi" && !vietnameseLetters.test(output.feedback)) issues.push({ path: "feedback", message: "Feedback must be written in Vietnamese for this learner." });
  if (input.mode === "writing" && !output.audioClear) issues.push({ path: "audioClear", message: "Writing responses are always audioClear=true." });
  if (!output.audioClear) return issues;
  if (output.level === "pass" && output.failedPositions.length) issues.push({ path: "failedPositions", message: "A pass has no failed positions." });
  if (output.level !== "pass" && !output.failedPositions.length) issues.push({ path: "failedPositions", message: "near/fail needs at least one failed position." });
  const pronunciationTargets = new Set([
    ...(input.pronunciation?.words.map((item) => normalizeTarget(item.word)) ?? []),
    ...(input.pronunciation?.focus ? [normalizeTarget(input.pronunciation.focus)] : [])
  ]);
  const requiredTargets = new Set(input.task.requiredWords.map(normalizeTarget));
  output.failedPositions.forEach((position, index) => {
    const target = normalizeTarget(position.target);
    if (position.kind === "pronunciation" && (input.mode === "writing" || !pronunciationTargets.has(target))) {
      issues.push({ path: `failedPositions.${index}.target`, message: "Pronunciation positions must name one of pronunciation.words (speaking only)." });
    }
    if (position.kind === "required_word" && !requiredTargets.has(target)) {
      issues.push({ path: `failedPositions.${index}.target`, message: "required_word positions must name one of task.requiredWords." });
    }
  });
  output.usedRequiredWords.forEach((word, index) => {
    if (!requiredTargets.has(normalizeTarget(word))) {
      issues.push({ path: `usedRequiredWords.${index}`, message: "Only list words from task.requiredWords." });
    }
  });
  return issues;
}

function normalizeTarget(value: string): string {
  return value.normalize("NFKC").toLocaleLowerCase("en").replace(/[^\p{L}\p{N}/' ]+/gu, " ").replace(/\s+/gu, " ").trim();
}

export type LessonProductiveStatus = "correct" | "wrong_retry" | "wrong_exhausted" | "retake";

/**
 * Maps a grade to the lesson part outcome used by every other part: pass → correct;
 * near/fail → wrong_retry while an attempt is left, wrong_exhausted on the last one;
 * an unclear recording → retake (record again, the attempt is not counted).
 */
export function lessonProductiveOutcome(
  grade: Pick<LessonProductiveGradingOutput, "audioClear" | "level">,
  attemptNumber: number,
  maxAttempts = 2
): { status: LessonProductiveStatus; score: number } {
  if (!grade.audioClear) return { status: "retake", score: 0 };
  if (grade.level === "pass") return { status: "correct", score: 100 };
  return { status: attemptNumber >= maxAttempts ? "wrong_exhausted" : "wrong_retry", score: grade.level === "near" ? 50 : 0 };
}

/** Too little speech to judge: ask for a new recording without calling the grader. */
export function speakingTranscriptTooShort(text: string, durationSeconds?: number): boolean {
  const words = text.trim().split(/\s+/u).filter((word) => /\p{L}/u.test(word));
  return words.length < 2 || (durationSeconds !== undefined && durationSeconds < 1.5);
}

export function lessonRetakeFeedback(language: "vi" | "en"): string {
  return language === "vi"
    ? "Bản ghi chưa nghe rõ hoặc quá ngắn. Hãy ghi âm lại, nói to và rõ hơn."
    : "The recording was too short or unclear. Please record again, a little louder and clearer.";
}
