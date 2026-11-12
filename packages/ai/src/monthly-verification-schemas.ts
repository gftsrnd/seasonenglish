import { z } from "zod";

/**
 * Independent checks run after a monthly lesson or resource candidate passed
 * the deterministic gates (December 2026 evaluation). They never write content:
 * they only report problems, which the application turns into severe findings
 * or rejections and feeds into the existing repair loops.
 *
 * - monthly_answer_verification: the model solves every choice item WITHOUT
 *   seeing the key and lists every option it accepts as correct, so a wrong
 *   key (A1 "The slides ____" keyed "isn't") or a second correct option (B1
 *   "When we were discussing…" next to the "While…" key) is caught. For an item
 *   labelled as a recall of an earlier grammar step it also says whether the
 *   item really tests that step.
 * - monthly_word_verification: real-word, British-RP and relation check for a
 *   short list of generated words (pronunciation examples, synonyms).
 */

function decoded(value: unknown): unknown {
  if (typeof value !== "string") return value;
  try { return JSON.parse(value); } catch { return value; }
}

export const monthlyAnswerVerificationOutputJsonSchema = {
  type: "object", additionalProperties: false, required: ["items"],
  properties: {
    items: {
      type: "array",
      description: "One entry per input item, same ref, in input order.",
      items: {
        type: "object", additionalProperties: false, required: ["ref", "correctOptions", "note"],
        properties: {
          ref: { type: "string", description: "the item ref, unchanged" },
          correctOptions: {
            type: "array", items: { type: "string" },
            description: "EVERY option (copied exactly) that a careful English teacher would mark fully correct: grammatical, natural, the right voice and tense, and the meaning fits the sentence, passage or question. Empty when no option is correct."
          },
          testsLabelledPoint: { type: "boolean", description: "only for items with mustTest: true when choosing the correct option really requires the grammar point named in mustTest" },
          note: { type: "string", description: "one short English sentence: why the correct option(s) fit, or what is wrong" }
        }
      }
    }
  }
} satisfies Record<string, unknown>;

export const monthlyAnswerVerificationOutputSchema = z.preprocess((value) => {
  const output = decoded(value);
  if (!output || typeof output !== "object" || Array.isArray(output)) return output;
  const items = decoded((output as Record<string, unknown>).items);
  return { items: Array.isArray(items) ? items.map(decoded) : items };
}, z.object({
  items: z.array(z.object({
    ref: z.string().trim().min(1).max(200),
    correctOptions: z.array(z.string().max(400)).max(8),
    testsLabelledPoint: z.boolean().optional(),
    note: z.string().max(600).default("")
  })).max(120)
}));
export type MonthlyAnswerVerificationTaskOutput = z.infer<typeof monthlyAnswerVerificationOutputSchema>;

export const MONTHLY_WORD_VERIFICATION_PROBLEMS = ["not_a_real_word", "american_ipa", "wrong_ipa", "not_a_synonym", "not_an_antonym"] as const;
export type MonthlyWordVerificationProblem = (typeof MONTHLY_WORD_VERIFICATION_PROBLEMS)[number];

export const monthlyWordVerificationOutputJsonSchema = {
  type: "object", additionalProperties: false, required: ["problems"],
  properties: {
    problems: {
      type: "array",
      description: "Only the input entries with a real problem; an empty array when every entry is fine.",
      items: {
        type: "object", additionalProperties: false, required: ["ref", "problem", "reason"],
        properties: {
          ref: { type: "string", description: "the entry ref, unchanged" },
          problem: { type: "string", enum: [...MONTHLY_WORD_VERIFICATION_PROBLEMS] },
          reason: { type: "string", description: "one short English sentence, with the correct British IPA when the problem is the IPA" }
        }
      }
    }
  }
} satisfies Record<string, unknown>;

export const monthlyWordVerificationOutputSchema = z.preprocess((value) => {
  const output = decoded(value);
  if (!output || typeof output !== "object" || Array.isArray(output)) return output;
  const problems = decoded((output as Record<string, unknown>).problems);
  return { problems: Array.isArray(problems) ? problems.map(decoded) : problems };
}, z.object({
  problems: z.array(z.object({
    ref: z.string().trim().min(1).max(200),
    problem: z.enum(MONTHLY_WORD_VERIFICATION_PROBLEMS),
    reason: z.string().max(400).default("")
  })).max(120)
}));
export type MonthlyWordVerificationTaskOutput = z.infer<typeof monthlyWordVerificationOutputSchema>;
