import { useState } from "react";
import type {
  AssessmentLevelFormSlotView,
  AssessmentReviewOverviewView,
  ContentLessonMatrixView,
  ContentLessonSetVersionView,
  ContentPromptSettingsView,
  ContentReviewView,
  ContentWeekFrameView
} from "@e4s/contracts";
import type {
  Cefr,
  OperatorDashboardView,
  OperatorLessonSetView,
  OperatorLessonsView,
  OperatorLevelFormsView,
  OperatorPromptsView,
  OperatorReviewView,
  OperatorWeeksView,
  PromptKey,
  ReviewAppeal,
  ReviewSubmission,
  WeekSuggestion
} from "./types.js";
import { Check } from "lucide-react";

const CEFR_LEVELS: Cefr[] = ["A1", "A2", "B1", "B2", "C1"];
const REVIEW_TAB_MAP = { submissions: "subs", coach: "coach", micro: "micro", appeals: "appeals", attempts: "attempts", assessments: "tests" } as const;
const PROMPT_KEY_MAP: Record<string, PromptKey> = {
  system_rules: "base",
  assessment_scoring: "placement",
  weekly_lessons: "lesson",
  week_suggestions: "weeks",
  micro_grading: "mgrade",
  coach_dialogue: "coach",
  weekly_practice_grading: "grade"
};
const PROMPT_LABELS: Record<PromptKey, string> = {
  base: "Quy tắc chung (mọi lời gọi trừ sinh bài siêu ngắn)",
  placement: "Chấm test & xếp trình độ",
  lesson: "Sinh 5 bài siêu ngắn cho tuần (giữ nguyên các biến {n} {cefr_level} {topic} {job} {learning_style} {explain_lang} và key JSON lessons[].day/title/objective/theory/vocab/pron/listening/reading/speaking/practice)",
  weeks: "Gợi ý khung chủ đề tuần (giữ các biến {n} {learners} {levels} {used} và key weeks[].week/options[].topic/description/objectives/keyVocabHint/levels[].cefr/days[5])",
  mgrade: "Chấm bài thực hành siêu ngắn (giữ các biến {cefr_level} {explain_lang} {theory} {vocab} {practice} {answer} và key score/ok/feedback/fix)",
  coach: "AI coach hội thoại",
  grade: "Chấm bài thực hành thứ Sáu"
};
const REQUIRED_LESSON_PARTS = ["objective", "instruction", "vocabulary", "grammar", "pronunciation", "listening", "reading", "writing", "speaking"] as const;

function operatorCalendarDate(value: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  return match ? `${match[3]}/${match[2]}` : value;
}

export function operatorDateTime(value: string | null | undefined): string {
  if (!value) return "—";
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return value;
  const pad = (part: number) => String(part).padStart(2, "0");
  return `${pad(date.getDate())}/${pad(date.getMonth() + 1)} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function persistedPracticeAnswer(practiceLabel: string): string {
  const match = practiceLabel.match(/(?:^|·)\s*đáp án:\s*(.+)$/i);
  return match?.[1]?.trim() ?? "";
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : undefined;
}

function asArray(value: unknown): unknown[] | undefined {
  return Array.isArray(value) ? value : undefined;
}

function lessonSetWarnings(source: ContentLessonSetVersionView): OperatorLessonSetView["warnings"] {
  let incomplete = 0;
  let phrases = 0;
  let details = 0;
  for (const lesson of source.lessons) {
    const parts = new Map(lesson.parts.map(part => [part.code, part]));
    if (REQUIRED_LESSON_PARTS.some(code => !parts.has(code))) incomplete += 1;

    const vocabulary = asRecord(parts.get("vocabulary")?.content);
    const items = asArray(vocabulary?.items)?.map(asRecord).filter((item): item is Record<string, unknown> => item !== undefined) ?? [];
    if (items.length > 0 && items.some(item => {
      const phrases = asArray(item.collocations ?? item.examples);
      return !phrases || phrases.length < 3;
    })) phrases += 1;

    const listeningOptions = asArray(asRecord(parts.get("listening")?.content)?.options);
    const readingOptions = asArray(asRecord(parts.get("reading")?.content)?.options);
    const missingNewParts = !parts.has("word_class") || !parts.has("word_use");
    const shortQuestions = !listeningOptions || listeningOptions.length < 4 || !readingOptions || readingOptions.length < 4;
    const missingWordDetails = items.some(item => !Array.isArray(item.synonyms) || !Array.isArray(item.antonyms) || typeof item.wordFamily !== "string");
    if (missingNewParts || shortQuestions || missingWordDetails) details += 1;
  }
  return { incomplete, level: [], phrases, details };
}

export interface DashboardAdapterContext {
  currentWeek?: number;
  pilotWeeks?: number;
  topic?: string | null;
  aiConnected: boolean;
  aiConfigured?: boolean;
  aiProvider?: string | null;
  openAppeals: number;
  rescoreBusy?: string | undefined;
  placementDetails?: Record<string, {
    total: number;
    rawLevel: Cefr;
    sectionScores: Array<{ label: string; percent: number; heuristic?: boolean }>;
    rationale?: string | null;
    monthlyGoal?: string | null;
    profileSummary?: string | null;
    aiScored?: boolean;
  }>;
  levelRequestDetails?: Record<string, { from: Cefr; to: Cefr }>;
}

export function adaptAssessmentOverview(source: AssessmentReviewOverviewView, context: DashboardAdapterContext): OperatorDashboardView {
  const mapUnassessed = (item: AssessmentReviewOverviewView["unassessedLearners"][number]) => ({ id: item.learnerId, name: item.learnerName, hasProfile: item.profileComplete, profileSummary: item.profileComplete ? "Đã điền hồ sơ" : "Chưa điền hồ sơ" });
  return {
    week: {
      ...(context.currentWeek == null ? {} : { current: context.currentWeek }),
      ...(context.pilotWeeks == null ? {} : { total: context.pilotWeeks }),
      ...(context.topic === undefined ? {} : { topic: context.topic })
    },
    aiConnected: context.aiConnected,
    ...(context.aiConfigured === undefined ? {} : { aiConfigured: context.aiConfigured }),
    ...(context.aiProvider === undefined ? {} : { aiProvider: context.aiProvider }),
    openAppeals: context.openAppeals,
    windowDays: source.levelSignals.windowDays,
    topicReports: (source.topicReports ?? []).filter(report => report.status === "open").map(report => ({ id: report.id, learnerName: report.learnerName, at: operatorDateTime(report.createdAt), inputs: [{ input: report.topic, reason: report.reason }] })),
    pending: source.pendingAssessments.map(item => {
      const detail = context.placementDetails?.[item.attemptId];
      const labels: Record<string, string> = { listening: "Nghe", reading: "Đọc", writing: "Viết", speaking: "Nói" };
      const detailScores = new Map((detail?.sectionScores ?? []).map(score => [score.label.toLowerCase(), score]));
      const sectionScores = (["listening", "reading", "writing", "speaking"] as const).map((key) => {
        const label = labels[key]!;
        const score = detailScores.get(label.toLowerCase()) ?? detailScores.get(key);
        return {
          label,
          percent: Number(score?.percent ?? item.sectionScores[key] ?? 0),
          ...(score?.heuristic ? { heuristic: true } : {})
        };
      });
      return { id: item.attemptId, learnerId: item.learnerId, name: item.learnerName, submittedAt: operatorDateTime(item.submittedAt), total: detail?.total, rawLevel: detail?.rawLevel, aiSuggestedCefr: item.suggestedLevel as Cefr | null, sectionScores, rationale: detail?.rationale, monthlyGoal: detail?.monthlyGoal, profileSummary: detail?.profileSummary ?? (item.profileComplete === undefined ? undefined : item.profileComplete ? "Đã điền hồ sơ" : "Chưa điền hồ sơ"), suggestedLevel: (item.suggestedLevel ?? detail?.rawLevel) as Cefr | undefined, levels: CEFR_LEVELS, aiScored: detail?.aiScored, canRescore: true, rescoreBusy: context.rescoreBusy === item.attemptId };
    }),
    levelRequests: source.pendingLevelUp.map(item => {
      const levels = context.levelRequestDetails?.[item.attemptId];
      return { id: item.attemptId, learnerName: item.learnerName, from: levels?.from, to: levels?.to ?? item.suggestedLevel as Cefr | undefined, sentAt: operatorDateTime(item.submittedAt), testSummary: context.placementDetails?.[item.attemptId] ? `${context.placementDetails[item.attemptId]!.total}/100` : null, testId: item.attemptId, challengeId: item.challenge ? item.attemptId : null, challengeSummary: item.challenge ? `${item.challenge.average}/5 · ${item.challenge.offTopic} lạc đề` : null };
    }),
    ready: source.levelSignals.ready.map(item => ({ id: item.learnerId, name: item.learnerName, cefr: item.currentLevel as Cefr, target: item.targetLevel as Cefr, metrics: item.metrics.map(metric => `${metric.label} ${metric.display}`).join(" · ") })),
    weak: source.levelSignals.weak.map(item => ({ id: item.learnerId, name: item.learnerName, cefr: item.currentLevel as Cefr, metrics: item.wrongWeeks.map(week => `tuần ${week.weekNumber}: ${week.wrongPercent}% sai (${week.partCount} phần)`).join(" · ") })),
    inFlow: (source.levelSignals.inFlow ?? []).map(item => ({ id: item.learnerId, name: item.learnerName, cefr: item.currentLevel as Cefr, target: item.targetLevel as Cefr, metrics: item.metrics, testId: item.assessmentAttemptId, challengeId: item.challengeAttemptId })),
    approved: source.approvedLearners.map(item => ({ id: item.learnerId, name: item.learnerName, cefr: item.currentLevel as Cefr, placementScore: item.placementScore, monthlyGoal: item.monthlyGoal })),
    unassessed: source.unassessedLearners.map(mapUnassessed),
    inProgress: (source.inProgressLearners ?? []).map(mapUnassessed),
    retry: (source.retryLearners ?? []).map(mapUnassessed)
  };
}

function compactPlanTitle(value: string, topic: string): string {
  const cleaned = value.replace(/^T[2-6]\s*[:.\-–]?\s*/i, "").replace(/\s*\(kế hoạch\)\s*$/i, "").trim();
  const words = cleaned.split(/\s+/).filter(Boolean);
  if (words.length <= 8 && cleaned.length <= 56) return cleaned;
  const subject = topic.trim().split(/\s+/).slice(0, 2).join(" ") || "Weekly";
  const lower = cleaned.toLocaleLowerCase();
  if (/(từ vựng|vocabulary|words?)/i.test(lower)) return `${subject} vocabulary`;
  if (/(viết|write|email|tóm tắt)/i.test(lower)) return `${subject} writing`;
  if (/(nghe|listen|audio)/i.test(lower)) return `${subject} listening`;
  if (/(đọc|read|reading)/i.test(lower)) return `${subject} reading`;
  if (/(hỏi|ask|question|trả lời)/i.test(lower)) return `${subject} questions`;
  if (/(đóng vai|role-play|role play)/i.test(lower)) return `${subject} role-play`;
  return words.slice(0, 7).join(" ") + (words.length > 7 ? "…" : "");
}

export function adaptLevelForms(slots: AssessmentLevelFormSlotView[], options: { aiConnected: boolean; generatingTarget?: Cefr | null; generateError?: string | null }): OperatorLevelFormsView {
  return {
    aiConnected: options.aiConnected,
    generatingTarget: options.generatingTarget ?? null,
    generateError: options.generateError,
    targets: slots.map(slot => ({
      target: slot.targetLevel as Exclude<Cefr, "A1">,
      forms: [slot.publishedForm, slot.draftForm].filter(form => form != null).map(form => ({ id: form!.versionId, title: form!.title, status: form!.status === "published" ? "approved" : "draft", createdAt: form!.publishedAt ? operatorDateTime(form!.publishedAt) : `v${form!.version}`, byName: form!.status === "published" ? "Đã phát hành" : "Bản nháp", listeningQuestions: form!.listeningTaskCount, readingQuestions: form!.readingTaskCount, attempts: form!.attemptCount, inUse: form!.status === "published" }))
    }))
  };
}

export function adaptWeeks(source: ContentWeekFrameView, options: { aiConnected: boolean; status?: string; suggestions?: Record<number, WeekSuggestion>; saveState?: OperatorWeeksView["saveState"]; saveError?: string | null }): OperatorWeeksView {
  return { pilotStartDate: operatorCalendarDate(source.pilot.startDate), pilotWeeks: source.pilot.weekCount, aiConnected: options.aiConnected, status: options.status ?? "", saveState: options.saveState, saveError: options.saveError, weeks: source.weeks.map(week => ({ number: week.weekNumber, dateRange: `${operatorCalendarDate(week.startDate)} – ${operatorCalendarDate(week.endDate)}`, current: week.current, topic: week.topic, description: week.description, objectives: week.objectives, keyVocabHint: week.keyVocabHint, suggestion: options.suggestions?.[week.weekNumber] })) };
}

export function adaptLessonMatrix(source: ContentLessonMatrixView, options: { aiConnected: boolean; extraLevels?: Cefr[]; generating?: OperatorLessonsView["generating"]; generateError?: string | null }): OperatorLessonsView {
  return { aiConnected: options.aiConnected, extraLevels: options.extraLevels ?? CEFR_LEVELS.filter(level => !source.levels.some(item => item.cefr === level)), levels: source.levels.map(level => ({ cefr: level.cefr as Cefr, learnerCount: level.learnerCount })), generating: options.generating, generateError: options.generateError, weeks: source.weeks.map(week => ({ number: week.weekNumber, topic: week.topic, cells: week.cells.map(cell => ({ cefr: cell.cefr as Cefr, status: cell.status === "published" ? "approved" : cell.status === "missing" ? "empty" : "draft", generatedAt: operatorDateTime(cell.updatedAt), incomplete: cell.lessons.length > 0 && cell.lessons.length < 5, lessons: cell.lessons.length, days: [1, 2, 3, 4, 5].map((day, index) => { const lesson = cell.lessons.find(candidate => candidate.dayNumber === day); return { day: ["T2", "T3", "T4", "T5", "T6"][index]!, title: lesson?.title ?? (cell.plan?.[index] ? compactPlanTitle(cell.plan[index]!, week.topic) : null), planned: !lesson && Boolean(cell.plan?.[index]) }; }) })) })) };
}

export function adaptLessonSet(source: ContentLessonSetVersionView, options: { aiConnected: boolean; warnings?: OperatorLessonSetView["warnings"]; mutationState?: OperatorLessonSetView["mutationState"]; mutationMessage?: string | null }): OperatorLessonSetView {
  return {
    week: source.weekNumber, cefr: source.cefr as Cefr, status: source.status === "published" ? "approved" : "draft", topic: source.topic, explanationLanguage: source.explanationLanguage === "Tiếng Việt" ? "tiếng Việt" : "tiếng Anh", aiConnected: options.aiConnected, mutationState: options.mutationState, mutationMessage: options.mutationMessage,
    warnings: options.warnings ?? lessonSetWarnings(source),
    lessons: source.lessons.map(lesson => ({ id: lesson.id, day: lesson.dayNumber, dayLabel: ["T2", "T3", "T4", "T5", "T6"][lesson.dayNumber - 1] ?? `Bài ${lesson.dayNumber}`, title: lesson.title, durationMin: lesson.durationMinutes, practiceKind: lesson.practiceLabel.includes("điền") ? "điền từ" : lesson.practiceLabel.includes("trắc") ? "trắc nghiệm" : "tự viết", practiceAnswer: persistedPracticeAnswer(lesson.practiceLabel), complete: REQUIRED_LESSON_PARTS.every(code => lesson.parts.some(part => part.code === code)), content: <OperatorLessonPreview parts={lesson.parts} /> }))
  };
}

const learnerStudyCodes = new Set(["objective", "instruction", "vocabulary", "grammar", "pronunciation"]);

function OperatorLessonPreview({ parts }: { parts: ContentLessonSetVersionView["lessons"][number]["parts"] }) {
  const [tab, setTab] = useState<"study" | "practice">("study");
  const visible = parts.filter(part => tab === "study" ? learnerStudyCodes.has(part.code) : !learnerStudyCodes.has(part.code));
  return <div className="operator-lesson-preview lesson-page"><div className="lesson-surface"><div className="lesson-skill-map" aria-label="Kỹ năng trong bài">{parts.filter(part => part.code !== "objective" && part.code !== "instruction").map(part => <span data-kind={learnerStudyCodes.has(part.code) ? "study" : "practice"} key={part.code}>{part.title}</span>)}</div><div className="ltabs" role="tablist" aria-label="Các bước trong bài học"><button type="button" className={tab === "study" ? "active" : ""} role="tab" aria-selected={tab === "study"} onClick={() => setTab("study")}>1. Học</button><button type="button" className={tab === "practice" ? "active" : ""} role="tab" aria-selected={tab === "practice"} onClick={() => setTab("practice")}>2. Bài tập</button></div><div className="lesson-parts" aria-label={tab === "study" ? "Nội dung học" : "Nội dung bài tập"}>{visible.map((part, index) => <section className={`card lesson-part lesson-part--${part.code}`} key={part.code}><div className="row between"><h2>{index + 1}. {part.title}</h2></div>{renderLessonPart(part.code, part.content)}</section>)}</div></div></div>;
}

function renderLessonPart(code: string, value: unknown) {
  const content = asRecord(value) ?? {};
  const text = (...keys: string[]) => keys.map(key => content[key]).find(item => typeof item === "string") as string | undefined;
  const strings = (key: string) => (asArray(content[key]) ?? []).filter((item): item is string => typeof item === "string");
  if (code === "objective") return <p className="small">{text("text") || "—"}</p>;
  if (code === "instruction") return <PreviewList values={strings("steps")} />;
  if (code === "vocabulary") {
    const items = (asArray(content.items) ?? []).map(asRecord).filter((item): item is Record<string, unknown> => item !== undefined);
    return <div className="vocabulary-list">{items.map((item, index) => <article className="word-card" key={`${String(item.word)}-${index}`}><h3>{String(item.word ?? "—")}</h3>{item.pronunciation ? <span className="ipa">{String(item.pronunciation)}</span> : null}<p>{String(item.meaning ?? "")}</p><PreviewList values={(asArray(item.collocations ?? item.examples) ?? []).filter((entry): entry is string => typeof entry === "string")} /></article>)}</div>;
  }
  if (code === "grammar") return <div className="small"><p>{text("formula", "theory") || "—"}</p>{text("usage") && <p className="muted">{text("usage")}</p>}<PreviewList values={strings("examples")} /></div>;
  if (code === "pronunciation") return <div className="small"><p><b>{text("focus") || "—"}</b>{strings("words").length ? ` · ${strings("words").join(" · ")}` : ""}</p><p>{text("instruction", "tip")}</p></div>;
  if (code === "listening" || code === "reading") return <div className="small"><p>{text(code === "listening" ? "script" : "text", "passage") || "—"}</p><p><b>Câu hỏi:</b> {text("prompt", "question") || "—"}</p><AnswerOptions options={strings("options")} answer={text("answer")} /></div>;
  if (code === "writing") return <div className="small"><p><b>Đề bài:</b> {text("prompt") || "—"}</p><AnswerOptions options={strings("options")} answer={text("answer")} /></div>;
  if (code === "speaking") return <div className="small"><p>{text("instruction")}</p><p><b>Câu mẫu:</b> {text("sample", "prompt") || "—"}</p></div>;
  return <div className="small">{humanizeContent(content)}</div>;
}

function PreviewList({ values }: { values: string[] }) { return values.length ? <ul className="small">{values.map((value, index) => <li key={`${value}-${index}`}>{value}</li>)}</ul> : <p className="small muted">—</p>; }
function AnswerOptions({ options, answer }: { options: string[]; answer?: string | undefined }) { return options.length ? <ol className="operator-answer-options">{options.map((option, index) => <li key={`${option}-${index}`}>{option === answer ? <><Check className="operator-inline-icon" size={15} strokeWidth={2.5} aria-hidden="true" />{option}</> : option}</li>)}</ol> : answer ? <p><b>Đáp án:</b> {answer}</p> : null; }
function humanizeContent(content: Record<string, unknown>): string { return Object.values(content).flatMap(value => Array.isArray(value) ? value : [value]).filter(value => typeof value === "string" || typeof value === "number").join(" · ") || "—"; }

export interface ReviewAdapterDetails {
  aiConnected?: boolean;
  submissions?: Record<string, Pick<ReviewSubmission, "cefr" | "type" | "task">>;
  coach?: Record<string, { cefr: Cefr; week: number; sessionId: string }>;
  microLessons?: Record<string, { job: string; learningStyle: string; practiceType: string; practiceAnswer?: string }>;
  appeals?: Record<string, Partial<Omit<ReviewAppeal, "id" | "learnerName" | "reason" | "status" | "at" | "decidedSummary">>>;
  tests?: Record<string, { rawLevel?: Cefr; aiSuggestedCefr?: Cefr | null }>;
}

export function adaptReview(source: ContentReviewView, activeTab: keyof typeof REVIEW_TAB_MAP, options: ReviewAdapterDetails = {}): OperatorReviewView {
  const counts = { subs: 0, coach: 0, micro: 0, appeals: 0, attempts: 0, tests: 0 };
  source.tabs.forEach(tab => { counts[REVIEW_TAB_MAP[tab.key]] = tab.unreadCount ?? tab.count; });
  return {
    activeTab: REVIEW_TAB_MAP[activeTab], counts, aiConnected: options.aiConnected,
    submissions: source.submissions.map(item => { const detail = options.submissions?.[item.id]; return { id: item.id, learnerName: item.learnerName, cefr: (item.cefr ?? detail?.cefr) as Cefr | undefined, week: item.weekNumber, type: item.type ?? detail?.type, submittedAt: operatorDateTime(item.submittedAt), operatorChecked: item.checked, task: item.task ?? detail?.task, text: item.text, total: item.total, rubric: item.rubric.meaning == null || item.rubric.vocabulary == null || item.rubric.grammar == null ? null : { meaning: item.rubric.meaning, vocab: item.rubric.vocabulary, grammar: item.rubric.grammar }, ...(item.aiGraded === undefined ? {} : { aiGraded: item.aiGraded }), feedback: item.feedback, suggestions: item.suggestions.map(text => ({ original: "", corrected: text, explanation: "" })) }; }),
    coachTurns: source.coachSamples.map(item => { const detail = options.coach?.[item.id]; return { id: item.id, sessionId: detail?.sessionId ?? item.id, learnerName: item.learnerName, cefr: (item.cefr ?? detail?.cefr) as Cefr | undefined, week: item.weekNumber ?? detail?.week, at: operatorDateTime(item.createdAt), checked: item.checked, userText: item.learnerText, reply: item.coachText, rubric: item.scores.meaning == null || item.scores.vocabulary == null || item.scores.grammar == null ? null : { meaning: item.scores.meaning, vocab: item.scores.vocabulary, grammar: item.scores.grammar }, suggestions: item.suggestions.map(text => ({ original: "", corrected: text, explanation: "" })) }; }),
    microLessons: source.microLessons.map(item => { const detail = options.microLessons?.[item.id]; return { id: item.id, learnerName: item.learnerName, cefr: item.cefr as Cefr, date: operatorDateTime(item.generatedAt), topic: item.topic, completed: item.completed, theory: item.theory, vocabulary: item.vocabulary.join(" · "), practiceType: detail?.practiceType, practiceText: item.practice, practiceAnswer: detail?.practiceAnswer, learnerAnswer: item.answer ?? undefined, job: detail?.job, learningStyle: detail?.learningStyle }; }),
    appeals: source.appeals.map(item => ({ id: item.id, learnerName: item.learnerName, at: operatorDateTime(item.createdAt), status: item.status, reason: item.reason, decidedSummary: item.resolution || null, ...options.appeals?.[item.id] })),
    attempts: source.lessonAttempts.map(item => ({ id: item.id, learnerName: item.learnerName, cefr: item.cefr as Cefr | undefined, lesson: `Tuần ${item.weekNumber} · T${item.dayNumber + 1} · ${item.lessonTitle}`, listening: String(item.attempts.listening ?? "chưa làm"), reading: String(item.attempts.reading ?? "chưa làm"), writing: String(item.attempts.writing ?? "chưa làm"), speaking: String(item.attempts.speaking ?? "chưa làm"), total: Object.values(item.attempts).reduce((sum, value) => sum + (value ?? 0), 0) })),
    tests: source.assessments.map(item => ({ id: item.id, learnerName: item.learnerName, kind: item.kind, submittedAt: item.submittedAt ? operatorDateTime(item.submittedAt) : undefined, total: item.totalScore ?? undefined, ...options.tests?.[item.id] }))
  };
}

export function adaptPrompts(source: ContentPromptSettingsView, options: { saveState?: OperatorPromptsView["saveState"]; saveError?: string | null } = {}): OperatorPromptsView {
  return { saveState: options.saveState, saveError: options.saveError, prompts: source.groups.map(group => {
    const key = PROMPT_KEY_MAP[group.key];
    if (!key) throw new Error(`Unknown content prompt key: ${group.key}`);
    return [key, PROMPT_LABELS[key], group.content];
  }) };
}
