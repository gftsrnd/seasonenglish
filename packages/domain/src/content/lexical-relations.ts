/** Shared lexical-relation policy for generation, repair and operator review. */
export type CuratedLexicalRelation = {
  word: string;
  partOfSpeech: "noun" | "verb" | "adjective" | "adverb";
  senseKeywords: readonly string[];
  minCefr: "A1" | "A2" | "B1" | "B2" | "C1";
  synonyms?: readonly string[];
  antonyms?: readonly string[];
};

const CEFR_ORDER = ["A1", "A2", "B1", "B2", "C1"] as const;

export const CURATED_LEXICAL_RELATIONS: readonly CuratedLexicalRelation[] = [
  { word: "start", partOfSpeech: "verb", senseKeywords: ["bắt đầu", "begin", "start"], minCefr: "A1", synonyms: ["begin"], antonyms: ["finish", "stop"] },
  { word: "begin", partOfSpeech: "verb", senseKeywords: ["bắt đầu", "begin", "start"], minCefr: "A1", synonyms: ["start"], antonyms: ["finish", "end"] },
  { word: "finish", partOfSpeech: "verb", senseKeywords: ["hoàn thành", "kết thúc", "xong", "complete", "finish", "end"], minCefr: "A1", synonyms: ["complete"], antonyms: ["start", "begin"] },
  { word: "open", partOfSpeech: "verb", senseKeywords: ["mở", "open"], minCefr: "A1", antonyms: ["close"] },
  { word: "close", partOfSpeech: "verb", senseKeywords: ["đóng", "close", "shut"], minCefr: "A1", synonyms: ["shut"], antonyms: ["open"] },
  { word: "send", partOfSpeech: "verb", senseKeywords: ["gửi", "send"], minCefr: "A1", antonyms: ["receive"] },
  { word: "receive", partOfSpeech: "verb", senseKeywords: ["nhận", "receive", "get"], minCefr: "A2", synonyms: ["get"], antonyms: ["send"] },
  { word: "arrive", partOfSpeech: "verb", senseKeywords: ["đến", "tới", "arrive"], minCefr: "A1", antonyms: ["leave"] },
  { word: "early", partOfSpeech: "adjective", senseKeywords: ["sớm", "early"], minCefr: "A1", antonyms: ["late"] },
  { word: "late", partOfSpeech: "adjective", senseKeywords: ["muộn", "trễ", "late"], minCefr: "A1", antonyms: ["early"] },
  { word: "busy", partOfSpeech: "adjective", senseKeywords: ["bận", "busy"], minCefr: "A1", antonyms: ["free"] },
  { word: "correct", partOfSpeech: "adjective", senseKeywords: ["đúng", "chính xác", "correct", "right"], minCefr: "A1", synonyms: ["right"], antonyms: ["wrong", "incorrect"] },
  { word: "ready", partOfSpeech: "adjective", senseKeywords: ["sẵn sàng", "ready", "prepared"], minCefr: "A2", synonyms: ["prepared"] },
  { word: "agree", partOfSpeech: "verb", senseKeywords: ["đồng ý", "agree"], minCefr: "A2", antonyms: ["disagree"] },
  { word: "accept", partOfSpeech: "verb", senseKeywords: ["chấp nhận", "đồng ý nhận", "accept"], minCefr: "A2", antonyms: ["refuse", "reject"] },
  { word: "available", partOfSpeech: "adjective", senseKeywords: ["rảnh", "có sẵn", "có thể tham gia", "available", "free"], minCefr: "A2", synonyms: ["free"], antonyms: ["busy", "unavailable"] },
  { word: "increase", partOfSpeech: "verb", senseKeywords: ["tăng", "increase", "rise"], minCefr: "B1", synonyms: ["raise"], antonyms: ["decrease", "reduce"] },
  { word: "decrease", partOfSpeech: "verb", senseKeywords: ["giảm", "decrease", "reduce"], minCefr: "B1", synonyms: ["reduce"], antonyms: ["increase"] },
  { word: "approve", partOfSpeech: "verb", senseKeywords: ["phê duyệt", "duyệt", "chấp thuận", "approve"], minCefr: "B1", antonyms: ["reject"] },
  { word: "reject", partOfSpeech: "verb", senseKeywords: ["từ chối", "bác bỏ", "reject", "refuse"], minCefr: "B1", synonyms: ["refuse"], antonyms: ["accept", "approve"] },
  { word: "confirm", partOfSpeech: "verb", senseKeywords: ["xác nhận", "confirm"], minCefr: "B1", synonyms: ["verify"], antonyms: ["cancel"] },
  { word: "delay", partOfSpeech: "verb", senseKeywords: ["trì hoãn", "hoãn", "delay", "postpone"], minCefr: "B1", synonyms: ["postpone"] },
  { word: "postpone", partOfSpeech: "verb", senseKeywords: ["hoãn", "dời", "postpone", "delay"], minCefr: "B1", synonyms: ["delay"] }
];

type LexicalItem = {
  word?: unknown;
  type?: unknown;
  partOfSpeech?: unknown;
  meaning?: unknown;
  synonyms?: unknown;
  antonyms?: unknown;
  relationStatus?: unknown;
};

function normalize(value: unknown): string {
  return typeof value === "string" ? value.normalize("NFKC").trim().toLocaleLowerCase("en-US") : "";
}

function hasStructuredRelation(value: unknown): boolean {
  return Array.isArray(value)
    ? value.some((item) => typeof item === "string" ? Boolean(item.trim()) : Boolean(item && typeof item === "object"))
    : typeof value === "string" ? Boolean(value.trim()) : Boolean(value && typeof value === "object");
}

// These are labels or identifiers rather than teachable lexical targets.  They
// may legitimately have no same-level synonym or antonym.  This deliberately
// uses a positive allow-list: absence from our curated dictionary is never a
// reason for the model to exempt an ordinary workplace word.
const CALENDAR_OR_TIME_LABELS = new Set([
  "monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday",
  "january", "february", "march", "april", "may", "june", "july", "august", "september", "october", "november", "december",
  "today", "tomorrow", "yesterday", "morning", "afternoon", "evening", "tonight", "noon", "midnight", "slot", "date", "day", "week", "month", "year"
]);

function isNonLexicalLabelOrIdentifier(word: unknown): boolean {
  const raw = typeof word === "string" ? word.normalize("NFKC").trim() : "";
  const normalized = normalize(raw);
  if (!normalized) return false;
  if (CALENDAR_OR_TIME_LABELS.has(normalized)) return true;
  // Dates, numbers and system identifiers are not vocabulary targets.
  return /^\d+(?:[./-]\d+){0,2}$/u.test(raw)
    || /^[A-Z]{2,}(?:[-_]\d+)*$/u.test(raw);
}

export function curatedRelationEvidence(item: Pick<LexicalItem, "word" | "type" | "partOfSpeech" | "meaning">, cefr: string): CuratedLexicalRelation | undefined {
  const word = normalize(item.word);
  const partOfSpeech = normalize(item.partOfSpeech ?? item.type);
  const meaning = normalize(item.meaning);
  const cefrRank = CEFR_ORDER.indexOf(cefr as (typeof CEFR_ORDER)[number]);
  return CURATED_LEXICAL_RELATIONS.find((entry) =>
    entry.word === word
    && entry.partOfSpeech === partOfSpeech
    && CEFR_ORDER.indexOf(entry.minCefr) <= (cefrRank < 0 ? CEFR_ORDER.length : cefrRank)
    && (meaning.length === 0 || entry.senseKeywords.some((keyword) => meaning.includes(keyword)))
  );
}

export function relationExemptionIsCredible(item: Pick<LexicalItem, "word" | "type" | "partOfSpeech" | "meaning">, cefr: string): boolean {
  if (curatedRelationEvidence(item, cefr)) return false;
  return isNonLexicalLabelOrIdentifier(item.word);
}

/** True only when the vocabulary data meets the shared lexical-relation contract. */
export function lexicalRelationCoverageSatisfied(item: LexicalItem, cefr: string): boolean {
  if (hasStructuredRelation(item.synonyms) || hasStructuredRelation(item.antonyms)) return true;
  const status = item.relationStatus;
  return (status === "no_natural_relation" || status === "above_cefr_level")
    && relationExemptionIsCredible(item, cefr);
}
