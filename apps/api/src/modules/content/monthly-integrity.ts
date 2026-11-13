import { MONTHLY_REVIEW_COMPONENTS, MONTHLY_REVIEW_SECTIONS } from "./monthly-review-quality.js";

/**
 * Structural checks a monthly lesson must pass to render and play (13/11).
 * An Operator may approve a day despite severe quality findings
 * (`acknowledgeSevereFindings`), but never past these: a missing part, an
 * exercise without a question, a choice whose answer matches none of its
 * options, a listening item with nothing to play, or a review section without
 * items would break the learner lesson. They stay hard-blocking.
 */
export interface MonthlyIntegrityIssue { component: string; message: string }

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

function key(value: string): string {
  return value.normalize("NFKC").trim().toLocaleLowerCase("en-US");
}

/** Why a choice question cannot be answered (null when it can): fewer than 2 options, or an answer matching none of them. */
function choiceProblem(question: Content): string | null {
  const options = Array.isArray(question.options) ? question.options.filter((value): value is string => typeof value === "string" && Boolean(value.trim())) : [];
  if (options.length < 2) return "cần ít nhất 2 lựa chọn";
  const answer = text(question.answer);
  if (!answer) return "chưa có đáp án";
  return options.some((option) => key(option) === key(answer)) ? null : "đáp án không trùng lựa chọn nào";
}

export function monthlyLessonIntegrityIssues(kind: "new" | "review", parts: ReadonlyArray<{ code: string; content: unknown }>): MonthlyIntegrityIssue[] {
  const issues: MonthlyIntegrityIssue[] = [];
  const add = (component: string, message: string) => issues.push({ component, message: `${TITLES[component] ?? component}: ${message}` });
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
      if (problem) add("grammar", `câu luyện ${index + 1} ${problem}`);
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
    items.forEach((item, index) => {
      const versions: Array<[string, Content]> = [[`câu ${index + 1}`, item], ...(Array.isArray(item.variants) ? item.variants.filter(isRecord) : []).map((variant, variantIndex): [string, Content] => [`câu ${index + 1} bản làm lại ${variantIndex + 1}`, variant])];
      for (const [label, question] of versions) {
        if (!text(question.prompt) && !text(question.question)) add(code, `${label} chưa có câu hỏi`);
        if (code === "listening" && !text(question.audioText) && !text(question.script) && !text(question.audioUrl)) add(code, `${label} không có từ để phát`);
        if (choice || Array.isArray(question.options)) {
          const problem = choiceProblem(question);
          if (problem) add(code, `${label} ${problem}`);
        }
      }
    });
  }
  return issues;
}
