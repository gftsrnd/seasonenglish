import { describe, expect, it, vi } from "vitest";
import {
  DEFAULT_NARRATOR_VOICE, DIALOGUE_RATE, assignDialogueVoices, firstMp3Frame, joinMp3Segments, mp3FrameJoiner, parseDialogueScript,
  planListeningSpeech, speakerGenderHint, speakerLabelOf, synthesizeListeningScript, trimTrailingSilentFrames
} from "../src/modules/assessment/dialogue-tts.js";
import type { EdgeTtsRunner } from "../src/modules/assessment/edge-tts.js";

const PHONE_CALL = [
  "Narrator: Phone call about a delivery.",
  "Receptionist: Good afternoon, Brightway Supplies. How can I help you?",
  "Ahmed: Hello, this is Ahmed from Northgate Hotel. Our order of towels hasn't arrived.",
  "Receptionist: I'm sorry to hear that. Let me check the order for you.",
  "It was sent yesterday, so it should arrive tomorrow morning.",
  "Ahmed: Great, thank you."
].join("\n");

/** One MPEG-2 Layer III frame (24 kHz, 48 kbit/s, mono) like Edge TTS output, filled with `fill`. */
function mp3Frames(count: number, fill: number): Uint8Array {
  const frame = new Uint8Array(144).fill(fill);
  frame.set([0xff, 0xf3, 0x64, 0xc4]);
  const out = new Uint8Array(144 * count);
  for (let index = 0; index < count; index += 1) out.set(frame, index * 144);
  return out;
}

function mockRunner(): EdgeTtsRunner & { synthesize: ReturnType<typeof vi.fn> } {
  return { synthesize: vi.fn(async ({ text }: { text: string }) => ({ bytes: mp3Frames(2, text.length % 200), mimeType: "audio/mpeg" as const, filename: "assessment-edge-tts.mp3" })) };
}

describe("dialogue script parser", () => {
  it("splits a phone call into speaker turns, removes every label and keeps unlabelled lines with the previous speaker", () => {
    expect(parseDialogueScript(PHONE_CALL)).toEqual([
      { speaker: "Narrator", text: "Phone call about a delivery." },
      { speaker: "Receptionist", text: "Good afternoon, Brightway Supplies. How can I help you?" },
      { speaker: "Ahmed", text: "Hello, this is Ahmed from Northgate Hotel. Our order of towels hasn't arrived." },
      { speaker: "Receptionist", text: "I'm sorry to hear that. Let me check the order for you. It was sent yesterday, so it should arrive tomorrow morning." },
      { speaker: "Ahmed", text: "Great, thank you." }
    ]);
  });

  it("recognises common label shapes and ignores colons that are not speaker labels", () => {
    expect(speakerLabelOf("A: Are you free?")).toEqual({ speaker: "A", text: "Are you free?" });
    expect(speakerLabelOf("Speaker 1: Hi there.")).toEqual({ speaker: "Speaker 1", text: "Hi there." });
    expect(speakerLabelOf("Woman: Excuse me.")).toEqual({ speaker: "Woman", text: "Excuse me." });
    expect(speakerLabelOf("**Mr. Smith**: Come in.")).toEqual({ speaker: "Mr. Smith", text: "Come in." });
    expect(speakerLabelOf("Customer service agent: Thanks for calling.")).toEqual({ speaker: "Customer service agent", text: "Thanks for calling." });
    expect(speakerLabelOf("Người dẫn: Bạn sẽ nghe một cuộc gọi.")).toEqual({ speaker: "Người dẫn", text: "Bạn sẽ nghe một cuộc gọi." });
    expect(speakerLabelOf("The meeting starts at 10:30 tomorrow.")).toBeNull();
    expect(speakerLabelOf("Note: bring your badge.")).toBeNull();
    expect(speakerLabelOf("So the answer is: yes.")).toBeNull();
    expect(speakerLabelOf("Time: 9:30")).toBeNull();
  });

  it("reads stored { speaker, text } lines, including a Narrator line whose text holds the labelled dialogue", () => {
    expect(parseDialogueScript([{ speaker: "Narrator", text: "You will hear a call.\nMan: Hi, is Linda there?\nWoman: Speaking." }])).toEqual([
      { speaker: "Narrator", text: "You will hear a call." },
      { speaker: "Man", text: "Hi, is Linda there?" },
      { speaker: "Woman", text: "Speaking." }
    ]);
    expect(parseDialogueScript([{ speaker: "Employee", text: "Why has the time changed?" }, { speaker: "Manager", text: "The client moved the call." }]))
      .toEqual([{ speaker: "Employee", text: "Why has the time changed?" }, { speaker: "Manager", text: "The client moved the call." }]);
  });

  it("splits a known label in the middle of a line and drops bracketed sound effects", () => {
    expect(parseDialogueScript("Man: Hi, Sarah.\n[Phone rings]\nWoman: Hello. Man: Have you got a minute?")).toEqual([
      { speaker: "Man", text: "Hi, Sarah." },
      { speaker: "Woman", text: "Hello." },
      { speaker: "Man", text: "Have you got a minute?" }
    ]);
  });
});

describe("dialogue voice assignment", () => {
  it("uses name and role gender hints", () => {
    expect(speakerGenderHint("Ahmed")).toBe("male");
    expect(speakerGenderHint("Linda")).toBe("female");
    expect(speakerGenderHint("Woman")).toBe("female");
    expect(speakerGenderHint("Man")).toBe("male");
    expect(speakerGenderHint("Mrs Lee")).toBe("female");
    expect(speakerGenderHint("Receptionist")).toBeNull();
  });

  it("gives every speaker one consistent voice: narrator keeps the requested voice, the others alternate Sonia/Ryan like placement", () => {
    const turns = parseDialogueScript(PHONE_CALL);
    const voices = assignDialogueVoices(turns);
    expect(voices.get("")?.voice).toBe(DEFAULT_NARRATOR_VOICE);
    expect(voices.get("receptionist")).toMatchObject({ voice: "en-GB-SoniaNeural", gender: "female" });
    expect(voices.get("ahmed")).toMatchObject({ voice: "en-GB-RyanNeural", gender: "male" });
    const unknown = assignDialogueVoices(parseDialogueScript("A: Hi.\nB: Hello.\nC: Morning."));
    expect([unknown.get("a")?.voice, unknown.get("b")?.voice, unknown.get("c")?.voice]).toEqual(["en-GB-SoniaNeural", "en-GB-RyanNeural", "en-GB-LibbyNeural"]);
    const twoMen = assignDialogueVoices(parseDialogueScript("John: Hi.\nDavid: Hello."));
    expect(twoMen.get("john")?.voice).not.toBe(twoMen.get("david")?.voice);
  });

  it("never sends a speaker label to the TTS engine", () => {
    const plan = planListeningSpeech(PHONE_CALL);
    expect(plan.map((segment) => segment.voice)).toEqual([DEFAULT_NARRATOR_VOICE, "en-GB-SoniaNeural", "en-GB-RyanNeural", "en-GB-SoniaNeural", "en-GB-RyanNeural"]);
    for (const segment of plan) {
      expect(segment.text).not.toMatch(/^(Narrator|Receptionist|Ahmed)\s*:/u);
      expect(segment.text).not.toMatch(/(Narrator|Receptionist|Ahmed):/u);
      expect(segment.rate).toBe(DIALOGUE_RATE);
    }
  });

  it("keeps a single-speaker script as one call with the requested voice and pace", () => {
    expect(planListeningSpeech("Narrator: The meeting starts at nine.\nPlease arrive early.", "en-US-AvaMultilingualNeural"))
      .toEqual([{ voice: "en-US-AvaMultilingualNeural", text: "The meeting starts at nine. Please arrive early." }]);
    expect(planListeningSpeech([{ speaker: "Manager", text: "Good morning, everyone." }]))
      .toEqual([{ voice: DEFAULT_NARRATOR_VOICE, text: "Good morning, everyone." }]);
  });
});

describe("dialogue synthesis and MP3 joining", () => {
  it("joins Edge MP3 turns with silent frames of the same format", () => {
    const joined = joinMp3Segments([mp3Frames(2, 1), mp3Frames(3, 2)], 120);
    const frame = firstMp3Frame(joined)!;
    expect(frame).toMatchObject({ sampleRate: 24000, frameLength: 144, samplesPerFrame: 576 });
    // 2 + 5 silent (120 ms / 24 ms) + 3 frames, every one starting with a frame header.
    expect(joined.byteLength).toBe(144 * 10);
    for (let offset = 0; offset < joined.byteLength; offset += 144) expect([joined[offset], joined[offset + 1]! & 0xfe]).toEqual([0xff, 0xf2]);
    expect(joined.subarray(144 * 2 + 4, 144 * 3).every((byte) => byte === 0)).toBe(true);
  });

  it("drops Edge's long run of empty trailing frames but keeps a short tail", () => {
    const turn = new Uint8Array(144 * 12);
    turn.set(mp3Frames(2, 9));
    for (let index = 2; index < 12; index += 1) turn.set([0xff, 0xf3, 0x64, 0xc4], index * 144);
    expect(trimTrailingSilentFrames(turn).byteLength).toBe(144 * 6);
    expect(trimTrailingSilentFrames(mp3Frames(3, 9)).byteLength).toBe(144 * 3);
  });

  it("strips an ID3 tag from a turn before joining", () => {
    const tagged = new Uint8Array(10 + 5 + 144);
    tagged.set([0x49, 0x44, 0x33, 4, 0, 0, 0, 0, 0, 5]);
    tagged.set(mp3Frames(1, 7), 15);
    const joined = joinMp3Segments([tagged, mp3Frames(1, 8)], 0);
    expect(joined.byteLength).toBe(288);
    expect(joined[0]).toBe(0xff);
  });

  it("synthesises each turn with its speaker's voice and returns one MP3 with a label-free payload", async () => {
    const runner = mockRunner();
    const result = await synthesizeListeningScript(runner, { script: PHONE_CALL, voice: DEFAULT_NARRATOR_VOICE, joiner: mp3FrameJoiner });
    expect(runner.synthesize).toHaveBeenCalledTimes(5);
    for (const [input] of runner.synthesize.mock.calls) expect(input.text).not.toMatch(/(Narrator|Receptionist|Ahmed):/u);
    expect(runner.synthesize.mock.calls[1]![0]).toEqual({ text: "Good afternoon, Brightway Supplies. How can I help you?", voice: "en-GB-SoniaNeural", rate: "-8%" });
    expect(runner.synthesize.mock.calls[2]![0]).toMatchObject({ voice: "en-GB-RyanNeural" });
    expect(result).toMatchObject({ mimeType: "audio/mpeg", filename: "assessment-edge-tts-dialogue.mp3" });
    expect(result.bytes.byteLength).toBe(144 * (5 * 2 + 4 * 5));
  });

  it("keeps the single-voice call unchanged for a monologue", async () => {
    const runner = mockRunner();
    await synthesizeListeningScript(runner, { script: "Read this script", voice: "en-US-AvaMultilingualNeural" });
    expect(runner.synthesize).toHaveBeenCalledExactlyOnceWith({ text: "Read this script", voice: "en-US-AvaMultilingualNeural" });
  });
});
