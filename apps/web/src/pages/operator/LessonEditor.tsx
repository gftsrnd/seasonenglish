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
  const set = <K extends keyof EditorState>(key: K, value: EditorState[K]) => setState((current) => ({ ...current, [key]: value }));
  const setVocabulary = (index: number, key: keyof VocabularyRow, value: string) => setState((current) => ({
    ...current,
    vocabulary: current.vocabulary.map((row, rowIndex) => rowIndex === index ? { ...row, [key]: value } : row)
  }));

  return <div className="lesson-editor-backdrop">
    <section className="lesson-editor" role="dialog" aria-modal="true" aria-labelledby="lesson-editor-title">
      <div className="lesson-editor-heading"><div><h3 id="lesson-editor-title">Sửa bài T{dayNumber + 1} · Tuần {weekNumber} · {cefr}</h3><p>Mỗi bài cần đủ: 3 từ vựng, ngữ pháp, phát âm và 4 phần Nghe, Đọc, Viết, Nói. Mức A1–A2: giải thích bằng tiếng Việt.</p></div><button type="button" onClick={onClose}>Đóng</button></div>
      <form onSubmit={(event) => { event.preventDefault(); void onSave(buildLesson(dayNumber, state)); }}>
        <EditorSection title="Chung">
          <label>Tiêu đề bài<input aria-label="Tiêu đề bài" required value={state.title} onChange={(event) => set("title", event.target.value)} /><small>Tên ngắn của mẫu câu, bằng tiếng Anh. VD: I work as…</small></label>
          <label>Mục tiêu bài học<textarea required value={state.objective} onChange={(event) => set("objective", event.target.value)} /><small>Sau bài này học viên làm được gì (1 câu).</small></label>
        </EditorSection>
        <EditorSection title="Ngữ pháp">
          <label>Ngữ pháp<textarea required value={state.grammar} onChange={(event) => set("grammar", event.target.value)} /><small>Công thức + dùng khi nào + 2–3 câu ví dụ có dùng từ vựng.</small></label>
          <label>Câu ví dụ để đọc thành tiếng<textarea required value={state.grammarExamples} onChange={(event) => set("grammarExamples", event.target.value)} /><small>2–3 câu tiếng Anh, cách nhau bằng dấu ;</small></label>
        </EditorSection>
        <EditorSection title="Từ vựng (3 từ)">
          <div className="vocabulary-editor-grid">{state.vocabulary.map((row, index) => <div className="vocabulary-editor-row" key={index}>
            <input aria-label={`Từ ${index + 1}`} required value={row.word} onChange={(event) => setVocabulary(index, "word", event.target.value)} placeholder={`Từ ${index + 1}`} />
            <input aria-label={`Phiên âm từ ${index + 1}`} required value={row.pronunciation} onChange={(event) => setVocabulary(index, "pronunciation", event.target.value)} placeholder="Phiên âm /…/" />
            <input aria-label={`Nghĩa từ ${index + 1}`} required value={row.meaning} onChange={(event) => setVocabulary(index, "meaning", event.target.value)} placeholder="Nghĩa tiếng Việt" />
            <input aria-label={`Cụm từ ${index + 1}`} required value={row.examples} onChange={(event) => setVocabulary(index, "examples", event.target.value)} placeholder="3 cụm từ, cách nhau bằng ;" />
          </div>)}</div>
        </EditorSection>
        <EditorSection title="Phát âm">
          <div className="editor-two-columns"><label>Âm mục tiêu<input required value={state.pronunciationFocus} onChange={(event) => set("pronunciationFocus", event.target.value)} /></label><label>3 từ luyện âm<input required value={state.pronunciationWords} onChange={(event) => set("pronunciationWords", event.target.value)} /></label></div>
          <label>Mẹo phát âm<textarea required value={state.pronunciationTip} onChange={(event) => set("pronunciationTip", event.target.value)} /></label>
        </EditorSection>
        <EditorSection title="Nghe">
          <label>Đoạn audio (máy đọc, học viên không thấy chữ)<textarea required value={state.listeningScript} onChange={(event) => set("listeningScript", event.target.value)} /></label>
          <QuestionFields prefix="Nghe" question={state.listeningQuestion} options={state.listeningOptions} answer={state.listeningAnswer} onQuestion={(value) => set("listeningQuestion", value)} onOptions={(value) => set("listeningOptions", value)} onAnswer={(value) => set("listeningAnswer", value)} />
        </EditorSection>
        <EditorSection title="Đọc">
          <label>Đoạn văn<textarea required value={state.readingPassage} onChange={(event) => set("readingPassage", event.target.value)} /></label>
          <QuestionFields prefix="Đọc" question={state.readingQuestion} options={state.readingOptions} answer={state.readingAnswer} onQuestion={(value) => set("readingQuestion", value)} onOptions={(value) => set("readingOptions", value)} onAnswer={(value) => set("readingAnswer", value)} />
        </EditorSection>
        <EditorSection title="Viết">
          <label>Dạng bài<select value={state.writingType} onChange={(event) => set("writingType", event.target.value)}><option value="fill">Điền từ</option><option value="choice">Trắc nghiệm</option><option value="free">Tự viết</option></select></label>
          <label>Đề bài<textarea required value={state.writingPrompt} onChange={(event) => set("writingPrompt", event.target.value)} /></label>
          <label>Lựa chọn (chỉ khi trắc nghiệm)<textarea value={state.writingOptions} onChange={(event) => set("writingOptions", event.target.value)} placeholder="Mỗi lựa chọn một dòng" /></label>
          <label>Đáp án<input required value={state.writingAnswer} onChange={(event) => set("writingAnswer", event.target.value)} /></label>
        </EditorSection>
        <EditorSection title="Nói">
          <label>Yêu cầu<input required value={state.speakingInstruction} onChange={(event) => set("speakingInstruction", event.target.value)} placeholder="Nói to câu sau." /></label>
          <label>Câu mẫu học viên phải nói<textarea required value={state.speakingSample} onChange={(event) => set("speakingSample", event.target.value)} /></label>
        </EditorSection>
        <div className="lesson-editor-actions"><button type="button" onClick={onClose}>Huỷ</button><button className="button--primary" type="submit">Kiểm tra & lưu</button></div>
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
  return <div className="question-editor"><label>Câu hỏi<input aria-label={`${prefix} – Câu hỏi`} required value={question} onChange={(event) => onQuestion(event.target.value)} /></label><label>4 lựa chọn<textarea aria-label={`${prefix} – Lựa chọn`} required value={options} onChange={(event) => onOptions(event.target.value)} placeholder="Mỗi lựa chọn một dòng" /></label><label>Đáp án đúng<input aria-label={`${prefix} – Đáp án đúng`} required value={answer} onChange={(event) => onAnswer(event.target.value)} /></label></div>;
}

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
    writingType: stringValue(writing.type) || "fill", writingPrompt: stringValue(writing.prompt),
    writingOptions: listValue(writing.options).join("\n"), writingAnswer: stringValue(writing.answer),
    speakingInstruction: stringValue(speaking.instruction) || "Nói to câu sau:",
    speakingSample: stringValue(speaking.sample || speaking.prompt)
  };
}

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
