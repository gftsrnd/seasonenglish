import { useEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { lexicalRelationCoverageSatisfied, relationExemptionIsCredible } from "@e4s/domain/content";
import { cancelExclusiveAudio, claimExclusiveAudio } from "../../features/experience/audio-precedence.js";
import type {
  AssessmentLevelFormSlotView,
  AssessmentReviewOverviewView,
  ContentLessonMatrixView,
  ContentLessonSetVersionView,
  ContentImageView,
  LessonVocabularyFamilyWord,
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
import { vocabularyPresentationBlocks } from "../shared/lesson/vocabulary-groups.js";
import { conciseGrammarExample, conciseLessonObjective, grammarFormulaLines, conciseSpeakingModel, learnerFacingObjective, learnerFacingObjectiveBody, learnerObjectiveLead, learnerObjectiveStatements } from "../shared/lesson/presentation.js";
import { lessonInstructionSteps } from "../shared/lesson/instructions.js";
import { formatPercent, formatScoreOutOf } from "../shared/format-score.js";
import { learnerLessonLanguageForCefr, lessonCopyForCefr, type LearnerLessonLanguage } from "../shared/lesson/language.js";
import { lessonPartsForTab, lessonPracticeCodes, sharedLessonGrammarAvailable } from "../shared/lesson/structure.js";
import { LessonPromptText, normalizeLessonBlankPrompt, SharedLessonPartContent, SharedVocabularyModal, type VocabularyModalState } from "../learner/Learning.js";
import { useCompactUi } from "../shared/CompactUi.js";
import { useMediaQuery as useMediaQuery_ } from "../shared/useMediaQuery.js";
import { ChevronLeft as ChevronLeftIcon_, ChevronRight as ChevronRightIcon_ } from "lucide-react";

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
  const mapUnassessed = (item: AssessmentReviewOverviewView["unassessedLearners"][number]) => ({ id: item.learnerId, name: item.learnerName, hasProfile: item.profileComplete, profileSummary: item.profileComplete ? "Đã điền hồ sơ" : "Chưa điền hồ sơ", ...(item.placementRetake ? { placementRetake: item.placementRetake } : {}) });
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
      return { id: item.attemptId, learnerId: item.learnerId, name: item.learnerName, kind: item.kind === "final" ? "final" : item.kind === "pass-course" ? "pass-course" : "placement", submittedAt: operatorDateTime(item.submittedAt), total: detail?.total ?? undefined, rawLevel: detail?.rawLevel, aiSuggestedCefr: item.suggestedLevel as Cefr | null, sectionScores, reviewFlags: item.reviewFlags ?? [], rationale: detail?.rationale, monthlyGoal: detail?.monthlyGoal, profileSummary: detail?.profileSummary ?? (item.profileComplete === undefined ? undefined : item.profileComplete ? "Đã điền hồ sơ" : "Chưa điền hồ sơ"), suggestedLevel: (item.suggestedLevel ?? detail?.rawLevel) as Cefr | undefined, levels: CEFR_LEVELS, aiScored: detail?.aiScored, humanScored: detail?.humanScored, aiScoringStatus: detail?.aiScoringStatus, aiScoringErrorCode: detail?.aiScoringErrorCode, canRescore: true, rescoreBusy: context.rescoreBusy === item.attemptId, placementRetake: item.placementRetake, isPlacementRetake: item.isPlacementRetake };
    }),
    levelRequests: source.pendingLevelUp.map(item => {
      const levels = context.levelRequestDetails?.[item.attemptId];
      return { id: item.attemptId, learnerName: item.learnerName, from: levels?.from, to: levels?.to ?? item.suggestedLevel as Cefr | undefined, sentAt: operatorDateTime(item.submittedAt), testSummary: context.placementDetails?.[item.attemptId] ? formatScoreOutOf(context.placementDetails[item.attemptId]!.total, 100) : null, testId: item.attemptId, challengeId: item.challenge ? item.attemptId : null, challengeSummary: item.challenge ? `${formatScoreOutOf(item.challenge.average, 5)} · ${item.challenge.offTopic} lạc đề` : null };
    }),
    ready: source.levelSignals.ready.map(item => ({ id: item.learnerId, name: item.learnerName, cefr: item.currentLevel as Cefr, target: item.targetLevel as Cefr, metrics: item.metrics.map(metric => `${metric.label} ${metric.display}`).join(" · ") })),
    weak: source.levelSignals.weak.map(item => ({ id: item.learnerId, name: item.learnerName, cefr: item.currentLevel as Cefr, metrics: item.wrongWeeks.map(week => `tuần ${week.weekNumber}: ${formatPercent(week.wrongPercent)} sai (${week.partCount} phần)`).join(" · ") })),
    inFlow: (source.levelSignals.inFlow ?? []).map(item => ({ id: item.learnerId, name: item.learnerName, cefr: item.currentLevel as Cefr, target: item.targetLevel as Cefr, metrics: item.metrics, testId: item.assessmentAttemptId, challengeId: item.challengeAttemptId })),
    approved: source.approvedLearners.map(item => ({ id: item.learnerId, name: item.learnerName, cefr: item.currentLevel as Cefr, placementScore: item.placementScore, monthlyGoal: item.monthlyGoal, levelUpAllowed: Boolean(item.levelUpOverride), ...(item.trialCountsFrom ? { trialCountsFrom: item.trialCountsFrom } : {}), ...(item.placementRetake ? { placementRetake: item.placementRetake } : {}) })),
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

export function adaptLevelForms(slots: AssessmentLevelFormSlotView[], options: { aiConnected: boolean; generatingTarget?: OperatorLevelFormsView["generatingTarget"]; generateError?: string | null }): OperatorLevelFormsView {
  return {
    aiConnected: options.aiConnected,
    generatingTarget: options.generatingTarget ?? null,
    generateError: options.generateError,
    targets: slots.map(slot => {
      const form = slot.draftForm ?? slot.publishedForm;
      return {
        target: slot.targetLevel,
        forms: form ? [{ id: form.versionId, title: form.title, status: form.status === "published" ? "approved" as const : "draft" as const, createdAt: form.publishedAt ? operatorDateTime(form.publishedAt) : `v${form.version}`, byName: form.status === "published" ? "Đã phát hành" : "Bản nháp", listeningQuestions: form.listeningTaskCount, readingQuestions: form.readingTaskCount, attempts: form.attemptCount, inUse: form.status === "published", ...(form.publicationReady === undefined ? {} : { publicationReady: form.publicationReady }), ...(form.publicationBlockerCount === undefined ? {} : { publicationBlockerCount: form.publicationBlockerCount }) }] : []
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

export function OperatorLessonPreview({ cefr, lessonId, parts, resolveVocabularyImage, studyTabLabel, collapsibleVocabulary = false, practiceContent }: { collapsibleVocabulary?: boolean; /** Replaces the practice tab body (Friday review sections). */ practiceContent?: ReactNode; cefr: string; lessonId: string; parts: ContentLessonSetVersionView["lessons"][number]["parts"]; resolveVocabularyImage?: ((lessonId: string, itemIndex: number) => Promise<ContentImageView>) | undefined; /** Monthly review days call the first tab "Ôn" instead of "Học". */ studyTabLabel?: string }) {
  const [tab, setTab] = useState<"study" | "practice">("study");
  const [vocabularyModal, setVocabularyModal] = useState<VocabularyModalState | null>(null);
  const language = learnerLessonLanguageForCefr(cefr);
  const copy = lessonCopyForCefr(cefr);
  const visible = lessonPartsForTab(parts, tab);
  const grammarAvailable = sharedLessonGrammarAvailable(parts);
  // Phones/tablets: the review view is split into a few full section pages
  // (Study: goals + words / grammar / sounds; Practice: 2-3 exercises per page)
  // with a compact section switcher, instead of one long scroll. Desktop shows every part.
  const compactUi = useCompactUi();
  const tabletUi = useMediaQuery_("(min-width: 601px)");
  const [pageIndex, setPageIndex] = useState(0);
  const renderPart = (part: (typeof visible)[number], index: number) => {
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
          collapsibleVocabulary={collapsibleVocabulary}
          resolveVocabularyImage={resolveVocabularyImage ? (itemIndex) => resolveVocabularyImage(lessonId, itemIndex) : undefined}
        />}</section>;
  };
  const sectionPages = compactUi && !(tab === "practice" && practiceContent) ? operatorLessonSectionPages(visible, tab, tabletUi, language) : null;
  const currentPage = sectionPages ? Math.min(pageIndex, sectionPages.length - 1) : 0;
  const switchTab = (next: "study" | "practice") => { setTab(next); setPageIndex(0); };
  return <div className="operator-lesson-preview lesson-page"><div className="lesson-surface"><div className="ltabs" role="tablist" aria-label={copy.tabsAria}><button type="button" className={tab === "study" ? "active" : ""} role="tab" aria-selected={tab === "study"} onClick={() => switchTab("study")}>1. {studyTabLabel ?? copy.studyTab}</button><button type="button" className={tab === "practice" ? "active" : ""} role="tab" aria-selected={tab === "practice"} onClick={() => switchTab("practice")}>2. {copy.practiceTab}</button></div>
    {sectionPages && sectionPages.length > 1 ? <nav className="lesson-section-pager" aria-label="Chuyển mục bài học">
      <button type="button" className="btn-sm btn-ghost list-pager-step" aria-label="Mục trước" disabled={currentPage <= 0} onClick={() => setPageIndex(currentPage - 1)}><ChevronLeftIcon_ size={16} aria-hidden="true" /></button>
      <select aria-label="Chọn mục" value={currentPage} onChange={(event) => setPageIndex(Number(event.target.value))}>{sectionPages.map((page, index) => <option key={page.key} value={index}>{index + 1}/{sectionPages.length} · {page.label}</option>)}</select>
      <button type="button" className="btn-sm btn-ghost list-pager-step" aria-label="Mục sau" disabled={currentPage >= sectionPages.length - 1} onClick={() => setPageIndex(currentPage + 1)}><ChevronRightIcon_ size={16} aria-hidden="true" /></button>
    </nav> : null}
    <div className="lesson-parts" aria-label={tab === "study" ? copy.studyTab : copy.practiceTab}>{tab === "practice" && practiceContent ? practiceContent : sectionPages ? sectionPages[currentPage]?.items.map(({ part, index }) => renderPart(part, index)) : visible.map((part, index) => renderPart(part, index))}</div>
    {sectionPages && sectionPages.length > 1 ? <nav className="lesson-section-pager lesson-section-pager--bottom" aria-label="Chuyển mục bài học (cuối trang)"><button type="button" className="btn-sm btn-ghost list-pager-step" aria-label="Mục trước" disabled={currentPage <= 0} onClick={() => { setPageIndex(currentPage - 1); window.scrollTo?.({ top: 0 }); }}><ChevronLeftIcon_ size={16} aria-hidden="true" /></button><span className="list-pager-status">{currentPage + 1}/{sectionPages.length} · {sectionPages[currentPage]?.label}</span><button type="button" className="btn-sm btn-ghost list-pager-step" aria-label="Mục sau" disabled={currentPage >= sectionPages.length - 1} onClick={() => setPageIndex(currentPage + 1)}><ChevronRightIcon_ size={16} aria-hidden="true" /></button></nav> : null}
  </div>{vocabularyModal ? <SharedVocabularyModal state={vocabularyModal} speak={operatorLessonSpeak} language={language} close={() => setVocabularyModal(null)} /> : null}</div>;
}

export type OperatorLessonPart = ContentLessonSetVersionView["lessons"][number]["parts"][number];

function operatorLessonAnswer(part: OperatorLessonPart): string {
  const rawAnswer = part.content.answer ?? part.content.modelAnswer ?? part.content.sample;
  return Array.isArray(rawAnswer)
    ? rawAnswer.filter((value): value is string => typeof value === "string" && Boolean(value.trim())).join(", ")
    : typeof rawAnswer === "string" && rawAnswer.trim() ? rawAnswer.trim() : "—";
}

function OperatorCorrectAnswer({ answer, label = "Đáp án đúng:" }: { answer: string; label?: string }) {
  return <div className="operator-correct-answer"><strong>{label}</strong>{" "}<span>{answer}</span></div>;
}

export function OperatorPracticeReview({ sectionNumber, part, headingText }: { sectionNumber: number; part: OperatorLessonPart; /** Replaces "N. Section · English" (e.g. "Câu 1" inside a review section block). */ headingText?: string }) {
  const content = asRecord(part.content) ?? {};
  const text = (...keys: string[]) => keys.map(key => content[key]).find(item => typeof item === "string" && item.trim()) as string | undefined;
  const strings = (key: string) => (asArray(content[key]) ?? []).filter((item): item is string => typeof item === "string" && Boolean(item.trim()));
  const answer = operatorLessonAnswer(part);
  const prompt = normalizeLessonBlankPrompt(text("prompt", "question")) || "—";
  const options = strings("options");
  const heading = <div className="row between"><h2>{headingText ?? `${sectionNumber}. ${operatorPartHeading(part.code, part.title)}`}</h2></div>;
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
    // Speaking is graded by AI against the task (sound + required words + grammar), not the model text.
    return <>
      {heading}
      {source ? <div className="operator-reading-passage">{source}</div> : null}
      <p className="operator-speaking-instruction"><strong>Yêu cầu:</strong> <LessonPromptText value={instruction} /></p>
      <OperatorCorrectAnswer answer={answer} label="Câu trả lời mẫu:" />
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
    // Same list the learner sees: can-do statements only, never bare core words.
    const objectives = learnerObjectiveStatements(content.items);
    return objectives.length
      ? <><p className="lesson-objective-lead">{learnerObjectiveLead(cefr)}</p><ul className="lesson-objective-list" aria-label={copy.objectiveAria}>{objectives.map((objective, index) => <li key={`${objective}-${index}`}>{learnerFacingObjectiveBody(objective)}</li>)}</ul></>
      : <p className="lesson-objective-text">{learnerFacingObjective(conciseLessonObjective(text("text")), cefr)}</p>;
  }
  if (code === "instruction") return <PreviewList values={strings("steps")} />;
  if (code === "vocabulary") {
    const items = (asArray(content.items) ?? []).map(asRecord).filter((item): item is Record<string, unknown> & { word: string } => typeof item?.word === "string");
    const blocks = vocabularyPresentationBlocks(items, content.groups);
    return <div className="vocabulary-list">{blocks.map((block) => block.kind === "group"
      ? <section className="lesson-vocabulary-group" key={`group-${block.umbrella.word}`}><h3 className="lesson-vocabulary-group-heading">TỪ BAO TRÙM {block.umbrella.word}</h3><div className="lesson-vocabulary-group-items">{block.items.map((item) => <OperatorVocabularyCard item={item} index={items.indexOf(item)} media={media} key={item.word} hideUmbrella />)}</div></section>
      : <OperatorVocabularyCard item={block.item} index={items.indexOf(block.item)} media={media} key={block.item.word} />
    )}</div>;
  }
  if (code === "grammar") {
    const formula = text("formula", "theory") || "—";
    // One rule per row, as the learner band shows it (line breaks and top-level ";" rules).
    const formulaLines = grammarFormulaLines(formula);
    const examples = strings("examples").slice(0, 3);
    const exampleAudioUrls = strings("exampleAudioUrls");
    return <div className="operator-study-block"><div className="lesson-study-panel-header"><h2>{copy.grammarHeading}</h2></div><div className="lesson-grammar-copy"><div className="lesson-grammar-formula-row"><p className="lesson-study-focus"><strong>{formulaLines.length > 1 ? formulaLines.map((line, index) => <span className="lesson-grammar-formula-line" style={{ display: "block" }} key={`${index}-${line}`}>{line}</span>) : formula}</strong></p><OperatorAssetAudioButton audioSrc={text("audioUrl")} label={language === "en" ? "Listen to the grammar model" : "Nghe mẫu ngữ pháp"} /></div>{text("usage") ? <p className="lesson-study-explanation">{grammarUsageCopy(text("usage")!)}</p> : null}</div>{examples.length ? <div className="lesson-example-list" aria-label={language === "en" ? "Grammar examples" : "Câu ví dụ ngữ pháp"}>{examples.map((example, index) => { const spoken = sanitizeOperatorGrammarSpeechText(conciseGrammarExample(example)); return <button className="btn-sm btn-ghost lesson-example-card vocabulary-card-sound operator-audio-button" type="button" aria-label={language === "en" ? `Listen to example: ${spoken}` : `Nghe câu ví dụ: ${spoken}`} onClick={() => playOperatorWord(spoken, exampleAudioUrls[index])} key={`${example}-${index}`}><Volume2 size={14} aria-hidden="true" />{conciseGrammarExample(example)}</button>; })}</div> : null}</div>;
  }
  if (code === "pronunciation") {
    const focus = text("focus") || "—";
    const targetSound = pronunciationTarget(focus);
    const referenceWord = pronunciationWords[0]?.word;
    const wordAudioUrls = strings("wordAudioUrls");
    const reviewTargets = (asArray(content.reviewTargets) ?? []).flatMap((value) => {
      const record = asRecord(value);
      if (!record || typeof record.focus !== "string") return [];
      const words = (asArray(record.words) ?? []).flatMap((item) => {
        const word = asRecord(item);
        return typeof word?.word === "string" ? [{ word: word.word, ipa: typeof word.ipa === "string" ? word.ipa : "" }] : [];
      });
      return words.length ? [{ focus: record.focus, words }] : [];
    });
    const renderWords = (words: Array<{ word: string; ipa: string }>, audioUrls: string[] = []) => words.map((item, index) => <button className="btn-sm btn-ghost lesson-example-card vocabulary-card-sound operator-audio-button operator-pronunciation-word-chip" type="button" aria-label={language === "en" ? `Listen to pronunciation word: ${item.word}` : `Nghe từ phát âm: ${item.word}`} onClick={() => playOperatorWord(item.word, audioUrls[index])} key={item.word}><Volume2 size={14} aria-hidden="true" /><strong>{item.word}</strong>{item.ipa ? ` ${item.ipa}` : ""}</button>);
    return <div className="operator-study-block operator-pronunciation"><div className="lesson-study-panel-header"><h2>{copy.pronunciationHeading}</h2></div><div className="lesson-grammar-formula-row"><p className="lesson-study-focus"><strong>{language === "en" ? `Sound ${targetSound}${referenceWord ? ` as in “${referenceWord}”` : ""}` : `Âm ${targetSound}${referenceWord ? ` như trong “${referenceWord}”` : ""}`}</strong></p></div>{text("instruction", "tip") ? <p className="operator-pronunciation-tip lesson-study-explanation">{text("instruction", "tip")}</p> : null}{pronunciationWords.length ? reviewTargets.length > 1 ? <div className="operator-pronunciation-review-targets" aria-label={language === "en" ? "Pronunciation practice words" : "Luyện từ phát âm"}>{reviewTargets.map((target, index) => <section className="operator-pronunciation-review-target" key={`${target.focus}-${index}`}><strong>{target.focus}</strong><div className="operator-pronunciation-words">{renderWords(target.words, index === 0 ? wordAudioUrls : [])}</div></section>)}</div> : <div className="operator-pronunciation-words" aria-label={language === "en" ? "Pronunciation practice words" : "Luyện từ phát âm"}>{renderWords(pronunciationWords.slice(0, 3), wordAudioUrls)}</div> : null}</div>;
  }
  if (code === "listening") {
    const audio = operatorAudioSource(content);
    return <div className="operator-practice-content"><OperatorAudioControl source={audio} /><p className="operator-practice-transcript">{text("script") || (audio.src ? "" : audio.text) || "—"}</p><p className="operator-question"><strong>Câu hỏi:</strong> <LessonPromptText value={text("prompt", "question") || "—"} /></p><AnswerOptions options={strings("options")} answer={text("answer")} /></div>;
  }
  if (code === "reading") return <div className="operator-practice-content"><div className="operator-reading-passage">{text("text", "passage", "script") || "—"}</div><p className="operator-question"><strong>Câu hỏi:</strong> <LessonPromptText value={text("prompt", "question") || "—"} /></p><AnswerOptions options={strings("options")} answer={text("answer")} /></div>;
  if (code === "writing") return <div className="operator-practice-content"><p className="operator-question"><strong>Đề bài:</strong> <LessonPromptText value={text("prompt") || "—"} /></p><AnswerOptions options={strings("options")} answer={text("answer")} /></div>;
  if (code === "word_class" || code === "word_use") return <div className="operator-practice-content"><p className="operator-question"><strong>{code === "word_class" ? "Chọn dạng từ đúng:" : "Chọn cách dùng đúng:"}</strong> <LessonPromptText value={text("prompt", "question") || "—"} /></p><AnswerOptions options={strings("options")} answer={text("answer")} /></div>;
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
  const objectiveStatements = code === "objective" ? learnerObjectiveStatements(content.items) : [];
  if (objectiveStatements.length) {
    add(learnerObjectiveLead(cefr));
    objectiveStatements.forEach(objective => add(learnerFacingObjectiveBody(objective)));
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

function OperatorVocabularyCard({ item, index, media, hideUmbrella = false }: { item: Record<string, unknown>; index: number; media?: { cefr?: string | undefined; lessonId: string; resolveVocabularyImage?: ((lessonId: string, itemIndex: number) => Promise<ContentImageView>) | undefined } | undefined; hideUmbrella?: boolean }) {
  const [modal, setModal] = useState<VocabularyModalState | null>(null);
  const language = learnerLessonLanguageForCefr(media?.cefr ?? "A1");
  const word = String(item.word ?? "—");
  const phrases = (asArray(item.collocations ?? item.phrases ?? item.examples) ?? (typeof item.collocations === "string" ? [item.collocations] : []))
    .filter((entry): entry is string => typeof entry === "string" && Boolean(entry.trim()))
    .slice(0, 3);
  const family = modalWordEntries(item.family);
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
    ...(Array.isArray(item.collocationTranslations) && Array.isArray(item.collocations) ? { collocationTranslations: item.collocationTranslations.map((value) => typeof value === "string" ? value : "") } : {}),
    ...(Array.isArray(item.exampleAudioUrls) ? { exampleAudioUrls: item.exampleAudioUrls.filter((value): value is string => typeof value === "string") } : {}),
    ...(typeof item.audioUrl === "string" && item.audioUrl.trim() ? { audioUrl: item.audioUrl.trim() } : {}),
    ...(family.length ? { family } : {}),
    ...(umbrella && typeof umbrella.word === "string" && umbrella.word.trim() ? { umbrella: { ...modalWordEntries([umbrella])[0]!, meaning: typeof umbrella.meaning === "string" ? umbrella.meaning.trim() : "", siblings: modalWordEntries(umbrella.siblings) } } : {})
  };
  const umbrellaWord = vocabularyItem.umbrella?.word ?? "";
  const siblingCount = (vocabularyItem.umbrella?.siblings ?? []).filter((sibling) => sibling.word.trim().toLocaleLowerCase() !== word.trim().toLocaleLowerCase()).length;
  const relations: VocabularyRelationChip[] = [
    ...(!hideUmbrella && umbrellaWord ? [{ label: `TỪ BAO TRÙM ${umbrellaWord}`, ariaLabel: `Từ bao trùm: ${umbrellaWord}`, icon: "umbrella" as const, tone: "umb" as const, count: siblingCount, onClick: () => setModal({ kind: "umbrella", item: vocabularyItem }) }] : []),
    ...synonyms.map(value => ({ label: value.word, ariaLabel: value.audioUrl ? `Nghe từ đồng nghĩa: ${value.word}` : value.word, tone: "synonym" as const, onClick: value.audioUrl ? () => playOperatorWord(value.word, value.audioUrl) : undefined })),
    ...antonyms.map(value => ({ label: value.word, ariaLabel: value.audioUrl ? `Nghe từ trái nghĩa: ${value.word}` : value.word, tone: "antonym" as const, onClick: value.audioUrl ? () => playOperatorWord(value.word, value.audioUrl) : undefined })),
    ...(family.length ? [{ label: `Word family (${family.length})`, ariaLabel: `Word family (${family.length})`, icon: "family" as const, tone: "family" as const, onClick: () => setModal({ kind: "family", item: vocabularyItem }) }] : [])
  ];
  const loadImage = () => {
    const imageUrl = typeof item.imageUrl === "string" ? item.imageUrl.trim() : "";
    const attribution = contentImageAttribution(item.imageAttribution);
    if (imageUrl && attribution) return Promise.resolve({ status: "available", imageUrl, alt: word, attribution } as const);
    if (media?.resolveVocabularyImage) return media.resolveVocabularyImage(media.lessonId, index);
    return Promise.resolve({ status: "unavailable" } as const);
  };
  // Same Umbrella word / Word family modal as the learner and the operator lesson preview (slang-poetic cards).
  return <><SharedVocabularyCard item={vocabularyItem} loadImage={loadImage} speak={speakOperatorText} relations={relations} />{modal ? <SharedVocabularyModal state={modal} speak={operatorLessonSpeak} language={language} close={() => setModal(null)} /> : null}</>;
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

/** Family / umbrella entries for the shared modal: word, part of speech, IPA, meaning, English definition, audio. */
function modalWordEntries(value: unknown): LessonVocabularyFamilyWord[] {
  const text = (candidate: unknown) => typeof candidate === "string" && candidate.trim() ? candidate.trim() : undefined;
  return (asArray(value) ?? []).flatMap((entry) => {
    if (typeof entry === "string") return entry.trim() ? [{ word: entry.trim() }] : [];
    const record = asRecord(entry);
    const word = text(record?.word);
    if (!record || !word) return [];
    const type = text(record.type); const pronunciation = text(record.pronunciation) ?? text(record.ipa); const meaning = text(record.meaning); const definition = text(record.definition); const audioUrl = text(record.audioUrl);
    return [{ word, ...(type ? { type } : {}), ...(pronunciation ? { pronunciation } : {}), ...(meaning ? { meaning } : {}), ...(definition ? { definition } : {}), ...(audioUrl ? { audioUrl } : {}) }];
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
function AnswerOptions({ options, answer }: { options: string[]; answer?: string | undefined }) { return options.length ? <ul className="operator-answer-options" role="list">{options.map((option, index) => <li className={`operator-answer-choice${option === answer ? " is-answer" : ""}`} key={`${option}-${index}`}><span className="operator-answer-letter">{String.fromCharCode(65 + index)}.</span>{" "}<span>{option}</span>{option === answer ? <Check className="operator-inline-icon" size={15} strokeWidth={2.5} aria-label="Đáp án đúng" /> : null}</li>)}</ul> : answer ? <p className="operator-answer-key"><b>Đáp án mẫu:</b> {answer}</p> : null; }
function humanizeContent(content: Record<string, unknown>): string { return Object.values(content).flatMap(value => Array.isArray(value) ? value : [value]).filter(value => typeof value === "string" || typeof value === "number").join(" · ") || "—"; }

export interface ReviewAdapterDetails {
  aiConnected?: boolean;
  submissions?: Record<string, Pick<ReviewSubmission, "cefr" | "type" | "task" | "guidance" | "requiredVocabulary">>;
  coach?: Record<string, { cefr: Cefr; week: number; sessionId: string }>;
  appeals?: Record<string, Partial<Omit<ReviewAppeal, "id" | "learnerName" | "reason" | "status" | "at" | "decidedSummary">>>;
  tests?: Record<string, { rawLevel?: Cefr; aiSuggestedCefr?: Cefr | null }>;
}

export function adaptReviewAppeal(item: ContentReviewView["appeals"][number]): ReviewAppeal {
  const lessonPart = item.kind === "lesson_part";
  const title = lessonPart
    ? ["Bài học tháng", item.lessonLabel ?? (item.dayNumber == null ? null : `Bài ${item.dayNumber + 1}`), item.lessonTitle].filter(Boolean).join(" · ")
    : item.kind === "assessment" ? item.lessonTitle || "Bài kiểm tra" : "Bài thực hành tuần";
  return {
    id: item.id, learnerName: item.learnerName, title, at: operatorDateTime(item.createdAt),
    status: item.status, reason: item.reason, decidedSummary: item.resolution || null,
    ...(item.overdue ? { overdue: true } : {}),
    ...(item.proposedLevel ? { proposedLevel: item.proposedLevel } : {}),
    ...(item.requestKind === "retake" ? { retakeRequest: true } : {}),
    scope: item.scope, hasEvidence: item.hasEvidence,
    currentScore: item.currentScore,
    ...(item.question ? { question: item.question } : {}),
    ...(item.answer ? { answer: item.answer } : {}),
    aiFeedback: item.aiFeedback ?? null,
    ...(lessonPart ? {
      kind: "part" as const,
      ...(item.cefr ? { cefr: item.cefr as Cefr } : {}),
      part: item.partCode ?? "Phần bài học",
      attempts: item.attempts ?? 0,
      ...(item.options?.length ? { options: item.options } : {}),
      key: item.answerKey ?? null
    } : item.kind === "weekly_practice" ? { kind: "sub" as const } : {})
  };
}

export function adaptReview(source: ContentReviewView, activeTab: keyof typeof REVIEW_TAB_MAP, options: ReviewAdapterDetails = {}): OperatorReviewView {
  const counts = { subs: 0, coach: 0, weekly: 0, appeals: 0, attempts: 0, tests: 0 };
  source.tabs.forEach(tab => { const key = REVIEW_TAB_MAP[tab.key as keyof typeof REVIEW_TAB_MAP]; if (key) counts[key] = tab.unreadCount ?? tab.count; });
  counts.weekly = 0;
  counts.subs = 0;
  counts.appeals = source.appeals.length;
  return {
    activeTab: REVIEW_TAB_MAP[activeTab], counts, aiConnected: options.aiConnected,
    submissions: source.submissions.map(item => { const detail = options.submissions?.[item.id]; return { id: item.id, learnerName: item.learnerName, cefr: (item.cefr ?? detail?.cefr) as Cefr | undefined, week: item.weekNumber, type: item.type ?? detail?.type, submittedAt: operatorDateTime(item.submittedAt), operatorChecked: item.checked, task: item.task ?? detail?.task, guidance: item.guidance ?? detail?.guidance, requiredVocabulary: item.requiredVocabulary ?? detail?.requiredVocabulary, text: item.text, total: item.total, rubric: item.rubric.meaning == null || item.rubric.vocabulary == null || item.rubric.grammar == null ? null : { meaning: item.rubric.meaning, vocab: item.rubric.vocabulary, grammar: item.rubric.grammar }, ...(item.aiGraded === undefined ? {} : { aiGraded: item.aiGraded }), feedback: item.feedback, suggestions: item.suggestions.map(text => ({ original: "", corrected: text, explanation: "" })), ...(item.audioArtifact ? { audioArtifact: item.audioArtifact } : {}) }; }),
    coachTurns: source.coachSamples.map(item => { const detail = options.coach?.[item.id]; return { id: item.id, sessionId: detail?.sessionId ?? item.id, learnerName: item.learnerName, cefr: (item.cefr ?? detail?.cefr) as Cefr | undefined, week: item.weekNumber ?? detail?.week, at: operatorDateTime(item.createdAt), checked: item.checked, userText: item.learnerText, reply: item.coachText, rubric: item.scores.meaning == null || item.scores.vocabulary == null || item.scores.grammar == null ? null : { meaning: item.scores.meaning, vocab: item.scores.vocabulary, grammar: item.scores.grammar }, suggestions: item.suggestions.map(text => ({ original: "", corrected: text, explanation: "" })), ...(item.audioArtifact ? { audioArtifact: item.audioArtifact } : {}) }; }),
    weeklyPractices: (source.weeklyPractices ?? []).map(item => ({ id: item.versionId, week: item.weekNumber, cefr: item.cefr as Cefr, topic: item.topic, status: item.status === "published" ? "approved" : item.status === "review" ? "review" : "draft", version: item.version, task: item.task, guidance: item.guidance, requiredVocabulary: item.requiredVocabulary })),
    appeals: source.appeals.map(item => ({ ...adaptReviewAppeal(item), ...options.appeals?.[item.id] })),
    ...(source.exerciseWarnings ? { exerciseWarnings: source.exerciseWarnings } : {}),
    attempts: source.lessonAttempts.map(item => ({ id: item.id, learnerId: item.learnerId, learnerName: item.learnerName, cefr: item.cefr as Cefr | undefined, lesson: `Bài học tháng · Bài ${item.dayNumber + 1} · ${item.lessonTitle}`, listening: String(item.attempts.listening ?? "chưa làm"), reading: String(item.attempts.reading ?? "chưa làm"), writing: String(item.attempts.writing ?? "chưa làm"), wordClass: String(item.attempts.word_class ?? "chưa làm"), wordUse: String(item.attempts.word_use ?? "chưa làm"), speaking: String(item.attempts.speaking ?? "chưa làm"), total: Object.values(item.attempts).reduce((sum, value) => sum + (value ?? 0), 0), ...(item.audioArtifact ? { audioArtifact: item.audioArtifact } : {}) })),
    tests: source.assessments.map(item => ({ id: item.id, learnerName: item.learnerName, kind: item.kind, status: item.status, submittedAt: item.submittedAt ? operatorDateTime(item.submittedAt) : undefined, total: item.totalScore ?? undefined, ...options.tests?.[item.id] }))
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

type LessonSectionPage<P> = { key: string; label: string; items: Array<{ part: P; index: number }> };
/**
 * A few full section pages for the operator review view on phones/tablets.
 * Study: goals + instructions + words / grammar / sounds (tablets: 2 pages).
 * Practice: 2 exercises per page (tablets: 3), the instructions ride on page 1.
 */
export function operatorLessonSectionPages<P extends { code: string }>(parts: readonly P[], tab: "study" | "practice", tablet: boolean, language: string): Array<LessonSectionPage<P>> {
  const en = language === "en";
  const name = (code: string) => (en
    ? { objective: "Objectives", instruction: "Instructions", vocabulary: "Vocabulary", grammar: "Grammar", pronunciation: "Pronunciation" }
    : { objective: "Mục tiêu", instruction: "Hướng dẫn", vocabulary: "Từ vựng", grammar: "Ngữ pháp", pronunciation: "Phát âm" } as Record<string, string>)[code] ?? code;
  const items = parts.map((part, index) => ({ part, index }));
  const page = (group: typeof items, label: string): LessonSectionPage<P> => ({ key: group.map((item) => `${item.part.code}-${item.index}`).join("+"), label, items: group });
  if (tab === "study") {
    const first = items.filter((item) => ["objective", "instruction", "vocabulary"].includes(item.part.code));
    const grammar = items.filter((item) => item.part.code === "grammar");
    const rest = items.filter((item) => !first.includes(item) && !grammar.includes(item));
    const groups = tablet ? [first, [...grammar, ...rest]] : [first, grammar, rest];
    // Short operator labels for the switcher ("Mục tiêu & từ vựng", "Ngữ pháp", "Phát âm").
    const short = (group: typeof items) => { const codes = new Set(group.map((item) => item.part.code)); if (codes.has("vocabulary") || codes.has("objective")) return "Mục tiêu & từ vựng"; if (codes.has("grammar") && codes.has("pronunciation")) return "Ngữ pháp & phát âm"; if (codes.has("grammar")) return "Ngữ pháp"; if (codes.has("pronunciation")) return "Phát âm"; return name(group[0]!.part.code); };
    return groups.filter((group) => group.length).map((group) => page(group, short(group)));
  }
  const intro = items.filter((item) => item.part.code === "instruction" || item.part.code === "objective");
  const exercises = items.filter((item) => !intro.includes(item));
  const perPage = tablet ? 3 : 2;
  const pages: Array<LessonSectionPage<P>> = [];
  for (let start = 0; start < exercises.length; start += perPage) {
    const group = exercises.slice(start, start + perPage);
    const label = `Bài ${start + 1}–${start + group.length}`;
    pages.push(page(start === 0 ? [...intro, ...group] : group, group.length === 1 ? `Bài ${start + 1}` : label));
  }
  return pages.length ? pages : [page(items, "Bài tập")];
}
