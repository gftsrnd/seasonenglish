/**
 * Independent real-word / British-IPA check of generated pronunciation examples
 * (December 2026: "ackle /ˈækl/" accepted as an A2 /æ/ example; no dictionary
 * is bundled, so the deterministic gates cannot know every invented word).
 * Flagged examples are rejected and their reasons go back to the generator's
 * next attempt like any other example rejection. A failed check never blocks.
 */
import type { AiTaskRunner } from "@e4s/ai";

export const MONTHLY_WORD_VERIFICATION_PROMPT = [
  "You are an independent British English lexicographer checking generated teaching examples. You did not write them.",
  "For each entry report a problem only when you are sure:",
  "not_a_real_word: the word (or a word in the phrase) is not in a standard English dictionary, or the phrase is not natural English (ackle, colleagueship);",
  "american_ipa: the IPA is General American rather than British RP (rhotic r as in /hɑːrd/, /oʊ/, /ɑː/ for the LOT vowel as in /ˈprɑːdʒekt/, /æ/ in BATH words such as last, missing /j/ in new /nuː/);",
  "wrong_ipa: the IPA does not match the word at all or is malformed (missing words of the phrase, impossible sounds).",
  "Return problems: [] when every entry is fine. reason: one short English sentence, with the correct British IPA when the IPA is the problem."
].join("\n");

export interface MonthlyWordEntry { word: string; ipa: string; role: string }

/** Problems by index of `entries` (word -> reason); an empty map when all are fine or the check failed. */
export async function verifyMonthlyWords(runner: AiTaskRunner, cefr: string, entries: readonly MonthlyWordEntry[]): Promise<Map<number, string>> {
  const flagged = new Map<number, string>();
  if (!entries.length) return flagged;
  try {
    const result = await runner.runTask("monthly_word_verification", {
      cefr,
      entries: entries.map((entry, index) => ({ ref: `w${index + 1}`, word: entry.word, ipa: entry.ipa, role: entry.role }))
    }, { systemPrompt: MONTHLY_WORD_VERIFICATION_PROMPT, maxOutputTokens: 2_000, temperature: 0, maxAttempts: 2 });
    const problems = (result.output as { problems?: unknown }).problems;
    for (const problem of Array.isArray(problems) ? problems : []) {
      if (!problem || typeof problem !== "object") continue;
      const { ref, problem: kind, reason } = problem as { ref?: unknown; problem?: unknown; reason?: unknown };
      const index = typeof ref === "string" ? Number(ref.replace(/^w/u, "")) - 1 : -1;
      if (index < 0 || index >= entries.length || typeof kind !== "string") continue;
      flagged.set(index, `${kind.replace(/_/gu, " ")}${typeof reason === "string" && reason.trim() ? `: ${reason.trim()}` : ""}`);
    }
  } catch {
    return new Map();
  }
  return flagged;
}
