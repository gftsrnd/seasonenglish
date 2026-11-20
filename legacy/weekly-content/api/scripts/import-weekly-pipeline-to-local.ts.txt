import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

const args = new Map<string, string>();
for (let index = 2; index < process.argv.length; index += 2) {
  const key = process.argv[index];
  const value = process.argv[index + 1];
  if (key?.startsWith("--") && value) args.set(key.slice(2), value);
}

const outputRoot = args.get("output-root");
const weekNumber = Number(args.get("week") ?? "1");
const apiBaseUrl = (args.get("api") ?? "http://127.0.0.1:4175").replace(/\/$/, "");
const email = args.get("email") ?? "thu.ha.tran@e4s.local";
const password = args.get("password") ?? "staff-pass";
if (!outputRoot || !Number.isInteger(weekNumber) || weekNumber < 1) {
  throw new Error("Usage: --output-root <directory> [--week 1] [--api http://127.0.0.1:4175]");
}

const levels = ["A1", "A2", "B1", "B2", "C1"] as const;
let cookie = "";

async function request(path: string, init: RequestInit = {}): Promise<Response> {
  const headers = new Headers(init.headers);
  headers.set("content-type", "application/json");
  if (cookie) headers.set("cookie", cookie);
  const response = await fetch(`${apiBaseUrl}${path}`, { ...init, headers, redirect: "manual" });
  const setCookie = response.headers.get("set-cookie");
  if (setCookie) cookie = setCookie.split(";", 1)[0] ?? cookie;
  return response;
}

const login = await request("/api/auth/staff/login", {
  method: "POST",
  body: JSON.stringify({ email, password })
});
if (!login.ok) {
  throw new Error(`LOCAL_LOGIN_FAILED:${login.status}:${await login.text()}`);
}

for (const level of levels) {
  const resultPath = resolve(outputRoot, level, "level-result.json");
  const result = JSON.parse(await readFile(resultPath, "utf8")) as { lessons?: unknown[] };
  if (!Array.isArray(result.lessons) || result.lessons.length !== 5) {
    throw new Error(`INVALID_LEVEL_RESULT:${level}`);
  }
  const response = await request(`/api/v1/content/lesson-sets/${weekNumber}/${level}/draft`, {
    method: "PUT",
    body: JSON.stringify({ lessons: result.lessons })
  });
  if (!response.ok) {
    throw new Error(`LOCAL_IMPORT_FAILED:${level}:${response.status}:${await response.text()}`);
  }
  process.stdout.write(`${JSON.stringify({ status: "imported", weekNumber, level, lessons: result.lessons.length })}\n`);
}

process.stdout.write(`${JSON.stringify({ status: "completed", weekNumber, levels })}\n`);
