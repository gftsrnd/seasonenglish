import {z} from "zod";
import type {AiValidationIssue} from "./types.js";
const key=z.enum(["writing.gaMain","writing.gaSecondary","writing.gbMain","writing.gbSecondary","speakingB.gaMain","speakingB.gbMain"]);
export const monthlyFinalGrammarReviewInputSchema = z.object({
  items: z.array(z.object({
    key,
    grammar: z.object({ focus: z.string(), formula: z.string(), usage: z.string() }),
    quote: z.string(),
    sample: z.string().optional(),
    facts: z.string().optional()
  })).min(1).max(6)
});
export const monthlyFinalGrammarReviewOutputSchema = z.object({
  items: z.array(z.object({
    key,
    reason: z.string().transform(reason => reason.slice(0, 400)),
    matches: z.boolean()
  })).min(1).max(6)
});
export const monthlyFinalGrammarReviewJsonSchema = {
  type: "object", additionalProperties: false, required: ["items"],
  properties: { items: { type: "array", items: {
    type: "object", additionalProperties: false, required: ["key", "reason", "matches"],
    properties: {
      key: { type: "string", enum: key.options },
      reason: { type: "string", description: "One short sentence naming the relevant construction or the error." },
      matches: { type: "boolean", description: "True exactly when the quote is grammatical and demonstrates the supplied form." }
    }
  } } }
};
/** A negative judgement is a valid review, never a schema-repair instruction to change it to true. */
export function validateMonthlyFinalGrammarReview(output:z.infer<typeof monthlyFinalGrammarReviewOutputSchema>,input:z.infer<typeof monthlyFinalGrammarReviewInputSchema>):AiValidationIssue[]{
 const expected=input.items.map(item=>item.key).sort(),actual=output.items.map(item=>item.key).sort();
 return JSON.stringify(expected) === JSON.stringify(actual)
   ? []
   : [{path:"items",message:"Review each supplied evidence key exactly once, with no added or missing keys."}];
}
