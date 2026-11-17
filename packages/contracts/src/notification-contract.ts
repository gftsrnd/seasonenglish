export const LEARNER_NOTIFICATION_STATUSES = [
  "draft", "queued", "sent", "failed", "cancelled", "dismissed"
] as const;

export type LearnerNotificationStatus = (typeof LEARNER_NOTIFICATION_STATUSES)[number];
export type NotificationDeliveryStatus = "queued" | "sent" | "failed";

export interface LearnerNotificationDeliveryView {
  readonly provider: string;
  readonly status: NotificationDeliveryStatus;
  readonly externalId: string | null;
  readonly attemptedAt: string;
}

export interface LearnerNotificationView {
  readonly id: string;
  readonly reason: string;
  readonly message: string;
  readonly status: LearnerNotificationStatus;
  readonly createdAt: string;
  readonly deliveries: readonly LearnerNotificationDeliveryView[];
}

export interface LearnerNotificationsView {
  readonly notifications: readonly LearnerNotificationView[];
}

export type InboxNotificationKind =
  | "complaint_received" | "complaint_approved" | "complaint_rejected"
  | "reopen_received" | "reopen_approved" | "reopen_rejected"
  | "assessment_received" | "assessment_result" | "assessment_retry"
  | "assessment_manual_review" | "assessment_submission_saved" | "assessment_grading_interrupted"
  | "season_turn_credited" | "season_feedback_interrupted" | "season_service_interrupted"
  | "appeal_received" | "appeal_approved" | "appeal_rejected"
  | "learning_reminder" | "security_report"
  | "deletion_received" | "deletion_resolved" | "level_changed" | "credential_changed" | "account_reopened"
  | "lesson_availability_changed" | "lesson_published" | "monthly_exam_published" | "level_exam_published"
  | "topic_report_received" | "topic_report_resolved" | "duel_invited" | "duel_completed"
  | "course_ready" | "certificate_issued" | "challenge_received" | "challenge_passed" | "challenge_retry"
  | "monthly_exam_ready" | "level_exam_ready" | "monthly_survey_open"
  | "lesson_window_unapproved" | "lesson_window_unapproved_manager" | "test_date_active"
  | "absence_warning" | "monthly_uncounted" | "lesson_reopened" | "badge_earned" | "season_reached" | "monthly_lessons_locked"
  | "retake_granted";

export interface InboxNotificationView {
  readonly id: string;
  readonly kind: InboxNotificationKind;
  readonly context: string;
  readonly relatedId?: string | null;
  readonly levelChangeReason?: string | null;
  /** PIN/password activity behind a `security_report` notification; context holds the repeat count. */
  readonly securityReport?: { readonly subjectName: string; readonly note: string } | null;
  /** Mini game topic report behind a `topic_report_received` notification; Operators resolve it from the bell. */
  readonly topicReport?: {
    readonly learnerName: string;
    readonly topic: string;
    readonly reason: string;
    readonly strikeCount: number;
    readonly status: "open" | "resolved";
  } | null;
  readonly createdAt: string;
  readonly readAt: string | null;
}

export interface NotificationInboxView {
  readonly items: readonly InboxNotificationView[];
  readonly unreadCount: number;
  readonly nextCursor: string | null;
}

export type InboxReadInput = { readonly ids: readonly string[] } | { readonly all: true };
