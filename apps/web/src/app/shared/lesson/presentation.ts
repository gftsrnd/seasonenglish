import { containsVietnameseLearnerText } from "@e4s/domain/content";
import { learnerLessonLanguageForCefr, type LearnerLessonLanguage } from "./language.js";

export function conciseLessonObjective(value: string | undefined): string {
  const normalized = value?.replace(/\s+/g, " ").trim() ?? "";
  if (!normalized) return "—";
  const firstSentence = normalized.match(/^.*?[.!?](?:\s|$)/)?.[0]?.trim() ?? normalized;
  const concise = firstSentence
    .replace(/^Sau bài học,\s*(?:bạn|học viên)\s*có thể\s*/i, "")
    .replace(/^Sau bài này,\s*(?:bạn|học viên)\s*có thể\s*/i, "")
    .replace(/\s+để nói về một bản báo cáo hoặc công việc của đồng nghiệp/iu, " để nhận xét công việc")
    .trim();
  return concise ? concise.charAt(0).toLocaleUpperCase("vi") + concise.slice(1) : firstSentence;
}
export function learnerFacingObjectiveBody(value: string): string {
  const body = value
    .replace(/^SWBAT\s+/i, "")
    .replace(/^(?:Sau bài học,\s*(?:bạn|học viên)\s*có thể\s*)+/iu, "")
    .replace(/^(?:By the end of this lesson,\s*you will be able to\s*)+/i, "")
    // Internal roadmap step labels ("Step B1 (Identify): …") are not learner copy.
    .replace(/^Step\s+[A-Z]?\d+[A-Za-z]?\s*(?:\([^)]*\))?\s*:\s*/u, "")
    .trim();
  if (!body) return "—";
  return body.charAt(0).toLocaleUpperCase("en-US") + body.slice(1);
}
/**
 * A can-do objective is a phrase such as "Explain a delivery delay to a client".
 * Some stored monthly lessons put the day's core words in objective.items
 * (["partner", "discuss", "agree"]); those are not objectives and must never
 * be listed under "By the end of this lesson, you will be able to:".
 */
export function isLearnerObjectiveStatement(value: string): boolean {
  const body = learnerFacingObjectiveBody(value);
  if (body === "—") return false;
  const words = body.match(/[\p{L}\p{N}][\p{L}\p{N}'’/+-]*/gu) ?? [];
  return words.length >= 3;
}

/**
 * Objective item texts worth listing (plain strings from monthly lessons, or
 * { text } records from weekly lessons). `keep` can drop records by type.
 * Bare words, headings and vocabulary cards ({ word }) are left out, so a
 * lesson whose items hold only those falls back to the objective text.
 */
export function learnerObjectiveStatements(items: unknown, keep: (item: Record<string, unknown>) => boolean = () => true): string[] {
  if (!Array.isArray(items)) return [];
  return items.flatMap((item) => {
    const text = typeof item === "string" ? item
      : item && typeof item === "object" && !Array.isArray(item) && typeof (item as Record<string, unknown>).text === "string" && keep(item as Record<string, unknown>)
        ? (item as Record<string, unknown>).text as string : "";
    const trimmed = text.trim();
    return trimmed && isLearnerObjectiveStatement(trimmed) ? [trimmed] : [];
  });
}

export function learnerObjectiveLead(cefr: string): string {
  return learnerLessonLanguageForCefr(cefr) === "vi"
    ? "Sau bài học, bạn có thể:"
    : "By the end of this lesson, you will be able to:";
}

export function learnerFacingObjective(value: string, cefr: string): string {
  const body = learnerFacingObjectiveBody(value);
  if (body === "—") return body;
  const sentence = body.charAt(0).toLocaleLowerCase("en-US") + body.slice(1);
  return learnerLessonLanguageForCefr(cefr) === "vi"
    ? `Sau bài học, bạn có thể ${sentence}`
    : `By the end of this lesson, you will be able to ${sentence}`;
}

export function conciseSpeakingInstruction(value: string | undefined, language: LearnerLessonLanguage = "vi"): string {
  const normalized = value?.replace(/\s+/g, " ").trim() ?? "";
  if (language === "en") {
    if (!normalized || containsVietnameseLearnerText(normalized)) {
      return "Follow the model sentence below and change one detail to fit your situation.";
    }
    if (/\b(?:positive|good point|could be better|colleague|feedback|report)\b/i.test(normalized)) {
      return "Mention one strength at work, then give one polite suggestion for improvement.";
    }
    return normalized.match(/^.*?[.!?](?:\s|$)/u)?.[0]?.trim() ?? normalized;
  }
  if (/\b(?:positive|good point|could be better|colleague|feedback|report)\b/i.test(normalized)) {
    return "Nói một điểm tốt về công việc. Sau đó góp ý một điểm cần cải thiện thật lịch sự.";
  }
  if (/^(?:nói|đọc|nghe|viết|hãy|chọn|điền)\b/iu.test(normalized) || /[ăâđêôơưàáạảãèéẹẻẽìíịỉĩòóọỏõùúụủũỳýỵỷỹ]/iu.test(normalized)) {
    return normalized.match(/^.*?[.!?](?:\s|$)/u)?.[0]?.trim() ?? normalized;
  }
  return "Nói theo câu mẫu bên dưới và thay đổi một chi tiết cho phù hợp.";
}

export function conciseSpeakingModel(value: string | undefined): string {
  const normalized = value?.replace(/\s+/g, " ").trim() ?? "";
  if (!normalized) return "—";
  return normalized.match(/^.*?[.!?](?:\s|$)/u)?.[0]?.trim() ?? normalized;
}

export function conciseGrammarExample(value: string | undefined): string {
  const normalized = value?.replace(/\s+/g, " ").trim() ?? "";
  return normalized || "—";
}
