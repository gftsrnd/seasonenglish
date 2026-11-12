/**
 * Word form options must be real forms the learner meets in the lesson or the
 * month plan (December 2026: A2 L3 failed twice with the invented
 * "colleagueship" and then "colleagueing": the invented-form list caught each
 * word, but the repair kept inventing new derivations of a noun that has no
 * family). Without a dictionary, "real" means: a core word or support term of
 * the month, a word on a vocabulary card's family list, or a regular inflection
 * of one of them. An option outside that set that is built on a core word of
 * the lesson (shares its stem) whose core word has no family at all is
 * reported, with the allowed forms listed in the repair message.
 */
import type { MonthlyCurriculumContract, MonthlyDaySpec } from "@e4s/domain";
import type { MonthlyQualityFinding } from "./monthly-quality.js";

type Content = Record<string, unknown>;

const FUNCTION_WORDS = new Set(["a", "an", "the", "is", "are", "was", "were", "am", "be", "been", "being", "has", "have", "had", "will", "would", "do", "does", "did", "to", "not", "more", "most", "very", "can", "could", "should", "must"]);

const IRREGULAR_FORMS: Readonly<Record<string, readonly string[]>> = {
  send: ["sent"], make: ["made"], give: ["gave", "given"], have: ["had"], go: ["went", "gone"], take: ["took", "taken"],
  write: ["wrote", "written"], meet: ["met"], read: ["read"], speak: ["spoke", "spoken"], tell: ["told"], say: ["said"],
  find: ["found"], get: ["got", "gotten"], know: ["knew", "known"], see: ["saw", "seen"], come: ["came"], do: ["did", "done"],
  lead: ["led"], leave: ["left"], run: ["ran"], spend: ["spent"], teach: ["taught"], buy: ["bought"], bring: ["brought"],
  think: ["thought"], build: ["built"], keep: ["kept"], hold: ["held"], sell: ["sold"], pay: ["paid"], begin: ["began", "begun"],
  choose: ["chose", "chosen"], feel: ["felt"], put: ["put"], set: ["set"], break: ["broke", "broken"], understand: ["understood"],
  forget: ["forgot", "forgotten"], grow: ["grew", "grown"], draw: ["drew", "drawn"], win: ["won"], lose: ["lost"], mean: ["meant"]
};

/** Regular inflections (and the -ly / comparative forms of adjectives) of a word. */
export function monthlyRegularForms(word: string, type = ""): string[] {
  const base = word.trim().toLocaleLowerCase("en-US");
  if (!/^[a-z]+$/u.test(base)) return [base];
  const forms = new Set<string>([base, ...(IRREGULAR_FORMS[base] ?? [])]);
  const consonantY = /[^aeiou]y$/u.test(base);
  forms.add(/(?:s|x|z|ch|sh)$/u.test(base) ? `${base}es` : consonantY ? `${base.slice(0, -1)}ies` : `${base}s`);
  // Regular -s/-ed/-ing forms are always accepted: invented ones of noun-only words (feedbacked, colleagueing) are caught by inventedWordForms.
  {
    const stem = base.endsWith("e") ? base.slice(0, -1) : base;
    forms.add(base.endsWith("e") ? `${base}d` : consonantY ? `${base.slice(0, -1)}ied` : `${base}ed`);
    forms.add(`${stem}ing`);
    if (/[^aeiou][aeiou][bdgklmnprt]$/u.test(base)) { forms.add(`${base}${base.at(-1)}ed`); forms.add(`${base}${base.at(-1)}ing`); }
  }
  if (/adjective/iu.test(type)) {
    forms.add(consonantY ? `${base.slice(0, -1)}ily` : base.endsWith("le") ? `${base.slice(0, -1)}y` : base.endsWith("ic") ? `${base}ally` : `${base}ly`);
    forms.add(base.endsWith("e") ? `${base}r` : consonantY ? `${base.slice(0, -1)}ier` : `${base}er`);
    forms.add(base.endsWith("e") ? `${base}st` : consonantY ? `${base.slice(0, -1)}iest` : `${base}est`);
  }
  return [...forms];
}

function text(value: unknown): string { return typeof value === "string" ? value.trim() : ""; }
function isRecord(value: unknown): value is Content { return Boolean(value) && typeof value === "object" && !Array.isArray(value); }
function lower(value: string): string { return value.trim().toLocaleLowerCase("en-US"); }

function commonPrefix(a: string, b: string): number {
  let index = 0;
  while (index < a.length && index < b.length && a[index] === b[index]) index += 1;
  return index;
}

/** The core word of the lesson an option is built on (shares its stem), or undefined. */
function stemOwner(token: string, cores: ReadonlyArray<{ word: string }>): string | undefined {
  return cores.find((core) => {
    const word = lower(core.word);
    if (!/^[a-z]+$/u.test(word) || word.length < 4) return false;
    const stem = word.replace(/(?:e|y)$/u, "");
    return token !== word && token.startsWith(stem) && commonPrefix(token, word) >= Math.max(4, stem.length);
  })?.word;
}

/**
 * Word form (word_class) options built on a lesson's core word must be forms
 * the lesson or plan teaches. Applies to daily lessons and Friday reviews.
 */
export function monthlyWordFormScopeFindings(contract: MonthlyCurriculumContract, day: MonthlyDaySpec, dayNumber: number, parts: ReadonlyArray<{ code: string; content: Content }>): MonthlyQualityFinding[] {
  const part = parts.find((candidate) => candidate.code === "word_class");
  // Friday reviews already restrict Word form to planned family words (monthlyReviewWordFormCandidates).
  if (!part || day.kind !== "new") return [];
  const dayCoreIds = new Set(day.kind === "new" ? day.coreTermIds : day.reviewTermIds ?? []);
  const cores = contract.coreTerms.filter((term) => dayCoreIds.has(term.id));
  const allowed = new Set<string>();
  const familyOf = new Map<string, Set<string>>();
  const addForms = (word: string, type: string, owner?: string) => {
    for (const form of monthlyRegularForms(word, type)) {
      allowed.add(form);
      if (owner) familyOf.set(owner, (familyOf.get(owner) ?? new Set()).add(form));
    }
  };
  for (const term of contract.coreTerms) addForms(term.word, term.type, term.word);
  for (const term of contract.supportTerms) {
    const owner = contract.coreTerms.find((core) => core.id === term.relatedCoreTermId)?.word;
    if (/^[a-z-]+$/iu.test(term.word.trim())) addForms(term.word, term.type ?? "", term.relation === "word_family" ? owner : undefined);
  }
  const vocabulary = parts.find((candidate) => candidate.code === "vocabulary")?.content;
  for (const card of Array.isArray(vocabulary?.items) ? vocabulary.items.filter(isRecord) : []) {
    const owner = text(card.word);
    for (const member of Array.isArray(card.family) ? card.family : []) {
      const word = isRecord(member) ? text(member.word) : text(member);
      if (word && /^[a-z-]+$/iu.test(word)) addForms(word, isRecord(member) ? text(member.type) : "", owner || undefined);
    }
  }
  const choices: Array<{ label: string; options: string[] }> = [];
  const pushChoice = (label: string, raw: Content) => {
    const options = Array.isArray(raw.options) ? raw.options.filter((option): option is string => typeof option === "string") : [];
    if (options.length) choices.push({ label, options });
  };
  const items = Array.isArray(part.content.items) ? part.content.items.filter(isRecord) : [];
  if (!items.length) pushChoice("word_class", part.content);
  items.forEach((item, index) => {
    pushChoice(`word_class item ${index + 1}`, item);
    (Array.isArray(item.variants) ? item.variants.filter(isRecord) : []).forEach((variant, variantIndex) => pushChoice(`word_class item ${index + 1} variant ${variantIndex + 1}`, variant));
  });
  const problems: string[] = [];
  const owners = new Set<string>();
  for (const choice of choices) {
    const outside = new Set<string>();
    for (const option of choice.options) {
      for (const token of option.toLocaleLowerCase("en-US").match(/[a-z]+/gu) ?? []) {
        if (FUNCTION_WORDS.has(token) || allowed.has(token)) continue;
        const owner = stemOwner(token, cores);
        // Only a core word without any family list is judged: its derivations are the invented ones (colleagueship).
        if (!owner || [...(familyOf.get(owner) ?? [])].some((form) => !monthlyRegularForms(owner).includes(form))) continue;
        outside.add(token);
        owners.add(owner);
      }
    }
    if (outside.size) problems.push(`${choice.label} (${[...outside].join(", ")})`);
  }
  if (!problems.length) return [];
  const forms = [...owners].map((owner) => `${owner}: ${[...(familyOf.get(owner) ?? new Set([lower(owner)]))].join(", ")}`).join("; ");
  return [{
    severity: "severe",
    code: "MONTHLY_WORD_FORM_OUTSIDE_LESSON",
    message: `Word form options must be real forms the learner meets in this lesson or the month plan (the vocabulary card's family list, the plan's word family, or regular -s/-ed/-ing forms of a verb); these are not and may be invented: ${problems.join("; ")}. Allowed forms of those words: ${forms}. If a week word has no real family (a noun such as colleague, feedback or deadline), build the Word form item on another week word: a verb or a word with a family list`,
    dayNumber,
    component: "word_class"
  }];
}
