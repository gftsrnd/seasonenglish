import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import type { EdgeTtsRunner } from "./edge-tts.js";

/**
 * Listening scripts as spoken audio, shared by the exam editor's "Sinh audio
 * Edge TTS" button and the automatic synthesis after AI generation.
 *
 * Same approach as the placement / Pass Course listening assets
 * (scripts/generate-placement-listening-audio.ps1): every turn is synthesised
 * separately with its speaker's Edge neural voice (en-GB Sonia for women,
 * en-GB Ryan for men, rate -8%), a short pause separates turns, and the turns
 * are joined into one file. Speaker labels ("Receptionist:", "A:") are never
 * sent to the TTS engine.
 */

export const DEFAULT_NARRATOR_VOICE = "en-US-AvaMultilingualNeural";
/** Placement voices first; the rest only for a third or fourth speaker of the same gender. */
export const DIALOGUE_VOICES = {
  female: ["en-GB-SoniaNeural", "en-GB-LibbyNeural", "en-US-EmmaMultilingualNeural"],
  male: ["en-GB-RyanNeural", "en-GB-ThomasNeural", "en-US-AndrewMultilingualNeural"]
} as const;
/** Placement dialogue pace (LA/LB). */
export const DIALOGUE_RATE = "-8%";
/** Placement pause between turns, after trimming each turn's own silence. */
export const DIALOGUE_PAUSE_MS = 120;

export type SpeakerGender = "female" | "male";
export interface DialogueTurn {
  /** Speaker label as written in the script; null for an unlabelled opening line. */
  speaker: string | null;
  /** Spoken text only: never contains the speaker label. */
  text: string;
}
export interface ScriptLine { speaker?: string | null; text: string }

const NARRATOR_LABEL = /^(narrator|announcer|presenter|host|voice ?over|voice|recording|message|người dẫn|dẫn chuyện|lời dẫn|thuyết minh)$/iu;
// First words that make "X: ..." ordinary text, not a speaker turn.
const NON_SPEAKER_LABELS = new Set([
  "note", "notes", "time", "date", "day", "example", "question", "questions", "answer", "part", "section", "instruction", "instructions",
  "tip", "subject", "address", "phone", "tel", "email", "e-mail", "price", "cost", "total", "warning", "important", "location", "venue",
  "ps", "p.s", "re", "cc", "url", "website", "step", "task", "title", "topic", "reminder", "update", "agenda", "deadline", "room", "ref",
  "reference", "order", "flight", "gate", "platform", "extension", "option", "options", "item", "items", "result", "results", "summary",
  "remember", "attention", "caution", "nb", "fyi", "lưu ý", "chú ý", "ghi chú", "câu hỏi", "đáp án", "phần"
]);
const FUNCTION_WORDS = new Set([
  "the", "a", "an", "is", "are", "was", "were", "be", "to", "and", "or", "for", "in", "on", "at", "my", "our", "your", "their", "this", "that",
  "these", "those", "we", "i", "you", "it", "they", "there", "here", "please", "so", "but", "because", "if", "when", "what", "which", "who",
  "will", "can", "do", "does", "did", "have", "has", "not", "with", "as", "by", "from", "all", "one", "some"
]);
// Label shape: a capitalised name or role of at most four words, optionally ending in a number or letter ("Speaker 1", "Person A").
const LABEL_SHAPE = /^(?:[\p{Lu}\p{Lt}][\p{L}\p{M}'’.-]*)(?:\s+[\p{L}\p{M}'’.-]+){0,3}?(?:\s+(?:\d{1,2}|[A-Z]))?$/u;
const LINE_LABEL = /^\s*(?:[-–—•*]\s*)?(?:\*\*)?([^:：\n]{1,40}?)(?:\*\*)?\s*[:：](?!\d)\s*(.*)$/u;

function cleanLabel(label: string): string {
  return label.replace(/^[\s*_[(]+|[\s*_\])]+$/gu, "").replace(/\s+/gu, " ").trim();
}

/** The speaker label of one script line, or null when the line is ordinary text. */
export function speakerLabelOf(line: string): { speaker: string; text: string } | null {
  const match = LINE_LABEL.exec(line);
  if (!match) return null;
  const speaker = cleanLabel(match[1] ?? "");
  if (!speaker || !LABEL_SHAPE.test(speaker)) return null;
  const firstWord = speaker.toLocaleLowerCase("en").split(" ")[0] ?? "";
  if (NON_SPEAKER_LABELS.has(speaker.toLocaleLowerCase("en")) || NON_SPEAKER_LABELS.has(firstWord.replace(/\.$/u, ""))) return null;
  // "So the answer is: yes" is a sentence, not a speaker.
  const words = speaker.toLocaleLowerCase("en").split(" ");
  if (words.length > 1 && words.some((word) => FUNCTION_WORDS.has(word))) return null;
  return { speaker, text: (match[2] ?? "").trim() };
}

export function isNarratorLabel(speaker: string | null): boolean {
  return !speaker || NARRATOR_LABEL.test(speaker.trim());
}

function speakerKey(speaker: string | null): string {
  return isNarratorLabel(speaker) ? "" : speaker!.toLocaleLowerCase("en").replace(/[.'’]/gu, "").replace(/\s+/gu, " ").trim();
}

const STAGE_DIRECTION = /^\s*[[(][^\])]*[\])]\s*$/u;

/**
 * Splits a listening script into speaker turns. Accepts the editor's
 * "Speaker: text" lines or stored `{ speaker, text }` lines whose text may
 * itself hold a labelled dialogue (AI scripts are stored as one Narrator line).
 * A line without a label continues the previous speaker.
 */
export function parseDialogueScript(script: string | readonly ScriptLine[]): DialogueTurn[] {
  const lines: ScriptLine[] = typeof script === "string" ? [{ speaker: null, text: script }] : [...script];
  const raw: DialogueTurn[] = [];
  for (const line of lines) {
    let current: string | null = line.speaker?.trim() || null;
    for (const piece of String(line.text ?? "").split(/\r?\n/u)) {
      if (!piece.trim() || STAGE_DIRECTION.test(piece)) continue;
      const labelled = speakerLabelOf(piece);
      if (labelled) current = labelled.speaker;
      const text = labelled ? labelled.text : piece.trim();
      if (text) raw.push({ speaker: current, text });
    }
  }
  const turns = splitInlineTurns(raw);
  // Neighbouring pieces of the same speaker are one turn.
  return turns.reduce<DialogueTurn[]>((merged, turn) => {
    const previous = merged[merged.length - 1];
    if (previous && speakerKey(previous.speaker) === speakerKey(turn.speaker)) previous.text = `${previous.text} ${turn.text}`;
    else merged.push({ ...turn });
    return merged;
  }, []);
}

/** "Man: Hi. Woman: Hello." on one line, for labels already used at a line start. */
function splitInlineTurns(turns: DialogueTurn[]): DialogueTurn[] {
  const labels = [...new Set(turns.map((turn) => turn.speaker).filter((speaker): speaker is string => Boolean(speaker) && !isNarratorLabel(speaker)))];
  if (labels.length < 2) return turns;
  const escaped = labels.sort((a, b) => b.length - a.length).map((label) => label.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&"));
  const inline = new RegExp(`(?<=[.!?…"”'’]\\s+)(${escaped.join("|")})\\s*[:：]\\s+`, "gu");
  return turns.flatMap((turn) => {
    const parts = turn.text.split(inline);
    if (parts.length === 1) return [turn];
    const result: DialogueTurn[] = [];
    if (parts[0]!.trim()) result.push({ speaker: turn.speaker, text: parts[0]!.trim() });
    for (let index = 1; index + 1 < parts.length; index += 2) {
      const text = parts[index + 1]!.trim();
      if (text) result.push({ speaker: parts[index]!, text });
    }
    return result;
  });
}

const FEMALE_WORDS = new Set([
  "woman", "women", "female", "girl", "lady", "mrs", "ms", "miss", "madam", "madame", "mother", "mum", "mom", "wife", "daughter", "sister",
  "aunt", "grandmother", "grandma", "girlfriend", "waitress", "actress", "hostess", "stewardess", "businesswoman", "chairwoman", "saleswoman",
  "spokeswoman", "policewoman", "nữ", "chị", "bà", "cô", "mẹ"
]);
const MALE_WORDS = new Set([
  "man", "men", "male", "boy", "gentleman", "mr", "sir", "father", "dad", "husband", "son", "brother", "uncle", "grandfather", "grandpa",
  "boyfriend", "waiter", "actor", "steward", "businessman", "chairman", "salesman", "spokesman", "policeman",
  "nam", "anh", "ông", "chú", "bố", "cha"
]);
const FEMALE_NAMES = new Set([
  "linda", "sarah", "sara", "anna", "ana", "emma", "maria", "mary", "lisa", "kate", "katie", "helen", "jenny", "jennifer", "jessica", "laura",
  "lucy", "amy", "emily", "sophie", "sophia", "olivia", "rachel", "rebecca", "susan", "karen", "julia", "julie", "claire", "alice", "grace",
  "hannah", "chloe", "charlotte", "amelia", "isabella", "mia", "zoe", "elena", "fatima", "aisha", "priya", "mei", "yuki", "nina", "diana",
  "angela", "natalie", "victoria", "nicole", "michelle", "patricia", "barbara", "elizabeth", "liz", "beth", "ellen", "monica", "sandra",
  "carol", "carmen", "rosa", "sofia", "lena", "eva", "ruth", "joanna", "joanne", "tina", "wendy", "fiona", "megan", "ella", "lily", "ava",
  "mai", "lan", "hoa", "linh", "huong", "hương", "thu", "trang", "ngoc", "ngọc", "nga", "thao", "thảo", "phuong", "phương", "hanh", "hạnh",
  "yen", "yến", "vy", "nhung", "hien", "hiền", "loan"
]);
const MALE_NAMES = new Set([
  "ahmed", "ahmad", "mohammed", "muhammad", "ali", "omar", "john", "david", "tom", "thomas", "mark", "james", "michael", "peter", "paul",
  "ben", "daniel", "dan", "carlos", "raj", "rahul", "robert", "rob", "richard", "william", "will", "george", "jack", "harry", "oliver",
  "henry", "edward", "charles", "andrew", "steve", "steven", "stephen", "kevin", "brian", "simon", "matthew", "matt", "luke", "adam",
  "chris", "christopher", "jason", "eric", "frank", "gary", "martin", "nick", "nicholas", "patrick", "ryan", "sam", "samuel", "tony",
  "alex", "lucas", "leo", "hassan", "ken", "kenji", "hiroshi", "wei", "jamal", "pedro", "juan", "luis", "marco", "ivan", "joe", "joseph",
  "minh", "hung", "hùng", "nam", "tuan", "tuấn", "duc", "đức", "long", "quang", "hai", "hải", "khoa", "huy", "phong", "son", "sơn",
  "thanh", "trung", "dung", "dũng", "bao", "bảo", "kien", "kiên", "vinh", "hieu", "hiếu", "dat", "đạt", "tai", "tài"
]);

/** Gender hint from a speaker label ("Woman", "Mr Smith", "Ahmed"), or null when not obvious. */
export function speakerGenderHint(speaker: string | null): SpeakerGender | null {
  if (!speaker) return null;
  const words = speaker.toLocaleLowerCase("en").replace(/[.'’,]/gu, " ").split(/\s+/u).filter(Boolean);
  const joined = words.join(" ");
  if (words.some((word) => FEMALE_WORDS.has(word)) || FEMALE_WORDS.has(joined)) return "female";
  if (words.some((word) => MALE_WORDS.has(word)) || MALE_WORDS.has(joined)) return "male";
  if (FEMALE_NAMES.has(joined) || words.some((word) => FEMALE_NAMES.has(word) && !MALE_NAMES.has(word))) return "female";
  if (MALE_NAMES.has(joined) || words.some((word) => MALE_NAMES.has(word))) return "male";
  return null;
}

export interface VoiceAssignment { speaker: string | null; voice: string; gender: SpeakerGender | "narrator" }

/**
 * One consistent voice per distinct speaker: a narrator / unlabelled speaker
 * keeps the requested voice; other speakers get a voice by their gender hint,
 * and speakers without one alternate with their neighbour (the first one
 * female, like the placement dialogues).
 */
export function assignDialogueVoices(turns: readonly DialogueTurn[], narratorVoice = DEFAULT_NARRATOR_VOICE): Map<string, VoiceAssignment> {
  const speakers: Array<string | null> = [];
  const seen = new Set<string>();
  for (const turn of turns) {
    const key = speakerKey(turn.speaker);
    if (key && !seen.has(key)) { seen.add(key); speakers.push(turn.speaker); }
  }
  const hints = speakers.map(speakerGenderHint);
  const genders: SpeakerGender[] = [];
  speakers.forEach((_, index) => {
    const hint = hints[index];
    if (hint) { genders.push(hint); return; }
    const previous = genders[index - 1];
    if (previous) { genders.push(previous === "female" ? "male" : "female"); return; }
    const nextHint = hints.find((candidate, position) => position > index && candidate);
    genders.push(nextHint === "female" ? "male" : "female");
  });
  const used: Record<SpeakerGender, number> = { female: 0, male: 0 };
  const assignments = new Map<string, VoiceAssignment>([["", { speaker: null, voice: narratorVoice, gender: "narrator" }]]);
  speakers.forEach((speaker, index) => {
    const gender = genders[index]!;
    const pool = DIALOGUE_VOICES[gender].filter((voice) => voice !== narratorVoice);
    const voice = pool[used[gender] % pool.length]!;
    used[gender] += 1;
    assignments.set(speakerKey(speaker), { speaker, voice, gender });
  });
  return assignments;
}

export function voiceForTurn(assignments: Map<string, VoiceAssignment>, turn: DialogueTurn): VoiceAssignment {
  return assignments.get(speakerKey(turn.speaker)) ?? assignments.get("")!;
}

export interface SpokenSegment { voice: string; text: string; rate?: string }

/**
 * The exact synthesis calls for a script: one call per turn of a dialogue,
 * one call for a single-speaker script (requested voice, unchanged pace).
 * Labels are already removed from every text.
 */
export function planListeningSpeech(script: string | readonly ScriptLine[], narratorVoice = DEFAULT_NARRATOR_VOICE): SpokenSegment[] {
  const turns = parseDialogueScript(script);
  if (!turns.length) return [];
  const assignments = assignDialogueVoices(turns, narratorVoice);
  const distinctVoices = new Set(turns.map((turn) => voiceForTurn(assignments, turn).voice));
  if (distinctVoices.size < 2) return [{ voice: narratorVoice, text: turns.map((turn) => turn.text).join("\n") }];
  return turns.map((turn) => ({ voice: voiceForTurn(assignments, turn).voice, text: turn.text, rate: DIALOGUE_RATE }));
}

/** Joins MP3 turns with a pause; the default needs no external tool. */
export interface AudioJoiner { join(segments: readonly Uint8Array[], pauseMs: number): Promise<Uint8Array> }

export interface ListeningSynthesisResult {
  bytes: Uint8Array;
  mimeType: "audio/mpeg";
  filename: string;
  segments: SpokenSegment[];
}

export async function synthesizeListeningScript(
  runner: EdgeTtsRunner,
  input: { script: string | readonly ScriptLine[]; voice?: string; joiner?: AudioJoiner; concurrency?: number }
): Promise<ListeningSynthesisResult> {
  const segments = planListeningSpeech(input.script, input.voice?.trim() || DEFAULT_NARRATOR_VOICE);
  if (!segments.length) throw new Error("EDGE_TTS_TEXT_INVALID");
  if (segments.length === 1) {
    const only = await runner.synthesize({ text: segments[0]!.text, voice: segments[0]!.voice });
    return { bytes: only.bytes, mimeType: "audio/mpeg", filename: only.filename, segments };
  }
  const audio = await mapLimit(segments, input.concurrency ?? 3, (segment) => runner.synthesize({ text: segment.text, voice: segment.voice, ...(segment.rate ? { rate: segment.rate } : {}) }));
  const joiner = input.joiner ?? defaultJoiner();
  const bytes = await joiner.join(audio.map((item) => item.bytes), DIALOGUE_PAUSE_MS);
  if (!bytes.byteLength) throw new Error("EDGE_TTS_EMPTY_AUDIO");
  return { bytes, mimeType: "audio/mpeg", filename: "assessment-edge-tts-dialogue.mp3", segments };
}

async function mapLimit<T, R>(items: readonly T[], limit: number, run: (item: T) => Promise<R>): Promise<R[]> {
  const results = new Array<R>(items.length);
  let next = 0;
  const workers = Array.from({ length: Math.max(1, Math.min(limit, items.length)) }, async () => {
    while (next < items.length) {
      const index = next++;
      results[index] = await run(items[index]!);
    }
  });
  await Promise.all(workers);
  return results;
}

// ---------------------------------------------------------------------------
// MP3 joining without ffmpeg: Edge TTS returns constant-bitrate MPEG Layer III
// frames (24 kHz, 48 kbit/s, mono). Frames of separately synthesised turns can
// be appended as they are; the pause is made of silent frames with the same
// header (no main data, so every decoder plays digital silence).

const BITRATES = {
  v1: [0, 32, 40, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320],
  v2: [0, 8, 16, 24, 32, 40, 48, 56, 64, 80, 96, 112, 128, 144, 160]
} as const;
const SAMPLE_RATES: Record<number, readonly number[]> = { 3: [44100, 48000, 32000], 2: [22050, 24000, 16000], 0: [11025, 12000, 8000] };

interface Mp3FrameInfo { offset: number; header: Uint8Array; frameLength: number; samplesPerFrame: number; sampleRate: number }

/** Removes a leading ID3v2 tag and a trailing ID3v1 tag. */
export function stripMp3Tags(bytes: Uint8Array): Uint8Array {
  let start = 0;
  if (bytes.length > 10 && bytes[0] === 0x49 && bytes[1] === 0x44 && bytes[2] === 0x33) {
    const size = ((bytes[6]! & 0x7f) << 21) | ((bytes[7]! & 0x7f) << 14) | ((bytes[8]! & 0x7f) << 7) | (bytes[9]! & 0x7f);
    start = 10 + size + ((bytes[5]! & 0x10) ? 10 : 0);
  }
  let end = bytes.length;
  if (end - start > 128 && bytes[end - 128] === 0x54 && bytes[end - 127] === 0x41 && bytes[end - 126] === 0x47) end -= 128;
  return bytes.subarray(Math.min(start, end), end);
}

export function firstMp3Frame(bytes: Uint8Array): Mp3FrameInfo | null {
  for (let offset = 0; offset + 4 <= bytes.length && offset < 64 * 1024; offset += 1) {
    if (bytes[offset] !== 0xff || (bytes[offset + 1]! & 0xe0) !== 0xe0) continue;
    const versionBits = (bytes[offset + 1]! >> 3) & 0x03;
    const layerBits = (bytes[offset + 1]! >> 1) & 0x03;
    const bitrateIndex = bytes[offset + 2]! >> 4;
    const sampleIndex = (bytes[offset + 2]! >> 2) & 0x03;
    if (versionBits === 1 || layerBits !== 1 || bitrateIndex === 0 || bitrateIndex === 15 || sampleIndex === 3) continue;
    const mpeg1 = versionBits === 3;
    const bitrate = (mpeg1 ? BITRATES.v1 : BITRATES.v2)[bitrateIndex]! * 1000;
    const sampleRate = SAMPLE_RATES[versionBits]![sampleIndex]!;
    const header = bytes.slice(offset, offset + 4);
    header[1] = header[1]! | 0x01; // no CRC
    header[2] = header[2]! & ~0x02; // no padding
    return { offset, header, frameLength: Math.floor(((mpeg1 ? 144 : 72) * bitrate) / sampleRate), samplesPerFrame: mpeg1 ? 1152 : 576, sampleRate };
  }
  return null;
}

/** Silent MP3 frames matching `frame`, covering about `pauseMs`. */
export function silentMp3Frames(frame: Mp3FrameInfo, pauseMs: number): Uint8Array {
  const count = Math.max(1, Math.round((pauseMs / 1000) * frame.sampleRate / frame.samplesPerFrame));
  const out = new Uint8Array(frame.frameLength * count);
  for (let index = 0; index < count; index += 1) out.set(frame.header, index * frame.frameLength);
  return out;
}

/**
 * Edge ends every turn with ~0.8 s of empty frames (part2_3_length 0). Dropping
 * all but `keepFrames` of them keeps the gap between turns close to the
 * placement pause. Only trailing frames are cut: leading frames may carry the
 * bit reservoir of the first spoken frame. MPEG-2/2.5 mono only; other
 * layouts are returned unchanged.
 */
export function trimTrailingSilentFrames(audio: Uint8Array, keepFrames = 4): Uint8Array {
  const frames: Array<{ end: number; silent: boolean }> = [];
  let offset = 0;
  while (offset + 4 <= audio.length && audio[offset] === 0xff && (audio[offset + 1]! & 0xe0) === 0xe0) {
    const versionBits = (audio[offset + 1]! >> 3) & 0x03;
    const layerBits = (audio[offset + 1]! >> 1) & 0x03;
    const bitrateIndex = audio[offset + 2]! >> 4;
    const sampleIndex = (audio[offset + 2]! >> 2) & 0x03;
    const mono = (audio[offset + 3]! >> 6) === 3;
    if (versionBits === 3 || versionBits === 1 || layerBits !== 1 || !mono || bitrateIndex === 0 || bitrateIndex === 15 || sampleIndex === 3) return audio;
    const length = Math.floor((72 * BITRATES.v2[bitrateIndex]! * 1000) / SAMPLE_RATES[versionBits]![sampleIndex]!) + ((audio[offset + 2]! >> 1) & 0x01);
    if (offset + length > audio.length) break;
    const side = offset + 4 + ((audio[offset + 1]! & 0x01) ? 0 : 2);
    // MPEG-2 mono side info: main_data_begin (8 bits), private (1 bit), then part2_3_length (12 bits).
    const part23 = ((audio[side + 1]! & 0x7f) << 5) | (audio[side + 2]! >> 3);
    frames.push({ end: offset + length, silent: part23 === 0 });
    offset += length;
  }
  if (!frames.length || offset < audio.length - 4) return audio;
  let last = frames.length - 1;
  while (last >= 0 && frames[last]!.silent) last -= 1;
  const keep = Math.min(frames.length - 1, last + keepFrames);
  return keep < 0 ? audio : audio.subarray(0, frames[keep]!.end);
}

export function joinMp3Segments(segments: readonly Uint8Array[], pauseMs: number): Uint8Array {
  const cleaned = segments.map(stripMp3Tags).filter((segment) => segment.byteLength > 0);
  const frame = cleaned.map(firstMp3Frame).find((info): info is Mp3FrameInfo => Boolean(info)) ?? null;
  const pause = frame && pauseMs > 0 ? silentMp3Frames(frame, pauseMs) : new Uint8Array(0);
  const parts = cleaned.flatMap((segment, index) => {
    const info = firstMp3Frame(segment);
    const audio = info ? segment.subarray(info.offset) : segment;
    return index < cleaned.length - 1 ? [trimTrailingSilentFrames(audio), pause] : [audio];
  });
  const out = new Uint8Array(parts.reduce((sum, part) => sum + part.byteLength, 0));
  let offset = 0;
  for (const part of parts) { out.set(part, offset); offset += part.byteLength; }
  return out;
}

export const mp3FrameJoiner: AudioJoiner = { join: async (segments, pauseMs) => joinMp3Segments(segments, pauseMs) };

const execFileAsync = promisify(execFile);

/**
 * The placement pipeline when ffmpeg is installed on the API host: trim each
 * turn's own leading/trailing silence, 0.12 s pause, shorten long silent
 * spans, loudness-normalise, then encode one MP3.
 */
export function createFfmpegJoiner(command = "ffmpeg"): AudioJoiner {
  return {
    async join(segments, pauseMs) {
      const directory = await mkdtemp(join(tmpdir(), "e4s-dialogue-"));
      try {
        const run = (args: string[]) => execFileAsync(command, ["-hide_banner", "-loglevel", "error", "-y", ...args], { windowsHide: true, timeout: 120_000, maxBuffer: 1_000_000 });
        const pausePath = join(directory, "pause.wav");
        await run(["-f", "lavfi", "-i", "anullsrc=r=48000:cl=mono", "-t", (pauseMs / 1000).toFixed(2), "-ac", "1", "-c:a", "pcm_s16le", pausePath]);
        const trim = "silenceremove=start_periods=1:start_duration=0.04:start_threshold=-45dB:start_silence=0.03,areverse,silenceremove=start_periods=1:start_duration=0.04:start_threshold=-45dB:start_silence=0.03,areverse,aresample=48000";
        const entries: string[] = [];
        for (const [index, segment] of segments.entries()) {
          const raw = join(directory, `turn-${index}.mp3`);
          const wav = join(directory, `turn-${index}.wav`);
          await writeFile(raw, segment);
          await run(["-i", raw, "-af", trim, "-ac", "1", "-c:a", "pcm_s16le", wav]);
          entries.push(`file '${wav.replaceAll("'", "'\\''")}'`);
          if (index < segments.length - 1) entries.push(`file '${pausePath.replaceAll("'", "'\\''")}'`);
        }
        const list = join(directory, "turns.txt");
        await writeFile(list, entries.join("\n"));
        const output = join(directory, "dialogue.mp3");
        await run(["-f", "concat", "-safe", "0", "-i", list, "-af", "silenceremove=stop_periods=-1:stop_duration=0.15:stop_threshold=-45dB:stop_silence=0.06,loudnorm=I=-15:TP=-1.0:LRA=11,aresample=24000", "-ac", "1", "-c:a", "libmp3lame", "-b:a", "64k", output]);
        return new Uint8Array(await readFile(output));
      } finally {
        await rm(directory, { recursive: true, force: true });
      }
    }
  };
}

let probedJoiner: Promise<AudioJoiner> | undefined;
/** ffmpeg when the host has it (EDGE_TTS_FFMPEG overrides the command), else the frame joiner. */
function defaultJoiner(): AudioJoiner {
  return {
    async join(segments, pauseMs) {
      probedJoiner ??= (async () => {
        const command = process.env.EDGE_TTS_FFMPEG?.trim() || "ffmpeg";
        if (process.env.EDGE_TTS_FFMPEG === "off") return mp3FrameJoiner;
        try { await execFileAsync(command, ["-hide_banner", "-version"], { windowsHide: true, timeout: 10_000 }); return createFfmpegJoiner(command); }
        catch { return mp3FrameJoiner; }
      })();
      const joiner = await probedJoiner;
      try { return await joiner.join(segments, pauseMs); }
      catch { return joinMp3Segments(segments, pauseMs); }
    }
  };
}
