export function normalizeBlankPrompt(value: string): string {
  return value
    .replace(/(?:-\s*){3,}/gu, "------ ")
    .replace(/(?:_\s*){3,}/gu, "------ ")
    .replace(/------\s+([,.;!?])/gu, "------$1")
    .replace(/\s{2,}/gu, " ")
    .trim();
}
