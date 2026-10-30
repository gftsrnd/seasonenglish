/**
 * Language-aware extraction of named people/entities from a comprehension
 * question, used to check that every named entity is grounded in the source.
 *
 * Capitalization alone is weak evidence. A token counts as an entity only when
 * there is structural evidence:
 * - it follows a personal honorific (Mr/Ms/Dr, anh/chị/ông/bà/cô/chú/em);
 * - it is capitalized mid-sentence (not explained by sentence capitalization);
 * - it is a later word of a capitalized run that starts a sentence
 *   ("Theo Mai, ..." -> "Mai"), because only the first word is explained by
 *   sentence capitalization.
 * English sentence-initial words are entities unless they belong to the closed
 * grammatical class of question/function words, so English name checks are not
 * weakened. Vietnamese sentence-initial words are never entities on their own.
 */
export type PromptEntityEvidence = "honorific" | "mid_sentence" | "multi_word" | "sentence_initial";

export type PromptEntity = {
  text: string;
  /** Lower-case tokens, possessive removed. */
  tokens: string[];
  evidence: PromptEntityEvidence;
};

type Token = {
  value: string;
  lower: string;
  start: number;
  end: number;
  capitalized: boolean;
  sentenceInitial: boolean;
};

const ENGLISH_HONORIFICS = new Set(["mr", "mrs", "ms", "mx", "dr", "prof"]);
const VIETNAMESE_HONORIFICS = new Set(["anh", "chị", "ông", "bà", "cô", "chú", "em", "bác"]);

/** Closed grammatical class that starts English questions and instructions. */
const ENGLISH_FUNCTION_WORDS = new Set([
  "who", "whom", "whose", "what", "when", "where", "why", "how", "which",
  "is", "are", "am", "was", "were", "be", "do", "does", "did", "can", "could", "would", "will", "shall", "should", "may", "might", "must",
  "has", "have", "had", "the", "a", "an", "this", "that", "these", "those",
  "i", "we", "you", "he", "she", "it", "they", "your", "our", "their", "his", "her", "its",
  "in", "on", "at", "to", "for", "from", "by", "with", "about", "after", "before", "during", "according", "based",
  "if", "then", "and", "but", "or", "so",
  "listen", "read", "write", "choose", "select", "look", "answer", "explain", "describe", "summarize", "summarise", "imagine", "complete", "say", "tell"
]);

/**
 * Vietnamese common nouns that form fixed capitalized expressions with the next
 * word (weekdays, months, language names), e.g. "thứ Hai", "tiếng Anh".
 */
const VIETNAMESE_COMPOUND_HEADS = new Set(["thứ", "tiếng", "chủ", "tháng"]);

const VIETNAMESE_LETTERS = /[ăâđêôơưàáảãạằắẳẵặầấẩẫậèéẻẽẹềếểễệìíỉĩịòóỏõọồốổỗộờớởỡợùúủũụừứửữựỳýỷỹỵ]/iu;

function isVietnamesePrompt(prompt: string): boolean {
  return VIETNAMESE_LETTERS.test(prompt);
}

function tokenize(prompt: string): Token[] {
  const tokens: Token[] = [];
  for (const match of prompt.matchAll(/\p{L}[\p{L}\p{M}'’-]*/gu)) {
    const value = match[0]!;
    const start = match.index ?? 0;
    const previous = tokens.at(-1);
    const gap = prompt.slice(previous ? previous.end : 0, start);
    const honorificDot = previous !== undefined && ENGLISH_HONORIFICS.has(previous.lower) && /^\.\s*$/u.test(gap);
    const sentenceInitial = previous === undefined || (!honorificDot && /[.?!:;\n]/u.test(gap));
    tokens.push({
      value,
      lower: value.toLocaleLowerCase("en-US"),
      start,
      end: start + value.length,
      capitalized: /^\p{Lu}/u.test(value) && /\p{Ll}/u.test(value),
      sentenceInitial
    });
  }
  return tokens;
}

function entityTokens(values: readonly Token[]): string[] {
  return values
    .map((token) => token.lower.replace(/[’']s$/u, ""))
    .filter((token) => token.length > 1);
}

export function extractPromptEntities(prompt: string): PromptEntity[] {
  const text = prompt.normalize("NFKC");
  const vietnamese = isVietnamesePrompt(text);
  const tokens = tokenize(text);
  const entities: PromptEntity[] = [];
  const isHonorific = (token: Token | undefined) =>
    token !== undefined && (ENGLISH_HONORIFICS.has(token.lower) || VIETNAMESE_HONORIFICS.has(token.lower));

  let index = 0;
  while (index < tokens.length) {
    const first = tokens[index]!;
    if (!first.capitalized) { index += 1; continue; }
    // A capitalized run: consecutive capitalized tokens separated only by spaces.
    const run: Token[] = [first];
    while (index + run.length < tokens.length) {
      const next = tokens[index + run.length]!;
      const gap = text.slice(run.at(-1)!.end, next.start);
      if (!next.capitalized || !/^\s+$/u.test(gap)) break;
      run.push(next);
    }
    const previous = index > 0 ? tokens[index - 1] : undefined;
    index += run.length;

    let members = run;
    let evidence: PromptEntityEvidence;
    if (isHonorific(previous) && !first.sentenceInitial) {
      evidence = "honorific";
    } else if (first.sentenceInitial) {
      // Sentence capitalization explains the first word only.
      const firstIsExplained = vietnamese || ENGLISH_FUNCTION_WORDS.has(first.lower) || isHonorific(first);
      members = firstIsExplained ? run.slice(1) : run;
      if (members.length === 0) continue;
      evidence = members.length < run.length ? (isHonorific(first) ? "honorific" : "multi_word") : "sentence_initial";
    } else {
      if (vietnamese && previous && VIETNAMESE_COMPOUND_HEADS.has(previous.lower)) continue;
      evidence = run.length > 1 ? "multi_word" : "mid_sentence";
    }
    const memberTokens = entityTokens(members.filter((token) => !isHonorific(token)));
    if (memberTokens.length === 0) continue;
    entities.push({ text: members.map((token) => token.value).join(" "), tokens: memberTokens, evidence });
  }
  return entities;
}

/** Flattened lower-case entity tokens (unique). */
export function promptEntities(prompt: string): string[] {
  return [...new Set(extractPromptEntities(prompt).flatMap((entity) => entity.tokens))];
}

function containsWord(haystack: string, word: string): boolean {
  const escaped = word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`(?:^|[^\\p{L}\\p{N}])${escaped}(?:$|[^\\p{L}\\p{N}])`, "u").test(haystack);
}

/** Entities named in the prompt with at least one token missing from the source. */
export function ungroundedPromptEntities(prompt: string, source: string): PromptEntity[] {
  const normalizedSource = source.normalize("NFKC").toLocaleLowerCase("en-US");
  return extractPromptEntities(prompt).filter((entity) => entity.tokens.some((token) => !containsWord(normalizedSource, token)));
}

export function containsPromptEntities(text: string, prompt: string): boolean {
  return ungroundedPromptEntities(prompt, text).length === 0;
}
