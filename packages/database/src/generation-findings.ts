import type { ContentGenerationFindingView } from "@e4s/contracts";

const COMPONENTS = new Set(["plan", "grammarClassification", "objectives", "foundation", "vocabulary", "skills", "skills.comprehension", "skills.languagePractice", "skills.speaking", "skills.reviewer"]);
const ACTIONS = new Set(["regenerate_plan", "regenerate_component"]);

function record(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : undefined;
}

export function generationFindingsFromPayload(payload: unknown): ContentGenerationFindingView[] {
  const root = record(payload);
  const generation = record(root?.generation);
  const output = record(generation?.output);
  const findings = Array.isArray(output?.findings) ? output.findings : [];
  return findings.flatMap((value) => {
    const item = record(value);
    const dayNumber = item?.dayNumber;
    if (!item
      || !(dayNumber === null || (typeof dayNumber === "number" && Number.isInteger(dayNumber) && dayNumber >= 1 && dayNumber <= 5))
      || typeof item.component !== "string" || !COMPONENTS.has(item.component)
      || typeof item.code !== "string" || !item.code.trim()
      || (item.severity !== "warning" && item.severity !== "error")
      || typeof item.message !== "string" || !item.message.trim()
      || typeof item.repairAction !== "string" || !ACTIONS.has(item.repairAction)) return [];
    return [{
      dayNumber,
      component: item.component as ContentGenerationFindingView["component"],
      code: item.code,
      severity: item.severity,
      message: item.message,
      issues: Array.isArray(item.issues) ? item.issues : [],
      repairAction: item.repairAction as ContentGenerationFindingView["repairAction"]
    }];
  });
}
