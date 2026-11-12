import { MONTHLY_GRAMMAR_EXAMPLE_TRANSLATION_MAX_CHARS, MONTHLY_GRAMMAR_STAGE_GUIDE, monthlyGrammarExampleTranslationIssues, type MonthlyDaySpec } from "@e4s/domain";
import type { CefrLevel } from "@e4s/contracts";

/**
 * Daily-lesson rules of the grammar roadmap (docs/grammar-roadmap.md, "Hướng
 * dẫn cho AI khi sinh nội dung"). They apply only to roadmap months, i.e. days
 * whose locked grammar plan carries a roadmap `stage`; older months keep the
 * existing contract and gates unchanged.
 */

/** Roadmap explanation limit (grammar.text): at most 60 words. */
export const MONTHLY_GRAMMAR_EXPLANATION_MAX_WORDS = 60;

const VIETNAMESE_LETTER = /[ăâđêôơưạảấầẩẫậắằẳẵặẹẻẽếềểễệỉĩịọỏốồổỗộớờởỡợụủũứừửữựỳỵỷỹàáèéìíòóùúýÀÁÈÉÌÍÒÓÙÚÝ]/iu;

/** Extra prompt lines for a roadmap day (empty for older months). */
export function monthlyGrammarRoadmapDayContract(day: MonthlyDaySpec, cefr: string): string {
  const stage = day.grammarPlan?.stage;
  if (!stage) return "";
  const guide = MONTHLY_GRAMMAR_STAGE_GUIDE[stage];
  const vietnamese = cefr === "A1" || cefr === "A2";
  return [
    `GRAMMAR ROADMAP DAY ${day.grammarPlan?.code} (${guide.en}): teach exactly ONE small idea, the locked objective, in 3–4 minutes. Exercise type for this step: ${guide.exercise}. Support level: ${guide.support}.`,
    `grammar.text is the explanation: at most ${MONTHLY_GRAMMAR_EXPLANATION_MAX_WORDS} words, with the formula when there is one, written in ${vietnamese ? "Vietnamese" : "simple English: short sentences, vocabulary one level below the month's level, and no structure harder than the one being taught"}; grammar terms use their common English names (present perfect, passive…).`,
    `grammar.examples are workplace sentences that use today's core words first (another word only when a core word cannot go naturally with the structure). Each grammar.items explanation is one line in the same language as grammar.text, and at least one grammar item uses one of today's core words.`,
    vietnamese
      ? `grammar.exampleTranslations: one short natural Vietnamese translation (at most ${MONTHLY_GRAMMAR_EXAMPLE_TRANSLATION_MAX_CHARS} characters) per grammar.examples sentence, in the same order. It is shown as a popup only; the English examples are read aloud, so never put Vietnamese, brackets or a translation inside grammar.examples.`
      : "Do not return grammar.exampleTranslations (no Vietnamese translations from B1); grammar.examples are English only.",
    "Teach nothing outside the month's two grammar topics and grammar the level has already met. Vary the industry (office, sales, IT, marketing, HR, finance); people and companies are fictional."
  ].join("\n");
}

function words(text: string): number {
  return text.trim().split(/\s+/u).filter((token) => /[\p{L}\d]/u.test(token)).length;
}

function asString(value: unknown): string {
  return typeof value === "string" ? value : "";
}

/** Deterministic roadmap findings for a new-lesson grammar part (empty for older months). */
export function monthlyGrammarRoadmapDayIssues(day: MonthlyDaySpec, cefr: string, grammar: Record<string, unknown>, coreWords: readonly string[]): Array<{ code: string; message: string }> {
  if (!day.grammarPlan?.stage) return [];
  const issues: Array<{ code: string; message: string }> = [];
  const text = asString(grammar.text);
  const count = words(text);
  if (count > MONTHLY_GRAMMAR_EXPLANATION_MAX_WORDS) issues.push({ code: "MONTHLY_GRAMMAR_ROADMAP_EXPLANATION_LENGTH", message: `grammar.text (the explanation) must be at most ${MONTHLY_GRAMMAR_EXPLANATION_MAX_WORDS} words (received ${count}); keep one idea and the formula` });
  const vietnamese = cefr === "A1" || cefr === "A2";
  if (text.trim() && vietnamese && !VIETNAMESE_LETTER.test(text)) issues.push({ code: "MONTHLY_GRAMMAR_ROADMAP_EXPLANATION_LANGUAGE", message: `grammar.text must explain in Vietnamese at ${cefr}` });
  if (text.trim() && !vietnamese && VIETNAMESE_LETTER.test(text)) issues.push({ code: "MONTHLY_GRAMMAR_ROADMAP_EXPLANATION_LANGUAGE", message: `grammar.text must explain in simple English at ${cefr}, without Vietnamese` });
  const examples = Array.isArray(grammar.examples) ? grammar.examples : [];
  for (const message of monthlyGrammarExampleTranslationIssues(cefr as CefrLevel, examples, grammar.exampleTranslations)) issues.push({ code: "MONTHLY_GRAMMAR_ROADMAP_EXAMPLE_TRANSLATION", message });
  const items = Array.isArray(grammar.items) ? grammar.items.filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === "object" && !Array.isArray(item)) : [];
  const lowered = coreWords.map((word) => word.toLocaleLowerCase("en-US")).filter(Boolean);
  const itemText = (item: Record<string, unknown>) => ` ${[asString(item.prompt), asString(item.answer), ...(Array.isArray(item.options) ? item.options.map(asString) : [])].join(" ").toLocaleLowerCase("en-US")} `;
  if (items.length && lowered.length && !items.some((item) => lowered.some((word) => itemText(item).includes(word)))) {
    issues.push({ code: "MONTHLY_GRAMMAR_ROADMAP_ITEM_CORE_WORD", message: `At least one grammar item must use one of today's core words (${coreWords.join(", ")})` });
  }
  return issues;
}
