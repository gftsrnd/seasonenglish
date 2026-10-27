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
  kind: "normal" | "new-level-announcement" | "top-level-redirect";
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
  persona: "informal" | "formal";
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
  note?: string;
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
  reason: "prior" | "date";
  message: string;
  dayNumber: number;
  totalLessons: number;
  blocker?: { id: string; dayNumber: number; title: string };
  opensAt?: string;
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
  attempts: number;
  /** Set by the lesson-attempt endpoint; React must not infer this state. */
  status?: LessonPartOutcome;
  /** Viewing a translation is informational and must never consume an attempt or complete a part. */
  translationViewed?: boolean | undefined;
  answer?: string | undefined;
  score?: number | undefined;
  feedback?: string | undefined;
  artifactKey?: string | undefined;
}

export interface LessonPartAttemptEvidenceInput {
  answer?: string;
  artifactKey?: string;
  translated?: boolean;
}

export interface LessonPartAttemptView {
  lessonId: string;
  partCode: LessonPartCode;
  evidence: PartEvidence;
  progress: LessonProgressView;
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
}

export interface LessonSummary {
  id: string;
  dayNumber: number;
  title: string;
  status: LessonProgressView["status"];
  /** Server-derived access state; clients must not infer lesson locks. */
  lock?: LessonLockView | null;
}

export interface WeekView {
  id: string;
  weekNumber: number;
  topic: string;
  description: string;
  objectives: string[];
}

export interface LearnerHomeView {
  onboardingRequired: boolean;
  learner: { displayName: string; cefr: CefrLevel | null };
  program: { name: string; weekCount: number } | null;
  week: WeekView | null;
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
  };
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
  assessments: { placement: AssessmentSnapshot | null };
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
