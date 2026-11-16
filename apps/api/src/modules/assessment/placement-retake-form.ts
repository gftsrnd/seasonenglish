import type { LevelFormTaskOutput } from "@e4s/ai";
import { PLACEMENT_RETAKE_ASSESSMENT_KEY, placementDefinition, type StoredAssessmentDefinition } from "@e4s/database";
import type { LevelFormQualityIssue } from "./level-form-quality.js";

/**
 * Placement retake form (owner decision 11/2026): a learner may retake placement once, on a NEW
 * AI-generated form. It reuses the level-up generator (same three slices, same output schema,
 * same auto-fix, content gate, review and publish flow) with a placement scope: the items are
 * spread over A1–C1 so the total still bands the learner, instead of targeting one level.
 */
export const PLACEMENT_RETAKE_TARGET = PLACEMENT_RETAKE_ASSESSMENT_KEY;
export type PlacementRetakeTarget = typeof PLACEMENT_RETAKE_TARGET;

/**
 * Exit (Pass Course) retake: the same once-only retake could be built for Form A, but it stays
 * hidden. The hook is ready: `assessment_retake_grants.kind` already allows 'pass_course', and the
 * grant route refuses that kind while this flag is false. Enabling it also needs a pass-course
 * retake form slot and a start path in `/assessments/pass-course/start`.
 */
export const PASS_COURSE_RETAKE_ENABLED = false;

export const PLACEMENT_RETAKE_FORM_PROMPT = `Create a complete 75-minute, 100-point Workplace English CEFR placement test. This is a retake form for a learner who already took the standard placement test, so every item must be new: never reuse, paraphrase closely or translate items, passages, scripts, tables or prompts of the standard placement form (placement-a). Return exactly four sections with the placement structure: Listening 20 multiple-choice questions for 20 points, Reading 40 multiple-choice questions for 40 points, Writing 2 tasks for 20 points, and Speaking 4 tasks for 20 points. The difficulty is NOT one target level: spread items across A1, A2, B1, B2 and C1 so the total score places the learner (bands 0–24 A1, 25–44 A2, 45–64 B1, 65–84 B2, 85–100 C1). Order items from easier to harder inside each part. Writing task 1 is a short A2–B1 reply and task 2 a B2–C1 formal email or proposal; speaking goes from an A1–A2 warm-up to B2–C1 discussion. Use realistic workplace situations, unambiguous answer keys, and the required JSON schema exactly.`;

export const PLACEMENT_RETAKE_SLICE_GUIDANCE = {
  listening: "Generate only the title of the whole placement test (never a section name such as \"Listening Section\"; never a single CEFR level in the title), the listening script, and exactly 20 listening questions. The script must contain exactly five clearly labelled parts (Part 1 through Part 5), with four questions for each part in the same order; Part 1 is A1–A2 and Part 5 is B2–C1.",
  reading: "Generate only the reading passage and exactly 40 reading questions (grammar, vocabulary and comprehension). Keep every prompt and option concise; questions 1–10, 11–20, 21–30 and 31–40 must each form a distinct workplace-reading part, rising from A1–A2 to B2–C1.",
  production: "Generate only exactly two writing prompts (A2–B1, then B2–C1) and four speaking prompts (A1–A2 warm-up, B1–B2 data or situation, B2–C1 customer interaction, B2–C1 monologue)."
} as const;

export const PLACEMENT_RETAKE_READING_REPAIR_PROMPT = "Generate exactly one new multiple-choice reading question for the supplied passage of a mixed A1–C1 placement retake form. It must have four concise options, an unambiguous correctIndex, must not duplicate any existing prompt and must not copy the standard placement form. Each question prompt must contain only the question text. Omit part labels such as Part 1: and question numbering. Return only the structured tool input.";

export const PLACEMENT_RETAKE_TITLE = "Test đầu vào – đề thi lại";

/** AI input for the three generation slices (and the reading repair). */
export function placementRetakeAiInput() {
  return { targetLevel: "A1-C1" as const, scope: "placement_retake" as const, context: "workplace_english" as const, listeningQuestions: 20 as const, readingQuestions: 40 as const };
}

function normalized(text: string | undefined | null): string {
  return (text ?? "").toLocaleLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();
}

function sentences(text: string): string[] {
  return text.split(/(?<=[.!?])\s+|\n+/).map(normalized).filter((sentence) => sentence.length >= 40);
}

function canonicalPlacementTexts(definition: StoredAssessmentDefinition) {
  const prompts = new Set<string>();
  const items = new Set<string>();
  const stimulusSentences = new Set<string>();
  for (const section of definition.sections) {
    for (const group of section.groups) {
      const stimulus = group.stimulus;
      const stimulusText = [stimulus?.text, ...(stimulus?.lines ?? []).map((line) => line.text), ...(stimulus?.rows ?? []).map((row) => row.join(" "))].filter(Boolean).join("\n");
      for (const sentence of sentences(stimulusText)) stimulusSentences.add(sentence);
      for (const task of group.tasks) {
        const prompt = normalized(task.prompt);
        if (task.responseType === "single_choice") {
          const correct = task.options?.find((option) => option.value === task.correctAnswer)?.label;
          items.add(`${prompt}|${normalized(correct)}`);
        } else if (prompt.length >= 30) {
          prompts.add(prompt);
        }
      }
    }
  }
  return { prompts, items, stimulusSentences };
}

let canonicalCache: ReturnType<typeof canonicalPlacementTexts> | null = null;

/**
 * Deterministic guard: a retake form must never copy the canonical placement-a items. A choice
 * item is a copy when its prompt and correct answer both match a placement-a item; a productive
 * prompt when it matches verbatim; a script/passage when it repeats a full placement-a sentence.
 * Each finding is severe, so generation fails instead of saving the draft.
 */
export function placementRetakeCopyIssues(output: LevelFormTaskOutput, canonical: StoredAssessmentDefinition = placementDefinition): LevelFormQualityIssue[] {
  const texts = canonical === placementDefinition ? (canonicalCache ??= canonicalPlacementTexts(canonical)) : canonicalPlacementTexts(canonical);
  const issues: LevelFormQualityIssue[] = [];
  const choiceCopies = (section: "listening" | "reading") => output[section].questions.forEach((question, questionIndex) => {
    if (texts.items.has(`${normalized(question.prompt)}|${normalized(question.options[question.correctIndex])}`)) {
      issues.push({ code: "LEVEL_FORM_COPIES_PLACEMENT", severity: "severe", section, questionIndex, message: `Câu ${questionIndex + 1} trùng câu của đề đầu vào gốc (placement-a).` });
    }
  });
  choiceCopies("listening");
  choiceCopies("reading");
  const copiedSentence = (text: string) => sentences(text).some((sentence) => texts.stimulusSentences.has(sentence));
  if (copiedSentence(output.listening.script)) issues.push({ code: "LEVEL_FORM_COPIES_PLACEMENT", severity: "severe", section: "listening", message: "Bài nghe lặp lại câu của đề đầu vào gốc (placement-a)." });
  if (copiedSentence(output.reading.passage)) issues.push({ code: "LEVEL_FORM_COPIES_PLACEMENT", severity: "severe", section: "reading", message: "Bài đọc lặp lại câu của đề đầu vào gốc (placement-a)." });
  if ([...output.writingPrompts, ...output.speakingPrompts].some((prompt) => texts.prompts.has(normalized(prompt)))) {
    issues.push({ code: "LEVEL_FORM_COPIES_PLACEMENT", severity: "severe", section: "form", message: "Đề Viết/Nói trùng đề của đề đầu vào gốc (placement-a)." });
  }
  return issues;
}
