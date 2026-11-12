/**
 * Deterministic sensitive-text screen for learner free text that feeds AI generation or is shown to
 * other people (custom topics, display names, …). It works without any AI provider.
 *
 * Matching is whole-word on a normalised token stream (lower case, diacritics folded, leetspeak
 * mapped, letter runs squeezed, spaced-out letters re-joined) so ordinary words that merely contain a
 * bad substring ("class", "assess", "Scunthorpe", "Sussex", "skills") stay allowed. A short list of
 * unambiguous strong terms is additionally matched as a substring inside a single token
 * ("fuckface", "xxpornxx"). Vietnamese words that only become offensive once diacritics are removed
 * ambiguously (e.g. "lồn" vs "lon" = can, "các" vs "cặc") are matched with their diacritics intact.
 */

export type SensitiveTextCategory =
  | "slur" | "profanity" | "sexual" | "hate" | "violence" | "self_harm" | "drugs";

export interface SensitiveTextIssue {
  category: SensitiveTextCategory;
  /** Canonical list term that matched (never the learner's raw text). */
  term: string;
}

/** Default Vietnamese learner-facing rejection for unsafe topics. */
export const SENSITIVE_TOPIC_MESSAGE_VI =
  "Chủ đề này không phù hợp. Hãy chọn một chủ đề công việc hoặc đời sống, ví dụ: coffee shop, meeting.";

/** Default Vietnamese learner-facing rejection for unsafe names shown to others. */
export const SENSITIVE_NAME_MESSAGE_VI =
  "Tên này không phù hợp. Hãy dùng tên thật hoặc một tên lịch sự.";

/** Terms matched after diacritics are folded ("ma túy" == "ma tuy"). Multi-word entries match as token sequences and also in their joined form. */
const FOLDED_TERMS: Record<SensitiveTextCategory, readonly string[]> = {
  slur: [
    "nigger", "niggers", "nigga", "niggas", "negro", "negroes", "chink", "chinks", "gook", "gooks", "spic", "spics",
    "wetback", "wetbacks", "kike", "kikes", "faggot", "faggots", "fag", "fags", "dyke", "dykes", "tranny", "trannies",
    "retard", "retards", "retarded", "coon", "coons", "raghead", "towelhead", "beaner", "beaners", "paki", "pakis",
    "sand nigger", "porch monkey",
    // Vietnamese (safe to match without diacritics)
    "bede", "be de", "pede", "tau khua"
  ],
  profanity: [
    "fuck", "fucks", "fucked", "fucker", "fuckers", "fucking", "fuckin", "fck", "fuk", "fuking", "motherfucker",
    "motherfuckers", "shit", "shits", "shitty", "bullshit", "bitch", "bitches", "bastard", "bastards", "asshole",
    "assholes", "ass", "arse", "arsehole", "dumbass", "jackass", "cunt", "cunts", "twat", "wanker", "wankers",
    "prick", "dickhead", "dickheads", "cocksucker", "piss", "wtf", "stfu", "suck my dick", "son of a bitch",
    // Vietnamese
    "dit me", "dit con me", "dit cu", "dcm", "dkm", "dmm", "dmcs", "vcl", "vkl", "vl", "clgt", "cmm",
    "cmn", "loz", "lozz", "con cho de"
  ],
  sexual: [
    "sex", "sexy", "sexting", "porn", "porno", "pornography", "pornographic", "nude", "nudes", "naked", "nudity", "nsfw",
    "xxx", "hentai", "blowjob", "blowjobs", "handjob", "orgasm", "orgasms", "masturbate", "masturbation", "dildo",
    "erotic", "erotica", "fetish", "boobs", "tits", "titties", "pussy", "horny", "milf", "onlyfans", "prostitute",
    "prostitutes", "prostitution", "hooker", "hookers", "stripper", "strippers", "brothel", "incest", "rape", "raped",
    "rapist", "raping", "molest", "molester", "pedophile", "pedophilia", "paedophile", "child porn", "anal", "cum",
    "dick pic", "sex toy", "one night stand",
    // Vietnamese
    "khieu dam", "tinh duc", "phim sex", "phim nguoi lon", "gai goi", "mai dam", "hiep dam", "au dam",
    "loan luan", "thu dam"
  ],
  hate: [
    "nazi", "nazis", "neo nazi", "heil hitler", "white power", "white supremacy", "white supremacist", "kkk",
    "ku klux klan", "ethnic cleansing", "gas the jews", "race war",
    // Vietnamese
    "diet chung"
  ],
  violence: [
    "kill", "kills", "killing", "killer", "killers", "murder", "murders", "murderer", "massacre", "behead",
    "beheading", "torture", "mass shooting", "school shooting", "shoot people", "terrorist", "terrorists",
    "terrorism", "bomb", "bombs", "bombing", "bomb making", "make a bomb", "gore", "genocide", "assassinate",
    "assassination", "stab", "stabbing", "lynch", "lynching",
    // Vietnamese
    "giet", "giet nguoi", "tham sat", "chem giet", "khung bo", "danh bom", "che tao bom", "dam chem"
  ],
  self_harm: [
    "suicide", "suicidal", "self harm", "selfharm", "kill myself", "cut myself", "hang myself", "end my life",
    // Vietnamese
    "rach tay", "muon chet"
  ],
  drugs: [
    "cocaine", "heroin", "meth", "methamphetamine", "crack cocaine", "marijuana", "cannabis", "lsd", "mdma", "ecstasy pills",
    "ketamine", "fentanyl", "opium", "drug dealer", "drug dealing", "sell drugs", "buy drugs",
    // Vietnamese
    "ma tuy", "thuoc phien", "can sa", "thuoc lac", "bay lac", "chich hut", "ma tuy da"
  ]
};

/** Vietnamese terms that are only matched with diacritics intact because the folded form is an ordinary word. */
const ACCENTED_TERMS: Record<SensitiveTextCategory, readonly string[]> = {
  slur: ["mọi rợ", "khựa"],
  profanity: ["lồn", "địt", "cặc", "buồi", "đụ", "đéo", "đm", "đmm", "đcm", "đkm", "đĩ", "điếm", "đéo mẹ", "con đĩ", "chó chết"],
  sexual: ["làm tình", "khỏa thân", "khoả thân"],
  hate: [],
  violence: ["tra tấn"],
  self_harm: ["tự tử", "tự vẫn", "tự hại", "tự sát", "treo cổ"],
  drugs: []
};

/** Unambiguous terms also matched as substrings inside a single normalised token. */
const STRONG_SUBSTRINGS: ReadonlyArray<readonly [string, SensitiveTextCategory]> = [
  ["nigger", "slur"], ["nigga", "slur"], ["faggot", "slur"], ["motherfuck", "profanity"], ["fuck", "profanity"],
  ["cocksuck", "profanity"], ["porn", "sexual"], ["hentai", "sexual"], ["pedophil", "sexual"], ["paedophil", "sexual"],
  ["khieudam", "sexual"]
];

/** Ordinary words that would otherwise trip a strong substring. */
const SAFE_TOKENS = new Set(["snigger", "sniggers", "sniggered", "sniggering"]);

const LEET: Record<string, string> = { "0": "o", "1": "i", "3": "e", "4": "a", "5": "s", "7": "t", "8": "b", "9": "g", "@": "a", "$": "s", "!": "i", "|": "i", "€": "e" };

interface CompiledTerms { single: Map<string, string>; phrases: Array<{ tokens: string[]; term: string }>; categories: Map<string, SensitiveTextCategory> }

function compile(source: Record<SensitiveTextCategory, readonly string[]>, normalize: (value: string) => string[]): CompiledTerms {
  const compiled: CompiledTerms = { single: new Map(), phrases: [], categories: new Map() };
  for (const [category, terms] of Object.entries(source) as Array<[SensitiveTextCategory, readonly string[]]>) {
    for (const term of terms) {
      const tokens = normalize(term);
      if (!tokens.length) continue;
      compiled.categories.set(term, category);
      if (tokens.length === 1) compiled.single.set(tokens[0]!, term);
      else {
        compiled.phrases.push({ tokens, term });
        compiled.single.set(tokens.join(""), term);
      }
    }
  }
  return compiled;
}

function foldDiacritics(value: string): string {
  return value.normalize("NFKD").replace(/\p{M}+/gu, "").replace(/đ/g, "d").replace(/Đ/g, "D");
}

/** Lower-cased, diacritic-folded, leetspeak-mapped tokens with spaced-out letters re-joined. */
function foldedTokens(text: string): string[] {
  const lowered = foldDiacritics(text.normalize("NFKC")).toLowerCase();
  const chunks = lowered.split(/[^a-z0-9@$!|€*]+/u).filter(Boolean);
  const tokens: string[] = [];
  for (const chunk of chunks) {
    // Map leetspeak only inside chunks that also contain real letters ("sh1t", "@ss"), so "2024" stays a number.
    const hasLetters = /[a-z]/.test(chunk);
    const mapped = hasLetters
      ? chunk.replace(/[!|]+$/u, "").replace(/[0-9@$!|€]/gu, (char) => LEET[char] ?? char)
      : chunk.replace(/[^0-9]/gu, "");
    for (const piece of mapped.split(/[^a-z0-9*]+/u)) if (piece) tokens.push(piece);
  }
  return joinSpacedLetters(tokens);
}

function accentedTokens(text: string): string[] {
  return text.normalize("NFKC").normalize("NFC").toLowerCase().split(/[^\p{L}\p{N}]+/u).filter(Boolean);
}

/** "f u c k" / "s.e.x" → one token; runs of two or more single letters are merged. */
function joinSpacedLetters(tokens: string[]): string[] {
  const output: string[] = [];
  let run: string[] = [];
  const flush = () => {
    if (run.length >= 2) output.push(run.join(""));
    else output.push(...run);
    run = [];
  };
  for (const token of tokens) {
    if (token.length === 1 && /[a-z*]/.test(token)) run.push(token);
    else { flush(); output.push(token); }
  }
  flush();
  return output;
}

/** Token variants: as typed, letter runs of 3+ squeezed to one ("fuuuck") and to two ("asss"). */
function variants(token: string): string[] {
  const one = token.replace(/(.)\1{2,}/gu, "$1");
  const two = token.replace(/(.)\1{2,}/gu, "$1$1");
  const out = new Set([token, one, two]);
  for (const value of [...out]) if (value.length > 3 && value.endsWith("s")) out.add(value.slice(0, -1));
  return [...out];
}

const FOLDED = compile(FOLDED_TERMS, (term) => foldedTokens(term));
const ACCENTED = compile(ACCENTED_TERMS, (term) => accentedTokens(term));

function matchWildcard(token: string, single: Map<string, string>): string | undefined {
  // "f*ck", "sh*t": a masked token matches a listed term of the same length when at least two real letters line up.
  if (!token.includes("*") || token.replace(/\*/g, "").length < 2) return undefined;
  const pattern = new RegExp(`^${token.replace(/\*/g, "[a-z]")}$`, "u");
  for (const [key, term] of single) if (key.length === token.length && pattern.test(key)) return term;
  return undefined;
}

function matchStream(tokens: string[], compiled: CompiledTerms, allowVariants: boolean): string | undefined {
  const tokenVariants = tokens.map((token) => (allowVariants ? variants(token) : [token]));
  // Phrases first: they are more specific ("kill myself" is self-harm, not just violence).
  for (const phrase of compiled.phrases) {
    for (let start = 0; start + phrase.tokens.length <= tokens.length; start += 1) {
      if (phrase.tokens.every((part, offset) => tokenVariants[start + offset]!.includes(part))) return phrase.term;
    }
  }
  for (let index = 0; index < tokens.length; index += 1) {
    for (const value of tokenVariants[index]!) {
      const hit = compiled.single.get(value) ?? (allowVariants ? matchWildcard(value, compiled.single) : undefined);
      if (hit) return hit;
    }
  }
  return undefined;
}

/**
 * Returns the first sensitive category found in `text`, or null when the text looks safe.
 * Intended for topics, names and other short free text — not for grading learner answers.
 */
export function sensitiveTextIssue(text: string | null | undefined): SensitiveTextIssue | null {
  if (!text || !text.trim()) return null;
  const accented = matchStream(accentedTokens(text), ACCENTED, false);
  if (accented) return { category: ACCENTED.categories.get(accented)!, term: accented };
  const tokens = foldedTokens(text);
  const folded = matchStream(tokens, FOLDED, true);
  if (folded) return { category: FOLDED.categories.get(folded)!, term: folded };
  for (const token of tokens) {
    if (SAFE_TOKENS.has(token)) continue;
    for (const value of variants(token)) {
      for (const [needle, category] of STRONG_SUBSTRINGS) if (value.includes(needle)) return { category, term: needle };
    }
  }
  return null;
}

/** True when any of the given strings is sensitive (convenience for filtering generated items). */
export function hasSensitiveText(...values: ReadonlyArray<string | null | undefined>): boolean {
  return values.some((value) => sensitiveTextIssue(value) !== null);
}
