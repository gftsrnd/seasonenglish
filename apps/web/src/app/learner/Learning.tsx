import { RequestEvidenceFields, requestEvidenceArgs, type RequestEvidenceDraft } from "../shared/RequestEvidence.js";
import { Fragment, useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { CheckCircle2, ChevronLeft, ChevronRight, LockKeyhole, Mic, RotateCcw, Square, Upload, Volume2 } from "lucide-react";
import { useCompactUi } from "../shared/CompactUi.js";
import type {
  LessonPart,
  LessonPartAttemptEvidenceInput,
  LessonPartCode,
  LessonVocabularyItem,
  LessonVocabularyLexicalDetail,
  PartEvidence
} from "@e4s/contracts";
import type { LearnerCallbacks, LessonView } from "./contracts.js";
import { ErrorText, Notice, PageTitle, AppLink, learnerLessonLabel, learnerLessonPhrase } from "./ui.js";
import { VocabularyCard as SharedVocabularyCard, type VocabularyRelationChip } from "../shared/lesson/VocabularyCard.js";
import { vocabularyPresentationBlocks } from "../shared/lesson/vocabulary-groups.js";
import { GrammarExampleButton } from "../shared/lesson/GrammarExampleButton.js";
import { grammarHighlightEntry, ManualGrammarHighlight, type GrammarHighlightRange } from "../shared/lesson/manual-grammar-highlight.js";
import { conciseGrammarExample, conciseLessonObjective, conciseSpeakingModel, learnerFacingObjective, learnerFacingObjectiveBody, learnerObjectiveLead, learnerObjectiveStatements } from "../shared/lesson/presentation.js";
import { lessonInstructionSteps } from "../shared/lesson/instructions.js";
import { PronunciationMouthPanel } from "./PronunciationMouthForm.js";
import { grammarExampleMarkWords, grammarExampleMatcher, grammarExamplePair, grammarExampleSegments, grammarFormulaBoxes, grammarMarkedExampleSegments, readAloudPassageSegments, grammarFormulaSegments, grammarPointName, pronunciationEndingSegments, pronunciationTargetSegments, type GrammarExampleMatcher, type HighlightSegment } from "../shared/lesson/study-highlight.js";
import "../shared/lesson/study-highlight.css";
import { monthlyExerciseTranslationsForLevel, monthlyReadablePlanObjective, monthlyPronunciationLessonRule, monthlyPronunciationRuleCopy, type MonthlyPronunciationRuleCopy } from "@e4s/domain/monthly";
import { WeeklyReview } from "./WeeklyReview.js";
import { learnerLessonCopy, learnerLessonLanguageForCefr, lessonGuidanceOrFallback, type LearnerLessonLanguage, type LearnerLessonCopy } from "../shared/lesson/language.js";
import { lessonPartsForTab, lessonPracticeCodes, sharedLessonGrammarAvailable } from "../shared/lesson/structure.js";
import { claimExclusiveAudio, playExclusiveMedia } from "../../features/experience/audio-precedence.js";
export { normalizeLessonBlankPrompt } from "./text.js";
import { normalizeLessonBlankPrompt } from "./text.js";
import { grammarExplanationParagraphs, grammarFormulaLines, withoutGrammarStepLabel } from "../shared/lesson/presentation.js";

export function LessonPromptText({ value, language = "vi" }: { value: string | undefined; language?: LearnerLessonLanguage }): ReactNode {
  const prompt = normalizeLessonBlankPrompt(value);
  return prompt.split(/(_{5,})/u).filter(Boolean).map((part, index) => /^_{5,}$/u.test(part)
    ? <span className="lesson-blank-underline" role="img" aria-label={language === "en" ? "Blank to fill in" : "Ô trống cần điền"} key={`blank-${index}`} />
    : <span key={`text-${index}`}>{part}</span>);
}

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
const practiceCodes: LessonPartCode[] = [...lessonPracticeCodes];
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

function readRecordedPronunciationWords(value: string | undefined): string[] {
  if (!value) return [];
  try {
    const parsed: unknown = JSON.parse(value);
    return Array.isArray(parsed) ? parsed.filter((word): word is string => typeof word === "string" && word.trim().length > 0) : [];
  } catch {
    return [];
  }
}

export type VocabularyModalState =
  | { kind: "family"; item: LessonVocabularyItem }
  | { kind: "synonyms"; item: LessonVocabularyItem }
  | { kind: "antonyms"; item: LessonVocabularyItem }
  | { kind: "umbrella"; item: LessonVocabularyItem }
  | { kind: "lexical"; item: LessonVocabularyItem; detail?: LessonVocabularyLexicalDetail }
  /** Slang / poetic synonyms (12/11): one card per word, the clicked one first. */
  | { kind: "register"; item: LessonVocabularyItem; detail?: LessonVocabularyLexicalDetail };

export function LearnerLesson({ view, actions }: { view: LessonView; actions: LearnerCallbacks }) {
  const lesson = view.lesson;
  const language = learnerLessonLanguageForCefr(lesson.cefr);
  const copy = learnerLessonCopy[language];
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
  const [pronunciationListened, setPronunciationListened] = useState<Set<string>>(() => new Set([...readPronunciationListened(lesson.id), ...readRecordedPronunciationWords(lesson.progress.evidence.pronunciation?.answer)]));
  const [vocabularyModal, setVocabularyModal] = useState<VocabularyModalState | null>(null);
  const [appealEvidence, setAppealEvidence] = useState<RequestEvidenceDraft>({});
  const [appealPart, setAppealPart] = useState<LessonPartCode | null>(null);
  const [appealReasons, setAppealReasons] = useState<Partial<Record<LessonPartCode, string>>>({});
  /** Translations handed over with a finished attempt (the lesson view only carries them once finished). */
  const [revealedTranslations, setRevealedTranslations] = useState<Partial<Record<LessonPartCode, { question: string; answer: string }>>>({});
  // Phones/tablets: the Study tab is a guided flow, one section per step (presentation only — completion is unchanged).
  const compactUi = useCompactUi();
  const [studyStep, setStudyStep] = useState(0);
  const lessonTopRef = useRef<HTMLDivElement>(null);
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
      // A recording graded "try again" (or unclear) is used; the learner records a new one.
      .filter(([code, evidence]) => Boolean(evidence?.artifactKey) && !(code === "speaking" && evidence?.status === "wrong_retry"))
      .map(([code, evidence]) => [code, evidence!.artifactKey!])
    ));
    setAnswers((current) => isNewLesson ? serverAnswers : { ...serverAnswers, ...current });
    if (isNewLesson) {
      setStudyStep(0);
      setTab(readLessonTab(lesson));
      setError("");
      setCompletedLocally(false);
      setPronunciationListened(new Set([...readPronunciationListened(lesson.id), ...readRecordedPronunciationWords(lesson.progress.evidence.pronunciation?.answer)]));
      setAppealPart(null);
      setAppealReasons({});
      setRevealedTranslations({});
      busyActionRef.current = null;
      setBusyAction(null);
    }
  }, [lesson.id, lesson.progress]);
  // Speaking/Writing are AI-graded in the background: refresh until the result arrives.
  const gradingPending = Object.values(localProgress.evidence).some((item) => item?.aiGrading === "pending");
  useEffect(() => {
    const refresh = actions.refreshLesson;
    if (!gradingPending || !refresh) return;
    let polls = 0;
    const timer = setInterval(() => {
      polls += 1;
      if (polls > 60) {
        clearInterval(timer);
        return;
      }
      void refresh().catch(() => undefined);
    }, 3_000);
    return () => clearInterval(timer);
  }, [gradingPending, lesson.id, actions.refreshLesson]);
  const markPronunciationListened = async (word: string) => {
    if (pronunciationListened.has(word)) return;
    try {
      if (actions.recordPronunciationListen) await actions.recordPronunciationListen(word);
      setPronunciationListened((current) => {
        const next = new Set(current).add(word);
        persistPronunciationListened(lesson.id, next);
        return next;
      });
    } catch {
      setError(language === "en" ? "The listening confirmation could not be saved. Please play the model again." : "Chưa lưu được xác nhận nghe mẫu. Hãy nghe lại.");
    }
  };
  useEffect(() => {
    const complete = lessonStudyIsComplete(lesson);
    setStudyComplete(complete);
    if (!complete) selectTab("study");
  }, [lesson.id, lesson.progress.completedPartCodes, lesson.progress.status]);
  if (view.lock) {
    const reviewGate = view.lock.reason === "review";
    const prior = view.lock.reason === "prior" || reviewGate;
    const openDate = view.lock.opensAt ? formatLessonDate(view.lock.opensAt) : null;
    // B1+ learners see no Vietnamese (16/11): the lock screen is English and the server's Vietnamese message is replaced.
    const english = language === "en";
    const englishDate = view.lock.opensAt ? formatLessonDate(view.lock.opensAt, "en") : null;
    const heading = english
      ? reviewGate ? `Finish ${englishReviewWeekLabel(view.lock.reviewWeekNumber)} to open this lesson` : prior ? "Catch up on the earlier lesson first" : englishDate ? `This lesson opens on ${englishDate}` : "This lesson is not open yet"
      : reviewGate
      ? `Hoàn thành ${reviewWeekLabel(view.lock.reviewWeekNumber)} để mở bài này`
      : prior ? "Học bù bài trước đã nhé" : openDate ? `Bài này mở vào ${openDate}` : "Bài này chưa mở";
    const blockerLabel = english
      ? reviewGate ? `Do ${englishReviewWeekLabel(view.lock.reviewWeekNumber)}` : view.lock.blocker ? `Study ${view.lock.blocker.label ? learnerLessonLabel({ dayNumber: view.lock.blocker.dayNumber, teachingLabel: view.lock.blocker.label }, true).toLocaleLowerCase("en") : `lesson ${view.lock.blocker.dayNumber}`} now` : ""
      : reviewGate ? `Làm ${reviewWeekLabel(view.lock.reviewWeekNumber)}` : view.lock.blocker ? `Học ${view.lock.blocker.label ? learnerLessonPhrase(view.lock.blocker.label) : `bài ${lessonDayLabel(view.lock.blocker.dayNumber)}`} ngay` : "";
    const lockMessage = english ? (prior ? "Lessons build on each other, so finish the earlier one first." : "Come back on the day it opens.") : view.lock.message;
    return <div className="app-learner-page"><div className="card"><div className="row" style={{ gap: 12, alignItems: "flex-start" }}><div style={{ flex: 1 }}><div className="eyebrow" style={{ display: "inline-flex", alignItems: "center", gap: 6 }}><LockKeyhole size={16} aria-hidden="true" /> {view.lesson.teachingLabel ? learnerLessonLabel(view.lesson, english) : english ? `Lesson ${view.lesson.dayNumber}/${view.lock.totalLessons}` : `Bài ${view.lesson.dayNumber}/${view.lock.totalLessons}`} · {english ? prior ? "locked" : "not open yet" : prior ? "chưa mở" : "chưa đến ngày"}</div><h3>{heading}</h3><p className="small">{lockMessage}</p><div className="row">{prior && view.lock.blocker ? <AppLink className="btn btn-primary" href={`/lesson/${view.lock.blocker.id}`} navigate={actions.navigate}>{blockerLabel}</AppLink> : <AppLink className="btn btn-primary" href="/coach" navigate={actions.navigate}>{english ? "Practise with Season" : "Luyện với Season"}</AppLink>}<AppLink className="btn" href="/home" navigate={actions.navigate}>{english ? "← Back to home" : "← Về trang chủ"}</AppLink></div></div></div></div></div>;
  }
  if (lesson.kind === "review" && actions.getWeeklyReviewSession) {
    return <WeeklyReview key={lesson.id} title={lesson.title} cefr={lesson.cefr} actions={actions} />;
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
      setError(copy.errors.missingSpeakingEvidence);
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
        if (result.translation) setRevealedTranslations((current) => ({ ...current, [part.code]: result.translation! }));
        if (result.evidence.artifactKey) setMediaArtifacts((current) => ({ ...current, [part.code]: result.evidence.artifactKey! }));
      } catch {
        setError(copy.errors.saveAnswer);
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
      setError(copy.errors.saveAnswer);
    } finally {
      stopAction();
    }
  };
  const appeal = async (partCode: LessonPartCode, reason: string) => {
    if (!actions.appealLessonPart || appealEvidence.blocked || busyActionRef.current || !startAction(`appeal:${partCode}`)) return;
    setError("");
    try {
      const evidenceArgs = requestEvidenceArgs(appealEvidence);
      const result = lesson.exerciseVersionId
        ? await actions.appealLessonPart(partCode, reason.trim(), evidenceArgs[0], lesson.exerciseVersionId)
        : await actions.appealLessonPart(partCode, reason.trim(), ...evidenceArgs);
      setLocalProgress(result.progress);
      setAppealPart(null);
    } catch {
      setError(copy.errors.appeal);
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
      setError(copy.errors.study);
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
      setError(copy.errors.completeLesson);
    } finally {
      stopAction();
    }
  };
  const visible = lessonPartsForTab(lesson.content.parts, tab);
  const studySteps = compactUi && tab === "study" ? lessonStudySteps(visible.map((part) => part.code)) : [];
  const stepIndex = Math.min(studyStep, Math.max(0, studySteps.length - 1));
  const stepParts = studySteps.length > 1 ? new Set(studySteps[stepIndex]) : null;
  const lastStudyStep = !stepParts || stepIndex === studySteps.length - 1;
  const goToStep = (next: number) => {
    setStudyStep(next);
    window.requestAnimationFrame(() => lessonTopRef.current?.scrollIntoView?.({ block: "start" }));
  };
  const stepLabel = (codes: readonly LessonPartCode[]) => codes.length > 1 && codes.includes("objective")
    ? (language === "en" ? "Objective & instructions" : "Mục tiêu & hướng dẫn")
    : partLabel(codes[0]!, language);
  const evidence = localProgress.evidence;
  const pronunciationReviewTargets = readPronunciationTargets(lesson.content.parts.find((part) => part.code === "pronunciation")?.content);
  const requiredPronunciationWords = pronunciationReviewTargets.length > 0
    ? pronunciationReviewTargets.flatMap((target) => target.words).map((item) => item.word)
    : readPronunciationWords(lesson.content.parts.find((part) => part.code === "pronunciation")?.content.words).slice(0, 3).map((item) => item.word);
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
  const grammarAvailable = sharedLessonGrammarAvailable(lesson.content.parts);
  return <div className="app-learner-page lesson-page" style={{ display: "grid", gap: 16, width: "100%", maxWidth: 960, minWidth: 0, boxSizing: "border-box", paddingBottom: "calc(88px + env(safe-area-inset-bottom))" }}>
    <div className="lesson-heading">
      <AppLink className="lesson-back" href="/home" navigate={actions.navigate} ariaLabel={language === "en" ? "Back to home" : "Về trang chủ"} title={language === "en" ? "Back to home" : "Về trang chủ"} style={{ minWidth: 32, minHeight: 32 }}><ChevronLeft size={22} aria-hidden="true" /></AppLink>
      <PageTitle
        title={`${learnerLessonLabel(lesson, language === "en")} · ${lesson.weekTopic}`}
        // December 2026 (#15/N5): no "CẤU TRÚC" step label above a recognition-step lesson; like 5a9fbf0,
        // the learner view shows the lesson's own title without roadmap step labels.
        detail={grammarAvailable ? <span className="badge lesson-structure-chip"><span data-lesson-structure>{lesson.title}</span></span> : undefined}
        aside={<span className={`badge${completed ? " ok" : ""}`}>{completed ? (language === "en" ? "Completed" : "Đã hoàn thành") : lesson.progress.status === "in_progress" ? (language === "en" ? "In progress" : "Đang học") : (language === "en" ? "Not started" : "Chưa học")}</span>}
      />
    </div>
      <section className="lesson-surface" aria-label={copy.lessonAria} style={{ display: "grid", gap: 16, minWidth: 0 }}>
      <div className="ltabs" role="tablist" aria-label={copy.tabsAria}>
        <button className={tab === "study" ? "active" : ""} role="tab" aria-selected={tab === "study"} type="button" onClick={() => selectTab("study")}>1. {copy.studyTab} {studyComplete ? <CheckCircle2 className="status-icon" aria-label={copy.studyDoneAria} /> : null}</button>
        <button className={tab === "practice" ? "active" : ""} role="tab" aria-selected={tab === "practice"} type="button" disabled={!studyComplete} title={studyComplete ? undefined : copy.practiceLockedTitle} onClick={() => selectTab("practice")}>2. {copy.practiceTab} {studyComplete ? `${completedPracticeCount}/${requiredPracticeCodes.length}` : <><LockKeyhole className="status-icon" aria-hidden="true" /><span className="sr-only">{copy.practiceTab}</span></>}</button>
      </div>
      <ErrorText message={error} />
      {stepParts ? <div ref={lessonTopRef} className="lesson-study-steps" role="group" aria-label={language === "en" ? "Study steps" : "Các bước học"}>
        <span className="lesson-study-steps-label">{language === "en" ? `Step ${stepIndex + 1}/${studySteps.length}` : `Bước ${stepIndex + 1}/${studySteps.length}`} · <b>{stepLabel(studySteps[stepIndex]!)}</b></span>
        <span className="lesson-study-steps-bar" role="progressbar" aria-label={language === "en" ? "Study progress" : "Tiến độ phần Học"} aria-valuemin={1} aria-valuemax={studySteps.length} aria-valuenow={stepIndex + 1}><i style={{ width: `${(stepIndex + 1) / studySteps.length * 100}%` }} /></span>
      </div> : null}
      <ol className="stack lesson-parts" aria-label={language === "en" ? "Lesson content" : "Nội dung bài học"} style={{ gap: 16, listStyle: "none", margin: 0, padding: 0 }}>{visible.map((part, index) => {
        if (stepParts && !stepParts.has(part.code)) return null;
        const partEvidence = evidence[part.code];
        const done = partIsDone(partEvidence, localProgress.completedPartCodes.includes(part.code));
        const translations = revealedTranslations[part.code] ?? lessonTranslations(part.content);
        // Monthly lessons: the translation appears once the question is finished (correct, or every attempt used).
        // Older weekly lessons keep their explicit "View translation" step.
        const monthlyLesson = Boolean(lesson.kind);
        // 13/11: a B1+ monthly learner sees no Vietnamese exercise translation, even when older content has one.
        const translationVisible = Boolean(translations) && !(monthlyLesson && !monthlyExerciseTranslationsForLevel(lesson.cefr)) && (exerciseFinished(partEvidence) || (!monthlyLesson && (partEvidence?.status === "translated" || Boolean(partEvidence?.translationViewed))));
        const statusNotice = partStatusNotice(part, partEvidence, copy);
        const displayPart = part.code === "instruction"
          ? { ...part, content: { ...part.content, steps: lessonInstructionSteps(lesson.content.parts, tab, language) } }
          : part;
        return <li className={`card lesson-part lesson-part--${part.code}`} data-part={part.code} data-testid="app-lesson-part" key={part.code} style={{ boxSizing: "border-box", minWidth: 0, display: "grid", gap: 12, padding: 18 }}>
          <SharedLessonPartContent cefr={lesson.cefr} language={language} copy={copy} grammarAvailable={grammarAvailable} sectionNumber={visible.slice(0, index).filter((candidate) => practiceCodes.includes(candidate.code)).length + 1} part={displayPart} speak={actions.speak} openVocabularyModal={setVocabularyModal} resolveVocabularyImage={actions.resolveLessonVocabularyImage} onPronunciationListened={markPronunciationListened} />
          {practiceCodes.includes(part.code) ? <div className="stack lesson-answer" aria-busy={busyAction === part.code || undefined} style={{ gap: 12, minWidth: 0 }}>
            {part.code === "speaking" && !speakingUnlocked ? <Notice tone="info"><SpeakingGateNotice copy={copy} words={requiredPronunciationWords} heard={pronunciationListened} /></Notice> : part.code === "speaking" ? <section className="stack lesson-speaking-answer" aria-label={copy.answerLabel}><strong>{copy.answerLabel}</strong><SpeakingEvidenceControls key={`speaking-${partEvidence?.attempts ?? 0}-${partEvidence?.status ?? "new"}`} language={language} copy={copy} submitted={done || partEvidence?.status === "submitted"} artifactKey={mediaArtifacts[part.code]} onUploaded={(artifactKey) => setMediaArtifacts((current) => ({ ...current, [part.code]: artifactKey }))} uploadAudio={actions.uploadAssessmentAudio} getAudioReadUrl={actions.getAssessmentAudioReadUrl} />{partEvidence?.answer?.trim() ? <section className="stack lesson-speaking-transcript" aria-label={language === "en" ? "Automatic Speaking transcript" : "Bản chép tự động phần Nói"}><strong>{language === "en" ? "Automatic transcript" : "Bản chép tự động"}</strong><output>{partEvidence.answer.trim()}</output></section> : null}</section> : <LessonAnswerControl language={language} copy={copy} part={part} value={answers[part.code] ?? ""} evidence={partEvidence} disabled={done || Boolean(busyAction)} onChange={(value) => setAnswers((current) => ({ ...current, [part.code]: value }))} />}
            {isSelfWritingPart(part) ? <small>{language === "en" ? "Write at least two words." : "Tự viết tối thiểu 2 từ."}</small> : null}
            {part.code !== "speaking" || speakingUnlocked ? <button className="btn-primary" type="button" aria-busy={busyAction === part.code || undefined} disabled={done || Boolean(busyAction) || !hasLessonAnswer(part, answers[part.code], mediaArtifacts[part.code])} style={{ alignSelf: "flex-start", minHeight: 44 }} onClick={() => void save(part)}>{busyAction === part.code ? copy.buttons.checking : done ? copy.buttons.completed : part.code === "speaking" ? (language === "en" ? "Check speaking" : "Kiểm tra nói") : copy.buttons.submit}</button> : null}
            {statusNotice ? <Notice tone={statusNotice.tone}>{statusNotice.text}</Notice> : null}
            {!monthlyLesson && (partEvidence?.status === "wrong_exhausted" || partEvidence?.status === "wrong_retry") ? <button className="btn-sm btn-ghost" type="button" disabled={Boolean(busyAction) || partEvidence.translationViewed} onClick={() => void save(part, { answer: answers[part.code] ?? "", translated: true })}>{partEvidence.translationViewed ? copy.status.translated : (language === "en" ? "View translation" : "Xem bản dịch")}</button> : null}
            {actions.appealLessonPart && studyComplete && !partEvidence?.appealStatus && partEvidence?.status !== "appealed" ? <button className="btn-sm" type="button" aria-expanded={appealPart === part.code} disabled={Boolean(busyAction)} onClick={() => { setAppealPart(part.code); setAppealEvidence({}); }}>{language === "en" ? "Report an issue" : lesson.exerciseVersionId ? "Báo lỗi câu này" : "Báo lỗi phần này"}</button> : null}
            {partEvidence?.appealStatus || partEvidence?.status === "appealed" ? <AppLink className="btn btn-sm" href="/support?tab=appeals" navigate={actions.navigate}>{language === "en" ? "Learning support" : "Hỗ trợ học tập"}</AppLink> : null}
            {appealPart === part.code ? <section key={part.code} className="stack lesson-appeal-form" aria-label={`${language === "en" ? "Appeal" : "Kháng nghị"} ${partDisplayTitle(part, language)}`}>
              <RequestEvidenceFields value={appealEvidence} onChange={setAppealEvidence} label={language === "en" ? "Question or detail to review" : "Câu hoặc nội dung cần xem lại"} disabled={Boolean(busyAction)} english={language === "en"} />
              <label>{language === "en" ? `Appeal reason for ${partDisplayTitle(part, language)}` : `Lý do kháng nghị phần ${partDisplayTitle(part, language)}`}<textarea aria-label={language === "en" ? `Appeal reason for ${partDisplayTitle(part, language)}` : `Lý do kháng nghị phần ${partDisplayTitle(part, language)}`} value={appealReasons[part.code] ?? ""} onChange={(event) => setAppealReasons((current) => ({ ...current, [part.code]: event.target.value }))} /></label>
              <small>{language === "en" ? "Write at least five characters so the reviewer can understand what to check." : "Nhập ít nhất 5 ký tự để người duyệt hiểu điều cần xem lại."}</small>
              <div className="row"><button className="btn-sm btn-primary" type="button" disabled={Boolean(busyAction) || appealEvidence.blocked || (appealReasons[part.code]?.trim().length ?? 0) < 5} onClick={() => void appeal(part.code, appealReasons[part.code] ?? "")}>{copy.buttons.sendAppeal}</button><button className="btn-sm btn-ghost" type="button" disabled={Boolean(busyAction)} onClick={() => setAppealPart(null)}>{copy.buttons.cancel}</button></div>
            </section> : null}
            {partEvidence?.status === "wrong_retry" && safeLessonHint(part.content) ? <Notice tone="info">{copy.hintLabel}: {safeLessonHint(part.content)}</Notice> : null}
            {partEvidence?.status === "wrong_exhausted" && lessonCorrectAnswer(part.content) ? <Notice tone="info">{copy.answerRevealLabel}: {lessonCorrectAnswer(part.content)}</Notice> : null}
            {translationVisible && translations ? <section className="lesson-exercise-translation" aria-label={`${copy.translationHeading} · ${partDisplayTitle(part, language)}`} data-testid="lesson-exercise-translation"><Notice tone="info"><strong>{copy.translationHeading}</strong><span className="lesson-exercise-translation-line">{copy.translationQuestionLabel}: <span lang="vi">{translations.question}</span></span><span className="lesson-exercise-translation-line">{copy.translationAnswerLabel}: <span lang="vi">{translations.answer}</span></span></Notice></section> : null}
          </div> : null}
        </li>;
      })}</ol>
      {stepParts ? <div className="lesson-study-step-nav">
        <button type="button" className="btn" disabled={stepIndex === 0} onClick={() => goToStep(stepIndex - 1)}><ChevronLeft size={16} aria-hidden="true" />{language === "en" ? "Back" : "Quay lại"}</button>
        {!lastStudyStep ? <button type="button" className="btn btn-primary" onClick={() => goToStep(stepIndex + 1)}>{language === "en" ? "Next" : "Tiếp"}: {stepLabel(studySteps[stepIndex + 1]!)}<ChevronRight size={16} aria-hidden="true" /></button>
          : <button className="btn btn-primary" type="button" disabled={Boolean(busyAction)} onClick={() => studyComplete ? selectTab("practice") : void finishStudy()}>{busyAction === "study" ? copy.buttons.checking : studyComplete ? copy.buttons.moveToPractice : <><CheckCircle2 size={16} aria-hidden="true" /> {copy.buttons.studyDone}</>}</button>}
      </div> : null}
      {tab === "study" && !stepParts ? <section className="card lesson-study-cta"><div><strong>{studyComplete ? (language === "en" ? "You have completed this step" : "Bạn đã học xong phần này") : (language === "en" ? "Have you completed the three Study sections?" : "Học xong 3 mục trên chưa?")}</strong>{requiredPracticeCodes.length ? <p className="small">{language === "en" ? `Practice has ${requiredPracticeCodes.length} sections: ${requiredPracticeCodes.map((code) => partLabel(code, language)).join(" → ")}.` : `Bước 2 có ${requiredPracticeCodes.length} phần bài tập: ${requiredPracticeCodes.map((code) => partLabel(code, language)).join(" → ")}.`}</p> : null}</div><button className="btn-primary btn-lg" type="button" disabled={Boolean(busyAction)} onClick={() => studyComplete ? selectTab("practice") : void finishStudy()}>{busyAction === "study" ? copy.buttons.checking : studyComplete ? copy.buttons.moveToPractice : <><CheckCircle2 size={18} aria-hidden="true" /> {copy.buttons.studyDone}</>}</button></section> : null}
    </section>
    {stepParts ? null : <section className="card lesson-completion" aria-label={language === "en" ? "Complete lesson" : "Hoàn thành bài học"}><div><strong>{completed ? (language === "en" ? "You have completed this lesson. Review it whenever you like." : "Bạn đã học bài này rồi, ôn lại thoải mái!") : allPracticeComplete ? (language === "en" ? "All sections are complete. Select Complete lesson to unlock the next lesson." : "Đủ các phần rồi! Bấm Hoàn thành để mở bài tiếp theo.") : (language === "en" ? `Completed ${completedPracticeCount}/${requiredPracticeCodes.length} sections. Finish the remaining sections, then complete the lesson.` : `Đã xong ${completedPracticeCount}/${requiredPracticeCodes.length} phần. Làm nốt rồi bấm Hoàn thành nhé.`)}</strong></div><div className="row"><button className="btn-primary btn-lg" type="button" disabled={Boolean(busyAction) || (!completed && !allPracticeComplete)} title={!completed && !allPracticeComplete ? (language === "en" ? `Complete ${requiredPracticeCodes.length} practice sections first` : `Làm xong ${requiredPracticeCodes.length} phần bài tập trước`) : undefined} onClick={() => void completeLesson()}>{busyAction === "complete" ? copy.buttons.checking : completed ? copy.buttons.saveReview : copy.buttons.finishLesson}</button><AppLink className="btn btn-ghost" href="/coach" navigate={actions.navigate}>{language === "en" ? "Practise with Season" : "Luyện với Season"}</AppLink></div></section>}
    {vocabularyModal ? <SharedVocabularyModal state={vocabularyModal} speak={actions.speak} language={language} close={() => setVocabularyModal(null)} /> : null}
  </div>;
}

/**
 * Study steps for the phone/tablet flow: objective + instructions together, then one step per other study part,
 * in lesson order. Only decides which parts are shown; completion still comes from the server progress.
 */
export function lessonStudySteps(codes: readonly LessonPartCode[]): LessonPartCode[][] {
  const intro = codes.filter((code) => code === "objective" || code === "instruction");
  const rest = codes.filter((code) => code !== "objective" && code !== "instruction").map((code) => [code]);
  return intro.length ? [intro, ...rest] : rest;
}

function lessonStudyIsComplete(lesson: LessonView["lesson"]): boolean {
  if (lesson.progress.status === "completed") return true;
  const studyPartCodes = lesson.content.parts.map((part) => part.code).filter((code) => studyCodes.includes(code));
  return studyPartCodes.length > 0 && studyPartCodes.every((code) => lesson.progress.completedPartCodes.includes(code));
}

const PART_LABELS: Record<LearnerLessonLanguage, Record<LessonPartCode, string>> = {
  vi: { objective: "Mục tiêu", instruction: "Hướng dẫn", vocabulary: "Từ vựng", grammar: "Ngữ pháp", pronunciation: "Phát âm", listening: "Nghe", reading: "Đọc", writing: "Viết", word_class: "Từ loại", word_use: "Dùng từ", speaking: "Nói" },
  en: { objective: "Objective", instruction: "Instructions", vocabulary: "Vocabulary", grammar: "Grammar", pronunciation: "Pronunciation", listening: "Listening", reading: "Reading", writing: "Writing", word_class: "Word class", word_use: "Word use", speaking: "Speaking" }
};

function partLabel(code: LessonPartCode, language: LearnerLessonLanguage = "vi"): string {
  return PART_LABELS[language][code] ?? code;
}

/**
 * The part's own title when the lesson stores one, otherwise the standard label for its code.
 * Monthly AI lessons store parts without a title, so `part.title` alone renders "undefined".
 */
function partDisplayTitle(part: Pick<LessonPart, "code"> & { title?: unknown }, language: LearnerLessonLanguage = "vi"): string {
  const stored = typeof part.title === "string" ? part.title.trim() : "";
  return stored || partLabel(part.code, language);
}

/** Speaking gate: names each required pronunciation word, marks the ones not heard yet and shows heard/total. */
function SpeakingGateNotice({ copy, words, heard }: { copy: LearnerLessonCopy; words: string[]; heard: ReadonlySet<string> }) {
  const count = String(words.length);
  const heardCount = words.filter((word) => heard.has(word)).length;
  return <span className="lesson-speaking-gate" data-heard={heardCount} data-total={words.length}>
    {copy.notices.speakingGateLead.replace("{count}", count)}{" "}
    {words.map((word, index) => {
      const done = heard.has(word);
      return <span key={`${index}-${word}`} className="lesson-speaking-gate-word" data-heard={done || undefined}>{index > 0 ? ", " : ""}<strong>{word}</strong>{done ? <> ✓<span className="sr-only"> ({copy.notices.speakingGateHeard})</span></> : ` (${copy.notices.speakingGatePending})`}</span>;
    })}{" "}
    {copy.notices.speakingGateWhere}{" "}
    {copy.notices.speakingGateProgress.replace("{heard}", String(heardCount)).replace("{count}", count)}
  </span>;
}

export function LessonAnswerControl({ language, copy, part, value, disabled, hideLabel = false, evidence, onChange }: {
  language: LearnerLessonLanguage;
  copy: LearnerLessonCopy;
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
    return <fieldset className="stack" aria-label={copy.answerAria(part.code)} disabled={disabled}>
      <legend>{copy.answerLabel} <span className="badge">{copy.multipleChoiceLabel}</span></legend>
      {options.map((option, index) => <label className={`opt${value === option ? " sel" : ""}`} key={option} style={evidence?.answer === option && ["wrong_retry", "wrong_exhausted"].includes(evidence.status ?? "") ? { textDecoration: "line-through", opacity: .65 } : undefined}>
        <input type="radio" name={`lesson-${part.code}`} value={option} checked={value === option} onChange={() => onChange(option)} />
        <span><b>{String.fromCharCode(65 + index)}.</b> {option}</span>
      </label>)}
    </fieldset>;
  }
  const textarea = <textarea aria-label={copy.answerAria(part.code)} value={value} disabled={disabled} onChange={(event) => onChange(event.target.value)} />;
  return hideLabel ? textarea : <label>{copy.answerLabel}{textarea}</label>;
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

/** A question is finished once it is answered correctly or the attempt limit is reached (the server's wrong_exhausted). */
function exerciseFinished(evidence: PartEvidence | undefined): boolean {
  return evidence?.status === "correct" || evidence?.status === "wrong_exhausted";
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

/**
 * One status line per part state: the outcome label and the stored feedback used to stack
 * (e.g. "Đã gửi để kiểm tra" above a long server note). Submitted Speaking/Writing get a
 * plain "waiting to be marked" line; an appeal shows its own label; otherwise the feedback wins.
 */
/** Letters only Vietnamese uses (no plain é/à, so "café" stays English). */
const VIETNAMESE_ONLY_LETTERS = /[ăâđêôơưạảấầẩẫậắằẳẵặẹẻẽếềểễệỉịọỏốồổỗộớờởỡợụủứừửữựỳỵỷỹ]/iu;

function partStatusNotice(part: LessonPart, evidence: PartEvidence | undefined, copy: LearnerLessonCopy): { tone: "ok" | "info" | "warn"; text: string } | null {
  const status = evidence?.status;
  if (status === "submitted") {
    const text = part.code === "speaking" ? copy.status.submittedSpeaking : part.code === "writing" ? copy.status.submittedWriting : evidence?.feedback?.trim() || copy.status.submitted;
    return { tone: "info", text };
  }
  if (status === "appealed") return { tone: "info", text: copy.status.appealed };
  const tone = status === "correct" ? "ok" : "warn";
  const feedback = evidence?.feedback?.trim();
  // The server's stock retry note ("Chưa đúng… còn 1/một lượt thử…") is shown in the lesson language at every level.
  if (status === "wrong_retry" && (!feedback || /^chưa đúng.*lượt thử/iu.test(feedback))) return { tone, text: copy.status.retryNotice };
  // B1+ learners see no Vietnamese (16/11): the server's stock notes ("Bạn đã hoàn thành phần này", "hết lượt thử")
  // give way to the English outcome label.
  if (feedback && copy === learnerLessonCopy.en && VIETNAMESE_ONLY_LETTERS.test(feedback.normalize("NFC"))) return { tone, text: partOutcomeLabel(status, copy) };
  if (feedback) return { tone, text: feedback };
  return partHasVisibleOutcome(evidence) ? { tone, text: partOutcomeLabel(status, copy) } : null;
}

function hasLessonAnswer(part: LessonPart, answer: string | undefined, artifactKey: string | undefined): boolean {
  if (part.code === "speaking") return Boolean(artifactKey);
  if (isSelfWritingPart(part)) return (answer?.trim().split(/\s+/u).filter(Boolean).length ?? 0) >= 2;
  return Boolean(answer?.trim());
}

function isSelfWritingPart(part: LessonPart): boolean {
  return part.code === "writing" && (part.content.type === undefined || part.content.type === "write");
}

function partOutcomeLabel(status: PartEvidence["status"], copy: LearnerLessonCopy): string {
  switch (status) {
    case "wrong_retry": return copy.status.wrongRetry;
    case "submitted": return copy.status.submitted;
    case "wrong_exhausted": return copy.status.wrongExhausted;
    case "translated": return copy.status.translated;
    case "appealed": return copy.status.appealed;
    case "correct": return copy.status.correct;
    default: return copy.status.unanswered;
  }
}

function englishReviewWeekLabel(weekNumber: number | undefined): string {
  return weekNumber ? `the week ${weekNumber} review` : "last week's review";
}

function reviewWeekLabel(weekNumber: number | undefined): string {
  return weekNumber ? `bài ôn tuần ${weekNumber}` : "bài ôn tuần trước";
}

function lessonDayLabel(dayNumber: number): string {
  return (["T2", "T3", "T4", "T5", "T6", "T7", "CN"] as const)[dayNumber - 1] ?? `Bài ${dayNumber}`;
}

function formatLessonDate(value: string, language: LearnerLessonLanguage = "vi"): string {
  const parsed = new Date(`${value.slice(0, 10)}T00:00:00Z`);
  if (!Number.isFinite(parsed.getTime())) return value.slice(0, 10);
  const locale = language === "en" ? "en-GB" : "vi-VN";
  const weekday = new Intl.DateTimeFormat(locale, { weekday: "long", timeZone: "UTC" }).format(parsed);
  const date = new Intl.DateTimeFormat(locale, { day: "2-digit", month: "2-digit", year: "numeric", timeZone: "UTC" }).format(parsed);
  return `${weekday} ${date}`;
}

type LessonAudioSource = { text?: string; src?: string };

function ExclusiveLessonAudio({
  src,
  label,
  onError,
  style
}: {
  src: string;
  label: string;
  onError?: () => void;
  style?: CSSProperties;
}) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const releaseRef = useRef<(() => void) | undefined>(undefined);
  const release = () => {
    const current = releaseRef.current;
    releaseRef.current = undefined;
    current?.();
  };
  useEffect(() => () => release(), []);
  const claim = () => {
    if (releaseRef.current) return;
    const audio = audioRef.current;
    if (!audio) return;
    const claimed = claimExclusiveAudio("media", () => {
      audio.pause();
      audio.currentTime = 0;
    });
    if (!claimed) {
      audio.pause();
      audio.currentTime = 0;
      return;
    }
    releaseRef.current = claimed;
  };
  return <audio
    ref={audioRef}
    controls
    preload="metadata"
    src={src}
    aria-label={label}
    style={style}
    onPlay={claim}
    onPause={release}
    onEnded={release}
    onError={() => { release(); onError?.(); }}
  />;
}

function LessonAudioControl({ source, speak, copy, language, label = "Listening" }: { source: LessonAudioSource; speak: LearnerCallbacks["speak"]; copy: LearnerLessonCopy; language: LearnerLessonLanguage; label?: string }) {
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  if (!source.src && !source.text) return <Notice tone="warn">{copy.errors.noAudio}</Notice>;
  if (source.src) return <div className="stack" aria-label={label}>
    <ExclusiveLessonAudio key={`${source.src}-${attempt}`} src={source.src} label={language === "en" ? `Listen to the ${label} audio` : `Nghe audio phần ${label.replace(/^Nghe phần\s+/u, "")}`} style={{ maxWidth: "100%", width: "100%" }} onError={() => setFailed(true)} />
    {failed ? <><Notice tone="warn">{copy.errors.audioFailed}</Notice><button className="btn-sm btn-ghost" type="button" style={{ alignItems: "center", display: "inline-flex", gap: 6, minHeight: 44 }} onClick={() => { setFailed(false); setAttempt((value) => value + 1); }}><RotateCcw size={16} aria-hidden="true" /> {copy.notices.retryAudio}</button></> : null}
  </div>;
  return <button className="btn-sm btn-ghost vocabulary-card-sound lesson-audio-primary lesson-listening-audio-button" type="button" aria-label={`${language === "en" ? "Listen to" : "Nghe nội dung phần"} ${label}`} onClick={() => speak(source.text!, "en-US", { rate: 0.85 })}><Volume2 size={16} aria-hidden="true" /> {language === "en" ? "Listen" : "Nghe nội dung"}</button>;
}

function SpeakingEvidenceControls({
  language,
  copy,
  submitted = false,
  artifactKey,
  onUploaded,
  uploadAudio,
  getAudioReadUrl
}: {
  language: LearnerLessonLanguage;
  copy: LearnerLessonCopy;
  /** Once submitted the part shows its own status line; the "uploaded, now submit" hint would contradict it. */
  submitted?: boolean;
  artifactKey?: string | undefined;
  onUploaded: (artifactKey: string) => void;
  uploadAudio: (file: Blob, filename: string) => Promise<string | import("./contracts.js").LearnerAudioUpload>;
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
      setReadError(copy.errors.savedAudioFailed);
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
      setError(copy.errors.invalidAudio);
      return;
    }
    if (file.size > 20 * 1024 * 1024) {
      setPendingFile(file);
      setError(copy.errors.audioTooLarge);
      return;
    }
    setPendingFile(file);
    setBusy(true);
    setError("");
    try {
      const saved = await uploadAudio(file, file.name);
      const savedKey = typeof saved === "string" ? saved : saved.artifactKey;
      setPendingFile(undefined);
      setAudioUrl((current) => {
        if (current) URL.revokeObjectURL(current);
        return URL.createObjectURL(file);
      });
      onUploaded(savedKey);
    } catch {
      setError(copy.errors.uploadFailed);
    } finally {
      setBusy(false);
    }
  };

  const startRecording = async () => {
    if (!canRecord) {
      setError(copy.errors.recorderUnavailable);
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
        setError(copy.errors.recordingInterrupted);
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
      setError(copy.errors.microphoneUnavailable);
    }
  };

  const stopRecording = () => {
    if (!recorder.current) return;
    recorder.current.stop();
    setRecording(false);
  };

  return <section className="stack" aria-label={language === "en" ? "Speaking evidence" : "Bằng chứng nói"}>
    {!canRecord ? <Notice tone="warn">{copy.errors.recorderUnavailable}</Notice> : null}
    <div className="row" style={{ flexWrap: "wrap", gap: 8 }}>
      <button className="btn-sm btn-ghost" type="button" aria-busy={busy || undefined} disabled={!canRecord || busy} style={{ alignItems: "center", display: "inline-flex", gap: 6, minHeight: 44 }} onClick={() => recording ? stopRecording() : void startRecording()}>{recording ? <><Square size={15} aria-hidden="true" /> {copy.buttons.stopRecording}</> : <><Mic size={16} aria-hidden="true" /> {copy.buttons.record}</>}</button>
      <label className="btn" htmlFor="lesson-speaking-audio" style={{ alignItems: "center", display: "inline-flex", gap: 6, minHeight: 44 }}><Upload size={16} aria-hidden="true" /> {busy ? copy.buttons.checking : copy.buttons.upload}</label>
      <input id="lesson-speaking-audio" className="sr-only" type="file" accept="audio/*" aria-label={language === "en" ? "Upload speaking recording" : "Tải file ghi âm speaking"} disabled={busy} onChange={(event) => {
        const file = event.currentTarget.files?.[0];
        event.currentTarget.value = "";
        if (file) void send(file);
      }} />
    </div>
    {busy ? <Notice>{copy.notices.uploadBusy}</Notice> : null}
    {readBusy ? <Notice>{copy.notices.savedAudioBusy}</Notice> : null}
    {readError ? <div className="stack"><Notice tone="warn">{readError}</Notice><button className="btn-sm btn-ghost" type="button" style={{ alignItems: "center", display: "inline-flex", gap: 6, minHeight: 44 }} onClick={() => void loadPersistedAudio()}><RotateCcw size={16} aria-hidden="true" /> {copy.notices.retrySavedAudio}</button></div> : null}
    {error ? <div className="stack"><Notice tone="warn">{error}</Notice>{pendingFile ? <button className="btn-sm btn-ghost" type="button" style={{ alignItems: "center", display: "inline-flex", gap: 6, minHeight: 44 }} onClick={() => void send(pendingFile)}><RotateCcw size={16} aria-hidden="true" /> {copy.notices.retryUpload}</button> : null}</div> : null}
    {audioUrl ? <>{submitted ? null : <Notice tone="ok">{copy.notices.uploadReady}</Notice>}<ExclusiveLessonAudio src={audioUrl} label={language === "en" ? "Listen to recording" : "Nghe lại file ghi âm"} style={{ maxWidth: "100%", width: "100%" }} /></> : artifactKey && !submitted ? <Notice tone="ok">{copy.notices.uploadReady}</Notice> : null}
  </section>;
}

export function SharedLessonPartContent({
  cefr,
  language,
  copy,
  grammarAvailable,
  sectionNumber,
  part,
  speak,
  openVocabularyModal,
  resolveVocabularyImage,
  onPronunciationListened,
  collapsibleVocabulary = false,
  showGrammarStepLabel = false
}: {
  /** Review days list a whole week of words: day-lesson cards in a scroll box showing a few at a time. */
  collapsibleVocabulary?: boolean;
  /** Operator preview keeps the roadmap step label ("Bước 3 (Lỗi thường gặp): …"); learners never see it. */
  showGrammarStepLabel?: boolean;
  cefr: LessonView["lesson"]["cefr"];
  language: LearnerLessonLanguage;
  copy: LearnerLessonCopy;
  grammarAvailable: boolean;
  sectionNumber: number;
  part: LessonPart;
  speak: LearnerCallbacks["speak"];
  openVocabularyModal: (state: VocabularyModalState) => void;
  resolveVocabularyImage?: LearnerCallbacks["resolveLessonVocabularyImage"];
  onPronunciationListened?: (word: string) => void | Promise<void>;
}) {
  const content = part.content as {
    text?: string;
    script?: string;
    audio?: unknown;
    audioUrl?: string;
    type?: string;
    prompt?: string;
    formula?: string;
    usage?: string;
    examples?: string[];
    exampleAudioUrls?: string[];
    exampleTranslations?: unknown;
    focus?: string;
    /** Roadmap catalog item of the pronunciation target, when the lesson stores it. */
    catalogId?: unknown;
    instruction?: string;
    answer?: string;
    modelAnswer?: string;
    sample?: string;
    steps?: unknown;
     words?: unknown[];
    wordAudioUrls?: string[];
    items?: Array<LessonVocabularyItem | { type: "content" | "language"; text: string; condition: string; criterion: string; assessmentCode: string }>;
    groups?: unknown;
  };
  const words = part.code === "vocabulary" ? (content.items ?? []) as LessonVocabularyItem[] : [];
  // Review days: plain day-lesson cards (no umbrella grouping) inside a scroll box.
  const vocabularyBlocks = part.code !== "vocabulary" ? [] : collapsibleVocabulary ? words.map((item) => ({ kind: "item" as const, item })) : vocabularyPresentationBlocks(words, content.groups);
  const objectiveItems = part.code === "objective"
    // Monthly AI lessons store objective items as plain strings; weekly lessons use { text, type }.
    // Bare core words ("partner", "discuss") are not objectives: they are dropped and the objective text shows instead.
    ? learnerObjectiveStatements(content.items, (item) => grammarAvailable || item.type !== "language")
    : [];
  const steps = Array.isArray(content.steps)
    ? content.steps.filter((step): step is string => typeof step === "string" && Boolean(step.trim()))
    : [];
  const guidanceSteps = part.code === "instruction" ? completeInstructionSteps(steps) : steps;
  const audioSource = part.code === "listening" ? lessonAudioSource(content) : undefined;
  const learnerPrompt = content.prompt ? learnerExercisePrompt(content.prompt, content.type) : "";
  const pronunciationWords = readPronunciationWords(content.words);
  const pronunciationWordAudioUrls = Array.isArray(content.wordAudioUrls) ? content.wordAudioUrls : [];
  const pronunciationReviewTargets = readPronunciationTargets(content);
  const targetSound = pronunciationTarget(content.focus ?? "");
  const grammarExamples = content.examples?.slice(0, 3) ?? [];
  // A1–A2: Vietnamese translation per example (index-aligned), shown as a popup only, never spoken.
  const grammarExampleTranslations = readStringList(content.exampleTranslations);
  const speakingModel = conciseSpeakingModel(content.sample ?? content.answer ?? content.modelAnswer);
  const grammarCopy = (value: string) => showGrammarStepLabel ? value.trim() : withoutGrammarStepLabel(value);
  // grammar.objective is the locked day-plan objective (K1–K3, M1–M3, "Workplace task", "Mock test" …): roadmap
  // metadata, never shown to learners. Only the operator preview (showGrammarStepLabel) keeps it.
  const grammarGoal = showGrammarStepLabel && part.code === "grammar" && typeof part.content.objective === "string" ? grammarCopy(part.content.objective) : undefined;
  // Roadmap name of the grammar point (never guessed) and the formula's key slots for marking example words.
  const grammarName = part.code === "grammar" ? grammarPointName(cefr, part.content) : undefined;
  // "A vs B" topics name the two boxes of a two-structure formula.
  const grammarCompareNames = (typeof part.content.topicTitle === "string" ? part.content.topicTitle : grammarName ?? "").split(/\s+vs\.?\s+/iu).map((name) => name.trim()).filter(Boolean);
  const grammarMatcher: GrammarExampleMatcher | null = part.code === "grammar" && content.formula ? grammarExampleMatcher(content.formula.split(/\r?\n/u).flatMap((line) => grammarFormulaLines(line))) : null;
  return <>
    {part.code === "grammar" || part.code === "pronunciation" ? null : <div className="row between"><h2 className={part.code === "vocabulary" ? "lesson-vocabulary-heading" : undefined}>{part.code === "objective" ? copy.objectiveHeading : part.code === "instruction" ? copy.instructionHeading : part.code === "vocabulary" ? copy.vocabularyHeading : `${sectionNumber}. ${partHeading(part, language)}`}</h2></div>}
    {part.code === "objective" && objectiveItems.length ? <><p className="lesson-objective-lead">{learnerObjectiveLead(cefr)}</p><ul className="lesson-objective-list" aria-label={copy.objectiveAria}>{objectiveItems.map((text, index) => <li key={`${index}-${text}`}>{learnerFacingObjectiveBody(text)}</li>)}</ul></> : content.text && part.code !== "grammar" && part.code !== "pronunciation" ? <p className={part.code === "objective" ? "lesson-objective-text" : part.code === "reading" ? "lesson-reading-passage" : undefined}>{part.code === "objective" ? learnerFacingObjective(conciseLessonObjective(content.text), cefr) : content.text}</p> : null}
    {learnerPrompt && part.code !== "speaking" ? <p><LessonPromptText value={learnerPrompt} language={language} /></p> : null}
    {guidanceSteps.length ? <ul className="lesson-instruction-list" aria-label={copy.instructionAria}>{guidanceSteps.map((step, index) => <li key={`${index}-${step}`}>{step}</li>)}</ul> : null}
    {audioSource ? <LessonAudioControl source={audioSource} speak={speak} copy={copy} language={language} /> : null}
    {part.code === "grammar" && readGrammarSteps(content).length >= 2 ? <div className="lesson-study-block"><div className="lesson-study-panel-header"><h2>{copy.grammarHeading}</h2></div>{grammarName ? <p className="lesson-grammar-name"><strong>{grammarName}</strong></p> : null}<div className="lesson-grammar-steps">{readGrammarSteps(content).map((step, stepIndex) => { const matcher = grammarExampleMatcher(grammarFormulaLines(step.formula)); return <section className="lesson-grammar-step" key={`${stepIndex}-${step.formula}`}><GrammarExplanation paragraphs={grammarExplanationParagraphs(stepIndex === 0 ? grammarGoal : undefined, step.text ? grammarCopy(grammarUsageCopy(step.text, language)) : undefined)} language={language} /><GrammarFormula formula={step.formula} language={language} names={grammarCompareNames} />{step.examples.length ? <div className="lesson-example-list" aria-label={language === "en" ? "Grammar examples" : "Câu ví dụ ngữ pháp"}>{step.examples.map((example, index) => { const text = conciseGrammarExample(example); const pair = grammarExamplePair(text); const spoken = sanitizeGrammarSpeechText(pair?.right ?? text); return <GrammarExampleButton key={example} text={text} display={<GrammarExampleDisplay text={text} pair={pair} matcher={matcher} marks={step.marks[index]} manual={step.manual[index]} cefr={cefr} />} spoken={spoken} translation={language === "en" ? undefined : step.translations[index]} listenLabel={language === "en" ? "Listen to example" : "Nghe câu ví dụ"} onPlay={() => playLessonText(spoken, undefined, speak)} />; })}</div> : null}</section>; })}</div></div> : part.code === "grammar" && content.formula ? <div className="lesson-study-block"><div className="lesson-study-panel-header"><h2>{copy.grammarHeading}</h2></div>{grammarName ? <p className="lesson-grammar-name"><strong>{grammarName}</strong></p> : null}<div className="lesson-grammar-copy"><div className="lesson-grammar-row"><GrammarExplanation paragraphs={grammarExplanationParagraphs(grammarGoal, grammarCopy(grammarUsageCopy(content.usage || content.text || "", language)))} language={language} /><div className="lesson-grammar-formula-row"><GrammarFormula formula={content.formula} language={language} names={grammarCompareNames} /><LessonAudioAssetButton audioSrc={content.audioUrl} label={language === "en" ? "Listen to grammar example" : "Nghe mẫu ngữ pháp"} title={language === "en" ? "Listen to grammar structure" : "Nghe cấu trúc ngữ pháp"} className="lesson-grammar-audio-icon" speak={speak} /></div></div></div>{grammarExamples.length ? <div className="lesson-example-list" aria-label={language === "en" ? "Grammar examples" : "Câu ví dụ ngữ pháp"}>{grammarExamples.map((example, index) => { const text = conciseGrammarExample(example); const pair = grammarExamplePair(text); const spoken = sanitizeGrammarSpeechText(pair?.right ?? text); return <GrammarExampleButton key={example} text={text} display={<GrammarExampleDisplay text={text} pair={pair} matcher={grammarMatcher} marks={grammarExampleMarkWords(part.content.exampleMarks, index)} manual={grammarHighlightEntry(part.content.manualExampleHighlights, 0, index, example)?.ranges} cefr={cefr} />} spoken={spoken} translation={language === "en" ? undefined : grammarExampleTranslations[index]} listenLabel={language === "en" ? "Listen to example" : "Nghe câu ví dụ"} onPlay={() => playLessonText(spoken, pair ? undefined : content.exampleAudioUrls?.[index], speak)} />; })}</div> : null}</div> : null}
    {part.code === "pronunciation" && content.focus ? <div className="lesson-study-block lesson-pronunciation-summary"><div className="lesson-study-panel-header lesson-pronunciation-heading"><h2>{copy.pronunciationHeading}</h2></div><div className="lesson-pronunciation-targets">{(pronunciationReviewTargets.length > 0 ? pronunciationReviewTargets : [{ focus: targetSound, words: pronunciationWords.slice(0, 3) }]).map((target, targetIndex) => <PronunciationTargetBlock key={`${target.focus}-${targetIndex}`} rule={pronunciationRuleCopy(cefr, target.focus, pronunciationReviewTargets.length > 0 ? undefined : content.catalogId, language)} focus={target.focus} words={target.words} audioUrls={targetIndex === 0 ? pronunciationWordAudioUrls : []} language={language} speak={speak} onListened={onPronunciationListened} separateSymbol={pronunciationReviewTargets.length > 0} showMouth={cefr === "A1" || cefr === "A2"} guidance={targetIndex === 0 ? [typeof part.content.objective === "string" ? monthlyReadablePlanObjective(part.content.objective) : "", content.instruction ? pronunciationInstructionCopy(content.instruction, language) : ""].filter(Boolean).join(" ") : undefined} />)}</div></div> : null}
    {part.code === "pronunciation" && typeof part.content.passage === "string" && part.content.passage ? <div className="card flat"><p className="lesson-read-aloud-passage"><Highlighted segments={readAloudPassageSegments(part.content.passage, readStringList(part.content.passageTargets).filter(Boolean))} /></p><button type="button" className="btn-sm" onClick={() => speak(part.content.passage as string)}>{language === "en" ? "Listen to passage" : "Nghe đoạn mẫu"}</button></div> : null}
    {part.code === "speaking" && speakingModel ? <><p className="lesson-speaking-instruction"><strong>{copy.speakingInstructionLabel}</strong> <LessonPromptText value={content.instruction?.trim() || content.prompt?.trim() || (language === "en" ? "Follow the model sentence below and change one detail to fit your situation." : "Nói theo câu mẫu bên dưới và thay đổi một chi tiết cho phù hợp.")} /></p><div className={`card flat lesson-speaking-model${speakingModel.length <= 80 ? " lesson-speaking-model--inline" : ""}`}><strong>{speakingModel}</strong>{content.audioUrl ? <ExclusiveLessonAudio src={content.audioUrl} label={language === "en" ? "Listen to speaking model" : "Nghe audio mẫu phần Nói"} /> : null}</div></> : null}

    {part.code === "vocabulary" ? <div className={collapsibleVocabulary ? "vocabulary-list vocabulary-list--scroll" : "vocabulary-list"} {...(collapsibleVocabulary ? { tabIndex: 0, "aria-label": `${words.length} ${language === "en" ? "words" : "từ"}` } : {})}>{vocabularyBlocks.map((block) => block.kind === "group"
      ? <section className="lesson-vocabulary-group" key={`group-${block.umbrella.word}`}><h3 className="lesson-vocabulary-group-heading">{language === "en" ? "UMBRELLA WORD" : "TỪ BAO TRÙM"} {block.umbrella.word}</h3><div className="lesson-vocabulary-group-items">{block.items.map((item) => <VocabularyCard key={item.word} cefr={cefr} language={language} item={item} itemIndex={words.indexOf(item)} speak={speak} openModal={openVocabularyModal} resolveImage={resolveVocabularyImage} hideUmbrella />)}</div></section>
      : <VocabularyCard key={block.item.word} cefr={cefr} language={language} item={block.item} itemIndex={words.indexOf(block.item)} speak={speak} openModal={openVocabularyModal} resolveImage={resolveVocabularyImage} />
    )}</div> : null}
    {part.code !== "vocabulary" && part.code !== "objective" ? (content.items as LessonVocabularyItem[] | undefined)?.filter((item) => typeof item?.word === "string" && Boolean(item.word.trim())).map((item) => <article className="word-card" key={item.word}><h3>{item.word}</h3><span className="ipa">{item.pronunciation}</span>{language === "vi" ? <p>{item.meaning}</p> : null}{item.examples?.map((example) => <small key={example}>{example}</small>)}</article>) : null}
    {content.examples?.length && part.code !== "grammar" ? <ul>{content.examples.map((example) => <li key={example}>{example}</li>)}</ul> : null}
  </>;
}

function playLessonText(text: string, audioUrl: string | undefined, speak: LearnerCallbacks["speak"], onEnded?: () => void, rate = 1) {
  const src = audioUrl?.trim();
  const speakFallback = () => speak(text, "en-US", { rate, ...(onEnded ? { onStatus: (status) => { if (status === "ended") onEnded(); } } : {}) });
  if (src) {
    speak(text, "en-US", { audioSrc: src, rate, onStatus: (status) => {
      if (status === "ended") onEnded?.();
      if (status === "error") speakFallback();
    } });
    return;
  }
  speakFallback();
}

function LessonAudioAssetButton({ audioSrc, label, title, className, speak }: { audioSrc?: string | undefined; label: string; title: string; className: string; speak: LearnerCallbacks["speak"] }) {
  const src = audioSrc?.trim() ?? "";
  if (!src) return null;
  const play = () => speak("", "en-US", { audioSrc: src });
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

/** B1–C1 roadmap rule of a pronunciation target (resolved from the catalog at render time; A1–A2 have none). */
function pronunciationRuleCopy(cefr: string, focus: string, catalogId: unknown, language: LearnerLessonLanguage): MonthlyPronunciationRuleCopy | undefined {
  if (cefr !== "B1" && cefr !== "B2" && cefr !== "C1") return undefined;
  const rule = monthlyPronunciationLessonRule(cefr, { focus, ...(typeof catalogId === "string" && catalogId ? { catalogId } : {}) });
  return rule ? monthlyPronunciationRuleCopy(rule, language) : undefined;
}

/**
 * One sound: bold target line, the rule (B1–C1) or guidance in grey, the rule core as a small
 * formula box, the mouth picture inline (A1–A2 only; B1–C1 show none), then the example chips
 * with the ending of the rule marked when it can be derived.
 */
function PronunciationTargetBlock({ focus, words, audioUrls, language, speak, onListened, separateSymbol = false, showMouth = false, guidance, rule }: { rule?: MonthlyPronunciationRuleCopy | undefined; guidance?: string | undefined; separateSymbol?: boolean; showMouth?: boolean; focus: string; words: Array<{ word: string; ipa?: string }>; audioUrls: string[]; language: LearnerLessonLanguage; speak: (text: string) => void; onListened?: ((word: string) => void | Promise<void>) | undefined }) {
  const sound = pronunciationTarget(focus);
  const firstWord = words[0]?.word;
  // In many American accents, intervocalic t after a stressed vowel and
  // before a weak syllable can be a flap. The supplied IPA is British.
  const flappedWords = /^(?:\/t\/|t)$/u.test(sound)
    ? words.filter(({ ipa }) => /ˈ[^ˈˌ/]*[iɪeæɑɒɔoʊuʌəɜaɛɐɚɝ](?:ː)?\.?t\.?[iɪəɚʊ]/u.test(ipa ?? "")).map(({ word }) => `“${word}”`).join(", ")
    : "";
  return <section className="lesson-pronunciation-target">
    <div className="lesson-pronunciation-target-head"><p className="lesson-study-focus"><strong>{separateSymbol ? <>{language === "en" ? "Sound " : "Âm "}<span className="lesson-pronunciation-symbol">{sound}</span>{firstWord ? (language === "en" ? ` as in “${firstWord}”` : ` như trong “${firstWord}”`) : ""}</> : language === "en" ? `Sound ${sound}${firstWord ? ` as in “${firstWord}”` : ""}` : `Âm ${sound}${firstWord ? ` như trong “${firstWord}”` : ""}`}</strong></p></div>
    {rule ? <div className="lesson-pronunciation-rule">
      <p className="lesson-study-explanation">{rule.rule}</p>
      <p className="lesson-study-explanation"><strong>{rule.rememberLabel}:</strong> {rule.remember}</p>
      <p className="lesson-study-explanation"><strong>{rule.mistakeLabel}:</strong> {rule.mistake}</p>
    </div> : guidance ? <p className="lesson-study-explanation">{guidance}</p> : null}
    {rule?.core ? <div className="lesson-study-formula-box lesson-pronunciation-formula"><p className="lesson-study-focus"><strong>{rule.core.pattern} → <span className="lesson-study-mark">{rule.core.result}</span></strong></p></div> : null}
    {showMouth ? <PronunciationMouthPanel target={sound} language={language} /> : null}
    {flappedWords ? <p className="lesson-study-explanation">{language === "en"
      ? `In American English, the t in ${flappedWords} may sound like a quick d. The IPA shown here uses British /t/.`
      : `Trong giọng Mỹ, t trong ${flappedWords} có thể nghe gần giống d nhẹ. IPA ở đây dùng âm /t/ theo giọng Anh.`}</p> : null}
    <div className="lesson-pronunciation-words" aria-label={language === "en" ? "Pronunciation practice words" : "Luyện từ phát âm"}>{words.map((item, index) => { const marked = pronunciationEndingSegments(item.word, item.ipa, rule?.core); const ipaMarked = marked.ipa.some((segment) => segment.mark) ? marked.ipa : pronunciationTargetSegments(item.ipa, sound); return <button className="btn-sm btn-ghost lesson-example-card vocabulary-card-sound lesson-pronunciation-word-chip" type="button" aria-label={language === "en" ? `Listen to pronunciation word: ${item.word}` : `Nghe từ phát âm: ${item.word}`} onClick={() => playLessonText(item.word, audioUrls[index], speak, () => { void onListened?.(item.word); }, 0.65)} key={item.word}><Volume2 size={14} aria-hidden="true" /><strong><Highlighted segments={marked.word} /></strong>{item.ipa ? <>{" "}<Highlighted segments={ipaMarked} /></> : null}</button>; })}</div>
  </section>;
}

/** Text with its marked parts in the study accent colour (same text content as the plain string). */
function Highlighted({ segments }: { segments: HighlightSegment[] }) {
  return <>{segments.map((segment, index) => segment.mark ? <span className="lesson-study-mark" key={index}>{segment.text}</span> : <Fragment key={index}>{segment.text}</Fragment>)}</>;
}

function readPronunciationTargets(content: Record<string, unknown> | undefined): Array<{ focus: string; words: Array<{ word: string; ipa?: string }> }> {
  if (!content || !Array.isArray(content.reviewTargets)) return [];
  return content.reviewTargets.flatMap((target) => {
    if (!target || typeof target !== "object" || Array.isArray(target)) return [];
    const record = target as Record<string, unknown>;
    const words = readPronunciationWords(record.words);
    return typeof record.focus === "string" && record.focus.trim() && words.length ? [{ focus: record.focus.trim(), words }] : [];
  });
}

/**
 * A review day can carry several grammar steps in one formula (one per line).
 * Each formula gets its own bold line with its own explanation underneath;
 * the explanation is split by sentence or ";" when it matches the formula count.
 */
/** Review days store one entry per grammar step: { formula, text, examples }. */
function readStringList(value: unknown): string[] {
  return Array.isArray(value) ? value.map((item) => typeof item === "string" ? item : "") : [];
}

function readGrammarSteps(content: Record<string, unknown>): Array<{ formula: string; text: string; examples: string[]; translations: string[]; marks: Array<string[] | undefined>; manual: Array<GrammarHighlightRange[] | undefined> }> {
  const steps = (content as { steps?: unknown }).steps;
  if (!Array.isArray(steps)) return [];
  const visible = steps.filter((step): step is Record<string, unknown> => step && typeof step === "object" && typeof step.formula === "string" && Boolean(step.formula.trim()));
  return visible.map((record, pointIndex) => {
    const formula = (record.formula as string).trim();
    const text = typeof record.text === "string" ? record.text : typeof record.usage === "string" ? record.usage : "";
    const rawExamples = Array.isArray(record.examples) ? record.examples : [];
    const rawTranslations = readStringList(record.exampleTranslations);
    const kept = rawExamples.flatMap((example, index) => typeof example === "string" && example.trim() ? [{ example, translation: rawTranslations[index] ?? "", marks: grammarExampleMarkWords(record.exampleMarks, index), manual: grammarHighlightEntry(content.manualExampleHighlights, pointIndex, index, example)?.ranges }] : []).slice(0, 3);
    return { formula, text, examples: kept.map((item) => item.example), translations: kept.map((item) => item.translation), marks: kept.map((item) => item.marks), manual: kept.map((item) => item.manual) };
  });
}

/**
 * The formula as a full-width band (one pattern per line, at most three, key slots marked). A correct vs wrong
 * pattern shows a green and a red box side by side; two compared structures show two boxes (stacked when narrow).
 */
function GrammarFormula({ formula, language = "vi", names = [] }: { formula: string; language?: LearnerLessonLanguage; names?: readonly string[] }) {
  const boxes = grammarFormulaBoxes(formula, language, (value) => grammarFormulaLines(value), names);
  // The wrong box shows the wrong form as written: never highlighted.
  const lineSegments = (line: string, tone?: string): HighlightSegment[] => tone === "wrong" ? [{ text: line, mark: false }] : grammarFormulaSegments(line);
  const box = (lines: string[], className: string, label?: string, key?: string, tone?: string) => <div className={className} key={key}>{label ? <span className="lesson-study-formula-label">{label}</span> : null}<p className="lesson-study-focus"><strong>{lines.length > 1 ? lines.map((line, index) => <span className="lesson-grammar-formula-line" style={{ display: "block" }} key={`${index}-${line}`}><Highlighted segments={lineSegments(line, tone)} /></span>) : <Highlighted segments={lineSegments(lines[0] ?? formula.trim(), tone)} />}</strong></p></div>;
  // Error-check / "(NOT …)" lines: one neutral band, a row per rule; the rule's wrong form follows it on the same
  // row (red, struck through, never highlighted) and its notes stay muted.
  const rules = boxes.length === 1 ? boxes[0]!.rules : undefined;
  if (rules) return <div className="lesson-study-formula-box lesson-study-formula-band lesson-grammar-rules"><div className="lesson-study-focus">{rules.map((rule, index) => <p className="lesson-grammar-rule" key={`${index}-${rule.pattern}`}>
    {rule.pattern ? <strong className="lesson-grammar-rule-pattern"><Highlighted segments={grammarFormulaSegments(rule.pattern)} /></strong> : null}
    {rule.notes.map((note, at) => <span className="lesson-grammar-rule-note" key={`${at}-${note}`}>{note}</span>)}
    {rule.wrong.map((wrong, at) => <span className="lesson-grammar-rule-wrong" key={`${at}-${wrong}`}><span className="lesson-grammar-rule-wrong-mark" role="img" aria-label={language === "en" ? "Wrong" : "Sai"}>✗</span><s>{wrong}</s></span>)}
  </p>)}</div></div>;
  if (boxes.length === 1) return box(boxes[0]!.lines, "lesson-study-formula-box lesson-study-formula-band");
  return <div className="lesson-study-formula-compare">{boxes.map((item, index) => box(item.lines, `lesson-study-formula-box lesson-study-formula-band lesson-study-formula-box--${item.tone}`, item.label, `${index}-${item.tone}`, item.tone))}</div>;
}

/**
 * An example chip's text. A wrong/right pair ("Wrong: … Right: …", "Sai: … Đúng: …", "✗ … ✓ …") shows the wrong
 * sentence in red, struck through and never highlighted, then the right sentence in green, highlighted as usual.
 */
function GrammarExampleDisplay({ text, pair, matcher, marks, manual, cefr }: { text: string; pair: { wrong: string; right: string } | undefined; matcher: GrammarExampleMatcher | null; marks?: readonly string[] | undefined; manual?: readonly GrammarHighlightRange[] | undefined; cefr: string }) {
  // Generated lessons (13/11) mark exactly the words the model gave for the row; older ones keep the formula matcher.
  const segments = (sentence: string) => marks ? grammarMarkedExampleSegments(sentence, marks) : grammarExampleSegments(sentence, matcher);
  if (!pair) return manual ? <ManualGrammarHighlight text={text} ranges={manual} /> : <Highlighted segments={segments(text)} />;
  // A1–A2 learners read Vietnamese labels, B1+ English ones.
  const [wrongLabel, rightLabel] = cefr === "A1" || cefr === "A2" ? ["Sai", "Đúng"] : ["Wrong", "Right"];
  return <span className="lesson-example-pair">
    <span className="lesson-example-pair-part"><span className="lesson-example-pair-label lesson-example-pair-label--wrong">{wrongLabel}</span><s className="lesson-example-wrong">{pair.wrong}</s></span>
    <span className="lesson-example-pair-arrow" aria-hidden="true">→</span>
    <span className="lesson-example-pair-part"><span className="lesson-example-pair-label lesson-example-pair-label--right">{rightLabel}</span><span className="lesson-example-right">{manual ? <ManualGrammarHighlight text={pair.right} ranges={manual} offset={text.lastIndexOf(pair.right)} /> : <Highlighted segments={segments(pair.right)} />}</span></span>
  </span>;
}

/** At most two short paragraphs (goal + rule, then one tip line); very long authored detail still folds away. */
function GrammarExplanation({ paragraphs, language }: { paragraphs: string[]; language: LearnerLessonLanguage }) {
  const [first = "", ...rest] = paragraphs.map((paragraph) => paragraph.trim()).filter(Boolean);
  // A long first paragraph folds after its first sentence; the fold then holds every later paragraph too,
  // so the "Cách dùng chi tiết" toggle is always last and never sits between two visible lines.
  if (first.length > 240) {
    const firstSentence = first.match(/^.*?[.!?](?:\s|$)/u)?.[0]?.trim() ?? "";
    const preview = firstSentence.length <= 240 ? firstSentence : "";
    const detail = [preview ? first.slice(preview.length).trim() : first, ...rest].filter(Boolean);
    return <>{preview ? <p className="lesson-study-explanation">{preview}</p> : null}{detail.length ? <details className="lesson-grammar-detail"><summary>{language === "en" ? "More about this structure" : "Cách dùng chi tiết"}</summary>{detail.map((text, index) => <p className="lesson-study-explanation" key={`${index}-${text}`}>{text}</p>)}</details> : null}</>;
  }
  return <>{[first, ...rest].filter(Boolean).map((paragraph, index) => <GrammarParagraph key={`${index}-${paragraph}`} value={paragraph} language={language} />)}</>;
}

/** Keep existing authored detail available without making Study a wall of text. */
function GrammarParagraph({ value, language }: { value: string; language: LearnerLessonLanguage }) {
  const text = value.trim();
  if (text.length <= 240) return <p className="lesson-study-explanation">{text}</p>;
  const firstSentence = text.match(/^.*?[.!?](?:\s|$)/u)?.[0]?.trim() ?? "";
  const preview = firstSentence.length <= 240 ? firstSentence : "";
  const detail = preview ? text.slice(preview.length).trim() : text;
  return <>{preview ? <p className="lesson-study-explanation">{preview}</p> : null}{detail ? <details className="lesson-grammar-detail"><summary>{language === "en" ? "More about this structure" : "Cách dùng chi tiết"}</summary><p className="lesson-study-explanation">{detail}</p></details> : null}</>;
}

function grammarUsageCopy(value: string, language: LearnerLessonLanguage = "vi"): string {
  const fallback = language === "en"
    ? "Use this structure to express the lesson's target meaning."
    : "Dùng cấu trúc này để diễn đạt ý chính của bài.";
  const localized = lessonGuidanceOrFallback(
    value,
    language,
    fallback
  );
  if (language === "en" || localized === fallback) return localized;
  if (!/^Dùng\s+(?:khi|để)\s+/iu.test(localized)) return localized;
  const cleaned = localized.replace(/^Dùng\s+(?:khi|để)\s+/i, "");
  const explanation = cleaned.replace(/[.!?]+$/u, "");
  return explanation ? `Dùng để ${explanation.charAt(0).toLocaleLowerCase()}${explanation.slice(1)}.` : value.trim();
}

function pronunciationInstructionCopy(value: string, language: LearnerLessonLanguage): string {
  return lessonGuidanceOrFallback(
    value,
    language,
    language === "en" ? "Practise the target sound with the model words below." : "Luyện âm mục tiêu theo các từ mẫu bên dưới."
  );
}

function pronunciationTarget(value: string): string {
  return value.match(/\/[^/]+\//)?.[0] ?? value.trim();
}

function partHeading(part: LessonPart, language: LearnerLessonLanguage = "vi"): string {
  const english = PART_LABELS.en[part.code];
  if (language === "en") return english ?? partDisplayTitle(part, language);
  const title = partDisplayTitle(part, language);
  return english && title.toLocaleLowerCase() !== english.toLocaleLowerCase() ? `${title} · ${english}` : title;
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
  language,
  item,
  itemIndex,
  speak,
  openModal,
  resolveImage,
  hideUmbrella = false
}: {
  cefr: LessonView["lesson"]["cefr"];
  language: LearnerLessonLanguage;
  item: LessonVocabularyItem;
  itemIndex: number;
  speak: (text: string) => void;
  openModal: (state: VocabularyModalState) => void;
  resolveImage?: LearnerCallbacks["resolveLessonVocabularyImage"];
  hideUmbrella?: boolean;
}) {
  const lexicalDetails = item.lexicalDetails ?? [];
  const synonymDetail = lexicalDetails.find((detail) => detail.kind === "synonym");
  const loadImage = () => {
    // A stored image (e.g. the month's frozen illustration) wins over searching for a photo.
    if (item.imageUrl?.trim() && item.imageAttribution) return Promise.resolve({ status: "available", imageUrl: item.imageUrl.trim(), alt: item.word, attribution: item.imageAttribution } as const);
    if (resolveImage) return resolveImage(itemIndex);
    return Promise.resolve({ status: "unavailable" } as const);
  };
  const umbrellaWord = item.umbrella?.word?.trim() ?? "";
  const firstSynonym = item.synonyms?.[0]?.word?.trim() || synonymDetail?.word?.trim() || "";
  const isB1Plus = ["B1", "B2", "C1"].includes(cefr);
  const copy = learnerLessonCopy[language];
  const detailedRelationWords = new Set([
    ...(item.synonyms ?? []).flatMap((value) => typeof value?.word === "string" ? [`synonym:${value.word.trim().toLocaleLowerCase()}`] : []),
    ...(item.antonyms ?? []).flatMap((value) => typeof value?.word === "string" ? [`antonym:${value.word.trim().toLocaleLowerCase()}`] : [])
  ]);
  const extendedRelations: VocabularyRelationChip[] = isB1Plus
    ? lexicalDetails
      .filter((detail) => !detailedRelationWords.has(`${detail.kind}:${detail.word.trim().toLocaleLowerCase()}`))
      .map((detail) => detail.kind === "slang" || detail.kind === "poetic" ? {
        // Slang / poetic synonyms: tinted chip with its tag; a click opens the register modal (no translation).
        tag: lexicalKindLabel(detail.kind, language, detail),
        label: detail.word,
        ariaLabel: `${lexicalKindLabel(detail.kind, language, detail)}: ${detail.word}`,
        tone: "register" as const,
        onClick: () => openModal({ kind: "register", item, detail })
      } : ({
        label: `${lexicalKindLabel(detail.kind, language)} · ${detail.word}`,
        ariaLabel: `${language === "en" ? "Listen" : "Nghe"} ${lexicalKindLabel(detail.kind, language)}: ${detail.word}`,
        tone: detail.kind === "synonym" ? "synonym" as const : detail.kind === "antonym" ? "antonym" as const : detail.kind === "slang" ? "mid" as const : "low" as const,
        onClick: () => speak(detail.word)
      }))
    : [];
  const relations: VocabularyRelationChip[] = [
    ...(!hideUmbrella && item.umbrella && umbrellaWord ? [{ label: `${language === "en" ? copy.vocabulary.umbrellaWord.toUpperCase() : "TỪ BAO TRÙM"} ${umbrellaWord}`, ariaLabel: `${copy.vocabulary.umbrellaWord}: ${umbrellaWord}`, icon: "umbrella" as const, tone: "umb" as const, count: item.umbrella.siblings?.length ?? 0, onClick: () => openModal({ kind: "umbrella", item }) }] : []),
    ...(item.synonyms?.length ? item.synonyms.filter((value): value is NonNullable<typeof value> & { word: string } => typeof value?.word === "string").map(value => {
      const detail = lexicalDetails.find((candidate) => candidate.kind === "synonym" && candidate.word.trim().toLocaleLowerCase() === value.word.trim().toLocaleLowerCase());
      return { label: `= ${value.word}`, ariaLabel: `${language === "en" ? "Listen to synonym" : "Nghe từ đồng nghĩa"}: ${value.word}`, tone: "synonym" as const, onClick: () => playVocabularyWord(speak, value.word, value.audioUrl), ...relationMeaning(value, isB1Plus) };
    }) : synonymDetail && firstSynonym ? [{ label: `= ${firstSynonym}`, ariaLabel: `${language === "en" ? "Listen to synonym" : "Nghe từ đồng nghĩa"}: ${firstSynonym}`, tone: "synonym" as const, onClick: () => speak(firstSynonym) }] : []),
    ...(item.antonyms?.length ? item.antonyms.filter((value): value is NonNullable<typeof value> & { word: string } => typeof value?.word === "string").map(value => {
      const detail = lexicalDetails.find((candidate) => candidate.kind === "antonym" && candidate.word.trim().toLocaleLowerCase() === value.word.trim().toLocaleLowerCase());
      return { label: `≠ ${value.word}`, ariaLabel: `${language === "en" ? "Listen to antonym" : "Nghe từ trái nghĩa"}: ${value.word}`, tone: "antonym" as const, onClick: () => playVocabularyWord(speak, value.word, value.audioUrl), ...relationMeaning(value, isB1Plus) };
    }) : []),
    // Slang / formal sit with the other related words; Word family always closes the row.
    ...extendedRelations,
    ...(item.family?.length ? [{ label: `${language === "en" ? copy.vocabulary.wordFamily : "Họ từ"} (${item.family.length})`, ariaLabel: `${language === "en" ? copy.vocabulary.wordFamily : "Word family"} (${item.family.length})`, icon: "family" as const, tone: "family" as const, onClick: () => openModal({ kind: "family", item }) }] : [])
  ];
  return <SharedVocabularyCard item={item} loadImage={loadImage} speak={speak} relations={relations} language={language} />;
}

/**
 * Meaning popup of a synonym/antonym chip: A1–A2 the Vietnamese meaning (`note`, translate icon);
 * B1–C1 the English `definition` (book icon, 13/11) — never a Vietnamese note from B1. Only synonyms and
 * antonyms get it; the chip itself still plays the word.
 */
function relationMeaning(value: { note?: string | undefined; definition?: string | undefined }, englishOnly: boolean): Pick<VocabularyRelationChip, "meaning" | "meaningLang"> {
  const meaning = (englishOnly ? value.definition : value.note)?.trim();
  return meaning ? { meaning, meaningLang: englishOnly ? "en" : "vi" } : {};
}

export function SharedVocabularyModal({
  state,
  speak,
  language,
  close
}: {
  state: VocabularyModalState;
  speak: (text: string) => void;
  language: LearnerLessonLanguage;
  close: () => void;
}) {
  const { item } = state;
  const copy = learnerLessonCopy[language];
  const labels = {
    family: copy.modal.family,
    synonyms: copy.modal.synonyms,
    antonyms: copy.modal.antonyms,
    umbrella: copy.modal.umbrella,
    lexical: copy.modal.lexical,
    register: copy.modal.register
  } as const;
  // Escape and a tap on the dimmed backdrop close the modal, like every other dialog.
  const closeRef = useRef(close);
  closeRef.current = close;
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => { if (event.key === "Escape") closeRef.current(); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);
  if (typeof document === "undefined") return null;
  return createPortal(<div className="modal-backdrop vocabulary-relation-modal" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) close(); }}>
    <section className="dialog wide" role="dialog" aria-modal="true" aria-label={labels[state.kind]} data-testid={`modal.vocab-${state.kind === "synonyms" ? "all-synonyms" : state.kind === "lexical" ? "lexical-detail" : state.kind}`} data-modal={`vocab-${state.kind === "synonyms" ? "all-synonyms" : state.kind === "lexical" ? "lexical-detail" : state.kind}`}>
      <div className="row between vocabulary-relation-modal-header"><div><div className="eyebrow">{language === "en" ? "Vocabulary" : "Từ vựng"} · {item.word}</div><h2>{labels[state.kind]}</h2></div><button type="button" aria-label={copy.modal.close} onClick={close}>{copy.modal.close}</button></div>
      {state.kind === "family" ? <FamilyModal item={item} speak={speak} language={language} /> : null}
       {state.kind === "synonyms" ? <SynonymsModal item={item} speak={speak} language={language} /> : null}
       {state.kind === "antonyms" ? <SynonymsModal item={item} list={item.antonyms} speak={speak} language={language} /> : null}
      {state.kind === "umbrella" ? <UmbrellaModal item={item} speak={speak} language={language} /> : null}
      {state.kind === "lexical" ? <LexicalModal item={item} speak={speak} language={language} {...(state.detail ? { detail: state.detail } : {})} /> : null}
      {state.kind === "register" ? <RegisterModal item={item} speak={speak} language={language} {...(state.detail ? { detail: state.detail } : {})} /> : null}
    </section>
  </div>, document.body);
}

function FamilyModal({ item, speak, language }: { item: LessonVocabularyItem; speak: (text: string) => void; language: LearnerLessonLanguage }) {
  const copy = learnerLessonCopy[language];
  return <div className="stack" style={{ gap: 10, paddingTop: 8 }} aria-label={language === "en" ? "Word family" : "Các từ cùng họ"}>{item.family?.map((word) => <RelationWordCard key={`${word.word}-${word.type ?? ""}`} word={word} listenLabel={`${copy.modal.listen} ${language === "en" ? "word family" : "từ cùng họ"}: ${word.word}`} speak={speak} language={language} />)}</div>;
}

function SynonymsModal({ item, list, speak, language }: { item: LessonVocabularyItem; list?: LessonVocabularyItem["synonyms"] | undefined; speak: (text: string) => void; language: LearnerLessonLanguage }) {
  const copy = learnerLessonCopy[language];
  const words = list ?? item.synonyms;
  return <div className="stack" style={{ gap: 10 }} aria-label={language === "en" ? "Related words" : "Các từ liên quan"}>{words?.map((word) => <article className="card flat" style={{ minWidth: 0 }} key={word.word}><div className="row between" style={{ gap: 12, alignItems: "flex-start" }}><div style={{ minWidth: 0 }}><b>{word.word}</b><p className="small">{language === "en" ? word.definition : word.note}</p></div><button type="button" style={listenButtonStyle} onClick={() => playVocabularyWord(speak, word.word, word.audioUrl)}><Volume2 size={14} aria-hidden="true" />{copy.modal.listen}</button></div></article>)}</div>;
}

function UmbrellaModal({ item, speak, language }: { item: LessonVocabularyItem; speak: (text: string) => void; language: LearnerLessonLanguage }) {
  const copy = learnerLessonCopy[language];
  if (!item.umbrella) return null;
  const umbrella = item.umbrella;
  const words = (umbrella.siblings ?? []).filter((word) => word.word.trim().toLocaleLowerCase() !== item.word.trim().toLocaleLowerCase());
  return <div className="stack vocabulary-umbrella-content" style={{ gap: 10 }} aria-label={copy.vocabulary.umbrellaWord}>
    <RelationWordCard className="vocabulary-umbrella-summary" ariaLabel={`${copy.vocabulary.umbrellaWord}: ${umbrella.word}`} word={umbrella} listenLabel={`${copy.modal.listen} ${copy.vocabulary.umbrellaWord.toLocaleLowerCase()}: ${umbrella.word}`} speak={speak} language={language} />
    {words.length ? <div className="small muted">{copy.vocabulary.currentAndRelated}</div> : null}
    {words.map((word) => <RelationWordCard key={word.word} word={word} listenLabel={`${copy.modal.listen} ${language === "en" ? "related word" : "từ cùng nhóm"}: ${word.word}`} speak={speak} language={language} />)}
  </div>;
}

/**
 * One word of the umbrella / word-family modals, in the Slang & poetic card
 * layout (13/11): "word · part of speech", IPA when the data has it, Listen,
 * then its meaning. A1–A2 show the Vietnamese meaning; B1+ only the English
 * definition — no Vietnamese from B1: without a definition the card shows the
 * word, part of speech and IPA with no meaning line.
 * No kind tag and no usage / source line. Used by the learner lesson, the
 * operator lesson preview and the operator vocabulary card alike.
 */
const RELATION_NAMES_AS_TYPE = new Set(["word_family", "word family", "umbrella", "synonym", "antonym", "collocation", "family"]);
/** The part of speech to show; a relation name stored as the type ("word_family") is a data slip, never shown. */
function wordClassLabel(type: string | undefined): string | undefined {
  const value = type?.trim();
  return value && !RELATION_NAMES_AS_TYPE.has(value.toLowerCase()) ? value : undefined;
}

function RelationWordCard({ word, listenLabel, speak, language, className, ariaLabel }: {
  word: { word: string; type?: string | undefined; meaning?: string | undefined; definition?: string | undefined; pronunciation?: string | undefined; audioUrl?: string | undefined };
  listenLabel: string;
  speak: (text: string) => void;
  language: LearnerLessonLanguage;
  className?: string;
  ariaLabel?: string;
}) {
  const copy = learnerLessonCopy[language];
  const meaning = (language === "en" ? word.definition : word.meaning)?.trim();
  const ipa = word.pronunciation?.trim();
  return <article className={`card flat vocabulary-relation-word-card${className ? ` ${className}` : ""}`} style={{ minWidth: 0 }} {...(ariaLabel ? { "aria-label": ariaLabel } : {})}>
    <div className="row between" style={{ gap: 12, alignItems: "flex-start" }}>
      <div style={{ minWidth: 0 }}>
        <b>{word.word}</b>{wordClassLabel(word.type) ? <span className="small muted"> · {wordClassLabel(word.type)}</span> : null}
        {ipa ? <div className="small muted vocabulary-register-ipa">{ipa}</div> : null}
      </div>
      <button type="button" aria-label={listenLabel} style={listenButtonStyle} onClick={() => playVocabularyWord(speak, word.word, word.audioUrl)}><Volume2 size={14} aria-hidden="true" />{copy.modal.listen}</button>
    </div>
    {meaning ? <p className="small">{meaning}</p> : null}
  </article>;
}

function playVocabularyWord(speak: (text: string) => void, word: string, audioUrl?: string) {
  if (audioUrl?.trim()) {
    playExclusiveMedia(audioUrl.trim(), () => speak(word));
    return;
  }
  speak(word);
}

function LexicalModal({ item, detail, speak, language }: { item: LessonVocabularyItem; detail?: LessonVocabularyLexicalDetail; speak: (text: string) => void; language: LearnerLessonLanguage }) {
  const copy = learnerLessonCopy[language];
  const details = item.lexicalDetails ?? [];
  const [selected, setSelected] = useState<LessonVocabularyLexicalDetail | null>(detail ?? null);
  if (!details.length) return <Notice tone="info">{copy.vocabulary.meaningUnavailable}</Notice>;
  const active = selected ?? details[0]!;
  return <div className="stack" style={{ gap: 12 }}><div className="row" style={{ flexWrap: "wrap", gap: 8 }}>{details.map((candidate) => <button className={candidate === active ? "btn-primary" : ""} type="button" key={`${candidate.kind}-${candidate.word}`} onClick={() => setSelected(candidate)}>{lexicalKindLabel(candidate.kind, language, candidate)} · {candidate.word}</button>)}</div><article className="card flat"><div className="row between" style={{ gap: 12, alignItems: "flex-start" }}><div style={{ minWidth: 0 }}><div className="eyebrow">{lexicalKindLabel(active.kind, language, active)}</div><h3>{active.word}</h3></div></div>{active.definition ? <p><b>{copy.modal.definition}:</b> {active.definition}</p> : null}{active.example ? <p><b>{copy.modal.example}:</b> {active.example}</p> : null}{active.context ? <p><b>{copy.modal.context}:</b> {active.context}</p> : null}{active.note ? <p><b>{copy.modal.note}:</b> {active.note}</p> : null}{active.source ? <p className="small muted">{copy.modal.source}: {active.source}</p> : null}</article></div>;
}

/**
 * Slang / poetic synonyms (12/11): one card per word (word · part of speech,
 * British IPA, Listen, English definition, then the slang usage note or the
 * poetic source note). English only — no translation at B1+. Items stored
 * before 12/11 (no IPA / usage / source) show their definition and register
 * label as before.
 */
function RegisterModal({ item, detail, speak, language }: { item: LessonVocabularyItem; detail?: LessonVocabularyLexicalDetail; speak: (text: string) => void; language: LearnerLessonLanguage }) {
  const copy = learnerLessonCopy[language];
  const all = (item.lexicalDetails ?? []).filter((candidate) => candidate.kind === "slang" || candidate.kind === "poetic");
  const words = detail ? [...all.filter((candidate) => candidate === detail || (candidate.kind === detail.kind && candidate.word === detail.word)), ...all.filter((candidate) => !(candidate === detail || (candidate.kind === detail.kind && candidate.word === detail.word)))] : all;
  if (!words.length) return <Notice tone="info">{copy.vocabulary.meaningUnavailable}</Notice>;
  return <div className="stack" style={{ gap: 10, paddingTop: 8 }} aria-label={copy.modal.register}>{words.map((word) => {
    const label = lexicalKindLabel(word.kind, language, word);
    const legacy = isLegacyRegisterDetail(word);
    return <article className="card flat vocabulary-register-card" style={{ minWidth: 0 }} key={`${word.kind}-${word.word}`} data-register-kind={word.kind}>
      <div className="row between" style={{ gap: 12, alignItems: "flex-start" }}>
        <div style={{ minWidth: 0 }}>
          <div className="eyebrow">{label}</div>
          <b>{word.word}</b>{wordClassLabel(word.type) ? <span className="small muted"> · {wordClassLabel(word.type)}</span> : null}
          {word.ipa ? <div className="small muted vocabulary-register-ipa">{word.ipa}</div> : null}
        </div>
        <button type="button" aria-label={`${copy.modal.listen} ${label.toLocaleLowerCase()}: ${word.word}`} style={listenButtonStyle} onClick={() => speak(word.word)}><Volume2 size={14} aria-hidden="true" />{copy.modal.listen}</button>
      </div>
      {word.definition ? <p className="small">{word.definition}</p> : null}
      {word.kind === "slang" && word.usage ? <p className="small"><b>{copy.modal.usage}:</b> {word.usage}</p> : null}
      {word.kind === "poetic" && word.source && !legacy ? <p className="small"><b>{copy.modal.foundIn}:</b> {word.source}</p> : null}
      {legacy && word.context ? <p className="small muted">{word.context}</p> : null}
    </article>;
  })}</div>;
}

/** A slang / poetic detail stored before 12/11 (its "poetic" meant formal register). */
function isLegacyRegisterDetail(detail: LessonVocabularyLexicalDetail): boolean {
  return (detail.kind === "slang" || detail.kind === "poetic") && !detail.ipa?.trim() && !detail.usage?.trim() && !detail.source?.trim();
}

function lexicalKindLabel(kind: LessonVocabularyLexicalDetail["kind"], language: LearnerLessonLanguage = "vi", detail?: LessonVocabularyLexicalDetail): string {
  // Legacy "poetic" items were formal-register words and keep their old label.
  const legacyFormal = kind === "poetic" && (!detail || isLegacyRegisterDetail(detail));
  if (language === "en") return kind === "synonym" ? "Synonym" : kind === "antonym" ? "Antonym" : kind === "slang" ? "Slang" : legacyFormal ? "Formal" : "Poetic";
  return kind === "synonym" ? "Đồng nghĩa" : kind === "antonym" ? "Trái nghĩa" : kind === "slang" ? "Khẩu ngữ" : legacyFormal ? "Văn phong" : "Văn chương";
}

