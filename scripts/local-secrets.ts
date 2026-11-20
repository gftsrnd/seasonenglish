import { randomInt } from "node:crypto";

/**
 * Demo account secrets for local / sandbox seeding. They live only in the machine's .env (never in git):
 *   E4S_DEMO_LEARNER_PIN, E4S_DEMO_STAFF_PASSWORD, E4S_DEMO_MANAGER_PASSWORD, E4S_SCENARIO_STAFF_PASSWORD
 * When one is missing a random value is generated and printed once, so a fresh checkout still gets working logins.
 */
const generated = new Map<string, string>();

export function localSecret(name: string, kind: "pin" | "password"): string {
  const fromEnv = process.env[name]?.trim();
  if (fromEnv) return fromEnv;
  const cached = generated.get(name);
  if (cached) return cached;
  const value = kind === "pin"
    ? String(randomInt(0, 1_000_000)).padStart(6, "0")
    : Array.from({ length: 16 }, () => "abcdefghjkmnpqrstuvwxyz23456789"[randomInt(0, 31)]).join("");
  generated.set(name, value);
  console.error(`${name} was not set; generated ${value} for this run (put it in .env to keep it).`);
  return value;
}
