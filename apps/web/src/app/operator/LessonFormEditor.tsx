import { useEffect, useRef, useState, type KeyboardEvent as ReactKeyboardEvent, type ReactNode } from "react";
import type { ContentLessonDraftInput, LessonPartCode } from "@e4s/contracts";
import { TriangleAlert } from "lucide-react";
import { Banner, Button } from "./primitives.js";

const lessonPartOrder = ["objective", "instruction", "vocabulary", "grammar", "pronunciation", "listening", "reading", "writing", "word_class", "word_use", "speaking"] as const;
type VocabularyRow = {
  word: string;
  type: string;
  pronunciation: string;
  meaning: string;
  examples: string;
  family: string;
  synonyms: string;
  antonyms: string;
  umbrellaWord: string;
  umbrellaMeaning: string;
  umbrellaSiblings: string;
};
type EditorState = {
  title: string; objective: string; grammar: string; grammarExamples: string; grammarUnavailable: boolean; vocabulary: VocabularyRow[];
  pronunciationFocus: string; pronunciationWords: string; pronunciationTip: string;
  listeningScript: string; listeningQuestion: string; listeningOptions: string[]; listeningAnswer: number;
  readingPassage: string; readingQuestion: string; readingOptions: string[]; readingAnswer: number;
  writingType: "fill" | "mcq" | "write"; writingPrompt: string; writingOptions: string[]; writingAnswer: string;
  speakingInstruction: string; speakingSample: string;
};
const focusableSelector = "button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [href], [tabindex]:not([tabindex='-1'])";

function focusableElements(container: HTMLElement): HTMLElement[] {
  return Array.from(container.querySelectorAll<HTMLElement>(focusableSelector)).filter(element => !element.hidden);
}

function describeSaveError(reason: unknown): string {
  return reason instanceof Error && reason.message.trim() ? reason.message : "Không lưu được bài học.";
}

export function emptyLesson(dayNumber: number): ContentLessonDraftInput {
  return {
    dayNumber,
    title: `Bài T${dayNumber + 1}`,
    durationMinutes: 10,
    parts: lessonPartOrder.map(code => ({ code, title: code, content: {} }))
  };
}

export function LessonFormEditor({
  weekNumber,
  cefr,
  initial,
  onSave,
  onCancel,
  busy = false
}: {
  weekNumber: number;
  cefr: string;
  initial: ContentLessonDraftInput;
  onSave(lesson: ContentLessonDraftInput): void | Promise<void>;
  onCancel(): void;
  busy?: boolean;
}) {
  const [state, setState] = useState<EditorState>(() => readLesson(initial));
  const [problems, setProblems] = useState<string[]>([]);
  const [forceSave, setForceSave] = useState(false);
  const [saveError, setSaveError] = useState<string>();
  const dialogRef = useRef<HTMLElement>(null);
  const editing = initial.parts.some(part => Object.keys(record(part.content)).length > 0);
  const heading = `${editing ? "Sửa" : "Soạn"} bài T${initial.dayNumber + 1} · Tuần ${weekNumber} · ${cefr}`;
  const set = <K extends keyof EditorState>(key: K, value: EditorState[K]) => setState(current => ({ ...current, [key]: value }));
  const setVocabulary = (index: number, key: keyof VocabularyRow, value: string) => setState(current => ({ ...current, vocabulary: current.vocabulary.map((row, rowIndex) => rowIndex === index ? { ...row, [key]: value } : row) }));
  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    (focusableElements(dialog)[0] ?? dialog).focus();
    return () => {
      if (previous?.isConnected) previous.focus();
    };
  }, []);
  const handleKeyDown = (event: ReactKeyboardEvent<HTMLElement>) => {
    if (event.defaultPrevented) return;
    if (event.key === "Escape") {
      if (!busy) {
        event.preventDefault();
        onCancel();
      }
      return;
    }
    if (event.key !== "Tab") return;
    const dialog = dialogRef.current;
    if (!dialog) return;
    const elements = focusableElements(dialog);
    if (!elements.length) {
      event.preventDefault();
      dialog.focus();
      return;
    }
    const first = elements[0];
    const last = elements[elements.length - 1];
    if (!first || !last) return;
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  };
  const submit = async () => {
    if (busy) return;
    const nextProblems = validateLesson(state);
    if (nextProblems.length && !forceSave) { setProblems(nextProblems); setForceSave(true); return; }
    if (!window.confirm(forceSave ? "Bài vẫn còn nội dung cần bổ sung. Bạn có chắc muốn lưu tạm?" : "Bạn có chắc muốn kiểm tra và lưu bài này?")) return;
    setSaveError(undefined);
    try {
      await onSave(buildLesson(initial, state));
    } catch (reason) {
      setSaveError(describeSaveError(reason));
    }
  };
  return <div className="modal-backdrop operator-modal-scope" role="presentation" onClick={event => { if (event.target === event.currentTarget && !busy) onCancel(); }}><section ref={dialogRef} className="dialog wide operator-lesson-editor" role="dialog" aria-modal="true" aria-labelledby="lesson-editor-title" aria-describedby="lesson-editor-description" aria-busy={busy || undefined} tabIndex={-1} onKeyDown={handleKeyDown}>
    <header className="operator-editor-sticky-header"><div className="row between operator-editor-heading"><h3 id="lesson-editor-title">{heading}</h3><Button type="button" small disabled={busy} onClick={onCancel}>Đóng</Button></div></header>
    <p id="lesson-editor-description" className="xs muted operator-editor-description">Mỗi bài cần 3 từ (mỗi từ 3 cụm), ngữ pháp, phát âm (1 âm + 3 từ) và 4 phần Nghe/Đọc/Viết/Nói. {cefr === "A1" || cefr === "A2" ? "A1–A2: giải thích tiếng Việt." : "B1+: dùng tiếng Anh."}</p>
    <div className="operator-lesson-editor-form">
      <EditorSection title="Chung" disabled={busy}><Field label="Tiêu đề bài" hint="Tên ngắn của mẫu câu, bằng tiếng Anh. VD: I work as…"><input aria-label="Tiêu đề bài" value={state.title} onChange={event => set("title", event.target.value)} /></Field><Field label="Mục tiêu bài học" hint="Sau bài này học viên làm được gì (1 câu)."><textarea value={state.objective} onChange={event => set("objective", event.target.value)} /></Field></EditorSection>
      <EditorSection title="Ngữ pháp" disabled={busy}><label className="row small"><input type="checkbox" checked={state.grammarUnavailable} onChange={event => set("grammarUnavailable", event.target.checked)} />Bài này không có nội dung ngữ pháp phù hợp</label>{state.grammarUnavailable ? <p className="xs muted">Phần Ngữ pháp sẽ được đánh dấu không áp dụng và ẩn với học viên. Không cần nhập nội dung giả.</p> : null}<Field label="Ngữ pháp" hint="Công thức + dùng khi nào + 2–3 câu ví dụ có dùng từ vựng."><textarea aria-label="Ngữ pháp" disabled={state.grammarUnavailable} value={state.grammar} onChange={event => set("grammar", event.target.value)} /></Field><Field label="Câu ví dụ để đọc thành tiếng" hint="2–3 câu tiếng Anh, cách nhau bằng dấu ;"><textarea disabled={state.grammarUnavailable} value={state.grammarExamples} placeholder="I work as a tester.; She works in the sales team." onChange={event => set("grammarExamples", event.target.value)} /></Field></EditorSection>
      <EditorSection title="Từ vựng (3 từ)" disabled={busy}><div className="operator-vocabulary-grid">{state.vocabulary.map((row, index) => <div className="operator-vocabulary-row" aria-label={`Từ vựng ${index + 1}`} key={index}><div className="operator-vocabulary-base"><input aria-label={`Từ ${index + 1}`} value={row.word} onChange={event => setVocabulary(index, "word", event.target.value)} placeholder={`Từ ${index + 1}`} /><input aria-label={`Từ loại từ ${index + 1}`} value={row.type} onChange={event => setVocabulary(index, "type", event.target.value)} placeholder="Từ loại" /><input aria-label={`Phiên âm từ ${index + 1}`} value={row.pronunciation} onChange={event => setVocabulary(index, "pronunciation", event.target.value)} placeholder="Phiên âm /…/" /><input aria-label={`Nghĩa từ ${index + 1}`} value={row.meaning} onChange={event => setVocabulary(index, "meaning", event.target.value)} placeholder="Nghĩa tiếng Việt" /><input aria-label={`Cụm từ ${index + 1}`} value={row.examples} onChange={event => setVocabulary(index, "examples", event.target.value)} placeholder="3 cụm từ, cách nhau bằng ;" /></div><details className="operator-vocabulary-advanced"><summary>Mở rộng từ {index + 1}</summary><div className="operator-vocabulary-advanced-grid"><Field label={`Word family từ ${index + 1}`} hint="Mỗi mục: từ | từ loại | nghĩa; cách nhau bằng dấu ;"><textarea aria-label={`Word family từ ${index + 1}`} value={row.family} onChange={event => setVocabulary(index, "family", event.target.value)} placeholder="colleague | noun | đồng nghiệp" /></Field><Field label={`Từ đồng nghĩa từ ${index + 1}`} hint="Mỗi mục: từ | level | ghi chú"><textarea aria-label={`Từ đồng nghĩa từ ${index + 1}`} value={row.synonyms} onChange={event => setVocabulary(index, "synonyms", event.target.value)} placeholder="coworker | A2 | phổ biến" /></Field><Field label={`Từ trái nghĩa từ ${index + 1}`} hint="Để trống nếu không có từ trái nghĩa tự nhiên"><textarea aria-label={`Từ trái nghĩa từ ${index + 1}`} value={row.antonyms} onChange={event => setVocabulary(index, "antonyms", event.target.value)} placeholder="old | A2 | trái nghĩa của new" /></Field><Field label={`Từ bao trùm từ ${index + 1}`}><input aria-label={`Từ bao trùm từ ${index + 1}`} value={row.umbrellaWord} onChange={event => setVocabulary(index, "umbrellaWord", event.target.value)} placeholder="work communication" /></Field><Field label={`Nghĩa từ bao trùm từ ${index + 1}`}><input aria-label={`Nghĩa từ bao trùm từ ${index + 1}`} value={row.umbrellaMeaning} onChange={event => setVocabulary(index, "umbrellaMeaning", event.target.value)} placeholder="giao tiếp công việc" /></Field><Field label={`Từ cùng nhóm từ ${index + 1}`} hint="Mỗi mục: từ | nghĩa; cách nhau bằng dấu ;"><textarea aria-label={`Từ cùng nhóm từ ${index + 1}`} value={row.umbrellaSiblings} onChange={event => setVocabulary(index, "umbrellaSiblings", event.target.value)} placeholder="manager | quản lý; client | khách hàng" /></Field></div></details></div>)}</div><span className="xs muted">Mỗi từ có thông tin chính và một mục mở rộng để sửa word family, từ đồng nghĩa, từ trái nghĩa và nhóm từ.</span></EditorSection>
      <EditorSection title="Phát âm" disabled={busy}><div className="grid cols-3"><Field label="Âm mục tiêu"><input value={state.pronunciationFocus} onChange={event => set("pronunciationFocus", event.target.value)} /></Field><Field label="3 từ luyện âm"><input value={state.pronunciationWords} onChange={event => set("pronunciationWords", event.target.value)} /></Field><Field label="Mẹo phát âm"><input value={state.pronunciationTip} onChange={event => set("pronunciationTip", event.target.value)} /></Field></div></EditorSection>
      <EditorSection title="Nghe" disabled={busy}><Field label="Đoạn audio (máy đọc, học viên không thấy chữ)"><textarea value={state.listeningScript} placeholder="1–2 câu tiếng Anh" onChange={event => set("listeningScript", event.target.value)} /></Field><QuestionFields prefix="Nghe" question={state.listeningQuestion} options={state.listeningOptions} answer={state.listeningAnswer} onQuestion={value => set("listeningQuestion", value)} onOptions={value => set("listeningOptions", value)} onAnswer={value => set("listeningAnswer", value)} /></EditorSection>
      <EditorSection title="Đọc" disabled={busy}><Field label="Đoạn văn"><textarea value={state.readingPassage} placeholder="2–4 câu tiếng Anh" onChange={event => set("readingPassage", event.target.value)} /></Field><QuestionFields prefix="Đọc" question={state.readingQuestion} options={state.readingOptions} answer={state.readingAnswer} onQuestion={value => set("readingQuestion", value)} onOptions={value => set("readingOptions", value)} onAnswer={value => set("readingAnswer", value)} /></EditorSection>
      <EditorSection title="Viết" disabled={busy}><Field label="Dạng bài"><select value={state.writingType} onChange={event => set("writingType", event.target.value as EditorState["writingType"])}><option value="fill">Điền từ</option><option value="mcq">Trắc nghiệm</option><option value="write">Tự viết</option></select></Field><Field label="Đề bài"><textarea value={state.writingPrompt} onChange={event => set("writingPrompt", event.target.value)} /></Field><OptionFields prefix="Viết" options={state.writingOptions} onChange={value => set("writingOptions", value)} optional /><Field label="Đáp án"><input value={state.writingAnswer} onChange={event => set("writingAnswer", event.target.value)} /></Field></EditorSection>
      <EditorSection title="Nói" disabled={busy}><Field label="Yêu cầu"><input value={state.speakingInstruction} placeholder="Nói to câu sau." onChange={event => set("speakingInstruction", event.target.value)} /></Field><Field label="Câu mẫu học viên phải nói"><textarea value={state.speakingSample} onChange={event => set("speakingSample", event.target.value)} /></Field></EditorSection>
      {saveError && <div role="alert"><Banner tone="danger" icon={<TriangleAlert className="operator-banner-svg" size={17} strokeWidth={2.25} />}>{saveError}</Banner></div>}
      {problems.length > 0 && <div role="alert"><Banner tone="warn"><div className="small"><b>{problems.length} mục cần bổ sung:</b><ul>{problems.map(problem => <li key={problem}>{problem}</li>)}</ul><p>Bạn có thể sửa tiếp, hoặc lưu tạm: bài sẽ bị gắn nhãn &quot;chưa đủ 4 kỹ năng&quot; cho đến khi bổ sung.</p></div></Banner></div>}
      <div className="row operator-editor-actions"><Button type="button" disabled={busy} onClick={onCancel}>Huỷ</Button>{busy && <span className="small muted" role="status" aria-live="polite">Đang lưu…</span>}<Button type="button" className="operator-lesson-save-button" primary busy={busy} disabled={busy} onClick={() => void submit()}>{busy ? "Đang lưu…" : forceSave ? "Lưu dù còn thiếu" : "Kiểm tra & lưu"}</Button></div>
    </div>
  </section></div>;
}

function EditorSection({ title, children, disabled = false }: { title: string; children: ReactNode; disabled?: boolean }) { return <fieldset className="card soft operator-editor-section" disabled={disabled}><legend>{title}</legend>{children}</fieldset>; }
function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) { return <label className="field"><span>{label}</span>{children}{hint && <small className="xs muted">{hint}</small>}</label>; }

function QuestionFields({ prefix, question, options, answer, onQuestion, onOptions, onAnswer }: { prefix: string; question: string; options: string[]; answer: number; onQuestion(value: string): void; onOptions(value: string[]): void; onAnswer(value: number): void }) {
  return <><Field label="Câu hỏi"><input aria-label={`${prefix} – Câu hỏi`} value={question} onChange={event => onQuestion(event.target.value)} /></Field><OptionFields prefix={prefix} options={options} onChange={onOptions} /><Field label="Đáp án đúng" hint="4 lựa chọn, toàn tiếng Anh, chỉ một đáp án đúng."><select aria-label={`${prefix} – Đáp án đúng`} value={answer} onChange={event => onAnswer(Number(event.target.value))}>{[0, 1, 2, 3].map(index => <option key={index} value={index}>Lựa chọn {index + 1}</option>)}</select></Field></>;
}

function OptionFields({ prefix, options, onChange, optional = false }: { prefix: string; options: string[]; onChange(value: string[]): void; optional?: boolean }) {
  return <div className="grid cols-4" aria-label={`${prefix} – Các lựa chọn`}>{[0, 1, 2, 3].map(index => <input key={index} aria-label={`${prefix} – Lựa chọn ${index + 1}`} value={options[index] ?? ""} placeholder={`Lựa chọn ${index + 1}${optional ? " (chỉ khi trắc nghiệm)" : ""}`} onChange={event => { const next = [...options]; while (next.length < 4) next.push(""); next[index] = event.target.value; onChange(next); }} />)}</div>;
}

function readLesson(lesson: ContentLessonDraftInput): EditorState {
  const get = (code: LessonPartCode) => record(lesson.parts.find(part => part.code === code)?.content);
  const objective = get("objective"), vocabulary = get("vocabulary"), grammar = get("grammar"), pronunciation = get("pronunciation"), listening = get("listening"), reading = get("reading"), writing = get("writing"), speaking = get("speaking");
  const items = Array.isArray(vocabulary.items) ? vocabulary.items.map(record) : [];
  const readOptions = (value: unknown) => [...listValue(value), "", "", "", ""].slice(0, 4);
  const listeningOptions = readOptions(listening.options), readingOptions = readOptions(reading.options);
  return {
    title: lesson.title,
    objective: stringValue(objective.text),
    grammar: [stringValue(grammar.formula), stringValue(grammar.usage)].filter(Boolean).join("\n"),
    grammarExamples: listValue(grammar.examples).join("; "),
    grammarUnavailable: grammar.hidden === true || stringValue(grammar.status) === "unavailable" || stringValue(grammar.reason) === "no_suitable_content",
    vocabulary: [0, 1, 2].map(index => {
      const item = items[index] ?? {};
      const umbrella = record(item.umbrella);
      return {
        word: stringValue(item.word ?? item.e),
        type: stringValue(item.type ?? item.partOfSpeech ?? item.pos),
        pronunciation: stringValue(item.pronunciation ?? item.ipa),
        meaning: stringValue(item.meaning ?? item.v),
        examples: listValue(item.collocations ?? item.phrases ?? item.examples).join("; "),
        family: formatStructuredEntries(item.family, ["type", "meaning"]),
        synonyms: formatStructuredEntries(item.synonyms ?? item.syn, ["level", "note"]),
        antonyms: formatStructuredEntries(item.antonyms ?? item.ant, ["level", "note"]),
        umbrellaWord: stringValue(umbrella.word ?? umbrella.w),
        umbrellaMeaning: stringValue(umbrella.meaning ?? umbrella.v),
        umbrellaSiblings: formatStructuredEntries(umbrella.siblings ?? umbrella.words, ["meaning"])
      };
    }),
    pronunciationFocus: stringValue(pronunciation.focus),
    pronunciationWords: (Array.isArray(pronunciation.words) ? pronunciation.words.map(value => typeof value === "string" ? value : stringValue(record(value).word ?? record(value).w)).filter(Boolean) : []).join(", "),
    pronunciationTip: stringValue(pronunciation.instruction || pronunciation.tip),
    listeningScript: stringValue(listening.audio || listening.script || listening.text),
    listeningQuestion: stringValue(listening.prompt || listening.question),
    listeningOptions,
    listeningAnswer: Math.max(0, listeningOptions.indexOf(stringValue(listening.answer))),
    readingPassage: stringValue(reading.text || reading.passage),
    readingQuestion: stringValue(reading.prompt || reading.question),
    readingOptions,
    readingAnswer: Math.max(0, readingOptions.indexOf(stringValue(reading.answer))),
    writingType: normalizeWritingType(stringValue(writing.type)),
    writingPrompt: stringValue(writing.prompt),
    writingOptions: readOptions(writing.options),
    writingAnswer: stringValue(writing.answer),
    speakingInstruction: stringValue(speaking.instruction || speaking.prompt) || "Nói to câu sau.",
    speakingSample: stringValue(speaking.sample || speaking.answer || speaking.modelAnswer)
  };
}

function validateLesson(state: EditorState): string[] {
  const problems: string[] = [];
  if (!state.title.trim()) problems.push("thiếu tiêu đề");
  if (!state.grammarUnavailable && !state.grammar.trim()) problems.push("thiếu ngữ pháp");
  const vocabulary = state.vocabulary.filter(row => row.word.trim());
  if (vocabulary.length < 3) problems.push(`mới có ${vocabulary.length}/3 từ vựng`);
  if (vocabulary.some(row => !row.meaning.trim())) problems.push("từ vựng thiếu nghĩa tiếng Việt");
  const missingPhrases = vocabulary.filter(row => splitValues(row.examples, /[;\n]/).length < 3).map(row => row.word.trim());
  if (missingPhrases.length) problems.push(`chưa đủ 3 cụm từ chứa từ đó cho: ${missingPhrases.join(", ")}`);
  checkQuestion(problems, "Nghe", state.listeningScript, state.listeningQuestion, state.listeningOptions, state.listeningAnswer);
  checkQuestion(problems, "Đọc", state.readingPassage, state.readingQuestion, state.readingOptions, state.readingAnswer);
  if (!state.writingPrompt.trim()) problems.push("thiếu phần Viết"); else if (!state.writingAnswer.trim()) problems.push("Viết: thiếu đáp án");
  if (!state.speakingSample.trim()) problems.push("thiếu phần Nói (câu mẫu)");
  const pronunciationWords = splitValues(state.pronunciationWords, /[,;\n]/);
  if (!state.pronunciationFocus.trim() && !pronunciationWords.length && !state.pronunciationTip.trim()) problems.push("thiếu phần Phát âm"); else { if (!state.pronunciationFocus.trim()) problems.push("Phát âm: thiếu âm mục tiêu"); if (pronunciationWords.length < 3) problems.push("Phát âm: cần đủ 3 từ luyện"); }
  return problems;
}

function checkQuestion(problems: string[], label: string, body: string, question: string, options: string[], answer: number) { const choices = options.filter(choice => choice.trim()); if (![body, question, ...choices].some(value => value.trim())) { problems.push(`thiếu phần ${label}`); return; } if (!body.trim()) problems.push(`${label}: thiếu nội dung`); if (!question.trim()) problems.push(`${label}: thiếu câu hỏi`); if (choices.length < 4) problems.push(`${label}: chuẩn mới là 4 lựa chọn`); if (!options[answer]?.trim()) problems.push(`${label}: đáp án phải trùng nguyên văn một lựa chọn`); }

function buildLesson(initial: ContentLessonDraftInput, state: EditorState): ContentLessonDraftInput {
  const prior = (code: LessonPartCode) => record(initial.parts.find(part => part.code === code)?.content);
  const priorVocabulary = prior("vocabulary");
  const priorVocabularyItems = Array.isArray(priorVocabulary.items) ? priorVocabulary.items : [];
  const known: ContentLessonDraftInput["parts"] = [
    { code: "objective", title: "Mục tiêu bài học", content: { ...prior("objective"), text: state.objective.trim() } },
    { code: "instruction", title: "Hướng dẫn làm bài", content: { ...prior("instruction"), steps: listValue(prior("instruction").steps).length ? listValue(prior("instruction").steps) : ["Học nội dung", "Làm lần lượt các bài tập", "Xem phản hồi và làm lại"] } },
    { code: "vocabulary", title: "Từ vựng", content: { ...priorVocabulary, items: state.vocabulary.map((row, index) => ({ ...record(priorVocabularyItems[index]), word: row.word.trim(), type: row.type.trim(), pronunciation: row.pronunciation.trim(), meaning: row.meaning.trim(), collocations: splitValues(row.examples, /[;\n]/), examples: splitValues(row.examples, /[;\n]/), family: parseStructuredEntries(row.family, ["type", "meaning"]), synonyms: parseStructuredEntries(row.synonyms, ["level", "note"]), antonyms: parseStructuredEntries(row.antonyms, ["level", "note"]), umbrella: buildUmbrella(row) })) } },
    { code: "grammar", title: "Ngữ pháp", content: state.grammarUnavailable
      ? { status: "unavailable", hidden: true, reason: "no_suitable_content" }
      : { ...prior("grammar"), status: "available", hidden: false, formula: state.grammar.trim(), examples: splitValues(state.grammarExamples, /[;\n]/) } },
    { code: "pronunciation", title: "Phát âm", content: { ...prior("pronunciation"), focus: state.pronunciationFocus.trim(), words: splitValues(state.pronunciationWords, /[,;\n]/), instruction: state.pronunciationTip.trim() } },
    { code: "listening", title: "Nghe", content: { ...prior("listening"), script: state.listeningScript.trim(), prompt: state.listeningQuestion.trim(), options: state.listeningOptions.map(value => value.trim()).filter(Boolean), answer: state.listeningOptions[state.listeningAnswer]?.trim() ?? "" } },
    { code: "reading", title: "Đọc", content: { ...prior("reading"), text: state.readingPassage.trim(), prompt: state.readingQuestion.trim(), options: state.readingOptions.map(value => value.trim()).filter(Boolean), answer: state.readingOptions[state.readingAnswer]?.trim() ?? "" } },
    { code: "writing", title: "Viết", content: { ...prior("writing"), type: state.writingType, prompt: state.writingPrompt.trim(), options: state.writingOptions.map(value => value.trim()).filter(Boolean), answer: state.writingAnswer.trim() } },
    initial.parts.find(part => part.code === "word_class") ?? { code: "word_class", title: "Từ loại", content: {} },
    initial.parts.find(part => part.code === "word_use") ?? { code: "word_use", title: "Dùng từ", content: {} },
    { code: "speaking", title: "Nói", content: { ...prior("speaking"), instruction: state.speakingInstruction.trim(), sample: state.speakingSample.trim(), answer: state.speakingSample.trim() } }
  ];
  return { dayNumber: initial.dayNumber, title: state.title.trim(), durationMinutes: initial.durationMinutes || 10, parts: [...known, ...initial.parts.filter(part => !lessonPartOrder.includes(part.code as typeof lessonPartOrder[number]))] };
}

function normalizeWritingType(value: string): EditorState["writingType"] { if (value === "choice" || value === "mcq") return "mcq"; if (value === "free" || value === "write") return "write"; return "fill"; }
function splitValues(value: string, separator: RegExp): string[] { return value.split(separator).map(item => item.trim()).filter(Boolean); }
function formatStructuredEntries(value: unknown, fields: Array<"type" | "meaning" | "level" | "note">): string {
  if (!Array.isArray(value)) return "";
  return value.map(entry => {
    const item = record(entry);
    const word = stringValue(item.word ?? item.w).trim();
    if (!word) return "";
    const values = fields.map(field => {
      if (field === "type") return stringValue(item.type ?? item.pos).trim();
      if (field === "meaning") return stringValue(item.meaning ?? item.v).trim();
      return stringValue(item[field]).trim();
    });
    while (values.length && !values[values.length - 1]) values.pop();
    return [word, ...values].join(" | ");
  }).filter(Boolean).join("; ");
}
function parseStructuredEntries(value: string, fields: Array<"type" | "meaning" | "level" | "note">): Array<Record<string, string>> {
  return splitValues(value, /[;\n]/).flatMap(segment => {
    const [word = "", ...values] = segment.split("|").map(part => part.trim());
    if (!word) return [];
    const entry: Record<string, string> = { word };
    fields.forEach((field, index) => { if (values[index]) entry[field] = values[index]!; });
    return [entry];
  });
}
function buildUmbrella(row: VocabularyRow): Record<string, unknown> | null {
  const siblings = parseStructuredEntries(row.umbrellaSiblings, ["meaning"]);
  if (!row.umbrellaWord.trim() && !row.umbrellaMeaning.trim() && !siblings.length) return null;
  return { word: row.umbrellaWord.trim(), meaning: row.umbrellaMeaning.trim(), siblings };
}
function record(value: unknown): Record<string, unknown> { return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {}; }
function stringValue(value: unknown): string { return typeof value === "string" ? value : ""; }
function listValue(value: unknown): string[] { return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : []; }
