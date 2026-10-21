// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ExperienceProvider, useExperience } from "./Experience.js";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  Reflect.deleteProperty(window, "speechSynthesis");
  Reflect.deleteProperty(window, "SpeechSynthesisUtterance");
});

function SpeechProbe({ onStatus }: { onStatus: (status: string) => void }) {
  const { speak } = useExperience();
  return <button type="button" onClick={() => speak("Xin chào", "vi-VN", { onStatus })}>Nghe</button>;
}

function AudioProbe({ onStatus }: { onStatus: (status: string) => void }) {
  const { speak } = useExperience();
  return <button type="button" onClick={() => speak("Xin chào", "vi-VN", { audioSrc: "/media/audio/sound-check-vi.mp3", onStatus })}>Nghe</button>;
}

describe("experience speech voice selection", () => {
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
    render(<ExperienceProvider><SpeechProbe onStatus={(status) => statuses.push(status)} /></ExperienceProvider>);
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

    render(<ExperienceProvider><AudioProbe onStatus={(status) => statuses.push(status)} /></ExperienceProvider>);
    await user.click(screen.getByRole("button", { name: "Nghe" }));

    expect(play).toHaveBeenCalledTimes(1);
    expect(statuses).toEqual([]);
  });
});
