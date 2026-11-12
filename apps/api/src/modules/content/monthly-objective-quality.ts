import { containsVietnameseLearnerText } from "@e4s/domain/content";

/**
 * 12/11: monthly lessons render objective.items as the bullet list under
 * "By the end of this lesson, you will be able to:" / "Sau bài học, bạn có thể:".
 * The AI sometimes filled items with the day's core words (["partner",
 * "discuss", "agree"]) or vocabulary cards, so learners saw bare words instead
 * of objectives. These checks are severe and feed the normal repair loop.
 */
const MIN_STATEMENTS = 2;
const MAX_STATEMENTS = 3;
const MIN_WORDS = 4;
const STEP_LABEL = /^Step\s+[A-Z]?\d+[A-Za-z]?\s*(?:\([^)]*\))?\s*:/u;
const LEAD = /^(?:SWBAT\s+|Sau bài (?:học|này),\s*(?:bạn|học viên)\s*có thể\s*|By the end of this lesson,\s*you will be able to\s*)/iu;

export function monthlyObjectiveIssues(cefr: string, content: Record<string, unknown> | undefined, lessonWords: readonly string[]): string[] {
  // A missing objective part is already reported as MONTHLY_COMPONENT_MISSING.
  if (!content) return [];
  const issues: string[] = [];
  const vietnamese = cefr === "A1" || cefr === "A2";
  const words = new Set(lessonWords.map(normalize).filter(Boolean));
  const text = typeof content.text === "string" ? content.text.trim() : "";
  if (STEP_LABEL.test(text)) issues.push("objective.text starts with an internal step label (\"Step …:\"); write it as learner copy");
  const items = Array.isArray(content.items) ? content.items : [];
  if (items.length < MIN_STATEMENTS || items.length > MAX_STATEMENTS) {
    issues.push(`objective.items must hold ${MIN_STATEMENTS}-${MAX_STATEMENTS} can-do statements; it has ${items.length}`);
  }
  items.forEach((item, index) => {
    const label = `objective.items[${index}]`;
    const statement = typeof item === "string" ? item.trim()
      : item && typeof item === "object" && typeof (item as Record<string, unknown>).text === "string" ? ((item as Record<string, unknown>).text as string).trim() : "";
    if (!statement) {
      issues.push(`${label} is not a can-do statement (vocabulary cards and empty items do not belong in the objective)`);
      return;
    }
    const body = statement.replace(LEAD, "").trim();
    const tokens = body.match(/[\p{L}\p{N}][\p{L}\p{N}'’/+-]*/gu) ?? [];
    if (tokens.length < MIN_WORDS || words.has(normalize(body.replace(/[.!?]+$/u, "")))) {
      issues.push(`${label} "${statement}" is a word or heading, not a can-do statement`);
      return;
    }
    if (STEP_LABEL.test(body)) issues.push(`${label} starts with an internal step label`);
    if (vietnamese && !containsVietnameseLearnerText(body)) issues.push(`${label} must be written in Vietnamese for ${cefr}`);
    if (!vietnamese && containsVietnameseLearnerText(body)) issues.push(`${label} must be written in English for ${cefr}`);
  });
  return issues;
}

export function monthlyObjectiveFixHint(cefr: string): string {
  return cefr === "A1" || cefr === "A2"
    ? "Set objective.items to 2-3 short Vietnamese can-do statements, each an action verb phrase plus a workplace context (e.g. \"Xác nhận thời gian giao hàng với khách hàng.\"); never list the core words as items"
    : "Set objective.items to 2-3 short English can-do statements, each an action verb phrase plus a workplace context (e.g. \"Explain a delivery delay to a client.\"); never list the core words as items";
}

function normalize(value: string): string {
  return value.trim().toLocaleLowerCase("en-US");
}
