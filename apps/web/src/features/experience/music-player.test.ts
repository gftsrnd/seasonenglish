// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { createMusicPlayer, youtubeEmbedUrl } from "./music-player.js";

describe("YouTube music URLs", () => {
  it.each([
    ["https://www.youtube.com/watch?v=abc123", "/embed/abc123?"],
    ["https://youtu.be/abc123", "/embed/abc123?"],
    ["https://music.youtube.com/watch?v=abc123", "/embed/abc123?"],
    ["https://www.youtube.com/playlist?list=PL123", "/embed/videoseries?"]
  ])("creates an autoplay embed for %s", (url, expected) => {
    expect(youtubeEmbedUrl(url)).toContain(expected);
  });

  it("rejects non-YouTube and malformed URLs", () => {
    expect(youtubeEmbedUrl("https://example.com/song.mp3")).toBeUndefined();
    expect(youtubeEmbedUrl("not a url")).toBeUndefined();
  });

  it("keeps the prototype playlist when a starting video and list are both present", () => {
    const embed = youtubeEmbedUrl("https://www.youtube.com/watch?v=DSWYAclv2I8&list=PLQwRmTwWx0uaoRXVcKbUDW0wm8G_WJzDI");
    expect(embed).toContain("/embed/DSWYAclv2I8?");
    expect(embed).toContain("list=PLQwRmTwWx0uaoRXVcKbUDW0wm8G_WJzDI");
  });

  it("waits for the YouTube ready event before playing and applies live volume", async () => {
    const player = createMusicPlayer("https://www.youtube.com/watch?v=abc123");
    const started = player.play();
    let resolved = false;
    void started.then(() => { resolved = true; });
    const iframe = document.querySelector<HTMLIFrameElement>('iframe[title="Trình phát nhạc YouTube"]');
    expect(iframe?.contentWindow).toBeTruthy();
    const postMessage = vi.spyOn(iframe!.contentWindow!, "postMessage");
    iframe!.onload?.(new Event("load"));

    await Promise.resolve();
    expect(resolved).toBe(false);
    expect(postMessage).not.toHaveBeenCalledWith(expect.stringContaining('"func":"playVideo"'), expect.anything());

    window.dispatchEvent(new MessageEvent("message", {
      origin: "https://www.youtube.com",
      source: iframe!.contentWindow,
      data: JSON.stringify({ event: "onReady" })
    }));
    await started;

    player.volume = 0.08;

    expect(postMessage).toHaveBeenLastCalledWith(JSON.stringify({ event: "command", func: "setVolume", args: [8] }), "https://www.youtube.com");
    player.pause();
  });

  it("rejects playback and reports a YouTube player error", async () => {
    const player = createMusicPlayer("https://www.youtube.com/watch?v=blocked");
    const onerror = vi.fn();
    player.onerror = onerror;
    const started = player.play();
    const iframe = document.querySelector<HTMLIFrameElement>('iframe[title="Trình phát nhạc YouTube"]')!;

    window.dispatchEvent(new MessageEvent("message", {
      origin: "https://www.youtube.com",
      source: iframe.contentWindow,
      data: JSON.stringify({ event: "onError", info: 101 })
    }));

    await expect(started).rejects.toThrow("YOUTUBE_PLAYER_ERROR_101");
    expect(onerror).toHaveBeenCalledOnce();
    expect(document.body.contains(iframe)).toBe(false);
  });
});
