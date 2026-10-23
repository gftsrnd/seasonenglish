import type {
  ArenaView,
  AssessmentSectionCode,
  AssessmentRuntimeView,
  AssessmentViolationInput,
  AssessmentView as AssessmentContractView,
  CoachPersona,
  ContentImageView,
  CoachView as CoachContractView,
  DuelView,
  GameDescriptor,
  GameFinishInput,
  GameHubView,
  LearnerAvatarData,
  LearnerHomeView as LearnerHomeContractView,
  LearnerProfileData,
  LearnerProgressView,
  LessonProgressView,
  LessonLockView,
  LessonView as LessonContractView,
  LevelChallengeView,
  LessonPartAppealView,
  LessonPartAttemptEvidenceInput,
  LessonPartAttemptView,
  LessonPartCode,
  MicroLessonView,
  RewardView,
  SaveAssessmentResponseInput,
  SurveyView,
  WeeklyPracticeView
} from "@e4s/contracts";

export const LEARNER_ROUTES = [
  "/home", "/onboard", "/test/:kind", "/lesson/:id",
  "/coach", "/challenge", "/practice", "/survey", "/profile",
  "/reward/:mode", "/games", "/games/:game", "/arena", "/duel/:id"
] as const;

export type LearnerRoute = (typeof LEARNER_ROUTES)[number];

export interface LearnerHomeView extends LearnerHomeContractView {
  aiAvailable?: boolean;
  weekPhase?: "before_pilot" | "in_pilot" | "after_pilot";
  approvalPending?: boolean;
  placementDraft?: boolean;
  reward?: { points: number; nextPoints: number | null; seasonName: string };
}

export interface OnboardView {
  profile: Partial<LearnerProfileData>;
  mode: "new" | "edit";
  draftAvailable?: boolean;
  saving?: boolean;
  error?: string;
}

export interface AssessmentView extends AssessmentContractView {
  timed?: boolean;
  warningLimit?: number;
  targetLevel?: string | null;
  microphoneSupported?: boolean;
  submitError?: string;
}

export interface LessonView {
  lesson: LessonContractView;
  lock?: LessonLockView | null;
}

export interface MicroView extends MicroLessonView {
  regenerateAvailable?: boolean;
  regenerateError?: string;
}

export type { LessonSpeechOptions, LessonSpeechStatus } from "../../features/experience/contracts.js";
import type { LessonSpeechOptions } from "../../features/experience/contracts.js";

export interface CoachView extends CoachContractView {
  levelApproved?: boolean;
  thinking?: boolean;
  error?: string;
}

export interface ChallengeView extends LevelChallengeView {
  resume?: boolean;
  error?: string;
}

export interface PracticeView extends WeeklyPracticeView {
  aiAvailable?: boolean;
}

export interface ProfileView extends LearnerProgressView {
  profileMissing?: boolean;
  surveyAvailable?: boolean;
}

export type LearnerScreen =
  | { kind: "home"; view: LearnerHomeView }
  | { kind: "onboard"; view: OnboardView }
  | { kind: "assessment"; view: AssessmentView }
  | { kind: "lesson"; view: LessonView }
  | { kind: "coach"; view: CoachView }
  | { kind: "challenge"; view: ChallengeView }
  | { kind: "practice"; view: PracticeView }
  | { kind: "survey"; view: SurveyView }
  | { kind: "profile"; view: ProfileView }
  | { kind: "reward"; view: RewardView }
  | { kind: "games"; view: GameHubView }
  | { kind: "game"; descriptor: GameDescriptor; wordSet: NonNullable<GameHubView["wordSet"]>; result?: { score: number; maxScore: number } | null }
  | { kind: "arena"; view: ArenaView }
  | { kind: "duel"; view: DuelView; descriptor: GameDescriptor };

export interface LearnerCallbacks {
  navigate: (path: string) => void;
  saveProfileDraft: (profile: LearnerProfileData) => void | Promise<void>;
  saveProfile: (profile: LearnerProfileData) => void | Promise<void>;
  startAssessment: () => void | Promise<void>;
  saveAssessmentResponse: (section: AssessmentSectionCode, taskKey: string, input: SaveAssessmentResponseInput) => void | Promise<void>;
  completeAssessmentSection: (section: AssessmentSectionCode) => void | Promise<void>;
  submitAssessment: () => void | Promise<void>;
  /** Records a visibility/focus event; the server remains authoritative for the count and status. */
  recordAssessmentViolation?: (attemptId: string, input: AssessmentViolationInput) => Promise<AssessmentRuntimeView>;
  uploadAssessmentAudio: (file: Blob, filename: string) => Promise<string>;
  getAssessmentAudioReadUrl?: (artifactKey: string) => Promise<{ url: string; expiresAt: string }>;
  recordAssessmentAudioPlay: (section: AssessmentSectionCode, groupKey: string) => Promise<{ playCount: number; remaining: number }>;
  createAssessmentAppeal: (reason: string) => void | Promise<void>;
  saveLessonProgress: (progress: LessonProgressView) => void | Promise<void>;
  submitLessonPartAttempt?: (partCode: LessonPartCode, evidence: LessonPartAttemptEvidenceInput) => Promise<LessonPartAttemptView>;
  appealLessonPart?: (partCode: LessonPartCode, reason: string) => Promise<LessonPartAppealView>;
  resolveLessonVocabularyImage?: (itemIndex: number) => Promise<ContentImageView>;
  submitMicroAnswer: (answer: string) => void | Promise<void>;
  completeMicroLesson: () => void | Promise<void>;
  regenerateMicroLesson: () => void | Promise<void>;
  acknowledgeRewardAnnouncement?: (announcementId: string) => void | Promise<void>;
  sendCoachMessage: (message: string) => void | Promise<void>;
  changeCoachPersona: (persona: CoachPersona) => void | Promise<void>;
  startNewCoachChat: () => void | Promise<void>;
  unlockCoachVocabulary?: (word: string) => void | Promise<void>;
  sendChallengeMessage: (message: string) => void | Promise<void>;
  submitWeeklyPractice: (text: string) => void | Promise<void>;
  appealWeeklyPractice?: (submissionId: string, reason: string) => void | Promise<void>;
  submitSurvey: (answers: { rating: number; comment: string; studyTime: "work" | "outside" | "both" }) => void | Promise<void>;
  saveAvatar: (avatar: LearnerAvatarData) => void | Promise<void>;
  printReward: () => void;
  speak: (text: string, language?: string, options?: LessonSpeechOptions) => void;
  generateGameSet: (topic: string) => void | Promise<void>;
  useWeeklyGameSet: () => void | Promise<void>;
  deleteGameSet: () => void | Promise<void>;
  finishGame: (input: GameFinishInput) => void | Promise<void>;
  resetGameResult: () => void;
  resolveGameWordImage: (setId: string, wordId: string) => Promise<ContentImageView>;
  createDuel: (opponentId: string, game: Exclude<GameDescriptor["key"], "crossword">) => void | Promise<void>;
}
