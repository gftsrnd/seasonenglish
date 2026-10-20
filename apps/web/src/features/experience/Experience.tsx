import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import type { LessonSpeechOptions, LessonSpeechStatus } from "./contracts.js";
import { cancelExclusiveAudio, claimExclusiveAudio, isExclusiveAudioActive, releaseExclusiveAudio } from "./audio-precedence.js";

type FeedbackTone = "click" | "success" | "error" | "warning" | "celebrate";
type NoticeTone = "success" | "error" | "info";

type Notice = { readonly id: number; readonly message: string; readonly tone: NoticeTone };

type Experience = {
  readonly effectsOn: boolean;
  readonly musicOn: boolean;
  readonly musicAllowed: boolean;
  readonly play: (tone: FeedbackTone) => void;
  readonly toggleEffects: () => void;
  readonly toggleMusic: () => void;
  readonly notify: (message: string, tone?: NoticeTone) => void;
  readonly speak: (text: string, language?: string, options?: LessonSpeechOptions) => void;
  readonly holdMusic: (held: boolean) => void;
};

const ExperienceContext = createContext<Experience | undefined>(undefined);
const EFFECTS_KEY = "e4s:effects";
const MUSIC_KEY = "e4s:music";
const quietExperience: Experience = {
  effectsOn: true,
  musicOn: true,
  musicAllowed: true,
  play: () => undefined,
  toggleEffects: () => undefined,
  toggleMusic: () => undefined,
  notify: () => undefined,
  speak: () => undefined,
  holdMusic: () => undefined
};

function savedPreference(key: string, fallback: boolean) {
  try {
    const saved = window.localStorage.getItem(key);
    return saved === null ? fallback : saved === "on";
  } catch {
    return fallback;
  }
}

function storePreference(key: string, value: boolean) {
  try { window.localStorage.setItem(key, value ? "on" : "off"); } catch { /* browser privacy mode: keep this session only */ }
}

export function ExperienceProvider({ children, musicAllowed = true }: { children: ReactNode; musicAllowed?: boolean }) {
  const [effectsOn, setEffectsOn] = useState(() => savedPreference(EFFECTS_KEY, true));
  const [musicOn, setMusicOn] = useState(() => musicAllowed && savedPreference(MUSIC_KEY, true));
  const [musicHeld, setMusicHeld] = useState(false);
  const [musicRunning, setMusicRunning] = useState(false);
  const [notices, setNotices] = useState<readonly Notice[]>([]);
  const audio = useRef<{ context?: AudioContext; musicTimer?: number; musicGain?: GainNode }>({});
  const noticeId = useRef(0);

  const context = useCallback(() => {
    if (typeof globalThis.AudioContext === "undefined") return undefined;
    if (!audio.current.context) audio.current.context = new globalThis.AudioContext();
    const current = audio.current.context;
    if (current.state === "suspended") void current.resume();
    return current;
  }, []);

  const stopMusicPlayback = useCallback(() => {
    if (audio.current.musicTimer !== undefined) window.clearInterval(audio.current.musicTimer);
    delete audio.current.musicTimer;
    audio.current.musicGain?.disconnect();
    delete audio.current.musicGain;
    setMusicRunning(false);
  }, []);

  const stopMusic = useCallback(() => {
    cancelExclusiveAudio("music");
    stopMusicPlayback();
  }, [stopMusicPlayback]);

  const startMusic = useCallback((force = false) => {
    if (!musicAllowed || musicHeld || audio.current.musicTimer !== undefined || (!musicOn && !force)) return;
    if (isExclusiveAudioActive("speech") || isExclusiveAudioActive("media") || isExclusiveAudioActive("microphone")) return;
    const current = context();
    if (!current) return;
    const gain = current.createGain();
    gain.gain.value = 0.026;
    gain.connect(current.destination);
    audio.current.musicGain = gain;
    const release = claimExclusiveAudio("music", stopMusicPlayback, () => startMusic());
    if (!release) {
      stopMusicPlayback();
      return;
    }
    const notes = [261.63, 329.63, 392, 329.63, 293.66, 349.23, 440, 349.23];
    let beat = 0;
    const playNote = () => {
      const oscillator = current.createOscillator();
      const envelope = current.createGain();
      const now = current.currentTime;
      oscillator.type = "sine";
      oscillator.frequency.value = notes[beat % notes.length]!;
      envelope.gain.setValueAtTime(0.0001, now);
      envelope.gain.exponentialRampToValueAtTime(0.38, now + 0.025);
      envelope.gain.exponentialRampToValueAtTime(0.0001, now + 0.36);
      oscillator.connect(envelope).connect(gain);
      oscillator.start(now);
      oscillator.stop(now + 0.39);
      beat += 1;
    };
    playNote();
    audio.current.musicTimer = window.setInterval(playNote, 510);
    setMusicRunning(true);
  }, [context, musicAllowed, musicOn, stopMusicPlayback]);

  const play = useCallback((tone: FeedbackTone) => {
    if (!effectsOn) return;
    const current = context();
    if (!current) return;
    const now = current.currentTime;
    const sound = current.createOscillator();
    const gain = current.createGain();
    const presets: Record<FeedbackTone, readonly [number, number, number, OscillatorType]> = {
      click: [420, 520, 0.06, "sine"],
      success: [520, 784, 0.18, "triangle"],
      error: [220, 128, 0.2, "sawtooth"],
      warning: [330, 250, 0.15, "square"],
      celebrate: [523, 1046, 0.34, "triangle"]
    };
    const [from, to, duration, wave] = presets[tone];
    sound.type = wave;
    sound.frequency.setValueAtTime(from, now);
    sound.frequency.exponentialRampToValueAtTime(to, now + duration);
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(tone === "click" ? 0.045 : 0.1, now + 0.012);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);
    sound.connect(gain).connect(current.destination);
    sound.start(now);
    sound.stop(now + duration + 0.02);
  }, [context, effectsOn]);

  const notify = useCallback((message: string, tone: NoticeTone = "info") => {
    const id = ++noticeId.current;
    setNotices((current) => [...current, { id, message, tone }]);
    if (tone === "success") play("success");
    if (tone === "error") play("error");
    window.setTimeout(() => setNotices((current) => current.filter((notice) => notice.id !== id)), 4400);
  }, [play]);

  const speak = useCallback((text: string, language = "en-US", options?: LessonSpeechOptions) => {
    const onStatus = options?.onStatus;
    if (!("speechSynthesis" in window) || typeof SpeechSynthesisUtterance === "undefined") {
      onStatus?.("unsupported" satisfies LessonSpeechStatus);
      return;
    }
    if (!text.trim()) {
      onStatus?.("ended" satisfies LessonSpeechStatus);
      return;
    }
    cancelExclusiveAudio("speech");
    const release = claimExclusiveAudio("speech", () => window.speechSynthesis.cancel(), () => startMusic());
    if (!release) return;
    window.speechSynthesis.cancel();
    const speech = new SpeechSynthesisUtterance(text);
    speech.lang = language;
    speech.rate = 0.9;
    speech.onstart = () => onStatus?.("started" satisfies LessonSpeechStatus);
    const restore = (status: LessonSpeechStatus) => {
      releaseExclusiveAudio("speech");
      onStatus?.(status);
    };
    speech.onend = () => restore("ended");
    speech.onerror = () => restore("error");
    try {
      window.speechSynthesis.resume();
      window.speechSynthesis.speak(speech);
    } catch {
      restore("error");
    }
  }, [startMusic]);

  const holdMusic = useCallback((held: boolean) => {
    setMusicHeld(held);
    if (held) stopMusic();
    else if (musicOn) startMusic(true);
  }, [musicOn, startMusic, stopMusic]);

  useEffect(() => {
    document.documentElement.dataset.e4sAudioMusic = musicRunning ? "running" : "stopped";
    document.documentElement.dataset.e4sAudioMusicHeld = musicHeld ? "true" : "false";
  }, [musicHeld, musicOn, musicRunning]);

  useEffect(() => {
    storePreference(EFFECTS_KEY, effectsOn);
  }, [effectsOn]);

  useEffect(() => {
    storePreference(MUSIC_KEY, musicOn);
    if (musicOn) return;
    stopMusic();
  }, [musicOn, stopMusic]);

  useEffect(() => {
    if (musicAllowed) return;
    setMusicOn(false);
    stopMusic();
  }, [musicAllowed, stopMusic]);

  useEffect(() => {
    const handleVisibility = () => {
      if (document.visibilityState === "hidden") {
        stopMusic();
        return;
      }
      if (musicOn) startMusic();
    };
    document.addEventListener("visibilitychange", handleVisibility);
    return () => document.removeEventListener("visibilitychange", handleVisibility);
  }, [musicOn, startMusic, stopMusic]);

  useEffect(() => {
    const beginAudio = (event: PointerEvent) => {
      const target = event.target instanceof Element ? event.target : undefined;
      if (!target) return;
      const control = target.closest("button:not(:disabled), a[href], [role='button']");
      if (!control) return;
      if (musicOn) startMusic();
      play("click");
    };
    document.addEventListener("pointerdown", beginAudio, true);
    return () => document.removeEventListener("pointerdown", beginAudio, true);
  }, [musicOn, play, startMusic]);

  useEffect(() => () => stopMusic(), [stopMusic]);

  const value = useMemo<Experience>(() => ({
    effectsOn,
    musicOn,
    musicAllowed,
    play,
    toggleEffects: () => setEffectsOn((value) => !value),
    toggleMusic: () => setMusicOn((value) => {
      if (!musicAllowed) {
        stopMusic();
        return false;
      }
      const next = !value;
      if (next) startMusic(true);
      else stopMusic();
      return next;
    }),
    notify,
    speak,
    holdMusic
  }), [effectsOn, holdMusic, musicAllowed, musicOn, notify, play, speak, startMusic, stopMusic]);

  return <ExperienceContext.Provider value={value}>{children}<div className="experience-notices" aria-live="polite" aria-atomic="true">{notices.map((notice) => <p className={`experience-notice experience-notice--${notice.tone}`} key={notice.id}>{notice.message}</p>)}</div></ExperienceContext.Provider>;
}

export function useExperience() {
  const experience = useContext(ExperienceContext);
  return experience ?? quietExperience;
}
