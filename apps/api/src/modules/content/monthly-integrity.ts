import { normalizeWeeklyReviewReadAloud } from "@e4s/domain/monthly";
import { MONTHLY_REVIEW_COMPONENTS, MONTHLY_REVIEW_SECTIONS } from "./monthly-review-quality.js";

/**
 * Structural checks a monthly lesson must pass to render and play (13/11).
 * An Operator may approve a day despite severe quality findings
 * (`acknowledgeSevereFindings`), but never past these: a missing part, an
 * exercise without a question, a choice whose answer matches none of its
 * options, a listening item with nothing to play, or a review section without
 * items would break the learner lesson. They stay hard-blocking.
 */
export interface MonthlyIntegrityIssue {
  component: string;
  /** Vietnamese, Operator-facing: "Ngữ pháp: câu luyện 4 có đáp án không nằm trong các lựa chọn". */
  message: string;
  /** 1-based question (daily grammar practice row, review item) the issue is on, when it is on one. */
  item?: number;
  /** 1-based retry version of a review item. */
  variant?: number;
}

const DAILY_COMPONENTS = [
  "objective", "instruction", "vocabulary", "grammar", "pronunciation",
  "listening", "reading", "writing", "word_class", "word_use", "speaking"
] as const;
const DAILY_CHOICE_PARTS = ["listening", "reading", "word_class", "word_use"] as const;
const REVIEW_CHOICE_SECTIONS = ["listening", "word_use", "word_class", "grammar", "reading"] as const;

const TITLES: Record<string, string> = {
  objective: "Mục tiêu bài học", instruction: "Hướng dẫn làm bài", vocabulary: "Từ vựng", grammar: "Ngữ pháp", pronunciation: "Phát âm",
  listening: "Nghe", reading: "Đọc", writing: "Viết", word_class: "Từ loại", word_use: "Dùng từ", speaking: "Nói"
};

type Content = Record<string, unknown>;

function isRecord(value: unknown): value is Content {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

/** Answer/option comparison: case, surrounding/repeated spaces and typographic apostrophes never decide a match. */
function key(value: string): string {
  return value.normalize("NFKC").replace(/[‘’ʼ]/gu, "'").replace(/\s+/gu, " ").trim().toLocaleLowerCase("en-US");
}

/** Why a choice question cannot be answered (null when it can): fewer than 2 options, or an answer matching none of them. */
function choiceProblem(question: Content): string | null {
  const options = Array.isArray(question.options) ? question.options.filter((value): value is string => typeof value === "string" && Boolean(value.trim())) : [];
  if (options.length < 2) return "cần ít nhất 2 lựa chọn";
  const answer = text(question.answer);
  if (!answer) return "chưa có đáp án";
  return options.some((option) => key(option) === key(answer)) ? null : "có đáp án không nằm trong các lựa chọn";
}

export function monthlyLessonIntegrityIssues(kind: "new" | "review", parts: ReadonlyArray<{ code: string; content: unknown }>): MonthlyIntegrityIssue[] {
  const issues: MonthlyIntegrityIssue[] = [];
  const add = (component: string, message: string, at: { item?: number; variant?: number } = {}) => issues.push({ component, message: `${TITLES[component] ?? component}: ${message}`, ...at });
  const byCode = new Map(parts.map((part) => [part.code, isRecord(part.content) ? part.content : {}]));
  for (const code of kind === "review" ? MONTHLY_REVIEW_COMPONENTS : DAILY_COMPONENTS) {
    if (!byCode.has(code)) add(code, "thiếu phần này");
  }
  const vocabulary = byCode.get("vocabulary");
  if (vocabulary && !(Array.isArray(vocabulary.items) && vocabulary.items.some((item) => isRecord(item) ? Boolean(text(item.word)) : Boolean(text(item))))) add("vocabulary", "chưa có từ nào");

  if (kind === "new") {
    for (const code of DAILY_CHOICE_PARTS) {
      const content = byCode.get(code);
      if (!content) continue;
      if (!text(content.prompt) && !text(content.question)) add(code, "chưa có câu hỏi");
      const problem = choiceProblem(content);
      if (problem) add(code, problem);
    }
    const listening = byCode.get("listening");
    if (listening && !text(listening.script) && !text(listening.text) && !text(listening.audioUrl) && !text(listening.audioText)) add("listening", "không có nội dung để phát");
    const reading = byCode.get("reading");
    if (reading && !text(reading.text) && !text(reading.passage)) add("reading", "chưa có đoạn văn");
    const writing = byCode.get("writing");
    if (writing) {
      if (!text(writing.prompt) && !text(writing.question)) add("writing", "chưa có đề bài");
      if (!text(writing.answer) && !text(writing.modelAnswer)) add("writing", "chưa có đáp án");
      else if (Array.isArray(writing.options) && writing.options.length && ["mcq", "choice"].includes(text(writing.type).toLowerCase())) {
        const problem = choiceProblem(writing);
        if (problem) add("writing", problem);
      }
    }
    const speaking = byCode.get("speaking");
    if (speaking && !text(speaking.prompt) && !text(speaking.instruction) && !text(speaking.sample)) add("speaking", "chưa có yêu cầu");
    const grammar = byCode.get("grammar");
    const grammarItems = grammar && Array.isArray(grammar.items) ? grammar.items.filter(isRecord) : [];
    grammarItems.forEach((item, index) => {
      if (!Array.isArray(item.options)) return;
      const problem = choiceProblem(item);
      if (problem) add("grammar", `câu luyện ${index + 1} ${problem}`, { item: index + 1 });
    });
    return issues;
  }

  for (const code of MONTHLY_REVIEW_SECTIONS) {
    const content = byCode.get(code);
    if (!content) continue;
    const items = Array.isArray(content.items) ? content.items.filter(isRecord) : [];
    if (!items.length) {
      // The review grammar part may be study-only; its exercise items are optional there.
      if (code !== "grammar") add(code, "chưa có câu nào");
      continue;
    }
    const choice = (REVIEW_CHOICE_SECTIONS as readonly string[]).includes(code);
    items.forEach((raw, index) => {
      const item = code === "speaking" ? normalizeWeeklyReviewReadAloud(raw) : raw;
      const versions: Array<[string, Content, { item: number; variant?: number }]> = [[`câu ${index + 1}`, item, { item: index + 1 }], ...(Array.isArray(item.variants) ? item.variants.filter(isRecord) : []).map((variant, variantIndex): [string, Content, { item: number; variant?: number }] => [`câu ${index + 1} bản làm lại ${variantIndex + 1}`, variant, { item: index + 1, variant: variantIndex + 1 }])];
      for (const [label, question, at] of versions) {
        if (!text(question.prompt) && !text(question.question)) add(code, `${label} chưa có câu hỏi`, at);
        if (code === "listening" && !text(question.audioText) && !text(question.script) && !text(question.audioUrl)) add(code, `${label} không có từ để phát`, at);
        if (code === "speaking" && typeof question.passage === "string" && !Array.isArray(question.options) && !question.passage.trim()) add(code, `${label} thiếu câu đọc to`, at);
        if (choice || Array.isArray(question.options)) {
          const problem = choiceProblem(question);
          if (problem) add(code, `${label} ${problem}`, at);
        }
      }
    });
  }
  return issues;
}

type OverviewLesson = { kind: "new" | "review"; status: string; content?: { parts?: Array<{ code?: string; content?: Record<string, unknown> }> }; integrityIssues?: MonthlyIntegrityIssue[] };

/**
 * Adds `integrityIssues` to every saved draft (draft or failed) in an Operator
 * month overview: the same structural check "Vẫn duyệt" runs on the server, so
 * the page can explain the block instead of offering an override that is refused.
 */
export function withMonthlyIntegrityIssues<T extends { frameworks: Array<{ lessons: OverviewLesson[] }> }>(overview: T): T {
  for (const framework of overview.frameworks) {
    for (const lesson of framework.lessons) {
      const parts = lesson.content?.parts;
      if (!parts?.length || (lesson.status !== "draft" && lesson.status !== "failed")) continue;
      const issues = monthlyLessonIntegrityIssues(lesson.kind, parts.map((part) => ({ code: part.code ?? "", content: part.content ?? {} })));
      if (issues.length) lesson.integrityIssues = issues;
    }
  }
  return overview;
}
