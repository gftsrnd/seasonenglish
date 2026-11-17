/**
 * Answer-key checks for monthly lessons and Friday reviews (December 2026
 * evaluation, docs/ai-quality-december-2026.md §3–4). Approved lessons still
 * had a wrong key or two correct options:
 *   A1 L3 g1  "The slides ____ ready" keyed "isn't" (plural subject: aren't);
 *   A1 L8 g3  "The learning notes are ____ for the team meeting" keyed "my" (mine);
 *   B1 L16 g3 "When I worked in my old company, I ____ the sales results every
 *             Friday" keyed "used to assess" next to "assessed" (both correct);
 *   B1 L8 g2  "While we were discussing…" next to "When we were discussing…";
 *   C1 L4 g2  "The reports ____ all afternoon" keyed "have been reading" (wrong voice);
 *   N7 recall items labelled topic A that test something else (4/5 levels).
 *
 * The deterministic checks below catch the patterns that can be told from the
 * text alone. Everything else goes to an independent AI answer verification
 * (monthly_answer_verification) that solves each item without the key. Both
 * produce severe findings with a repair message, fed into the existing repair
 * rounds of generateMonthlyDay.
 */
import type { MonthlyCurriculumContract, MonthlyDaySpec } from "@e4s/domain";
import type { MonthlyQualityFinding } from "./monthly-quality.js";

type Content = Record<string, unknown>;
type Part = { code: string; content: Content };

const BLANK = /_{2,}|…{1,}|\.{3,}/u;

const SINGULAR_BE = ["is", "isn't", "is not", "was", "wasn't", "was not", "'s"];
const PLURAL_BE = ["are", "aren't", "are not", "were", "weren't", "were not", "'re"];
const FIRST_PERSON_BE = ["am", "am not", "'m", "was", "wasn't", "was not"];

const DETERMINERS = new Set(["the", "our", "my", "your", "his", "her", "their", "its", "this", "that", "these", "those", "a", "an", "each", "every", "all", "both", "some", "many", "several", "two", "three", "four", "five"]);
const SINGULAR_DETERMINERS = new Set(["a", "an", "this", "that", "each", "every"]);
const PLURAL_DETERMINERS = new Set(["these", "those", "many", "several", "both", "two", "three", "four", "five"]);
/** Nouns ending in -s that are singular (news, process, status, business…). */
const SINGULAR_S_NOUNS = new Set(["news", "process", "status", "analysis", "address", "boss", "class", "bus", "series", "success", "access", "progress", "business", "focus", "campus", "bonus", "census", "virus", "basis", "crisis", "thesis", "lens", "physics", "economics", "mathematics", "politics", "glass", "pass", "loss", "gas", "canvas", "atlas", "minus", "plus", "alias", "consensus", "stress", "mess", "dress", "princess", "witness", "fitness", "wellness", "awareness", "happiness", "kindness", "illness", "weakness", "readiness", "openness"]);
const IRREGULAR_PLURALS = new Set(["people", "children", "men", "women", "feet", "teeth", "mice", "criteria", "phenomena"]);
/** British English accepts singular or plural agreement with these: never judged. */
const COLLECTIVE_NOUNS = new Set(["team", "staff", "company", "management", "group", "department", "board", "committee", "family", "government", "crew", "police", "audience", "class", "firm", "office", "panel", "council", "jury", "sales", "data"]);

function normalized(value: string): string {
  return value.normalize("NFKC").replace(/[’‘]/gu, "'").replace(/\s+/gu, " ").trim().toLocaleLowerCase("en-US");
}

function words(value: string): string[] {
  return normalized(value).match(/[a-z]+(?:'[a-z]+)?/gu) ?? [];
}

/** The text of the prompt that holds the blank: after a Vietnamese/English instruction and colon when present. */
function blankSentence(prompt: string): { before: string; after: string } | null {
  const text = prompt.normalize("NFKC").replace(/[’‘]/gu, "'");
  const match = BLANK.exec(text);
  if (!match) return null;
  let before = text.slice(0, match.index);
  const after = text.slice(match.index + match[0].length);
  // Only the clause that contains the blank: drop an instruction ending in ":" or an earlier sentence.
  const cut = Math.max(before.lastIndexOf(":"), before.lastIndexOf(". "), before.lastIndexOf("? "), before.lastIndexOf("! "), before.lastIndexOf("\""), before.lastIndexOf(","));
  if (cut >= 0) before = before.slice(cut + 1);
  return { before, after };
}

type SubjectNumber = "1s" | "2" | "3s" | "pl";

/** Number of the subject directly before the blank, or null when it cannot be told safely. */
function subjectBeforeBlank(before: string): { number: SubjectNumber; text: string } | null {
  const tokens = words(before);
  if (!tokens.length) return null;
  const last = tokens.at(-1)!;
  if (last === "i") return { number: "1s", text: "I" };
  if (last === "you") return { number: "2", text: "you" };
  if (["he", "she", "it"].includes(last)) return { number: "3s", text: last };
  if (["we", "they"].includes(last)) return { number: "pl", text: last };
  // A noun phrase opened by a determiner, at most three words long: "The slides", "Our new developers".
  const start = tokens.slice(-4).findIndex((token) => DETERMINERS.has(token));
  if (start < 0) return null;
  const phrase = tokens.slice(-4).slice(start);
  const determiner = phrase[0]!;
  const head = phrase.at(-1)!;
  if (phrase.length < 2 || DETERMINERS.has(head) || COLLECTIVE_NOUNS.has(head)) return null;
  // "of" phrases (one of the reports, the list of tasks) are not judged.
  if (phrase.includes("of") || phrase.includes("and")) return null;
  const text = phrase.join(" ");
  if (PLURAL_DETERMINERS.has(determiner)) return { number: "pl", text };
  if (IRREGULAR_PLURALS.has(head)) return { number: "pl", text };
  const plural = /[^s'u]s$/u.test(head) && !SINGULAR_S_NOUNS.has(head) && !/(?:ss|us|is)$/u.test(head);
  if (SINGULAR_DETERMINERS.has(determiner)) return plural ? null : { number: "3s", text };
  return plural ? { number: "pl", text } : null;
}

function beForm(value: string): SubjectNumber | null {
  const key = normalized(value).replace(/[.!?]+$/u, "");
  const first = key.split(" ").slice(0, 2).join(" ");
  const single = key.split(" ")[0] ?? "";
  const matches = (forms: readonly string[]) => forms.includes(key) || forms.includes(first) || forms.includes(single);
  if (matches(["am", "am not", "'m"])) return "1s";
  if (matches(["is", "isn't", "is not", "'s"])) return "3s";
  if (matches(["are", "aren't", "are not", "'re", "were", "weren't", "were not"])) return "pl";
  if (matches(["was", "wasn't", "was not"])) return "3s";
  return null;
}

function agrees(subject: SubjectNumber, value: string): boolean {
  const key = normalized(value);
  const first = key.split(" ")[0] ?? "";
  const accepted = subject === "1s" ? FIRST_PERSON_BE : subject === "3s" ? SINGULAR_BE : PLURAL_BE;
  return accepted.some((form) => key === form || key.startsWith(`${form} `) || first === form);
}

// "Her" can stand alone as an object or a predicative personal pronoun.
// The contextual verifier decides between it and "hers".
const POSSESSIVE_DETERMINERS: Readonly<Record<string, string>> = { my: "mine", your: "yours", our: "ours", their: "theirs" };
const POSSESSIVE_PRONOUNS: Readonly<Record<string, string>> = { mine: "my", yours: "your", hers: "her", ours: "our", theirs: "their" };
/** Words that cannot follow a possessive determiner (my ____ for / my today): prepositions, conjunctions, adverbs. */
const NOT_A_NOUN_AFTER = new Set(["for", "to", "at", "in", "on", "with", "from", "by", "about", "and", "but", "or", "so", "because", "now", "today", "tomorrow", "too", "again", "yet", "already", "here", "there", "then", "this", "next", "last", "is", "are", "was", "were", "will", "can", "not", "if", "when", "after", "before", "until", "since"]);
/** Function words that can follow a possessive pronoun in the same clause (mine is / mine and…). */
const AFTER_POSSESSIVE_PRONOUN_OK = new Set([...NOT_A_NOUN_AFTER, "a", "an", "the", "that", "which", "who", "as", "than", "own", "only", "also", "please"]);

/** Simple past (and past participle) of a verb, for the used-to ambiguity check. */
const IRREGULAR_PAST: Readonly<Record<string, string>> = {
  send: "sent", make: "made", give: "gave", have: "had", go: "went", take: "took", write: "wrote", meet: "met", read: "read",
  speak: "spoke", tell: "told", say: "said", find: "found", get: "got", know: "knew", see: "saw", come: "came", do: "did",
  lead: "led", leave: "left", run: "ran", spend: "spent", teach: "taught", buy: "bought", bring: "brought", think: "thought",
  build: "built", keep: "kept", hold: "held", sell: "sold", pay: "paid", begin: "began", choose: "chose", feel: "felt", put: "put", set: "set"
};

function pastOf(verb: string): string[] {
  const irregular = IRREGULAR_PAST[verb];
  if (irregular) return [irregular];
  if (verb.endsWith("e")) return [`${verb}d`];
  if (/[^aeiou]y$/u.test(verb)) return [`${verb.slice(0, -1)}ied`];
  const doubled = /[^aeiou][aeiou][bdgklmnprt]$/u.test(verb) ? [`${verb}${verb.at(-1)}ed`] : [];
  return [`${verb}ed`, ...doubled];
}

const HABIT_MARKERS = /\b(?:every|always|usually|often|sometimes|regularly|each)\b/u;

export interface MonthlyChoice { label: string; prompt: string; options: string[]; answer: string }

/**
 * Deterministic wrong-key / two-correct-options checks for one choice item.
 * Returns repair messages (empty when nothing is wrong or nothing can be told).
 */
export function monthlyAnswerKeyIssues(choice: MonthlyChoice): string[] {
  const issues: string[] = [];
  const answer = choice.answer.trim();
  if (!answer || choice.options.length < 2) return issues;
  const sentence = blankSentence(choice.prompt);
  if (sentence) {
    // 1. be agreement with the subject right before the blank.
    const subject = subjectBeforeBlank(sentence.before);
    const keyForm = beForm(answer);
    if (subject && keyForm && !agrees(subject.number, answer)) {
      const better = choice.options.find((option) => option.trim() !== answer && beForm(option) !== null && agrees(subject.number, option));
      if (better) issues.push(`${choice.label}: the key "${answer}" does not agree with the subject "${subject.text}" (${subject.number === "pl" ? "plural" : subject.number === "1s" ? "I" : subject.number === "2" ? "you" : "singular"}); "${better.trim()}" is the correct option. Fix the answer key and explanation, or rewrite the sentence so the key is right`);
    }
    // 2. possessive determiner vs possessive pronoun.
    const key = normalized(answer);
    const next = words(sentence.after)[0];
    const nextIsEnd = !next || /^\s*[.!?,;:)]/u.test(sentence.after);
    const pronoun = POSSESSIVE_DETERMINERS[key];
    if (pronoun && (nextIsEnd || NOT_A_NOUN_AFTER.has(next!)) && choice.options.some((option) => normalized(option) === pronoun)) {
      issues.push(`${choice.label}: "${answer}" needs a noun after it, but the blank is followed by ${next && !nextIsEnd ? `"${next}"` : "the end of the sentence"}; the possessive pronoun "${pronoun}" is the correct option. Fix the answer key and explanation, or rewrite the sentence`);
    }
    const determiner = POSSESSIVE_PRONOUNS[key];
    if (determiner && next && !nextIsEnd && !AFTER_POSSESSIVE_PRONOUN_OK.has(next) && choice.options.some((option) => normalized(option) === determiner)) {
      issues.push(`${choice.label}: "${answer}" stands alone, but the blank is followed by the noun "${next}"; "${determiner}" is the correct option. Fix the answer key and explanation, or rewrite the sentence`);
    }
  }
  // 3. used to + verb next to the simple past of the same verb: both describe a past habit.
  const lowerOptions = choice.options.map(normalized);
  const keyLower = normalized(answer);
  const usedTo = /^used to ([a-z]+)$/u.exec(keyLower);
  const promptLower = normalized(choice.prompt);
  if (usedTo) {
    const past = pastOf(usedTo[1]!).find((form) => lowerOptions.includes(form));
    if (past) issues.push(`${choice.label}: both "${answer}" and "${past}" are correct for a past habit (the simple past can always describe one); replace the distractor "${past}" or add a contrast with the present (… but now I …) so that only one option fits`);
  } else if (HABIT_MARKERS.test(promptLower)) {
    const option = lowerOptions.find((candidate) => {
      const match = /^used to ([a-z]+)$/u.exec(candidate);
      return match && pastOf(match[1]!).includes(keyLower);
    });
    if (option) issues.push(`${choice.label}: both "${answer}" and "${option}" are correct for a repeated past action; replace the distractor "${option}" or rewrite the sentence so that only one option fits`);
  }
  // 4. The key filled into the blank must not put a document in the active voice ("The reports have been reading").
  const filled = sentence ? `${sentence.before}${answer}${sentence.after}` : BLANK.test(choice.prompt) ? "" : answer;
  const voice = filled ? monthlyWrongVoiceIssue(filled) : undefined;
  if (voice) issues.push(`${choice.label}: ${voice}`);
  return issues;
}

/** Things that cannot read, write or review anything themselves. */
const INANIMATE_SUBJECTS = new Set([
  "report", "reports", "document", "documents", "email", "emails", "letter", "letters", "contract", "contracts", "invoice", "invoices",
  "slide", "slides", "form", "forms", "file", "files", "proposal", "proposals", "agenda", "agendas", "minutes", "note", "notes",
  "budget", "budgets", "plan", "plans", "presentation", "presentations", "message", "messages", "summary", "summaries", "draft", "drafts"
]);
/** Verbs that need a person as the doer: "The reports are reading" is wrong, "The reports are being read" is right. */
const AGENT_VERBS_ING = new Set([
  "reading", "writing", "reviewing", "checking", "preparing", "sending", "approving", "signing", "discussing", "editing", "translating",
  "printing", "analysing", "analyzing", "revising", "submitting", "drafting", "typing", "rewriting", "proofreading", "presenting"
]);

/**
 * Wrong voice: an inanimate subject (report, document, slides…) followed by an
 * active progressive form of a verb that needs a person (reading, writing,
 * reviewing…), e.g. "The reports have been reading all afternoon". Returns the
 * repair message, or undefined.
 */
export function monthlyWrongVoiceIssue(sentence: string): string | undefined {
  const tokens = words(sentence);
  for (let index = 0; index < tokens.length; index += 1) {
    const subject = tokens[index]!;
    if (!INANIMATE_SUBJECTS.has(subject)) continue;
    // Optional auxiliaries between the subject and the -ing form, but never "being" (passive progressive).
    let cursor = index + 1;
    let auxiliaries = 0;
    while (cursor < tokens.length && ["is", "are", "was", "were", "has", "have", "had", "been", "will", "be", "still", "now", "currently"].includes(tokens[cursor]!) && auxiliaries < 4) { cursor += 1; auxiliaries += 1; }
    if (!auxiliaries) continue;
    const verb = tokens[cursor];
    if (verb && AGENT_VERBS_ING.has(verb)) {
      const phrase = tokens.slice(index, cursor + 1).join(" ");
      return `"${phrase}" is the wrong voice: a ${subject.replace(/s$/u, "")} cannot do the ${verb.replace(/ing$/u, "")}ing itself. Use a person as the subject (e.g. "I have been ${verb} the ${subject}") or the passive ("the ${subject} ${/s$/u.test(subject) ? "are" : "is"} being ${verb.replace(/ing$/u, "")}…"), and make sure the key is the only correct option`;
    }
  }
  return undefined;
}

// ---------------------------------------------------------------------------
// N7 recall question: it must test the topic A step it is labelled with.
// ---------------------------------------------------------------------------

/** Closed-class grammar words that identify a structure in a formula (am/is/are, was/were, must have…). */
const GRAMMAR_MARKERS = new Set([
  "am", "is", "are", "was", "were", "be", "been", "being", "isn't", "aren't", "wasn't", "weren't",
  "do", "does", "did", "don't", "doesn't", "didn't", "have", "has", "had", "haven't", "hasn't", "hadn't",
  "will", "won't", "would", "wouldn't", "shall", "should", "shouldn't", "can", "can't", "cannot", "could", "couldn't",
  "may", "might", "must", "mustn't", "need", "used", "going", "me", "my", "mine", "him", "his", "her", "hers", "us",
  "our", "ours", "them", "their", "theirs", "your", "yours", "its", "this", "that", "these", "those", "some", "any",
  "much", "many", "few", "little", "there", "if", "unless", "when", "while", "before", "after", "because", "so", "but",
  "since", "ago", "already", "yet", "just", "ever", "always", "usually", "often", "sometimes", "rarely", "never", "still", "wish", "only", "not", "than", "more", "most",
  "less", "least", "whose", "who", "which", "what", "where", "why", "how", "about", "due", "bound", "likely", "point", "let's"
]);
/** Meta words of formulas and subject pronouns (the subject slot), never markers of a structure. */
const NOT_MARKERS = new Set(["a", "an", "the", "and", "or", "for", "i", "you", "he", "she", "it", "we", "they", "to", "of", "with", "in", "on", "at"]);

function expandContractions(tokens: readonly string[]): string[] {
  return tokens.flatMap((token) => {
    const extra: string[] = [token];
    if (token.endsWith("n't")) extra.push(token === "can't" ? "can" : token === "won't" ? "will" : token.slice(0, -3), "not");
    if (token.endsWith("'m")) extra.push("am");
    if (token.endsWith("'re")) extra.push("are");
    if (token.endsWith("'s")) extra.push("is", "has");
    if (token.endsWith("'ve")) extra.push("have");
    if (token.endsWith("'ll")) extra.push("will");
    if (token.endsWith("'d")) extra.push("would", "had");
    return extra;
  });
}

/** One marker set per formula alternative ("A | B", "A / B" with spaces, "A; B"); null when an alternative has none. */
export function monthlyFormulaMarkerSets(formula: string): Array<{ words: Set<string>; ing: boolean }> | null {
  const alternatives = formula.split(/\s+[|/;]\s+|\s*\|\s*|;\s*/u).map((part) => part.trim()).filter(Boolean);
  const sets = alternatives.map((alternative) => {
    const lower = normalized(alternative);
    const markers = new Set(expandContractions(words(lower.replace(/\//gu, " "))).filter((token) => GRAMMAR_MARKERS.has(token) && !NOT_MARKERS.has(token)));
    return { words: markers, ing: /(?:^|[\s+(-])(?:v-?ing|-ing|verb-ing|ing form)\b/u.test(lower) };
  });
  if (!sets.length || sets.some((set) => !set.words.size && !set.ing)) return null;
  return sets;
}

/**
 * The recall item's key must use the structure of the topic A step it is
 * labelled with: at least one marker word of one formula alternative (am/is/are
 * for "I am / He is…", was/were or an -ing form for "was/were + V-ing", must/can't
 * have for "must have + V3"). Returns the repair message, or undefined when the
 * key fits or the formula has no recognisable markers (then only the AI check applies).
 */
export function monthlyRecallItemIssue(step: { id: string; focus: string; formula: string }, item: { answer: string; prompt: string }, label: string): string | undefined {
  const sets = monthlyFormulaMarkerSets(step.formula);
  if (!sets) return undefined;
  const tokens = new Set(expandContractions(words(item.answer)));
  const ing = [...tokens].some((token) => token.length >= 5 && token.endsWith("ing"));
  const fits = sets.some((set) => [...set.words].some((marker) => tokens.has(marker)) || (set.ing && ing));
  if (fits) return undefined;
  const markers = [...new Set(sets.flatMap((set) => [...set.words, ...(set.ing ? ["V-ing"] : [])]))];
  return `${label} is the topic A recall question (milestoneId ${step.id}) but its answer "${item.answer}" does not use that step's structure "${step.formula}". Rewrite it so the learner must choose the correct topic A form (the answer contains ${markers.slice(0, 8).join("/")}), not a form of today's topic`;
}

// ---------------------------------------------------------------------------
// Collecting the items to check.
// ---------------------------------------------------------------------------

export interface MonthlyVerifiableItem {
  ref: string;
  component: string;
  label: string;
  prompt: string;
  options: string[];
  answer: string;
  /** Reading passage or listening script the question is about. */
  context?: string;
  /** Recall items: the grammar point the item is labelled with. */
  mustTest?: string;
  milestoneId?: string;
  review?: boolean;
}

const VERIFIED_SECTIONS = ["grammar", "word_class", "word_use", "reading", "listening"] as const;

function text(value: unknown): string { return typeof value === "string" ? value.trim() : ""; }
function stringList(value: unknown): string[] { return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string" && Boolean(item.trim())) : []; }
function isRecord(value: unknown): value is Content { return Boolean(value) && typeof value === "object" && !Array.isArray(value); }

/**
 * Every graded choice of the lesson that can be solved from its own text:
 * grammar items, Word form, Word use, reading (with the passage) and daily
 * listening (with the script). Review listening items (hear a word, pick its
 * meaning) and speaking minimal pairs are not included.
 */
export function collectMonthlyVerifiableItems(contract: MonthlyCurriculumContract, day: MonthlyDaySpec, parts: readonly Part[]): MonthlyVerifiableItem[] {
  const result: MonthlyVerifiableItem[] = [];
  const steps = new Map(contract.grammarTopics.flatMap((topic) => topic.steps).map((step) => [step.id, step]));
  const recallIds = new Set(day.kind === "new" ? day.grammarPlan?.recallMilestoneIds ?? [] : []);
  const reviewIds = day.kind === "review" ? day.reviewGrammarStepIds ?? [] : [];
  const add = (component: string, label: string, raw: Content, context?: string, reviewStepId?: string) => {
    const options = stringList(raw.options);
    const answer = text(raw.answer);
    const prompt = text(raw.prompt) || text(raw.question);
    if (options.length < 3 || !answer || !prompt) return;
    const milestoneId = reviewStepId ?? text(raw.milestoneId);
    const step = reviewStepId || recallIds.has(milestoneId) ? steps.get(milestoneId) : undefined;
    result.push({
      ref: `${component}:${result.length + 1}`, component, label, prompt, options, answer,
      ...(context ? { context } : {}),
      ...(step ? { mustTest: `${step.focus} — ${step.formula}`, milestoneId, ...(reviewStepId ? { review: true } : {}) } : {})
    });
  };
  for (const part of parts) {
    if (!(VERIFIED_SECTIONS as readonly string[]).includes(part.code)) continue;
    if (part.code === "listening" && day.kind === "review") continue;
    const content = part.content;
    const context = part.code === "reading" ? text(content.passage) || text(content.text) : part.code === "listening" ? text(content.script) : "";
    const list = Array.isArray(content.items) ? content.items.filter(isRecord) : [];
    if (!list.length) add(part.code, part.code, content, context || undefined);
    list.forEach((item, index) => {
      const itemContext = part.code === "reading" ? text(item.passage) || context : context;
      // The review exercise contract orders the first questions by locked step.
      const reviewStepId = part.code === "grammar" ? reviewIds[index] : undefined;
      add(part.code, `${part.code} item ${index + 1}`, item, itemContext || undefined, reviewStepId);
      (Array.isArray(item.variants) ? item.variants.filter(isRecord) : []).forEach((variant, variantIndex) => add(part.code, `${part.code} item ${index + 1} variant ${variantIndex + 1}`, variant, part.code === "reading" ? text(variant.passage) || itemContext || undefined : itemContext || undefined, reviewStepId));
    });
  }
  return result;
}

function finding(code: string, message: string, dayNumber: number, component: string): MonthlyQualityFinding {
  return { severity: "severe", code, message, dayNumber, component };
}

/**
 * Deterministic answer-key, voice and recall findings for a lesson or review
 * (wired into evaluateMonthlyLessonQuality).
 */
export function monthlyAnswerKeyFindings(contract: MonthlyCurriculumContract, day: MonthlyDaySpec, dayNumber: number, parts: readonly Part[]): MonthlyQualityFinding[] {
  const findings: MonthlyQualityFinding[] = [];
  const byComponent = new Map<string, string[]>();
  const reviewIds = day.kind === "review" ? day.reviewGrammarStepIds ?? [] : [];
  const reviewTopics = contract.grammarTopics.filter((topic) => topic.steps.some((step) => reviewIds.includes(step.id)));
  const simplePresentReview = contract.cefr === "A1" && reviewTopics.length === 1
    && (reviewTopics[0]?.catalogId === "a1-p2-a" || /^(?:present simple|hiện tại đơn)\b/iu.test(reviewTopics[0]?.title ?? ""));
  for (const item of collectMonthlyVerifiableItems(contract, day, parts)) {
    if (item.component === "listening" || item.component === "reading") continue;
    if (simplePresentReview && item.component === "grammar") {
      const sentence = blankSentence(item.prompt);
      const before = normalized(sentence?.before ?? "");
      const futureBeforeBlank = /\b(?:will|will not|won't|[a-z]+'ll)$/u.test(before)
        || /^(?:will|won't)\s+\S+/u.test(before) && !/\b(?:if|unless|when|before|after|once|until|as soon as)\b/u.test(before);
      if (sentence && (futureBeforeBlank || /^(?:will|won't)\b/u.test(normalized(item.answer)))) {
        findings.push(finding("MONTHLY_REVIEW_GRAMMAR_SCOPE", `${item.label}: the blank tests will + verb, outside the locked present simple review. Rewrite it as a present simple question or retry.`, dayNumber, "grammar"));
      }
    }
    const issues = monthlyAnswerKeyIssues(item);
    if (issues.length) byComponent.set(item.component, [...(byComponent.get(item.component) ?? []), ...issues]);
  }
  for (const [component, issues] of byComponent) findings.push(finding("MONTHLY_ANSWER_KEY_WRONG", `Every choice item needs exactly one correct option, and it must be the key. ${issues.join("; ")}`, dayNumber, component));
  // Grammar example sentences must not be in the wrong voice either.
  const grammar = parts.find((part) => part.code === "grammar")?.content;
  const examples = [...stringList(grammar?.examples), ...(Array.isArray(grammar?.steps) ? grammar.steps.filter(isRecord).flatMap((step) => stringList(step.examples)) : [])];
  const voice = examples.map((example) => monthlyWrongVoiceIssue(example)).filter((issue): issue is string => Boolean(issue));
  if (voice.length) findings.push(finding("MONTHLY_GRAMMAR_EXAMPLE_VOICE", `Grammar examples must be correct English: ${voice.join("; ")}`, dayNumber, "grammar"));
  if (day.kind === "new" && day.grammarPlan?.recallMilestoneIds.length && grammar) {
    const steps = new Map(contract.grammarTopics.flatMap((topic) => topic.steps).map((step) => [step.id, step]));
    const items = Array.isArray(grammar.items) ? grammar.items.filter(isRecord) : [];
    const recall = items.map((item, index) => ({ item, index })).filter(({ item }) => day.grammarPlan!.recallMilestoneIds.includes(text(item.milestoneId)));
    const issues = recall.flatMap(({ item, index }) => {
      const step = steps.get(text(item.milestoneId));
      const issue = step ? monthlyRecallItemIssue(step, { answer: text(item.answer), prompt: text(item.prompt) }, `grammar item ${index + 1}`) : undefined;
      return issue ? [issue] : [];
    });
    if (issues.length) findings.push(finding("MONTHLY_DAILY_GRAMMAR_RECALL_OFF_TOPIC", issues.join("; "), dayNumber, "grammar"));
  }
  return findings;
}

// ---------------------------------------------------------------------------
// Independent AI answer verification.
// ---------------------------------------------------------------------------

export const MONTHLY_ANSWER_VERIFICATION_PROMPT = [
  "You are an independent English teacher checking a workplace English exercise before learners see it. You did not write it.",
  "For each item, solve it yourself: the key is NOT given. Read the prompt (an instruction may be in Vietnamese; the English sentence or question is what is tested), the context (reading passage or listening script) when there is one, and every option.",
  "correctOptions = EVERY option, copied exactly, that you would mark fully correct: grammatical British English, natural, the right tense, voice and agreement (The slides aren't ready; The reports have been read), and the meaning fits the sentence or is stated in the context. If two options are both acceptable, list both. If none is acceptable, return an empty list. Do not list an option only because it is the most likely intended answer.",
  "For a reading or listening question, an option is correct only when the context states it; an option that is only partly supported or mixes two details is not correct.",
  "Distinguish an object pronoun (Please give the file to her after the meeting) from a possessive pronoun (The file is hers). Use the role in the whole sentence.",
  "For an item with mustTest, also set testsLabelledPoint: true only when choosing the correct option requires the grammar point named in mustTest. Check the slot the learner answers and what distinguishes the key from its distractors. A different tense or a vocabulary choice fails, even if the named grammar appears elsewhere in the sentence.",
  "note: one short English sentence. Return one entry per input item with its ref unchanged."
].join("\n");

export interface MonthlyAnswerVerificationVerdict { ref: string; correctOptions: string[]; testsLabelledPoint?: boolean | undefined; note?: string | undefined }

/** Verdicts → severe findings: a key the checker rejects, a second correct option, or a recall item off its label. */
export function monthlyAnswerVerificationFindings(items: readonly MonthlyVerifiableItem[], verdicts: readonly MonthlyAnswerVerificationVerdict[], dayNumber: number): MonthlyQualityFinding[] {
  const key = (value: string) => normalized(value).replace(/[.!?]+$/u, "");
  const byRef = new Map(verdicts.map((verdict) => [verdict.ref, verdict]));
  const grouped = new Map<string, { code: string; component: string; messages: string[] }>();
  const add = (code: string, component: string, message: string) => {
    const slot = grouped.get(`${code}:${component}`) ?? { code, component, messages: [] };
    slot.messages.push(message);
    grouped.set(`${code}:${component}`, slot);
  };
  for (const item of items) {
    const verdict = byRef.get(item.ref);
    if (!verdict) continue;
    const optionKeys = new Set(item.options.map(key));
    const correct = [...new Set(verdict.correctOptions.map((option) => option.trim()).filter((option) => optionKeys.has(key(option))))];
    const note = verdict.note?.trim() ? ` (${verdict.note.trim()})` : "";
    const answerCorrect = correct.some((option) => key(option) === key(item.answer));
    if (!answerCorrect) {
      add("MONTHLY_ANSWER_KEY_DISPUTED", item.component, correct.length
        ? `${item.label}: an independent check found "${correct.join("\" / \"")}" correct, not the key "${item.answer}"${note}`
        : `${item.label}: an independent check found no fully correct option; the key "${item.answer}" is not acceptable${note}`);
    } else if (correct.length > 1) {
      add("MONTHLY_ANSWER_NOT_UNIQUE", item.component, `${item.label}: "${correct.join("\" and \"")}" are all correct${note}`);
    }
    if (item.mustTest && verdict.testsLabelledPoint === false) {
      if (item.review) add("MONTHLY_REVIEW_GRAMMAR_SCOPE", item.component, `${item.label} does not test its review step (${item.milestoneId}: ${item.mustTest})${note}`);
      else add("MONTHLY_DAILY_GRAMMAR_RECALL_OFF_TOPIC", item.component, `${item.label} is labelled as the topic A recall (${item.milestoneId}: ${item.mustTest}) but does not test it${note}`);
    }
  }
  const hints: Record<string, string> = {
    MONTHLY_ANSWER_KEY_DISPUTED: "The answer key must be the one correct option; fix the key and explanation or rewrite the item",
    MONTHLY_ANSWER_NOT_UNIQUE: "Every item must have exactly one correct option; rewrite the sentence or replace the distractors that are also correct",
    MONTHLY_REVIEW_GRAMMAR_SCOPE: "Each review question and its retry must test the same assigned grammar step",
    MONTHLY_DAILY_GRAMMAR_RECALL_OFF_TOPIC: "The recall question must test the locked topic A step it is labelled with; rewrite it with a topic A sentence and options"
  };
  return [...grouped.values()].map((slot) => finding(slot.code, `${hints[slot.code]}: ${slot.messages.join("; ")}`, dayNumber, slot.component));
}
