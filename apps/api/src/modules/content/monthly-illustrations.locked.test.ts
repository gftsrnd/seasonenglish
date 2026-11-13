import Fastify from "fastify";
import { PNG } from "pngjs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ILLUSTRATION_STALE_MS, registerMonthlyIllustrationRoutes, runMonthlyIllustrationJob, trackIllustrationJob, withLiveIllustrationStates } from "./monthly-illustrations.js";
import { registerMonthlyContentRoutes } from "./monthly-routes.js";

/**
 * Approval mid-generation (4175, B1 December 2026): approval locks the words that already have
 * a picture; the others stay fillable and a running job keeps drawing them.
 * The fake repository mirrors the SQL guard in MonthlyContentRepository.saveFrameworkIllustration.
 */
type Row = { status: "pending" | "generating" | "ready" | "failed"; source: "ai" | "upload"; artifactKey?: string; error?: string; updatedAt: Date };
const state = vi.hoisted(() => ({
  status: "draft" as "draft" | "approved" | "retired",
  coreTerms: [] as Array<{ id: string; word: string; meaning: string; type: string; imageUrl?: string }>,
  rows: new Map<string, Row>()
}));

const norm = (word: string) => word.trim().toLocaleLowerCase("en-US");
const url = (key: string) => `/api/v1/files/content-media/read?artifactKey=${encodeURIComponent(key)}`;
const repository = {
  async frameworkIllustrationContext(_actor: string, frameworkId: string) {
    return { frameworkId, month: "2026-12", cefr: "B1", locked: state.status !== "draft", status: state.status, theme: { title: "Year-end review", context: "Office" }, coreTerms: state.coreTerms.map(({ imageUrl: _url, ...term }) => term) };
  },
  async listFrameworkIllustrations() {
    return state.coreTerms.map((term) => {
      const row = state.rows.get(norm(term.word));
      const working = row?.status === "ready" && row.artifactKey ? url(row.artifactKey) : undefined;
      const image = state.status === "draft" ? working : term.imageUrl ?? working;
      return {
        coreTermId: term.id, word: term.word, meaning: term.meaning,
        status: image ? "ready" as const : row?.status ?? "missing" as const,
        ...(image ? { url: image } : {}),
        ...(row && !image ? { updatedAt: row.updatedAt.toISOString() } : {}),
        frameworkLocked: state.status !== "draft",
        locked: state.status !== "draft" && (state.status !== "approved" || Boolean(image))
      };
    });
  },
  async saveFrameworkIllustration(input: { word: string; status: Row["status"]; source?: "ai" | "upload"; artifactKey?: string | null; error?: string | null }) {
    const word = norm(input.word);
    const existing = state.rows.get(word);
    const frozen = state.coreTerms.some((term) => norm(term.word) === word && term.imageUrl);
    const allowed = state.status === "draft" || (state.status === "approved" && !frozen && existing?.status !== "ready");
    if (!allowed) return false;
    state.rows.set(word, { status: input.status, source: input.source ?? "ai", ...(input.status === "ready" && input.artifactKey ? { artifactKey: input.artifactKey } : existing?.artifactKey ? { artifactKey: existing.artifactKey } : {}), ...(input.error ? { error: input.error } : {}), updatedAt: new Date() });
    return true;
  },
  async removeFrameworkIllustration() { return state.status === "draft"; },
  async approveFramework() { state.status = "approved"; }
};
const files = { async createForOwner() { return { id: "file" }; }, async ownedBy() { return true; } };

vi.mock("@e4s/database", () => ({ createRepositories: () => ({ monthlyContent: repository, files, aiRuns: {} }) }));
vi.mock("../identity/policy.js", () => ({
  createRoleGuard: () => async (request: { e4sSession?: unknown }) => { request.e4sSession = { user: { id: "operator-1" } }; }
}));

const FRAMEWORK = "a43937eb-0000-4000-8000-000000000001";
const base = `/api/v1/content/month-frameworks/${FRAMEWORK}`;

function png(): Buffer {
  const image = new PNG({ width: 4, height: 4 });
  image.data.fill(200);
  return PNG.sync.write(image);
}

/** Provider whose pictures arrive only when the test releases them, in call order. */
function gatedProvider() {
  const waiting: Array<() => void> = [];
  return {
    provider: { model: "image-model", generate: vi.fn(() => new Promise<{ body: Buffer; mimeType: string }>((resolve) => { waiting.push(() => resolve({ body: png(), mimeType: "image/png" })); })) },
    async releaseAll() { while (waiting.length) waiting.shift()!(); await flush(); },
    pending: () => waiting.length
  };
}
const flush = async () => { for (let index = 0; index < 20; index += 1) await new Promise((resolve) => setImmediate(resolve)); };
const storage = { putObject: vi.fn(async () => undefined), deleteObject: vi.fn(), ready: vi.fn(), presignGetObject: vi.fn() };

async function buildApp(provider?: { model: string; generate(prompt: string): Promise<{ body: Buffer; mimeType: string }> }) {
  const app = Fastify();
  registerMonthlyIllustrationRoutes(app, {} as never, storage as never, provider);
  registerMonthlyContentRoutes(app, {} as never);
  await app.ready();
  return app;
}

beforeEach(() => {
  state.status = "draft";
  state.rows = new Map();
  state.coreTerms = ["deadline", "budget", "forecast", "review"].map((word, index) => ({ id: `b1-core-${index + 1}`, word, meaning: `nghĩa ${index + 1}`, type: "noun" }));
});
afterEach(() => vi.useRealTimers());

describe("monthly illustrations after approval", () => {
  it("asks before approving while pictures are still being drawn, then keeps the job going for the words without a picture", async () => {
    const gate = gatedProvider();
    const app = await buildApp(gate.provider);
    const started = await app.inject({ method: "POST", url: `${base}/illustrations/generate`, payload: {} });
    expect(started.statusCode, started.body).toBe(202);
    expect(started.json()).toEqual({ started: true, count: 4 });
    await flush();
    expect(gate.pending()).toBe(4);

    const asked = await app.inject({ method: "POST", url: `${base}/approve`, payload: {} });
    expect(asked.statusCode, asked.body).toBe(409);
    expect(asked.json()).toEqual({ code: "MONTHLY_ILLUSTRATIONS_IN_PROGRESS", pending: 4 });
    expect(state.status).toBe("draft");

    const approved = await app.inject({ method: "POST", url: `${base}/approve`, payload: { confirmIllustrationsInProgress: true } });
    expect(approved.statusCode, approved.body).toBe(204);
    expect(state.status).toBe("approved");

    // The job was not stranded by the lock: every word gets its picture.
    for (let round = 0; round < 3 && [...state.rows.values()].some((row) => row.status !== "ready"); round += 1) await gate.releaseAll();
    expect([...state.rows.entries()].map(([word, row]) => [word, row.status])).toEqual([["deadline", "ready"], ["budget", "ready"], ["forecast", "ready"], ["review", "ready"]]);
    const listed = await app.inject({ method: "GET", url: `${base}/illustrations` });
    expect(listed.json()).toMatchObject({ running: false, locked: true, fillable: 0 });
    expect((listed.json() as { images: Array<{ locked: boolean }> }).images.every((image) => image.locked)).toBe(true);
    await app.close();
  });

  it("approves without asking when no job is drawing", async () => {
    const app = await buildApp();
    const approved = await app.inject({ method: "POST", url: `${base}/approve`, payload: {} });
    expect(approved.statusCode, approved.body).toBe(204);
    await app.close();
  });

  it("fills only words without a picture once approved: 409 for a ready word, AI and upload allowed for the rest", async () => {
    state.status = "approved";
    state.coreTerms[0]!.imageUrl = url("content-media/frozen.png");
    state.rows.set("deadline", { status: "ready", source: "ai", artifactKey: "content-media/frozen.png", updatedAt: new Date() });
    state.rows.set("budget", { status: "ready", source: "ai", artifactKey: "content-media/after.png", updatedAt: new Date() });
    state.rows.set("forecast", { status: "failed", source: "ai", error: "refused", updatedAt: new Date() });
    const gate = gatedProvider();
    const app = await buildApp(gate.provider);

    const view = (await app.inject({ method: "GET", url: `${base}/illustrations` })).json() as { images: Array<{ word: string; status: string; locked: boolean }>; locked: boolean; fillable: number };
    expect(view.locked).toBe(true);
    expect(view.fillable).toBe(2);
    expect(view.images.map((image) => [image.word, image.status, image.locked])).toEqual([["deadline", "ready", true], ["budget", "ready", true], ["forecast", "failed", false], ["review", "missing", false]]);

    for (const word of ["deadline", "budget"]) {
      const redraw = await app.inject({ method: "POST", url: `${base}/illustrations/generate`, payload: { words: [word] } });
      expect(redraw.statusCode, redraw.body).toBe(409);
      expect(redraw.json()).toEqual({ code: "MONTHLY_RESOURCES_LOCKED" });
      const replace = await app.inject({ method: "PUT", url: `${base}/illustrations`, payload: { word, artifactKey: "content-media/late.png" } });
      expect(replace.statusCode, replace.body).toBe(409);
    }
    const removed = await app.inject({ method: "DELETE", url: `${base}/illustrations`, payload: { word: "deadline" } });
    expect(removed.statusCode).toBe(409);

    const uploaded = await app.inject({ method: "PUT", url: `${base}/illustrations`, payload: { word: "Review", artifactKey: "content-media/review.png" } });
    expect(uploaded.statusCode, uploaded.body).toBe(200);
    expect((uploaded.json() as { images: Array<{ word: string; status: string; locked: boolean }> }).images[3]).toMatchObject({ word: "review", status: "ready", locked: true });

    const generated = await app.inject({ method: "POST", url: `${base}/illustrations/generate`, payload: {} });
    expect(generated.statusCode, generated.body).toBe(202);
    expect(generated.json()).toEqual({ started: true, count: 1 });
    await flush();
    await gate.releaseAll();
    expect(state.rows.get("forecast")?.status).toBe("ready");
    expect(state.rows.get("budget")?.artifactKey).toBe("content-media/after.png");
    await app.close();
  });

  it("keeps a retired framework fully closed", async () => {
    state.status = "retired";
    const app = await buildApp(gatedProvider().provider);
    expect((await app.inject({ method: "POST", url: `${base}/illustrations/generate`, payload: {} })).statusCode).toBe(409);
    expect((await app.inject({ method: "PUT", url: `${base}/illustrations`, payload: { word: "review", artifactKey: "content-media/x.png" } })).statusCode).toBe(409);
    await app.close();
  });

  it("offers rows left pending/generating by a dead job as missing and queues them again", async () => {
    state.status = "approved";
    const old = new Date(Date.now() - 60_000);
    state.rows.set("deadline", { status: "ready", source: "ai", artifactKey: "content-media/d.png", updatedAt: old });
    state.rows.set("budget", { status: "generating", source: "ai", updatedAt: old });
    state.rows.set("forecast", { status: "pending", source: "ai", updatedAt: old });
    state.rows.set("review", { status: "pending", source: "ai", updatedAt: old });
    const gate = gatedProvider();
    const app = await buildApp(gate.provider);
    const view = (await app.inject({ method: "GET", url: `${base}/illustrations` })).json() as { images: Array<{ word: string; status: string }>; running: boolean; fillable: number };
    expect(view.running).toBe(false);
    expect(view.fillable).toBe(3);
    expect(view.images.map((image) => image.status)).toEqual(["ready", "missing", "missing", "missing"]);
    const requeued = await app.inject({ method: "POST", url: `${base}/illustrations/generate`, payload: {} });
    expect(requeued.statusCode, requeued.body).toBe(202);
    expect(requeued.json()).toEqual({ started: true, count: 3 });
    await flush();
    await gate.releaseAll();
    expect([...state.rows.values()].every((row) => row.status === "ready")).toBe(true);
    await app.close();
  });

  it("treats a word stuck in generating past the stale window as missing even while a job runs", () => {
    const untrack = trackIllustrationJob(FRAMEWORK, ["budget", "forecast"]);
    try {
      const now = Date.now();
      const images = [
        { coreTermId: "1", word: "budget", meaning: "", status: "generating" as const, updatedAt: new Date(now - ILLUSTRATION_STALE_MS - 1).toISOString(), locked: false },
        { coreTermId: "2", word: "forecast", meaning: "", status: "pending" as const, updatedAt: new Date(now - ILLUSTRATION_STALE_MS - 1).toISOString(), locked: false },
        { coreTermId: "3", word: "review", meaning: "", status: "pending" as const, updatedAt: new Date(now).toISOString(), locked: false }
      ];
      expect(withLiveIllustrationStates(FRAMEWORK, images, now).map((image) => image.status)).toEqual(["missing", "pending", "missing"]);
    } finally { untrack(); }
  });

  it("skips a word whose picture got locked meanwhile and keeps drawing the others", async () => {
    const saves: string[] = [];
    let lockedWord = "";
    const repositories = {
      monthlyContent: { saveFrameworkIllustration: vi.fn(async (input: { word: string; status: string }) => { if (input.word === lockedWord) return false; saves.push(`${input.word}:${input.status}`); return true; }) },
      files
    };
    const provider = { model: "m", generate: vi.fn(async () => { lockedWord = "budget"; return { body: png(), mimeType: "image/png" }; }) };
    const result = await runMonthlyIllustrationJob({
      repositories: repositories as never, storage: storage as never, provider, actorId: "operator-1", concurrency: 1,
      context: { frameworkId: FRAMEWORK, month: "2026-12", cefr: "B1", locked: false, status: "draft", theme: { title: "t", context: "c" }, coreTerms: [] },
      words: ["deadline", "budget", "forecast"].map((word) => ({ word, meaning: word, type: "noun" }))
    });
    expect(result).toEqual({ ready: 2, failed: 0 });
    expect(saves.filter((save) => save.endsWith(":ready"))).toEqual(["deadline:ready", "forecast:ready"]);
  });
});
