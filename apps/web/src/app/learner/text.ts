export function normalizeBlankPrompt(value: string | undefined): string {
  return (value ?? "")
    .replace(/(?:[-_]\s*){3,}/gu, "_____ ")
    .replace(/_____\s+([,.;!?])/gu, "_____$1")
    .replace(/\s{2,}/gu, " ")
    .trim();
}

export function normalizeLessonBlankPrompt(value: string | undefined): string {
  return normalizeBlankPrompt(value);
}
