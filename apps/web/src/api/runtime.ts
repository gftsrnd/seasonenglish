export function apiUrl(url: string, apiOrigin = import.meta.env.VITE_API_BASE_URL ?? ""): string {
  const origin = apiOrigin.trim().replace(/\/+$/, "");
  const path = url.startsWith("/") ? url : `/${url}`;
  return `${origin}${path}`;
}

export type ApiErrorKind = "network" | "http" | "invalid_response";

export class ApiError extends Error {
  constructor(
    public readonly code: string,
    public readonly kind: ApiErrorKind,
    public readonly status?: number,
    public readonly details?: unknown
  ) {
    super(code);
    this.name = "ApiError";
  }
}

export async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const sandbox = await sandboxProfileRequest<T>(url, init);
  if (sandbox !== undefined) return sandbox;
  let response: Response;
  try {
    response = await fetch(apiUrl(url), {
      ...init,
      credentials: "include",
      headers: { "content-type": "application/json", ...init?.headers }
    });
  } catch {
    throw new ApiError("NETWORK_UNAVAILABLE", "network");
  }
  if (!response.ok) throw await apiResponseError(response);
  if (response.status === 204) return undefined as T;
  return parseJsonResponse<T>(response);
}

const SANDBOX_PROFILE_KEY = "e4s:sandbox:learner-profile";
const SANDBOX_SESSION_KEY = "e4s:sandbox:active";

function sandboxModeEnabled() {
  return typeof window !== "undefined" && (new URL(window.location.href).searchParams.get("sandbox") === "1" || window.sessionStorage.getItem(SANDBOX_SESSION_KEY) === "1");
}

async function sandboxProfileRequest<T>(url: string, init?: RequestInit): Promise<T | undefined> {
  if (!sandboxModeEnabled() || url !== "/api/v1/learner/profile") return undefined;
  const real = await fetch(apiUrl(url), { credentials: "include", headers: { "content-type": "application/json" } });
  if (!real.ok) throw await apiResponseError(real);
  const base = await real.json() as Record<string, any>;
  let saved: Record<string, any> | undefined;
  try {
    const raw = window.localStorage.getItem(SANDBOX_PROFILE_KEY);
    saved = raw ? JSON.parse(raw) as Record<string, any> : undefined;
  } catch { saved = undefined; }
  if ((init?.method ?? "GET").toUpperCase() === "PUT") {
    const input = typeof init?.body === "string" ? JSON.parse(init.body) as Record<string, any> : {};
    const profile = { ...(base.profile ?? {}), ...input };
    delete profile.version;
    saved = { ...base, version: Number(base.version ?? 0) + 1, completed: false, profile };
    window.localStorage.setItem(SANDBOX_PROFILE_KEY, JSON.stringify(saved));
  }
  return (saved ? { ...base, ...saved, sandbox: true } : { ...base, sandbox: true }) as T;
}

export async function uploadMultipart<T>(url: string, file: Blob, filename: string): Promise<T> {
  const body = new FormData();
  body.append("file", file, filename);
  let response: Response;
  try {
    response = await fetch(apiUrl(url), { method: "POST", credentials: "include", body });
  } catch {
    throw new ApiError("NETWORK_UNAVAILABLE", "network");
  }
  if (!response.ok) throw await apiResponseError(response);
  return parseJsonResponse<T>(response);
}

async function apiResponseError(response: Response): Promise<ApiError> {
  const details = await readJson(response);
  const body = asRecord(details);
  const code = typeof body?.code === "string" && body.code.trim() ? body.code : `HTTP_${response.status}`;
  return new ApiError(code, "http", response.status, details);
}

async function parseJsonResponse<T>(response: Response): Promise<T> {
  try {
    return await response.json() as T;
  } catch {
    throw new ApiError("API_INVALID_RESPONSE", "invalid_response", response.status);
  }
}

async function readJson(response: Response): Promise<unknown> {
  try { return await response.json(); }
  catch { return undefined; }
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : undefined;
}
