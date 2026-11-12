import type { CefrLevel } from "@e4s/contracts";
import { monthlyIpaExampleMatchesTarget, monthlyIpaPhonemes, monthlyIpaShape, monthlyPronunciationPairSide, monthlyPronunciationPhenomenonExampleIssue, type MonthlyPronunciationCatalogItem } from "@e4s/domain";
import { MONTHLY_BRITISH_IPA_RULE, monthlyBritishIpaIssue } from "./monthly-british-ipa.js";

/**
 * Deterministic quality gates for monthly RESOURCE generation (11/11/2026 fix).
 *
 * The gates never choose words for the AI. They only reject a generated
 * candidate and return a reason; the reasons are fed back into the existing
 * repair/retry loops (core rounds, pronunciation attempts) so the AI itself
 * replaces the rejected items. Real bad outputs they were written against are
 * listed in docs/ai-resource-fix-2026-11-11.md, section 6.
 */

const CEFR_ORDER: readonly CefrLevel[] = ["A1", "A2", "B1", "B2", "C1"];
const levelIndex = (level: CefrLevel) => CEFR_ORDER.indexOf(level);
const normalize = (value: string) => value.trim().toLocaleLowerCase("en").replace(/[\s\p{P}]+/gu, " ").trim();

/**
 * VALIDATION REFERENCE LIST, not a word source: basic workplace vocabulary
 * (roughly English Vocabulary Profile A1–A2, plus the most frequent everyday
 * B1 office words). A core word from this list is too easy to be a B2 or C1
 * core and is rejected so the AI must replace it. It is never offered to the AI
 * as a list to pick from. It includes every too-easy word seen in the B2 v5 and
 * C1 v3 regenerations of 2026-11 (client, team, manager, problem, message,
 * cancel, change, comment, head, colleague, review, video, accept, available,
 * version …). Extend it only with clearly basic words.
 */
export const MONTHLY_BASIC_WORKPLACE_WORDS: ReadonlySet<string> = new Set([
  // people, roles, organisations
  "boss", "client", "colleague", "customer", "manager", "team", "staff", "worker", "employee", "employer", "partner", "member",
  "person", "people", "friend", "guest", "visitor", "assistant", "director", "head", "leader", "owner", "user", "company",
  "office", "business", "department", "group", "organisation", "organization", "developer", "consultant", "supplier", "designer",
  // things, documents, tools
  "email", "message", "phone", "call", "meeting", "report", "document", "file", "folder", "list", "form", "letter", "note",
  "notice", "paper", "page", "printer", "computer", "laptop", "screen", "keyboard", "website", "internet", "online", "password",
  "account", "app", "software", "program", "programme", "system", "tool", "video", "photo", "picture", "chart", "table", "desk",
  "chair", "room", "door", "building", "floor", "ticket", "card", "bill", "price", "cost", "money", "salary", "payment", "order",
  "product", "service", "project", "plan", "task", "job", "work", "problem", "question", "answer", "idea", "information", "news",
  "detail", "example", "result", "mistake", "change", "decision", "comment", "feedback", "review", "update", "schedule", "calendar",
  "date", "time", "day", "week", "month", "year", "hour", "minute", "deadline", "break", "lunch", "holiday", "trip", "travel",
  "agenda", "request", "progress", "solution", "version", "presentation", "suggestion", "discussion", "reply", "response", "delay",
  "issue", "option", "choice", "support", "target", "goal", "success", "experience", "skill", "training", "interview", "spreadsheet",
  // actions
  "ask", "agree", "arrive", "begin", "book", "bring", "buy", "cancel", "check", "choose", "close", "come", "copy", "decide",
  "delete", "download", "upload", "end", "explain", "find", "finish", "fix", "get", "give", "go", "help", "join", "keep", "know",
  "learn", "leave", "listen", "look", "make", "meet", "move", "need", "open", "pay", "print", "put", "read", "remember", "repeat",
  "return", "save", "say", "see", "sell", "send", "share", "show", "sign", "speak", "start", "stop", "take", "talk", "tell", "test",
  "think", "try", "type", "use", "visit", "wait", "want", "write", "contact", "manage", "organise", "organize", "prepare", "discuss",
  "suggest", "improve", "complete", "confirm", "accept", "present", "deliver", "offer", "invite", "attend", "inform", "extend",
  "adjust", "propose", "respond",
  // qualities, adverbs
  "big", "small", "new", "old", "good", "bad", "great", "nice", "easy", "hard", "difficult", "important", "busy", "free", "late",
  "early", "quick", "quickly", "fast", "slow", "ready", "right", "wrong", "correct", "clear", "simple", "helpful", "useful", "happy",
  "sorry", "possible", "available", "different", "same", "full", "empty", "next", "last", "first", "final", "usual", "normal",
  "careful", "carefully", "soon", "today", "tomorrow", "again", "always", "often", "sometimes", "never", "really", "together",
  "accurate", "successful"
]);

/**
 * VALIDATION REFERENCE LIST: clipped forms, abbreviations and word fragments
 * the generator has returned as if they were words ("ot", "est", "min").
 */
export const MONTHLY_NON_WORD_FRAGMENTS: ReadonlySet<string> = new Set([
  "min", "mins", "max", "est", "approx", "info", "asap", "etc", "pls", "thx", "msg", "mgr", "dept", "doc", "docs", "ref", "req",
  "qty", "amt", "tel", "intro", "ing", "ion", "tion", "sion", "ment", "ness", "ful", "less", "able", "ible", "ism", "ist", "ize",
  "ise", "ity", "pre", "pro", "dis", "mis", "sub", "non", "anti"
]);

/** Deterministic non-word screen shared by core and pronunciation gates. */
export function monthlyNonWordIssue(rawWord: string): string | undefined {
  const word = rawWord.trim().toLocaleLowerCase("en");
  // The model sometimes copies the IPA transcription into the word field ("ˈbɪt"); say so, or repairs repeat it.
  if (/[ˈˌːɪʊəɛæɑɒɔʌɜθðʃʒŋɡɐɚɝ/]/u.test(word)) {
    return `"${rawWord}" is an IPA transcription, not the word: put the normal English spelling in "word" (e.g. "bit") and the transcription only in "ipa"`;
  }
  if (!/^\p{L}+(?:[-'’]\p{L}+)*$/u.test(word)) return `"${rawWord}" is not one standalone word`;
  const letters = word.replace(/[-'’]/gu, "");
  if (letters.length < 3) return `"${rawWord}" is too short to be a real headword (a fragment or abbreviation)`;
  if (MONTHLY_NON_WORD_FRAGMENTS.has(letters)) return `"${rawWord}" is an abbreviation, clipped form or word fragment, not a real word`;
  if (!/[aeiouy]/u.test(letters)) return `"${rawWord}" has no vowel letter and is not a real English word`;
  return undefined;
}

/**
 * Spellings English words do not have (December 2026: "ackle" given as an /æ/
 * example). Deliberately narrow: a vowel followed by "ck" at the start of the
 * word (only acknowledge-family words start that way), a letter tripled, or a
 * doubled consonant at the start. Other invented words are left to the AI word
 * verification of pronunciation examples.
 */
export function monthlyImplausibleSpellingIssue(rawWord: string): string | undefined {
  const word = rawWord.trim().toLocaleLowerCase("en");
  if (!/^\p{L}+$/u.test(word)) return undefined;
  if ((/^[aeiou]ck/u.test(word) && !word.startsWith("acknowledg")) || /(\p{L})\1\1/u.test(word) || /^([bcdfghjkmnpqrstvwxz])\1/u.test(word)) {
    return `"${rawWord}" is not a real English word; use a common dictionary word that contains the target sound`;
  }
  return undefined;
}

/**
 * Lowest core label accepted per month level (an absent label is still allowed).
 * Product rule (user, 2026-11-11): a core word may be at the target level or ONE level below, so learners also review.
 */
const MONTHLY_CORE_MIN_LABEL: Readonly<Record<CefrLevel, CefrLevel>> = { A1: "A1", A2: "A1", B1: "A2", B2: "B1", C1: "B2" };

const MONTHLY_CORE_LEVEL_DESCRIPTORS: Readonly<Record<CefrLevel, string>> = {
  A1: "A1 (beginner): very common, concrete words for people, objects and simple actions at work",
  A2: "A2 (elementary): common routine office words for familiar, everyday tasks and simple exchanges",
  B1: "B1 (intermediate): words for explaining plans, problems, opinions and progress in familiar work situations, beyond basic survival vocabulary",
  B2: "B2 (upper-intermediate): less frequent, more precise and partly abstract words an independent user needs to negotiate, justify decisions, compare options and report with nuance; not words a B1 learner already uses every day",
  C1: "C1 (advanced): sophisticated, lower-frequency, often formal or abstract words a proficient user chooses for precision, hedging, persuasion and formal correspondence; clearly beyond everyday B2 business English"
};

/** Representative too-easy words named in the B1+ prompt (a sample of the reference list, not a pick list). */
const MONTHLY_TOO_EASY_PROMPT_SAMPLE = ["client", "team", "manager", "colleague", "head", "problem", "message", "comment", "review", "change", "cancel", "meeting", "email", "report", "project", "schedule", "deadline", "request", "confirm", "improve", "complete", "present", "available", "accept", "video", "version"] as const;

/**
 * True when basic-word rejection applies to this month level. The list holds A1–B1 everyday words, i.e. two or more
 * levels below C1; at B2 one level below (B1) is allowed, so B2 relies on the CEFR label rule instead.
 */
export function monthlyBasicWordGateApplies(cefr: CefrLevel): boolean {
  return cefr === "C1";
}

/**
 * Other levels' core words of the same month that this level must not reuse.
 * - A1/A2 generation excludes nothing: basic words belong to them, and a B2/C1
 *   core that is a basic word is the higher level's error (basic-word gate).
 * - Overlap inside A1–A2–B1 stays a manual-edit warning (decision of R2).
 * - Every pair that involves B2 or C1 is blocked: B1 excludes B2/C1 cores,
 *   B2 excludes A1/A2/B1/C1 cores, C1 excludes A1/A2/B1/B2 cores.
 */
export function buildMonthlyCrossLevelCoreExclusions(
  cefr: CefrLevel,
  otherLevels: ReadonlyArray<{ cefr: CefrLevel; words: readonly string[] }>
): Map<string, CefrLevel> {
  const exclusions = new Map<string, CefrLevel>();
  if (levelIndex(cefr) < levelIndex("B1")) return exclusions;
  for (const level of otherLevels) {
    if (level.cefr === cefr) continue;
    if (levelIndex(cefr) <= levelIndex("B1") && levelIndex(level.cefr) <= levelIndex("B1")) continue;
    for (const word of level.words) {
      const key = normalize(word);
      if (key && !exclusions.has(key)) exclusions.set(key, level.cefr);
    }
  }
  return exclusions;
}

/**
 * Core-term level gate: non-words, a CEFR label below the month's band, basic
 * workplace words at C1, and words that are already core words of another level
 * this month. Returns the rejection reason, or undefined.
 */
export function getMonthlyCoreLevelIssue(
  candidate: { word: string; cefr?: CefrLevel | undefined },
  cefr: CefrLevel,
  otherLevelCoreWords?: ReadonlyMap<string, CefrLevel>
): string | undefined {
  const nonWord = monthlyNonWordIssue(candidate.word);
  if (nonWord) return nonWord;
  const word = normalize(candidate.word);
  const minLabel = MONTHLY_CORE_MIN_LABEL[cefr];
  if (candidate.cefr && levelIndex(candidate.cefr) < levelIndex(minLabel)) return `labelled CEFR ${candidate.cefr}, below ${minLabel}, the lowest core level for ${cefr}`;
  if (monthlyBasicWordGateApplies(cefr) && MONTHLY_BASIC_WORKPLACE_WORDS.has(word)) return `basic A1–A2 workplace word, too easy for a ${cefr} core`;
  const otherLevel = otherLevelCoreWords?.get(word);
  if (otherLevel) return `already a ${otherLevel} core word this month; levels must not share core words`;
  return undefined;
}

/** True when a rejection reason came from the level gate (used to build focused repair feedback). */
export function isMonthlyCoreLevelReason(reason: string): boolean {
  return /too easy for a|core word this month|the lowest core level for|not a real|not one standalone word|too short to be a real headword|abbreviation, clipped form/u.test(reason);
}

/** Core level rule for the Phase 1 prompt: target-level descriptor, label rule and too-easy examples. */
export function buildMonthlyCoreCefrGuidance(cefr: string): string {
  if (!CEFR_ORDER.includes(cefr as CefrLevel)) return `Every core word itself must be at CEFR ${cefr} or below, never above it; set each coreTerms item's cefr field to that core word's own CEFR level.`;
  const level = cefr as CefrLevel;
  const descriptor = MONTHLY_CORE_LEVEL_DESCRIPTORS[level];
  if (levelIndex(level) < levelIndex("B1")) {
    return `TARGET LEVEL ${descriptor}. Every core word itself must be at CEFR ${cefr} or below, never above it; set each coreTerms item's cefr field to that core word's own CEFR level. The application rejects any core candidate labelled above ${cefr}.`;
  }
  const minLabel = MONTHLY_CORE_MIN_LABEL[level];
  const band = minLabel === level ? level : `${minLabel}–${level}`;
  const belowBand = CEFR_ORDER.slice(0, levelIndex(minLabel));
  const belowBandText = belowBand.length > 1 ? `${belowBand[0]}–${belowBand[belowBand.length - 1]}` : belowBand.join("");
  const sample = MONTHLY_TOO_EASY_PROMPT_SAMPLE.join(", ");
  const tooEasy = monthlyBasicWordGateApplies(level)
    ? `Basic workplace words that every A1–B1 learner already knows are too easy and the application rejects them as ${cefr} cores, even when they fit the theme perfectly; examples of rejected too-easy words: ${sample}.`
    : `Only ${belowBandText} words are too easy for a ${cefr} core: do not use ${belowBandText} basic words (for example ${MONTHLY_TOO_EASY_PROMPT_SAMPLE.slice(0, 12).join(", ")}); ${minLabel} words are welcome as review.`;
  return `TARGET LEVEL ${descriptor}. Every core word must be at the target level ${cefr} or ONE level below (${minLabel}), i.e. CEFR ${band}, so learners also review: never below ${minLabel} and never above ${cefr}. Set each coreTerms item's cefr field honestly to that word's own CEFR level; the application rejects a core labelled below ${minLabel} or above ${cefr}. ${tooEasy} Do not compensate with rare jargon or invented terms: choose words a ${cefr} professional genuinely needs for this theme.`;
}

/** Prompt sentence listing the other levels' core words of the month (an exclusion list, not a source). */
export function buildMonthlyOtherLevelCoreExclusionText(exclusions: ReadonlyMap<string, CefrLevel> | undefined): string {
  if (!exclusions?.size) return "";
  const byLevel = new Map<CefrLevel, string[]>();
  for (const [word, level] of exclusions) byLevel.set(level, [...(byLevel.get(level) ?? []), word]);
  const lists = [...byLevel.entries()].sort(([a], [b]) => levelIndex(a) - levelIndex(b)).map(([level, words]) => `${level}: ${words.join(", ")}`);
  return ` OTHER CEFR LEVELS OF THIS MONTH: these words are already core words of other levels and are forbidden as core words here (the application rejects them, and levels must not share core words): ${lists.join("; ")}.`;
}

/** Repair feedback for the next core round: every level-gate rejection, grouped by reason. */
export function summarizeMonthlyCoreLevelRejections(cefr: string, rejections: ReadonlyArray<{ word: string; reason: string }>): string {
  if (!rejections.length) return "";
  const groups = new Map<string, string[]>();
  for (const { word, reason } of rejections) {
    const key = /too easy for a/u.test(reason) ? `too easy for ${cefr} (basic A1–A2 workplace words)`
      : /core word this month/u.test(reason) ? "already core words of another level this month"
        : /lowest core level/u.test(reason) ? `labelled below the ${cefr} band`
          : "not real standalone words";
    const words = groups.get(key) ?? [];
    if (!words.includes(word)) words.push(word);
    groups.set(key, words);
  }
  const parts = [...groups.entries()].map(([key, words]) => `${key}: ${words.slice(0, 40).join(", ")}`);
  return `LEVEL REPAIR: the application rejected these core candidates — ${parts.join("; ")}. Replace them with words that genuinely belong to CEFR ${cefr} for this theme; do not return them, their inflections, or words of the same lower level.`;
}

// ---------------------------------------------------------------------------
// Pronunciation examples
// ---------------------------------------------------------------------------

const VOWEL_START = /^[aeiouyæøœɐɑɒɔəɘɛɜɞɤɨɪʉʊʌʏɯɶɵɚɝ]/u;
const BOUNDARIES = new Set(["ˈ", "ˌ", "."]);
/** Drops diacritics (keeps the length mark ː, which distinguishes /iː/ from /i/) and folds ɡ→g, ɹ→r. */
const baseToken = (token: string) => token.replace(/[ˑʰʲʷˠˤ̀-ͯ]/gu, "").replace(/ɡ/gu, "g").replace(/ɹ/gu, "r");
const isVowel = (token: string | undefined) => Boolean(token && VOWEL_START.test(token));

/** Letters (any one present) that can spell each consonant phoneme; used to catch invented transcriptions. */
const CONSONANT_SPELLINGS: Readonly<Record<string, readonly string[]>> = {
  p: ["p"], b: ["b"], t: ["t", "d"], d: ["d"], k: ["k", "c", "q", "x"], g: ["g", "x"], f: ["f", "ph", "gh"], v: ["v", "f"],
  "θ": ["th"], "ð": ["th"], s: ["s", "c", "x"], z: ["z", "s", "x"], "ʃ": ["s", "c", "x", "ti", "ch"], "ʒ": ["s", "g", "z", "j"],
  "tʃ": ["c", "t"], "dʒ": ["j", "g", "d"], m: ["m"], n: ["n"], "ŋ": ["n"], h: ["h"], l: ["l"], r: ["r"], w: ["w", "u", "o"],
  j: ["y", "u", "i", "e", "j"], "ɾ": ["t", "d"]
};

/** Spelling patterns a target vowel needs somewhere in the word (problem cannot contain /ɜː/, job cannot contain /æ/). */
const VOWEL_SPELLINGS: Readonly<Record<string, RegExp>> = {
  "æ": /a/u, "ɜː": /(?:e|i|u|o|y|ea|ou)r/u, "ɝ": /(?:e|i|u|o|y|ea|ou)r/u, "iː": /[eiy]/u, "ʌ": /[uo]/u, "ɒ": /[oa]/u, "ɔː": /[oa]/u,
  "ʊ": /[ou]/u, "uː": /[ouw]/u, "ɑː": /a/u, "e": /[eau]/u, "eɪ": /[ae]/u, "aɪ": /[iy]/u, "ɔɪ": /o[iy]/u, "aʊ": /o[uw]/u,
  "əʊ": /o/u, "oʊ": /o/u, "ɪə": /[ei]/u, "eə": /[ae]/u, "ʊə": /[ou]/u
};

/** Syllables and primary stress of one transcription (shared domain implementation). */
const ipaShape = monthlyIpaShape;

/** A consonant in the IPA that the spelling cannot produce (tracks /trædks/, count /krʌnt/). */
function inventedConsonantIssue(word: string, ipa: string): string | undefined {
  const letters = word.trim().toLocaleLowerCase("en").replace(/[^a-z]/gu, "");
  for (const phoneme of ipaShape(ipa).phonemes) {
    if (isVowel(phoneme)) continue;
    const spellings = CONSONANT_SPELLINGS[phoneme];
    if (spellings && !spellings.some((spelling) => letters.includes(spelling))) {
      return `IPA ${ipa} has /${phoneme}/, which the spelling "${word}" cannot produce; transcribe the real pronunciation`;
    }
  }
  return undefined;
}

/** Target /s/ spelled so that it is not normally voiced /z/ (easy, busy, noise, zoom are /z/). */
function hasUnambiguousVoicelessS(word: string): boolean {
  return /ss|sc|c[eiy]|x/u.test(word)
    || /^s(?!h|ugar|ure)/u.test(word)
    || /s[tpkcqf]|[ptkfc]s/u.test(word);
}

/**
 * Quality gate for one pronunciation example, on top of the shared phoneme
 * match (`monthlyIpaExampleMatchesTarget`, run by the caller). Rejects:
 * - non-words and fragments (ot, est, min);
 * - a vowel target that is not the vowel of the stressed syllable (meeting for /ɪ/);
 * - an IPA that invents a sound the spelling cannot have (tracks /trædks/, count /krʌnt/,
 *   problem with /ɜː/, job with /æ/);
 * - a /s/ example whose s is usually voiced (easy, busy, noise);
 * - a stress target example that contradicts the target label (supplier for first-syllable stress);
 * - a word that is a core term with a different stress pattern (present /ˈprezənt/ vs core verb /prɪˈzent/).
 */
export function getMonthlyPronunciationExampleQualityIssue(input: {
  targetIpa: string;
  targetLabel?: string | undefined;
  word: string;
  ipa: string;
  coreTerms?: ReadonlyArray<{ word: string; ipa: string }> | undefined;
}): string | undefined {
  const nonWord = monthlyNonWordIssue(input.word) ?? monthlyImplausibleSpellingIssue(input.word);
  if (nonWord) return nonWord;
  const letters = input.word.trim().toLocaleLowerCase("en").replace(/[^a-z]/gu, "");
  const target = monthlyIpaPhonemes(input.targetIpa).filter((token) => !BOUNDARIES.has(token)).map(baseToken);
  const stressOnly = monthlyIpaPhonemes(input.targetIpa).every((token) => BOUNDARIES.has(token)) && /ˈ/u.test(input.targetIpa);
  const shape = ipaShape(input.ipa);

  const invented = inventedConsonantIssue(input.word, input.ipa);
  if (invented) return invented;

  if (target.length === 1 && isVowel(target[0]) && target[0] !== "ə") {
    const vowelSpelling = VOWEL_SPELLINGS[target[0]!];
    if (vowelSpelling && !vowelSpelling.test(letters)) return `"${input.word}" cannot be pronounced with /${target[0]}/ (its spelling has no such vowel); IPA ${input.ipa} is not its real pronunciation`;
    if (shape.stressedSyllable === undefined) return `IPA ${input.ipa} has several syllables but no primary stress mark ˈ, so the stressed vowel cannot be checked`;
    if (shape.stressedVowel !== target[0]) return `the stressed vowel of ${input.ipa} is /${shape.stressedVowel ?? "?"}/, not the target /${target[0]}/`;
  }

  if (target.length === 1 && target[0] === "s" && !hasUnambiguousVoicelessS(letters)) {
    return `the s in "${input.word}" is normally voiced /z/ or ambiguous; choose a word whose /s/ is spelled ss, c before e/i/y, x, an initial s, or s next to a voiceless consonant`;
  }

  if (stressOnly) {
    if (shape.syllables < 2) return `"${input.word}" has one syllable, so it cannot show word stress`;
    if (shape.stressedSyllable === undefined) return `IPA ${input.ipa} has no primary stress mark ˈ`;
    const label = (input.targetLabel ?? "").toLocaleLowerCase("en");
    const expected = /\b(?:first|initial)[\s-]+syllable/u.test(label) ? 0
      : /\bsecond[\s-]+syllable/u.test(label) ? 1
        : /\b(?:final|last)[\s-]+syllable/u.test(label) ? shape.syllables - 1
          : /\bpenultimate\b/u.test(label) ? shape.syllables - 2 : undefined;
    if (expected !== undefined && shape.stressedSyllable !== expected) return `${input.ipa} stresses syllable ${shape.stressedSyllable + 1}, but the target "${input.targetLabel}" needs stress on syllable ${expected + 1}`;
    const syllableLabel = /\b(two|three)[\s-]+syllable/u.exec(label)?.[1];
    if (syllableLabel && shape.syllables !== (syllableLabel === "two" ? 2 : 3)) return `"${input.word}" has ${shape.syllables} syllables, but the target "${input.targetLabel}" is about ${syllableLabel}-syllable words`;
  }

  const core = input.coreTerms?.find((term) => normalize(term.word) === normalize(input.word));
  if (core) {
    const coreShape = ipaShape(core.ipa);
    if (coreShape.syllables > 1 && shape.syllables > 1 && coreShape.stressedSyllable !== undefined && shape.stressedSyllable !== undefined && coreShape.stressedSyllable !== shape.stressedSyllable) {
      return `"${input.word}" is a core word this month pronounced ${core.ipa}; ${input.ipa} is a different stress pattern of the same spelling`;
    }
  }
  return monthlyBritishIpaIssue(input.word, input.ipa);
}

/** Example-word rules appended to the Phase 4 prompt; they mirror the gates above. */
export function buildMonthlyPronunciationExampleRules(): string {
  return `EXAMPLE RULES (the application checks every example phoneme by phoneme and rejects any that break them): transcribe each example's real standard British pronunciation and put ˈ before the stressed syllable of every word with two or more syllables; never invent or alter a sound to make a word fit (tracks is /træks/, not /trædks/). A vowel target must be the vowel of the stressed syllable (meeting /ˈmiːtɪŋ/ does not illustrate /ɪ/; clear /klɪə/ has the diphthong /ɪə/, not /ɪ/; problem and project have /ɒ/, not /ɜː/; job has /ɒ/, not /æ/). A consonant target must be a real phoneme of the word (zoom, easy, busy and noise have /z/, not /s/). A final-cluster target must end the word or syllable (extend ends in /nd/, not /st/; client has no /st/). A stress target's label must say which syllable is stressed, and every example must follow that label (supplier /səˈplaɪə/ is not first-syllable stress). Use only real dictionary words: no abbreviations, clipped forms or fragments (min, est, ot), no function word in its weak form (to /tə/, can /kən/; a function word in its strong form such as that /ðæt/ or have /hæv/ is fine for /æ/, but never use a function word for /ə/), and no word whose stress differs from the same word used as a core term this month (present the verb vs present the noun). Use a word from the monthly vocabulary pool only when it genuinely contains the target; never include a pool word just because it is in the pool. Every example is a real dictionary word or a natural phrase of real words a colleague would say; never make up a word to fit the sound (ackle is not a word). ${MONTHLY_BRITISH_IPA_RULE}`;
}

/**
 * Retry instruction once a target was accepted but some examples failed: keep
 * the same target and replace only the rejected examples.
 */
export function buildMonthlyPronunciationExampleRepairInstruction(
  target: { ipa: string; label: string },
  rejected: readonly string[],
  stillNeeded: number
): string {
  return `EXAMPLE REPAIR: keep exactly this target — ipa ${target.ipa}, label "${target.label}" — and do not change it. ${stillNeeded} more example${stillNeeded === 1 ? " is" : "s are"} still needed. The application rejected these examples: ${rejected.join("; ") || "none"}. Return new, different real words that satisfy every example rule; never repeat a rejected word.`;
}

/**
 * Example gate by roadmap item type (11/11 pronunciation roadmap):
 * - phoneme: phoneme-token match plus the quality gate above;
 * - pair: the example shows one side of the confusable pair (same checks for that phoneme);
 * - phenomenon: the form rule of the item (ending, cluster, stress mark, ‿,
 *   weak form, brackets, arrows, | or CAPITALS), plus real-word checks for
 *   single-word examples. Returns the rejection reason, or undefined.
 */
export function getMonthlyPronunciationCatalogExampleIssue(
  item: MonthlyPronunciationCatalogItem,
  example: { word: string; ipa: string },
  coreTerms?: ReadonlyArray<{ word: string; ipa: string }>
): string | undefined {
  const word = example.word.trim();
  if (item.type === "phoneme") {
    if (!monthlyIpaExampleMatchesTarget(item.notation, example.ipa, word)) return `IPA ${example.ipa} does not illustrate target ${item.notation}`;
    return getMonthlyPronunciationExampleQualityIssue({ targetIpa: item.notation, word, ipa: example.ipa, coreTerms });
  }
  if (item.type === "pair") {
    const side = monthlyPronunciationPairSide(item, example);
    if (!side) return `IPA ${example.ipa} contains neither side of ${item.notation}`;
    return getMonthlyPronunciationExampleQualityIssue({ targetIpa: `/${side.phoneme}/`, word, ipa: example.ipa, coreTerms });
  }
  const single = /^\p{L}+(?:[-'’]\p{L}+)*$/u.test(word);
  if (single) {
    const nonWord = monthlyNonWordIssue(word) ?? monthlyImplausibleSpellingIssue(word);
    if (nonWord) return nonWord;
  }
  const formIssue = monthlyPronunciationPhenomenonExampleIssue(item, example);
  if (formIssue) return formIssue;
  if (single) {
    const invented = inventedConsonantIssue(word, example.ipa);
    if (invented) return invented;
    const core = coreTerms?.find((term) => normalize(term.word) === normalize(word));
    if (core) {
      const coreShape = ipaShape(core.ipa);
      const shape = ipaShape(example.ipa);
      if (coreShape.syllables > 1 && shape.syllables > 1 && coreShape.stressedSyllable !== undefined && shape.stressedSyllable !== undefined && coreShape.stressedSyllable !== shape.stressedSyllable) {
        return `"${word}" is a core word this month pronounced ${core.ipa}; ${example.ipa} is a different stress pattern of the same spelling`;
      }
    }
  }
  return monthlyBritishIpaIssue(word, example.ipa);
}
