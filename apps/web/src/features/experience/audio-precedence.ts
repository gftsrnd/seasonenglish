export type ExclusiveAudioSource = "music" | "speech" | "media" | "microphone";

type ActiveAudio = {
  source: ExclusiveAudioSource;
  stop: () => void;
  token: symbol;
  resumeMusic?: () => void;
};

const priority: Record<ExclusiveAudioSource, number> = {
  music: 1,
  speech: 2,
  media: 2,
  microphone: 3
};

let active: ActiveAudio | undefined;
let pausedMusic: (() => void) | undefined;

/** Claims the one long-form audio channel and stops the previous owner. */
export function claimExclusiveAudio(
  source: ExclusiveAudioSource,
  stop: () => void,
  resumeMusic?: () => void
): (() => void) | undefined {
  if (active && priority[source] < priority[active.source]) return undefined;

  const previous = active;
  if (previous?.source === "music") pausedMusic = previous.resumeMusic;

  const token = Symbol(source);
  active = { source, stop, token, ...(source === "music" && resumeMusic ? { resumeMusic } : {}) };
  previous?.stop();

  return () => {
    if (active?.token !== token) return;
    active = undefined;
    const resume = source === "music" ? undefined : pausedMusic;
    pausedMusic = undefined;
    resume?.();
  };
}

export function releaseExclusiveAudio(source: ExclusiveAudioSource) {
  if (active?.source !== source) return;
  active = undefined;
  const resume = source === "music" ? undefined : pausedMusic;
  pausedMusic = undefined;
  resume?.();
}

export function cancelExclusiveAudio(source: ExclusiveAudioSource) {
  if (active?.source === source) {
    const current = active;
    active = undefined;
    if (source === "music") pausedMusic = undefined;
    current.stop();
    return;
  }
  if (source === "music") pausedMusic = undefined;
}

/** Stops the active long-form channel without resuming any paused background audio. */
export function cancelAllExclusiveAudio() {
  const current = active;
  active = undefined;
  pausedMusic = undefined;
  current?.stop();
}

export function isExclusiveAudioActive(source: ExclusiveAudioSource) {
  return active?.source === source;
}

/** Plays a detached media element through the same one-at-a-time channel. */
export function playExclusiveMedia(src: string, onError?: () => void): void {
  if (typeof Audio === "undefined") return;
  const audio = new Audio(src);
  let release: (() => void) | undefined;
  const stop = () => {
    if (typeof audio.pause === "function") audio.pause();
    audio.currentTime = 0;
  };
  release = claimExclusiveAudio("media", stop);
  if (!release) return;
  const finish = () => {
    release?.();
    release = undefined;
  };
  audio.onended = finish;
  audio.onerror = () => { finish(); onError?.(); };
  void audio.play().catch(() => { finish(); onError?.(); });
}
