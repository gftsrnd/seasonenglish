export function safeGenerationDiagnosticIssues(error: unknown): Array<Record<string, unknown>> {
  if (!error || typeof error !== "object") return [];
  const source = error as Record<string, unknown>;
  const errorCode = safeIdentifier(source.code);
  const details = source.details;
  const values = [
    ...(Array.isArray(source.issues) ? source.issues : []),
    ...(details && typeof details === "object" && !Array.isArray(details)
      ? (Array.isArray((details as Record<string, unknown>).issues)
        ? (details as { issues: unknown[] }).issues
        : [details])
      : [])
  ];
  return values.flatMap((value) => flattenGenerationDiagnosticIssue(value, errorCode));
}

function flattenGenerationDiagnosticIssue(
  value: unknown,
  fallbackCode?: string,
  inherited: Record<string, unknown> = {}
): Array<Record<string, unknown>> {
  const issue = safeGenerationDiagnosticIssue(value, fallbackCode);
  if (!issue) return [];
  const merged = { ...inherited, ...issue };
  const source = value as Record<string, unknown>;
  const nested = Array.isArray(source.issues) ? source.issues : [];
  if (nested.length === 0) return [merged];
  const context = Object.fromEntries(
    ["dayNumber", "component", "code"].flatMap((key) => key in merged ? [[key, merged[key]]] : [])
  );
  return nested.flatMap((child) => flattenGenerationDiagnosticIssue(
    child,
    typeof merged.code === "string" ? merged.code : fallbackCode,
    context
  ));
}

function safeGenerationDiagnosticIssue(value: unknown, fallbackCode?: string): Record<string, unknown> | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  const source = value as Record<string, unknown>;
  const issue: Record<string, unknown> = {};
  for (const key of ["code", "component", "stopReason", "traceId"] as const) {
    const candidate = safeIdentifier(source[key]);
    if (candidate) issue[key] = candidate;
  }
  if (!issue.code && fallbackCode) issue.code = fallbackCode;
  for (const key of ["dayNumber", "attempt", "maxOutputTokens"] as const) {
    const candidate = source[key];
    if (typeof candidate === "number" && Number.isSafeInteger(candidate) && candidate >= 0) issue[key] = candidate;
  }
  const path = safeText(source.path, 300);
  if (path && /^[A-Za-z0-9_.[\]-]+$/u.test(path)) issue.path = path;
  const message = safeText(source.message, 500);
  if (message) issue.message = redactSecrets(message);
  if (source.usage && typeof source.usage === "object" && !Array.isArray(source.usage)) {
    const usage = source.usage as Record<string, unknown>;
    const safeUsage: Record<string, number> = {};
    for (const key of ["inputTokens", "outputTokens", "totalTokens", "cacheCreationInputTokens", "cacheReadInputTokens"] as const) {
      const candidate = usage[key];
      if (typeof candidate === "number" && Number.isFinite(candidate) && candidate >= 0) safeUsage[key] = candidate;
    }
    if (Object.keys(safeUsage).length > 0) issue.usage = safeUsage;
  }
  return Object.keys(issue).length > 0 ? issue : undefined;
}

function safeIdentifier(value: unknown): string | undefined {
  return typeof value === "string" && /^[A-Za-z0-9_.:-]+$/u.test(value) ? value : undefined;
}

function safeText(value: unknown, maxLength: number): string | undefined {
  if (typeof value !== "string") return undefined;
  const normalized = value.replace(/[\u0000-\u001f\u007f]+/gu, " ").trim();
  return normalized ? normalized.slice(0, maxLength) : undefined;
}

function redactSecrets(value: string): string {
  return value
    .replace(/(Authorization\s*:\s*Bearer\s+)[^\s]+/giu, "$1[REDACTED]")
    .replace(/\bsk-ant-[A-Za-z0-9_-]+\b/gu, "[REDACTED]")
    .replace(/\b(api[_-]?key|token|secret)\s*[=:]\s*[^\s,;]+/giu, "$1=[REDACTED]");
}

export function publicLessonGenerationFailure(error: unknown): {
  code: "AI_LESSON_GENERATION_FAILED";
  message: string;
  findings?: Array<{ dayNumber: number | null; component: string; code: string }>;
} {
  const rawIssues = error && typeof error === "object" && "issues" in error
    ? (error as { issues?: unknown }).issues
    : undefined;
  const errorCode = error && typeof error === "object" && "code" in error
    && typeof (error as { code?: unknown }).code === "string"
    ? (error as { code: string }).code
    : "AI_LESSON_GENERATION_FAILED";
  const findings = Array.isArray(rawIssues) ? rawIssues.flatMap((raw) => {
    if (!raw || typeof raw !== "object") return [];
    const item = raw as { dayNumber?: unknown; component?: unknown; code?: unknown; path?: unknown };
    if ((typeof item.dayNumber === "number" || item.dayNumber === null)
      && typeof item.component === "string" && typeof item.code === "string") {
      return [{ dayNumber: item.dayNumber, component: item.component, code: item.code }];
    }
    if (typeof item.path !== "string") return [];
    const match = /^day([1-5])\.(objectives|foundation|vocabulary|grammarClassification|skills\.(?:comprehension|languagePractice|speaking)|lesson)(?:\.|$)/u.exec(item.path);
    if (!match) return [];
    return [{ dayNumber: Number(match[1]), component: match[2]!, code: errorCode }];
  }) : [];
  return {
    code: "AI_LESSON_GENERATION_FAILED",
    message: "AI chưa tạo được bộ bài hợp lệ. Nội dung hiện có vẫn được giữ; vui lòng thử lại.",
    ...(findings.length ? { findings } : {})
  };
}
