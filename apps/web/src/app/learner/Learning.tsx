import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { CheckCircle2, ChevronLeft, LockKeyhole, Mic, RotateCcw, Square, Upload, Volume2 } from "lucide-react";
import type {
  LessonPart,
  LessonPartAttemptEvidenceInput,
  LessonPartCode,
  LessonVocabularyItem,
  LessonVocabularyLexicalDetail,
  PartEvidence
} from "@e4s/contracts";
import type { LearnerCallbacks, LessonView } from "./contracts.js";
import { ErrorText, Notice, PageTitle, AppLink } from "./ui.js";
import { VocabularyCard as SharedVocabularyCard, type VocabularyRelationChip } from "../shared/lesson/VocabularyCard.js";
import { conciseGrammarExample, conciseLessonObjective, conciseSpeakingInstruction, conciseSpeakingModel, learnerFacingObjective, learnerFacingObjectiveBody, learnerObjectiveLead } from "../shared/lesson/presentation.js";
import { lessonInstructionSteps } from "../shared/lesson/instructions.js";
export { normalizeLessonBlankPrompt } from "./text.js";
import { normalizeLessonBlankPrompt } from "./text.js";

/** Keeps browser TTS on spoken English rather than structural lesson notation. */
export function sanitizeGrammarSpeechText(value: string): string {
  return value
    .replace(/^(?:example|ví dụ)\s*:\s*/iu, "")
    .split("|")[0]!
    .replace(/[+*=~]/gu, " ")
    .replace(/\s+/gu, " ")
    .trim();
}

const studyCodes: LessonPartCode[] = ["objective", "vocabulary", "grammar", "pronunciation"];
const studyDisplayCodes: LessonPartCode[] = ["objective", "instruction", "vocabulary", "grammar", "pronunciation"];
const practiceCodes: LessonPartCode[] = ["listening", "reading", "writing", "word_class", "word_use", "speaking"];
const listenButtonStyle = { display: "inline-flex", alignItems: "center", gap: 6 } as const;
type LessonTab = "study" | "practice";

function lessonTabStorageKey(lessonId: string): string {
  return `e4s:lesson:${lessonId}:active-tab`;
}

function readLessonTab(lesson: LessonView["lesson"]): LessonTab {
  if (typeof window === "undefined" || !lessonStudyIsComplete(lesson)) return "study";
  try {
    return window.sessionStorage.getItem(lessonTabStorageKey(lesson.id)) === "practice" ? "practice" : "study";
  } catch {
    return "study";
  }
}

function persistLessonTab(lessonId: string, tab: LessonTab): void {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.setItem(lessonTabStorageKey(lessonId), tab);
  } catch {
    // The lesson remains available when session storage is unavailable.
  }
}

function pronunciationListenStorageKey(lessonId: string): string {
  return `e4s:lesson:${lessonId}:pronunciation-listened`;
}

function readPronunciationListened(lessonId: string): Set<string> {
  if (typeof window === "undefined") return new Set();
  try {
    const raw = window.localStorage.getItem(pronunciationListenStorageKey(lessonId));
    const parsed: unknown = raw ? JSON.parse(raw) : [];
    return new Set(Array.isArray(parsed) ? parsed.filter((value): value is string => typeof value === "string" && value.trim().length > 0) : []);
  } catch {
    return new Set();
  }
}

function persistPronunciationListened(lessonId: string, words: Set<string>): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(pronunciationListenStorageKey(lessonId), JSON.stringify(Array.from(words)));
  } catch {
    // Progress remains usable when private-mode storage is unavailable.
  }
}

type VocabularyModalState =
  | { kind: "family"; item: LessonVocabularyItem }
  | { kind: "synonyms"; item: LessonVocabularyItem }
  | { kind: "antonyms"; item: LessonVocabularyItem }
  | { kind: "umbrella"; item: LessonVocabularyItem }
  | { kind: "lexical"; item: LessonVocabularyItem; detail?: LessonVocabularyLexicalDetail };

export function LearnerLesson({ view, actions }: { view: LessonView; actions: LearnerCallbacks }) {
  const lesson = view.lesson;
  const [tab, setTab] = useState<LessonTab>(() => readLessonTab(lesson));
  const [studyComplete, setStudyComplete] = useState(() => lessonStudyIsComplete(lesson));
  const [answers, setAnswers] = useState<Record<string, string>>(() => Object.fromEntries(
    Object.entries(view.lesson.progress.evidence).map(([code, evidence]) => [code, evidence?.answer ?? ""])
  ));
  const [localProgress, setLocalProgress] = useState(() => view.lesson.progress);
  const [mediaArtifacts, setMediaArtifacts] = useState<Record<string, string>>(() => Object.fromEntries(
    Object.entries(view.lesson.progress.evidence)
      .filter(([, evidence]) => Boolean(evidence?.artifactKey))
      .map(([code, evidence]) => [code, evidence!.artifactKey!])
  ));
  const [error, setError] = useState("");
  const [busyAction, setBusyAction] = useState<string | null>(null);
  const busyActionRef = useRef<string | null>(null);
  const lessonIdRef = useRef(lesson.id);
  const [completedLocally, setCompletedLocally] = useState(false);
  const [pronunciationListened, setPronunciationListened] = useState<Set<string>>(() => readPronunciationListened(lesson.id));
  const [vocabularyModal, setVocabularyModal] = useState<VocabularyModalState | null>(null);
  const [appealPart, setAppealPart] = useState<LessonPartCode | null>(null);
  const [appealReasons, setAppealReasons] = useState<Partial<Record<LessonPartCode, string>>>({});
  const selectTab = (next: LessonTab) => {
    setTab(next);
    persistLessonTab(lesson.id, next);
  };
  useEffect(() => {
    const isNewLesson = lessonIdRef.current !== lesson.id;
    lessonIdRef.current = lesson.id;
    const serverAnswers = Object.fromEntries(Object.entries(lesson.progress.evidence).map(([code, evidence]) => [code, evidence?.answer ?? ""]));
    setLocalProgress(lesson.progress);
    setMediaArtifacts(Object.fromEntries(
      Object.entries(lesson.progress.evidence)
      .filter(([, evidence]) => Boolean(evidence?.artifactKey))
      .map(([code, evidence]) => [code, evidence!.artifactKey!])
    ));
    setAnswers((current) => isNewLesson ? serverAnswers : { ...serverAnswers, ...current });
    if (isNewLesson) {
      setTab(readLessonTab(lesson));
      setError("");
      setCompletedLocally(false);
      setPronunciationListened(readPronunciationListened(lesson.id));
      setAppealPart(null);
      setAppealReasons({});
      busyActionRef.current = null;
      setBusyAction(null);
    }
  }, [lesson.id, lesson.progress]);
  const markPronunciationListened = (word: string) => {
    setPronunciationListened((current) => {
      const next = new Set(current).add(word);
      persistPronunciationListened(lesson.id, next);
      return next;
    });
  };
  useEffect(() => {
    const complete = lessonStudyIsComplete(lesson);
    setStudyComplete(complete);
    if (!complete) selectTab("study");
  }, [lesson.id, lesson.progress.completedPartCodes, lesson.progress.status]);
  if (view.lock) {
    const prior = view.lock.reason === "prior";
    const openDate = view.lock.opensAt ? formatLessonDate(view.lock.opensAt) : null;
    return <div className="app-learner-page"><div className="card"><div className="row" style={{ gap: 12, alignItems: "flex-start" }}><div style={{ flex: 1 }}><div className="eyebrow" style={{ display: "inline-flex", alignItems: "center", gap: 6 }}><LockKeyhole size={16} aria-hidden="true" /> Bài {view.lesson.dayNumber}/{view.lock.totalLessons} · {prior ? "chưa mở" : "chưa đến ngày"}</div><h3>{prior ? "Học bù bài trước đã nhé" : openDate ? `Bài này mở vào ${openDate}` : "Bài này chưa mở"}</h3><p className="small">{view.lock.message}</p><div className="row">{prior && view.lock.blocker ? <AppLink className="btn btn-primary" href={`/lesson/${view.lock.blocker.id}`} navigate={actions.navigate}>Học bài {lessonDayLabel(view.lock.blocker.dayNumber)} ngay</AppLink> : <AppLink className="btn btn-primary" href="/coach" navigate={actions.navigate}>Luyện với Season</AppLink>}<AppLink className="btn" href="/home" navigate={actions.navigate}>← Về trang chủ</AppLink></div></div></div></div></div>;
  }
  const startAction = (action: string) => {
    if (busyActionRef.current) return false;
    busyActionRef.current = action;
    setBusyAction(action);
    return true;
  };
  const stopAction = () => {
    busyActionRef.current = null;
    setBusyAction(null);
  };
  const save = async (part: LessonPart, evidenceInput: LessonPartAttemptEvidenceInput = { answer: answers[part.code] ?? "" }) => {
    if (busyActionRef.current) return;
    setError("");
    const artifactKey = evidenceInput.artifactKey ?? mediaArtifacts[part.code];
    if (part.code === "speaking" && !artifactKey) {
      setError("Hãy ghi âm hoặc tải file ghi âm lên trước khi kiểm tra phần Nói.");
      return;
    }
    const submittedEvidence: LessonPartAttemptEvidenceInput = {
      ...evidenceInput,
      ...(artifactKey ? { artifactKey } : {})
    };
    if (!startAction(part.code)) return;
    if (actions.submitLessonPartAttempt) {
      try {
        const result = await actions.submitLessonPartAttempt(part.code, submittedEvidence);
        setLocalProgress(result.progress);
        if (result.evidence.artifactKey) setMediaArtifacts((current) => ({ ...current, [part.code]: result.evidence.artifactKey! }));
      } catch {
        setError("Chưa lưu được câu trả lời. Dữ liệu trên màn hình vẫn được giữ để bạn thử lại.");
      } finally {
        stopAction();
      }
      return;
    }
    try {
      const answer = submittedEvidence.answer ?? "";
      const completed = Array.from(new Set([...lesson.progress.completedPartCodes, part.code]));
      const nextProgress: typeof lesson.progress = { ...lesson.progress, status: completed.length === lesson.content.parts.length ? "completed" : "in_progress", completedPartCodes: completed, evidence: { ...lesson.progress.evidence, [part.code]: { attempts: (lesson.progress.evidence[part.code]?.attempts ?? 0) + 1, answer, ...(artifactKey ? { artifactKey } : {}) } } };
      await actions.saveLessonProgress(nextProgress);
      setLocalProgress(nextProgress);
    } catch {
      setError("Chưa lưu được câu trả lời. Dữ liệu trên màn hình vẫn được giữ để bạn thử lại.");
    } finally {
      stopAction();
    }
  };
  const appeal = async (partCode: LessonPartCode, reason: string) => {
    if (!actions.appealLessonPart || busyActionRef.current || !startAction(`appeal:${partCode}`)) return;
    setError("");
    try {
      const result = await actions.appealLessonPart(partCode, reason.trim());
      setLocalProgress(result.progress);
      setAppealPart(null);
    } catch {
      setError("Chưa gửi được kháng nghị. Bạn có thể thử lại.");
    } finally {
      stopAction();
    }
  };
  const finishStudy = async () => {
    if (!startAction("study")) return;
    setError("");
    try {
      await actions.completeLessonStudy();
      setStudyComplete(true);
      selectTab("practice");
    } catch {
      setError("Chưa ghi nhận được phần Học. Nội dung vẫn được giữ để bạn thử lại.");
    } finally {
      stopAction();
    }
  };
  const completeLesson = async () => {
    if (!startAction("complete")) return;
    setError("");
    try {
      await actions.saveLessonProgress({
        ...localProgress,
        status: "completed",
        completedPartCodes: localProgress.completedPartCodes,
        evidence: localProgress.evidence
      });
      setCompletedLocally(true);
      if (lesson.progress.status !== "completed") actions.navigate("/home");
    } catch {
      setError("Chưa ghi nhận được bài học. Nội dung vẫn được giữ để bạn thử lại.");
    } finally {
      stopAction();
    }
  };
  const visible = lesson.content.parts
    .filter((part) => isLearnerVisiblePart(part) && (tab === "study" ? studyDisplayCodes.includes(part.code) : part.code === "instruction" || practiceCodes.includes(part.code)))
    .sort((left, right) => tab === "study"
      ? studyDisplayCodes.indexOf(left.code) - studyDisplayCodes.indexOf(right.code)
      : 0);
  const evidence = localProgress.evidence;
  const requiredPronunciationWords = readPronunciationWords(
    lesson.content.parts.find((part) => part.code === "pronunciation")?.content.words
  ).slice(0, 3).map((item) => item.word);
  const speakingAlreadyRecorded = partIsDone(
    evidence.speaking,
    localProgress.completedPartCodes.includes("speaking")
  );
  const speakingUnlocked = speakingAlreadyRecorded || requiredPronunciationWords.length === 0
    || requiredPronunciationWords.every((word) => pronunciationListened.has(word));
  const requiredPracticeCodes = lesson.content.parts.map((part) => part.code).filter((code) => practiceCodes.includes(code));
  const completedPracticeCount = requiredPracticeCodes.filter((code) => partCountsTowardCompletion(localProgress, code)).length;
  const allPracticeComplete = requiredPracticeCodes.length === 0 || completedPracticeCount === requiredPracticeCodes.length;
  const completed = localProgress.status === "completed" || completedLocally;
  const grammarAvailable = lesson.content.parts.some((part) => {
    if (part.code !== "grammar") return false;
    const content = part.content as Record<string, unknown>;
    return content.hidden !== true && content.status !== "unavailable" && typeof content.formula === "string" && Boolean(content.formula.trim());
  });
  return <div className="app-learner-page lesson-page" style={{ display: "grid", gap: 16, width: "100%", maxWidth: 960, minWidth: 0, boxSizing: "border-box", paddingBottom: "calc(88px + env(safe-area-inset-bottom))" }}>
    <div className="lesson-heading">
      <AppLink className="lesson-back" href="/home" navigate={actions.navigate} ariaLabel="Về trang chủ" title="Về trang chủ" style={{ minWidth: 32, minHeight: 32 }}><ChevronLeft size={22} aria-hidden="true" /></AppLink>
      <PageTitle
        title={`Tuần ${lesson.weekNumber} · ${lessonDayLabel(lesson.dayNumber)} · ${lesson.weekTopic}`}
        detail={grammarAvailable ? <span className="badge lesson-structure-chip"><span>Cấu trúc</span><span data-lesson-structure>{lesson.title}</span></span> : undefined}
        aside={<span className={`badge${completed ? " ok" : ""}`}>{completed ? "Đã hoàn thành" : lesson.progress.status === "in_progress" ? "Đang học" : "Chưa học"}</span>}
      />
    </div>
    <section className="lesson-surface" aria-label="Bài học" style={{ display: "grid", gap: 16, minWidth: 0 }}>
      <div className="ltabs" role="tablist" aria-label="Các bước trong bài học">
        <button className={tab === "study" ? "active" : ""} role="tab" aria-selected={tab === "study"} type="button" onClick={() => selectTab("study")}>1. Học {studyComplete ? <CheckCircle2 className="status-icon" aria-label="Đã học" /> : null}</button>
        <button className={tab === "practice" ? "active" : ""} role="tab" aria-selected={tab === "practice"} type="button" disabled={!studyComplete} title={studyComplete ? undefined : "Bấm Đã học xong ở bước Học trước"} onClick={() => selectTab("practice")}>2. Bài tập {studyComplete ? `${completedPracticeCount}/${requiredPracticeCodes.length}` : <><LockKeyhole className="status-icon" aria-hidden="true" /><span className="sr-only">Chưa mở</span></>}</button>
      </div>
      <ErrorText message={error} />
      <ol className="stack lesson-parts" aria-label="Nội dung bài học" style={{ gap: 16, listStyle: "none", margin: 0, padding: 0 }}>{visible.map((part, index) => {
        const partEvidence = evidence[part.code];
        const done = partIsDone(partEvidence, localProgress.completedPartCodes.includes(part.code));
        const translations = lessonTranslations(part.content);
        const displayPart = part.code === "instruction"
          ? { ...part, content: { ...part.content, steps: lessonInstructionSteps(lesson.content.parts, tab) } }
          : part;
        return <li className={`card lesson-part lesson-part--${part.code}`} data-part={part.code} data-testid="app-lesson-part" key={part.code} style={{ boxSizing: "border-box", minWidth: 0, display: "grid", gap: 12, padding: 18 }}>
          <PartContent cefr={lesson.cefr} grammarAvailable={grammarAvailable} sectionNumber={visible.slice(0, index).filter((candidate) => practiceCodes.includes(candidate.code)).length + 1} part={displayPart} speak={actions.speak} openVocabularyModal={setVocabularyModal} resolveVocabularyImage={actions.resolveLessonVocabularyImage} onPronunciationListened={markPronunciationListened} />
          {practiceCodes.includes(part.code) ? <div className="stack lesson-answer" aria-busy={busyAction === part.code || undefined} style={{ gap: 12, minWidth: 0 }}>
            {partHasVisibleOutcome(partEvidence) ? <Notice tone={partEvidence?.status === "appealed" || partEvidence?.status === "submitted" ? "info" : "warn"}>{partOutcomeLabel(partEvidence?.status)}</Notice> : null}
            {part.code === "speaking" && !speakingUnlocked ? <Notice tone="info">Nghe đủ 3 từ mẫu phát âm ở bước Học để mở phần kiểm tra Nói.</Notice> : part.code === "speaking" ? <section className="stack lesson-speaking-answer" aria-label="Bài làm của bạn"><strong>Bài làm của bạn</strong><SpeakingEvidenceControls artifactKey={mediaArtifacts[part.code]} onUploaded={(artifactKey) => setMediaArtifacts((current) => ({ ...current, [part.code]: artifactKey }))} uploadAudio={actions.uploadAssessmentAudio} getAudioReadUrl={actions.getAssessmentAudioReadUrl} />{partEvidence?.answer?.trim() ? <section className="stack lesson-speaking-transcript" aria-label="Bản chép tự động phần Nói"><strong>Bản chép tự động</strong><output>{partEvidence.answer.trim()}</output></section> : null}</section> : <LessonAnswerControl part={part} value={answers[part.code] ?? ""} evidence={partEvidence} disabled={done || Boolean(busyAction)} onChange={(value) => setAnswers((current) => ({ ...current, [part.code]: value }))} />}
            {isSelfWritingPart(part) ? <small>Tự viết tối thiểu 2 từ.</small> : null}
            {part.code !== "speaking" || speakingUnlocked ? <button className="btn-primary" type="button" aria-busy={busyAction === part.code || undefined} disabled={done || Boolean(busyAction) || !hasLessonAnswer(part, answers[part.code], mediaArtifacts[part.code])} style={{ alignSelf: "flex-start", minHeight: 44 }} onClick={() => void save(part)}>{busyAction === part.code ? "Đang lưu…" : done ? "Đã xong" : part.code === "speaking" ? "Kiểm tra nói" : "Nộp bài"}</button> : null}
            {partEvidence?.status === "wrong_exhausted" || partEvidence?.status === "wrong_retry" ? <div className="row" style={{ flexWrap: "wrap", gap: 8 }}><button className="btn-sm btn-ghost" type="button" disabled={Boolean(busyAction) || partEvidence.translationViewed} onClick={() => void save(part, { answer: answers[part.code] ?? "", translated: true })}>{partEvidence.translationViewed ? "Đã xem bản dịch" : "Xem bản dịch"}</button>{partEvidence.status === "wrong_exhausted" && actions.appealLessonPart ? <button className="btn-sm btn-ghost" type="button" aria-busy={busyAction === `appeal:${part.code}` || undefined} disabled={Boolean(busyAction)} onClick={() => setAppealPart(part.code)}>{busyAction === `appeal:${part.code}` ? "Đang gửi…" : "Gửi kháng nghị"}</button> : null}</div> : null}
            {appealPart === part.code ? <section className="stack lesson-appeal-form" aria-label={`Kháng nghị phần ${part.title}`}>
              <label>Lý do kháng nghị phần {part.title}<textarea aria-label={`Lý do kháng nghị phần ${part.title}`} value={appealReasons[part.code] ?? ""} onChange={(event) => setAppealReasons((current) => ({ ...current, [part.code]: event.target.value }))} /></label>
              <small>Nhập ít nhất 5 ký tự để người duyệt hiểu điều cần xem lại.</small>
              <div className="row"><button className="btn-sm btn-primary" type="button" disabled={Boolean(busyAction) || (appealReasons[part.code]?.trim().length ?? 0) < 5} onClick={() => void appeal(part.code, appealReasons[part.code] ?? "")}>Xác nhận gửi kháng nghị</button><button className="btn-sm btn-ghost" type="button" disabled={Boolean(busyAction)} onClick={() => setAppealPart(null)}>Huỷ</button></div>
            </section> : null}
            {partEvidence?.feedback ? <Notice tone={partEvidence.status === "correct" ? "ok" : partEvidence.status === "appealed" || partEvidence.status === "submitted" ? "info" : "warn"}>{partEvidence.feedback}</Notice> : null}
            {partEvidence?.status === "wrong_retry" && safeLessonHint(part.content) ? <Notice tone="info">Gợi ý: {safeLessonHint(part.content)}</Notice> : null}
            {partEvidence?.status === "wrong_exhausted" && lessonCorrectAnswer(part.content) ? <Notice tone="info">Đáp án: {lessonCorrectAnswer(part.content)}</Notice> : null}
            {translations && (partEvidence?.status === "correct" || partEvidence?.status === "translated" || partEvidence?.translationViewed) ? <section className="card flat stack" aria-label={`Bản dịch phần ${part.title}`}><strong>Bản dịch tiếng Việt</strong><span>Câu hỏi: {translations.question}</span><span>Đáp án: {translations.answer}</span></section> : null}
          </div> : null}
        </li>;
      })}</ol>
      {tab === "study" ? <section className="card lesson-study-cta"><div><strong>{studyComplete ? "Bạn đã học xong phần này" : "Học xong 3 mục trên chưa?"}</strong><p className="small">Bước 2 có {requiredPracticeCodes.length} phần bài tập: {requiredPracticeCodes.map(partLabel).join(" → ")}.</p></div><button className="btn-primary btn-lg" type="button" disabled={Boolean(busyAction)} onClick={() => studyComplete ? selectTab("practice") : void finishStudy()}>{busyAction === "study" ? "Đang lưu…" : studyComplete ? "Sang bài tập →" : <><CheckCircle2 size={18} aria-hidden="true" /> Đã học xong → Làm bài tập</>}</button></section> : null}
    </section>
    <section className="card lesson-completion" aria-label="Hoàn thành bài học"><div><strong>{completed ? "Bạn đã học bài này rồi, ôn lại thoải mái!" : allPracticeComplete ? "Đủ các phần rồi! Bấm Hoàn thành để mở bài tiếp theo." : `Đã xong ${completedPracticeCount}/${requiredPracticeCodes.length} phần. Làm nốt rồi bấm Hoàn thành nhé.`}</strong></div><div className="row"><button className="btn-primary btn-lg" type="button" disabled={Boolean(busyAction) || (!completed && !allPracticeComplete)} title={!completed && !allPracticeComplete ? `Làm xong ${requiredPracticeCodes.length} phần bài tập trước` : undefined} onClick={() => void completeLesson()}>{busyAction === "complete" ? "Đang lưu…" : completed ? "Lưu lần ôn này" : "Hoàn thành bài"}</button><AppLink className="btn btn-ghost" href="/coach" navigate={actions.navigate}>Luyện với Season</AppLink></div></section>
    {vocabularyModal ? <VocabularyModal state={vocabularyModal} speak={actions.speak} close={() => setVocabularyModal(null)} /> : null}
  </div>;
}

function lessonStudyIsComplete(lesson: LessonView["lesson"]): boolean {
  if (lesson.progress.status === "completed") return true;
  const studyPartCodes = lesson.content.parts.map((part) => part.code).filter((code) => studyCodes.includes(code));
  const hasTerminalPractice = lesson.content.parts.some((part) => practiceCodes.includes(part.code) && partIsDone(
    lesson.progress.evidence[part.code], lesson.progress.completedPartCodes.includes(part.code)
  ));
  return hasTerminalPractice || (studyPartCodes.length > 0 && studyPartCodes.every((code) => lesson.progress.completedPartCodes.includes(code)));
}

function isLearnerVisiblePart(part: LessonPart): boolean {
  const content = part.content as Record<string, unknown>;
  return !(part.code === "grammar" && content.hidden === true && content.status === "unavailable");
}

function partLabel(code: LessonPartCode): string {
  const labels: Partial<Record<LessonPartCode, string>> = {
    listening: "Nghe", reading: "Đọc", writing: "Viết", word_class: "Từ loại", word_use: "Dùng từ", speaking: "Nói"
  };
  return labels[code] ?? code;
}

function LessonAnswerControl({ part, value, disabled, hideLabel = false, evidence, onChange }: {
  part: LessonPart;
  value: string;
  disabled: boolean;
  hideLabel?: boolean;
  evidence?: PartEvidence | undefined;
  onChange: (value: string) => void;
}) {
  const content = part.content as { type?: unknown; options?: unknown };
  const options = Array.isArray(content.options)
    ? content.options.filter((option): option is string => typeof option === "string" && Boolean(option.trim()))
    : [];
  if (content.type !== "fill" && options.length) {
    return <fieldset className="stack" aria-label={`Câu trả lời ${part.code}`} disabled={disabled}>
      <legend>Bài làm của bạn <span className="badge">trắc nghiệm</span></legend>
      {options.map((option, index) => <label className={`opt${value === option ? " sel" : ""}`} key={option} style={evidence?.answer === option && ["wrong_retry", "wrong_exhausted"].includes(evidence.status ?? "") ? { textDecoration: "line-through", opacity: .65 } : undefined}>
        <input type="radio" name={`lesson-${part.code}`} value={option} checked={value === option} onChange={() => onChange(option)} />
        <span><b>{String.fromCharCode(65 + index)}.</b> {option}</span>
      </label>)}
    </fieldset>;
  }
  const textarea = <textarea aria-label={`Câu trả lời ${part.code}`} value={value} disabled={disabled} onChange={(event) => onChange(event.target.value)} />;
  return hideLabel ? textarea : <label>Bài làm của bạn{textarea}</label>;
}

function lessonCorrectAnswer(content: Record<string, unknown>): string | null {
  const answer = content.answer;
  return Array.isArray(answer) ? String(answer[0] ?? "") || null : typeof answer === "string" && answer.trim() ? answer : null;
}

function safeLessonHint(content: Record<string, unknown>): string | null {
  if (typeof content.hint !== "string" || !content.hint.trim()) return null;
  const answer = lessonCorrectAnswer(content);
  return answer && normalizeComparison(content.hint).includes(normalizeComparison(answer)) ? null : content.hint.trim();
}

function lessonTranslations(content: Record<string, unknown>): { question: string; answer: string } | null {
  const question = typeof content.questionTranslation === "string" ? content.questionTranslation.trim() : "";
  const answer = typeof content.answerTranslation === "string" ? content.answerTranslation.trim() : "";
  return question && answer ? { question, answer } : null;
}

function normalizeComparison(value: string): string {
  return value.normalize("NFKC").toLocaleLowerCase("en").replace(/[\p{P}\p{S}\s]+/gu, " ").trim();
}

function partIsDone(evidence: PartEvidence | undefined, completed: boolean): boolean {
  if (evidence?.status) return ["correct", "submitted", "wrong_exhausted", "appealed"].includes(evidence.status);
  return completed;
}

/** Mirrors the progress record used by the completion API: an outcome counts only when it was recorded as complete. */
function partCountsTowardCompletion(progress: LessonView["lesson"]["progress"], code: LessonPartCode): boolean {
  return progress.completedPartCodes.includes(code) && Boolean(progress.evidence[code]);
}

function partHasVisibleOutcome(evidence: PartEvidence | undefined): boolean {
  return Boolean(evidence?.status && ["wrong_retry", "wrong_exhausted", "appealed", "submitted"].includes(evidence.status));
}

function hasLessonAnswer(part: LessonPart, answer: string | undefined, artifactKey: string | undefined): boolean {
  if (part.code === "speaking") return Boolean(artifactKey);
  if (isSelfWritingPart(part)) return (answer?.trim().split(/\s+/u).filter(Boolean).length ?? 0) >= 2;
  return Boolean(answer?.trim());
}

function isSelfWritingPart(part: LessonPart): boolean {
  return part.code === "writing" && (part.content.type === undefined || part.content.type === "write");
}

function partOutcomeLabel(status: PartEvidence["status"]): string {
  switch (status) {
    case "wrong_retry": return "Chưa đúng · còn lượt thử";
    case "submitted": return "Đã gửi để kiểm tra";
    case "wrong_exhausted": return "Đã hết lượt thử";
    case "translated": return "Đã xem bản dịch";
    case "appealed": return "Đã gửi kháng nghị";
    case "correct": return "Đúng";
    default: return "Chưa trả lời";
  }
}

function lessonDayLabel(dayNumber: number): string {
  return (["T2", "T3", "T4", "T5", "T6", "T7", "CN"] as const)[dayNumber - 1] ?? `Bài ${dayNumber}`;
}

function formatLessonDate(value: string): string {
  const parsed = new Date(`${value.slice(0, 10)}T00:00:00Z`);
  if (!Number.isFinite(parsed.getTime())) return value.slice(0, 10);
  const weekday = new Intl.DateTimeFormat("vi-VN", { weekday: "long", timeZone: "UTC" }).format(parsed);
  const date = new Intl.DateTimeFormat("vi-VN", { day: "2-digit", month: "2-digit", year: "numeric", timeZone: "UTC" }).format(parsed);
  return `${weekday} ${date}`;
}

type LessonAudioSource = { text?: string; src?: string };

function LessonAudioControl({ source, speak, label = "Listening" }: { source: LessonAudioSource; speak: LearnerCallbacks["speak"]; label?: string }) {
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  if (!source.src && !source.text) return <Notice tone="warn">Chưa có nội dung âm thanh cho phần Nghe.</Notice>;
  if (source.src) return <div className="stack" aria-label={label}>
    <audio key={`${source.src}-${attempt}`} controls preload="metadata" src={source.src} aria-label={`Nghe audio phần ${label.replace(/^Nghe phần\s+/u, "")}`} style={{ maxWidth: "100%", width: "100%" }} onError={() => setFailed(true)} />
    {failed ? <><Notice tone="warn">Không phát được file âm thanh. Bạn có thể thử lại.</Notice><button className="btn-sm btn-ghost" type="button" style={{ alignItems: "center", display: "inline-flex", gap: 6, minHeight: 44 }} onClick={() => { setFailed(false); setAttempt((value) => value + 1); }}><RotateCcw size={16} aria-hidden="true" /> Thử lại audio</button></> : null}
  </div>;
  return <button className="btn-sm btn-ghost vocabulary-card-sound lesson-audio-primary lesson-listening-audio-button" type="button" aria-label={`Nghe nội dung phần ${label}`} onClick={() => speak(source.text!, "en-US", { rate: 0.85 })}><Volume2 size={16} aria-hidden="true" /> Nghe nội dung</button>;
}

function SpeakingEvidenceControls({
  artifactKey,
  onUploaded,
  uploadAudio,
  getAudioReadUrl
}: {
  artifactKey?: string | undefined;
  onUploaded: (artifactKey: string) => void;
  uploadAudio: (file: Blob, filename: string) => Promise<string>;
  getAudioReadUrl?: ((artifactKey: string) => Promise<{ url: string; expiresAt: string }>) | undefined;
}) {
  const [recording, setRecording] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [pendingFile, setPendingFile] = useState<File>();
  const [audioUrl, setAudioUrl] = useState("");
  const [readBusy, setReadBusy] = useState(false);
  const [readError, setReadError] = useState("");
  const recorder = useRef<MediaRecorder | null>(null);
  const stream = useRef<MediaStream | null>(null);
  const chunks = useRef<Blob[]>([]);
  const canRecord = typeof navigator !== "undefined" && Boolean(navigator.mediaDevices?.getUserMedia) && typeof MediaRecorder !== "undefined";

  useEffect(() => () => {
    recorder.current?.stop();
    stream.current?.getTracks().forEach((track) => track.stop());
    if (audioUrl) URL.revokeObjectURL(audioUrl);
  }, [audioUrl]);

  const loadPersistedAudio = async () => {
    if (!artifactKey || !getAudioReadUrl) return;
    setReadBusy(true);
    setReadError("");
    try {
      const signed = await getAudioReadUrl(artifactKey);
      setAudioUrl(signed.url);
    } catch {
      setReadError("Không tải được bản ghi âm đã lưu. Bạn có thể thử lại.");
    } finally {
      setReadBusy(false);
    }
  };

  useEffect(() => {
    if (!artifactKey || audioUrl || !getAudioReadUrl) return;
    void loadPersistedAudio();
  }, [artifactKey, audioUrl, getAudioReadUrl]);

  const send = async (file: File) => {
    if (!file.type.startsWith("audio/") && !/\.(mp3|m4a|wav|ogg|oga|webm|aac|flac|amr|3gp)$/i.test(file.name)) {
      setPendingFile(file);
      setError("Hãy chọn file âm thanh (mp3, m4a, wav, webm…).");
      return;
    }
    if (file.size > 20 * 1024 * 1024) {
      setPendingFile(file);
      setError("File quá lớn (tối đa 20 MB). Bạn có thể chọn file khác rồi thử lại.");
      return;
    }
    setPendingFile(file);
    setBusy(true);
    setError("");
    try {
      const savedKey = await uploadAudio(file, file.name);
      setPendingFile(undefined);
      setAudioUrl((current) => {
        if (current) URL.revokeObjectURL(current);
        return URL.createObjectURL(file);
      });
      onUploaded(savedKey);
    } catch {
      setError("Không tải được file ghi âm. Bạn có thể thử lại.");
    } finally {
      setBusy(false);
    }
  };

  const startRecording = async () => {
    if (!canRecord) {
      setError("Trình duyệt này không ghi âm được: bạn sẽ nộp phần Nói bằng cách tải file lên.");
      return;
    }
    setError("");
    try {
      const acquired = await navigator.mediaDevices.getUserMedia({ audio: true });
      const next = new MediaRecorder(acquired);
      stream.current = acquired;
      recorder.current = next;
      chunks.current = [];
      next.ondataavailable = (event) => { if (event.data.size) chunks.current.push(event.data); };
      next.onerror = () => {
        acquired.getTracks().forEach((track) => track.stop());
        recorder.current = null;
        stream.current = null;
        setRecording(false);
        setError("Ghi âm bị gián đoạn. Bạn có thể thử lại hoặc tải file lên.");
      };
      next.onstop = () => {
        acquired.getTracks().forEach((track) => track.stop());
        recorder.current = null;
        stream.current = null;
        setRecording(false);
        const mimeType = (next.mimeType || "audio/webm").split(";")[0] || "audio/webm";
        const extension = /mp4|aac/.test(mimeType) ? "m4a" : /ogg/.test(mimeType) ? "ogg" : "webm";
        void send(new File(chunks.current, `ghi-am-${Date.now()}.${extension}`, { type: mimeType }));
      };
      next.start();
      setRecording(true);
    } catch {
      setError("Không dùng được micro – hãy tải file ghi âm lên.");
    }
  };

  const stopRecording = () => {
    if (!recorder.current) return;
    recorder.current.stop();
    setRecording(false);
  };

  return <section className="stack" aria-label="Bằng chứng nói">
    {!canRecord ? <Notice tone="warn">Trình duyệt này không ghi âm được: bạn sẽ nộp phần Nói bằng cách tải file lên.</Notice> : null}
    <div className="row" style={{ flexWrap: "wrap", gap: 8 }}>
      <button className="btn-sm btn-ghost" type="button" aria-busy={busy || undefined} disabled={!canRecord || busy} style={{ alignItems: "center", display: "inline-flex", gap: 6, minHeight: 44 }} onClick={() => recording ? stopRecording() : void startRecording()}>{recording ? <><Square size={15} aria-hidden="true" /> Dừng ghi</> : <><Mic size={16} aria-hidden="true" /> Ghi âm</>}</button>
      <label className="btn" htmlFor="lesson-speaking-audio" style={{ alignItems: "center", display: "inline-flex", gap: 6, minHeight: 44 }}><Upload size={16} aria-hidden="true" /> {busy ? "Đang tải…" : "Tải file ghi âm"}</label>
      <input id="lesson-speaking-audio" className="sr-only" type="file" accept="audio/*" aria-label="Tải file ghi âm speaking" disabled={busy} onChange={(event) => {
        const file = event.currentTarget.files?.[0];
        event.currentTarget.value = "";
        if (file) void send(file);
      }} />
    </div>
    {busy ? <Notice>Đang tải file ghi âm…</Notice> : null}
    {readBusy ? <Notice>Đang tải bản ghi âm đã lưu…</Notice> : null}
    {readError ? <div className="stack"><Notice tone="warn">{readError}</Notice><button className="btn-sm btn-ghost" type="button" style={{ alignItems: "center", display: "inline-flex", gap: 6, minHeight: 44 }} onClick={() => void loadPersistedAudio()}><RotateCcw size={16} aria-hidden="true" /> Thử lại nghe bản ghi</button></div> : null}
    {error ? <div className="stack"><Notice tone="warn">{error}</Notice>{pendingFile ? <button className="btn-sm btn-ghost" type="button" style={{ alignItems: "center", display: "inline-flex", gap: 6, minHeight: 44 }} onClick={() => void send(pendingFile)}><RotateCcw size={16} aria-hidden="true" /> Thử lại tải file</button> : null}</div> : null}
    {audioUrl ? <><Notice tone="ok">Đã tải file ghi âm lên. Bấm Kiểm tra Nói để nộp.</Notice><audio controls preload="metadata" src={audioUrl} aria-label="Nghe lại file ghi âm" style={{ maxWidth: "100%", width: "100%" }} /></> : artifactKey ? <Notice tone="ok">Đã tải file ghi âm lên. Bấm Kiểm tra Nói để nộp.</Notice> : null}
  </section>;
}

function PartContent({
  cefr,
  grammarAvailable,
  sectionNumber,
  part,
  speak,
  openVocabularyModal,
  resolveVocabularyImage,
  onPronunciationListened
}: {
  cefr: LessonView["lesson"]["cefr"];
  grammarAvailable: boolean;
  sectionNumber: number;
  part: LessonPart;
  speak: LearnerCallbacks["speak"];
  openVocabularyModal: (state: VocabularyModalState) => void;
  resolveVocabularyImage?: LearnerCallbacks["resolveLessonVocabularyImage"];
  onPronunciationListened?: (word: string) => void;
}) {
  const content = part.content as {
    text?: string;
    script?: string;
    audio?: unknown;
    audioUrl?: string;
    phonemeAudioUrl?: string;
    type?: string;
    prompt?: string;
    formula?: string;
    usage?: string;
    examples?: string[];
    exampleAudioUrls?: string[];
    focus?: string;
    instruction?: string;
    answer?: string;
    modelAnswer?: string;
    sample?: string;
    steps?: unknown;
     words?: unknown[];
    wordAudioUrls?: string[];
    items?: Array<LessonVocabularyItem | { type: "content" | "language"; text: string; condition: string; criterion: string; assessmentCode: string }>;
  };
  const words = part.code === "vocabulary" ? (content.items ?? []) as LessonVocabularyItem[] : [];
  const objectiveItems = part.code === "objective"
    ? (content.items ?? []).flatMap((item) => "text" in item && typeof item.text === "string" && (grammarAvailable || !("type" in item) || item.type !== "language") ? [item.text] : [])
    : [];
  const steps = Array.isArray(content.steps)
    ? content.steps.filter((step): step is string => typeof step === "string" && Boolean(step.trim()))
    : [];
  const guidanceSteps = part.code === "instruction" ? completeInstructionSteps(steps) : steps;
  const audioSource = part.code === "listening" ? lessonAudioSource(content) : undefined;
  const learnerPrompt = content.prompt ? learnerExercisePrompt(content.prompt, content.type) : "";
  const pronunciationWords = readPronunciationWords(content.words);
  const pronunciationWordAudioUrls = Array.isArray(content.wordAudioUrls) ? content.wordAudioUrls : [];
  const targetSound = pronunciationTarget(content.focus ?? "");
  const grammarExamples = content.examples?.slice(0, 3) ?? [];
  const speakingModel = conciseSpeakingModel(content.sample ?? content.answer ?? content.modelAnswer);
  return <>
    {part.code === "grammar" || part.code === "pronunciation" ? null : <div className="row between"><h2 className={part.code === "vocabulary" ? "lesson-vocabulary-heading" : undefined}>{part.code === "objective" ? "MỤC TIÊU BÀI HỌC" : part.code === "instruction" ? "HƯỚNG DẪN LÀM BÀI" : part.code === "vocabulary" ? "TỪ VỰNG" : `${sectionNumber}. ${partHeading(part)}`}</h2></div>}
    {part.code === "objective" && objectiveItems.length ? <><p className="lesson-objective-lead">{learnerObjectiveLead(cefr)}</p><ul className="lesson-objective-list" aria-label="Mục tiêu bài học">{objectiveItems.map((text, index) => <li key={`${index}-${text}`}>{learnerFacingObjectiveBody(text)}</li>)}</ul></> : content.text ? <p className={part.code === "objective" ? "lesson-objective-text" : part.code === "reading" ? "lesson-reading-passage" : undefined}>{part.code === "objective" ? learnerFacingObjective(conciseLessonObjective(content.text), cefr) : content.text}</p> : null}
    {learnerPrompt && part.code !== "speaking" ? <p>{normalizeLessonBlankPrompt(learnerPrompt)}</p> : null}
    {guidanceSteps.length ? <ul className="lesson-instruction-list" aria-label="Hướng dẫn thực hiện">{guidanceSteps.map((step, index) => <li key={`${index}-${step}`}>{step}</li>)}</ul> : null}
    {audioSource ? <LessonAudioControl source={audioSource} speak={speak} /> : null}
    {part.code === "grammar" && content.formula ? <div className="lesson-study-block"><div className="lesson-study-panel-header"><h2>NGỮ PHÁP</h2></div><div className="lesson-grammar-copy"><div className="lesson-grammar-formula-row"><p className="lesson-study-focus"><strong>{content.formula}</strong></p><LessonAudioAssetButton audioSrc={content.audioUrl} label="Nghe mẫu ngữ pháp" title="Nghe cấu trúc ngữ pháp" className="lesson-grammar-audio-icon" /></div>{content.usage ? <p className="lesson-study-explanation">{grammarUsageCopy(content.usage)}</p> : null}</div>{grammarExamples.length ? <div className="lesson-example-list" aria-label="Câu ví dụ ngữ pháp">{grammarExamples.map((example, index) => { const spoken = sanitizeGrammarSpeechText(conciseGrammarExample(example)); return <button className="btn-sm btn-ghost lesson-example-card vocabulary-card-sound" type="button" aria-label={`Nghe câu ví dụ: ${spoken}`} onClick={() => playLessonText(spoken, content.exampleAudioUrls?.[index], speak)} key={example}><Volume2 size={14} aria-hidden="true" />{conciseGrammarExample(example)}</button>; })}</div> : null}</div> : null}
    {part.code === "pronunciation" && content.focus ? <div className="lesson-study-block lesson-pronunciation-summary"><div className="lesson-study-panel-header"><h2>PHÁT ÂM</h2></div><div className="lesson-grammar-formula-row"><p className="lesson-study-focus"><strong>Âm {targetSound}{pronunciationWords[0]?.word ? ` như trong “${pronunciationWords[0].word}”` : ""}</strong></p><LessonAudioAssetButton audioSrc={content.phonemeAudioUrl} label={`Nghe âm ${targetSound}`} title={`Nghe âm ${targetSound}`} className="lesson-pronunciation-audio-icon" /></div>{content.instruction ? <p className="lesson-study-explanation">{content.instruction}</p> : null}</div> : null}
    {part.code === "speaking" && speakingModel ? <><p className="lesson-speaking-instruction"><strong>Yêu cầu:</strong> {conciseSpeakingInstruction(content.instruction ?? content.prompt)}</p><div className={`card flat lesson-speaking-model${speakingModel.length <= 80 ? " lesson-speaking-model--inline" : ""}`}><strong>{speakingModel}</strong>{content.audioUrl ? <audio controls preload="metadata" src={content.audioUrl} aria-label="Nghe audio mẫu phần Nói" /> : null}</div></> : null}
     {part.code === "pronunciation" && pronunciationWords.length ? <div className="lesson-pronunciation-words" aria-label="Luyện từ phát âm">{pronunciationWords.slice(0, 3).map((item, index) => <button className="btn-sm btn-ghost lesson-example-card vocabulary-card-sound lesson-pronunciation-word-chip" type="button" aria-label={`Nghe từ phát âm: ${item.word}`} onClick={() => playLessonText(item.word, pronunciationWordAudioUrls[index], speak, () => onPronunciationListened?.(item.word), 0.65)} key={item.word}><Volume2 size={14} aria-hidden="true" /><strong>{item.word}</strong>{item.ipa ? ` ${item.ipa}` : ""}</button>)}</div> : null}
    {part.code === "vocabulary" ? words.map((item, itemIndex) => <VocabularyCard key={item.word} cefr={cefr} item={item} itemIndex={itemIndex} speak={speak} openModal={openVocabularyModal} resolveImage={resolveVocabularyImage} />) : null}
    {part.code !== "vocabulary" && part.code !== "objective" ? (content.items as LessonVocabularyItem[] | undefined)?.map((item) => <article className="word-card" key={item.word}><h3>{item.word}</h3><span className="ipa">{item.pronunciation}</span><p>{item.meaning}</p>{item.examples?.map((example) => <small key={example}>{example}</small>)}</article>) : null}
    {content.examples?.length && part.code !== "grammar" ? <ul>{content.examples.map((example) => <li key={example}>{example}</li>)}</ul> : null}
  </>;
}

function playLessonText(text: string, audioUrl: string | undefined, speak: LearnerCallbacks["speak"], onEnded?: () => void, rate = 1) {
  const src = audioUrl?.trim();
  if (src && typeof Audio !== "undefined") {
    const audio = new Audio(src);
    if (onEnded) audio.addEventListener("ended", onEnded, { once: true });
    void audio.play().catch(() => speak(text, "en-US", { rate, ...(onEnded ? { onStatus: (status) => { if (status === "ended") onEnded(); } } : {}) }));
    return;
  }
  speak(text, "en-US", { rate, ...(onEnded ? { onStatus: (status) => { if (status === "ended") onEnded(); } } : {}) });
}

function LessonAudioAssetButton({ audioSrc, label, title, className }: { audioSrc?: string | undefined; label: string; title: string; className: string }) {
  const [failed, setFailed] = useState(false);
  const src = audioSrc?.trim() ?? "";
  const available = Boolean(src) && !failed && typeof Audio !== "undefined";
  if (!available) return <span className="lesson-audio-missing muted" role="status">Chưa có audio {label.replace(/^Nghe\s+/u, "").toLocaleLowerCase()}.</span>;
  const play = () => {
    const audio = new Audio(src);
    audio.addEventListener("error", () => setFailed(true), { once: true });
    void audio.play().catch(() => setFailed(true));
  };
  return <button className={`btn-sm btn-ghost vocabulary-card-sound vocabulary-card-sound--icon ${className}`} type="button" aria-label={label} title={title} onClick={play}><Volume2 size={16} aria-hidden="true" /></button>;
}

function readPronunciationWords(value: unknown): Array<{ word: string; ipa?: string }> {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    if (typeof item === "string" && item.trim()) return [{ word: item.trim() }];
    if (item && typeof item === "object" && !Array.isArray(item)) {
      const record = item as Record<string, unknown>;
      if (typeof record.word === "string" && record.word.trim()) return [{ word: record.word.trim(), ...(typeof record.ipa === "string" && record.ipa.trim() ? { ipa: record.ipa.trim() } : {}) }];
    }
    return [];
  });
}

function grammarUsageCopy(value: string): string {
  const cleaned = value.trim().replace(/^Dùng\s+(?:khi|để)\s+/i, "");
  const firstSentence = cleaned.split(/(?<=[.!?])\s+|;\s*/u)[0]?.trim() || cleaned;
  const explanation = firstSentence.replace(/[.!?]+$/u, "");
  return explanation ? `Dùng để ${explanation.charAt(0).toLocaleLowerCase()}${explanation.slice(1)}.` : value.trim();
}

function pronunciationTarget(value: string): string {
  return value.match(/\/[^/]+\//)?.[0] ?? value.trim();
}

function partHeading(part: LessonPart): string {
  const english: Partial<Record<LessonPartCode, string>> = {
    listening: "Listening", reading: "Reading", writing: "Writing", word_class: "Word class", word_use: "Word use", speaking: "Speaking"
  };
  return english[part.code] ? `${part.title} · ${english[part.code]}` : part.title;
}

function completeInstructionSteps(steps: string[]): string[] {
  return steps.slice(0, 3);
}

function learnerExercisePrompt(prompt: string, type?: string): string {
  return type === "fill" ? prompt.replace(/\s*\(\s*Use\s*:[^)]*\)\s*$/iu, "").trim() : prompt;
}

function lessonAudioSource(content: { audio?: unknown; audioUrl?: string; script?: string; text?: string }): LessonAudioSource {
  const candidate = content.audioUrl ?? content.audio;
  if (typeof candidate === "string" && candidate.trim()) {
    return isAudioUrl(candidate) ? { src: candidate } : { text: candidate };
  }
  if (candidate && typeof candidate === "object") {
    const record = candidate as Record<string, unknown>;
    const src = typeof record.url === "string" ? record.url : typeof record.src === "string" ? record.src : undefined;
    const text = typeof record.text === "string" ? record.text : typeof record.script === "string" ? record.script : undefined;
    if (src || text) return { ...(src ? { src } : {}), ...(text ? { text } : {}) };
  }
  if (typeof content.script === "string" && content.script.trim()) return { text: content.script };
  return {};
}

function isAudioUrl(value: string): boolean {
  return /^(?:https?:|blob:|data:audio\/|\/)/i.test(value) || /\.(?:mp3|m4a|wav|ogg|oga|webm|aac|flac|amr|3gp)(?:[?#].*)?$/i.test(value);
}

function VocabularyCard({
  cefr,
  item,
  itemIndex,
  speak,
  openModal,
  resolveImage
}: {
  cefr: LessonView["lesson"]["cefr"];
  item: LessonVocabularyItem;
  itemIndex: number;
  speak: (text: string) => void;
  openModal: (state: VocabularyModalState) => void;
  resolveImage?: LearnerCallbacks["resolveLessonVocabularyImage"];
}) {
  const lexicalDetails = item.lexicalDetails ?? [];
  const synonymDetail = lexicalDetails.find((detail) => detail.kind === "synonym");
  const loadImage = () => {
    if (resolveImage) return resolveImage(itemIndex);
    if (item.imageUrl?.trim() && item.imageAttribution) return Promise.resolve({ status: "available", imageUrl: item.imageUrl.trim(), alt: item.word, attribution: item.imageAttribution } as const);
    return Promise.resolve({ status: "unavailable" } as const);
  };
  const umbrellaWord = item.umbrella?.word?.trim() ?? "";
  const firstSynonym = item.synonyms?.[0]?.word?.trim() || synonymDetail?.word?.trim() || "";
  const isB1Plus = ["B1", "B2", "C1"].includes(cefr);
  const detailedRelationWords = new Set([
    ...(item.synonyms ?? []).map((value) => `synonym:${value.word.trim().toLocaleLowerCase()}`),
    ...(item.antonyms ?? []).map((value) => `antonym:${value.word.trim().toLocaleLowerCase()}`)
  ]);
  const extendedRelations: VocabularyRelationChip[] = isB1Plus
    ? lexicalDetails
      .filter((detail) => !detailedRelationWords.has(`${detail.kind}:${detail.word.trim().toLocaleLowerCase()}`))
      .map((detail) => ({
        label: `${lexicalKindLabel(detail.kind)} · ${detail.word}`,
        ariaLabel: `Xem ${lexicalKindLabel(detail.kind)}: ${detail.word}`,
        tone: detail.kind === "synonym" ? "synonym" as const : detail.kind === "antonym" ? "antonym" as const : detail.kind === "slang" ? "mid" as const : "low" as const,
        onClick: () => openModal({ kind: "lexical", item, detail })
      }))
    : [];
  const relations: VocabularyRelationChip[] = [
    ...(item.umbrella && umbrellaWord ? [{ label: `TỪ BAO TRÙM ${umbrellaWord}`, ariaLabel: `Từ bao trùm: ${umbrellaWord}`, icon: "umbrella" as const, tone: "umb" as const, count: item.umbrella.siblings?.length ?? 0, onClick: () => openModal({ kind: "umbrella", item }) }] : []),
    ...(item.synonyms?.length ? item.synonyms.map(value => {
      const detail = lexicalDetails.find((candidate) => candidate.kind === "synonym" && candidate.word.trim().toLocaleLowerCase() === value.word.trim().toLocaleLowerCase());
      return { label: `= ${value.word}${value.level ? ` · ${value.level}` : ""}`, ariaLabel: isB1Plus && detail ? `Xem từ đồng nghĩa: ${value.word}` : `Nghe từ đồng nghĩa: ${value.word}`, tone: "synonym" as const, onClick: isB1Plus && detail ? () => openModal({ kind: "lexical", item, detail }) : () => playVocabularyWord(speak, value.word, value.audioUrl) };
    }) : synonymDetail && firstSynonym ? [{ label: `= ${firstSynonym}`, ariaLabel: isB1Plus ? `Xem từ đồng nghĩa: ${firstSynonym}` : firstSynonym, tone: "synonym" as const, onClick: isB1Plus ? () => openModal({ kind: "lexical", item, detail: synonymDetail }) : undefined }] : []),
    ...(item.antonyms?.length ? item.antonyms.map(value => {
      const detail = lexicalDetails.find((candidate) => candidate.kind === "antonym" && candidate.word.trim().toLocaleLowerCase() === value.word.trim().toLocaleLowerCase());
      return { label: `≠ ${value.word}${value.level ? ` · ${value.level}` : ""}`, ariaLabel: isB1Plus && detail ? `Xem từ trái nghĩa: ${value.word}` : `Nghe từ trái nghĩa: ${value.word}`, tone: "antonym" as const, onClick: isB1Plus && detail ? () => openModal({ kind: "lexical", item, detail }) : () => playVocabularyWord(speak, value.word, value.audioUrl) };
    }) : []),
    ...(item.family?.length ? [{ label: `Word family (${item.family.length})`, ariaLabel: `Word family (${item.family.length})`, icon: "family" as const, tone: "family" as const, onClick: () => openModal({ kind: "family", item }) }] : []),
    ...extendedRelations
  ];
  return <SharedVocabularyCard item={item} loadImage={loadImage} speak={speak} relations={relations} />;
}

function VocabularyModal({
  state,
  speak,
  close
}: {
  state: VocabularyModalState;
  speak: (text: string) => void;
  close: () => void;
}) {
  const { item } = state;
  const labels = {
    family: "Họ từ",
    synonyms: "Đồng nghĩa",
    antonyms: "Trái nghĩa",
    umbrella: "Từ bao quát",
    lexical: "Từ liên quan"
  } as const;
  if (typeof document === "undefined") return null;
  return createPortal(<div className="modal-backdrop vocabulary-relation-modal" role="presentation">
    <section className="dialog wide" role="dialog" aria-modal="true" aria-label={labels[state.kind]} data-testid={`modal.vocab-${state.kind === "synonyms" ? "all-synonyms" : state.kind === "lexical" ? "lexical-detail" : state.kind}`} data-modal={`vocab-${state.kind === "synonyms" ? "all-synonyms" : state.kind === "lexical" ? "lexical-detail" : state.kind}`}>
      <div className="row between vocabulary-relation-modal-header"><div><div className="eyebrow">Từ vựng · {item.word}</div><h2>{labels[state.kind]}</h2></div><button type="button" aria-label="Đóng" onClick={close}>Đóng</button></div>
      {state.kind === "family" ? <FamilyModal item={item} speak={speak} /> : null}
       {state.kind === "synonyms" ? <SynonymsModal item={item} speak={speak} /> : null}
       {state.kind === "antonyms" ? <SynonymsModal item={item} list={item.antonyms} speak={speak} /> : null}
      {state.kind === "umbrella" ? <UmbrellaModal item={item} speak={speak} /> : null}
      {state.kind === "lexical" ? <LexicalModal item={item} speak={speak} {...(state.detail ? { detail: state.detail } : {})} /> : null}
    </section>
  </div>, document.body);
}

function FamilyModal({ item, speak }: { item: LessonVocabularyItem; speak: (text: string) => void }) {
  return <div className="stack" style={{ gap: 10 }} aria-label="Các từ cùng họ">{item.family?.map((word) => <article className="card flat" style={{ minWidth: 0 }} key={`${word.word}-${word.type ?? ""}`}><div className="row between" style={{ gap: 12, alignItems: "flex-start" }}><div style={{ minWidth: 0 }}><b>{word.word}</b>{word.type ? <span className="small muted"> · {word.type}</span> : null}<p className="small">{word.meaning}</p></div><button type="button" aria-label={`Nghe từ cùng họ: ${word.word}`} style={listenButtonStyle} onClick={() => playVocabularyWord(speak, word.word, word.audioUrl)}><Volume2 size={14} aria-hidden="true" />Nghe</button></div></article>)}</div>;
}

function SynonymsModal({ item, list, speak }: { item: LessonVocabularyItem; list?: LessonVocabularyItem["synonyms"] | undefined; speak: (text: string) => void }) {
  const words = list ?? item.synonyms;
  return <div className="stack" style={{ gap: 10 }} aria-label="Các từ liên quan">{words?.map((word) => <article className="card flat" style={{ minWidth: 0 }} key={word.word}><div className="row between" style={{ gap: 12, alignItems: "flex-start" }}><div style={{ minWidth: 0 }}><b>{word.word}</b><span className="badge">{word.level}</span><p className="small">{word.note}</p></div><button type="button" style={listenButtonStyle} onClick={() => playVocabularyWord(speak, word.word, word.audioUrl)}><Volume2 size={14} aria-hidden="true" />Nghe</button></div></article>)}</div>;
}

function UmbrellaModal({ item, speak }: { item: LessonVocabularyItem; speak: (text: string) => void }) {
  if (!item.umbrella) return null;
  const words = [{ ...item, current: true }, ...item.umbrella.siblings.map((word) => ({ ...word, current: false }))];
  return <div className="stack vocabulary-umbrella-content" style={{ gap: 12 }} aria-label="Từ bao quát"><article className="card flat vocabulary-umbrella-summary" aria-label={`Từ bao quát ${item.umbrella.word}`}><div className="row between" style={{ gap: 12, alignItems: "flex-start" }}><div style={{ minWidth: 0 }}><div className="eyebrow">Từ bao quát</div><h3>{item.umbrella.word}</h3><p>{item.umbrella.meaning}</p></div><button type="button" aria-label={`Nghe từ bao trùm: ${item.umbrella.word}`} style={listenButtonStyle} onClick={() => playVocabularyWord(speak, item.umbrella!.word, item.umbrella?.audioUrl)}><Volume2 size={14} aria-hidden="true" />Nghe</button></div></article><div><div className="small muted">Từ hiện tại và các từ cùng nhóm</div><div className="vocabulary-relation-audio-list">{words.map((word) => <button className="vocabulary-relation-audio-item" type="button" aria-label={`Nghe từ cùng nhóm: ${word.word}`} key={word.word} onClick={() => playVocabularyWord(speak, word.word, word.audioUrl)}><span><strong>{word.word}</strong>{word.current ? <small className="vocabulary-current-word">từ của bài</small> : null}{word.meaning ? <small>{word.meaning}</small> : null}</span><Volume2 size={16} aria-hidden="true" /></button>)}</div></div></div>;
}

function playVocabularyWord(speak: (text: string) => void, word: string, audioUrl?: string) {
  if (audioUrl?.trim() && typeof Audio !== "undefined") {
    const audio = new Audio(audioUrl.trim());
    void audio.play().catch(() => speak(word));
    return;
  }
  speak(word);
}

function LexicalModal({ item, detail, speak }: { item: LessonVocabularyItem; detail?: LessonVocabularyLexicalDetail; speak: (text: string) => void }) {
  const details = item.lexicalDetails ?? [];
  const [selected, setSelected] = useState<LessonVocabularyLexicalDetail | null>(detail ?? null);
  if (!details.length) return <Notice tone="info">Chưa có dữ liệu từ liên quan cho từ này.</Notice>;
  const active = selected ?? details[0]!;
  return <div className="stack" style={{ gap: 12 }}><div className="row" style={{ flexWrap: "wrap", gap: 8 }}>{details.map((candidate) => <button className={candidate === active ? "btn-primary" : ""} type="button" key={`${candidate.kind}-${candidate.word}`} onClick={() => setSelected(candidate)}>{lexicalKindLabel(candidate.kind)} · {candidate.word}</button>)}</div><article className="card flat"><div className="row between" style={{ gap: 12, alignItems: "flex-start" }}><div style={{ minWidth: 0 }}><div className="eyebrow">{lexicalKindLabel(active.kind)}</div><h3>{active.word}</h3></div></div>{active.definition ? <p><b>Định nghĩa:</b> {active.definition}</p> : null}{active.example ? <p><b>Ví dụ:</b> {active.example}</p> : null}{active.context ? <p><b>Ngữ cảnh:</b> {active.context}</p> : null}{active.note ? <p><b>Ghi chú:</b> {active.note}</p> : null}{active.source ? <p className="small muted">Nguồn: {active.source}</p> : null}</article></div>;
}

function lexicalKindLabel(kind: LessonVocabularyLexicalDetail["kind"]): string {
  return kind === "synonym" ? "Đồng nghĩa" : kind === "antonym" ? "Trái nghĩa" : kind === "slang" ? "Khẩu ngữ" : "Văn phong";
}

