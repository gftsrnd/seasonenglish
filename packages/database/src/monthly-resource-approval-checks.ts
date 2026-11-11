import type { CefrLevel } from "@e4s/contracts";
import { monthlyPronunciationExampleIssue, type MonthlyCurriculumContract } from "@e4s/domain";

/**
 * Approval-time re-check of the WP9 resource rules, so a draft that bypassed
 * the generator or manual-edit gates (an older draft, a direct API save) cannot
 * be approved. The example check is the shared, item-type-aware
 * `monthlyPronunciationExampleIssue` (phoneme, confusable pair or roadmap
 * phenomenon; also used by generation and manual edit); these mirror
 * `isVietnameseMonthlyText` and the manual-edit B1/C1 core overlap rule; keep
 * them in step.
 */
type ApprovalContract = Pick<MonthlyCurriculumContract, "cefr" | "coreTerms" | "grammarTopics" | "sounds">;

const VIETNAMESE_ONLY_LETTER = /[ăâđêôơưạảấầẩẫậắằẳẵặẹẻẽếềểễệỉĩịọỏốồổỗộớờởỡợụủũứừửữựỳỵỷỹ]/iu;

export function monthlyResourceApprovalIssues(
  contract: ApprovalContract,
  otherLevels: ReadonlyArray<{ cefr: CefrLevel; coreWords: readonly string[] }> = []
): string[] {
  const issues: string[] = [];
  for (const sound of contract.sounds) {
    for (const example of sound.examples) {
      const issue = monthlyPronunciationExampleIssue(contract.cefr, sound, example);
      if (issue) issues.push(`Sound ${sound.id} example "${example.word}" IPA ${example.ipa} does not contain target ${sound.ipa}: ${issue}.`);
    }
  }
  if (contract.cefr === "B1" || contract.cefr === "B2" || contract.cefr === "C1") {
    for (const topic of contract.grammarTopics) for (const step of topic.steps) {
      if ((step.dailyObjectives ?? []).some((value) => VIETNAMESE_ONLY_LETTER.test(value))) issues.push(`Grammar topic ${topic.id} step ${step.id} dailyObjectives must be in simple English for ${contract.cefr}, not Vietnamese.`);
    }
  }
  const pairedLevel = contract.cefr === "C1" ? "B1" : contract.cefr === "B1" ? "C1" : undefined;
  if (pairedLevel) {
    const paired = new Set(otherLevels.filter((level) => level.cefr === pairedLevel).flatMap((level) => level.coreWords.map(normalizeWord)));
    const shared = contract.coreTerms.filter((term) => paired.has(normalizeWord(term.word))).map((term) => term.word);
    if (shared.length) issues.push(`Core terms shared with ${pairedLevel} of the same month: ${shared.slice(0, 10).join(", ")}${shared.length > 10 ? ` (+${shared.length - 10})` : ""}. ${contract.cefr} and ${pairedLevel} must not share core words.`);
  }
  return issues;
}

function normalizeWord(value: string): string {
  return value.trim().toLocaleLowerCase("en-US");
}
