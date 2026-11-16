import { Plus, X } from "lucide-react";
import { withMonthlyGrammarSteps, type MonthlyGrammarStepSource } from "@e4s/domain/monthly";
import { Field, LineField } from "./LessonEditorFields.js";
import "./lesson-editor-points.css";

/**
 * Monthly "Sửa tay" grammar: the same structure the lesson view renders (SharedLessonPartContent).
 *
 * - `grammar.steps` with 2+ entries that have a formula → one block per step: `formula` (one rule per line),
 *   `text` (or `usage`) explanation, `examples` with index-aligned `exampleMarks` / `exampleTranslations` /
 *   `exampleAudioUrls`. The top-level formula/examples are then not shown by the view and are kept as stored.
 * - otherwise → one block from the top-level `formula`, `usage || text`, `examples` (+ the same aligned lists).
 * - with the day plan's grammar steps (2+), the blocks are exactly the ones the preview builds with
 *   withMonthlyGrammarSteps: the plan's formulas (read-only: the preview and the server lock them) and, per step,
 *   the stored step's explanation/examples, or the top-level examples assigned to that step by their marks.
 *   Saving an edit then stores those steps in `grammar.steps`, which is what the preview reads first.
 *
 * Saving writes back only what changed, into the field it was read from; every other stored field is kept.
 */
export type GrammarExampleDraft = { text: string; translation: string; /** Index in the stored list, -1 for a new row. */ source: number };
export type GrammarPointDraft = { formulaLines: string[]; explanation: string; examples: GrammarExampleDraft[] };
export type GrammarDraft = {
  /** "steps": one block per entry of grammar.steps; "single": the top-level formula; "plan": the day plan's steps. */
  mode: "steps" | "single" | "plan";
  /** The formulas come from the day plan and cannot be edited in the lesson. */
  formulaLocked?: boolean;
  points: GrammarPointDraft[];
  /** Raw index in grammar.steps of each point (steps mode). */
  stepIndexes: number[];
};

const record = (value: unknown): Record<string, unknown> => value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
const text = (value: unknown) => typeof value === "string" ? value : "";
const rawList = (value: unknown): unknown[] => Array.isArray(value) ? value : [];

/** The explanation key the view reads: `text` first for a step, `usage` first for the top level. */
function explanationKey(source: Record<string, unknown>, mode: "steps" | "single"): "text" | "usage" {
  if (mode === "steps") return text(source.text) ? "text" : text(source.usage) ? "usage" : "text";
  return text(source.usage) ? "usage" : "text";
}

function readPoint(source: Record<string, unknown>, mode: "steps" | "single", minimumExamples: number): GrammarPointDraft {
  const translations = rawList(source.exampleTranslations);
  const examples = rawList(source.examples).flatMap((value, index) => typeof value === "string" ? [{ text: value, translation: text(translations[index]), source: index }] : []);
  while (examples.length < minimumExamples) examples.push({ text: "", translation: "", source: -1 });
  const formulaLines = text(source.formula).split(/\r?\n/u);
  return { formulaLines: formulaLines.length ? formulaLines : [""], explanation: text(source[explanationKey(source, mode)]), examples };
}

/** Steps the view renders as blocks (a step needs a formula); 2+ of them switch the view to one block per step. */
function viewSteps(content: Record<string, unknown>): number[] {
  return rawList(content.steps).flatMap((step, index) => step && typeof step === "object" && !Array.isArray(step) && text(record(step).formula).trim() ? [index] : []);
}

/** The steps the preview shows for a multi-step day plan (stored steps, or top-level examples split per step). */
function planSteps(content: Record<string, unknown>, steps: readonly MonthlyGrammarStepSource[]): Record<string, unknown>[] {
  const [part] = withMonthlyGrammarSteps([{ code: "grammar", content }], steps);
  return rawList(part?.content?.steps).map(record);
}

export function readGrammarDraft(content: Record<string, unknown>, plan: readonly MonthlyGrammarStepSource[] = []): GrammarDraft {
  if (plan.length >= 2) {
    const steps = planSteps(content, plan);
    return { mode: "plan", formulaLocked: true, stepIndexes: steps.map((_, index) => index), points: steps.map(step => readPoint(step, "steps", 1)) };
  }
  const stepIndexes = viewSteps(content);
  if (stepIndexes.length >= 2) {
    const steps = rawList(content.steps);
    return { mode: "steps", stepIndexes, points: stepIndexes.map(index => readPoint(record(steps[index]), "steps", 1)) };
  }
  // One topic: three example slots, like the 3-example rule of a daily lesson.
  return { mode: "single", stepIndexes: [], points: [readPoint(content, "single", 3)] };
}

const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

/**
 * One grammar point written back onto its stored object (a step, or the grammar content itself).
 * Unchanged → the stored object as it is. A changed formula or example list drops the point's generated
 * `exampleMarks` (they name rows and words of the exact formula and sentences they were written for); the
 * view then marks that point's examples with the formula matcher, as for lessons without marks.
 */
function writePoint(source: Record<string, unknown>, point: GrammarPointDraft, before: GrammarPointDraft, mode: "steps" | "single"): Record<string, unknown> {
  if (same(point, before)) return source;
  const next: Record<string, unknown> = { ...source };
  const formula = point.formulaLines.map(line => line.trim()).filter(Boolean).join("\n");
  const formulaChanged = !same(point.formulaLines, before.formulaLines);
  if (formulaChanged) next.formula = formula;
  if (point.explanation !== before.explanation) next[explanationKey(source, mode)] = point.explanation.trim();
  const examplesChanged = !same(point.examples, before.examples);
  if (examplesChanged) {
    const kept = point.examples.map(example => ({ ...example, text: example.text.trim(), translation: example.translation.trim() })).filter(example => example.text);
    const aligned = (key: string) => {
      if (!(key in source)) return;
      const stored = rawList(source[key]);
      next[key] = kept.map(example => example.source >= 0 ? stored[example.source] ?? "" : "");
    };
    next.examples = kept.map(example => example.text);
    aligned("exampleAudioUrls");
    if ("exampleTranslations" in source || kept.some(example => example.translation)) next.exampleTranslations = kept.map(example => example.translation);
  }
  if ((formulaChanged || examplesChanged) && "exampleMarks" in next) delete next.exampleMarks;
  return next;
}

export function writeGrammarDraft(content: Record<string, unknown>, draft: GrammarDraft, plan: readonly MonthlyGrammarStepSource[] = []): Record<string, unknown> {
  const before = readGrammarDraft(content, plan);
  if (same(draft, before)) return content;
  if (draft.mode === "plan") {
    // Stored steps that line up with the plan keep their own extra fields; otherwise the preview's steps are stored.
    const stored = rawList(content.steps);
    const aligned = stored.length === plan.length && stored.every(step => step && typeof step === "object" && !Array.isArray(step));
    const derived = planSteps(content, plan);
    return { ...content, steps: derived.map((step, at) => writePoint(aligned ? { ...record(stored[at]), formula: step.formula, examples: step.examples, ...("exampleMarks" in step ? { exampleMarks: step.exampleMarks } : {}) } : step, draft.points[at]!, before.points[at]!, "steps")) };
  }
  if (draft.mode === "single") return writePoint(content, draft.points[0]!, before.points[0]!, "single");
  const steps = [...rawList(content.steps)];
  draft.stepIndexes.forEach((index, at) => { steps[index] = writePoint(record(steps[index]), draft.points[at]!, before.points[at]!, "steps"); });
  return { ...content, steps };
}

/** Vietnamese problems for the save check (prefixed "ngữ pháp" so the editor opens the Ngữ pháp section). */
export function validateGrammarDraft(draft: GrammarDraft): string[] {
  const filled = (point: GrammarPointDraft) => point.formulaLines.some(line => line.trim());
  if (!draft.points.some(filled)) return ["thiếu ngữ pháp"];
  return draft.points.flatMap((point, index) => {
    const name = draft.points.length > 1 ? `Ngữ pháp – điểm ${index + 1}` : "Ngữ pháp";
    const problems: string[] = [];
    if (!filled(point)) problems.push(`${name}: thiếu công thức`);
    if (!point.examples.some(example => example.text.trim())) problems.push(`${name}: thiếu câu ví dụ`);
    return problems;
  });
}

const replace = <T,>(list: readonly T[], index: number, value: T): T[] => list.map((item, at) => at === index ? value : item);

export function GrammarPointsEditor({ draft, onChange, translations = false, pointLabels = [] }: {
  draft: GrammarDraft;
  onChange(next: GrammarDraft): void;
  /** A1–A2: each example has a Vietnamese translation (shown to learners as a popup). */
  translations?: boolean;
  /** Readable step names (from the month's resources), index-aligned with the points when known. */
  pointLabels?: readonly (string | undefined)[];
}) {
  const many = draft.points.length > 1;
  const setPoint = (index: number, point: GrammarPointDraft) => onChange({ ...draft, points: replace(draft.points, index, point) });
  return <div className="operator-lesson-points">
    {draft.points.map((point, index) => {
      const name = many ? `điểm ngữ pháp ${index + 1}` : "ngữ pháp";
      const exampleLabel = (at: number) => many ? `Điểm ${index + 1} – câu ví dụ ${at + 1}` : `Câu ví dụ ngữ pháp ${at + 1}`;
      const shown = point.examples.filter(example => example.text.trim()).length;
      return <section className="operator-lesson-point" role="group" aria-label={many ? `Điểm ngữ pháp ${index + 1}` : "Điểm ngữ pháp"} data-grammar-point={index + 1} key={index}>
        <header className="operator-lesson-point-head"><b>{many ? `Điểm ngữ pháp ${index + 1}/${draft.points.length}` : "Điểm ngữ pháp"}</b>{pointLabels[index] ? <span className="xs muted">{pointLabels[index]}</span> : null}</header>
        <Field label="Giải thích" hint="Đoạn giải thích học viên đọc phía trên công thức."><textarea aria-label={`Giải thích ${name}`} rows={2} value={point.explanation} onChange={event => setPoint(index, { ...point, explanation: event.target.value })} /></Field>
        <div className="field" role="group" aria-label={`Công thức ${name}`}>
          <span>Công thức</span>
          <div className="operator-lesson-point-list">{point.formulaLines.map((line, at) => <div className="operator-lesson-point-row" key={at}>
            <LineField aria-label={`Công thức ${name} – dòng ${at + 1}`} value={line} placeholder="Subject + verb + …" readOnly={draft.formulaLocked} onChange={event => setPoint(index, { ...point, formulaLines: replace(point.formulaLines, at, event.target.value) })} />
            {draft.formulaLocked ? null : <button type="button" className="btn-sm operator-lesson-icon-button" aria-label={`Xoá dòng công thức ${at + 1}`} title="Xoá dòng" disabled={point.formulaLines.length < 2} onClick={() => setPoint(index, { ...point, formulaLines: point.formulaLines.filter((_, i) => i !== at) })}><X size={15} aria-hidden="true" /></button>}
          </div>)}</div>
          <small className="xs muted">{draft.formulaLocked ? "Công thức theo kế hoạch tháng (bản xem trước và máy chủ luôn dùng công thức này); không sửa trong bài." : "Mỗi dòng một công thức, đúng như dải công thức học viên thấy."}</small>
          {draft.formulaLocked ? null : <button type="button" className="btn-sm operator-lesson-add-button" onClick={() => setPoint(index, { ...point, formulaLines: [...point.formulaLines, ""] })}><Plus size={15} aria-hidden="true" />Thêm dòng</button>}
        </div>
        <div className="field" role="group" aria-label={`Câu ví dụ ${name}`}>
          <span>Câu ví dụ để đọc thành tiếng</span>
          <div className="operator-lesson-point-list">{point.examples.map((example, at) => <div className={`operator-lesson-point-row${translations ? " operator-lesson-point-row--translated" : ""}`} key={at}>
            <LineField aria-label={exampleLabel(at)} value={example.text} placeholder={`Câu ví dụ ${at + 1} (tiếng Anh)`} onChange={event => setPoint(index, { ...point, examples: replace(point.examples, at, { ...example, text: event.target.value }) })} />
            <button type="button" className="btn-sm operator-lesson-icon-button" aria-label={`Xoá ${exampleLabel(at).toLowerCase()}`} title="Xoá câu" onClick={() => setPoint(index, { ...point, examples: point.examples.filter((_, i) => i !== at) })}><X size={15} aria-hidden="true" /></button>
            {translations ? <LineField className="operator-lesson-point-translation" aria-label={`Dịch ${exampleLabel(at).toLowerCase()}`} value={example.translation} placeholder="Nghĩa tiếng Việt" onChange={event => setPoint(index, { ...point, examples: replace(point.examples, at, { ...example, translation: event.target.value }) })} /> : null}
          </div>)}</div>
          <small className="xs muted">Mỗi ô một câu; câu ví dụ thuộc đúng điểm ngữ pháp này.{shown > 3 ? " Học viên thấy 3 câu đầu." : ""} Sửa câu hoặc công thức thì phần tô đậm tự tính lại theo công thức.</small>
          <button type="button" className="btn-sm operator-lesson-add-button" onClick={() => setPoint(index, { ...point, examples: [...point.examples, { text: "", translation: "", source: -1 }] })}><Plus size={15} aria-hidden="true" />Thêm ví dụ</button>
        </div>
      </section>;
    })}
  </div>;
}
