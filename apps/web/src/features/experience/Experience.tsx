import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import type { OrganisationBackgroundMusicView } from "@e4s/contracts";
import type { SeasonTheme } from "../../app/games/season-visual.js";
import type { LessonSpeechOptions, LessonSpeechStatus } from "./contracts.js";
import { cancelExclusiveAudio, claimExclusiveAudio, isExclusiveAudioActive, releaseExclusiveAudio } from "./audio-precedence.js";
import { resolveBackgroundMusic } from "./music-selection.js";
import { createMusicPlayer, type MusicPlayer } from "./music-player.js";
import { BUNDLED_CALM_MUSIC_URL } from "./music-presets.js";

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
  const [musicOn, setMusicOn] = useState(() => savedPreference(MUSIC_KEY, true));
  const [musicHeld, setMusicHeld] = useState(false);
  const [musicRunning, setMusicRunning] = useState(false);
  const [notices, setNotices] = useState<readonly Notice[]>([]);
  const audio = useRef<{ context?: AudioContext; music?: MusicPlayer; musicUrl?: string; warning?: HTMLAudioElement }>({});
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
      delete audio.current.musicUrl;
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
    let music: MusicPlayer;
    try { music = createMusicPlayer(selection.url); } catch { return; }
    const configure = (player: MusicPlayer, url: string) => {
      player.preload = "auto";
      player.loop = true;
      player.volume = selection.volume;
      audio.current.music = player;
      audio.current.musicUrl = url;
      player.onplay = () => setMusicRunning(true);
    };
    configure(music, selection.url);
    const release = claimExclusiveAudio("music", stopMusicPlayback, () => startMusic());
    if (!release) {
      stopMusicPlayback();
      return;
    }
    let fallbackStarted = false;
    const fail = () => {
      if (fallbackStarted) return;
      if (selection.url === BUNDLED_CALM_MUSIC_URL || audio.current.music !== music) {
        stopMusic();
        return;
      }
      fallbackStarted = true;
      music.pause();
      music.currentTime = 0;
      let fallback: MusicPlayer;
      try { fallback = createMusicPlayer(BUNDLED_CALM_MUSIC_URL); } catch { stopMusic(); return; }
      music = fallback;
      configure(fallback, BUNDLED_CALM_MUSIC_URL);
      fallback.onerror = () => stopMusic();
      try { void fallback.play().catch(() => stopMusic()); } catch { stopMusic(); }
    };
    music.onerror = fail;
    try { void music.play().catch(fail); } catch { fail(); }
  }, [musicConfig, musicHeld, musicOn, musicTheme, organisationMusicAllowed, stopMusic, stopMusicPlayback]);

  const play = useCallback((tone: FeedbackTone, options?: FeedbackOptions) => {
    if (!effectsOn && !options?.force) return;
    if (tone === "warning" && options?.force) {
      try {
        const warning = audio.current.warning ?? new Audio("/media/audio/exam-warning.wav");
        audio.current.warning = warning;
        warning.volume = 0.85;
        warning.currentTime = 0;
        void warning.play().catch(() => undefined);
        return;
      } catch {
        // Fall through to the oscillator when HTML audio is unavailable.
      }
    }
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
        onStatus?.("cancelled" satisfies LessonSpeechStatus);
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
    if (!text.trim()) {
      onStatus?.("ended" satisfies LessonSpeechStatus);
      return;
    }
    if (language.toLocaleLowerCase().startsWith("vi")) {
      onStatus?.("no_voice" satisfies LessonSpeechStatus);
      return;
    }
    if (!("speechSynthesis" in window) || typeof SpeechSynthesisUtterance === "undefined") {
      onStatus?.("unsupported" satisfies LessonSpeechStatus);
      return;
    }
    const voices = window.speechSynthesis.getVoices();
    const languagePrefix = language.split("-")[0]?.toLocaleLowerCase();
    const voice = voices.find((candidate) => candidate.lang.toLocaleLowerCase() === language.toLocaleLowerCase())
      ?? voices.find((candidate) => candidate.lang.toLocaleLowerCase().startsWith(`${languagePrefix}-`));
    if (!voice) {
      onStatus?.("no_voice" satisfies LessonSpeechStatus);
      return;
    }
    cancelExclusiveAudio("speech");
    const utterance = new SpeechSynthesisUtterance(text.trim());
    utterance.lang = language;
    utterance.voice = voice;
    utterance.rate = options?.rate ?? 0.9;
    const release = claimExclusiveAudio("speech", () => {
      window.speechSynthesis.cancel();
      onStatus?.("cancelled" satisfies LessonSpeechStatus);
    }, () => startMusic());
    if (!release) return;
    let completed = false;
    const finish = (status: LessonSpeechStatus) => {
      if (completed) return;
      completed = true;
      releaseExclusiveAudio("speech");
      onStatus?.(status);
    };
    utterance.onstart = () => onStatus?.("started" satisfies LessonSpeechStatus);
    utterance.onend = () => finish("ended");
    utterance.onerror = () => finish("error");
    window.speechSynthesis.cancel();
    window.speechSynthesis.resume();
    window.speechSynthesis.speak(utterance);
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
    stopMusic();
  }, [organisationMusicAllowed, stopMusic]);

  useEffect(() => {
    if (!audio.current.music) return;
    audio.current.music.volume = Math.max(0, Math.min(100, musicConfig.volume)) / 100;
  }, [musicConfig.volume]);

  useEffect(() => {
    if (!audio.current.music) return;
    const selection = resolveBackgroundMusic({ theme: musicTheme, date: new Date(), config: musicConfig, personalEnabled: musicOn, suspended: musicHeld });
    if (!selection.enabled || audio.current.musicUrl === selection.url) return;
    stopMusic();
    startMusic(true);
  }, [musicConfig, musicHeld, musicOn, musicTheme, startMusic, stopMusic]);

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
    const beginAudio = () => {
      if (musicOn) startMusic();
      play("click");
    };
    document.addEventListener("pointerdown", beginAudio, true);
    document.addEventListener("keydown", beginAudio, true);
    return () => {
      document.removeEventListener("pointerdown", beginAudio, true);
      document.removeEventListener("keydown", beginAudio, true);
    };
  }, [musicOn, play, startMusic]);

  useEffect(() => () => stopMusic(), [stopMusic]);

  const value = useMemo<Experience>(() => ({
    effectsOn,
    musicOn: organisationMusicAllowed && musicOn,
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
