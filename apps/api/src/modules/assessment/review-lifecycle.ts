export type PlacementLifecycle = "not_started" | "in_progress" | "needs_retry" | "pending_review" | "approved";

/**
 * Maps the persisted attempt state to the operator's mutually exclusive
 * learner buckets. A submitted attempt is still an active review flow until
 * it is either approved or sent back for another try.
 */
export function classifyPlacementLifecycle(status: string | null | undefined): PlacementLifecycle {
  switch (status) {
    case "in_progress":
    case "submitted":
      return "in_progress";
    case "needs_retry":
      return "needs_retry";
    case "pending_review":
      return "pending_review";
    case "approved":
      return "approved";
    default:
      return "not_started";
  }
}
