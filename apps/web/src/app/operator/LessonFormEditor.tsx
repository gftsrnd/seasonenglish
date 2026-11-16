import { Fragment, useEffect, useRef, useState, type KeyboardEvent as ReactKeyboardEvent, type ReactNode } from "react";
import type { ContentLessonDraftInput, LessonPartCode } from "@e4s/contracts";
import type { MonthlyGrammarStepSource } from "@e4s/domain/monthly";
import { TriangleAlert, Upload } from "lucide-react";
import { useModal } from "../shared/ModalProvider.js";
import { useMediaQuery } from "../shared/useMediaQuery.js";
import { DailyTeachingEditor } from "./DailyTeachingEditor.js";
import { Banner, Button } from "./primitives.js";
import { AudioSynthesisNotice } from "./AudioSynthesisNotice.js";
import { EditorSection, Field, LineField, OptionFields } from "./LessonEditorFields.js";
import { EditorFindingsStrip } from "./MonthlyFindingsPanel.js";
import { MONTHLY_REVIEW_SECTIONS, type MonthlyFindingLine } from "./monthly-failure-findings.js";
import { applyReviewContents, readReviewContents, REVIEW_SECTION_CODES, reviewItemKey, ReviewSectionEditor, reviewSectionKey, validateReviewContents, type ReviewContents } from "./LessonFormEditorReview.js";
import { errorMessage } from "../shared/error-message.js";
import { ModalCloseButton } from "../shared/CompactUi.js";
import { GrammarPointsEditor, readGrammarDraft, validateGrammarDraft, writeGrammarDraft, type GrammarDraft } from "./lesson-editor-grammar.js";
import { PronunciationSoundsEditor, readPronunciationDraft, validatePronunciationDraft, writePronunciationDraft, type PronunciationDraft } from "./lesson-editor-pronunciation.js";

const lessonPartOrder = ["objective", "instruction", "vocabulary", "grammar", "pronunciation", "listening", "reading", "writing", "word_class", "word_use", "speaking"] as const;
type VocabularyRow = {
  word: string;
  type: string;
  pronunciation: string;
  meaning: string;
  examples: string;
  exampleAudioUrls: string[];
  family: string;
  familyAudioUrls: string[];
  synonyms: string;
  synonymAudioUrls: string[];
  antonyms: string;
  antonymAudioUrls: string[];
  umbrellaWord: string;
  umbrellaMeaning: string;
  umbrellaAudioUrl: string;
  umbrellaSiblings: string;
  umbrellaSiblingAudioUrls: string[];
  imageUrl: string;
  audioUrl: string;
};
type EditorState = {
  title: string; objective: string; instructionSteps: string; instructionAudioUrl: string;
  grammar: string; grammarUsage: string; grammarExamples: string; grammarExampleList: string[]; grammarExampleAudioUrls: string[]; grammarAudioUrl: string; grammarAudioEnabled: boolean; grammarUnavailable: boolean; vocabulary: VocabularyRow[];
  pronunciationFocus: string; pronunciationWords: string; pronunciationWordAudioUrls: string[]; pronunciationTip: string;
  /** Monthly: grammar and pronunciation as the lesson view renders them (one block per point / per sound). */
  grammarDraft: GrammarDraft; pronunciationDraft: PronunciationDraft;
  listeningScript: string; listeningAudioUrl: string; listeningQuestion: string; listeningOptions: string[]; listeningAnswer: number;
  readingPassage: string; readingAudioUrl: string; readingQuestion: string; readingOptions: string[]; readingAnswer: number;
  writingType: "fill" | "mcq" | "write"; writingPrompt: string; writingOptions: string[]; writingAnswer: string; writingAudioUrl: string;
  wordClassQuestion: string; wordClassOptions: string[]; wordClassAnswer: number; wordClassAudioUrl: string;
  wordUseQuestion: string; wordUseOptions: string[]; wordUseAnswer: number; wordUseAudioUrl: string;
  speakingInstruction: string; speakingSample: string; speakingAudioUrl: string;
  /** A1–A2 daily exercises: Vietnamese question/answer translation, shown to the learner once the question is finished. */
  translations: Record<TranslatedPart, ExerciseTranslation>;
};
type ExerciseTranslation = { question: string; answer: string };
/** Daily parts that carry questionTranslation / answerTranslation (A1–A2 only, 13/11). */
const TRANSLATED_PARTS = ["listening", "reading", "writing", "word_class", "word_use"] as const;
type TranslatedPart = typeof TRANSLATED_PARTS[number];
const translatedLevel = (cefr: string) => cefr === "A1" || cefr === "A2";
const focusableSelector = "button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [href], [tabindex]:not([tabindex='-1'])";

function focusableElements(container: HTMLElement): HTMLElement[] {
  return Array.from(container.querySelectorAll<HTMLElement>(focusableSelector)).filter(element => !element.hidden);
}

function describeSaveError(reason: unknown): string {
  return errorMessage(reason, undefined, "Không lưu được bài học.");
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
  headingOverride,
  onSave,
  onCancel,
  uploadMedia,
  busy = false,
  vocabularyCount = 3,
  kind = "lesson",
  monthly = false,
  grammarStepLabels,
  grammarSteps = [],
  findings,
  focusFinding,
  approveAnyway,
  approveBlocked
}: {
  weekNumber: number;
  cefr: string;
  initial: ContentLessonDraftInput;
  /** The monthly authoring flow supplies its calendar date instead of a weekly label. */
  headingOverride?: string;
  onSave(lesson: ContentLessonDraftInput): void | Promise<void>;
  onCancel(): void;
  uploadMedia?(kind: "audio" | "image", file: Blob, filename: string): Promise<{ url: string }>;
  busy?: boolean;
  /** Monthly review days carry the whole week's core words (e.g. 12) instead of 3. */
  vocabularyCount?: number;
  /** "review" = Friday review format: week's words, several review sounds. */
  kind?: "lesson" | "review";
  /**
   * Monthly (v2) lessons: pictures come from the month's illustration pool and word,
   * phrase, grammar-example and pronunciation audio is generated, so those per-item
   * URL fields are hidden (their stored values are still saved back unchanged).
   * Weekly/legacy lessons keep every field.
   */
  monthly?: boolean;
  /** Monthly: readable names for the day's grammar step ids, from the month's resources. */
  grammarStepLabels?: Readonly<Record<string, string>> | undefined;
  /**
   * Monthly: the day's grammar steps in plan order (formula, usage…). With 2+ steps the grammar section shows the
   * blocks the lesson preview builds from them (withMonthlyGrammarSteps), so editor and preview assign examples alike.
   */
  grammarSteps?: readonly MonthlyGrammarStepSource[] | undefined;
  /** Monthly: the day's quality findings (draft check or failed AI candidate), pinned under the header. */
  findings?: { title: string; lines: MonthlyFindingLine[] } | undefined;
  /** Key of the finding to open the editor on (a per-line "Sửa" on the day page); otherwise the first finding. */
  focusFinding?: string | undefined;
  /**
   * 13/11 "Vẫn duyệt": the saved draft still has `severeCount` severe findings; the Operator may approve it as it is
   * (the caller warns first). Only for the saved draft, so it waits until the form has no unsaved edits.
   */
  approveAnyway?: { severeCount: number; onApprove(): void | Promise<void> } | undefined;
  /** 13/11: why "Vẫn duyệt" is not offered — structural problems the server would refuse; shown beside the save button. */
  approveBlocked?: string | undefined;
}) {
  const modal = useModal();
  const [state, setState] = useState<EditorState>(() => readLesson(initial, vocabularyCount, monthly ? grammarSteps : []));
  const [pristineState] = useState(state);
  const reviewTargets = Array.isArray(record(initial.parts.find(part => part.code === "pronunciation")?.content).reviewTargets)
    ? (record(initial.parts.find(part => part.code === "pronunciation")?.content).reviewTargets as unknown[]).map(record)
    : [];
  const review = kind === "review";
  // Review exercises: every question and retry version of the six parts, edited in place (see LessonFormEditorReview).
  const [reviewContents, setReviewContents] = useState<ReviewContents>(() => review ? readReviewContents(initial.parts) : {});
  const [pristineReview] = useState(reviewContents);
  const dailyGrammar = record(initial.parts.find(part => part.code === "grammar")?.content);
  const showGrammarUsage = !monthly || Boolean(stringValue(dailyGrammar.usage).trim());
  const dailyPronunciation = record(initial.parts.find(part => part.code === "pronunciation")?.content);
  const [dailyEdits, setDailyEdits] = useState<{ items: unknown[]; passage: string }>();
  // The read-aloud passage is edited in the Phát âm section (after the sounds, as the view shows it), not in the daily practice.
  const { targetPositions: _passagePositions, ...dailyPracticePronunciation } = dailyPronunciation;
  // Readable step names for the grammar blocks, when the stored step ids line up with them.
  const grammarMilestones = listValue(dailyGrammar.milestoneIds);
  const grammarPointLabels = grammarMilestones.length === state.grammarDraft.points.length ? grammarMilestones.map(id => grammarStepLabels?.[id]) : [];
  const [problems, setProblems] = useState<string[]>([]);
  const [forceSave, setForceSave] = useState(false);
  const [saveError, setSaveError] = useState<string>();
  const dialogRef = useRef<HTMLElement>(null);
  // Phones and portrait tablets get collapsible sections: the full form is 80–150 fields (6–10k px).
  const compactSections = useMediaQuery("(max-width: 900px)");
  const [openSections, setOpenSections] = useState<ReadonlySet<string>>(() => new Set(["general"]));
  const issueSections = new Set(problems.map(problemSection));
  const section = (key: string, title: string, node: ReactNode) => compactSections
    ? <details className="operator-editor-collapsible" data-section={key} data-issue={issueSections.has(key) || undefined} open={openSections.has(key)} onToggle={event => { const open = event.currentTarget.open; setOpenSections(current => { if (current.has(key) === open) return current; const next = new Set(current); if (open) next.add(key); else next.delete(key); return next; }); }}><summary><span>{title}</span>{issueSections.has(key) ? <span className="operator-editor-collapsible-issue">Cần bổ sung</span> : null}</summary>{node}</details>
    : <div className="operator-editor-anchor" data-section={key}>{node}</div>;
  // A finding line jumps to its field: opens the section on narrow screens, scrolls it just below the pinned
  // header and focuses the exact question / retry version / answer choice the finding names, when it names one.
  const findingSection = (line: MonthlyFindingLine): string => {
    const component = line.component;
    if (review && REVIEW_SECTION_CODES.includes(component) && reviewContents[component]) {
      const studyGrammar = component === "grammar" && !line.item && /GRAMMAR_(SCOPE|EXAMPLE|DAILY)|OBJECTIVE/u.test(line.code);
      if (!studyGrammar) return reviewSectionKey(component);
    }
    if (component === "grammar" && dailyGrammar.dailyCode && !review && !/OBJECTIVE|EXAMPLES|REPEATED|WORDS|SCOPE|VOICE/u.test(line.code)) return "daily";
    if (component === "objective" || !component) return "general";
    return ["instruction", "vocabulary", "grammar", "pronunciation", "listening", "reading", "writing", "word_class", "word_use", "speaking"].includes(component) ? component : "general";
  };
  const jumpToFinding = (line: MonthlyFindingLine, behavior: ScrollBehavior = "smooth") => {
    const key = findingSection(line);
    setOpenSections(current => current.has(key) ? current : new Set([...current, key]));
    requestAnimationFrame(() => {
      const dialog = dialogRef.current;
      const section = dialog?.querySelector<HTMLElement>(`[data-section="${key}"]`);
      if (!dialog || !section) return;
      const question = key.startsWith("review-") && line.item
        ? section.querySelector<HTMLElement>(line.variant ? `[data-review-variant="${reviewItemKey(line.component, line.item, line.variant)}"]` : `[data-review-item="${reviewItemKey(line.component, line.item)}"]`)
        : key === "daily" && line.item ? section.querySelector<HTMLElement>(`[data-daily-item="${line.item}"]`) : null;
      const block = question ?? section;
      const field = line.option !== undefined ? block.querySelector<HTMLElement>(`[data-option-index="${line.option}"]`) : null;
      const target = field ?? block;
      const header = dialog.querySelector<HTMLElement>(".operator-editor-sticky-header");
      const top = target.getBoundingClientRect().top - dialog.getBoundingClientRect().top + dialog.scrollTop - (header?.offsetHeight ?? 0) - (field ? 48 : 12);
      if (typeof dialog.scrollTo === "function") dialog.scrollTo({ top, behavior });
      (field ?? focusableElements(block).find(element => element.tagName !== "SUMMARY"))?.focus({ preventScroll: true });
    });
  };
  // "Vẫn duyệt" approves the saved draft, so it waits until every edit in the form is saved.
  const unsaved = state !== pristineState || reviewContents !== pristineReview || dailyEdits !== undefined;
  const editing = initial.parts.some(part => Object.keys(record(part.content)).length > 0);
  const heading = headingOverride ?? `${editing ? "Sửa" : "Soạn"} bài T${initial.dayNumber + 1} · Tuần ${weekNumber} · ${cefr}`;
  const set = <K extends keyof EditorState>(key: K, value: EditorState[K]) => setState(current => ({ ...current, [key]: value }));
  const setVocabulary = (index: number, key: keyof VocabularyRow, value: string) => setState(current => ({ ...current, vocabulary: current.vocabulary.map((row, rowIndex) => rowIndex === index ? { ...row, [key]: value } : row) }));
  const setVocabularyAudio = (index: number, key: "exampleAudioUrls" | "familyAudioUrls" | "synonymAudioUrls" | "antonymAudioUrls" | "umbrellaSiblingAudioUrls", audioIndex: number, value: string) => setState(current => ({ ...current, vocabulary: current.vocabulary.map((row, rowIndex) => rowIndex === index ? { ...row, [key]: replaceAt(row[key], audioIndex, value) } : row) }));
  const setGrammarExampleAudio = (index: number, value: string) => setState(current => ({ ...current, grammarExampleAudioUrls: replaceAt(current.grammarExampleAudioUrls, index, value) }));
  const setTranslation = (code: TranslatedPart, key: keyof ExerciseTranslation, value: string) => setState(current => ({ ...current, translations: { ...current.translations, [code]: { ...current.translations[code], [key]: value } } }));
  // A1–A2 only: the translation fields an Operator fills to fix MONTHLY_EXERCISE_TRANSLATION by hand.
  const translationFields = (code: TranslatedPart, prefix: string) => translatedLevel(cefr) ? <TranslationFields prefix={prefix} value={state.translations[code]} onChange={(key, value) => setTranslation(code, key, value)} /> : null;
  const setPronunciationWordAudio = (index: number, value: string) => setState(current => ({ ...current, pronunciationWordAudioUrls: replaceAt(current.pronunciationWordAudioUrls, index, value) }));
  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    // Opened to fix findings: land on the chosen (else the first) flagged item instead of the top of the form.
    const opening = findings?.lines.find(line => line.key === focusFinding) ?? findings?.lines[0];
    (focusableElements(dialog)[0] ?? dialog).focus();
    if (opening) jumpToFinding(opening, "auto");
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
    const nextProblems = [...validateLesson(state, vocabularyCount, review, monthly), ...(review ? validateReviewContents(reviewContents) : [])];
    if (nextProblems.length && !forceSave) { setProblems(nextProblems); setForceSave(true); setOpenSections(current => new Set([...current, ...nextProblems.map(problemSection).filter(Boolean)])); return; }
    if (!await modal.confirm({
      title: forceSave ? "Lưu tạm bài học?" : "Kiểm tra và lưu bài?",
      message: forceSave ? "Bài vẫn còn nội dung cần bổ sung." : "Các thay đổi sẽ được lưu vào bản nháp.",
      confirmLabel: forceSave ? "Lưu tạm" : "Kiểm tra & lưu"
    })) return;
    setSaveError(undefined);
    try {
      const lesson = buildLesson(initial, state, { monthly, review: review ? reviewContents : undefined, translations: translatedLevel(cefr), grammarSteps });
      // The edited practice rows keep every stored field the form does not show (e.g. A1–A2 question/answer translations).
      const storedItems = new Map((Array.isArray(dailyGrammar.items) ? dailyGrammar.items : []).map(record).map(item => [stringValue(item.id), item] as const));
      if (dailyEdits && !review) lesson.parts = lesson.parts.map(part => part.code === "grammar" ? { ...part, content: { ...part.content, items: dailyEdits.items.map(item => ({ ...storedItems.get(stringValue(record(item).id)), ...record(item) })) } } : part);
      await onSave(lesson);
    } catch (reason) {
      setSaveError(describeSaveError(reason));
    }
  };
  return <div className="modal-backdrop operator-modal-scope" role="presentation" onClick={event => { if (event.target === event.currentTarget && !busy) onCancel(); }}><section ref={dialogRef} className="dialog wide operator-lesson-editor" role="dialog" aria-modal="true" aria-labelledby="lesson-editor-title" aria-describedby="lesson-editor-description" aria-busy={busy || undefined} tabIndex={-1} onKeyDown={handleKeyDown}>
    <header className="operator-editor-sticky-header"><div className="row between operator-editor-heading"><h3 id="lesson-editor-title">{heading}</h3><ModalCloseButton disabled={busy} onClick={onCancel} /></div>{findings?.lines.length ? <EditorFindingsStrip lines={findings.lines} onSelect={line => jumpToFinding(line)} /> : null}</header>
    <p id="lesson-editor-description" className="xs muted operator-editor-description">{kind === "review" ? `Bài ôn tuần: ôn ${vocabularyCount} từ cốt lõi của tuần, ngữ pháp và các âm đã học, kèm 6 phần bài tập ôn (mỗi câu có bản làm lại khi học viên làm sai). Không thêm tài nguyên mới.` : `Mỗi bài cần ${vocabularyCount} từ (mỗi từ 3 cụm), ngữ pháp, phát âm (1 âm + 3 từ) và 6 bài tập Nghe/Đọc/Viết/Từ loại/Dùng từ/Nói.`} Câu trắc nghiệm: 4 lựa chọn tiếng Anh, chỉ một đáp án đúng. {cefr === "A1" || cefr === "A2" ? "A1–A2: giải thích tiếng Việt." : "B1+: dùng tiếng Anh."}{monthly ? " Ảnh minh họa lấy từ bộ ảnh của tháng; audio từ, cụm từ và câu ví dụ được tạo tự động." : ""}</p>
    <div className="operator-lesson-editor-form">
      {section("general", "Chung", <EditorSection title="Chung" disabled={busy}><Field label="Tiêu đề bài" hint={monthly ? (cefr === "B1" || cefr === "B2" || cefr === "C1" ? "Tên học viên thấy, bằng tiếng Anh (B1+). VD: Lesson 7, Week 2 review." : "Tên hiển thị theo lịch tháng. VD: Bài 7, Bài ôn tuần 2.") : "Tên ngắn của mẫu câu, bằng tiếng Anh. VD: I work as…"}><LineField aria-label="Tiêu đề bài" value={state.title} onChange={event => set("title", event.target.value)} /></Field><Field label="Mục tiêu bài học" hint="Mỗi mục tiêu một dòng. Hệ thống tự bỏ phần mở đầu bị lặp khi hiển thị."><textarea aria-label="Mục tiêu bài học" value={state.objective} onChange={event => set("objective", event.target.value)} /></Field></EditorSection>)}
      {section("instruction", "Hướng dẫn", <EditorSection title="Hướng dẫn" disabled={busy}><Field label="Các bước hướng dẫn" hint="Mỗi bước một dòng hoặc cách nhau bằng dấu ;"><textarea aria-label="Các bước hướng dẫn" value={state.instructionSteps} onChange={event => set("instructionSteps", event.target.value)} /></Field></EditorSection>)}
      {section("vocabulary", kind === "review" ? `Từ vựng ôn tập (${vocabularyCount})` : `Từ vựng (${vocabularyCount})`, <EditorSection title={kind === "review" ? `Từ vựng ôn tập (${vocabularyCount} từ của tuần)` : `Từ vựng (${vocabularyCount} từ)`} disabled={busy}>
        <div className="operator-vocabulary-grid">{state.vocabulary.map((row, index) => <div className="operator-vocabulary-row" aria-label={`Từ vựng ${index + 1}`} key={index}>
          <div className="operator-vocabulary-base"><LineField aria-label={`Từ ${index + 1}`} value={row.word} onChange={event => setVocabulary(index, "word", event.target.value)} placeholder={`Từ ${index + 1}`} /><LineField aria-label={`Từ loại từ ${index + 1}`} value={row.type} onChange={event => setVocabulary(index, "type", event.target.value)} placeholder="Từ loại" /><LineField aria-label={`Phiên âm từ ${index + 1}`} value={row.pronunciation} onChange={event => setVocabulary(index, "pronunciation", event.target.value)} placeholder="Phiên âm /…/" /><LineField aria-label={`Nghĩa từ ${index + 1}`} value={row.meaning} onChange={event => setVocabulary(index, "meaning", event.target.value)} placeholder="Nghĩa tiếng Việt" /><LineField aria-label={`Cụm từ ${index + 1}`} value={row.examples} onChange={event => setVocabulary(index, "examples", event.target.value)} placeholder="3 cụm từ, cách nhau bằng ;" /></div>
          {monthly ? null : <div className="operator-vocabulary-media"><MediaField label={`Ảnh minh họa từ ${index + 1}`} kind="image" accept="image/png,image/jpeg,image/webp,image/gif" value={row.imageUrl} onChange={value => setVocabulary(index, "imageUrl", value)} uploadMedia={uploadMedia} /><MediaField label={`Audio từ vựng ${index + 1}`} kind="audio" accept="audio/*,.mp3,.m4a,.wav,.ogg,.webm" value={row.audioUrl} onChange={value => setVocabulary(index, "audioUrl", value)} uploadMedia={uploadMedia} /></div>}
          <EntryAudioFields hidden={monthly} labelPrefix={`Audio cụm từ ${index + 1}`} values={splitValues(row.examples, /[;\n]/)} audioUrls={row.exampleAudioUrls} onChange={(audioIndex, value) => setVocabularyAudio(index, "exampleAudioUrls", audioIndex, value)} uploadMedia={uploadMedia} />
          <details className="operator-vocabulary-advanced"><summary>Mở rộng từ {index + 1}</summary><div className="operator-vocabulary-advanced-grid">
            <Field label={`Họ từ của từ ${index + 1}`} hint="Mỗi mục: từ | từ loại | nghĩa; cách nhau bằng dấu ;"><textarea aria-label={`Họ từ của từ ${index + 1}`} value={row.family} onChange={event => setVocabulary(index, "family", event.target.value)} placeholder="colleague | noun | đồng nghiệp" /></Field>
            <EntryAudioFields hidden={monthly} labelPrefix="Audio họ từ" values={structuredWords(row.family)} audioUrls={row.familyAudioUrls} onChange={(audioIndex, value) => setVocabularyAudio(index, "familyAudioUrls", audioIndex, value)} uploadMedia={uploadMedia} />
            <Field label={`Từ đồng nghĩa từ ${index + 1}`} hint="Mỗi mục: từ | level | ghi chú"><textarea aria-label={`Từ đồng nghĩa từ ${index + 1}`} value={row.synonyms} onChange={event => setVocabulary(index, "synonyms", event.target.value)} placeholder="coworker | A2 | phổ biến" /></Field>
            <EntryAudioFields hidden={monthly} labelPrefix="Audio từ đồng nghĩa" values={structuredWords(row.synonyms)} audioUrls={row.synonymAudioUrls} onChange={(audioIndex, value) => setVocabularyAudio(index, "synonymAudioUrls", audioIndex, value)} uploadMedia={uploadMedia} />
            <Field label={`Từ trái nghĩa từ ${index + 1}`} hint="Để trống nếu không có từ trái nghĩa tự nhiên"><textarea aria-label={`Từ trái nghĩa từ ${index + 1}`} value={row.antonyms} onChange={event => setVocabulary(index, "antonyms", event.target.value)} placeholder="old | A2 | trái nghĩa của new" /></Field>
            <EntryAudioFields hidden={monthly} labelPrefix="Audio từ trái nghĩa" values={structuredWords(row.antonyms)} audioUrls={row.antonymAudioUrls} onChange={(audioIndex, value) => setVocabularyAudio(index, "antonymAudioUrls", audioIndex, value)} uploadMedia={uploadMedia} />
            <Field label={`Từ bao trùm từ ${index + 1}`}><LineField aria-label={`Từ bao trùm từ ${index + 1}`} value={row.umbrellaWord} onChange={event => setVocabulary(index, "umbrellaWord", event.target.value)} placeholder="work communication" /></Field>
            <Field label={`Nghĩa từ bao trùm từ ${index + 1}`}><LineField aria-label={`Nghĩa từ bao trùm từ ${index + 1}`} value={row.umbrellaMeaning} onChange={event => setVocabulary(index, "umbrellaMeaning", event.target.value)} placeholder="giao tiếp công việc" /></Field>
            {row.umbrellaWord.trim() && !monthly ? <MediaField label={`Audio từ bao trùm: ${row.umbrellaWord.trim()}`} kind="audio" accept="audio/*,.mp3,.m4a,.wav,.ogg,.webm" value={row.umbrellaAudioUrl} onChange={value => setVocabulary(index, "umbrellaAudioUrl", value)} uploadMedia={uploadMedia} compact /> : null}
            <div className="operator-vocabulary-sibling-row"><Field label={`Từ cùng nhóm từ ${index + 1}`} hint="Mỗi mục: từ | nghĩa; cách nhau bằng dấu ;"><textarea aria-label={`Từ cùng nhóm từ ${index + 1}`} value={row.umbrellaSiblings} onChange={event => setVocabulary(index, "umbrellaSiblings", event.target.value)} placeholder="manager | quản lý; client | khách hàng" /></Field>
            <EntryAudioFields hidden={monthly} labelPrefix="Audio từ cùng nhóm" values={structuredWords(row.umbrellaSiblings)} audioUrls={row.umbrellaSiblingAudioUrls} onChange={(audioIndex, value) => setVocabularyAudio(index, "umbrellaSiblingAudioUrls", audioIndex, value)} uploadMedia={uploadMedia} /></div>
          </div></details>
        </div>)}</div>
        {monthly ? null : <span className="xs muted">Có thể tải ảnh từ máy hoặc dán URL ảnh. Nếu để trống, bài vẫn hiển thị gọn mà không tạo khung ảnh rỗng.</span>}
      </EditorSection>)}
      {section("grammar", "Ngữ pháp", <EditorSection title="Ngữ pháp" disabled={busy}>{!monthly || state.grammarUnavailable ? <label className="row small"><input type="checkbox" checked={state.grammarUnavailable} onChange={event => set("grammarUnavailable", event.target.checked)} />Bài này không có nội dung ngữ pháp phù hợp</label> : null}{state.grammarUnavailable ? <p className="xs muted">Phần Ngữ pháp sẽ được đánh dấu không áp dụng và ẩn với học viên. Không cần nhập nội dung giả.</p> : monthly ? <GrammarPointsEditor draft={state.grammarDraft} onChange={value => set("grammarDraft", value)} translations={translatedLevel(cefr)} pointLabels={grammarPointLabels} /> : <><Field label="Ngữ pháp" hint="Công thức hoặc mẫu câu ngắn, có thể dùng ngay."><textarea aria-label="Ngữ pháp" value={state.grammar} onChange={event => set("grammar", event.target.value)} /></Field>{showGrammarUsage ? <Field label="Cách dùng ngữ pháp" hint="Giải thích khi nào và trong ngữ cảnh nào dùng mẫu câu."><textarea aria-label="Cách dùng ngữ pháp" value={state.grammarUsage} onChange={event => set("grammarUsage", event.target.value)} /></Field> : null}{monthly ? <GrammarExampleList values={state.grammarExampleList} onChange={value => set("grammarExampleList", value)} /> : <Field label="Câu ví dụ để đọc thành tiếng" hint="2–3 câu tiếng Anh, cách nhau bằng dấu ;"><textarea aria-label="Câu ví dụ ngữ pháp" value={state.grammarExamples} placeholder="I work as a tester.; She works in the sales team." onChange={event => set("grammarExamples", event.target.value)} /></Field>}<EntryAudioFields hidden={monthly} labelPrefix="Audio ví dụ ngữ pháp" values={splitValues(state.grammarExamples, /[;\n]/)} audioUrls={state.grammarExampleAudioUrls} onChange={setGrammarExampleAudio} uploadMedia={uploadMedia} />{monthly ? null : <><label className="row small"><input type="checkbox" checked={state.grammarAudioEnabled} onChange={event => set("grammarAudioEnabled", event.target.checked)} />Bật audio cho Ngữ pháp</label>{state.grammarAudioEnabled ? <MediaField label="Audio Ngữ pháp" kind="audio" accept="audio/*,.mp3,.m4a,.wav,.ogg,.webm" value={state.grammarAudioUrl} onChange={value => set("grammarAudioUrl", value)} uploadMedia={uploadMedia} compact /> : null}</>}</>}</EditorSection>)}
      {section("pronunciation", kind === "review" ? "Phát âm ôn tập" : "Phát âm", <EditorSection title={kind === "review" ? "Phát âm ôn tập" : "Phát âm"} disabled={busy}>{monthly ? <PronunciationSoundsEditor draft={state.pronunciationDraft} onChange={value => set("pronunciationDraft", value)} cefr={cefr} catalogId={stringValue(dailyPronunciation.catalogId) || undefined} /> : <>{reviewTargets.length > 1 ? <p className="xs muted">Bài ôn luyện {reviewTargets.length} âm: {reviewTargets.map(target => `${stringValue(target.focus)} (${(Array.isArray(target.words) ? target.words.map(word => stringValue(record(word).word)) : []).join(", ")})`).join(" · ")}. Ô bên dưới là âm hiển thị đầu tiên.</p> : null}<div className="grid cols-3"><Field label="Âm mục tiêu"><LineField aria-label="Âm mục tiêu" value={state.pronunciationFocus} onChange={event => set("pronunciationFocus", event.target.value)} /></Field><Field label="3 từ luyện âm"><LineField aria-label="3 từ luyện âm" value={state.pronunciationWords} onChange={event => set("pronunciationWords", event.target.value)} /></Field><Field label="Mẹo phát âm"><LineField aria-label="Mẹo phát âm" value={state.pronunciationTip} onChange={event => set("pronunciationTip", event.target.value)} /></Field></div><EntryAudioFields hidden={monthly} labelPrefix="Audio từ luyện âm" values={splitValues(state.pronunciationWords, /[,;\n]/)} audioUrls={state.pronunciationWordAudioUrls} onChange={setPronunciationWordAudio} uploadMedia={uploadMedia} /></>}</EditorSection>)}
      {dailyGrammar.dailyCode && !review ? section("daily", "Luyện tập theo ngày", <DailyTeachingEditor grammar={dailyGrammar} pronunciation={dailyPracticePronunciation} grammarStepLabels={grammarStepLabels} disabled={busy} onChange={(items, passage) => setDailyEdits({items, passage})} />) : null}
      {review ? MONTHLY_REVIEW_SECTIONS.map((reviewSection, index) => { const content = reviewContents[reviewSection.code]; return content ? <Fragment key={reviewSection.code}>{section(reviewSectionKey(reviewSection.code), `Phần ${index + 1} · ${reviewSection.title}`, <ReviewSectionEditor code={reviewSection.code} sectionNumber={index + 1} title={reviewSection.title} content={content} disabled={busy} onChange={next => setReviewContents(current => ({ ...current, [reviewSection.code]: next }))} />)}</Fragment> : null; }) : <>
      {section("listening", "Nghe", <EditorSection title="Nghe" disabled={busy}><Field label="Nội dung nghe" hint="Nếu chưa tải file audio thật, phần Nghe chưa thể phát."><textarea aria-label="Nội dung nghe" value={state.listeningScript} placeholder="1–2 câu tiếng Anh" onChange={event => set("listeningScript", event.target.value)} /></Field><MediaField label="File audio phần Nghe" kind="audio" accept="audio/*,.mp3,.m4a,.wav,.ogg,.webm" value={state.listeningAudioUrl} onChange={value => set("listeningAudioUrl", value)} uploadMedia={uploadMedia} /><AudioSynthesisNotice mark={(initial.parts.find(part => part.code === "listening")?.content as Record<string, unknown> | undefined)?.audioSynthesis} hasAudio={Boolean(state.listeningAudioUrl.trim())} retry="tải file audio phần Nghe hoặc sinh lại bài để thử lại" /><QuestionFields prefix="Nghe" question={state.listeningQuestion} options={state.listeningOptions} answer={state.listeningAnswer} onQuestion={value => set("listeningQuestion", value)} onOptions={value => set("listeningOptions", value)} onAnswer={value => set("listeningAnswer", value)} />{translationFields("listening", "Nghe")}</EditorSection>)}
      {section("reading", "Đọc", <EditorSection title="Đọc" disabled={busy}><Field label="Đoạn văn"><textarea value={state.readingPassage} placeholder="2–4 câu tiếng Anh" onChange={event => set("readingPassage", event.target.value)} /></Field><QuestionFields prefix="Đọc" question={state.readingQuestion} options={state.readingOptions} answer={state.readingAnswer} onQuestion={value => set("readingQuestion", value)} onOptions={value => set("readingOptions", value)} onAnswer={value => set("readingAnswer", value)} />{translationFields("reading", "Đọc")}</EditorSection>)}
      {section("writing", "Viết", <EditorSection title="Viết" disabled={busy}><Field label="Dạng bài"><select value={state.writingType} onChange={event => set("writingType", event.target.value as EditorState["writingType"])}><option value="fill">Điền từ</option><option value="mcq">Trắc nghiệm</option><option value="write">Tự viết</option></select></Field><Field label="Đề bài"><textarea value={state.writingPrompt} onChange={event => set("writingPrompt", event.target.value)} /></Field><OptionFields prefix="Viết" options={state.writingOptions} onChange={value => set("writingOptions", value)} optional /><Field label="Đáp án"><LineField value={state.writingAnswer} onChange={event => set("writingAnswer", event.target.value)} /></Field>{translationFields("writing", "Viết")}</EditorSection>)}
      {section("word_class", "Từ loại", <EditorSection title="Từ loại" disabled={busy}><QuestionFields prefix="Từ loại" question={state.wordClassQuestion} options={state.wordClassOptions} answer={state.wordClassAnswer} onQuestion={value => set("wordClassQuestion", value)} onOptions={value => set("wordClassOptions", value)} onAnswer={value => set("wordClassAnswer", value)} />{translationFields("word_class", "Từ loại")}</EditorSection>)}
      {section("word_use", "Dùng từ", <EditorSection title="Dùng từ" disabled={busy}><QuestionFields prefix="Dùng từ" question={state.wordUseQuestion} options={state.wordUseOptions} answer={state.wordUseAnswer} onQuestion={value => set("wordUseQuestion", value)} onOptions={value => set("wordUseOptions", value)} onAnswer={value => set("wordUseAnswer", value)} />{translationFields("word_use", "Dùng từ")}</EditorSection>)}
      {section("speaking", "Nói", <EditorSection title="Nói" disabled={busy}><Field label="Yêu cầu"><LineField aria-label="Yêu cầu" value={state.speakingInstruction} placeholder="Nói to câu sau." onChange={event => set("speakingInstruction", event.target.value)} /></Field><Field label="Câu mẫu học viên phải nói"><textarea aria-label="Câu mẫu học viên phải nói" value={state.speakingSample} onChange={event => set("speakingSample", event.target.value)} /></Field></EditorSection>)}
      </>}
      {saveError && <div className="operator-editor-notice" role="alert"><Banner tone="danger" icon={<TriangleAlert className="operator-banner-svg" size={17} strokeWidth={2.25} />}>{saveError}</Banner></div>}
      {problems.length > 0 && <div className="operator-editor-notice" role="alert"><Banner tone="warn"><div className="small"><b>{problems.length} mục cần bổ sung:</b><ul>{problems.map(problem => <li key={problem}>{problem}</li>)}</ul><p>Bạn có thể sửa tiếp, hoặc lưu tạm: bài sẽ bị gắn nhãn &quot;chưa đủ 4 kỹ năng&quot; cho đến khi bổ sung.</p></div></Banner></div>}
      <div className="row operator-editor-actions"><Button type="button" disabled={busy} onClick={onCancel}>Huỷ</Button>{busy && <span className="small muted" role="status" aria-live="polite">Đang lưu…</span>}{!approveAnyway && approveBlocked ? <p className="xs operator-editor-approve-blocked" role="note">{approveBlocked}</p> : null}{approveAnyway ? <Button type="button" className="btn-danger operator-lesson-approve-anyway-button" disabled={busy || unsaved} title={unsaved ? "Lưu bản nháp trước; nút này duyệt bản đã lưu." : undefined} onClick={() => void approveAnyway.onApprove()}>Vẫn duyệt (còn {approveAnyway.severeCount} lỗi nặng)</Button> : null}<Button type="button" className="operator-lesson-save-button" primary busy={busy} disabled={busy} onClick={() => void submit()}>{busy ? "Đang lưu…" : forceSave ? "Lưu dù còn thiếu" : "Kiểm tra & lưu"}</Button></div>
      {approveAnyway && unsaved ? <p className="xs muted">Có thay đổi chưa lưu: hãy bấm “Kiểm tra &amp; lưu” trước khi vẫn duyệt bản nháp.</p> : null}
    </div>
  </section></div>;
}

function problemSection(problem: string): string {
  const text = problem.toLowerCase();
  const reviewPart = /^phần (\d+) · /u.exec(text);
  if (reviewPart) { const code = MONTHLY_REVIEW_SECTIONS[Number(reviewPart[1]) - 1]?.code; return code ? reviewSectionKey(code) : ""; }
  if (text.includes("tiêu đề")) return "general";
  if (text.includes("từ vựng") || text.includes("cụm từ")) return "vocabulary";
  if (text.includes("phát âm")) return "pronunciation";
  if (text.includes("ngữ pháp")) return "grammar";
  if (text.includes("nghe")) return "listening";
  if (text.includes("đọc")) return "reading";
  if (text.includes("viết")) return "writing";
  if (text.includes("nói")) return "speaking";
  return "";
}

function EntryAudioFields({ labelPrefix, values, audioUrls, onChange, uploadMedia, hidden = false }: { hidden?: boolean; labelPrefix: string; values: string[]; audioUrls: string[]; onChange(index: number, value: string): void; uploadMedia: ((kind: "audio" | "image", file: Blob, filename: string) => Promise<{ url: string }>) | undefined }) {
  if (hidden || !values.length) return null;
  return <div className="operator-vocabulary-entry-audio-grid">{values.map((value, index) => <MediaField compact key={`${labelPrefix}-${index}-${value}`} label={labelPrefix.includes("cụm từ") ? `${labelPrefix}.${index + 1}` : `${labelPrefix}: ${value}`} kind="audio" accept="audio/*,.mp3,.m4a,.wav,.ogg,.webm" value={audioUrls[index] ?? ""} onChange={next => onChange(index, next)} uploadMedia={uploadMedia} />)}</div>;
}

function MediaField({ label, kind, accept, value, onChange, uploadMedia, compact = false }: { label: string; kind: "audio" | "image"; accept: string; value: string; onChange(value: string): void; uploadMedia: ((kind: "audio" | "image", file: Blob, filename: string) => Promise<{ url: string }>) | undefined; compact?: boolean }) {
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string>();
  const action = kind === "audio" ? "Chọn audio" : "Chọn ảnh";
  return <div className={`field operator-media-field${compact ? " operator-media-field--compact" : ""}`}><span>{label}</span><div className="operator-media-input-row"><input aria-label={`${label} URL`} value={value} placeholder={kind === "audio" ? "Dán URL audio hoặc chọn file" : "Dán URL ảnh hoặc chọn file"} onChange={event => onChange(event.target.value)} /><label className="operator-media-upload"><Upload size={15} aria-hidden="true" />{uploading ? "Đang tải…" : action}<input hidden type="file" aria-label={`Tải ${label}`} accept={accept} disabled={!uploadMedia || uploading} onChange={event => { const file = event.target.files?.[0]; event.target.value = ""; if (!file || !uploadMedia) return; setError(undefined); setUploading(true); void uploadMedia(kind, file, file.name).then(result => onChange(result.url)).catch(reason => setError(describeSaveError(reason))).finally(() => setUploading(false)); }} /></label></div>{!uploadMedia ? <small className="xs muted">Có thể dán URL. Tải file trực tiếp chưa khả dụng trong môi trường này.</small> : null}{error ? <small role="alert" className="xs danger">{error}</small> : null}{value && kind === "audio" ? <audio controls preload="metadata" src={value} aria-label={`Nghe ${label}`} /> : null}{value && kind === "image" ? <img src={value} alt={`Xem trước ${label}`} className="operator-media-preview" /> : null}</div>;
}

function QuestionFields({ prefix, question, options, answer, onQuestion, onOptions, onAnswer }: { prefix: string; question: string; options: string[]; answer: number; onQuestion(value: string): void; onOptions(value: string[]): void; onAnswer(value: number): void }) {
  return <><Field label="Câu hỏi"><LineField aria-label={`${prefix} – Câu hỏi`} value={question} onChange={event => onQuestion(event.target.value)} /></Field><OptionFields prefix={prefix} options={options} onChange={onOptions} /><Field label="Đáp án đúng"><select aria-label={`${prefix} – Đáp án đúng`} value={answer} onChange={event => onAnswer(Number(event.target.value))}>{[0, 1, 2, 3].map(index => <option key={index} value={index}>Lựa chọn {index + 1}</option>)}</select></Field></>;
}

/** Same pair of fields as the weekly-review form (LessonFormEditorReview): question and answer translation. */
function TranslationFields({ prefix, value, onChange }: { prefix: string; value: ExerciseTranslation; onChange(key: keyof ExerciseTranslation, value: string): void }) {
  return <div className="grid cols-2">
    <Field label="Dịch câu hỏi"><LineField aria-label={`${prefix} – Dịch câu hỏi`} value={value.question} onChange={event => onChange("question", event.target.value)} /></Field>
    <Field label="Dịch đáp án"><LineField aria-label={`${prefix} – Dịch đáp án`} value={value.answer} onChange={event => onChange("answer", event.target.value)} /></Field>
  </div>;
}

/** Monthly grammar examples: one input per sentence (the 3-example rule), never one ";"-joined textarea. */
function GrammarExampleList({ values, onChange }: { values: string[]; onChange(value: string[]): void }) {
  const slots = Math.max(3, values.length);
  return <div className="field" role="group" aria-label="Câu ví dụ ngữ pháp"><span>Câu ví dụ để đọc thành tiếng</span><div className="operator-grammar-example-list">{Array.from({ length: slots }, (_, index) => <LineField key={index} aria-label={`Câu ví dụ ngữ pháp ${index + 1}`} value={values[index] ?? ""} placeholder={`Câu ví dụ ${index + 1} (tiếng Anh)`} onChange={event => onChange(replaceAt(values, index, event.target.value))} />)}</div><small className="xs muted">Mỗi ô một câu tiếng Anh, tối đa 3 câu.</small></div>;
}

function readLesson(lesson: ContentLessonDraftInput, vocabularyCount = 3, grammarSteps: readonly MonthlyGrammarStepSource[] = []): EditorState {
  const get = (code: LessonPartCode) => record(lesson.parts.find(part => part.code === code)?.content);
  const objective = get("objective"), instruction = get("instruction"), vocabulary = get("vocabulary"), grammar = get("grammar"), pronunciation = get("pronunciation"), listening = get("listening"), reading = get("reading"), writing = get("writing"), wordClass = get("word_class"), wordUse = get("word_use"), speaking = get("speaking");
  const items = Array.isArray(vocabulary.items) ? vocabulary.items.map(record) : [];
  const readOptions = (value: unknown) => [...listValue(value), "", "", "", ""].slice(0, 4);
  const listeningOptions = readOptions(listening.options), readingOptions = readOptions(reading.options), wordClassOptions = readOptions(wordClass.options), wordUseOptions = readOptions(wordUse.options);
  const objectiveItems = Array.isArray(objective.items) ? objective.items.map(item => typeof item === "string" ? item : stringValue(record(item).text)).filter(Boolean) : [];
  return {
    title: lesson.title,
    objective: objectiveItems.length ? objectiveItems.join("\n") : stringValue(objective.text),
    instructionSteps: listValue(instruction.steps).join("; "),
    instructionAudioUrl: stringValue(instruction.audioUrl),
    grammar: stringValue(grammar.formula || grammar.text),
    grammarUsage: stringValue(grammar.usage),
    grammarExamples: listValue(grammar.examples).join("; "),
    grammarExampleList: listValue(grammar.examples),
    grammarExampleAudioUrls: listValue(grammar.exampleAudioUrls),
    grammarAudioUrl: stringValue(grammar.audioUrl),
    grammarAudioEnabled: Boolean(stringValue(grammar.audioUrl)),
    grammarUnavailable: grammar.hidden === true || stringValue(grammar.status) === "unavailable" || stringValue(grammar.reason) === "no_suitable_content",
    vocabulary: Array.from({ length: Math.max(vocabularyCount, items.length) }, (_, index) => index).map(index => {
      const item = items[index] ?? {};
      const umbrella = record(item.umbrella);
      return {
        word: stringValue(item.word ?? item.e),
        type: stringValue(item.type ?? item.partOfSpeech ?? item.pos),
        pronunciation: stringValue(item.pronunciation ?? item.ipa),
        meaning: stringValue(item.meaning ?? item.v),
        examples: listValue(item.collocations ?? item.phrases ?? item.examples).join("; "),
        exampleAudioUrls: listValue(item.collocationAudioUrls ?? item.exampleAudioUrls),
        family: formatStructuredEntries(item.family, ["type", "meaning"]),
        familyAudioUrls: structuredAudioUrls(item.family),
        synonyms: formatStructuredEntries(item.synonyms ?? item.syn, ["level", "note"]),
        synonymAudioUrls: structuredAudioUrls(item.synonyms ?? item.syn),
        antonyms: formatStructuredEntries(item.antonyms ?? item.ant, ["level", "note"]),
        antonymAudioUrls: structuredAudioUrls(item.antonyms ?? item.ant),
        umbrellaWord: stringValue(umbrella.word ?? umbrella.w),
        umbrellaMeaning: stringValue(umbrella.meaning ?? umbrella.v),
        umbrellaAudioUrl: stringValue(umbrella.audioUrl),
        umbrellaSiblings: formatStructuredEntries(umbrella.siblings ?? umbrella.words, ["meaning"]),
        umbrellaSiblingAudioUrls: structuredAudioUrls(umbrella.siblings ?? umbrella.words),
        imageUrl: stringValue(item.imageUrl),
        audioUrl: stringValue(item.audioUrl)
      };
    }),
    pronunciationFocus: stringValue(pronunciation.focus),
    pronunciationWords: (Array.isArray(pronunciation.words) ? pronunciation.words.map(value => typeof value === "string" ? value : stringValue(record(value).word ?? record(value).w)).filter(Boolean) : []).join(", "),
    pronunciationWordAudioUrls: listValue(pronunciation.wordAudioUrls).length ? listValue(pronunciation.wordAudioUrls) : (Array.isArray(pronunciation.words) ? pronunciation.words.map(value => stringValue(record(value).audioUrl)) : []),
    pronunciationTip: stringValue(pronunciation.instruction || pronunciation.tip),
    grammarDraft: readGrammarDraft(grammar, grammarSteps),
    pronunciationDraft: readPronunciationDraft(pronunciation),
    listeningScript: stringValue(listening.audio || listening.script || listening.text),
    listeningAudioUrl: stringValue(listening.audioUrl),
    listeningQuestion: stringValue(listening.prompt || listening.question),
    listeningOptions,
    listeningAnswer: Math.max(0, listeningOptions.indexOf(stringValue(listening.answer))),
    readingPassage: stringValue(reading.text || reading.passage),
    readingAudioUrl: stringValue(reading.audioUrl),
    readingQuestion: stringValue(reading.prompt || reading.question),
    readingOptions,
    readingAnswer: Math.max(0, readingOptions.indexOf(stringValue(reading.answer))),
    writingType: normalizeWritingType(stringValue(writing.type)),
    writingPrompt: stringValue(writing.prompt),
    writingOptions: readOptions(writing.options),
    writingAnswer: stringValue(writing.answer),
    writingAudioUrl: stringValue(writing.audioUrl),
    wordClassQuestion: stringValue(wordClass.prompt || wordClass.question),
    wordClassOptions,
    wordClassAnswer: Math.max(0, wordClassOptions.indexOf(stringValue(wordClass.answer))),
    wordClassAudioUrl: stringValue(wordClass.audioUrl),
    wordUseQuestion: stringValue(wordUse.prompt || wordUse.question),
    wordUseOptions,
    wordUseAnswer: Math.max(0, wordUseOptions.indexOf(stringValue(wordUse.answer))),
    wordUseAudioUrl: stringValue(wordUse.audioUrl),
    speakingInstruction: stringValue(speaking.instruction || speaking.prompt) || "Nói to câu sau.",
    speakingSample: stringValue(speaking.sample || speaking.answer || speaking.modelAnswer),
    speakingAudioUrl: stringValue(speaking.audioUrl || speaking.audio),
    translations: Object.fromEntries(TRANSLATED_PARTS.map(code => { const content = get(code); return [code, { question: stringValue(content.questionTranslation), answer: stringValue(content.answerTranslation) }]; })) as Record<TranslatedPart, ExerciseTranslation>
  };
}

function validateLesson(state: EditorState, vocabularyCount = 3, review = false, monthly = false): string[] {
  const problems: string[] = [];
  if (!state.title.trim()) problems.push("thiếu tiêu đề");
  if (!state.grammarUnavailable) problems.push(...(monthly ? validateGrammarDraft(state.grammarDraft) : !state.grammar.trim() ? ["thiếu ngữ pháp"] : []));
  const vocabulary = state.vocabulary.filter(row => row.word.trim());
  if (vocabulary.length < vocabularyCount) problems.push(`mới có ${vocabulary.length}/${vocabularyCount} từ vựng`);
  if (vocabulary.some(row => !row.meaning.trim())) problems.push("từ vựng thiếu nghĩa tiếng Việt");
  const missingPhrases = vocabulary.filter(row => splitValues(row.examples, /[;\n]/).length < 3).map(row => row.word.trim());
  if (missingPhrases.length) problems.push(`chưa đủ 3 cụm từ chứa từ đó cho: ${missingPhrases.join(", ")}`);
  // Review exercises are checked per question by validateReviewContents.
  if (!review) {
    checkQuestion(problems, "Nghe", state.listeningScript, state.listeningQuestion, state.listeningOptions, state.listeningAnswer);
    checkQuestion(problems, "Đọc", state.readingPassage, state.readingQuestion, state.readingOptions, state.readingAnswer);
    if (!state.writingPrompt.trim()) problems.push("thiếu phần Viết"); else if (!state.writingAnswer.trim()) problems.push("Viết: thiếu đáp án"); else if (state.writingType === "fill" && (state.writingPrompt.match(/(?:_\s*){2,}_|(?:-\s*){2,}-/gu)?.length ?? 0) !== 1) problems.push("Viết dạng điền cần đúng một chỗ trống ___");
    if (!state.speakingSample.trim()) problems.push("thiếu phần Nói (câu mẫu)");
  }
  if (monthly) return [...problems, ...validatePronunciationDraft(state.pronunciationDraft)];
  const pronunciationWords = splitValues(state.pronunciationWords, /[,;\n]/);
  if (!state.pronunciationFocus.trim() && !pronunciationWords.length && !state.pronunciationTip.trim()) problems.push("thiếu phần Phát âm"); else { if (!state.pronunciationFocus.trim()) problems.push("Phát âm: thiếu âm mục tiêu"); if (pronunciationWords.length < 3) problems.push("Phát âm: cần đủ 3 từ luyện"); }
  return problems;
}

function checkQuestion(problems: string[], label: string, body: string, question: string, options: string[], answer: number) { const choices = options.filter(choice => choice.trim()); if (![body, question, ...choices].some(value => value.trim())) { problems.push(`thiếu phần ${label}`); return; } if (!body.trim()) problems.push(`${label}: thiếu nội dung`); if (!question.trim()) problems.push(`${label}: thiếu câu hỏi`); if (choices.length < 4) problems.push(`${label}: chuẩn mới là 4 lựa chọn`); if (!options[answer]?.trim()) problems.push(`${label}: đáp án phải trùng nguyên văn một lựa chọn`); }

const reviewStudyCodes: readonly string[] = ["objective", "instruction", "vocabulary", "grammar", "pronunciation"];

/**
 * Generated example marks (13/11: { row, marks } per example) belong to the exact formula and examples they were
 * written for: once the Operator edits either, they are dropped and the formula-based highlight takes over.
 */
function withoutStaleExampleMarks(grammar: Record<string, unknown>, formula: string, examples: readonly string[]): Record<string, unknown> {
  if (!("exampleMarks" in grammar)) return grammar;
  const before = Array.isArray(grammar.examples) ? grammar.examples.map((example) => typeof example === "string" ? example.trim() : "") : [];
  const unchanged = typeof grammar.formula === "string" && grammar.formula.trim() === formula && before.length === examples.length && before.every((example, index) => example === examples[index]);
  if (unchanged) return grammar;
  const { exampleMarks: _stale, ...rest } = grammar;
  return rest;
}

/**
 * Monthly grammar: the edited points written back into the fields the lesson view reads (lesson-editor-grammar);
 * every other stored field (items, dailyCode, objective, milestones, the top-level list of a multi-step day…) is kept.
 * A lesson that was marked "no grammar" and is now filled in becomes available again.
 */
function monthlyGrammarContent(prior: Record<string, unknown>, draft: GrammarDraft, plan: readonly MonthlyGrammarStepSource[] = []): Record<string, unknown> {
  const written = writeGrammarDraft(prior, draft, plan);
  const wasUnavailable = prior.hidden === true || stringValue(prior.status) === "unavailable" || stringValue(prior.reason) === "no_suitable_content";
  if (!wasUnavailable) return written;
  const { reason: _reason, ...rest } = written;
  return { ...rest, status: "available", hidden: false };
}

function buildLesson(initial: ContentLessonDraftInput, state: EditorState, options: { monthly?: boolean; review?: ReviewContents | undefined; translations?: boolean; grammarSteps?: readonly MonthlyGrammarStepSource[] | undefined } = {}): ContentLessonDraftInput {
  const prior = (code: LessonPartCode) => record(initial.parts.find(part => part.code === code)?.content);
  const priorVocabulary = prior("vocabulary");
  const priorVocabularyItems = Array.isArray(priorVocabulary.items) ? priorVocabulary.items : [];
  // Monthly examples come from one input per sentence; a cleared input drops its sentence and that sentence's audio.
  const monthlyExamples = state.grammarExampleList.map((value, index) => ({ value: value.trim(), audioUrl: state.grammarExampleAudioUrls[index]?.trim() ?? "" })).filter(example => example.value);
  const grammarExamples = options.monthly ? monthlyExamples.map(example => example.value) : splitValues(state.grammarExamples, /[;\n]/);
  const grammarExampleAudioUrls = options.monthly ? monthlyExamples.map(example => example.audioUrl) : alignAudioUrls(grammarExamples, state.grammarExampleAudioUrls);
  const { phonemeAudioId: _legacyPhonemeAudioId, phonemeAudioUrl: _legacyPhonemeAudioUrl, ...priorPronunciation } = prior("pronunciation");
  const known: ContentLessonDraftInput["parts"] = [
    { code: "objective", title: "Mục tiêu bài học", content: buildObjectiveContent(prior("objective"), state.objective) },
    { code: "instruction", title: "Hướng dẫn làm bài", content: { ...prior("instruction"), steps: splitValues(state.instructionSteps, /[;\n]/).length ? splitValues(state.instructionSteps, /[;\n]/) : ["Học nội dung", "Làm lần lượt các bài tập", "Xem phản hồi và làm lại"], audioUrl: "" } },
    { code: "vocabulary", title: "Từ vựng", content: { ...priorVocabulary, items: state.vocabulary.map((row, index) => ({ ...record(priorVocabularyItems[index]), word: row.word.trim(), type: row.type.trim(), pronunciation: row.pronunciation.trim(), meaning: row.meaning.trim(), collocations: splitValues(row.examples, /[;\n]/), examples: splitValues(row.examples, /[;\n]/), collocationAudioUrls: alignedAudioUrls(row.examples, row.exampleAudioUrls), exampleAudioUrls: alignedAudioUrls(row.examples, row.exampleAudioUrls), family: parseStructuredEntries(row.family, ["type", "meaning"], row.familyAudioUrls), synonyms: parseStructuredEntries(row.synonyms, ["level", "note"], row.synonymAudioUrls), antonyms: parseStructuredEntries(row.antonyms, ["level", "note"], row.antonymAudioUrls), umbrella: buildUmbrella(row), imageUrl: row.imageUrl.trim(), audioUrl: row.audioUrl.trim(), ...(row.imageUrl.trim() && row.imageUrl.trim() !== stringValue(record(priorVocabularyItems[index]).imageUrl).trim() ? { imageAttribution: { creator: "Người vận hành", licence: "Nội dung nội bộ", licenceUrl: "", sourceUrl: row.imageUrl.trim() } } : {}) })) } },
    { code: "grammar", title: "Ngữ pháp", content: state.grammarUnavailable
      ? { status: "unavailable", hidden: true, reason: "no_suitable_content" }
      : options.monthly ? monthlyGrammarContent(prior("grammar"), state.grammarDraft, options.grammarSteps)
      : { ...withoutStaleExampleMarks(prior("grammar"), state.grammar.trim(), grammarExamples), status: "available", hidden: false, formula: state.grammar.trim(), usage: state.grammarUsage.trim(), examples: grammarExamples, exampleAudioUrls: grammarExampleAudioUrls, audioUrl: state.grammarAudioEnabled ? state.grammarAudioUrl.trim() : "" } },
    { code: "pronunciation", title: "Phát âm", content: options.monthly ? writePronunciationDraft(prior("pronunciation"), state.pronunciationDraft) : { ...priorPronunciation, focus: state.pronunciationFocus.trim(), words: splitValues(state.pronunciationWords, /[,;\n]/).map(word => { const known = (Array.isArray(priorPronunciation.words) ? priorPronunciation.words : []).map(record).find(item => stringValue(item.word ?? item.w).trim().toLowerCase() === word.toLowerCase()); const ipa = known ? stringValue(known.ipa) : ""; return ipa ? { word, ipa } : word; }),wordAudioUrls: alignAudioUrls(splitValues(state.pronunciationWords, /[,;\n]/), state.pronunciationWordAudioUrls), instruction: state.pronunciationTip.trim(), audioUrl: "" } },
    { code: "listening", title: "Nghe", content: { ...prior("listening"), script: state.listeningScript.trim(), audioUrl: state.listeningAudioUrl.trim(), prompt: state.listeningQuestion.trim(), options: state.listeningOptions.map(value => value.trim()).filter(Boolean), answer: state.listeningOptions[state.listeningAnswer]?.trim() ?? "" } },
    { code: "reading", title: "Đọc", content: { ...prior("reading"), text: state.readingPassage.trim(), prompt: state.readingQuestion.trim(), options: state.readingOptions.map(value => value.trim()).filter(Boolean), answer: state.readingOptions[state.readingAnswer]?.trim() ?? "", audioUrl: "" } },
    { code: "writing", title: "Viết", content: { ...prior("writing"), type: state.writingType, prompt: state.writingPrompt.trim(), options: state.writingOptions.map(value => value.trim()).filter(Boolean), answer: state.writingAnswer.trim(), audioUrl: "" } },
    { code: "word_class", title: initial.parts.find(part => part.code === "word_class")?.title ?? "Từ loại", content: { ...prior("word_class"), prompt: state.wordClassQuestion.trim(), options: state.wordClassOptions.map(value => value.trim()).filter(Boolean), answer: state.wordClassOptions[state.wordClassAnswer]?.trim() ?? "", audioUrl: "" } },
    { code: "word_use", title: initial.parts.find(part => part.code === "word_use")?.title ?? "Dùng từ", content: { ...prior("word_use"), prompt: state.wordUseQuestion.trim(), options: state.wordUseOptions.map(value => value.trim()).filter(Boolean), answer: state.wordUseOptions[state.wordUseAnswer]?.trim() ?? "", audioUrl: "" } },
    { code: "speaking", title: "Nói", content: { ...prior("speaking"), instruction: state.speakingInstruction.trim(), sample: state.speakingSample.trim(), answer: state.speakingSample.trim(), audioUrl: "" } }
  ];
  if (options.review) {
    // Review: the study parts are rebuilt from the form; the exercise parts keep their stored shape (and order) with
    // only the edited questions changed. No daily single-question fields are written onto them, and no part is added or reordered.
    const reviewContents = options.review;
    const study = new Map(known.filter(part => reviewStudyCodes.includes(part.code)).map(part => [part.code, part]));
    const withReviewItems = (part: ContentLessonDraftInput["parts"][number]) => {
      const edited = reviewContents[part.code];
      return part.code === "grammar" && edited && Array.isArray(edited.items) ? { ...part, content: { ...part.content, items: edited.items } } : part;
    };
    const parts = initial.parts.map(part => { const built = study.get(part.code); return built ? withReviewItems(built) : applyReviewContents(part, reviewContents); });
    return { dayNumber: initial.dayNumber, title: state.title.trim(), durationMinutes: initial.durationMinutes || 10, parts };
  }
  // A1–A2: the edited translations replace the stored ones; a pair left empty is not written.
  const withTranslations = options.translations ? known.map(part => {
    if (!(TRANSLATED_PARTS as readonly string[]).includes(part.code)) return part;
    const { questionTranslation: _question, answerTranslation: _answer, ...content } = part.content as Record<string, unknown>;
    const value = state.translations[part.code as TranslatedPart];
    const question = value.question.trim(), answer = value.answer.trim();
    return { ...part, content: { ...content, ...(question ? { questionTranslation: question } : {}), ...(answer ? { answerTranslation: answer } : {}) } };
  }) : known;
  return { dayNumber: initial.dayNumber, title: state.title.trim(), durationMinutes: initial.durationMinutes || 10, parts: [...withTranslations, ...initial.parts.filter(part => !lessonPartOrder.includes(part.code as typeof lessonPartOrder[number]))] };
}

function normalizeWritingType(value: string): EditorState["writingType"] { if (value === "choice" || value === "mcq") return "mcq"; if (value === "free" || value === "write") return "write"; return "fill"; }
function splitValues(value: string, separator: RegExp): string[] { return value.split(separator).map(item => item.trim()).filter(Boolean); }
function structuredWords(value: string): string[] { return splitValues(value, /[;\n]/).map(segment => segment.split("|")[0]?.trim() ?? "").filter(Boolean); }
function replaceAt(values: string[], index: number, value: string): string[] { const next = [...values]; while (next.length <= index) next.push(""); next[index] = value; return next; }
function alignedAudioUrls(value: string, audioUrls: string[]): string[] { return splitValues(value, /[;\n]/).map((_, index) => audioUrls[index]?.trim() ?? ""); }
function alignAudioUrls(values: string[], audioUrls: string[]): string[] { return values.map((_, index) => audioUrls[index]?.trim() ?? ""); }
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
function structuredAudioUrls(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.map(entry => stringValue(record(entry).audioUrl));
}
function parseStructuredEntries(value: string, fields: Array<"type" | "meaning" | "level" | "note">, audioUrls: string[] = []): Array<Record<string, string>> {
  return splitValues(value, /[;\n]/).flatMap((segment, entryIndex) => {
    const [word = "", ...values] = segment.split("|").map(part => part.trim());
    if (!word) return [];
    const entry: Record<string, string> = { word };
    fields.forEach((field, index) => { if (values[index]) entry[field] = values[index]!; });
    if (audioUrls[entryIndex]?.trim()) entry.audioUrl = audioUrls[entryIndex]!.trim();
    return [entry];
  });
}
function buildUmbrella(row: VocabularyRow): Record<string, unknown> | null {
  const siblings = parseStructuredEntries(row.umbrellaSiblings, ["meaning"], row.umbrellaSiblingAudioUrls);
  if (!row.umbrellaWord.trim() && !row.umbrellaMeaning.trim() && !siblings.length) return null;
  return { word: row.umbrellaWord.trim(), meaning: row.umbrellaMeaning.trim(), audioUrl: row.umbrellaAudioUrl.trim(), siblings };
}
function buildObjectiveContent(prior: Record<string, unknown>, value: string): Record<string, unknown> {
  const texts = splitValues(value, /\n/);
  const priorItems = Array.isArray(prior.items) ? prior.items.map(record) : [];
  return {
    ...prior,
    text: texts.join("\n"),
    items: texts.map((text, index) => ({ ...priorItems[index], text })),
    audioUrl: ""
  };
}
function record(value: unknown): Record<string, unknown> { return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {}; }
function stringValue(value: unknown): string { return typeof value === "string" ? value : ""; }
function listValue(value: unknown): string[] { return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : []; }
