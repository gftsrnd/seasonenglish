import type { CefrLevel } from "./domain-contract.js";

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

export interface PartEvidence {
  attempts: number;
  answer?: string | undefined;
  score?: number | undefined;
  feedback?: string | undefined;
  artifactKey?: string | undefined;
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
  durationMinutes: number;
  cefr: CefrLevel;
  content: LessonContent;
  progress: LessonProgressView;
}

export interface LessonSummary {
  id: string;
  dayNumber: number;
  title: string;
  status: LessonProgressView["status"];
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
  program: { name: string } | null;
  week: WeekView | null;
  lessons: LessonSummary[];
  nextLesson: LessonSummary | null;
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
  coach: { turnsThisWeek: number; targetTurns: number; href: "/coach" };
  practice: {
    status: "locked" | "available" | "draft" | "submitted" | "reviewed";
    detail: string;
    href: "/practice";
  };
  levelReadiness: LevelReadinessView;
  finalAssessment: { available: boolean; label: string; href: "/test/final" };
}

export type LevelReadinessKey = "lessonCompletion" | "firstTryAccuracy" | "weeklyPractice" | "coachRubric";

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
  windowDays: 14;
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
  stats: { completedLessons: number; coachTurns: number; studyDays: number };
  assessments: { placement: AssessmentSnapshot | null; final: AssessmentSnapshot | null };
  finalAssessmentAvailable: boolean;
}

export interface MicroLessonView {
  id: string;
  topic: string;
  cefr: CefrLevel;
  durationMinutes: number;
  theory: string;
  vocabulary: string[];
  practice: { prompt: string; type: "mcq" | "write" | "say"; options?: string[] };
  attempt?: { answer: string; attempts: number; correct: boolean | null };
  feedback?: { status: "waiting" | "ready" | "error"; message: string };
  completedAt?: string;
}
