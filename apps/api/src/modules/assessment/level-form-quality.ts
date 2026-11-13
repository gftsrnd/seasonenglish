/**
 * Content gate for AI-generated level-up forms (WP5). It runs after the
 * answer-position shuffle and before the draft is saved.
 *
 * - severe issues fail generation (`LEVEL_FORM_GENERATION_FAILED`, nothing is saved);
 * - light issues are saved on the draft and shown to the Operator, who must
 *   still read every answer key before publishing (decision D3).
 *
 * The gate is text-only (no AI call) and errs on the side of a light warning
 * when a heuristic cannot be sure.
 */

export type LevelFormQualitySeverity = "severe" | "light";

export interface LevelFormQualityIssue {
  code:
    | "LEVEL_FORM_DUPLICATE_OPTIONS"
    | "LEVEL_FORM_LISTENING_PARTS"
    | "LEVEL_FORM_NOT_QUESTION_KEY"
    | "LEVEL_FORM_NOT_QUESTION_AMBIGUOUS"
    | "LEVEL_FORM_HOW_MANY_MISMATCH"
    | "LEVEL_FORM_DUPLICATE_PROMPT"
    | "LEVEL_FORM_NEAR_DUPLICATE_QUESTIONS"
    | "LEVEL_FORM_ANSWER_POSITION_BIAS"
    | "LEVEL_FORM_STATEMENT_UNSUPPORTED"
    | "LEVEL_FORM_REPEATED_CONTEXT";
  severity: LevelFormQualitySeverity;
  section: "listening" | "reading" | "form";
  /** 0-based question index inside the section, when the issue is about one question. */
  questionIndex?: number;
  message: string;
}

export interface LevelFormQualityChoice {
  prompt: string;
  options: string[];
  correctIndex: number;
}

export interface LevelFormQualityInput {
  /** Five part scripts in order, or null when the script has no canonical Part 1–5 labels. */
  listeningParts: string[] | null;
  /** The whole listening script (fallback source when parts are missing). */
  listeningScript: string;
  listening: LevelFormQualityChoice[];
  readingPassage: string;
  reading: LevelFormQualityChoice[];
}

export interface LevelFormQualityReport {
  passed: boolean;
  severe: LevelFormQualityIssue[];
  light: LevelFormQualityIssue[];
}

/** Stored on a generated draft blueprint (`levelFormQuality`). */
export interface LevelFormQualityRecord {
  checkedAt: string;
  warnings: LevelFormQualityIssue[];
  /** What the generation auto-fix changed before the draft was shown ("Hệ thống đã tự sửa"). */
  autoFixed?: string[];
}

/** Near-duplicate pair: key-word overlap (overlap coefficient) and prompt+key Jaccard similarity. */
export const LEVEL_FORM_NEAR_DUPLICATE_KEY_OVERLAP = 0.6;
export const LEVEL_FORM_NEAR_DUPLICATE_SIMILARITY = 0.4;
export const LEVEL_FORM_MAX_POSITION_SHARE = 0.35;
const LISTENING_QUESTIONS_PER_PART = 4;

// ---------------------------------------------------------------- title

const SECTION_SUFFIX = /\s*(?:[–—:|-]\s*|\(\s*)(?:the\s+)?listening(?:\s+(?:section|part|test|paper|questions?))?(?:\s*\([^)]*\))?\s*\)?\s*$/i;
const SECTION_PREFIX = /^\s*(?:the\s+)?listening(?:\s+(?:section|part|test|paper))?\s*[–—:|-]\s*/i;

/**
 * The listening slice also returns the form title and models often name the
 * slice ("… – Listening Section (20 points)"). The stored title is the title
 * of the whole exam, so a trailing or leading section label is removed.
 */
export function levelFormExamTitle(raw: string, targetLevel: string): string {
  let title = raw.trim();
  for (let guard = 0; guard < 3 && (SECTION_SUFFIX.test(title) || SECTION_PREFIX.test(title)); guard += 1) {
    title = title.replace(SECTION_SUFFIX, "").replace(SECTION_PREFIX, "").trim();
  }
  const sectionOnly = /^(?:the\s+)?listening(?:\s+(?:section|part|test|paper|questions?))?(?:\s*\([^)]*\))?$/i.test(title);
  return title.length >= 3 && !sectionOnly ? title : `Workplace English ${targetLevel} Promotion Test`;
}

// ---------------------------------------------------------------- listening parts

function listeningPartMatches(script: string): RegExpMatchArray[] | null {
  const matches = [...script.matchAll(/(?:^|\n)\s*Part\s+([1-5])\s*[.:–-]?\s*/gi)];
  return matches.length === 5 && matches.every((match, index) => Number(match[1]) === index + 1) ? matches : null;
}

/** True when the script has exactly five labelled parts, Part 1 through Part 5, in order. */
export function hasCanonicalLevelFormListeningParts(script: string): boolean {
  return listeningPartMatches(script) !== null;
}

/** Splits the listening script on its Part 1–5 labels (placeholder parts when the labels are missing). */
export function splitLevelFormListeningParts(script: string): Array<{ title: string; script: string }> {
  const matches = listeningPartMatches(script);
  if (matches) {
    const intro = script.slice(0, matches[0]!.index).trim();
    return matches.map((match, index) => {
      const nextOffset = matches[index + 1]?.index ?? script.length;
      const body = script.slice((match.index ?? 0) + match[0].length, nextOffset).trim();
      const firstLine = body.split(/\r?\n/).map((line) => line.trim()).find(Boolean);
      const firstSentence = body.match(/^(.{1,90}?[.!?])(?:\s|$)/)?.[1]?.trim();
      return {
        title: firstLine && firstLine.length <= 90 && !/:\s/.test(firstLine)
          ? firstLine
          : firstSentence && !/:\s/.test(firstSentence) ? firstSentence : `Listening ${index + 1}`,
        script: [index === 0 ? intro : "", body].filter(Boolean).join("\n\n")
      };
    });
  }
  return Array.from({ length: 5 }, (_, index) => ({
    title: `Listening ${index + 1}`,
    script: index === 0 ? script : `Audio script for Part ${index + 1} is required.`
  }));
}

/** Gate input from the canonical AI output (`LevelFormTaskOutput`). */
export function levelFormQualityInputFromOutput(output: {
  listening: { script: string; questions: LevelFormQualityChoice[] };
  reading: { passage: string; questions: LevelFormQualityChoice[] };
}): LevelFormQualityInput {
  const parts = hasCanonicalLevelFormListeningParts(output.listening.script)
    ? splitLevelFormListeningParts(output.listening.script).map((part) => part.script)
    : null;
  return {
    listeningParts: parts,
    listeningScript: output.listening.script,
    listening: output.listening.questions,
    readingPassage: output.reading.passage,
    reading: output.reading.questions
  };
}

interface SectionLike {
  code: string;
  groups: Array<{
    stimulus?: { type: string; text?: string; lines?: Array<{ speaker?: string; text: string }> } | undefined;
    tasks: Array<{ prompt: string; responseType?: string; options?: Array<{ value: string; label: string }>; correctAnswer?: string | null }>;
  }>;
}

/** Gate input from a saved blueprint / detail view (letter keys A–D), so Operator edits are re-checked. */
export function levelFormQualityInputFromSections(sections: SectionLike[]): LevelFormQualityInput {
  const choices = (section: SectionLike | undefined) => (section?.groups ?? []).flatMap((group) => group.tasks
    .filter((task) => task.responseType === undefined || task.responseType === "single_choice")
    .map((task) => {
      const options = task.options ?? [];
      return { prompt: task.prompt, options: options.map((option) => option.label), correctIndex: options.findIndex((option) => option.value === task.correctAnswer) };
    }));
  const listening = sections.find((section) => section.code === "listening");
  const reading = sections.find((section) => section.code === "reading");
  const partScripts = (listening?.groups ?? []).map((group) => (group.stimulus?.lines ?? []).map((line) => line.text).join("\n").trim());
  const placeholder = (text: string) => !text || /^Audio script for Part \d is required\.$/.test(text);
  return {
    listeningParts: partScripts.length === 5 && !partScripts.some(placeholder) ? partScripts : null,
    listeningScript: partScripts.join("\n\n"),
    listening: choices(listening),
    readingPassage: (reading?.groups ?? []).map((group) => group.stimulus?.type === "passage" ? group.stimulus.text ?? "" : "").filter(Boolean).join("\n\n"),
    reading: choices(reading)
  };
}

// ---------------------------------------------------------------- text helpers

const STOPWORDS = new Set(("a an the and or but of to in on at for by with from as is are was were be been being am do does did "
  + "will would shall should can could may might must has have had it its this that these those there their they them "
  + "he she his her we our you your i me my not no any some all each every which who whom what when where why how "
  + "than then so if into onto about up out over under also only just more most very such").split(" "));
const NEGATION = /\b(?:not|no|never|none|nobody|nothing|cannot|without)\b|n't\b/i;

function normaliseText(value: string): string {
  return value.toLocaleLowerCase().replace(/[’‘]/g, "'").replace(/[^\p{L}\p{N}'\s]/gu, " ").replace(/\s+/g, " ").trim();
}

function stem(word: string): string {
  let value = word.replace(/'s$/, "").replace(/'/g, "");
  if (value.length > 4 && value.endsWith("ies")) value = `${value.slice(0, -3)}y`;
  else if (value.length > 4 && value.endsWith("es") && /(?:ch|sh|x|ss|zz)es$/.test(value)) value = value.slice(0, -2);
  else if (value.length > 3 && value.endsWith("s") && !value.endsWith("ss")) value = value.slice(0, -1);
  if (value.length > 5 && value.endsWith("ing")) value = value.slice(0, -3);
  else if (value.length > 4 && value.endsWith("ed")) value = value.slice(0, -2);
  else if (value.length > 4 && value.endsWith("e")) value = value.slice(0, -1);
  return value;
}

function contentStems(value: string): string[] {
  return normaliseText(value).split(" ").filter((word) => word && !STOPWORDS.has(word)).map(stem).filter(Boolean);
}

function stemSet(value: string): Set<string> {
  return new Set(contentStems(value));
}

/** Content words for similarity: clock times stay one token ("8:30" -> "830"), single letters ("a.m.") are dropped. */
function similarityStems(value: string): Set<string> {
  return new Set(contentStems(value.replace(/\b(\d{1,2})[:.](\d{2})\b/g, "$1$2")).filter((word) => word.length > 1));
}

function overlapCoefficient(left: Set<string>, right: Set<string>): number {
  if (!left.size || !right.size) return 0;
  let shared = 0;
  for (const word of left) if (right.has(word)) shared += 1;
  return shared / Math.min(left.size, right.size);
}

function jaccard(left: Set<string>, right: Set<string>): number {
  let shared = 0;
  for (const word of left) if (right.has(word)) shared += 1;
  const union = left.size + right.size - shared;
  return union ? shared / union : 0;
}

/**
 * Pairs of questions (0-based indexes) in one section that likely ask the same
 * fact in different words: their keys share most content words and the
 * prompt + key texts are similar. Exact duplicate prompts are left to the
 * severe LEVEL_FORM_DUPLICATE_PROMPT rule.
 */
export function levelFormNearDuplicatePairs(questions: LevelFormQualityChoice[]): Array<[number, number]> {
  const items = questions.map((question) => {
    const key = question.options[question.correctIndex] ?? "";
    return { prompt: normaliseText(question.prompt), key: similarityStems(key), all: similarityStems(`${question.prompt} ${key}`) };
  });
  const pairs: Array<[number, number]> = [];
  items.forEach((left, leftIndex) => items.slice(leftIndex + 1).forEach((right, offset) => {
    if (!left.key.size || !right.key.size || left.prompt === right.prompt) return;
    if (overlapCoefficient(left.key, right.key) >= LEVEL_FORM_NEAR_DUPLICATE_KEY_OVERLAP
      && jaccard(left.all, right.all) >= LEVEL_FORM_NEAR_DUPLICATE_SIMILARITY) pairs.push([leftIndex, leftIndex + offset + 1]);
  }));
  return pairs;
}

function sentences(value: string): string[] {
  return value.split(/(?<=[.!?])\s+|\n+/).map((sentence) => sentence.trim()).filter(Boolean);
}

const NUMBER_WORDS: Record<string, number> = {
  zero: 0, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10,
  eleven: 11, twelve: 12, thirteen: 13, fourteen: 14, fifteen: 15, sixteen: 16, seventeen: 17, eighteen: 18,
  nineteen: 19, twenty: 20, thirty: 30, forty: 40, fifty: 50, hundred: 100,
  once: 1, twice: 2, both: 2, single: 1, pair: 2, couple: 2, dozen: 12
};

/** The count an answer option states ("Twice", "3", "Three times"); null when it states none. */
function optionCount(option: string): number | null {
  const text = normaliseText(option);
  const digit = text.match(/\b(\d{1,4})\b/);
  if (digit) return Number(digit[1]);
  for (const word of text.split(" ")) if (word in NUMBER_WORDS && word !== "both" && word !== "pair" && word !== "couple") return NUMBER_WORDS[word]!;
  return null;
}

/** Counts stated in a source text; clock times ("7:30") and list enumerators ("3. ") are ignored. */
function sourceCounts(source: string): Set<number> {
  const counts = new Set<number>();
  const cleaned = source
    .replace(/\b\d{1,2}[:.]\d{2}\b/g, " ")
    .replace(/(^|\n)\s*\d{1,2}[.)]\s/g, "$1 ");
  for (const match of cleaned.matchAll(/\b\d{1,4}\b/g)) counts.add(Number(match[0]));
  for (const word of normaliseText(cleaned).split(" ")) if (word in NUMBER_WORDS) counts.add(NUMBER_WORDS[word]!);
  return counts;
}

function optionPresent(option: string, source: Set<string>): boolean | null {
  const words = contentStems(option);
  if (!words.length) return null;
  return words.every((word) => source.has(word));
}

function isNotQuestion(prompt: string): boolean {
  return /\bNOT\b/.test(prompt)
    || /\b(?:is|are|was|were|does|do|did)\s+not\s+(?:listed|mentioned|included|stated|given|shown|named|required|allowed|offered|provided|part)\b/i.test(prompt)
    || /\b(?:isn't|aren't|wasn't|weren't)\s+(?:listed|mentioned|included|stated|given|shown|named)\b/i.test(prompt);
}

function isStatementQuestion(prompt: string): boolean {
  return /\b(?:statement|sentence)\b[^?]*\b(?:true|correct|accurate)\b/i.test(prompt)
    || /\bwhich of the following is (?:true|correct|accurate)\b/i.test(prompt);
}

const CONTEXT_NAME = /\b([A-Z][a-z]+(?:\s[A-Z][a-z]+){0,2})\s+(Logistics|Ltd|Limited|Group|Company|Corporation|Corp|Inc|Solutions|Systems|Services|Industries|Technologies|Partners|Consulting|Bank|Hotel|Hospital|Airlines|Foods|Retail|Motors|Software|Media|Agency|depot|office|branch|warehouse|site|centre|center|plant|factory|store)\b/g;

function contextNames(text: string): Set<string> {
  return new Set([...text.matchAll(CONTEXT_NAME)].map((match) => match[1]!.trim()).filter((name) => !/^(?:Part|The|Our|This|Head|Main|Post|Room|Meeting)$/.test(name)));
}

// ---------------------------------------------------------------- gate

const SECTION_LABEL = { listening: "Nghe", reading: "Đọc" } as const;

function questionLabel(section: "listening" | "reading", index: number): string {
  return `${SECTION_LABEL[section]} câu ${index + 1}`;
}

/** Runs every WP5 rule. `passed` is false when at least one severe issue exists. */
export function evaluateLevelFormQuality(input: LevelFormQualityInput): LevelFormQualityReport {
  const issues: LevelFormQualityIssue[] = [];
  const add = (issue: LevelFormQualityIssue) => issues.push(issue);

  // Part 1–5 split of the listening script.
  if (!input.listeningParts) add({
    code: "LEVEL_FORM_LISTENING_PARTS", severity: "severe", section: "listening",
    message: "Kịch bản nghe không có đủ năm phần ghi rõ Part 1 đến Part 5 theo đúng thứ tự."
  });

  const seenPrompts = new Map<string, string>();
  const readingSource = stemSet(input.readingPassage);
  const wholeListening = stemSet(input.listeningScript);
  const partSources = (input.listeningParts ?? []).map((part) => stemSet(part));

  for (const section of ["listening", "reading"] as const) {
    const questions = input[section];
    const positions = [0, 0, 0, 0];
    questions.forEach((question, index) => {
      const label = questionLabel(section, index);
      const sourceText = section === "reading"
        ? input.readingPassage
        : input.listeningParts?.[Math.floor(index / LISTENING_QUESTIONS_PER_PART)] ?? input.listeningScript;
      const source = section === "reading" ? readingSource : partSources[Math.floor(index / LISTENING_QUESTIONS_PER_PART)] ?? wholeListening;
      const key = question.options[question.correctIndex];

      // Four distinct options.
      const normalised = question.options.map((option) => normaliseText(option).replace(/\s*\.$/, ""));
      if (new Set(normalised).size !== question.options.length || normalised.some((option) => !option)) add({
        code: "LEVEL_FORM_DUPLICATE_OPTIONS", severity: "severe", section, questionIndex: index,
        message: `${label}: các lựa chọn bị trùng hoặc để trống.`
      });

      // No duplicate prompts anywhere in the form.
      const promptKey = normaliseText(question.prompt);
      const previous = seenPrompts.get(promptKey);
      if (promptKey && previous) add({
        code: "LEVEL_FORM_DUPLICATE_PROMPT", severity: "severe", section, questionIndex: index,
        message: `${label} trùng đề bài với ${previous}.`
      });
      else if (promptKey) seenPrompts.set(promptKey, label);

      if (key === undefined) return;
      if (question.correctIndex >= 0 && question.correctIndex < positions.length) positions[question.correctIndex]! += 1;

      // NOT question: exactly one option is absent from the source, and it is the key.
      if (isNotQuestion(question.prompt)) {
        const presence = question.options.map((option) => optionPresent(option, source));
        const absent = presence.flatMap((present, optionIndex) => present === false ? [optionIndex] : []);
        // A key named in a negated sentence ("Lunch is not included") is a valid NOT answer.
        const keyStems = contentStems(key);
        const keyAffirmed = keyStems.length > 0 && sentences(sourceText).some((sentence) => {
          const words = new Set(contentStems(sentence));
          return !NEGATION.test(sentence) && keyStems.every((word) => words.has(word));
        });
        if (keyAffirmed && absent.length >= 1 && !absent.includes(question.correctIndex)) add({
          code: "LEVEL_FORM_NOT_QUESTION_KEY", severity: "severe", section, questionIndex: index,
          message: `${label} (câu NOT): đáp án “${key}” có trong bài, còn “${question.options[absent[0]!]}” không có trong bài; đáp án sai hoặc câu có hai đáp án đúng.`
        });
        else if (absent.length !== 1 || absent[0] !== question.correctIndex) add({
          code: "LEVEL_FORM_NOT_QUESTION_AMBIGUOUS", severity: "light", section, questionIndex: index,
          message: `${label} (câu NOT): không xác định được đúng một lựa chọn vắng mặt trong bài; cần đọc lại đáp án.`
        });
      }

      // "How many" count must be stated in the source (warning only).
      if (/^\s*how many\b/i.test(question.prompt)) {
        const count = optionCount(key);
        if (count !== null && !sourceCounts(sourceText).has(count)) add({
          code: "LEVEL_FORM_HOW_MANY_MISMATCH", severity: "light", section, questionIndex: index,
          message: `${label} (câu đếm): con số của đáp án “${key}” không thấy trong bài; cần đếm lại.`
        });
      }

      // "Which statement is correct?": a negated key must be backed by a negated source sentence.
      if (isStatementQuestion(question.prompt) && NEGATION.test(key)) {
        const keyStems = new Set(contentStems(key));
        let best = { overlap: 0, negated: false };
        for (const sentence of sentences(sourceText)) {
          const overlap = contentStems(sentence).filter((word) => keyStems.has(word)).length;
          if (overlap > best.overlap) best = { overlap, negated: NEGATION.test(sentence) };
        }
        if (best.overlap > 0 && !best.negated) add({
          code: "LEVEL_FORM_STATEMENT_UNSUPPORTED", severity: "light", section, questionIndex: index,
          message: `${label}: đáp án phủ định “${key}” trái với câu gần nhất trong bài; cần đọc lại đáp án.`
        });
      }
    });

    if (questions.length) {
      const nearDuplicates = levelFormNearDuplicatePairs(questions);
      if (nearDuplicates.length) add({
        code: "LEVEL_FORM_NEAR_DUPLICATE_QUESTIONS", severity: "light", section,
        message: `Phần ${SECTION_LABEL[section]}: ${nearDuplicates.length} cặp câu có thể hỏi lại cùng một ý (${nearDuplicates.map(([left, right]) => `câu ${left + 1} và ${right + 1}`).join("; ")}); cần đọc lại và thay một câu trong mỗi cặp.`
      });
      const maxPosition = Math.max(...positions);
      if (questions.length >= 8 && maxPosition / questions.length > LEVEL_FORM_MAX_POSITION_SHARE) add({
        code: "LEVEL_FORM_ANSWER_POSITION_BIAS", severity: "severe", section,
        message: `Phần ${SECTION_LABEL[section]}: đáp án dồn vào vị trí ${"ABCD"[positions.indexOf(maxPosition)]} (${maxPosition}/${questions.length}).`
      });
    }
  }

  // Repeated context: the same organisation/site name in several parts (light).
  const texts = [...(input.listeningParts ?? [input.listeningScript]).map((text, index) => ({ label: input.listeningParts ? `Nghe phần ${index + 1}` : "Nghe", text })), { label: "Đọc", text: input.readingPassage }];
  const owners = new Map<string, string[]>();
  for (const { label, text } of texts) for (const name of contextNames(text)) owners.set(name, [...(owners.get(name) ?? []), label]);
  const repeated = [...owners].filter(([, labels]) => labels.length > 1);
  if (repeated.length) add({
    code: "LEVEL_FORM_REPEATED_CONTEXT", severity: "light", section: "form",
    message: `Bối cảnh lặp lại giữa các phần: ${repeated.map(([name, labels]) => `${name} (${labels.join(", ")})`).join("; ")}.`
  });

  const severe = issues.filter((issue) => issue.severity === "severe");
  return { passed: severe.length === 0, severe, light: issues.filter((issue) => issue.severity === "light") };
}

/** Thrown by the generate route when the gate finds severe issues. */
export class LevelFormQualityError extends Error {
  constructor(readonly issues: LevelFormQualityIssue[]) {
    super("LEVEL_FORM_GENERATION_FAILED");
  }
}
