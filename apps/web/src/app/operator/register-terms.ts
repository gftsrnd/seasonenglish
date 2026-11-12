/** Operator (Vietnamese UI) labels for a core's slang / poetic synonyms (L-042, 12/11). */
export interface OperatorRegisterTerm { kind: "slang" | "poetic"; word: string; definition: string; ipa?: string | undefined; usage?: string | undefined; source?: string | undefined }

/** Items stored before 12/11 have no IPA / usage / source; their "poetic" meant formal register ("Văn phong"). */
export function isLegacyOperatorRegisterTerm(term: OperatorRegisterTerm): boolean {
  return !term.ipa?.trim() && !term.usage?.trim() && !term.source?.trim();
}

export function operatorRegisterKindLabel(term: OperatorRegisterTerm): string {
  if (term.kind === "slang") return "Khẩu ngữ";
  return isLegacyOperatorRegisterTerm(term) ? "Văn phong" : "Văn chương";
}

/** Read-only note shown next to the definition: usage (slang) or source (poetic). */
export function operatorRegisterNote(term: OperatorRegisterTerm): string {
  return (term.kind === "slang" ? term.usage : term.source)?.trim() ?? "";
}
