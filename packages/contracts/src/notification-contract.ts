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
