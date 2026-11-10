import { safeGenerationDiagnosticIssues } from "./generation-errors.js";
import { normalizeMonthlyLessonDayOutput } from "@e4s/ai";

const componentCodes = new Set(["objective", "instruction", "vocabulary", "grammar", "pronunciation", "listening", "reading", "writing", "word_class", "word_use", "speaking"]);
const statuses: Record<string, number> = { AI_OUTPUT_INVALID: 422, AI_OUTPUT_TRUNCATED: 422, AI_TIMEOUT: 504, AI_PROVIDER_RATE_LIMIT: 429, AI_PROVIDER_NETWORK: 502, AI_PROVIDER_UNAVAILABLE: 503, AI_PROVIDER_REJECTED: 502, AI_PROVIDER_FAILED: 502, AI_PROVIDER_MALFORMED_RESPONSE: 502 };

/** Retain enough context to diagnose a failed partial call, never the raw model/provider response. */
export function monthlyGenerationFailure(error: unknown) {
  if (!error || typeof error !== "object") return undefined;
  const source=error as {code?: string; monthlyComponents?: string[]; details?: {invalidOutput?: string}};
  const status=source.code ? statuses[source.code] : undefined;
  if (!status || !source.code) return undefined;
  const components=(source.monthlyComponents ?? []).filter(code=>componentCodes.has(code));
  let partCodes: string[]=[];
  try {
    // Match the validator's preprocessing, including JSON strings and merged duplicate sections.
    const raw=normalizeMonthlyLessonDayOutput(source.details?.invalidOutput ?? null) as {lesson?:{parts?:unknown}} | null;
    const parts=raw?.lesson?.parts;
    if(Array.isArray(parts)) partCodes=parts.map(part=>componentCodes.has(part?.code) ? part.code : "");
  } catch { /* Malformed model JSON is intentionally not returned or logged. */ }
  const issues=safeGenerationDiagnosticIssues(error).map(issue=>{
    const index=typeof issue.path === "string" ? issue.path.match(/(?:lesson\.)?parts[.[]([0-9]+)\]?/u)?.[1] : undefined;
    const component=index !== undefined ? partCodes[Number(index)] : components.length===1 ? components[0] : undefined;
    return {...issue,...(component ? {component} : {})};
  });
  return {status,body:{code:source.code,components,issues}};
}
