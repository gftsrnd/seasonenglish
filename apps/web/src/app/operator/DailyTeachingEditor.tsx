import { useState } from "react";
import { monthlyReadablePlanObjective } from "@e4s/domain/monthly";
import { withoutGrammarStepLabel } from "../shared/lesson/presentation.js";
import { EditorSection, Field, OptionFields } from "./LessonEditorFields.js";
import { Button } from "./primitives.js";

type Item = { id: string; prompt: string; options: string[]; answer: string; explanation: string; milestoneId: string };
const text = (value: unknown) => typeof value === "string" ? value : "";
const strings = (value: unknown): string[] => Array.isArray(value) ? value.filter((item): item is string => typeof item === "string" && Boolean(item)) : [];
const record = (value: unknown): Record<string, unknown> => value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
const emptyItem = (id: string, milestoneId = ""): Item => ({ id, prompt: "", options: ["", "", "", ""], answer: "", explanation: "", milestoneId });
export function dailyPracticeItems(value: unknown): Item[] {
  return Array.isArray(value) ? value.map((raw, i) => { const row = record(raw); return { id: text(row.id) || "grammar-" + (i + 1), prompt: text(row.prompt), options: Array.from({length:4}, (_, j) => text(Array.isArray(row.options) ? row.options[j] : "")), answer: text(row.answer), explanation: text(row.explanation), milestoneId: text(row.milestoneId) }; }) : [];
}

/**
 * Readable names for the grammar steps a daily question can practise. Step ids
 * (`a2-grammar-1-step-2`) are internal: the label is the step's short title from
 * the month's resources, or a generic "this lesson / recall" name when unknown.
 */
function milestoneLabels(ids: readonly string[], recallIds: readonly string[], known: Readonly<Record<string, string>>): Map<string, string> {
  const labels = new Map<string, string>();
  const used = new Map<string, number>();
  for (const id of ids) {
    const recall = recallIds.includes(id);
    const name = known[id]?.trim();
    const base = name ? (recall ? `Ôn lại: ${name}` : name) : recall ? "Ôn lại chủ điểm trước" : "Chủ điểm của bài";
    const count = (used.get(base) ?? 0) + 1;
    used.set(base, count);
    labels.set(id, count > 1 ? `${base} (${count})` : base);
  }
  return labels;
}

export function DailyTeachingEditor({ grammar, pronunciation, disabled, onChange, grammarStepLabels = {} }: { grammar: Record<string, unknown>; pronunciation: Record<string, unknown>; disabled: boolean; onChange(items: Item[], passage: string): void; grammarStepLabels?: Readonly<Record<string, string>> | undefined }) {
  const recallIds = strings(grammar.recallMilestoneIds);
  const planned = [...new Set([...strings(grammar.milestoneIds), ...recallIds])];
  // A day with a single grammar step needs no choice: new questions take that step.
  const soleMilestone = planned.length === 1 ? planned[0]! : "";
  const [items, setItems] = useState(() => { const existing = dailyPracticeItems(grammar.items); return existing.length ? existing : Array.from({length:3}, (_, i) => emptyItem("grammar-" + (i + 1), soleMilestone)); });
  const [passage, setPassage] = useState(text(pronunciation.passage));
  const milestones = [...new Set([...planned, ...items.map(item => item.milestoneId).filter(Boolean)])];
  const labels = milestoneLabels(milestones, recallIds, grammarStepLabels);
  const update = (next: Item[]) => { setItems(next); onChange(next, passage); };
  const patch = (index: number, change: (row: Item) => Item) => update(items.map((row, i) => i === index ? change(row) : row));
  // Lessons saved before 13/11 store the objective with an internal code and the word list; show the readable wording.
  const grammarObjective = withoutGrammarStepLabel(monthlyReadablePlanObjective(text(grammar.objective)));
  const pronunciationObjective = monthlyReadablePlanObjective(text(pronunciation.objective));
  return <EditorSection title="Luyện tập theo ngày" disabled={disabled}>
    {grammarObjective ? <p className="small operator-daily-objective"><b>Mục tiêu ngữ pháp:</b> {grammarObjective}</p> : null}
    {recallIds.length && !items.some((item) => recallIds.includes(item.milestoneId)) ? <p className="small operator-daily-objective">Trong phần Bài tập này, thêm câu ôn chủ điểm A hoặc chọn mục “Ôn lại” ở trường Chủ điểm ngữ pháp của câu ôn phù hợp.</p> : null}
    {items.map((item, index) => { const strayAnswer = Boolean(item.answer) && !item.options.includes(item.answer); return <div className="operator-daily-question" role="group" aria-label={`Câu luyện tập ${index + 1}`} data-daily-item={index + 1} key={item.id}>
      <div className="row between operator-daily-question-header"><b>Câu {index + 1}</b>{items.length > 3 ? <Button type="button" small onClick={() => update(items.filter((_, i) => i !== index))}>Bỏ câu</Button> : null}</div>
      <Field label="Câu hỏi"><textarea aria-label={`Câu ${index + 1} – Câu hỏi`} value={item.prompt} onChange={event => patch(index, row => ({ ...row, prompt: event.target.value }))} /></Field>
      <OptionFields prefix={`Câu ${index + 1}`} options={item.options} onChange={options => patch(index, row => ({ ...row, options, answer: row.options.includes(row.answer) && row.answer ? options[row.options.indexOf(row.answer)] ?? "" : row.answer }))} />
      <div className={milestones.length > 1 ? "grid cols-2" : undefined}>
        <Field label="Đáp án đúng"><select aria-label={`Câu ${index + 1} – Đáp án đúng`} value={item.answer} onChange={event => patch(index, row => ({ ...row, answer: event.target.value }))}><option value="">Chọn đáp án</option>{item.options.filter(Boolean).map((option, i) => <option key={i} value={option}>{option}</option>)}{strayAnswer ? <option value={item.answer}>{item.answer} (không có trong 4 lựa chọn)</option> : null}</select></Field>
        {milestones.length > 1 ? <Field label="Chủ điểm ngữ pháp"><select aria-label={`Câu ${index + 1} – Chủ điểm ngữ pháp`} value={item.milestoneId} onChange={event => patch(index, row => ({ ...row, milestoneId: event.target.value }))}><option value="">Chọn chủ điểm</option>{milestones.map(id => <option key={id} value={id}>{labels.get(id)}</option>)}</select></Field> : null}
      </div>
      {strayAnswer ? <p className="xs danger" role="note">Đáp án đang lưu “{item.answer}” không nằm trong 4 lựa chọn. Sửa một lựa chọn cho đúng đáp án, hoặc chọn lại đáp án.</p> : null}
      <Field label="Giải thích"><textarea aria-label={`Câu ${index + 1} – Giải thích`} value={item.explanation} onChange={event => patch(index, row => ({ ...row, explanation: event.target.value }))} /></Field>
    </div>; })}
    {items.length < 5 ? <div><Button type="button" small onClick={() => update([...items, emptyItem("grammar-" + Date.now(), soleMilestone)])}>Thêm câu luyện tập</Button></div> : null}
    {pronunciationObjective ? <p className="small operator-daily-objective"><b>Mục tiêu phát âm:</b> {pronunciationObjective}</p> : null}
    {Array.isArray(pronunciation.targetPositions) ? <Field label="Đoạn đọc luyện âm" hint="Đoạn văn phải chứa đủ các vị trí âm đã phân bổ cho ngày này."><textarea aria-label="Đoạn đọc luyện âm" value={passage} onChange={event => { setPassage(event.target.value); onChange(items, event.target.value); }} /></Field> : null}
  </EditorSection>;
}
