import { useState } from "react";
import type { ContentLessonDraftInput, ContentLessonSummaryView, LessonPartCode } from "@e4s/contracts";

type VocabularyRow = { word: string; pronunciation: string; meaning: string; examples: string };

interface EditorState {
  title: string;
  objective: string;
  grammar: string;
  grammarExamples: string;
  vocabulary: VocabularyRow[];
  pronunciationFocus: string;
  pronunciationWords: string;
  pronunciationTip: string;
  listeningScript: string;
  listeningQuestion: string;
  listeningOptions: string;
  listeningAnswer: string;
  readingPassage: string;
  readingQuestion: string;
  readingOptions: string;
  readingAnswer: string;
  writingType: string;
  writingPrompt: string;
  writingOptions: string;
  writingAnswer: string;
  speakingInstruction: string;
  speakingSample: string;
}

export function LessonEditor({ weekNumber, cefr, dayNumber, lesson, onClose, onSave }: {
  weekNumber: number;
  cefr: string;
  dayNumber: number;
  lesson?: ContentLessonSummaryView | undefined;
  onClose: () => void;
  onSave: (lesson: ContentLessonDraftInput) => void | Promise<void>;
}) {
  const [state, setState] = useState<EditorState>(() => readLesson(lesson));
  const [problems, setProblems] = useState<string[]>([]);
  const [forceSave, setForceSave] = useState(false);
  const set = <K extends keyof EditorState>(key: K, value: EditorState[K]) => setState((current) => ({ ...current, [key]: value }));
  const setVocabulary = (index: number, key: keyof VocabularyRow, value: string) => setState((current) => ({
    ...current,
    vocabulary: current.vocabulary.map((row, rowIndex) => rowIndex === index ? { ...row, [key]: value } : row)
  }));

  return <div className="lesson-editor-backdrop">
    <section className="lesson-editor" role="dialog" aria-modal="true" aria-labelledby="lesson-editor-title">
      <div className="lesson-editor-heading"><div><h3 id="lesson-editor-title">{lesson ? "Sửa" : "Soạn"} bài T{dayNumber + 1} · Tuần {weekNumber} · {cefr}</h3><p>Mỗi bài cần đủ: 3 từ vựng (mỗi từ 3 cụm), ngữ pháp, phát âm (1 âm + 3 từ) và 4 phần Nghe, Đọc, Viết, Nói. {cefr === "A1" || cefr === "A2" ? "Mức A1–A2: giải thích bằng tiếng Việt." : "Mức B1 trở lên: toàn bộ bằng tiếng Anh."}</p></div><button type="button" onClick={onClose}>Đóng</button></div>
      <form noValidate onSubmit={(event) => { event.preventDefault(); const nextProblems = validateLesson(state); if (!lesson && nextProblems.length && !forceSave) { setProblems(nextProblems); setForceSave(true); return; } void onSave(buildLesson(dayNumber, state)); }}>
        <EditorSection title="Chung">
          <label>Tiêu đề bài<input aria-label="Tiêu đề bài" value={state.title} onChange={(event) => set("title", event.target.value)} /><small>Tên ngắn của mẫu câu, bằng tiếng Anh. VD: I work as…</small></label>
          <label>Mục tiêu bài học<textarea value={state.objective} onChange={(event) => set("objective", event.target.value)} /><small>Sau bài này học viên làm được gì (1 câu).</small></label>
        </EditorSection>
        <EditorSection title="Ngữ pháp">
          <label>Ngữ pháp<textarea value={state.grammar} onChange={(event) => set("grammar", event.target.value)} /><small>Công thức + dùng khi nào + 2–3 câu ví dụ có dùng từ vựng.</small></label>
          <label>Câu ví dụ để đọc thành tiếng<textarea value={state.grammarExamples} onChange={(event) => set("grammarExamples", event.target.value)} /><small>2–3 câu tiếng Anh, cách nhau bằng dấu ;</small></label>
        </EditorSection>
        <EditorSection title="Từ vựng (3 từ)">
          <div className="vocabulary-editor-grid">{state.vocabulary.map((row, index) => <div className="vocabulary-editor-row" key={index}>
            <input aria-label={`Từ ${index + 1}`} value={row.word} onChange={(event) => setVocabulary(index, "word", event.target.value)} placeholder={`Từ ${index + 1}`} />
            <input aria-label={`Phiên âm từ ${index + 1}`} value={row.pronunciation} onChange={(event) => setVocabulary(index, "pronunciation", event.target.value)} placeholder="Phiên âm /…/" />
            <input aria-label={`Nghĩa từ ${index + 1}`} value={row.meaning} onChange={(event) => setVocabulary(index, "meaning", event.target.value)} placeholder="Nghĩa tiếng Việt" />
            <input aria-label={`Cụm từ ${index + 1}`} value={row.examples} onChange={(event) => setVocabulary(index, "examples", event.target.value)} placeholder="3 cụm từ, cách nhau bằng ;" />
          </div>)}</div>
        </EditorSection>
        <EditorSection title="Phát âm">
          <div className="pronunciation-editor-grid"><label>Âm mục tiêu<input value={state.pronunciationFocus} onChange={(event) => set("pronunciationFocus", event.target.value)} /></label><label>3 từ luyện âm<input value={state.pronunciationWords} onChange={(event) => set("pronunciationWords", event.target.value)} /></label><label>Mẹo phát âm<input value={state.pronunciationTip} onChange={(event) => set("pronunciationTip", event.target.value)} /></label></div>
        </EditorSection>
        <EditorSection title="Nghe">
          <label>Đoạn audio (máy đọc, học viên không thấy chữ)<textarea value={state.listeningScript} onChange={(event) => set("listeningScript", event.target.value)} /></label>
          <QuestionFields prefix="Nghe" question={state.listeningQuestion} options={state.listeningOptions} answer={state.listeningAnswer} onQuestion={(value) => set("listeningQuestion", value)} onOptions={(value) => set("listeningOptions", value)} onAnswer={(value) => set("listeningAnswer", value)} />
        </EditorSection>
        <EditorSection title="Đọc">
          <label>Đoạn văn<textarea value={state.readingPassage} onChange={(event) => set("readingPassage", event.target.value)} /></label>
          <QuestionFields prefix="Đọc" question={state.readingQuestion} options={state.readingOptions} answer={state.readingAnswer} onQuestion={(value) => set("readingQuestion", value)} onOptions={(value) => set("readingOptions", value)} onAnswer={(value) => set("readingAnswer", value)} />
        </EditorSection>
        <EditorSection title="Viết">
          <label>Dạng bài<select value={state.writingType} onChange={(event) => set("writingType", event.target.value)}><option value="fill">Điền từ</option><option value="mcq">Trắc nghiệm</option><option value="write">Tự viết</option></select></label>
          <label>Đề bài<textarea value={state.writingPrompt} onChange={(event) => set("writingPrompt", event.target.value)} /></label>
          <OptionFields prefix="Viết" value={state.writingOptions} onChange={(value) => set("writingOptions", value)} optional />
          <label>Đáp án<input value={state.writingAnswer} onChange={(event) => set("writingAnswer", event.target.value)} /></label>
        </EditorSection>
        <EditorSection title="Nói">
          <label>Yêu cầu<input value={state.speakingInstruction} onChange={(event) => set("speakingInstruction", event.target.value)} placeholder="Nói to câu sau." /></label>
          <label>Câu mẫu học viên phải nói<textarea value={state.speakingSample} onChange={(event) => set("speakingSample", event.target.value)} /></label>
        </EditorSection>
        {problems.length ? <div className="operator-banner operator-banner--warn lesson-editor-problems" role="alert"><span>⚠️</span><div className="operator-banner__body"><b>{problems.length} mục cần bổ sung:</b><ul>{problems.map((problem) => <li key={problem}>{problem}</li>)}</ul><p>Bạn có thể sửa tiếp, hoặc lưu tạm: bài sẽ bị gắn nhãn “chưa đủ 4 kỹ năng” cho đến khi bổ sung.</p></div></div> : null}
        <div className="lesson-editor-actions"><button type="button" onClick={onClose}>Huỷ</button><button className={forceSave ? "" : "button--primary"} type="submit">{forceSave ? "Lưu dù còn thiếu" : "Kiểm tra & lưu"}</button></div>
      </form>
    </section>
  </div>;
}

function EditorSection({ title, children }: { title: string; children: React.ReactNode }) {
  return <fieldset className="lesson-editor-section"><legend>{title}</legend>{children}</fieldset>;
}

function QuestionFields({ prefix, question, options, answer, onQuestion, onOptions, onAnswer }: {
  prefix: string; question: string; options: string; answer: string;
  onQuestion: (value: string) => void; onOptions: (value: string) => void; onAnswer: (value: string) => void;
}) {
  const choices = optionLines(options);
  const answerIndex = Math.max(0, choices.findIndex((choice) => choice === answer));
  const updateOptions = (value: string) => { onOptions(value); onAnswer(optionLines(value)[answerIndex] ?? ""); };
  return <div className="question-editor"><label>Câu hỏi<input aria-label={`${prefix} – Câu hỏi`} value={question} onChange={(event) => onQuestion(event.target.value)} /></label><OptionFields prefix={prefix} value={options} onChange={updateOptions} /><label>Đáp án đúng<select aria-label={`${prefix} – Đáp án đúng`} value={String(answerIndex)} onChange={(event) => onAnswer(optionLines(options)[Number(event.target.value)] ?? "")}><option value="0">Lựa chọn 1</option><option value="1">Lựa chọn 2</option><option value="2">Lựa chọn 3</option><option value="3">Lựa chọn 4</option></select><small>4 lựa chọn, toàn tiếng Anh, chỉ một đáp án đúng.</small></label></div>;
}

function OptionFields({ prefix, value, onChange, optional = false }: { prefix: string; value: string; onChange: (value: string) => void; optional?: boolean }) {
  const choices = optionLines(value);
  const setChoice = (index: number, choice: string) => {
    const next = [...choices];
    while (next.length < 4) next.push("");
    next[index] = choice;
    onChange(next.join("\n"));
  };
  return <div className="option-editor-grid" aria-label={`${prefix} – Lựa chọn`}>{[0, 1, 2, 3].map((index) => <input key={index} aria-label={`${prefix} – Lựa chọn ${index + 1}`} value={choices[index] ?? ""} onChange={(event) => setChoice(index, event.target.value)} placeholder={`Lựa chọn ${index + 1}${optional ? " (chỉ khi trắc nghiệm)" : ""}`} />)}</div>;
}

function optionLines(value: string): string[] { return value.split("\n").map((item) => item.trim()); }

function readLesson(lesson?: ContentLessonSummaryView): EditorState {
  const get = (code: LessonPartCode) => record(lesson?.parts.find((part) => part.code === code)?.content);
  const objective = get("objective");
  const vocabulary = get("vocabulary");
  const grammar = get("grammar");
  const pronunciation = get("pronunciation");
  const listening = get("listening");
  const reading = get("reading");
  const writing = get("writing");
  const speaking = get("speaking");
  const items = Array.isArray(vocabulary.items) ? vocabulary.items.map(record) : [];
  return {
    title: lesson?.title ?? "",
    objective: stringValue(objective.text),
    grammar: [stringValue(grammar.formula), stringValue(grammar.usage)].filter(Boolean).join("\n"),
    grammarExamples: listValue(grammar.examples).join("; "),
    vocabulary: [0, 1, 2].map((index) => ({
      word: stringValue(items[index]?.word), pronunciation: stringValue(items[index]?.pronunciation),
      meaning: stringValue(items[index]?.meaning), examples: listValue(items[index]?.examples).join("; ")
    })),
    pronunciationFocus: stringValue(pronunciation.focus),
    pronunciationWords: listValue(pronunciation.words).join(", "),
    pronunciationTip: stringValue(pronunciation.instruction),
    listeningScript: stringValue(listening.script || listening.text),
    listeningQuestion: stringValue(listening.prompt || listening.question),
    listeningOptions: listValue(listening.options).join("\n"), listeningAnswer: stringValue(listening.answer),
    readingPassage: stringValue(reading.text || reading.passage),
    readingQuestion: stringValue(reading.prompt || reading.question),
    readingOptions: listValue(reading.options).join("\n"), readingAnswer: stringValue(reading.answer),
    writingType: normalizeWritingType(stringValue(writing.type)), writingPrompt: stringValue(writing.prompt),
    writingOptions: listValue(writing.options).join("\n"), writingAnswer: stringValue(writing.answer),
    speakingInstruction: stringValue(speaking.instruction) || "Nói to câu sau:",
    speakingSample: stringValue(speaking.sample || speaking.prompt)
  };
}

function normalizeWritingType(value: string): "fill" | "mcq" | "write" {
  if (value === "choice" || value === "mcq") return "mcq";
  if (value === "free" || value === "write") return "write";
  return "fill";
}

function validateLesson(state: EditorState): string[] {
  const problems: string[] = [];
  if (!state.title.trim()) problems.push("thiếu tiêu đề");
  if (!state.grammar.trim()) problems.push("thiếu ngữ pháp");
  const vocabulary = state.vocabulary.filter((row) => row.word.trim());
  if (vocabulary.length < 3) problems.push(`mới có ${vocabulary.length}/3 từ vựng`);
  if (vocabulary.some((row) => !row.meaning.trim())) problems.push("từ vựng thiếu nghĩa tiếng Việt");
  const missingPhrases = vocabulary.filter((row) => splitValues(row.examples, /[;\n]/).length < 3).map((row) => row.word.trim());
  if (missingPhrases.length) problems.push(`chưa đủ 3 cụm từ chứa từ đó cho: ${missingPhrases.join(", ")}`);
  checkQuestion(problems, "Nghe", state.listeningScript, state.listeningQuestion, state.listeningOptions, state.listeningAnswer);
  checkQuestion(problems, "Đọc", state.readingPassage, state.readingQuestion, state.readingOptions, state.readingAnswer);
  if (!state.writingPrompt.trim()) problems.push("thiếu phần Viết");
  else {
    if (!state.writingAnswer.trim()) problems.push("Viết: thiếu đáp án");
    if (state.writingType === "fill" && !/_{2,}/.test(state.writingPrompt)) problems.push("Viết (điền từ): đề cần có chỗ trống ___");
    if (state.writingType === "mcq" && !splitValues(state.writingOptions, /\n/).includes(state.writingAnswer.trim())) problems.push("Viết (trắc nghiệm): đáp án phải trùng một lựa chọn");
  }
  if (!state.speakingSample.trim()) problems.push("thiếu phần Nói (câu mẫu)");
  const pronunciationWords = splitValues(state.pronunciationWords, /[,;\n]/);
  if (!state.pronunciationFocus.trim() && !pronunciationWords.length && !state.pronunciationTip.trim()) problems.push("thiếu phần Phát âm");
  else {
    if (!state.pronunciationFocus.trim()) problems.push("Phát âm: thiếu âm mục tiêu");
    if (pronunciationWords.length < 3) problems.push("Phát âm: cần đủ 3 từ luyện");
  }
  return problems;
}

function checkQuestion(problems: string[], label: string, body: string, question: string, options: string, answer: string) {
  if (![body, question, options, answer].some((value) => value.trim())) { problems.push(`thiếu phần ${label}`); return; }
  const choices = splitValues(options, /\n/);
  if (!body.trim()) problems.push(`${label}: thiếu nội dung`);
  if (!question.trim()) problems.push(`${label}: thiếu câu hỏi`);
  if (choices.length < 2) problems.push(`${label}: cần ít nhất 2 lựa chọn`);
  else if (choices.length < 4) problems.push(`${label}: chuẩn mới là 4 lựa chọn`);
  if (!choices.includes(answer.trim())) problems.push(`${label}: đáp án phải trùng nguyên văn một lựa chọn`);
}

function splitValues(value: string, separator: RegExp): string[] { return value.split(separator).map((item) => item.trim()).filter(Boolean); }

function buildLesson(dayNumber: number, state: EditorState): ContentLessonDraftInput {
  const split = (value: string, separator: RegExp) => value.split(separator).map((item) => item.trim()).filter(Boolean);
  return {
    dayNumber, title: state.title.trim(), durationMinutes: 10,
    parts: [
      { code: "objective", title: "Mục tiêu bài học", content: { text: state.objective.trim() } },
      { code: "instruction", title: "Hướng dẫn làm bài", content: { steps: ["Học nội dung", "Làm lần lượt các bài tập", "Xem phản hồi và làm lại"] } },
      { code: "vocabulary", title: "Từ vựng", content: { items: state.vocabulary.map((row) => ({ word: row.word.trim(), pronunciation: row.pronunciation.trim(), meaning: row.meaning.trim(), examples: split(row.examples, /[;\n]/) })) } },
      { code: "grammar", title: "Ngữ pháp", content: { formula: state.grammar.trim(), examples: split(state.grammarExamples, /[;\n]/) } },
      { code: "pronunciation", title: "Phát âm", content: { focus: state.pronunciationFocus.trim(), words: split(state.pronunciationWords, /[,;\n]/), instruction: state.pronunciationTip.trim() } },
      { code: "listening", title: "Nghe", content: { script: state.listeningScript.trim(), prompt: state.listeningQuestion.trim(), options: split(state.listeningOptions, /\n/), answer: state.listeningAnswer.trim() } },
      { code: "reading", title: "Đọc", content: { text: state.readingPassage.trim(), prompt: state.readingQuestion.trim(), options: split(state.readingOptions, /\n/), answer: state.readingAnswer.trim() } },
      { code: "writing", title: "Viết", content: { type: state.writingType, prompt: state.writingPrompt.trim(), options: split(state.writingOptions, /\n/), answer: state.writingAnswer.trim() } },
      { code: "speaking", title: "Nói", content: { instruction: state.speakingInstruction.trim(), prompt: state.speakingSample.trim() } }
    ]
  };
}

function record(value: unknown): Record<string, unknown> { return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {}; }
function stringValue(value: unknown): string { return typeof value === "string" ? value : ""; }
function listValue(value: unknown): string[] { return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : []; }
