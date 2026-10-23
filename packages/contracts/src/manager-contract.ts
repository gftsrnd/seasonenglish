import type { AccountRole, CefrLevel } from "./domain-contract.js";
import type { AssessmentDeletionRequestView } from "./assessment-contract.js";
import type { LearnerProfileData } from "./learning-contract.js";
import type { ContentImageAttribution } from "./media-contract.js";

export interface ManagerProgressView {
  readonly organizationName: string;
  readonly currentWeek: number;
  readonly pilotWeeks: number;
  /** Monday of the server-selected pilot week; used to render attendance dots without guessing calendar state. */
  readonly weekStartDate?: string;
  readonly summary: {
    readonly learnerCount: number;
    readonly activeLearnersThisWeek: number;
    readonly completedLessons: number;
    readonly pendingAssessments: number;
    readonly completedLearners: number;
    readonly surveyCount: number;
    readonly satisfactionAverage: number | null;
  };
  readonly activityByDay?: readonly {
    readonly date: string;
    readonly activeLearners: number;
    readonly sessions: number;
    readonly minutes: number;
  }[];
  readonly regularByWeek?: readonly {
    readonly week: number;
    readonly regularLearners: number;
    readonly totalLearners: number;
    readonly percent: number;
  }[];
  readonly learners: readonly {
    readonly learnerId: string;
    readonly learnerName: string;
    readonly cefr: CefrLevel | null;
    readonly completedLessons: number;
    readonly totalLessonsThisWeek: number;
    readonly sessionsThisWeek: number;
    readonly coachTurnsThisWeek: number;
    readonly weeklyPracticeScore: number | null;
    readonly weeklyPracticeStatus: "not_submitted" | "pending_review" | "scored";
    readonly rewardPoints: number;
    readonly earnedBadges: readonly string[];
    /** Earned badge metadata is sourced from the organisation badge catalogue. */
    readonly earnedBadgeDetails?: readonly {
      readonly key: string;
      readonly label: string;
      readonly description: string;
    }[];
    /** ISO dates with recorded learner activity in the selected pilot week. */
    readonly activityDatesThisWeek?: readonly string[];
    readonly placementScore: number | null;
    /** Lifecycle of the latest placement attempt; absent keeps older clients backward compatible. */
    readonly placementStatus?: "not_started" | "in_progress" | "submitted";
    /** Source state for the latest submitted placement attempt, shown to Managers. */
    readonly placementScoring?: "ai" | "human" | "automatic" | "pending" | null;
    readonly missedDays: number | null;
    readonly lastActivityAt: string | null;
  }[];
}

export interface ManagerOperationsView {
  readonly organizationName: string;
  readonly currentWeek: number;
  readonly pilotWeeks: number;
  readonly content: {
    readonly draft: number;
    readonly inReview: number;
    readonly published: number;
  };
  readonly queues: {
    readonly assessmentReview: number;
    readonly practiceReview: number;
  };
  readonly automation: {
    readonly pendingJobs: number;
    readonly aiFailures: number;
  };
  readonly readiness?: {
    readonly requiredSets: number;
    readonly readySets: number;
    readonly missing: readonly {
      readonly week: number;
      readonly cefr: CefrLevel;
      readonly state: "missing" | "draft";
    }[];
    readonly orphanLegacySets: number;
  };
  readonly recentActivity: readonly {
    readonly id: string;
    readonly action: string;
    readonly createdAt: string;
  }[];
  readonly operators: readonly {
    readonly operatorId: string;
    readonly operatorName: string;
    readonly byWeek: readonly { readonly week: number; readonly sets: number; readonly lessons: number; readonly approved: number }[];
    readonly sets: number;
    readonly lessons: number;
    readonly published: number;
    readonly fullLessons: number | null;
    readonly editedLessons: number | null;
    readonly completions: number;
    readonly averageScore: number | null;
    readonly firstTryPercent: number | null;
    readonly failedPercent: number | null;
    readonly averageAttempts: number | null;
    readonly approvals: number;
    readonly averageApprovalHours: number | null;
    readonly reviewedSubmissions: number;
    readonly reviewedCoachTurns: number;
  }[];
}

export interface ManagerAccountView {
  readonly id: string;
  readonly displayName: string;
  readonly email: string | null;
  readonly role: AccountRole;
  readonly status: string;
  readonly createdAt: string;
  /** Learner-facing data shown in the Operator directory when available. */
  readonly cefr?: CefrLevel | null;
  readonly placementScore?: number | null;
}

export interface ManagerAccountsView {
  readonly organizationName: string;
  readonly accounts: readonly ManagerAccountView[];
}

/** Read-only organisation snapshot available to Operators; no account mutation is exposed. */
export interface OperatorSettingsOverviewView {
  readonly organizationName: string;
  /** Full persisted settings so Operators can edit and save the same runtime configuration. */
  readonly settings: ManagerSettingsView;
  readonly pilot: {
    readonly startDate: string;
    readonly weeks: number;
    readonly weekOverride: number;
    readonly minMinutesPerDay: number;
    readonly courseTheme: string;
    readonly coachDailyLimit: number;
  };
  readonly test: {
    readonly timed: boolean;
    readonly times: ManagerSettingsView["testTimes"];
    readonly warnLimit: number;
  };
  readonly levelUp: ManagerSettingsView["levelUp"];
  readonly accounts: readonly ManagerAccountView[];
}

export interface ManagerReminderCandidateView {
  readonly learnerId: string;
  readonly learnerName: string;
  readonly cefr: CefrLevel | null;
  readonly lastActivityAt: string | null;
  readonly missedDays?: number;
}

export interface ManagerReminderHistoryView {
  readonly reminderId: string;
  readonly learnerId: string;
  readonly learnerName: string;
  readonly missedDays: number | null;
  readonly status: string;
  readonly deliveryStatus: string | null;
  readonly provider: string | null;
  readonly createdAt: string;
  readonly attemptedAt: string | null;
}

export interface ManagerRemindersView {
  readonly organizationName: string;
  readonly inactiveDays: number;
  readonly webhookConfigured?: boolean;
  readonly candidates: readonly ManagerReminderCandidateView[];
  readonly history?: readonly ManagerReminderHistoryView[];
}

export interface ManagerReminderSendView {
  readonly reminderId: string;
  readonly learnerId: string;
  readonly status: "queued";
  /** The request is queued locally; it is not reported as delivered before a provider confirms it. */
  readonly deliveryStatus?: "queued";
  readonly provider?: "local_queue" | "base_webhook";
}

export interface ManagerReminderDismissView {
  readonly reminderId: string;
  readonly learnerId: string;
  readonly status: "dismissed";
}

export interface ManagerReminderCopyView {
  readonly reminderId: string;
  readonly learnerId: string;
  readonly status: "copied";
}

/** Manager-only learner quick view; profile data is public learner data only. */
export interface ManagerLearnerProfileView {
  readonly learner: {
    readonly id: string;
    readonly displayName: string;
    readonly email: string | null;
    readonly status: string;
    readonly createdAt: string;
    readonly currentLevel: CefrLevel | null;
  };
  readonly profile: Partial<LearnerProfileData>;
  readonly metrics: {
    readonly completedLessons: number;
    readonly totalLessons: number;
    readonly coachTurns: number;
    readonly studyDays: number;
    readonly rewardPoints: number;
    readonly lastActivityAt: string | null;
  };
}

export interface ManagerDeleteRequestsView {
  readonly requests: readonly AssessmentDeletionRequestView[];
}

export interface ManagerTrashAccountView {
  readonly id: string;
  readonly displayName: string;
  readonly email: string | null;
  readonly role: AccountRole;
  readonly status: "deleted";
  readonly deletedAt: string;
}

export interface ManagerTrashView {
  readonly accounts: readonly ManagerTrashAccountView[];
}

/** One-shot confirmation issued by the server before an irreversible purge. */
export interface ManagerPurgeConfirmationView {
  readonly accountId: string;
  readonly token: string;
  readonly confirmationPhrase: "XOA VINH VIEN";
  readonly countdownSeconds: 5;
  readonly expiresAt: string;
}

export interface ManagerPurgeConfirmationInput {
  readonly confirmationToken: string;
  readonly confirmationPhrase: string;
}

export type ManagerMaintenanceAction = "seed_demo" | "wipe_data";

export interface ManagerMaintenanceConfirmationView {
  readonly action: ManagerMaintenanceAction;
  readonly token: string;
  readonly confirmationPhrase: "GHI DE TOAN BO" | "XOA TOAN BO";
  readonly countdownSeconds: 5;
  readonly expiresAt: string;
  /** Server-side export captured before the destructive action. */
  readonly backupId: string;
}

export interface ManagerMaintenanceConfirmationInput {
  readonly confirmationToken: string;
  readonly confirmationPhrase: string;
}

export interface ManagerMaintenanceResultView {
  readonly action: ManagerMaintenanceAction;
  readonly completed: true;
  readonly backupId: string;
  readonly completedAt: string;
}

export interface ManagerPinReportView {
  readonly id: string;
  readonly subjectUserId: string;
  readonly subjectName: string;
  readonly note: string;
  readonly status: "open" | "done";
  readonly createdAt: string;
  readonly resolvedAt: string | null;
}

export interface ManagerPinReportsView {
  readonly reports: readonly ManagerPinReportView[];
}

export interface ManagerImageTestView {
  readonly status: "available" | "unavailable";
  readonly source: ProductPreferencesView["vocabImageSource"];
  readonly provider: "wikipedia" | "wikimedia" | "openverse" | "pixabay" | "explicit" | null;
  readonly cached: boolean;
  readonly imageUrl: string | null;
  readonly attribution: ContentImageAttribution | null;
  readonly testedAt: string;
}

export interface ManagerMusicTestView {
  readonly status: "valid" | "invalid";
  readonly checkedAt: string;
}

export interface ManagerWebhookTestView {
  readonly status: "success" | "error" | "timeout";
  readonly statusCode: number | null;
  /** Stable, redacted diagnostic code; never include a webhook URL, payload or response body. */
  readonly code: string | null;
  readonly testedAt: string;
}

export interface ManagerDataExportView {
  readonly version: 1;
  readonly exportedAt: string;
  readonly organization: { readonly id: string; readonly name: string };
  readonly settings: ManagerSettingsInput;
  readonly accounts: readonly ManagerAccountView[];
  readonly progress: Pick<ManagerProgressView, "summary" | "learners"> | null;
}

export interface ManagerDataImportView {
  readonly imported: true;
}

export interface ManagerReportView {
  readonly organizationName: string;
  readonly generatedAt: string;
  readonly currentWeek: number;
  readonly pilotWeeks: number;
  readonly progress: ManagerProgressView["summary"];
  readonly learners: ManagerProgressView["learners"];
  readonly activityByDay?: ManagerProgressView["activityByDay"];
  readonly regularByWeek?: ManagerProgressView["regularByWeek"];
  readonly levelDistribution?: readonly { readonly cefr: CefrLevel; readonly learners: number }[];
  readonly totals?: {
    readonly approvedLessonSets: number;
    readonly approvedLessons: number;
    readonly coachTurns: number;
    readonly practiceSubmissions: number;
    readonly reviewedPracticeSubmissions: number;
    readonly reminders: number;
    readonly appeals: number;
    readonly pendingAppeals: number;
  };
  readonly surveyResponses?: readonly {
    readonly learnerId: string;
    readonly learnerName: string;
    readonly rating: number;
    readonly comment: string;
    readonly studyTime: "work" | "outside" | "both" | null;
    readonly submittedAt: string;
  }[];
  readonly operations: Pick<ManagerOperationsView, "content" | "queues" | "automation">;
}

export interface ManagerSettingsView {
  readonly organizationName: string;
  readonly programName: string;
  readonly reminderInactiveDays: number;
  readonly weeklyReportEnabled: boolean;
  readonly pilotStartDate: string;
  readonly pilotWeeks: number;
  readonly weekOverride: number;
  readonly minMinutesPerDay: number;
  readonly courseTheme: string;
  readonly coachDailyLimit: number;
  readonly testTimed: boolean;
  readonly testTimes: { readonly listening: number; readonly reading: number; readonly writing: number; readonly speaking: number };
  readonly testWarnLimit: number;
  readonly levelUp: {
    readonly days: number; readonly lessons: number; readonly firstTry: number; readonly submission: number;
    readonly coach: number; readonly coachTurns: number; readonly wrong: number; readonly minParts: number;
  };
  readonly backgroundMusic: { readonly enabled: boolean; readonly url: string; readonly volume: number };
  readonly baseWebhookUrl: string;
  readonly baseWebhookTemplate: string;
}

export type ManagerSettingsInput = Omit<ManagerSettingsView, "organizationName">;

export type ManagerProviderKind = "claude" | "gemini" | "openai";

export interface ManagerProviderCapabilities {
  readonly chat: boolean;
  readonly structuredOutput: boolean;
  readonly speechToText: boolean;
}

export type ManagerProviderTestStatus = "never" | "success" | "error" | "timeout";

export interface ManagerProviderTestView {
  readonly status: ManagerProviderTestStatus;
  readonly testedAt: string | null;
  /** Stable, redacted diagnostic code; never include provider response text. */
  readonly code: string | null;
}

export interface ManagerProviderSettingsView {
  readonly provider: ManagerProviderKind;
  readonly configured: boolean;
  readonly baseUrl: string;
  readonly model: string;
  readonly speechToTextModel: string;
  readonly capabilities?: ManagerProviderCapabilities;
  readonly lastTest?: ManagerProviderTestView;
}

export interface ManagerProviderSettingsInput {
  readonly provider: ManagerProviderKind;
  readonly baseUrl: string;
  readonly model: string;
  readonly speechToTextModel: string;
  /** Optional replacement; an omitted/blank value retains the server-side secret. */
  readonly credential?: string | undefined;
}

export interface ManagerProviderSettingsTestInput {
  readonly provider?: ManagerProviderKind | undefined;
  readonly baseUrl?: string | undefined;
  readonly model?: string | undefined;
  readonly speechToTextModel?: string | undefined;
  readonly credential?: string | undefined;
}

export interface SystemCapabilitiesView {
  readonly api: true;
  readonly database: true;
  readonly ai: boolean;
  /** Whether Manager has saved an encrypted provider credential for this organization. */
  readonly aiConfigured?: boolean;
  readonly aiProvider?: ManagerProviderKind | null;
  readonly aiModel?: string | null;
  readonly aiLastTest?: ManagerProviderTestStatus | null;
  readonly objectStorage: boolean;
  /** Only configuration readiness is exposed; provider credentials never leave the API. */
  readonly imageProviders: {
    readonly pexels: boolean;
    readonly pixabay: boolean;
  };
  /** Demo seed/wipe are available only when the API explicitly enables local maintenance. */
  readonly maintenance?: boolean;
}

export interface ProductPreferencesView {
  readonly theme: "auto" | "spring" | "summer" | "autumn" | "winter" | "tet" | "midautumn" | "christmas";
  readonly vocabImageSource: "pexels" | "pixabay" | "openverse" | "wikimedia" | "disabled";
}
