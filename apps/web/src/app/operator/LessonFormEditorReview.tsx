import { normalizeWeeklyReviewReadAloud } from "@e4s/domain/monthly";
import { EditorSection, Field, LineField, OptionFields } from "./LessonEditorFields.js";
import { MONTHLY_REVIEW_SECTIONS } from "./monthly-failure-findings.js";

/**
 * Friday review ("Ôn tuần") exercises in the manual lesson editor. A review part
 * holds a list of questions (`content.items`), each choice question with its
 * retry versions (`item.variants`, "bản làm lại"). Every question and version is
 * editable here; the counts are fixed by the review contract (exact numbers per
 * section, one retry per choice question), so nothing is added or removed.
 *
 * Edits replace only the edited field of the edited question: an untouched part
 * keeps its original content object, so it saves back byte-identical.
 */
export type ReviewContents = Readonly<Record<string, Record<string, unknown>>>;
type Question = Record<string, unknown>;

export const REVIEW_SECTION_CODES: readonly string[] = MONTHLY_REVIEW_SECTIONS.map((section) => section.code);

export function reviewSectionKey(code: string): string { return `review-${code}`; }
export function reviewItemKey(code: string, item: number, variant?: number): string { return variant ? `${code}-${item}-${variant}` : `${code}-${item}`; }

export function readReviewContents(parts: ReadonlyArray<{ code: string; content: unknown }>): ReviewContents {
  return Object.fromEntries(REVIEW_SECTION_CODES.flatMap((code) => {
    const content = parts.find((part) => part.code === code)?.content;
    if (!content || typeof content !== "object" || Array.isArray(content)) return [];
    const section = content as Record<string, unknown>;
    if (code !== "speaking" || !Array.isArray(section.items)) return [[code, section]];
    const items = section.items.map((item) => item && typeof item === "object" && !Array.isArray(item) ? normalizeWeeklyReviewReadAloud(item) : item);
    return [[code, { ...section, items }]];
  }));
}

/** Writes the edited review items back; every other part (and every untouched review part) is returned as it was. */
export function applyReviewContents<T extends { code: string; content: unknown }>(part: T, contents: ReviewContents): T {
  const edited = contents[part.code];
  if (!edited || edited === part.content) return part;
  return { ...part, content: edited };
}

export function reviewQuestions(content: Record<string, unknown> | undefined): Question[] {
  return Array.isArray(content?.items) ? content.items.filter((item): item is Question => Boolean(item) && typeof item === "object" && !Array.isArray(item)) : [];
}
function variantsOf(item: Question): Question[] {
  return Array.isArray(item.variants) ? item.variants.filter((variant): variant is Question => Boolean(variant) && typeof variant === "object" && !Array.isArray(variant)) : [];
}
const text = (value: unknown) => typeof value === "string" ? value : "";
const isStringList = (value: unknown): value is string[] => Array.isArray(value) && value.every((entry) => typeof entry === "string");

/** Replaces one question (or one of its retry versions) in a part's content; the rest of the content keeps its identity and key order. */
export function updateReviewQuestion(content: Record<string, unknown>, itemIndex: number, variantIndex: number | undefined, change: (question: Question) => Question): Record<string, unknown> {
  const items = Array.isArray(content.items) ? content.items : [];
  return {
    ...content,
    items: items.map((raw, index) => {
      if (index !== itemIndex || !raw || typeof raw !== "object") return raw;
      const item = raw as Question;
      if (variantIndex === undefined) return change(item);
      const variants = Array.isArray(item.variants) ? item.variants : [];
      return { ...item, variants: variants.map((variant, position) => position === variantIndex && variant && typeof variant === "object" ? change(variant as Question) : variant) };
    })
  };
}

/** Options change; an answer that was option k follows option k's new text. */
function withOptions(question: Question, options: string[]): Question {
  const previous = isStringList(question.options) ? question.options : [];
  const answerIndex = typeof question.answer === "string" ? previous.indexOf(question.answer) : -1;
  return { ...question, options, ...(answerIndex >= 0 ? { answer: options[answerIndex] ?? "" } : {}) };
}

/** The reading passage lives on the section and is copied onto each question (and retry); a copy that matched follows the edit. */
function withPassage(content: Record<string, unknown>, passage: string): Record<string, unknown> {
  const previous = text(content.passage);
  const follow = (question: Question): Question => text(question.passage) === previous && "passage" in question ? { ...question, passage } : question;
  return {
    ...content,
    passage,
    ...(Array.isArray(content.items) ? { items: content.items.map((raw) => {
      if (!raw || typeof raw !== "object") return raw;
      const item = follow(raw as Question);
      return Array.isArray(item.variants) ? { ...item, variants: item.variants.map((variant) => variant && typeof variant === "object" ? follow(variant as Question) : variant) } : item;
    }) } : {})
  };
}

/** "Phần 2 · Word use · câu 3 (bản làm lại 1): đáp án …" — problemSection maps the "Phần N" prefix back to its section. */
export function validateReviewContents(contents: ReviewContents): string[] {
  const problems: string[] = [];
  MONTHLY_REVIEW_SECTIONS.forEach((section, sectionIndex) => {
    const content = contents[section.code];
    if (!content) return;
    reviewQuestions(content).forEach((item, itemIndex) => {
      [item, ...variantsOf(item)].forEach((question, position) => {
        const where = `Phần ${sectionIndex + 1} · ${section.title} · câu ${itemIndex + 1}${position ? ` (bản làm lại ${position})` : ""}`;
        if (section.code === "speaking" && typeof question.passage === "string" && !Array.isArray(question.options) && !question.passage.trim()) problems.push(where + ": thiếu câu đọc to");
        if (!text(question.prompt).trim()) problems.push(`${where}: thiếu câu hỏi`);
        if (!isStringList(question.options) || !question.options.length) return;
        const options = question.options.map((option) => option.trim());
        if (options.some((option) => !option)) problems.push(`${where}: còn lựa chọn trống`);
        else if (new Set(options.map((option) => option.toLowerCase())).size !== options.length) problems.push(`${where}: các lựa chọn phải khác nhau`);
        if (typeof question.answer === "string" && !options.includes(question.answer.trim())) problems.push(`${where}: đáp án phải trùng nguyên văn một lựa chọn`);
      });
    });
  });
  return problems;
}

export function ReviewSectionEditor({ code, sectionNumber, title, content, disabled, onChange }: {
  code: string;
  sectionNumber: number;
  title: string;
  content: Record<string, unknown>;
  disabled: boolean;
  onChange(content: Record<string, unknown>): void;
}) {
  const items = reviewQuestions(content);
  const update = (itemIndex: number, variantIndex: number | undefined, change: (question: Question) => Question) => onChange(updateReviewQuestion(content, itemIndex, variantIndex, change));
  // The grammar part also holds the study formula (edited in "Ngữ pháp"); only its questions are here.
  return <EditorSection title={`Phần ${sectionNumber} · ${title} (${items.length} câu)`} disabled={disabled}>
    {typeof content.passage === "string" && code === "reading" ? <Field label="Đoạn văn" hint="Dùng chung cho mọi câu hỏi của phần này."><textarea aria-label={`${title} – Đoạn văn`} value={content.passage} onChange={(event) => onChange(withPassage(content, event.target.value))} /></Field> : null}
    {!items.length ? <p className="xs muted">Phần này chưa có câu hỏi. Số câu theo cấu trúc bài ôn; hãy sinh bài ôn để có câu hỏi.</p> : null}
    {items.map((item, itemIndex) => {
      const label = `${title} câu ${itemIndex + 1}`;
      return <div className="operator-daily-question operator-review-question" role="group" aria-label={label} data-review-item={reviewItemKey(code, itemIndex + 1)} key={text(item.id) || itemIndex}>
        <div className="row between operator-daily-question-header"><b>Câu {itemIndex + 1}</b></div>
        <QuestionEditor code={code} label={label} question={item} onChange={(change) => update(itemIndex, undefined, change)} />
        {variantsOf(item).map((variant, variantIndex) => {
          const variantLabel = `${label} bản làm lại ${variantIndex + 1}`;
          return <div className="operator-review-variant" role="group" aria-label={variantLabel} data-review-variant={reviewItemKey(code, itemIndex + 1, variantIndex + 1)} key={text(variant.id) || variantIndex}>
            <div className="operator-review-variant-header"><b>Bản làm lại {variantIndex + 1}</b><span className="xs muted">Hỏi lại khi học viên làm sai câu {itemIndex + 1}</span></div>
            <QuestionEditor code={code} label={variantLabel} question={variant} onChange={(change) => update(itemIndex, variantIndex, change)} />
          </div>;
        })}
      </div>;
    })}
    {items.length ? <p className="xs muted">Số câu và số bản làm lại cố định theo cấu trúc bài ôn tuần.</p> : null}
  </EditorSection>;
}

function QuestionEditor({ code, label, question, onChange }: { code: string; label: string; question: Question; onChange(change: (question: Question) => Question): void }) {
  const set = (key: string, value: unknown) => onChange((current) => ({ ...current, [key]: value }));
  if (code === "speaking" && typeof question.passage === "string" && !Array.isArray(question.options)) return <>
    <Field label="Câu đọc to"><textarea aria-label={label + " – Câu đọc to"} value={question.passage} onChange={(event) => set("passage", event.target.value)} /></Field>
    <Field label="Âm cần chú ý"><LineField aria-label={label + " – Âm cần chú ý"} value={text(question.focus)} onChange={(event) => set("focus", event.target.value)} /></Field>
    <Field label="Giải thích"><textarea aria-label={label + " – Giải thích"} value={text(question.explanation)} onChange={(event) => set("explanation", event.target.value)} /></Field>
  </>;
  const options = isStringList(question.options) ? question.options : null;
  const answer = question.answer;
  const hasTranslation = typeof question.questionTranslation === "string" || typeof question.answerTranslation === "string";
  return <>
    {typeof question.audioText === "string" ? <Field label="Từ app đọc" hint="Học viên chỉ nghe, không thấy chữ."><LineField aria-label={`${label} – Từ app đọc`} value={question.audioText} onChange={(event) => set("audioText", event.target.value)} /></Field> : null}
    <Field label="Câu hỏi"><textarea aria-label={`${label} – Câu hỏi`} value={text(question.prompt)} onChange={(event) => set("prompt", event.target.value)} /></Field>
    {code !== "reading" && typeof question.passage === "string" ? <Field label="Câu đọc to"><textarea aria-label={`${label} – Câu đọc to`} value={question.passage} onChange={(event) => set("passage", event.target.value)} /></Field> : null}
    {options ? <OptionFields prefix={label} options={options} count={Math.max(options.length, 1)} onChange={(next) => onChange((current) => withOptions(current, next))} /> : null}
    {options && typeof answer === "string" ? <Field label="Đáp án đúng"><select aria-label={`${label} – Đáp án đúng`} value={options.indexOf(answer)} onChange={(event) => { const index = Number(event.target.value); set("answer", index >= 0 ? options[index] ?? "" : ""); }}>
      <option value={-1}>{answer ? `Không khớp lựa chọn nào: ${answer}` : "Chọn đáp án"}</option>
      {options.map((option, index) => <option key={index} value={index}>{String.fromCharCode(65 + index)}. {option || `Lựa chọn ${index + 1}`}</option>)}
    </select></Field> : null}
    {!options && typeof answer === "string" ? <Field label="Đáp án"><LineField aria-label={`${label} – Đáp án`} value={answer} onChange={(event) => set("answer", event.target.value)} /></Field> : null}
    {isStringList(answer) ? <p className="xs muted">Đáp án chấp nhận: {answer.join(" / ")}</p> : null}
    {isStringList(question.requiredWords) ? <div className={typeof question.minRequiredWords === "number" ? "grid cols-2" : undefined}>
      <Field label="Từ bắt buộc" hint="Từ của tuần, cách nhau bằng dấu phẩy."><LineField aria-label={`${label} – Từ bắt buộc`} defaultValue={question.requiredWords.join(", ")} onBlur={(event) => { const next = event.target.value.split(",").map((word) => word.trim()).filter(Boolean); if (next.join("\n") !== (question.requiredWords as string[]).join("\n")) set("requiredWords", next); }} /></Field>
      {typeof question.minRequiredWords === "number" ? <Field label="Số từ tối thiểu"><input type="number" min={1} aria-label={`${label} – Số từ tối thiểu`} value={question.minRequiredWords} onChange={(event) => set("minRequiredWords", Number(event.target.value))} /></Field> : null}
    </div> : null}
    {typeof question.explanation === "string" || options ? <Field label="Giải thích"><textarea aria-label={`${label} – Giải thích`} value={text(question.explanation)} onChange={(event) => set("explanation", event.target.value)} /></Field> : null}
    {hasTranslation ? <div className="grid cols-2">
      <Field label="Dịch câu hỏi"><LineField aria-label={`${label} – Dịch câu hỏi`} value={text(question.questionTranslation)} onChange={(event) => set("questionTranslation", event.target.value)} /></Field>
      <Field label="Dịch đáp án"><LineField aria-label={`${label} – Dịch đáp án`} value={text(question.answerTranslation)} onChange={(event) => set("answerTranslation", event.target.value)} /></Field>
    </div> : null}
  </>;
}
