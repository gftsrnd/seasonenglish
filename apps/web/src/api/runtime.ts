export async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    ...init,
    credentials: "include",
    headers: { "content-type": "application/json", ...init?.headers }
  });
  if (!response.ok) {
    const body = await response.json().catch(() => ({})) as { code?: string };
    const error = new Error(body.code ?? `HTTP_${response.status}`) as Error & { details?: unknown };
    error.details = body;
    throw error;
  }
  return response.status === 204 ? undefined as T : response.json() as Promise<T>;
}

export async function uploadMultipart<T>(url: string, file: Blob, filename: string): Promise<T> {
  const body = new FormData();
  body.append("file", file, filename);
  const response = await fetch(url, { method: "POST", credentials: "include", body });
  if (!response.ok) {
    const payload = await response.json().catch(() => ({})) as { code?: string };
    throw new Error(payload.code ?? `HTTP_${response.status}`);
  }
  return response.json() as Promise<T>;
}
