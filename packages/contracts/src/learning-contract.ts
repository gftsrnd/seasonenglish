import type { RequestEvidenceView } from "./request-evidence-contract.js";
import type { CefrLevel } from "./domain-contract.js";
import type { ContentImageAttribution } from "./media-contract.js";

export type LessonPartCode =
  | "objective"
  | "instruction"
  | "vocabulary"
  | "grammar"
  | "pronunciation"
  | "listening"
  | "reading"
  | "writing"
  | "word_class"
  | "word_use"
  | "speaking";

export type PilotPhase = "before_pilot" | "in_pilot" | "after_pilot";
export type LevelUpPhase = "none" | "eligible" | "testing" | "ungraded" | "challenge" | "requested" | "approved" | "failed";

export interface RewardAnnouncementView {
  kind: "normal" | "new-level-announcement" | "level-adjustment" | "top-level-redirect";
  points: number;
  nextPoints: number | null;
  seasonName: string;
  level?: CefrLevel | null;
  /** Stable server key used to acknowledge a one-time celebration. */
  announcementId?: string;
  source?: "genuine" | "simulated";
  rule?: string;
}

export interface LearnerAvatarData {
  color: "ink" | "brown" | "olive" | "taupe" | "orange" | "rose";
  acc: "none" | "leaf" | "sun" | "flower" | "cloud" | "star" | "drop" | "snow";
  bg: 0 | 1 | 2 | 3 | 4 | 5;
}

export interface LearnerProfileData {
  fullName: string;
  email: string;
  department?: string;
  position?: string;
  contact?: string;
  goals: string[];
  environmentUse: string;
  familyUse: string;
  habits: string[];
  situations?: string;
  learningStyles: string[];
  explanationLanguage?: "auto" | "vi" | "en";
  durationMinutes: 5 | 10 | 15 | 20;
  device: "phone" | "computer" | "both";
  selfLevel: CefrLevel | "unknown";
  certificates?: Array<{ type: string; result: string; year?: string }>;
  experience?: string;
  concerns?: string;
  avatar?: LearnerAvatarData;
}

export interface LearnerProfileView {
  profile: LearnerProfileData;
  completed: boolean;
  draftAvailable?: boolean;
  version: number;
  updatedAt: string;
}

export interface LessonPart {
  code: LessonPartCode;
  title: string;
  content: Record<string, unknown>;
}

export interface LessonContent {
  parts: LessonPart[];
}

/** Stable pronunciation payload used by learner/operator adapters. */
export interface LessonPronunciationContent {
  focus: string;
  tip?: string;
  instruction?: string;
  words: Array<{ word: string; ipa?: string }>;
  /** Aligns by index with `words` and contains whole-word clips. */
  wordAudioUrls?: string[];
}

export type VocabularyLexicalKind = "synonym" | "antonym" | "slang" | "poetic";

export interface LessonVocabularyFamilyWord {
  word: string;
  type?: string;
  meaning?: string;
  pronunciation?: string;
  audioUrl?: string;
}

export interface LessonVocabularySynonym {
  word: string;
  level: CefrLevel;
  /** Vietnamese meaning (A1–A2; older lessons at every level). */
  note?: string;
  /** B1–C1: short simple-English definition shown instead of the Vietnamese meaning. */
  definition?: string;
  pronunciation?: string;
  audioUrl?: string;
}

export interface LessonVocabularyUmbrella {
  word: string;
  meaning: string;
  audioUrl?: string;
  siblings: LessonVocabularyFamilyWord[];
}

export interface LessonVocabularyLexicalDetail {
  kind: VocabularyLexicalKind;
  word: string;
  definition?: string;
  example?: string;
  context?: string;
  note?: string;
  source?: string;
}

/** Enriched vocabulary supplied by published lesson content. */
export interface LessonVocabularyItem {
  word: string;
  type?: string;
  pronunciation?: string;
  meaning?: string;
  /** Optional recorded pronunciation; browser TTS is used when absent. */
  audioUrl?: string;
  /** Optional published image; usable only when imageAttribution is complete. */
  imageUrl?: string;
  imageQuery?: string;
  imageAttribution?: ContentImageAttribution;
  examples?: string[];
  collocations?: string[];
  /** Recorded audio aligned by index with collocations; browser TTS is the fallback. */
  collocationAudioUrls?: string[];
  /** Recorded audio aligned by index with examples; browser TTS is the fallback. */
  exampleAudioUrls?: string[];
  family?: LessonVocabularyFamilyWord[];
  synonyms?: LessonVocabularySynonym[];
  antonyms?: LessonVocabularySynonym[];
  umbrella?: LessonVocabularyUmbrella;
  /** An explicitly empty array means the learner can open the empty detail state. */
  lexicalDetails?: LessonVocabularyLexicalDetail[];
}

export interface LessonVocabularyContent {
  items: LessonVocabularyItem[];
}

export interface LessonLockView {
  /** "review": the previous week's Friday review gates this lesson. */
  reason: "prior" | "date" | "review";
  message: string;
  dayNumber: number;
  totalLessons: number;
  /** `label` (monthly): learner-facing name of the blocking day, "Bài N" (new lessons only) or "Ôn tuần N". */
  blocker?: { id: string; dayNumber: number; title: string; label?: string };
  opensAt?: string;
  /** Calendar week of the gating Friday review (reason "review"). */
  reviewWeekNumber?: number;
}

export type LessonPartOutcome =
  | "unanswered"
  | "wrong_retry"
  | "wrong_exhausted"
  | "correct"
  | "submitted"
  | "translated"
  | "appealed";

export interface PartEvidence {
  firstTryCorrect?: boolean;
  appealStatus?: "pending" | "accepted" | "rejected";
  attempts: number;
  /** Set by the lesson-attempt endpoint; React must not infer this state. */
  status?: LessonPartOutcome;
  /** Viewing a translation is informational and must never consume an attempt or complete a part. */
  translationViewed?: boolean | undefined;
  answer?: string | undefined;
  score?: number | undefined;
  feedback?: string | undefined;
  artifactKey?: string | undefined;
  /**
   * Daily Speaking / self-written Writing graded by AI in the background:
   * "pending" while the result is on its way (the part shows "đang chờ chấm"),
   * "operator" when AI could not grade it and the operator review keeps it.
   */
  aiGrading?: "pending" | "operator" | undefined;
}

export interface LessonPartAttemptEvidenceInput {
  answer?: string;
  artifactKey?: string;
  translated?: boolean;
}

/** Vietnamese translation of a finished exercise question and its correct answer. */
export interface LessonExerciseTranslationView {
  question: string;
  answer: string;
}

export interface LessonPartAttemptView {
  lessonId: string;
  partCode: LessonPartCode;
  evidence: PartEvidence;
  progress: LessonProgressView;
  /**
   * Vietnamese translation of the question and its correct answer, sent only
   * once the part is finished (correct or attempts used); never before.
   */
  translation?: LessonExerciseTranslationView;
}

export interface LessonPartAppealView {
  lessonId: string;
  partCode: LessonPartCode;
  status: "pending" | "accepted" | "rejected";
  reason: string;
  evidence: PartEvidence;
  createdAt: string;
  progress: LessonProgressView;
}

export interface LessonProgressView {
  status: "not_started" | "in_progress" | "completed";
  completedPartCodes: LessonPartCode[];
  evidence: Partial<Record<LessonPartCode, PartEvidence>>;
  score?: number | undefined;
  updatedAt?: string | undefined;
}

export interface LessonView {
  exerciseVersionId?: string;
  /** Authoritative monthly teaching label, independent of the calendar row ID. */
  teachingLabel?: string;
  newLessonNumber?: number;
  id: string;
  title: string;
  dayNumber: number;
  weekNumber: number;
  weekTopic: string;
  durationMinutes: number;
  cefr: CefrLevel;
  content: LessonContent;
  progress: LessonProgressView;
  /** Server-derived access state; clients must not infer lesson locks. */
  lock?: LessonLockView | null;
  /** Monthly calendar kind; "review" lessons use the weekly review session. */
  kind?: "new" | "review";
}

export interface LessonSummary {
  teachingLabel?: string;
  newLessonNumber?: number;
  id: string;
  dayNumber: number;
  title: string;
  status: LessonProgressView["status"];
  /** Server-derived access state; clients must not infer lesson locks. */
  lock?: LessonLockView | null;
  /** Monthly calendar metadata; absent for retired weekly records. */
  lessonDate?: string;
  kind?: "new" | "review";
}

export interface WeekView {
  id: string;
  weekNumber: number;
  topic: string;
  description: string;
  objectives: string[];
}

export interface MonthView {
  month: string;
  themeTitle: string;
  themeBrief: string;
  communicationGoal: string;
  examDate: string;
  /** Manager-controlled system date used for access and attendance. */
  systemDate?: string;
  holidays?: readonly { date: string; name: string }[];
}

export interface MonthlyExamView {
  status: "unpublished" | "locked" | "ready" | "completed";
  completedLessons: number;
  totalLessons: number;
  remainingLessons: number;
  requirement: string;
  certificateEligible: boolean;
  inProgress?: boolean;
}

/** Attendance gate available before the Operator publishes a monthly form. */
export interface MonthlyExamEligibilityView {
  month: string;
  systemDate: string;
  examDate: string;
  /** Weekdays that count for attendance; the exam day is excluded. */
  effectiveDays: number;
  /** Distinct calendar dates with at least one completed lesson. */
  attendedDays: number;
  /** Effective dates that have ended without attendance. */
  absenceDays: number;
  maxAbsences: number;
  attendanceEligible: boolean;
  /** Attendance exception granted by an approved or automatically approved complaint. */
  attendanceOverride?: boolean;
  /** The server-derived gate may be used only when the exam date opens. */
  accessState: "tracking" | "eligible" | "appeal_required";
  opensAt: string;
  /** The last entry boundary for the regular or complaint window. */
  closesAt: string | null;
  entryClosed?: boolean;
  /** Canonical access gates; optional while older clients roll out. */
  scheduledLessons?: number;
  completedLessons?: number;
  lessonsEligible?: boolean;
  seasonTurns?: number;
  seasonTurnsRequired?: number;
  seasonEligible?: boolean;
  frameworkApproved?: boolean;
  formPublished?: boolean;
  windowOpen?: boolean;
  accessEligible?: boolean;
  reasons?: string[];
}

export interface LearnerAcademicAppealView extends RequestEvidenceView {
  readonly partCode?: LessonPartCode | null;
  readonly id: string;
  readonly kind: "lesson" | "assessment" | "practice";
  readonly title: string;
  readonly reason: string;
  readonly status: "pending" | "accepted" | "rejected";
  readonly resolution: string | null;
  readonly createdAt: string;
}

export interface LearnerHomeView {
  onboardingRequired: boolean;
  onboardingDraftAvailable?: boolean;
  learner: { displayName: string; cefr: CefrLevel | null };
  program: { name: string; weekCount: number; cycleNumber?: number } | null;
  week: WeekView | null;
  /** The approved monthly learning contract takes precedence over legacy weekly content. */
  month?: MonthView | null;
  /** No approved monthly framework exists for this learner's level yet. */
  monthlyPreparation?: boolean;
  monthlyStartDate?: string;
  monthlyLessonsLocked?: boolean;
  /** Attendance eligibility is available even before a framework or form is published. */
  monthlyEligibility?: MonthlyExamEligibilityView;
  monthlyExam?: MonthlyExamView | null;
  passCourse?: { status: "ready" | "in_progress" | "pending_review" };
  lessons: LessonSummary[];
  nextLesson: LessonSummary | null;
  microLesson?: {
    id: string;
    topic: string;
    durationMinutes: number;
    completed: boolean;
  } | null;
  microGenerationAvailable?: boolean;
  metrics: {
    completedLessons: number;
    totalLessons: number;
    studyDays: number;
    streakDays: number;
    points: number;
    completedReviews?: number;
    totalReviews?: number;
    monthlyExamStatus?: "unpublished" | "locked" | "ready" | "completed";
  };
  /** Server-derived reminder after at least three consecutive absences. */
  inactivityReminder?: { inactiveDays: number };
  schedule: {
    daysPerWeek: number;
    lessonMinutes: number;
    days: Array<{ label: string; date: string; status: "attended" | "today" | "missed" | "upcoming" }>;
  };
  coach: { turnsToday?: number; turnsThisWeek: number; targetTurns: number; href: "/coach" };
  practice: {
    status: "locked" | "open" | "draft" | "submitted" | "reviewed";
    detail: string;
    href: "/practice";
  };
  levelReadiness: LevelReadinessView;
  /** Lifecycle fields are server-derived; older clients may omit them while rolling out. */
  pilotPhase?: PilotPhase;
  levelUpPhase?: LevelUpPhase;
  monthlyGoal?: string | null;
  rewardAnnouncement?: RewardAnnouncementView;
}

export type LevelReadinessKey = "lessonCompletion" | "firstTryAccuracy" | "weeklyPractice" | "coachRubric" | "wrongRate";

export interface LevelReadinessMetric {
  key: LevelReadinessKey;
  label: string;
  current: number;
  target: number;
  display: string;
  met: boolean;
}

export interface LevelReadinessView {
  targetLevel: CefrLevel | null;
  windowDays: number;
  eligible: boolean;
  examAvailable: boolean;
  criteria: LevelReadinessMetric[];
  /** Six eligible monthly records used by the canonical level-up policy. */
  monthlyPolicy?: {
    requiredMonths: number;
    eligibleMonths: number;
    finalPasses: number;
    finalPassesRequired: number;
    finalAverage: number | null;
    finalAverageTarget: number;
    seasonMonths: number;
    seasonMonthsRequired: number;
    latestFinalPassed: boolean;
    absenceCap: number;
    absenceRate: number;
    reasons: string[];
  };
}

export interface SeasonLevelView {
  key: "spring" | "summer" | "autumn" | "winter";
  level: 1 | 2 | 3 | 4;
  name: string;
  pointsRequired: number;
}

export interface BadgeRoadmapItem {
  key: string;
  label: string;
  description: string;
  seasonLevel: 2 | 3 | 4;
  earned: boolean;
}

export interface AssessmentSnapshot {
  totalScore: number;
  approvedLevel: CefrLevel | null;
  sections: Partial<Record<"listening" | "reading" | "writing" | "speaking", number>>;
  sectionMaxScores?: AssessmentSnapshot["sections"];
}

export interface LearnerProgressView {
  learner: {
    id: string;
    displayName: string;
    cefr: CefrLevel | null;
    profile: Partial<LearnerProfileData>;
  };
  points: number;
  badges: Array<{ key: string; label: string }>;
  weeks: Array<{
    weekNumber: number;
    topic: string;
    completedLessons: number;
    totalLessons: number;
    days?: Array<{
      label: "T2" | "T3" | "T4" | "T5" | "T6";
      status: "on_time" | "late" | "upcoming";
    }>;
  }>;
  /** Present only while the learner is enrolled in an approved monthly learning cycle. */
  monthlyProgress?: {
    month: string;
    themeTitle: string;
    examDate: string;
    completedLessons: number;
    totalLessons: number;
    days: Array<{
      lessonNumber: number;
      status: LessonProgressView["status"];
      opensAt: string | null;
      lessonDate?: string;
      kind?: "new" | "review";
    }>;
    exam: { status: "unpublished" | "locked" | "ready" | "completed"; totalScore: number | null };
  };
  /** Suppress retired pilot/weekly progress while the next monthly framework is prepared. */
  monthlyPreparation?: boolean;
  /** Attendance eligibility is available even before a framework or form is published. */
  monthlyEligibility?: MonthlyExamEligibilityView;
  studyDays: number;
  activity: Array<{
    type: string;
    minutes: number;
    occurredAt: string;
    evidence: Record<string, unknown>;
  }>;
  season: {
    current: SeasonLevelView;
    next: SeasonLevelView | null;
    earnedBadgeCount: number;
    requiredBadgeCount: number;
  };
  badgeRoadmap: BadgeRoadmapItem[];
  levelReadiness: LevelReadinessView;
  stats: { completedLessons: number; coachTurns: number; coachTurnsToday?: number; studyDays: number };
  assessments: { placement: AssessmentSnapshot | null; passCourse?: AssessmentSnapshot };
}

export interface MicroLessonView {
  id: string;
  topic: string;
  cefr: CefrLevel;
  durationMinutes: number;
  /** Server-derived capability for the learner's "Tạo bài khác" action. */
  regenerateAvailable?: boolean;
  theory: string;
  vocabulary: string[];
  practice: { prompt: string; type: "mcq" | "write" | "fill"; options?: string[] };
  attempt?: { answer: string; attempts: number; correct: boolean | null; score?: number };
  feedback?: { status: "waiting" | "ready" | "error"; message: string };
  completedAt?: string;
}


