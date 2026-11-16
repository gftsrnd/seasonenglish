import type { InboxReadInput, NotificationInboxView } from "@e4s/contracts";
import { request } from "./runtime.js";

export function getNotificationInbox(limit: number, unreadOnly = false, cursor?: string, signal?: AbortSignal) {
  const params = new URLSearchParams({ limit: String(limit), unreadOnly: String(unreadOnly) });
  if (cursor) params.set("cursor", cursor);
  return request<NotificationInboxView>(`/api/v1/me/notifications?${params}`, { signal: signal ?? null });
}

export function markInboxRead(input: InboxReadInput) {
  return request<{ unreadCount: number }>("/api/v1/me/notifications/read", {
    method: "PATCH",
    body: JSON.stringify(input)
  });
}

/** Operator: marks a Mini game topic report handled straight from its bell item. */
export function resolveTopicReport(reportId: string) {
  return request<{ saved: boolean }>(`/api/v1/assessment-reviews/topic-reports/${encodeURIComponent(reportId)}/resolution`, {
    method: "POST",
    body: "{}"
  });
}
