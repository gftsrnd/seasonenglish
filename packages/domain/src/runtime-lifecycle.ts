/** Shared immutable lifecycle used by monthly resources, lessons, reviews and monthly exams. */
export const CONTENT_LIFECYCLE_STATUSES = [
  "draft", "approved", "locked", "reopen_requested", "reopened", "rejected"
] as const;

export type ContentLifecycleStatus = (typeof CONTENT_LIFECYCLE_STATUSES)[number];

const ALLOWED_TRANSITIONS: Readonly<Record<ContentLifecycleStatus, readonly ContentLifecycleStatus[]>> = {
  draft: ["approved", "rejected"],
  approved: ["locked", "reopen_requested"],
  locked: ["reopen_requested"],
  reopen_requested: ["reopened", "rejected"],
  reopened: ["draft", "approved"],
  rejected: ["reopen_requested"]
};

/** Returns the organization date selected by Manager, normalized as an ISO calendar day. */
export function effectiveSystemDate(selectedDate: string | undefined, now = new Date()): string {
  if (selectedDate && /^\d{4}-\d{2}-\d{2}$/u.test(selectedDate)
    && Number.isFinite(new Date(`${selectedDate}T00:00:00.000Z`).getTime())) return selectedDate;
  return now.toISOString().slice(0, 10);
}

export function isLifecycleTransitionAllowed(from: ContentLifecycleStatus, to: ContentLifecycleStatus): boolean {
  return ALLOWED_TRANSITIONS[from].includes(to);
}
