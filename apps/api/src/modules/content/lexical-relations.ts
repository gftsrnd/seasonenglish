/**
 * Curated lexical-relation evidence for common CEFR workplace vocabulary.
 *
 * This is not a list of words that must have a relation. Each entry records
 * one specific sense (word + part of speech + sense keywords) and the lowest
 * CEFR level at which its listed synonym/antonym is appropriate. It is used
 * only to reject an AI self-exemption ("no_natural_relation" /
 * "above_cefr_level") when a level-appropriate relation is known to exist for
 * that same sense. Words without an entry keep the AI's declared status and
 * are still counted in the weekly coverage warning.
 */
export type CuratedLexicalRelation = {
  word: string;
  partOfSpeech: "noun" | "verb" | "adjective" | "adverb";
  /** Lower-case English or Vietnamese keywords that identify the sense in `meaning`. */
  senseKeywords: readonly string[];
  /** Lowest CEFR level at which the listed relations are appropriate. */
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

function cefrRank(cefr: string): number {
  const index = CEFR_ORDER.indexOf(cefr as (typeof CEFR_ORDER)[number]);
  return index < 0 ? CEFR_ORDER.length : index;
}

function normalize(value: string): string {
  return value.normalize("NFKC").trim().toLocaleLowerCase("en-US");
}

/**
 * Returns the curated relation for this exact word, part of speech and sense
 * when its relations are appropriate at `cefr`; otherwise undefined.
 */
export function curatedRelationEvidence(
  item: { word: string; partOfSpeech?: string | null; meaning?: string | null },
  cefr: string
): CuratedLexicalRelation | undefined {
  const word = normalize(item.word);
  const partOfSpeech = normalize(item.partOfSpeech ?? "");
  const meaning = normalize(item.meaning ?? "");
  return CURATED_LEXICAL_RELATIONS.find((entry) =>
    entry.word === word
    && entry.partOfSpeech === partOfSpeech
    && cefrRank(entry.minCefr) <= cefrRank(cefr)
    && (meaning.length === 0 || entry.senseKeywords.some((keyword) => meaning.includes(keyword)))
  );
}

/**
 * A self-exemption is credible unless curated evidence shows a relation for the
 * same sense that is appropriate at this CEFR level.
 */
export function relationExemptionIsCredible(
  item: { word: string; partOfSpeech?: string | null; meaning?: string | null },
  cefr: string
): boolean {
  return curatedRelationEvidence(item, cefr) === undefined;
}
