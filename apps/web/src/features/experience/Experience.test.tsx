// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ExperienceProvider, useExperience } from "./Experience.js";
import { cancelExclusiveAudio } from "./audio-precedence.js";

afterEach(() => {
  cancelExclusiveAudio("speech");
  cancelExclusiveAudio("media");
  cancelExclusiveAudio("microphone");
  cancelExclusiveAudio("music");
  cleanup();
  vi.unstubAllGlobals();
  Reflect.deleteProperty(window, "speechSynthesis");
  Reflect.deleteProperty(window, "SpeechSynthesisUtterance");
});

beforeEach(() => window.localStorage.clear());

function SpeechProbe({ onStatus }: { onStatus: (status: string) => void }) {
  const { speak } = useExperience();
  return <button type="button" onClick={() => speak("Xin chào", "vi-VN", { onStatus })}>Nghe</button>;
}

function SlowSpeechProbe() {
  const { speak } = useExperience();
  return <button type="button" onClick={() => speak("time", "en-US", { rate: 0.65 })}>Nghe chậm</button>;
}

function AudioProbe({ onStatus }: { onStatus: (status: string) => void }) {
  const { speak } = useExperience();
  return <button type="button" onClick={() => speak("Xin chào", "vi-VN", { audioSrc: "/media/audio/sound-check-vi.mp3", onStatus })}>Nghe</button>;
}

function EmptyAudioProbe({ onStatus }: { onStatus: (status: string) => void }) {
  const { speak } = useExperience();
  return <button type="button" onClick={() => speak("", "en-US", { audioSrc: "/audio/ay.mp3", onStatus })}>Nghe âm IPA</button>;
}

function EmptyTextProbe({ onStatus }: { onStatus: (status: string) => void }) {
  const { speak } = useExperience();
  return <button type="button" onClick={() => speak("", "en-US", { onStatus })}>Nghe trống</button>;
}

function MusicLifecycleProbe() {
  const { holdMusic, musicOn, toggleMusic } = useExperience();
  return <><span data-testid="music-preference">{String(musicOn)}</span><button type="button">Bắt đầu</button><button type="button" onClick={() => holdMusic(true)}>Giữ nhạc</button><button type="button" onClick={toggleMusic}>Đổi trạng thái nhạc</button></>;
}

function ForcedWarningProbe() {
  const { play, toggleEffects } = useExperience();
  return <><button type="button" onClick={toggleEffects}>Tắt hiệu ứng</button><button type="button" onClick={() => play("warning", { force: true })}>Cảnh báo bắt buộc</button></>;
}

describe("experience speech voice selection", () => {
  it("plays the packaged double beep for a forced exam warning even when effects are off", async () => {
    const user = userEvent.setup();
    const play = vi.fn().mockResolvedValue(undefined);
    const created: Array<{ src: string; volume: number }> = [];
    vi.stubGlobal("Audio", class {
      volume = 1;
      currentTime = 0;
      constructor(readonly src: string) { created.push(this); }
      play = () => play();
      pause = vi.fn();
    });

    render(<ExperienceProvider musicAllowed={false}><ForcedWarningProbe /></ExperienceProvider>);
    await user.click(screen.getByRole("button", { name: "Tắt hiệu ứng" }));
    await user.click(screen.getByRole("button", { name: "Cảnh báo bắt buộc" }));

    expect(created).toEqual([expect.objectContaining({ src: "/media/audio/exam-warning.wav", volume: 0.85 })]);
    expect(play).toHaveBeenCalledOnce();
  });

  it("applies the requested slow pronunciation rate", async () => {
    const user = userEvent.setup();
    const utterances: Array<{ rate: number }> = [];
    Object.defineProperty(window, "speechSynthesis", {
      configurable: true,
      value: { cancel: vi.fn(), resume: vi.fn(), speak: vi.fn((value) => utterances.push(value)), getVoices: vi.fn(() => [{ lang: "en-US" }]) }
    });
    vi.stubGlobal("SpeechSynthesisUtterance", class {
      lang = "";
      voice?: unknown;
      rate = 1;
      onstart?: () => void;
      onend?: () => void;
      onerror?: () => void;
    });
    render(<ExperienceProvider musicAllowed={false}><SlowSpeechProbe /></ExperienceProvider>);
    await user.click(screen.getByRole("button", { name: "Nghe chậm" }));
    expect(utterances[0]?.rate).toBe(0.65);
  });

  it("does not send Vietnamese text to an English voice", async () => {
    const user = userEvent.setup();
    const speak = vi.fn();
    Object.defineProperty(window, "speechSynthesis", {
      configurable: true,
      value: { cancel: vi.fn(), resume: vi.fn(), speak, getVoices: vi.fn(() => [{ lang: "en-US" }]) }
    });
    vi.stubGlobal("SpeechSynthesisUtterance", class {
      lang = "";
      voice?: unknown;
      onstart?: () => void;
      onend?: () => void;
      onerror?: () => void;
      constructor(readonly text: string) {}
    });

    const statuses: string[] = [];
    render(<ExperienceProvider musicAllowed={false}><SpeechProbe onStatus={(status) => statuses.push(status)} /></ExperienceProvider>);
    await user.click(screen.getByRole("button", { name: "Nghe" }));

    expect(speak).not.toHaveBeenCalled();
    expect(statuses).toEqual(["no_voice"]);
  });

  it("uses the bundled Vietnamese audio instead of browser voices when provided", async () => {
    const user = userEvent.setup();
    const statuses: string[] = [];
    const play = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal("Audio", class {
      onplay: (() => void) | null = null;
      onended: (() => void) | null = null;
      onerror: (() => void) | null = null;
      preload = "";
      constructor(readonly src: string) {}
      play = () => play();
      pause = vi.fn();
    });

    render(<ExperienceProvider musicAllowed={false}><AudioProbe onStatus={(status) => statuses.push(status)} /></ExperienceProvider>);
    await user.click(screen.getByRole("button", { name: "Nghe" }));

    expect(play).toHaveBeenCalledTimes(1);
    expect(statuses).toEqual([]);
  });

  it("plays a dedicated IPA asset even when there is no text fallback", async () => {
    const user = userEvent.setup();
    const created: Array<{ src: string }> = [];
    const play = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal("Audio", class {
      onplay: (() => void) | null = null;
      onended: (() => void) | null = null;
      onerror: (() => void) | null = null;
      preload = "";
      constructor(readonly src: string) { created.push(this); }
      play = () => play();
      pause = vi.fn();
    });
    const statuses: string[] = [];

    render(<ExperienceProvider musicAllowed={false}><EmptyAudioProbe onStatus={(status) => statuses.push(status)} /></ExperienceProvider>);
    await user.click(screen.getByRole("button", { name: "Nghe âm IPA" }));

    expect(created).toEqual([expect.objectContaining({ src: "/audio/ay.mp3" })]);
    expect(play).toHaveBeenCalledOnce();
    expect(statuses).toEqual([]);
  });

  it("reports ended for empty text when no audio asset was supplied", async () => {
    const user = userEvent.setup();
    const statuses: string[] = [];
    render(<ExperienceProvider musicAllowed={false}><EmptyTextProbe onStatus={(status) => statuses.push(status)} /></ExperienceProvider>);

    await user.click(screen.getByRole("button", { name: "Nghe trống" }));

    expect(statuses).toEqual(["ended"]);
  });

  it("plays the selected licensed track at organisation volume and suspends it for exclusive audio", async () => {
    const user = userEvent.setup();
    const play = vi.fn().mockResolvedValue(undefined);
    const pause = vi.fn();
    const created: Array<{ src: string; volume: number }> = [];
    vi.stubGlobal("Audio", class {
      onplay: (() => void) | null = null;
      onended: (() => void) | null = null;
      onerror: (() => void) | null = null;
      preload = "";
      loop = false;
      volume = 1;
      currentTime = 0;
      constructor(readonly src: string) { created.push(this); }
      play = () => { this.onplay?.(); return play(); };
      pause = pause;
    });

    render(<ExperienceProvider musicTheme="autumn" musicConfig={{ enabled: true, playlistId: "in-dreamland", customUrl: "https://example.test/study.mp3", volume: 37 }}><MusicLifecycleProbe /></ExperienceProvider>);
    await user.click(screen.getByRole("button", { name: "Bắt đầu" }));

    expect(created[0]).toMatchObject({ src: "https://example.test/study.mp3", volume: 0.37 });
    expect(play).toHaveBeenCalledOnce();
    await user.click(screen.getByRole("button", { name: "Giữ nhạc" }));
    expect(pause).toHaveBeenCalled();
  });

  it("updates a running track when the organisation volume changes", async () => {
    const user = userEvent.setup();
    const created: Array<{ volume: number }> = [];
    vi.stubGlobal("Audio", class {
      onplay: (() => void) | null = null;
      onerror: (() => void) | null = null;
      preload = "";
      loop = false;
      volume = 1;
      currentTime = 0;
      constructor() { created.push(this); }
      play = () => { this.onplay?.(); return Promise.resolve(); };
      pause = vi.fn();
    });

    const { rerender } = render(<ExperienceProvider musicConfig={{ enabled: true, playlistId: "in-dreamland", customUrl: "https://example.test/study.mp3", volume: 37 }}><MusicLifecycleProbe /></ExperienceProvider>);
    await user.click(screen.getByRole("button", { name: "Bắt đầu" }));
    rerender(<ExperienceProvider musicConfig={{ enabled: true, playlistId: "in-dreamland", customUrl: "https://example.test/study.mp3", volume: 8 }}><MusicLifecycleProbe /></ExperienceProvider>);

    expect(created[0]?.volume).toBe(0.08);
  });

  it("replaces the running track when the selected song changes", async () => {
    const user = userEvent.setup();
    const created: Array<{ src: string; pause: ReturnType<typeof vi.fn> }> = [];
    vi.stubGlobal("Audio", class {
      onplay: (() => void) | null = null;
      onerror: (() => void) | null = null;
      preload = "";
      loop = false;
      volume = 1;
      currentTime = 0;
      pause = vi.fn();
      constructor(readonly src: string) { created.push(this); }
      play = () => { this.onplay?.(); return Promise.resolve(); };
    });

    const { rerender } = render(<ExperienceProvider musicConfig={{ enabled: true, playlistId: "in-dreamland", customUrl: "https://example.test/first.mp3", volume: 22 }}><MusicLifecycleProbe /></ExperienceProvider>);
    await user.click(screen.getByRole("button", { name: "Bắt đầu" }));
    rerender(<ExperienceProvider musicConfig={{ enabled: true, playlistId: "kiwi", customUrl: "https://example.test/second.mp3", volume: 22 }}><MusicLifecycleProbe /></ExperienceProvider>);

    expect(created[0]?.pause).toHaveBeenCalled();
    expect(created[1]?.src).toBe("https://example.test/second.mp3");
  });

  it("falls back to the bundled calm track when an online track cannot load", async () => {
    const user = userEvent.setup();
    const created: Array<{ src: string; onerror: (() => void) | null }> = [];
    vi.stubGlobal("Audio", class {
      onplay: (() => void) | null = null;
      onerror: (() => void) | null = null;
      preload = "";
      loop = false;
      volume = 1;
      currentTime = 0;
      constructor(readonly src: string) { created.push(this); }
      play = () => { this.onplay?.(); return Promise.resolve(); };
      pause = vi.fn();
    });

    render(<ExperienceProvider musicConfig={{ enabled: true, playlistId: "in-dreamland", customUrl: "https://example.test/online.mp3", volume: 22 }}><MusicLifecycleProbe /></ExperienceProvider>);
    await user.click(screen.getByRole("button", { name: "Bắt đầu" }));
    created[0]?.onerror?.();

    expect(created.map((track) => track.src)).toEqual([
      "https://example.test/online.mp3",
      "/media/audio/emerald-therapy.mp3"
    ]);
  });

  it("does not autoplay before interaction and stops music while the tab is hidden", async () => {
    const user = userEvent.setup();
    const pause = vi.fn();
    const created: Array<{ src: string }> = [];
    let visibility: DocumentVisibilityState = "visible";
    vi.spyOn(document, "visibilityState", "get").mockImplementation(() => visibility);
    vi.stubGlobal("Audio", class {
      onplay: (() => void) | null = null;
      onerror: (() => void) | null = null;
      preload = "";
      loop = false;
      volume = 1;
      currentTime = 0;
      constructor(readonly src: string) { created.push(this); }
      play = () => { this.onplay?.(); return Promise.resolve(); };
      pause = pause;
    });

    render(<ExperienceProvider musicConfig={{ enabled: true, playlistId: "in-dreamland", customUrl: "https://example.test/study.mp3", volume: 22 }}><MusicLifecycleProbe /></ExperienceProvider>);
    expect(created).toHaveLength(0);

    await user.click(screen.getByRole("button", { name: "Bắt đầu" }));
    expect(created).toHaveLength(1);
    visibility = "hidden";
    document.dispatchEvent(new Event("visibilitychange"));
    expect(pause).toHaveBeenCalled();
  });

  it("resumes with a fresh player after the tab becomes visible again", async () => {
    const user = userEvent.setup();
    const created: Array<{ src: string; pause: ReturnType<typeof vi.fn> }> = [];
    let visibility: DocumentVisibilityState = "visible";
    vi.spyOn(document, "visibilityState", "get").mockImplementation(() => visibility);
    vi.stubGlobal("Audio", class {
      onplay: (() => void) | null = null;
      onerror: (() => void) | null = null;
      preload = "";
      loop = false;
      volume = 1;
      currentTime = 0;
      pause = vi.fn();
      constructor(readonly src: string) { created.push(this); }
      play = () => { this.onplay?.(); return Promise.resolve(); };
    });

    render(<ExperienceProvider musicConfig={{ enabled: true, playlistId: "in-dreamland", customUrl: "https://example.test/study.mp3", volume: 22 }}><MusicLifecycleProbe /></ExperienceProvider>);
    await user.click(screen.getByRole("button", { name: "Bắt đầu" }));
    visibility = "hidden";
    document.dispatchEvent(new Event("visibilitychange"));
    visibility = "visible";
    document.dispatchEvent(new Event("visibilitychange"));

    expect(created).toHaveLength(2);
    expect(created[0]?.pause).toHaveBeenCalled();
    expect(created[1]?.src).toBe("https://example.test/study.mp3");
  });

  it("does not overwrite the device music preference when organisation music is temporarily disabled", () => {
    window.localStorage.setItem("e4s:music", "on");
    const { rerender } = render(<ExperienceProvider musicAllowed={false}><MusicLifecycleProbe /></ExperienceProvider>);

    expect(screen.getByTestId("music-preference")).toHaveTextContent("false");
    expect(window.localStorage.getItem("e4s:music")).toBe("on");

    rerender(<ExperienceProvider musicAllowed><MusicLifecycleProbe /></ExperienceProvider>);
    expect(screen.getByTestId("music-preference")).toHaveTextContent("true");
  });

  it("keeps the device music preference after unmounting for an account or role change", async () => {
    const user = userEvent.setup();
    const first = render(<ExperienceProvider><MusicLifecycleProbe /></ExperienceProvider>);
    await user.click(screen.getByRole("button", { name: "Đổi trạng thái nhạc" }));

    expect(window.localStorage.getItem("e4s:music")).toBe("off");
    first.unmount();
    render(<ExperienceProvider><MusicLifecycleProbe /></ExperienceProvider>);

    expect(screen.getByTestId("music-preference")).toHaveTextContent("false");
    expect(window.localStorage.getItem("e4s:music")).toBe("off");
  });
});
