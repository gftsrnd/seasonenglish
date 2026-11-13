import type { CefrLevel } from "@e4s/contracts";
import { findMonthlyGrammarCatalogTopic } from "./grammar-catalog.js";

/**
 * Name of the grammar point a monthly lesson teaches, read from the approved
 * day plan at serve time (no regeneration, no AI). The day's grammar step ids
 * (grammarPlan.milestoneIds → grammarStepIds → grammarStepId; review days:
 * reviewGrammarStepIds) point to the month's resource grammarTopics; a topic
 * that maps to the roadmap catalog (catalogId, then exact title) uses the
 * catalog's English + Vietnamese names, otherwise its stored title.
 * `topicTitleVi` is only set for A1–A2; several topics are joined with " · ".
 */
export interface MonthlyGrammarDayTopicName { topicTitle: string; topicTitleVi?: string }

export interface MonthlyGrammarDayPlanSource {
  kind?: "new" | "review" | string | undefined;
  grammarPlan?: { milestoneIds?: readonly string[] | undefined } | undefined;
  grammarStepIds?: readonly string[] | undefined;
  grammarStepId?: string | undefined;
  reviewGrammarStepIds?: readonly string[] | undefined;
}

export interface MonthlyGrammarTopicSource { title?: string | undefined; catalogId?: string | undefined; steps?: ReadonlyArray<{ id?: string | undefined }> | undefined }

export const MONTHLY_GRAMMAR_TOPIC_NAME_SEPARATOR = " · ";

function dayGrammarStepIds(day: MonthlyGrammarDayPlanSource): string[] {
  if (day.kind === "review") return [...(day.reviewGrammarStepIds ?? [])];
  if (day.grammarPlan?.milestoneIds?.length) return [...day.grammarPlan.milestoneIds];
  if (day.grammarStepIds?.length) return [...day.grammarStepIds];
  return day.grammarStepId ? [day.grammarStepId] : [];
}

export function monthlyGrammarDayTopicName(cefr: CefrLevel | string, day: MonthlyGrammarDayPlanSource | null | undefined, topics: readonly MonthlyGrammarTopicSource[] | null | undefined): MonthlyGrammarDayTopicName | undefined {
  if (!day || !Array.isArray(topics) || !topics.length) return undefined;
  const ids = new Set(dayGrammarStepIds(day));
  if (!ids.size) return undefined;
  const level = (["A1", "A2", "B1", "B2", "C1"].includes(cefr) ? cefr : undefined) as CefrLevel | undefined;
  const vietnamese = level === "A1" || level === "A2";
  const names = topics
    .filter((topic) => (topic?.steps ?? []).some((step: { id?: string | undefined }) => typeof step?.id === "string" && ids.has(step.id)))
    .flatMap((topic) => {
      const found = level ? findMonthlyGrammarCatalogTopic(level, { catalogId: topic.catalogId, title: topic.title }) : undefined;
      if (found) return [{ en: found.topic.titleEn, vi: found.topic.titleVi }];
      const title = typeof topic.title === "string" ? topic.title.trim() : "";
      return title ? [{ en: title, vi: "" }] : [];
    });
  if (!names.length) return undefined;
  const topicTitle = names.map((name) => name.en).join(MONTHLY_GRAMMAR_TOPIC_NAME_SEPARATOR);
  // Vietnamese names only when every topic has one (so the two lists stay aligned).
  const topicTitleVi = vietnamese && names.every((name) => name.vi) ? names.map((name) => name.vi).join(MONTHLY_GRAMMAR_TOPIC_NAME_SEPARATOR) : "";
  return { topicTitle, ...(topicTitleVi ? { topicTitleVi } : {}) };
}

/** Puts the day's grammar topic name on the grammar part (`topicTitle`, A1–A2 `topicTitleVi`); other parts unchanged. */
export function withMonthlyGrammarTopicName<T extends { code?: string; content?: Record<string, unknown> }>(parts: readonly T[], name: MonthlyGrammarDayTopicName | undefined): T[] {
  if (!name) return [...parts];
  return parts.map((part) => {
    if (part.code !== "grammar" || !part.content || typeof part.content !== "object") return part;
    const { topicTitleVi: _previousVi, ...content } = part.content;
    return { ...part, content: { ...content, topicTitle: name.topicTitle, ...(name.topicTitleVi ? { topicTitleVi: name.topicTitleVi } : {}) } };
  });
}
