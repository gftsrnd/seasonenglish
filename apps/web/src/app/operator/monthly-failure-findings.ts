import type { MonthlyIntegrityIssueView, MonthlyQualityFindingView } from "@e4s/contracts";
import { lessonPartsForTab, lessonPracticeCodes } from "../shared/lesson/structure.js";

/** Vietnamese section names, as the operator lesson preview titles them. */
export const MONTHLY_PART_TITLES: Record<string, string> = {
  objective: "Mục tiêu bài học", instruction: "Hướng dẫn làm bài", vocabulary: "Từ vựng", grammar: "Ngữ pháp", pronunciation: "Phát âm",
  listening: "Nghe", reading: "Đọc", writing: "Viết", word_class: "Từ loại", word_use: "Dùng từ", speaking: "Nói"
};

/** Friday review sections in the order MonthlyReviewPractice shows them. */
export const MONTHLY_REVIEW_SECTIONS: ReadonlyArray<{ code: string; title: string }> = [
  { code: "listening", title: "Nghe & nhận biết từ" },
  { code: "word_use", title: "Word use" },
  { code: "word_class", title: "Word form" },
  { code: "grammar", title: "Ngữ pháp" },
  { code: "reading", title: "Nghe – Đọc hiểu" },
  { code: "speaking", title: "Phát âm & Nói – Viết" }
];

type Part = { code?: string; title?: string; content?: Record<string, unknown> };
export interface MonthlyFindingContext { kind: "new" | "review"; parts: readonly Part[] }
/**
 * `component` is the lesson part the line points at (e.g. "word_use"), `code` the gate finding code.
 * `item`/`variant` (1-based) name the exact review question and retry version, `option` (0-based) the
 * flagged answer choice, when the gate says so; the editor jumps to that field.
 */
export interface MonthlyFindingLine { key: string; code: string; component: string; severity: "severe" | "light"; where: string; what: string; item?: number; variant?: number; option?: number }

const CHOICE_CODES = "listening|reading|writing|word_class|word_use|grammar|speaking";
const LABEL = new RegExp(`^(${CHOICE_CODES})(?: item (\\d+)(?: variant (\\d+))?)?`, "u");
const REPLACE_REAL_WORD = "thay bằng một từ tiếng Anh có thật.";

/**
 * Turns the API quality-gate findings (English hints written for the AI repair
 * loop) into one plain-Vietnamese line per problem for the Operator: WHERE it is
 * ("Câu 5 · Dùng từ", as the preview numbers it) and WHAT to fix. Unknown codes
 * keep the gate's own text so nothing is ever hidden.
 */
export function describeMonthlyFindings(findings: readonly MonthlyQualityFindingView[], context: MonthlyFindingContext): MonthlyFindingLine[] {
  return findings.flatMap((finding, index) => describeFinding(finding, context).map((line, lineIndex) => ({
    key: `${finding.code}-${index}-${lineIndex}`, code: finding.code, component: line.component ?? finding.component ?? "", severity: finding.severity, where: line.where, what: line.what,
    ...(line.item ? { item: line.item } : {}), ...(line.variant ? { variant: line.variant } : {}), ...(line.option !== undefined ? { option: line.option } : {})
  })));
}

type DescribedLine = { where: string; what: string; component?: string; item?: number; variant?: number; option?: number };

function describeFinding(finding: MonthlyQualityFindingView, context: MonthlyFindingContext): DescribedLine[] {
  const component = finding.component ?? "";
  const section = sectionLabel(component, context);
  const message = finding.message;
  const single = (what: string) => [{ where: section, what }];
  const perLabel = (body: string, describe: (segment: LabelSegment) => string, option?: (segment: LabelSegment) => number | undefined): DescribedLine[] | null => {
    const segments = labelSegments(body);
    return segments.length ? segments.map((segment) => {
      const optionIndex = option?.(segment);
      return {
        where: sectionLabel(segment.code, context, segment), what: describe(segment), component: segment.code,
        ...(segment.item ? { item: segment.item } : {}), ...(segment.variant ? { variant: segment.variant } : {}), ...(optionIndex !== undefined ? { option: optionIndex } : {})
      };
    }) : null;
  };
  switch (finding.code) {
    case "MONTHLY_INVENTED_WORD_FORM":
      return perLabel(afterMarker(message, "Fix: "), (segment) => {
        const words = (segment.detail ?? "").split(/,\s*/u).map((word) => word.trim()).filter(Boolean);
        if (!words.length) return `Có từ không có thật; ${REPLACE_REAL_WORD}`;
        const option = optionContaining(context.parts, segment, words[0]!);
        const quoted = words.map(quote).join(", ");
        return option !== undefined ? `Lựa chọn ${String.fromCharCode(65 + option)} dùng từ không có thật ${quoted}; ${REPLACE_REAL_WORD}` : `Có từ không có thật ${quoted}; ${REPLACE_REAL_WORD}`;
      }, (segment) => {
        const word = (segment.detail ?? "").split(/,\s*/u).map((value) => value.trim()).find(Boolean);
        return word ? optionContaining(context.parts, segment, word) : undefined;
      }) ?? single(`Có từ không có thật; ${REPLACE_REAL_WORD}`);
    case "MONTHLY_WORD_FORM_ASKS_WORD_CLASS":
      return perLabel(afterMarker(message, "Fix: "), () => "Câu hỏi đang hỏi từ loại; hãy viết một câu công việc có một chỗ trống (____) để học viên chọn dạng đúng của từ.")
        ?? single("Câu hỏi đang hỏi từ loại; hãy viết một câu có chỗ trống để chọn dạng đúng của từ.");
    case "MONTHLY_WORD_FORM_LABEL_OPTIONS":
      return perLabel(afterMarker(message, "Fix: "), () => "Các lựa chọn đang là tên từ loại (noun/verb…); thay bằng 4 dạng của từ, ví dụ decide / decision / decisive / decisively.")
        ?? single("Các lựa chọn đang là tên từ loại; thay bằng 4 dạng của từ.");
    case "MONTHLY_WORD_FORM_ANSWER_IS_HINT":
      return perLabel(afterMarker(message, "Fix: "), (segment) => `Đáp án ${segment.detail ? `${quote(segment.detail)} ` : ""}trùng với từ gợi ý trong ngoặc; chọn từ gợi ý cần đổi dạng.`)
        ?? single("Đáp án trùng với từ gợi ý trong ngoặc; chọn từ gợi ý cần đổi dạng.");
    case "MONTHLY_ANSWER_KEY_WRONG":
      return perLabel(afterMarker(message, "must be the key. "), (segment) => {
        const better = /"([^"]+)" is the correct option/u.exec(segment.rest ?? "")?.[1];
        return better ? `Đáp án đang đánh dấu chưa đúng; lựa chọn đúng là ${quote(better)}. Sửa đáp án và lời giải thích, hoặc viết lại câu.` : "Đáp án đang đánh dấu chưa đúng; sửa đáp án và lời giải thích, hoặc viết lại câu.";
      }) ?? single("Đáp án đang đánh dấu chưa đúng; sửa đáp án và lời giải thích, hoặc viết lại câu.");
    case "MONTHLY_ANSWER_KEY_DISPUTED":
      return perLabel(afterMarker(message, ": "), (segment) => {
        const found = /found "([^"]+)" correct, not the key "([^"]+)"/u.exec(segment.rest ?? "");
        return found ? `Đáp án ${quote(found[2]!)} chưa đúng; lựa chọn đúng là ${found[1]!.split("\" / \"").map(quote).join(" / ")}. Sửa đáp án và lời giải thích, hoặc viết lại câu.` : "Không có lựa chọn nào đúng hoàn toàn; viết lại câu hoặc các lựa chọn.";
      }) ?? single("Đáp án chưa đúng; sửa đáp án và lời giải thích, hoặc viết lại câu.");
    case "MONTHLY_ANSWER_NOT_UNIQUE":
      return perLabel(afterMarker(message, ": "), (segment) => {
        const options = [...(segment.rest ?? "").split(" are all correct")[0]!.matchAll(/"([^"]+)"/gu)].map((match) => quote(match[1]!));
        return `Có nhiều lựa chọn cùng đúng${options.length ? ` (${options.join(", ")})` : ""}; viết lại câu hoặc thay các lựa chọn sai cho rõ.`;
      }) ?? single("Có nhiều lựa chọn cùng đúng; viết lại câu hoặc thay các lựa chọn sai cho rõ.");
    case "MONTHLY_COMPONENT_MISSING": return single("Thiếu phần này; hãy soạn thêm.");
    case "MONTHLY_CORE_TERM_MISSING": return single(`Thiếu từ trọng tâm ${quote(message.split(" is required")[0]!.trim())} theo kế hoạch; thêm thẻ từ này.`);
    case "MONTHLY_SYNONYM_OR_ANTONYM_MISSING": return single(`Từ ${quote(message.split(" is missing")[0]!.trim())} chưa có từ đồng nghĩa hoặc trái nghĩa; thêm một từ.`);
    case "MONTHLY_RELATION_MEANING_MISSING": {
      const word = message.split(":")[0]!.trim();
      const list = message.split("fix or remove:")[1]?.trim();
      return single(`Từ ${quote(word)}: từ đồng nghĩa/trái nghĩa ngoài kế hoạch cần nghĩa ngắn; sửa hoặc xóa${list ? ` ${list}` : ""}.`);
    }
    case "MONTHLY_COLLOCATION_TRANSLATION": return single(`Cụm từ đi kèm của ${quote(message.split(":")[0]!.trim())} cần bản dịch tiếng Việt ngắn.`);
    case "MONTHLY_GRAMMAR_SCOPE_MISMATCH": {
      const formula = message.split("verbatim:")[1]?.trim();
      return single(`Công thức ngữ pháp chưa khớp kế hoạch${formula ? `; chép nguyên văn ${formula}` : ""}.`);
    }
    case "MONTHLY_SOUND_SCOPE_MISMATCH": return single("Âm hoặc các từ luyện phát âm chưa khớp kế hoạch; đặt lại đúng âm và từ đã chốt.");
    case "MONTHLY_DAILY_GRAMMAR_OBJECTIVE": return single("Phần ngữ pháp chưa ghi đúng mục tiêu của ngày; chép nguyên mục tiêu đã chốt.");
    case "MONTHLY_DAILY_GRAMMAR_EXAMPLES": return single("Cần ít nhất 3 ví dụ mới cho mục tiêu hôm nay, không chép ví dụ mẫu của tháng.");
    case "MONTHLY_DAILY_GRAMMAR_REPEATED": return single("Có ví dụ ngữ pháp chép lại từ bài trước; viết ví dụ mới.");
    case "MONTHLY_DAILY_GRAMMAR_WORDS": return single("Ví dụ ngữ pháp cần dùng ít nhất 2 từ trọng tâm của hôm nay.");
    case "MONTHLY_DAILY_GRAMMAR_PRACTICE": return single("Phần ngữ pháp cần 3–5 câu luyện có đáp án và lời giải thích.");
    case "MONTHLY_DAILY_GRAMMAR_QUESTION": return single("Mỗi câu ngữ pháp cần đề bài, 4 lựa chọn khác nhau, đáp án nằm trong các lựa chọn và lời giải thích.");
    case "MONTHLY_DAILY_GRAMMAR_RECALL": return single("Thiếu câu ôn lại chủ điểm A theo kế hoạch; thêm một câu.");
    case "MONTHLY_DAILY_GRAMMAR_RECALL_OFF_TOPIC": return single("Câu ôn chủ điểm A chưa kiểm tra đúng điểm ngữ pháp được gắn; viết lại câu này.");
    case "MONTHLY_GRAMMAR_FORMULA_EXAMPLE_MISMATCH": {
      // Advisory warning (never blocks approval): one line per grammar step whose formula rows and examples differ.
      const what = "Công thức ngữ pháp chưa có ví dụ cho mọi dòng; sửa tay để thêm ví dụ.";
      const steps = [...new Set([...message.matchAll(/grammar\.steps\[(\d+)\]/gu)].map((match) => Number(match[1]) + 1))];
      return steps.length ? steps.map((step) => ({ where: `${section} · bước ${step}`, what })) : single(what);
    }
    case "MONTHLY_GRAMMAR_EXAMPLE_VOICE": return single("Có ví dụ ngữ pháp sai thể (chủ động/bị động); sửa thành câu tiếng Anh đúng.");
    case "MONTHLY_COMBINED_PRONUNCIATION_POSITIONS": {
      // The gate lists `"word" ×N` pairs; a word inside a listed phrase ("checked" in "checked it") counts for the phrase only.
      const targets = [...message.matchAll(/"([^"]+)" ×(\d+)/gu)].map((match) => match[2] === "1" ? match[1] : `${match[1]} (${match[2]} lần)`);
      return single(`Đoạn đọc to cần đủ 8 vị trí luyện âm, mỗi từ đúng 1 lần${targets.length ? `: ${targets.join(", ")}` : ""}. Từ nằm trong cụm nối âm (như "checked it") không tính riêng, nên cần thêm một lần đứng riêng.`);
    }
    case "MONTHLY_EXERCISE_TRANSLATION": return single("Thêm bản dịch tiếng Việt ngắn cho câu hỏi và đáp án của từng bài tập.");
    case "MONTHLY_OBJECTIVE_CAN_DO": return single("Mục tiêu bài học chưa nói rõ học viên làm được gì; viết lại ngắn gọn, cụ thể.");
    case "MONTHLY_OFFENSIVE_WORD": {
      const words = message.split(":").slice(1).join(":").trim();
      return single(`Xóa từ thô tục hoặc xúc phạm${words ? `: ${words}` : ""}.`);
    }
    case "MONTHLY_INTERNAL_TERM_EXPOSED": {
      const terms = message.split(":")[1]?.split(". Rewrite")[0]?.trim();
      return single(`Có câu chữ nội bộ của kế hoạch hiện ra cho học viên${terms ? ` (${terms})` : ""}; viết lại cho học viên.`);
    }
    case "MONTHLY_REVIEW_VARIANT_MISSING": return single("Có câu thiếu bản làm lại (câu hỏi khác cùng điểm kiến thức); thêm bản làm lại.");
    case "MONTHLY_REVIEW_EXPLANATION_MISSING": return single("Có câu thiếu lời giải thích ngắn khi học viên làm sai; thêm lời giải thích.");
    default: return [{ where: section, what: message }];
  }
}

interface LabelSegment { code: string; item?: number; variant?: number; detail?: string; rest?: string }

/** "word_use (colleagueing); grammar item 2 (x)" or "word_use item 1: ...; ..." → one entry per labelled question. */
function labelSegments(body: string): LabelSegment[] {
  return body.split(/;\s+/u).flatMap((raw) => {
    const segment = raw.trim();
    const match = LABEL.exec(segment);
    if (!match) return [];
    const tail = segment.slice(match[0].length).trim();
    const detail = /^\(([^)]*)\)/u.exec(tail)?.[1];
    return [{
      code: match[1]!,
      ...(match[2] ? { item: Number(match[2]) } : {}),
      ...(match[3] ? { variant: Number(match[3]) } : {}),
      ...(detail !== undefined ? { detail } : {}),
      rest: tail.replace(/^:\s*/u, "")
    }];
  });
}

function afterMarker(message: string, marker: string): string {
  const index = message.indexOf(marker);
  return index >= 0 ? message.slice(index + marker.length) : message;
}

/** "Câu 5 · Dùng từ" for a daily practice exercise, "Phần 2 · Word use · câu 3" for a review section. */
function sectionLabel(component: string, context: MonthlyFindingContext, segment?: Pick<LabelSegment, "item" | "variant">): string {
  const title = MONTHLY_PART_TITLES[component] ?? (component || "Bài học");
  const itemSuffix = segment?.item ? ` · câu ${segment.item}${segment.variant ? ` (bản làm lại ${segment.variant})` : ""}` : "";
  if (context.kind === "review") {
    const index = MONTHLY_REVIEW_SECTIONS.findIndex((section) => section.code === component);
    return index >= 0 ? `Phần ${index + 1} · ${MONTHLY_REVIEW_SECTIONS[index]!.title}${itemSuffix}` : `${title}${itemSuffix}`;
  }
  if ((lessonPracticeCodes as readonly string[]).includes(component)) {
    const practice = lessonPartsForTab(context.parts.map((part) => ({ code: part.code ?? "", title: part.title ?? "", content: part.content ?? {} })), "practice")
      .filter((part) => part.code !== "instruction")
      .map((part) => part.code);
    const position = practice.indexOf(component);
    const number = position >= 0 ? position + 1 : (lessonPracticeCodes as readonly string[]).indexOf(component) + 1;
    return `Câu ${number} · ${title}${itemSuffix}`;
  }
  return `${title}${itemSuffix}`;
}

/** Index of the option that contains `word` (the preview letters it A, B, …). */
function optionContaining(parts: readonly Part[], segment: LabelSegment, word: string): number | undefined {
  const content = parts.find((part) => part.code === segment.code)?.content;
  let target: unknown = content;
  if (segment.item) target = asList(content?.items)[segment.item - 1];
  if (segment.item && segment.variant) target = asList((target as Record<string, unknown> | undefined)?.variants)[segment.variant - 1];
  const options = asList((target as Record<string, unknown> | undefined)?.options).filter((option): option is string => typeof option === "string");
  const pattern = new RegExp(`(?<![\\p{L}])${word.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&")}(?![\\p{L}])`, "iu");
  const index = options.findIndex((option) => pattern.test(option));
  return index >= 0 ? index : undefined;
}

function asList(value: unknown): unknown[] { return Array.isArray(value) ? value : []; }
function quote(value: string): string { return `“${value}”`; }


/** Key prefix of the lines built from structural problems (`integrityIssues`), for the editor's jump-to-field. */
export const MONTHLY_INTEGRITY_LINE_PREFIX = "integrity-";

/**
 * Structural problems that keep a draft from rendering or playing (13/11). The
 * server refuses "Vẫn duyệt" while any exist, so they are shown as severe lines
 * that open the editor at the named question.
 */
export function describeMonthlyIntegrityIssues(issues: readonly MonthlyIntegrityIssueView[] | undefined, context: MonthlyFindingContext): MonthlyFindingLine[] {
  return (issues ?? []).map((issue, index) => ({
    key: `${MONTHLY_INTEGRITY_LINE_PREFIX}${index}`, code: "MONTHLY_DAY_INTEGRITY", component: issue.component, severity: "severe" as const,
    where: sectionLabel(issue.component, context, issue), what: integrityWhat(issue),
    ...(issue.item ? { item: issue.item } : {}), ...(issue.variant ? { variant: issue.variant } : {})
  }));
}

/** The problem without its section prefix and question number ("có đáp án không nằm trong các lựa chọn"), capitalised. */
function integrityWhat(issue: MonthlyIntegrityIssueView): string {
  const body = issue.message.replace(/^[^:]+:\s*/u, "").replace(/^câu(?: luyện)? \d+(?: bản làm lại \d+)?\s*/u, "").trim();
  const text = body || issue.message;
  return `${text[0]!.toLocaleUpperCase("vi")}${text.slice(1)}.`;
}

/** "câu ngữ pháp 4 có đáp án không nằm trong các lựa chọn" — one problem, as a sentence fragment. */
function integrityPhrase(issue: MonthlyIntegrityIssueView): string {
  const title = MONTHLY_PART_TITLES[issue.component] ?? issue.component;
  const body = issue.message.replace(/^[^:]+:\s*/u, "").replace(/^câu(?: luyện)? \d+(?: bản làm lại \d+)?\s*/u, "").trim();
  if (issue.item) return `câu ${title.toLocaleLowerCase("vi")} ${issue.item}${issue.variant ? ` (bản làm lại ${issue.variant})` : ""} ${body}`;
  return `phần ${title} ${body}`;
}

/**
 * Calm Operator wording for a refused "Vẫn duyệt" (MONTHLY_DAY_INTEGRITY_BLOCKED):
 * "Không duyệt vượt được: câu ngữ pháp 4 có đáp án không nằm trong các lựa chọn. Mở Sửa tay để sửa câu này."
 */
export function monthlyIntegrityBlockedMessage(issues: readonly MonthlyIntegrityIssueView[] | undefined): string {
  const list = issues ?? [];
  if (!list.length) return "Không duyệt vượt được: bài đang thiếu nội dung để học viên mở và làm. Mở Sửa tay để sửa rồi lưu lại.";
  const shown = list.slice(0, 3).map(integrityPhrase).join("; ");
  const more = list.length > 3 ? `; và ${list.length - 3} chỗ khác` : "";
  const fix = list.length === 1 ? (list[0]!.item ? "Mở Sửa tay để sửa câu này." : "Mở Sửa tay để sửa phần này.") : "Mở Sửa tay để sửa các chỗ này.";
  return `Không duyệt vượt được: ${shown}${more}. ${fix}`;
}

/** Reads `issues` from an API error body (MONTHLY_DAY_INTEGRITY_BLOCKED), keeping only well-formed entries. */
export function integrityIssuesFromError(details: unknown): MonthlyIntegrityIssueView[] {
  const issues = details && typeof details === "object" && "issues" in details ? (details as { issues?: unknown }).issues : undefined;
  return Array.isArray(issues) ? issues.flatMap((raw): MonthlyIntegrityIssueView[] => {
    if (!raw || typeof raw !== "object") return [];
    const item = raw as Record<string, unknown>;
    if (typeof item.component !== "string" || typeof item.message !== "string") return [];
    return [{ component: item.component, message: item.message, ...(typeof item.item === "number" ? { item: item.item } : {}), ...(typeof item.variant === "number" ? { variant: item.variant } : {}) }];
  }) : [];
}
