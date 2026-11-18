import { z } from "zod";

const requiredText = z.string().trim().min(1).max(16_000);
export const assessmentBankGroupOutput = z.object({
  title: requiredText,
  instruction: requiredText,
  text: z.string().max(25_000),
  lines: z.array(z.object({ speaker: requiredText, text: requiredText })).max(80),
  headers: z.array(requiredText).max(20),
  rows: z.array(z.array(requiredText).max(20)).max(40),
  tasks: z
    .array(
      z.object({
        key: requiredText,
        prompt: requiredText,
        options: z.array(requiredText).max(4),
        correctIndex: z.number().int().min(-1).max(3),
      }),
    )
    .min(1)
    .max(40),
});
