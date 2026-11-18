import { z } from "zod";

/** The highest per-answer combo multiplier a game client may report. */
export const MAX_GAME_COMBO = 5;

const answer = z.object({
  wordId: z.string().min(1), answer: z.string().max(200), attempts: z.number().int().min(1).max(20).optional(),
  // Legacy field: the shared 0–100 rule computes the streak on the server and ignores it.
  usedHint: z.boolean().optional(), combo: z.number().int().min(1).max(MAX_GAME_COMBO).optional(),
  // Active gameplay time on this unit. Any number is accepted; the server only uses a plausible total.
  ms: z.number().min(0).max(86_400_000).optional()
});
const gameEvent = z.object({
  type: z.enum(["wrong_catch", "timeout"]), wordId: z.string().min(1), answer: z.string().max(200)
});
export const gameResultInput = z.object({
  requestId: z.uuid(), hintsUsed: z.number().int().min(0).max(100).optional(),
  attemptSeed: z.number().int().min(0).max(10_000).optional(),
  answers: z.array(answer).min(1).max(30), events: z.array(gameEvent).max(60).optional()
});

/**
 * Keeps the stable INVALID_GAME_RESULT code but says which field was rejected,
 * so a client bug (for example an unclamped combo) is diagnosable from the response.
 */
export function gameResultValidationError(error: z.ZodError) {
  const issues = error.issues.slice(0, 5).map((issue) => ({ path: issue.path.map(String).join("."), message: issue.message }));
  const first = issues[0];
  const comboIssue = error.issues.some((issue) => issue.path[issue.path.length - 1] === "combo");
  const message = comboIssue
    ? `answers[].combo must be an integer from 1 to ${MAX_GAME_COMBO}.`
    : first ? `Invalid game result at ${first.path || "body"}: ${first.message}` : "Invalid game result.";
  return { code: "INVALID_GAME_RESULT" as const, message, issues };
}
