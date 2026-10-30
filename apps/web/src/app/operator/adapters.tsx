import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { lexicalRelationCoverageSatisfied, relationExemptionIsCredible } from "@e4s/domain/content";
import { cancelExclusiveAudio, claimExclusiveAudio } from "../../features/experience/audio-precedence.js";
import type {
  AssessmentLevelFormSlotView,
  AssessmentReviewOverviewView,
  ContentLessonMatrixView,
  ContentLessonSetVersionView,
  ContentImageView,
  LessonVocabularyItem,
  ContentPromptSettingsView,
  ContentReviewView,
  ContentWeekFrameView
} from "@e4s/contracts";
import type {
  Cefr,
  LessonSetActionKey,
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
import { Check, Mic, Square, Volume2 } from "lucide-react";
import { VocabularyCard as SharedVocabularyCard, type VocabularyRelationChip } from "../shared/lesson/VocabularyCard.js";
import { conciseGrammarExample, conciseLessonObjective, conciseSpeakingModel, learnerFacingObjective, learnerFacingObjectiveBody, learnerObjectiveLead } from "../shared/lesson/presentation.js";
import { lessonInstructionSteps } from "../shared/lesson/instructions.js";
import { learnerLessonLanguageForCefr, lessonCopyForCefr, type LearnerLessonLanguage } from "../shared/lesson/language.js";
import { lessonPartsForTab, lessonPracticeCodes, sharedLessonGrammarAvailable } from "../shared/lesson/structure.js";
import { LessonPromptText, normalizeLessonBlankPrompt, SharedLessonPartContent, SharedVocabularyModal, type VocabularyModalState } from "../learner/Learning.js";

const CEFR_LEVELS: Cefr[] = ["A1", "A2", "B1", "B2", "C1"];
const REVIEW_TAB_MAP = { submissions: "subs", coach: "coach", weekly_practices: "weekly", appeals: "appeals", attempts: "attempts", assessments: "tests" } as const;
const PROMPT_KEY_MAP: Record<string, PromptKey> = {
  system_rules: "base",
  assessment_scoring: "placement",
  weekly_lessons: "lesson",
  week_suggestions: "weeks",
  coach_dialogue: "coach",
  weekly_practice_grading: "grade"
};
const PROMPT_LABELS: Record<PromptKey, string> = {
  base: "Quy tắc chung",
  placement: "Chấm test & xếp trình độ",
  lesson: "Sinh đúng 5 bài T2–T6 theo schema lessons[].dayNumber/title/durationMinutes/parts[] gồm đúng 11 phần; tiêu đề là công thức khung câu; từ vựng phải có cụm từ, họ từ, từ bao trùm, đồng nghĩa và trái nghĩa; phần nghe phải có audio cùng 4 lựa chọn.",
  weeks: "Gợi ý khung chủ đề tuần (giữ các biến {n} {learners} {levels} {used} và key weeks[].week/options[].topic/description/objectives/keyVocabHint/levels[].cefr/days[5])",
  coach: "AI coach hội thoại",
  grade: "Chấm bài thực hành thứ Sáu"
};
const REQUIRED_LESSON_PARTS = ["objective", "instruction", "vocabulary", "grammar", "pronunciation", "listening", "reading", "writing", "word_class", "word_use", "speaking"] as const;
const LESSON_PART_LABELS: Record<typeof REQUIRED_LESSON_PARTS[number], string> = {
  objective: "Mục tiêu bài học",
  instruction: "Hướng dẫn",
  vocabulary: "Từ vựng",
  grammar: "Ngữ pháp",
  pronunciation: "Phát âm",
  listening: "Bài nghe",
  reading: "Bài đọc",
  writing: "Bài viết",
  word_class: "bài tập Từ loại",
  word_use: "bài tập Dùng từ",
  speaking: "Bài nói"
};

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

function pronunciationTargetFromFocus(value: string): string {
  return value.match(/\/([^/]+)\//u)?.[1]?.trim() ?? "";
}

function ipaContainsTarget(ipa: string, target: string): boolean {
  const normalizedIpa = ipa.replaceAll("/", "").replace(/[ˈˌ\s]/gu, "");
  const normalizedTarget = target.replaceAll("/", "").replace(/[ˈˌ\s]/gu, "");
  if (!normalizedIpa || !normalizedTarget || normalizedTarget.length > normalizedIpa.length) return false;
  const vowels = /[aeiouyæɑɒɔəɜɛɪʊʌɐɵœøɞɘɤɨʉɯ]/u;
  let index = normalizedIpa.indexOf(normalizedTarget);
  while (index >= 0) {
    const before = normalizedIpa[index - 1] ?? "";
    const after = normalizedIpa[index + normalizedTarget.length] ?? "";
    if (!vowels.test(normalizedTarget[0] ?? "") || (!vowels.test(before) && !vowels.test(after))) return true;
    index = normalizedIpa.indexOf(normalizedTarget, index + 1);
  }
  return false;
}

function lessonSetWarnings(source: ContentLessonSetVersionView): OperatorLessonSetView["warnings"] {
  let incomplete = 0;
  let phrases = 0;
  let details = 0;
  const detailIssues: NonNullable<OperatorLessonSetView["warnings"]["detailIssues"]> = [];
  // The generation contract permits at most two absent extended-vocabulary
  // fields for the entire CEFR level.  Do not turn those permitted light gaps
  // into an Operator repair banner.
  const permittedLightLexicalGaps = operatorVocabularyLightGapCount(source) <= 2 && !operatorHasInvalidLexicalExemption(source);
  for (const lesson of source.lessons) {
    const parts = new Map(lesson.parts.map(part => [part.code, part]));
    if (REQUIRED_LESSON_PARTS.some(code => !parts.has(code))) incomplete += 1;

    const vocabulary = asRecord(parts.get("vocabulary")?.content);
    const items = asArray(vocabulary?.items)?.map(asRecord).filter((item): item is Record<string, unknown> => item !== undefined) ?? [];
    if (items.length > 0 && items.some(item => {
      const phrases = asArray(item.collocations ?? item.phrases ?? item.examples);
      return !phrases || phrases.length < 3;
    })) phrases += 1;

    const listeningOptions = asArray(asRecord(parts.get("listening")?.content)?.options);
    const readingOptions = asArray(asRecord(parts.get("reading")?.content)?.options);
    const grammarContent = asRecord(parts.get("grammar")?.content);
    const grammarUnavailable = grammarContent?.status === "unavailable" || grammarContent?.hidden === true
      || grammarContent?.reason === "no_suitable_content" || grammarContent?.reason === "insufficient_evidence";
    const pronunciationContent = asRecord(parts.get("pronunciation")?.content);
    const pronunciationFocus = typeof pronunciationContent?.focus === "string" ? pronunciationContent.focus.trim() : "";
    const pronunciationWords = asArray(pronunciationContent?.words)?.filter((item) => {
      if (typeof item === "string") return item.trim().length > 0;
      const record = asRecord(item);
      return typeof record?.word === "string" && record.word.trim().length > 0;
    }) ?? [];
    const pronunciationTarget = pronunciationTargetFromFocus(pronunciationFocus);
    const pronunciationMismatches = pronunciationWords.flatMap((item) => {
      const record = asRecord(item);
      if (!record || typeof record.word !== "string" || typeof record.ipa !== "string" || !pronunciationTarget) return [];
      return ipaContainsTarget(record.ipa, pronunciationTarget) ? [] : [record.word.trim()];
    });
    const pronunciationIncomplete = parts.has("pronunciation") && (
      !pronunciationFocus || pronunciationFocus === "—" || pronunciationWords.length < 3
      || pronunciationContent?.status === "unavailable" || pronunciationContent?.hidden === true
    );
    const missingRequiredParts = REQUIRED_LESSON_PARTS.filter((code) => !parts.has(code));
    const shortQuestions = !listeningOptions || listeningOptions.length < 4 || !readingOptions || readingOptions.length < 4;
    const missingWordStructure = items.some(item => !hasLegacyOrStructuredValue(item.family) || !hasLegacyOrStructuredValue(item.umbrella));
    const missingLexicalRelationCoverage = items.some((item) =>
      !lexicalRelationCoverageSatisfied(item, source.cefr)
    );
    const missingWordDetails = !permittedLightLexicalGaps && (missingWordStructure || missingLexicalRelationCoverage);
    if (missingRequiredParts.length > 0 || grammarUnavailable || pronunciationIncomplete || pronunciationMismatches.length > 0 || shortQuestions || missingWordDetails) {
      details += 1;
      const missing: string[] = missingRequiredParts.map((code) => LESSON_PART_LABELS[code]);
      if (grammarUnavailable) missing.push("Ngữ pháp chưa đủ dữ liệu — có thể bổ sung bằng AI");
      if (pronunciationIncomplete) missing.push("Phát âm chưa đủ dữ liệu — cần âm mục tiêu và 3 từ luyện");
      if (pronunciationMismatches.length > 0) missing.push(`Phát âm sai âm mục tiêu: ${pronunciationMismatches.join(", ")} không chứa /${pronunciationTarget}/`);
      if (!listeningOptions || listeningOptions.length < 4) missing.push("Nghe chưa đủ 4 lựa chọn");
      if (!readingOptions || readingOptions.length < 4) missing.push("Đọc chưa đủ 4 lựa chọn");
      for (const item of items) {
        const word = typeof item.word === "string" && item.word.trim() ? item.word.trim() : "Từ vựng";
        if (!hasLegacyOrStructuredValue(item.family)) missing.push(`${word}: word family`);
        if (!hasLegacyOrStructuredValue(item.umbrella)) missing.push(`${word}: từ bao trùm`);
      }
      if (missingLexicalRelationCoverage) missing.push("quan hệ nghĩa (đồng nghĩa hoặc trái nghĩa)");
      detailIssues.push({
        lessonId: lesson.id,
        dayLabel: ["T2", "T3", "T4", "T5", "T6"][lesson.dayNumber - 1] ?? `Bài ${lesson.dayNumber}`,
        title: lesson.title,
        missing
      });
    }
  }
  const componentLabels: Record<string, string> = {
    plan: "Kế hoạch tuần",
    grammarClassification: "Phân loại ngữ pháp",
    foundation: "Nền tảng",
    vocabulary: "Từ vựng",
    skills: "Bài tập kỹ năng"
  };
  for (const finding of source.generationFindings ?? []) {
    if (finding.dayNumber === null || finding.repairAction !== "regenerate_component") continue;
    const lesson = source.lessons.find((item) => item.dayNumber === finding.dayNumber);
    if (!lesson) continue;
    const message = `${componentLabels[finding.component] ?? finding.component}: ${finding.message}`;
    const existing = detailIssues.find((item) => item.lessonId === lesson.id);
    if (existing) {
      if (!existing.missing.includes(message)) existing.missing.push(message);
      existing.repairable = true;
      continue;
    }
    details += 1;
    detailIssues.push({
      lessonId: lesson.id,
      dayLabel: ["T2", "T3", "T4", "T5", "T6"][lesson.dayNumber - 1] ?? `Bài ${lesson.dayNumber}`,
      title: lesson.title,
      missing: [message],
      repairable: true
    });
  }
  return { incomplete, level: [], phrases, details, detailIssues };
}

function hasLegacyOrStructuredValue(value: unknown): boolean {
  if (Array.isArray(value)) return value.length > 0;
  if (typeof value === "string") return value.trim().length > 0 && value.trim() !== "—";
  if (!value || typeof value !== "object") return false;
  return Object.values(value as Record<string, unknown>).some((entry) => hasLegacyOrStructuredValue(entry));
}

function operatorVocabularyLightGapCount(source: ContentLessonSetVersionView): number {
  return source.lessons.reduce((count, lesson) => {
    const vocabulary = asRecord(lesson.parts.find((part) => part.code === "vocabulary")?.content);
    const items = asArray(vocabulary?.items)?.map(asRecord).filter((item): item is Record<string, unknown> => item !== undefined) ?? [];
    return count + items.reduce((itemCount, item) => itemCount
      + (hasLegacyOrStructuredValue(item.family) ? 0 : 1)
      + (hasLegacyOrStructuredValue(item.umbrella) ? 0 : 1)
      + (lexicalRelationCoverageSatisfied(item, source.cefr) ? 0 : 1), 0);
  }, 0);
}

function operatorHasInvalidLexicalExemption(source: ContentLessonSetVersionView): boolean {
  return source.lessons.some((lesson) => {
    const vocabulary = asRecord(lesson.parts.find((part) => part.code === "vocabulary")?.content);
    const items = asArray(vocabulary?.items)?.map(asRecord).filter((item): item is Record<string, unknown> => item !== undefined) ?? [];
    return items.some((item) => {
      const status = item.relationStatus;
      return (status === "no_natural_relation" || status === "above_cefr_level")
        && !relationExemptionIsCredible(item, source.cefr);
    });
  });
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
    total: number | null;
    rawLevel: Cefr | undefined;
    sectionScores: Array<{ label: string; percent: number | null; heuristic?: boolean }>;
    rationale?: string | null;
    monthlyGoal?: string | null;
    profileSummary?: string | null;
    aiScored?: boolean;
    humanScored?: boolean;
    aiScoringStatus?: "queued" | "running" | "succeeded" | "failed";
    aiScoringErrorCode?: string | null;
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
          percent: score?.percent ?? item.sectionScores[key] ?? null,
          ...(score?.heuristic ? { heuristic: true } : {})
        };
      });
      return { id: item.attemptId, learnerId: item.learnerId, name: item.learnerName, submittedAt: operatorDateTime(item.submittedAt), total: detail?.total ?? undefined, rawLevel: detail?.rawLevel, aiSuggestedCefr: item.suggestedLevel as Cefr | null, sectionScores, reviewFlags: item.reviewFlags ?? [], rationale: detail?.rationale, monthlyGoal: detail?.monthlyGoal, profileSummary: detail?.profileSummary ?? (item.profileComplete === undefined ? undefined : item.profileComplete ? "Đã điền hồ sơ" : "Chưa điền hồ sơ"), suggestedLevel: (item.suggestedLevel ?? detail?.rawLevel) as Cefr | undefined, levels: CEFR_LEVELS, aiScored: detail?.aiScored, humanScored: detail?.humanScored, aiScoringStatus: detail?.aiScoringStatus, aiScoringErrorCode: detail?.aiScoringErrorCode, canRescore: true, rescoreBusy: context.rescoreBusy === item.attemptId };
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
    targets: slots.map(slot => {
      const form = slot.draftForm ?? slot.publishedForm;
      return {
        target: slot.targetLevel as Exclude<Cefr, "A1">,
        forms: form ? [{ id: form.versionId, title: form.title, status: form.status === "published" ? "approved" as const : "draft" as const, createdAt: form.publishedAt ? operatorDateTime(form.publishedAt) : `v${form.version}`, byName: form.status === "published" ? "Đã phát hành" : "Bản nháp", listeningQuestions: form.listeningTaskCount, readingQuestions: form.readingTaskCount, attempts: form.attemptCount, inUse: form.status === "published" }] : []
      };
    })
  };
}

export function adaptWeeks(source: ContentWeekFrameView, options: { aiConnected: boolean; status?: string; suggestions?: Record<number, WeekSuggestion>; saveState?: OperatorWeeksView["saveState"]; saveError?: string | null; generationDialog?: OperatorWeeksView["generationDialog"] }): OperatorWeeksView {
  return { pilotStartDate: operatorCalendarDate(source.pilot.startDate), pilotWeeks: source.pilot.weekCount, ...(source.pilot.cycleNumber ? { pilotCycleNumber: source.pilot.cycleNumber } : {}), aiConnected: options.aiConnected, status: options.status ?? "", saveState: options.saveState, saveError: options.saveError, generationDialog: options.generationDialog, weeks: source.weeks.map(week => ({ number: week.weekNumber, dateRange: `${operatorCalendarDate(week.startDate)} – ${operatorCalendarDate(week.endDate)}`, current: week.current, topic: week.topic, description: week.description, objectives: week.objectives, keyVocabHint: week.keyVocabHint, suggestion: options.suggestions?.[week.weekNumber] })) };
}

export function adaptLessonMatrix(source: ContentLessonMatrixView, options: { aiConnected: boolean; extraLevels?: Cefr[]; generating?: OperatorLessonsView["generating"]; generatingCells?: OperatorLessonsView["generatingCells"]; generateError?: string | null }): OperatorLessonsView {
  return { aiConnected: options.aiConnected, extraLevels: options.extraLevels ?? CEFR_LEVELS.filter(level => !source.levels.some(item => item.cefr === level)), levels: source.levels.map(level => ({ cefr: level.cefr as Cefr, learnerCount: level.learnerCount })), generating: options.generating, generatingCells: options.generatingCells, generateError: options.generateError, weeks: source.weeks.map(week => ({ number: week.weekNumber, topic: week.topic, cells: week.cells.map(cell => ({ cefr: cell.cefr as Cefr, status: cell.status === "published" ? "approved" : cell.status === "review" ? "review" : cell.status === "missing" ? "empty" : "draft", generatedAt: operatorDateTime(cell.updatedAt), incomplete: cell.lessons.length > 0 && cell.lessons.length < 5, lessons: cell.lessons.length, days: [1, 2, 3, 4, 5].map((day, index) => { const lesson = cell.lessons.find(candidate => candidate.dayNumber === day); return { day: ["T2", "T3", "T4", "T5", "T6"][index]!, title: lesson?.title ?? (cell.plan?.[index] ? compactPlanTitle(cell.plan[index]!, week.topic) : null), planned: !lesson && Boolean(cell.plan?.[index]) }; }) })) })) };
}

export function adaptLessonSet(source: ContentLessonSetVersionView, options: { aiConnected: boolean; warnings?: OperatorLessonSetView["warnings"]; mutationState?: OperatorLessonSetView["mutationState"]; mutationMessage?: string | null; activeMutation?: LessonSetActionKey; resolveVocabularyImage?: (lessonId: string, itemIndex: number) => Promise<ContentImageView> }): OperatorLessonSetView {
  const weeklyPractice = source.weeklyPractice ?? {
    task: `Write 3–5 sentences about “${source.topic}”.`,
    guidance: "Use at least 3 words from this week's lessons.",
    inputMode: "text_or_dictation" as const,
    requiredVocabulary: []
  };
  return {
    week: source.weekNumber, cefr: source.cefr as Cefr, version: source.version, status: source.status === "published" ? "approved" : source.status === "review" ? "review" : "draft", topic: source.topic, explanationLanguage: source.explanationLanguage === "Tiếng Việt" ? "tiếng Việt" : "tiếng Anh", aiConnected: options.aiConnected, mutationState: options.mutationState, mutationMessage: options.mutationMessage, activeMutation: options.activeMutation,
    warnings: options.warnings ?? lessonSetWarnings(source),
    weeklyPractice: { task: weeklyPractice.task, guidance: weeklyPractice.guidance, inputModeLabel: "Nhập văn bản hoặc nói để chuyển thành chữ", requiredVocabulary: weeklyPractice.requiredVocabulary },
    missingDays: [1, 2, 3, 4, 5]
      .filter(day => !source.lessons.some(lesson => lesson.dayNumber === day))
      .map(day => ({ day, dayLabel: ["T2", "T3", "T4", "T5", "T6"][day - 1]! })),
    lessons: source.lessons.map(lesson => ({ id: lesson.id, day: lesson.dayNumber, dayLabel: ["T2", "T3", "T4", "T5", "T6"][lesson.dayNumber - 1] ?? `Bài ${lesson.dayNumber}`, title: lesson.title, durationMin: lesson.durationMinutes, practiceKind: lesson.practiceLabel.includes("điền") ? "điền từ" : lesson.practiceLabel.includes("trắc") ? "trắc nghiệm" : "tự viết", practiceAnswer: persistedPracticeAnswer(lesson.practiceLabel), complete: REQUIRED_LESSON_PARTS.every(code => lesson.parts.some(part => part.code === code)), content: <OperatorLessonPreview cefr={source.cefr} lessonId={lesson.id} parts={lesson.parts} resolveVocabularyImage={options.resolveVocabularyImage} /> }))
  };
}

function OperatorLessonPreview({ cefr, lessonId, parts, resolveVocabularyImage }: { cefr: string; lessonId: string; parts: ContentLessonSetVersionView["lessons"][number]["parts"]; resolveVocabularyImage?: ((lessonId: string, itemIndex: number) => Promise<ContentImageView>) | undefined }) {
  const [tab, setTab] = useState<"study" | "practice">("study");
  const [vocabularyModal, setVocabularyModal] = useState<VocabularyModalState | null>(null);
  const language = learnerLessonLanguageForCefr(cefr);
  const copy = lessonCopyForCefr(cefr);
  const visible = lessonPartsForTab(parts, tab);
  const grammarAvailable = sharedLessonGrammarAvailable(parts);
  return <div className="operator-lesson-preview lesson-page"><div className="lesson-surface"><div className="ltabs" role="tablist" aria-label={copy.tabsAria}><button type="button" className={tab === "study" ? "active" : ""} role="tab" aria-selected={tab === "study"} onClick={() => setTab("study")}>1. {copy.studyTab}</button><button type="button" className={tab === "practice" ? "active" : ""} role="tab" aria-selected={tab === "practice"} onClick={() => setTab("practice")}>2. {copy.practiceTab}</button></div><div className="lesson-parts" aria-label={tab === "study" ? copy.studyTab : copy.practiceTab}>{visible.map((part, index) => {
    const exerciseNumber = visible.slice(0, index).filter(candidate => candidate.code !== "instruction").length + 1;
    const content = part.code === "instruction" ? { ...part.content, steps: lessonInstructionSteps(parts, tab, language) } : part.content;
    const displayPart = { ...part, content };
    const practicePart = lessonPracticeCodes.some(code => code === part.code);
    return <section className={`card lesson-part lesson-part--${part.code}${practicePart ? " operator-practice-review" : ""}`} key={part.code}>{practicePart
      ? <OperatorPracticeReview sectionNumber={exerciseNumber} part={displayPart} />
      : <SharedLessonPartContent
          cefr={cefr as Cefr}
          language={language}
          copy={copy}
          grammarAvailable={grammarAvailable}
          sectionNumber={exerciseNumber}
          part={displayPart}
          speak={operatorLessonSpeak}
          openVocabularyModal={setVocabularyModal}
          resolveVocabularyImage={resolveVocabularyImage ? (itemIndex) => resolveVocabularyImage(lessonId, itemIndex) : undefined}
        />}</section>;
  })}</div></div>{vocabularyModal ? <SharedVocabularyModal state={vocabularyModal} speak={operatorLessonSpeak} language={language} close={() => setVocabularyModal(null)} /> : null}</div>;
}

type OperatorLessonPart = ContentLessonSetVersionView["lessons"][number]["parts"][number];

function operatorLessonAnswer(part: OperatorLessonPart): string {
  const rawAnswer = part.content.answer ?? part.content.modelAnswer ?? part.content.sample;
  return Array.isArray(rawAnswer)
    ? rawAnswer.filter((value): value is string => typeof value === "string" && Boolean(value.trim())).join(", ")
    : typeof rawAnswer === "string" && rawAnswer.trim() ? rawAnswer.trim() : "—";
}

function OperatorCorrectAnswer({ answer }: { answer: string }) {
  return <div className="operator-correct-answer"><strong>Đáp án đúng:</strong><span>{answer}</span></div>;
}

function OperatorPracticeReview({ sectionNumber, part }: { sectionNumber: number; part: OperatorLessonPart }) {
  const content = asRecord(part.content) ?? {};
  const text = (...keys: string[]) => keys.map(key => content[key]).find(item => typeof item === "string" && item.trim()) as string | undefined;
  const strings = (key: string) => (asArray(content[key]) ?? []).filter((item): item is string => typeof item === "string" && Boolean(item.trim()));
  const answer = operatorLessonAnswer(part);
  const prompt = normalizeLessonBlankPrompt(text("prompt", "question")) || "—";
  const options = strings("options");
  const heading = <div className="row between"><h2>{sectionNumber}. {operatorPartHeading(part.code, part.title)}</h2></div>;
  const choices = options.length ? <AnswerOptions options={options} answer={answer} /> : null;
  const answerSummary = <OperatorCorrectAnswer answer={answer} />;

  if (part.code === "listening") {
    const transcript = text("transcript", "body", "script", "source", "text");
    return <>
      {heading}
      <OperatorAudioControl source={operatorAudioSource(content)} />
      {transcript ? <div className="operator-listening-transcript"><strong>Nội dung nghe:</strong><p>{transcript}</p></div> : null}
      <p className="operator-question"><LessonPromptText value={prompt} /></p>
      {choices}
      {answerSummary}
    </>;
  }

  const source = text("text", "passage", "script", "body", "source", "context");
  if (part.code === "reading") return <>
    {heading}
    <div className="operator-reading-passage">{source || "—"}</div>
    <p className="operator-question"><LessonPromptText value={prompt} /></p>
    {choices}
    {answerSummary}
  </>;

  if (part.code === "speaking") {
    const instruction = text("instruction", "prompt") || "Nói theo câu mẫu bên dưới và thay đổi một chi tiết cho phù hợp.";
    const model = conciseSpeakingModel(text("answer", "modelAnswer", "sample"));
    return <>
      {heading}
      {source ? <div className="operator-reading-passage">{source}</div> : null}
      <p className="operator-speaking-instruction"><strong>Yêu cầu:</strong> <LessonPromptText value={instruction} /></p>
      <div className="operator-speaking-model"><strong>{model}</strong></div>
      {answerSummary}
    </>;
  }

  return <>
    {heading}
    {source ? <div className="operator-reading-passage">{source}</div> : null}
    <p className="operator-question"><LessonPromptText value={prompt} /></p>
    {choices}
    {answerSummary}
  </>;
}

const operatorLessonSpeak = (value: string, _language?: string, options?: { audioSrc?: string; rate?: number; onStatus?: (status: "started" | "ended" | "error") => void }) => {
  if (options?.audioSrc && typeof Audio !== "undefined") {
    const audio = new Audio(options.audioSrc);
    audio.onplay = () => options.onStatus?.("started");
    audio.onended = () => options.onStatus?.("ended");
    audio.onerror = () => options.onStatus?.("error");
    void audio.play().catch(() => options.onStatus?.("error"));
    return;
  }
  speakOperatorText(value);
  options?.onStatus?.("ended");
};

function renderLessonPart(code: string, value: unknown, media?: { cefr: string; lessonId: string; resolveVocabularyImage?: ((lessonId: string, itemIndex: number) => Promise<ContentImageView>) | undefined } | undefined) {
  const content = asRecord(value) ?? {};
  const text = (...keys: string[]) => keys.map(key => content[key]).find(item => typeof item === "string") as string | undefined;
  const strings = (key: string) => (asArray(content[key]) ?? []).filter((item): item is string => typeof item === "string");
  const pronunciationWords = (asArray(content.words) ?? []).flatMap(item => {
    if (typeof item === "string" && item.trim()) return [{ word: item.trim(), ipa: "" }];
    const record = asRecord(item);
    if (!record || typeof record.word !== "string") return [];
    return [{ word: record.word, ipa: typeof record.ipa === "string" ? record.ipa.trim() : "" }];
  });
  const cefr = media?.cefr ?? "A1";
  const language = learnerLessonLanguageForCefr(cefr);
  const copy = lessonCopyForCefr(cefr);
  if (code === "objective") {
    const objectives = (asArray(content.items) ?? []).map(asRecord).flatMap(item => typeof item?.text === "string" && item.text.trim() ? [item.text.trim()] : []);
    return objectives.length
      ? <><p className="lesson-objective-lead">{learnerObjectiveLead(cefr)}</p><ul className="lesson-objective-list" aria-label={copy.objectiveAria}>{objectives.map((objective, index) => <li key={`${objective}-${index}`}>{learnerFacingObjectiveBody(objective)}</li>)}</ul></>
      : <p className="lesson-objective-text">{learnerFacingObjective(conciseLessonObjective(text("text")), cefr)}</p>;
  }
  if (code === "instruction") return <PreviewList values={strings("steps")} />;
  if (code === "vocabulary") {
    const items = (asArray(content.items) ?? []).map(asRecord).filter((item): item is Record<string, unknown> => item !== undefined);
    return <div className="vocabulary-list">{items.map((item, index) => <OperatorVocabularyCard item={item} index={index} media={media} key={`${String(item.word)}-${index}`} />)}</div>;
  }
  if (code === "grammar") {
    const formula = text("formula", "theory") || "—";
    const examples = strings("examples").slice(0, 3);
    const exampleAudioUrls = strings("exampleAudioUrls");
    return <div className="operator-study-block"><div className="lesson-study-panel-header"><h2>{copy.grammarHeading}</h2></div><div className="lesson-grammar-copy"><div className="lesson-grammar-formula-row"><p className="lesson-study-focus"><strong>{formula}</strong></p><OperatorAssetAudioButton audioSrc={text("audioUrl")} label={language === "en" ? "Listen to the grammar model" : "Nghe mẫu ngữ pháp"} /></div>{text("usage") ? <p className="lesson-study-explanation">{grammarUsageCopy(text("usage")!)}</p> : null}</div>{examples.length ? <div className="lesson-example-list" aria-label={language === "en" ? "Grammar examples" : "Câu ví dụ ngữ pháp"}>{examples.map((example, index) => { const spoken = sanitizeOperatorGrammarSpeechText(conciseGrammarExample(example)); return <button className="btn-sm btn-ghost lesson-example-card vocabulary-card-sound operator-audio-button" type="button" aria-label={language === "en" ? `Listen to example: ${spoken}` : `Nghe câu ví dụ: ${spoken}`} onClick={() => playOperatorWord(spoken, exampleAudioUrls[index])} key={`${example}-${index}`}><Volume2 size={14} aria-hidden="true" />{conciseGrammarExample(example)}</button>; })}</div> : null}</div>;
  }
  if (code === "pronunciation") {
    const focus = text("focus") || "—";
    const targetSound = pronunciationTarget(focus);
    const referenceWord = pronunciationWords[0]?.word;
    const wordAudioUrls = strings("wordAudioUrls");
    return <div className="operator-study-block operator-pronunciation"><div className="lesson-study-panel-header"><h2>{copy.pronunciationHeading}</h2></div><div className="lesson-grammar-formula-row"><p className="lesson-study-focus"><strong>{language === "en" ? `Sound ${targetSound}${referenceWord ? ` as in “${referenceWord}”` : ""}` : `Âm ${targetSound}${referenceWord ? ` như trong “${referenceWord}”` : ""}`}</strong></p></div>{text("instruction", "tip") ? <p className="operator-pronunciation-tip lesson-study-explanation">{text("instruction", "tip")}</p> : null}{pronunciationWords.length ? <div className="operator-pronunciation-words" aria-label={language === "en" ? "Pronunciation practice words" : "Luyện từ phát âm"}>{pronunciationWords.slice(0, 3).map((item, index) => <button className="btn-sm btn-ghost lesson-example-card vocabulary-card-sound operator-audio-button operator-pronunciation-word-chip" type="button" aria-label={language === "en" ? `Listen to pronunciation word: ${item.word}` : `Nghe từ phát âm: ${item.word}`} onClick={() => playOperatorWord(item.word, wordAudioUrls[index])} key={item.word}><Volume2 size={14} aria-hidden="true" /><strong>{item.word}</strong>{item.ipa ? ` ${item.ipa}` : ""}</button>)}</div> : null}</div>;
  }
  if (code === "listening") {
    const audio = operatorAudioSource(content);
    return <div className="operator-practice-content"><OperatorAudioControl source={audio} /><p className="operator-practice-transcript">{text("script") || (audio.src ? "" : audio.text) || "—"}</p><p className="operator-question"><strong>Câu hỏi:</strong> <LessonPromptText value={text("prompt", "question") || "—"} /></p><AnswerOptions options={strings("options")} answer={text("answer")} /></div>;
  }
  if (code === "reading") return <div className="operator-practice-content"><div className="operator-reading-passage">{text("text", "passage", "script") || "—"}</div><p className="operator-question"><strong>Câu hỏi:</strong> <LessonPromptText value={text("prompt", "question") || "—"} /></p><AnswerOptions options={strings("options")} answer={text("answer")} /></div>;
  if (code === "writing") return <div className="operator-practice-content"><p className="operator-question"><strong>Đề bài:</strong> <LessonPromptText value={text("prompt") || "—"} /></p><AnswerOptions options={strings("options")} answer={text("answer")} /></div>;
  if (code === "word_class" || code === "word_use") return <div className="operator-practice-content"><p className="operator-question"><strong>{code === "word_class" ? "Nhận diện từ loại:" : "Chọn cách dùng đúng:"}</strong> <LessonPromptText value={text("prompt", "question") || "—"} /></p><AnswerOptions options={strings("options")} answer={text("answer")} /></div>;
  if (code === "speaking") {
    const model = conciseSpeakingModel(text("answer", "modelAnswer", "sample"));
    const instruction = text("instruction", "prompt") || "Nói theo câu mẫu bên dưới và thay đổi một chi tiết cho phù hợp.";
    return <div className="operator-practice-content"><p className="operator-speaking-instruction"><strong>Yêu cầu:</strong> <LessonPromptText value={instruction} /></p><div className="operator-speaking-model"><strong>{model}</strong>{text("audioUrl") ? <audio controls preload="metadata" src={text("audioUrl")} aria-label="Nghe audio mẫu phần Nói" /> : null}</div><OperatorRecordingPreview /></div>;
  }
  return <div className="small">{humanizeContent(content)}</div>;
}

function operatorPartHeading(code: string, title: string): string {
  const english: Record<string, string> = { listening: "Listening", reading: "Reading", writing: "Writing", word_class: "Word class", word_use: "Word use", speaking: "Speaking" };
  return english[code] ? `${title} · ${english[code]}` : title;
}

type OperatorAudioSource = { text?: string; src?: string };

function operatorPartNarration(code: string, content: Record<string, unknown>, cefr: string): string {
  const values: string[] = [];
  const add = (value: unknown) => { if (typeof value === "string" && value.trim()) values.push(value.trim()); };
  if (code === "objective" && Array.isArray(content.items)) {
    add(learnerObjectiveLead(cefr));
    content.items.forEach(item => {
      const objective = asRecord(item);
      if (typeof objective?.text === "string") add(learnerFacingObjectiveBody(objective.text));
    });
  } else {
    add(content.text);
  }
  if (code === "instruction" && Array.isArray(content.steps)) content.steps.forEach(add);
  [content.passage, content.formula, content.usage, content.instruction, content.prompt, content.question].forEach(add);
  if (Array.isArray(content.examples)) content.examples.forEach(add);
  if (Array.isArray(content.options)) content.options.forEach(add);
  return Array.from(new Set(values)).join(". ");
}

function operatorAudioSource(content: Record<string, unknown>): OperatorAudioSource {
  const candidate = content.audioUrl ?? content.audio;
  if (typeof candidate === "string" && candidate.trim()) return isOperatorAudioUrl(candidate) ? { src: candidate } : { text: candidate };
  const record = asRecord(candidate);
  if (record) {
    const src = typeof record.url === "string" ? record.url : typeof record.src === "string" ? record.src : undefined;
    const text = typeof record.text === "string" ? record.text : typeof record.script === "string" ? record.script : undefined;
    if (src || text) return { ...(src ? { src } : {}), ...(text ? { text } : {}) };
  }
  return typeof content.script === "string" && content.script.trim() ? { text: content.script } : {};
}

function isOperatorAudioUrl(value: string): boolean {
  return /^(?:https?:|blob:|data:audio\/|\/)/i.test(value) || /\.(?:mp3|m4a|wav|ogg|oga|webm|aac|flac|amr|3gp)(?:[?#].*)?$/i.test(value);
}

function sanitizeOperatorGrammarSpeechText(value: string): string {
  return value.replace(/^(?:example|ví dụ)\s*:\s*/iu, "").split("|")[0]!.replace(/[+*=~]/gu, " ").replace(/\s+/gu, " ").trim();
}

function OperatorAssetAudioButton({ audioSrc, label }: { audioSrc?: string | undefined; label: string }) {
  const src = audioSrc?.trim() ?? "";
  if (!src || typeof Audio === "undefined") return null;
  const play = () => {
    const audio = new Audio(src);
    void audio.play().catch(() => undefined);
  };
  return <button className="btn-sm btn-ghost operator-audio-button operator-audio-button--icon" type="button" aria-label={label} title={label} onClick={play}><Volume2 size={16} aria-hidden="true" /></button>;
}

function OperatorAudioControl({ source, label = "Listening" }: { source: OperatorAudioSource; label?: string }) {
  if (source.src || source.text) {
    const play = () => source.src
      ? operatorLessonSpeak("", "en-US", { audioSrc: source.src })
      : operatorLessonSpeak(source.text ?? "", "en-US");
    return <button className="btn-sm btn-ghost operator-audio-button operator-audio-button--primary operator-listening-button" type="button" aria-label={`Nghe nội dung phần ${label}`} onClick={play}><Volume2 size={16} aria-hidden="true" />Nghe nội dung</button>;
  }
  return <p className="operator-audio-missing">Chưa có nội dung âm thanh.</p>;
}

function OperatorRecordingPreview() {
  const [recording, setRecording] = useState(false);
  const [audioUrl, setAudioUrl] = useState("");
  const [error, setError] = useState("");
  const recorder = useRef<MediaRecorder | null>(null);
  const stream = useRef<MediaStream | null>(null);
  const chunks = useRef<Blob[]>([]);
  useEffect(() => () => {
    if (recorder.current?.state === "recording") recorder.current.stop();
    stream.current?.getTracks().forEach(track => track.stop());
    if (audioUrl) URL.revokeObjectURL(audioUrl);
  }, [audioUrl]);
  const toggle = async () => {
    if (recording && recorder.current) {
      recorder.current.stop();
      return;
    }
    if (typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined") {
      setError("Trình duyệt này chưa cấp quyền micro.");
      return;
    }
    try {
      const nextStream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const nextRecorder = new MediaRecorder(nextStream);
      stream.current = nextStream;
      recorder.current = nextRecorder;
      chunks.current = [];
      nextRecorder.ondataavailable = event => { if (event.data.size) chunks.current.push(event.data); };
      nextRecorder.onstop = () => {
        nextStream.getTracks().forEach(track => track.stop());
        setRecording(false);
        const blob = new Blob(chunks.current, { type: nextRecorder.mimeType || "audio/webm" });
        setAudioUrl(current => {
          if (current) URL.revokeObjectURL(current);
          return URL.createObjectURL(blob);
        });
      };
      nextRecorder.start();
      setError("");
      setRecording(true);
    } catch {
      setError("Không dùng được micro. Hãy kiểm tra quyền truy cập micro.");
    }
  };
  return <div className="operator-speaking-recorder"><button className="btn-sm btn-ghost" type="button" aria-label="Ghi âm câu trả lời" onClick={() => void toggle()}>{recording ? <><Square size={15} aria-hidden="true" /> Dừng ghi</> : <><Mic size={16} aria-hidden="true" /> Ghi âm câu trả lời</>}</button>{error ? <p className="operator-recording-error">{error}</p> : null}{audioUrl ? <audio controls preload="metadata" src={audioUrl} aria-label="Nghe lại câu trả lời" /> : null}</div>;
}

function OperatorVocabularyCard({ item, index, media }: { item: Record<string, unknown>; index: number; media?: { lessonId: string; resolveVocabularyImage?: ((lessonId: string, itemIndex: number) => Promise<ContentImageView>) | undefined } | undefined }) {
  const [detail, setDetail] = useState<{ kind?: "umbrella" | "family"; title: string; currentWord?: string; umbrellaMeaning?: string; umbrellaAudioUrl?: string; description?: string; words: Array<{ word: string; meaning?: string; audioUrl?: string; current?: boolean }> } | null>(null);
  const word = String(item.word ?? "—");
  const phrases = (asArray(item.collocations ?? item.phrases ?? item.examples) ?? (typeof item.collocations === "string" ? [item.collocations] : []))
    .filter((entry): entry is string => typeof entry === "string" && Boolean(entry.trim()))
    .slice(0, 3);
  const family = relationEntries(item.family);
  const synonyms = relationEntries(item.synonyms);
  const antonyms = relationEntries(item.antonyms);
  const umbrella = asRecord(item.umbrella);
  const vocabularyItem: LessonVocabularyItem = {
    word,
    ...(typeof item.type === "string" && item.type.trim() ? { type: item.type.trim() } : {}),
    ...(typeof item.pronunciation === "string" && item.pronunciation.trim() ? { pronunciation: item.pronunciation.trim() } : {}),
    ...(typeof item.meaning === "string" && item.meaning.trim() ? { meaning: item.meaning.trim() } : {}),
    ...(phrases.length ? { collocations: phrases } : {}),
    ...(Array.isArray(item.collocationAudioUrls) ? { collocationAudioUrls: item.collocationAudioUrls.filter((value): value is string => typeof value === "string") } : {}),
    ...(Array.isArray(item.exampleAudioUrls) ? { exampleAudioUrls: item.exampleAudioUrls.filter((value): value is string => typeof value === "string") } : {}),
    ...(typeof item.audioUrl === "string" && item.audioUrl.trim() ? { audioUrl: item.audioUrl.trim() } : {})
  };
  const umbrellaWord = typeof umbrella?.word === "string" ? umbrella.word : "";
  const umbrellaMeaning = typeof umbrella?.meaning === "string" ? umbrella.meaning.trim() : "";
  const siblingEntries = relationEntries(umbrella?.siblings);
  const umbrellaWords = umbrella ? [{ word, ...(typeof item.meaning === "string" && item.meaning.trim() ? { meaning: item.meaning.trim() } : {}), audioUrl: operatorVocabularyAudioSource(word, item.audioUrl), current: true }, ...siblingEntries] : [];
  const relations: VocabularyRelationChip[] = [
    ...(umbrellaWord ? [{ label: `TỪ BAO TRÙM ${umbrellaWord}`, ariaLabel: `Từ bao trùm: ${umbrellaWord}`, icon: "umbrella" as const, tone: "umb" as const, count: Math.max(0, umbrellaWords.length - 1), onClick: () => setDetail({ kind: "umbrella", title: umbrellaWord, currentWord: word, umbrellaMeaning, umbrellaAudioUrl: operatorVocabularyAudioSource(umbrellaWord, umbrella?.audioUrl), words: umbrellaWords }) }] : []),
    ...synonyms.map(value => ({ label: value.word, ariaLabel: value.audioUrl ? `Nghe từ đồng nghĩa: ${value.word}` : value.word, tone: "synonym" as const, onClick: value.audioUrl ? () => playOperatorWord(value.word, value.audioUrl) : undefined })),
    ...antonyms.map(value => ({ label: value.word, ariaLabel: value.audioUrl ? `Nghe từ trái nghĩa: ${value.word}` : value.word, tone: "antonym" as const, onClick: value.audioUrl ? () => playOperatorWord(value.word, value.audioUrl) : undefined })),
    ...(family.length ? [{ label: `Word family (${family.length})`, ariaLabel: `Word family (${family.length})`, icon: "family" as const, tone: "family" as const, onClick: () => setDetail({ kind: "family", title: "Word family", words: family }) }] : [])
  ];
  const loadImage = () => {
    if (media?.resolveVocabularyImage) return media.resolveVocabularyImage(media.lessonId, index);
    const imageUrl = typeof item.imageUrl === "string" ? item.imageUrl.trim() : "";
    const attribution = contentImageAttribution(item.imageAttribution);
    if (imageUrl && attribution) return Promise.resolve({ status: "available", imageUrl, alt: word, attribution } as const);
    return Promise.resolve({ status: "unavailable" } as const);
  };
  const modal = detail && typeof document !== "undefined" ? createPortal(<div className="modal-backdrop vocabulary-relation-modal" role="presentation"><section className="dialog wide" role="dialog" aria-modal="true" aria-label={detail.kind === "umbrella" ? "Từ bao quát" : detail.title}><div className="row between vocabulary-relation-modal-header">{detail.kind === "umbrella" ? <div><div className="eyebrow">Từ vựng · {detail.currentWord}</div><h2>Từ bao quát</h2></div> : <strong className="vocabulary-relation-title">{detail.title}</strong>}<button className="btn-sm" type="button" aria-label="Đóng" onClick={() => setDetail(null)}>Đóng</button></div>{detail.kind === "umbrella" ? <div className="stack vocabulary-umbrella-content" style={{ gap: 12 }} aria-label="Từ bao quát"><article className="card flat vocabulary-umbrella-summary" aria-label={`Từ bao quát ${detail.title}`}><div className="row between" style={{ gap: 12, alignItems: "flex-start" }}><div style={{ minWidth: 0 }}><div className="eyebrow">Từ bao quát</div><h3>{detail.title}</h3><p>{detail.umbrellaMeaning}</p></div>{detail.umbrellaAudioUrl ? <button className="btn-sm btn-ghost operator-audio-button" type="button" aria-label={`Nghe từ bao trùm: ${detail.title}`} onClick={() => playOperatorWord(detail.title, detail.umbrellaAudioUrl)}><Volume2 size={16} aria-hidden="true" />Nghe</button> : null}</div></article><div><div className="small muted">Từ hiện tại và các từ cùng nhóm</div><div className="vocabulary-relation-audio-list">{detail.words.map(value => value.audioUrl ? <button className="btn-sm btn-ghost operator-audio-button vocabulary-relation-audio-item" type="button" aria-label={`Nghe từ cùng nhóm: ${value.word}`} onClick={() => playOperatorWord(value.word, value.audioUrl)} key={`${value.word}-${value.meaning ?? ""}`}><span><strong>{value.word}</strong>{value.current ? <small className="vocabulary-current-word">từ của bài</small> : null}{value.meaning ? <small>{value.meaning}</small> : null}</span><Volume2 size={16} aria-hidden="true" /></button> : <div className="vocabulary-relation-audio-item" key={`${value.word}-${value.meaning ?? ""}`}><span><strong>{value.word}</strong>{value.current ? <small className="vocabulary-current-word">từ của bài</small> : null}{value.meaning ? <small>{value.meaning}</small> : null}</span></div>)}</div></div></div> : <>{detail.description ? <p className="muted vocabulary-relation-description">{detail.description}</p> : null}<div className="vocabulary-relation-audio-list">{detail.words.map(value => value.audioUrl ? <button className="btn-sm btn-ghost operator-audio-button vocabulary-relation-audio-item" type="button" aria-label={`Nghe từ cùng họ: ${value.word}`} onClick={() => playOperatorWord(value.word, value.audioUrl)} key={`${value.word}-${value.meaning ?? ""}`}><span><strong>{value.word}</strong>{value.current ? <small className="vocabulary-current-word">từ của bài</small> : null}{value.meaning ? <small>{value.meaning}</small> : null}</span><Volume2 size={16} aria-hidden="true" /></button> : <div className="vocabulary-relation-audio-item" key={`${value.word}-${value.meaning ?? ""}`}><span><strong>{value.word}</strong>{value.current ? <small className="vocabulary-current-word">từ của bài</small> : null}{value.meaning ? <small>{value.meaning}</small> : null}</span></div>)}</div></>}</section></div>, document.body) : null;
  return <><SharedVocabularyCard item={vocabularyItem} loadImage={loadImage} speak={speakOperatorText} relations={relations} />{modal}</>;
}

function speakOperatorText(text: string) {
  if (typeof window === "undefined" || !("speechSynthesis" in window) || typeof SpeechSynthesisUtterance === "undefined") return;
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = "en-US";
  window.speechSynthesis.cancel();
  window.speechSynthesis.speak(utterance);
}

function contentImageAttribution(value: unknown): Extract<ContentImageView, { status: "available" }>["attribution"] | undefined {
  const record = asRecord(value);
  if (!record || typeof record.licence !== "string" || typeof record.licenceUrl !== "string" || typeof record.sourceUrl !== "string") return undefined;
  return { creator: typeof record.creator === "string" ? record.creator : null, licence: record.licence, licenceUrl: record.licenceUrl, sourceUrl: record.sourceUrl };
}

function relationWords(value: unknown): string[] {
  if (Array.isArray(value)) return value.flatMap(entry => typeof entry === "string" ? [entry] : typeof asRecord(entry)?.word === "string" ? [String(asRecord(entry)?.word)] : []);
  return typeof value === "string" && value.trim() && value.trim() !== "—" ? [value.trim()] : [];
}

function relationEntries(value: unknown): Array<{ word: string; meaning?: string; audioUrl?: string }> {
  if (!Array.isArray(value)) return relationWords(value).map(word => ({ word, audioUrl: operatorVocabularyAudioSource(word) }));
  return value.flatMap(entry => {
    if (typeof entry === "string" && entry.trim()) return [{ word: entry.trim(), audioUrl: operatorVocabularyAudioSource(entry.trim()) }];
    const record = asRecord(entry);
    if (!record || typeof record.word !== "string" || !record.word.trim()) return [];
    const word = record.word.trim();
    return [{ word, ...(typeof record.meaning === "string" && record.meaning.trim() ? { meaning: record.meaning.trim() } : {}), audioUrl: operatorVocabularyAudioSource(word, record.audioUrl) }];
  });
}

function operatorVocabularyAudioSource(word: string, value?: unknown): string {
  return typeof value === "string" && value.trim() ? value.trim() : `tts:${encodeURIComponent(word)}`;
}

function playOperatorWord(word: string, audioUrl?: string) {
  if (audioUrl?.startsWith("tts:")) {
    speakOperatorText(word);
    return;
  }
  if (audioUrl?.trim() && typeof Audio !== "undefined") {
    const audio = new Audio(audioUrl.trim());
    void audio.play().catch(() => speakOperatorText(word));
    return;
  }
  speakOperatorText(word);
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

function formatLegacyDetail(label: string, value: unknown): string {
  const values = Array.isArray(value) ? value.flatMap((entry) => typeof entry === "string" ? [entry] : entry && typeof entry === "object" && typeof (entry as Record<string, unknown>).word === "string" ? [(entry as Record<string, unknown>).word as string] : []) : typeof value === "string" && value.trim() && value.trim() !== "—" ? [value.trim()] : [];
  return values.length ? ` · ${label}: ${values.join(", ")}` : "";
}

function PreviewList({ values }: { values: string[] }) { return values.length ? <ul className="small">{values.map((value, index) => <li key={`${value}-${index}`}>{value}</li>)}</ul> : <p className="small muted">—</p>; }
function AnswerOptions({ options, answer }: { options: string[]; answer?: string | undefined }) { return options.length ? <ol className="operator-answer-options">{options.map((option, index) => <li className={`operator-answer-choice${option === answer ? " is-answer" : ""}`} key={`${option}-${index}`}><span className="operator-answer-letter">{String.fromCharCode(65 + index)}</span><span>{option}</span>{option === answer ? <Check className="operator-inline-icon" size={15} strokeWidth={2.5} aria-label="Đáp án đúng" /> : null}</li>)}</ol> : answer ? <p className="operator-answer-key"><b>Đáp án mẫu:</b> {answer}</p> : null; }
function humanizeContent(content: Record<string, unknown>): string { return Object.values(content).flatMap(value => Array.isArray(value) ? value : [value]).filter(value => typeof value === "string" || typeof value === "number").join(" · ") || "—"; }

export interface ReviewAdapterDetails {
  aiConnected?: boolean;
  submissions?: Record<string, Pick<ReviewSubmission, "cefr" | "type" | "task" | "guidance" | "requiredVocabulary">>;
  coach?: Record<string, { cefr: Cefr; week: number; sessionId: string }>;
  appeals?: Record<string, Partial<Omit<ReviewAppeal, "id" | "learnerName" | "reason" | "status" | "at" | "decidedSummary">>>;
  tests?: Record<string, { rawLevel?: Cefr; aiSuggestedCefr?: Cefr | null }>;
}

export function adaptReview(source: ContentReviewView, activeTab: keyof typeof REVIEW_TAB_MAP, options: ReviewAdapterDetails = {}): OperatorReviewView {
  const counts = { subs: 0, coach: 0, weekly: 0, appeals: 0, attempts: 0, tests: 0 };
  source.tabs.forEach(tab => { const key = REVIEW_TAB_MAP[tab.key as keyof typeof REVIEW_TAB_MAP]; if (key) counts[key] = tab.unreadCount ?? tab.count; });
  return {
    activeTab: REVIEW_TAB_MAP[activeTab], counts, aiConnected: options.aiConnected,
    submissions: source.submissions.map(item => { const detail = options.submissions?.[item.id]; return { id: item.id, learnerName: item.learnerName, cefr: (item.cefr ?? detail?.cefr) as Cefr | undefined, week: item.weekNumber, type: item.type ?? detail?.type, submittedAt: operatorDateTime(item.submittedAt), operatorChecked: item.checked, task: item.task ?? detail?.task, guidance: item.guidance ?? detail?.guidance, requiredVocabulary: item.requiredVocabulary ?? detail?.requiredVocabulary, text: item.text, total: item.total, rubric: item.rubric.meaning == null || item.rubric.vocabulary == null || item.rubric.grammar == null ? null : { meaning: item.rubric.meaning, vocab: item.rubric.vocabulary, grammar: item.rubric.grammar }, ...(item.aiGraded === undefined ? {} : { aiGraded: item.aiGraded }), feedback: item.feedback, suggestions: item.suggestions.map(text => ({ original: "", corrected: text, explanation: "" })), ...(item.audioArtifact ? { audioArtifact: item.audioArtifact } : {}) }; }),
    coachTurns: source.coachSamples.map(item => { const detail = options.coach?.[item.id]; return { id: item.id, sessionId: detail?.sessionId ?? item.id, learnerName: item.learnerName, cefr: (item.cefr ?? detail?.cefr) as Cefr | undefined, week: item.weekNumber ?? detail?.week, at: operatorDateTime(item.createdAt), checked: item.checked, userText: item.learnerText, reply: item.coachText, rubric: item.scores.meaning == null || item.scores.vocabulary == null || item.scores.grammar == null ? null : { meaning: item.scores.meaning, vocab: item.scores.vocabulary, grammar: item.scores.grammar }, suggestions: item.suggestions.map(text => ({ original: "", corrected: text, explanation: "" })), ...(item.audioArtifact ? { audioArtifact: item.audioArtifact } : {}) }; }),
    weeklyPractices: (source.weeklyPractices ?? []).map(item => ({ id: item.versionId, week: item.weekNumber, cefr: item.cefr as Cefr, topic: item.topic, status: item.status === "published" ? "approved" : item.status === "review" ? "review" : "draft", version: item.version, task: item.task, guidance: item.guidance, requiredVocabulary: item.requiredVocabulary })),
    appeals: source.appeals.map(item => {
      const lessonPart = item.kind === "lesson_part";
      const title = lessonPart
        ? [`Tuần ${item.weekNumber ?? "—"}`, item.dayNumber == null ? null : `T${item.dayNumber + 1}`, item.lessonTitle].filter(Boolean).join(" · ")
        : undefined;
      return {
        id: item.id,
        learnerName: item.learnerName,
        at: operatorDateTime(item.createdAt),
        status: item.status,
        reason: item.reason,
        decidedSummary: item.resolution || null,
        ...(lessonPart ? {
          kind: "part" as const,
          ...(item.cefr ? { cefr: item.cefr as Cefr } : {}),
          title,
          part: item.partCode ?? "Phần bài học",
          attempts: item.attempts ?? 0,
          ...(item.question ? { question: item.question } : {}),
          ...(item.options?.length ? { options: item.options } : {}),
          ...(item.answer ? { answer: item.answer } : {}),
          key: item.answerKey ?? null,
          aiFeedback: item.aiFeedback ?? null
        } : item.kind === "weekly_practice" ? { kind: "sub" as const } : {}),
        ...options.appeals?.[item.id]
      };
    }),
    attempts: source.lessonAttempts.map(item => ({ id: item.id, learnerId: item.learnerId, learnerName: item.learnerName, cefr: item.cefr as Cefr | undefined, lesson: `Tuần ${item.weekNumber} · T${item.dayNumber + 1} · ${item.lessonTitle}`, listening: String(item.attempts.listening ?? "chưa làm"), reading: String(item.attempts.reading ?? "chưa làm"), writing: String(item.attempts.writing ?? "chưa làm"), speaking: String(item.attempts.speaking ?? "chưa làm"), total: Object.values(item.attempts).reduce((sum, value) => sum + (value ?? 0), 0), ...(item.audioArtifact ? { audioArtifact: item.audioArtifact } : {}) })),
    tests: source.assessments.map(item => ({ id: item.id, learnerName: item.learnerName, kind: item.kind, submittedAt: item.submittedAt ? operatorDateTime(item.submittedAt) : undefined, total: item.totalScore ?? undefined, ...options.tests?.[item.id] }))
  };
}

export function adaptPrompts(source: ContentPromptSettingsView, options: { saveState?: OperatorPromptsView["saveState"]; saveError?: string | null } = {}): OperatorPromptsView {
  return { saveState: options.saveState, saveError: options.saveError, prompts: source.groups.flatMap(group => {
    if (group.key === "micro_grading") return [];
    const key = PROMPT_KEY_MAP[group.key];
    if (!key) throw new Error(`Unknown content prompt key: ${group.key}`);
    return [[key, PROMPT_LABELS[key], group.content, group.status, group.version]];
  }) };
}
