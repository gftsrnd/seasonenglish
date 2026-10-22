import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import type { OrganisationBackgroundMusicView } from "@e4s/contracts";
import type { SeasonTheme } from "../../app/games/season-visual.js";
import type { LessonSpeechOptions, LessonSpeechStatus } from "./contracts.js";
import { cancelExclusiveAudio, claimExclusiveAudio, isExclusiveAudioActive, releaseExclusiveAudio } from "./audio-precedence.js";
import { resolveBackgroundMusic } from "./music-selection.js";

type FeedbackTone = "click" | "success" | "error" | "warning" | "celebrate";
type NoticeTone = "success" | "error" | "info";
type FeedbackOptions = { force?: boolean };

type Notice = { readonly id: number; readonly message: string; readonly tone: NoticeTone };

type Experience = {
  readonly effectsOn: boolean;
  readonly musicOn: boolean;
  readonly musicAllowed: boolean;
  readonly play: (tone: FeedbackTone, options?: FeedbackOptions) => void;
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

const defaultMusicConfig: OrganisationBackgroundMusicView = { enabled: true, playlistId: "auto", customUrl: "", volume: 22 };

export function ExperienceProvider({ children, musicAllowed = true, musicConfig = defaultMusicConfig, musicTheme = "summer" }: { children: ReactNode; musicAllowed?: boolean; musicConfig?: OrganisationBackgroundMusicView; musicTheme?: SeasonTheme }) {
  const organisationMusicAllowed = musicAllowed && musicConfig.enabled;
  const [effectsOn, setEffectsOn] = useState(() => savedPreference(EFFECTS_KEY, true));
  const [musicOn, setMusicOn] = useState(() => organisationMusicAllowed && savedPreference(MUSIC_KEY, true));
  const [musicHeld, setMusicHeld] = useState(false);
  const [musicRunning, setMusicRunning] = useState(false);
  const [notices, setNotices] = useState<readonly Notice[]>([]);
  const audio = useRef<{ context?: AudioContext; music?: HTMLAudioElement }>({});
  const noticeId = useRef(0);

  const context = useCallback(() => {
    if (typeof globalThis.AudioContext === "undefined") return undefined;
    if (!audio.current.context) audio.current.context = new globalThis.AudioContext();
    const current = audio.current.context;
    if (current.state === "suspended") void current.resume();
    return current;
  }, []);

  const stopMusicPlayback = useCallback(() => {
    if (audio.current.music) {
      audio.current.music.pause();
      audio.current.music.currentTime = 0;
      delete audio.current.music;
    }
    setMusicRunning(false);
  }, []);

  const stopMusic = useCallback(() => {
    cancelExclusiveAudio("music");
    stopMusicPlayback();
  }, [stopMusicPlayback]);

  const startMusic = useCallback((force = false) => {
    if (!organisationMusicAllowed || musicHeld || audio.current.music || (!musicOn && !force)) return;
    if (isExclusiveAudioActive("speech") || isExclusiveAudioActive("media") || isExclusiveAudioActive("microphone")) return;
    const selection = resolveBackgroundMusic({ theme: musicTheme, date: new Date(), config: musicConfig, personalEnabled: musicOn || force, suspended: musicHeld });
    if (!selection.enabled) return;
    let music: HTMLAudioElement;
    try { music = new Audio(selection.url); } catch { return; }
    music.preload = "auto";
    music.loop = true;
    music.volume = selection.volume;
    audio.current.music = music;
    const release = claimExclusiveAudio("music", stopMusicPlayback, () => startMusic());
    if (!release) {
      stopMusicPlayback();
      return;
    }
    music.onplay = () => setMusicRunning(true);
    music.onerror = () => stopMusic();
    try { void music.play().catch(() => stopMusic()); } catch { stopMusic(); }
  }, [musicConfig, musicHeld, musicOn, musicTheme, organisationMusicAllowed, stopMusic, stopMusicPlayback]);

  const play = useCallback((tone: FeedbackTone, options?: FeedbackOptions) => {
    if (!effectsOn && !options?.force) return;
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
    gain.gain.exponentialRampToValueAtTime(tone === "click" ? 0.42 : 0.52, now + 0.012);
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
    if (!text.trim()) {
      onStatus?.("ended" satisfies LessonSpeechStatus);
      return;
    }
    if (options?.audioSrc) {
      cancelExclusiveAudio("speech");
      let audioElement: HTMLAudioElement;
      try {
        audioElement = new Audio(options.audioSrc);
      } catch {
        onStatus?.("error" satisfies LessonSpeechStatus);
        return;
      }
      audioElement.preload = "auto";
      const release = claimExclusiveAudio("speech", () => {
        audioElement.pause();
        audioElement.currentTime = 0;
      }, () => startMusic());
      if (!release) return;
      let restored = false;
      const restore = (status: LessonSpeechStatus) => {
        if (restored) return;
        restored = true;
        releaseExclusiveAudio("speech");
        onStatus?.(status);
      };
      audioElement.onplay = () => onStatus?.("started" satisfies LessonSpeechStatus);
      audioElement.onended = () => restore("ended");
      audioElement.onerror = () => restore("error");
      try {
        void audioElement.play().catch(() => restore("error"));
      } catch {
        restore("error");
      }
      return;
    }
    if (!("speechSynthesis" in window) || typeof SpeechSynthesisUtterance === "undefined") {
      onStatus?.("unsupported" satisfies LessonSpeechStatus);
      return;
    }
    const requestedLanguage = language.toLowerCase();
    const languagePrefix = requestedLanguage.split("-")[0];
    const voices = window.speechSynthesis.getVoices();
    const voice = voices.find((candidate) => candidate.lang.toLowerCase() === requestedLanguage)
      ?? voices.find((candidate) => candidate.lang.toLowerCase().startsWith(`${languagePrefix}-`));
    if (languagePrefix === "vi" && !voice) {
      onStatus?.("no_voice" satisfies LessonSpeechStatus);
      return;
    }
    cancelExclusiveAudio("speech");
    const release = claimExclusiveAudio("speech", () => window.speechSynthesis.cancel(), () => startMusic());
    if (!release) return;
    window.speechSynthesis.cancel();
    const speech = new SpeechSynthesisUtterance(text);
    speech.lang = language;
    if (voice) speech.voice = voice;
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
    if (organisationMusicAllowed) return;
    setMusicOn(false);
    stopMusic();
  }, [organisationMusicAllowed, stopMusic]);

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
    musicAllowed: organisationMusicAllowed,
    play,
    toggleEffects: () => setEffectsOn((value) => !value),
    toggleMusic: () => setMusicOn((value) => {
      if (!organisationMusicAllowed) {
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
  }), [effectsOn, holdMusic, organisationMusicAllowed, musicOn, notify, play, speak, startMusic, stopMusic]);

  return <ExperienceContext.Provider value={value}>{children}<div className="experience-notices" aria-live="polite" aria-atomic="true">{notices.map((notice) => <p className={`experience-notice experience-notice--${notice.tone}`} key={notice.id}>{notice.message}</p>)}</div></ExperienceContext.Provider>;
}

export function useExperience() {
  const experience = useContext(ExperienceContext);
  return experience ?? quietExperience;
}
