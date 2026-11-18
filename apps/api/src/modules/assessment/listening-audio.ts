import { createHash, randomUUID } from "node:crypto";
import { createRepositories } from "@e4s/database";
import { EVIDENCE_BUCKET, type ObjectStorage } from "@e4s/storage";
import type { Pool } from "pg";
import type { EdgeTtsRunner } from "./edge-tts.js";
import { DEFAULT_NARRATOR_VOICE, DIALOGUE_VOICE_POLICY, parseDialogueScript, synthesizeListeningScript, type AudioJoiner, type ScriptLine } from "./dialogue-tts.js";

/**
 * Automatic listening audio right after AI generation (monthly final,
 * level-up form, monthly lesson / Friday review). Synthesis never decides
 * review state: a monthly final keeps audio status SCRIPT_ONLY until the
 * Operator ticks "Đã nghe soát". A failure keeps the generated content, is
 * recorded on the item (`audioSynthesis.status = "failed"`), and the manual
 * "Sinh audio Edge TTS" / "Tải file audio" buttons still work.
 */

export interface StoredListeningAudio { url: string; artifactKey: string }
export type ListeningAudioStore = (input: { ownerUserId: string; bytes: Uint8Array; mimeType: string; filename: string }) => Promise<StoredListeningAudio>;

export interface ListeningAudioService {
  /** Synthesise one script (dialogue-aware) and store it as the owner's content media. */
  synthesizeAndStore(ownerUserId: string, script: string | readonly ScriptLine[]): Promise<StoredListeningAudio>;
}

export interface ListeningAudioSynthesisMark {
  status: "generated" | "failed";
  engine: "edge-tts";
  voicePolicy: string;
  scriptHash: string;
  at: string;
  code?: string;
}

/** Saves bytes exactly like an Operator upload (files row purpose content_media, same read URL). */
export function createContentMediaAudioStore(pool: Pool, storage: ObjectStorage): ListeningAudioStore {
  const repositories = createRepositories(pool);
  return async ({ ownerUserId, bytes, mimeType, filename }) => {
    const extension = /\.[a-z0-9]{1,10}$/iu.exec(filename)?.[0].toLowerCase() ?? ".mp3";
    const objectKey = `content-media/${ownerUserId}/${randomUUID()}${extension}`;
    const body = Buffer.from(bytes);
    await storage.putObject({ bucket: EVIDENCE_BUCKET, objectKey, body, mimeType });
    try {
      const saved = await repositories.files.createForOwner({
        id: randomUUID(), ownerUserId, purpose: "content_media", bucket: EVIDENCE_BUCKET,
        objectKey, mimeType, sizeBytes: body.length, sha256: createHash("sha256").update(body).digest("hex")
      });
      if (!saved) throw new Error("CONTENT_MEDIA_NOT_SAVED");
    } catch (error) {
      await storage.deleteObject(EVIDENCE_BUCKET, objectKey).catch(() => undefined);
      throw error;
    }
    return { artifactKey: objectKey, url: `/api/v1/files/content-media/read?artifactKey=${encodeURIComponent(objectKey)}` };
  };
}

export function createListeningAudioService(input: { runner: EdgeTtsRunner; store: ListeningAudioStore; voice?: string; joiner?: AudioJoiner }): ListeningAudioService {
  return {
    async synthesizeAndStore(ownerUserId, script) {
      const audio = await synthesizeListeningScript(input.runner, { script, voice: input.voice ?? DEFAULT_NARRATOR_VOICE, ...(input.joiner ? { joiner: input.joiner } : {}) });
      return input.store({ ownerUserId, bytes: audio.bytes, mimeType: audio.mimeType, filename: audio.filename });
    }
  };
}

/** Undefined when Edge TTS or object storage is not configured; callers then keep script-only content. */
export function listeningAudioServiceFor(pool: Pool, runner?: EdgeTtsRunner, storage?: ObjectStorage): ListeningAudioService | undefined {
  return runner && storage ? createListeningAudioService({ runner, store: createContentMediaAudioStore(pool, storage) }) : undefined;
}

export function listeningScriptHash(script: string | readonly ScriptLine[]): string {
  const text = typeof script === "string" ? script.trim() : script.map((line) => `${line.speaker ?? ""}: ${line.text.trim()}`).join("\n");
  return createHash("sha256").update(`${DIALOGUE_VOICE_POLICY}\n${text}`).digest("hex").slice(0, 32);
}

function failureCode(error: unknown): string {
  const message = error instanceof Error ? error.message : "";
  return /^[A-Z][A-Z0-9_]{2,80}$/u.test(message) ? message : "EDGE_TTS_FAILED";
}

/** One synthesis per distinct script in a run; a repeated script reuses the first file. */
function memoized(service: ListeningAudioService, ownerUserId: string) {
  const cache = new Map<string, Promise<StoredListeningAudio>>();
  return (script: string | readonly ScriptLine[]) => {
    const hash = listeningScriptHash(script);
    let pending = cache.get(hash);
    if (!pending) { pending = service.synthesizeAndStore(ownerUserId, script); cache.set(hash, pending); }
    return { hash, pending };
  };
}

interface BlueprintLike {
  sections: ReadonlyArray<{ code: string; groups: ReadonlyArray<{ stimulus?: { type: string; audioSrc?: string; audioSynthesis?: { voicePolicy?: string }; lines?: Array<{ speaker: string; text: string }> } | undefined }> }>;
}

/**
 * Fills `audioSrc` of every listening group that has a script and no audio.
 * Groups that already have audio, or whose script matches `previous` audio
 * (same script hash), are not synthesised again.
 */
export async function withBlueprintListeningAudio<T extends BlueprintLike>(
  blueprint: T, service: ListeningAudioService | undefined, ownerUserId: string,
  options: { now?: Date; previous?: ReadonlyMap<string, string> } = {}
): Promise<{ blueprint: T; generated: number; failed: number }> {
  const at = (options.now ?? new Date()).toISOString();
  const synth = service ? memoized(service, ownerUserId) : undefined;
  let generated = 0; let failed = 0;
  const sections = await Promise.all(blueprint.sections.map(async (section) => section.code !== "listening" ? section : {
    ...section,
    groups: await Promise.all(section.groups.map(async (group) => {
      const stimulus = group.stimulus;
      if (stimulus?.type !== "audio_script" || stimulus.audioSrc?.trim() || !stimulus.lines?.some((line) => line.text.trim())) return group;
      const hash = listeningScriptHash(stimulus.lines);
      const reused = options.previous?.get(hash);
      if (reused) return { ...group, stimulus: Object.assign({}, stimulus, { audioSrc: reused, audioSynthesis: { status: "generated", engine: "edge-tts", voicePolicy: DIALOGUE_VOICE_POLICY, scriptHash: hash, at } satisfies ListeningAudioSynthesisMark }) };
      if (!synth) { failed += 1; return { ...group, stimulus: Object.assign({}, stimulus, { audioSynthesis: { status: "failed", engine: "edge-tts", voicePolicy: DIALOGUE_VOICE_POLICY, scriptHash: hash, at, code: "EDGE_TTS_UNAVAILABLE" } satisfies ListeningAudioSynthesisMark }) }; }
      try {
        const stored = await synth(stimulus.lines).pending;
        generated += 1;
        return { ...group, stimulus: Object.assign({}, stimulus, { audioSrc: stored.url, audioSynthesis: { status: "generated", engine: "edge-tts", voicePolicy: DIALOGUE_VOICE_POLICY, scriptHash: hash, at } satisfies ListeningAudioSynthesisMark }) };
      } catch (error) {
        failed += 1;
        return { ...group, stimulus: Object.assign({}, stimulus, { audioSynthesis: { status: "failed", engine: "edge-tts", voicePolicy: DIALOGUE_VOICE_POLICY, scriptHash: hash, at, code: failureCode(error) } satisfies ListeningAudioSynthesisMark }) };
      }
    }))
  }));
  return { blueprint: { ...blueprint, sections } as T, generated, failed };
}

/** script hash → audioSrc of a stored blueprint's listening groups (for regeneration reuse). */
export function blueprintListeningAudioIndex(blueprint: BlueprintLike | null | undefined): Map<string, string> {
  const index = new Map<string, string>();
  for (const section of blueprint?.sections ?? []) {
    if (section.code !== "listening") continue;
    for (const group of section.groups) {
      const stimulus = group.stimulus;
      if (stimulus?.type === "audio_script" && stimulus.audioSrc?.trim() && stimulus.lines?.length && reusableVoicePolicy(stimulus.lines, stimulus.audioSynthesis)) index.set(listeningScriptHash(stimulus.lines), stimulus.audioSrc.trim());
    }
  }
  return index;
}

interface LessonLike { parts: ReadonlyArray<{ code: string; content: Record<string, unknown> }> }

const text = (value: unknown) => typeof value === "string" ? value.trim() : "";

/**
 * Monthly lesson listening: `content.script` → `content.audioUrl` (the learner
 * player prefers the file over browser speech). Friday review listening
 * items: each variant's `audioText` → `audioUrl`.
 */
export async function withLessonListeningAudio<T extends LessonLike>(
  lesson: T, service: ListeningAudioService | undefined, ownerUserId: string, options: { now?: Date; previous?: ReadonlyMap<string, string> } = {}
): Promise<{ lesson: T; generated: number; failed: number; reused: number }> {
  const at = (options.now ?? new Date()).toISOString();
  const synth = service ? memoized(service, ownerUserId) : undefined;
  let generated = 0; let failed = 0; let reused = 0;
  const synthesize = async (script: string): Promise<{ audioUrl?: string; audioSynthesis: ListeningAudioSynthesisMark }> => {
    const hash = listeningScriptHash(script);
    // Regeneration: an unchanged script keeps the earlier file instead of a new synthesis.
    const earlier = options.previous?.get(hash);
    if (earlier) { reused += 1; return { audioUrl: earlier, audioSynthesis: { status: "generated", engine: "edge-tts", voicePolicy: DIALOGUE_VOICE_POLICY, scriptHash: hash, at } }; }
    if (!synth) { failed += 1; return { audioSynthesis: { status: "failed", engine: "edge-tts", voicePolicy: DIALOGUE_VOICE_POLICY, scriptHash: hash, at, code: "EDGE_TTS_UNAVAILABLE" } }; }
    try {
      const stored = await synth(script).pending;
      generated += 1;
      return { audioUrl: stored.url, audioSynthesis: { status: "generated", engine: "edge-tts", voicePolicy: DIALOGUE_VOICE_POLICY, scriptHash: hash, at } };
    } catch (error) {
      failed += 1;
      return { audioSynthesis: { status: "failed", engine: "edge-tts", voicePolicy: DIALOGUE_VOICE_POLICY, scriptHash: hash, at, code: failureCode(error) } };
    }
  };
  const parts = await Promise.all(lesson.parts.map(async (part) => {
    if (part.code !== "listening") return part;
    const content = part.content;
    if (Array.isArray(content.items)) {
      const items = await Promise.all(content.items.map(async (raw) => {
        if (!raw || typeof raw !== "object") return raw;
        const item = raw as Record<string, unknown>;
        const withAudio = async (entry: Record<string, unknown>) => {
          const spoken = text(entry.audioText);
          if (!spoken || text(entry.audioUrl)) return entry;
          return { ...entry, ...(await synthesize(spoken)) };
        };
        const variants = Array.isArray(item.variants)
          ? await Promise.all(item.variants.map(async (variant) => variant && typeof variant === "object" ? withAudio(variant as Record<string, unknown>) : variant))
          : undefined;
        return { ...(await withAudio(item)), ...(variants ? { variants } : {}) };
      }));
      return { ...part, content: { ...content, items } };
    }
    const script = text(content.script);
    if (!script || text(content.audioUrl)) return part;
    return { ...part, content: { ...content, ...(await synthesize(script)) } };
  }));
  return { lesson: { ...lesson, parts } as T, generated, failed, reused };
}

/** script hash → audioUrl of a stored lesson's listening part and review items (for regeneration reuse). */
export function lessonListeningAudioIndex(lesson: { parts?: ReadonlyArray<{ code: string; content?: Record<string, unknown> }> } | null | undefined): Map<string, string> {
  const index = new Map<string, string>();
  const remember = (script: unknown, url: unknown, mark: unknown) => { if (text(script) && text(url) && reusableVoicePolicy(text(script), mark)) index.set(listeningScriptHash(text(script)), text(url)); };
  for (const part of lesson?.parts ?? []) {
    if (part.code !== "listening" || !part.content) continue;
    remember(part.content.script, part.content.audioUrl, part.content.audioSynthesis);
    for (const raw of Array.isArray(part.content.items) ? part.content.items : []) {
      if (!raw || typeof raw !== "object") continue;
      const item = raw as Record<string, unknown>;
      remember(item.audioText, item.audioUrl, item.audioSynthesis);
      for (const variant of Array.isArray(item.variants) ? item.variants : []) {
        if (variant && typeof variant === "object") remember((variant as Record<string, unknown>).audioText, (variant as Record<string, unknown>).audioUrl, (variant as Record<string, unknown>).audioSynthesis);
      }
    }
  }
  return index;
}

/** The current (latest) stored content of one monthly day, or null (first generation). */
export async function previousMonthlyLessonAudioIndex(db: Pick<Pool, "query">, frameworkId: string, dayNumber: number): Promise<Map<string, string>> {
  const result = await db.query<{ content: { parts?: Array<{ code: string; content?: Record<string, unknown> }> } | null }>(
    `select lv.content from month_lessons ml join lesson_versions lv on lv.lesson_id = ml.lesson_id
     where ml.framework_id = $1 and ml.lesson_number = $2 order by lv.version desc limit 1`, [frameworkId, dayNumber]);
  return lessonListeningAudioIndex(result.rows[0]?.content);
}

/** Older single-voice audio cannot mask repaired multi-speaker synthesis. */
function reusableVoicePolicy(script: string | readonly ScriptLine[], mark: unknown): boolean {
  const speakers = new Set(parseDialogueScript(script).map(turn => turn.speaker?.toLowerCase() ?? ""));
  return speakers.size < 2 || Boolean(mark && typeof mark === "object" && "voicePolicy" in mark && mark.voicePolicy === DIALOGUE_VOICE_POLICY);
}
