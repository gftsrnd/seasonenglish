export type MusicPlayer = {
  preload: string;
  loop: boolean;
  volume: number;
  currentTime: number;
  onplay: (() => void) | null;
  onerror: (() => void) | null;
  play: () => Promise<void>;
  pause: () => void;
};

export function createMusicPlayer(url: string): MusicPlayer {
  const embedUrl = youtubeEmbedUrl(url);
  if (embedUrl) return new YouTubeMusicPlayer(embedUrl);
  return new Audio(url) as MusicPlayer;
}

export function youtubeEmbedUrl(input: string): string | undefined {
  try {
    const url = new URL(input);
    const host = url.hostname.replace(/^www\./, "").toLowerCase();
    const videoId = host === "youtu.be" ? url.pathname.slice(1).split("/")[0] : url.searchParams.get("v") ?? (url.pathname.startsWith("/shorts/") || url.pathname.startsWith("/embed/") ? url.pathname.split("/")[2] : null);
    const playlistId = url.searchParams.get("list");
    if (host !== "youtu.be" && host !== "youtube.com" && host !== "music.youtube.com") return undefined;
    if (videoId) {
      const params = new URLSearchParams({ autoplay: "1", controls: "0", enablejsapi: "1", loop: "1", playsinline: "1" });
      if (playlistId) params.set("list", playlistId);
      else params.set("playlist", videoId);
      return `https://www.youtube.com/embed/${encodeURIComponent(videoId)}?${params.toString()}`;
    }
    if (playlistId) {
      const params = new URLSearchParams({ list: playlistId, autoplay: "1", controls: "0", enablejsapi: "1", loop: "1", playsinline: "1" });
      return `https://www.youtube.com/embed/videoseries?${params.toString()}`;
    }
  } catch {
    return undefined;
  }
  return undefined;
}

class YouTubeMusicPlayer implements MusicPlayer {
  preload = "auto";
  loop = true;
  private currentVolume = 1;
  currentTime = 0;
  onplay: (() => void) | null = null;
  onerror: (() => void) | null = null;
  private iframe: HTMLIFrameElement | null = null;
  private messageListener: ((event: MessageEvent) => void) | null = null;
  private settlePending: (() => void) | null = null;

  constructor(private readonly embedUrl: string) {}

  get volume() { return this.currentVolume; }
  set volume(value: number) {
    this.currentVolume = Math.max(0, Math.min(1, value));
    if (this.iframe) this.command("setVolume", [Math.round(this.currentVolume * 100)]);
  }

  play() {
    this.pause();
    return new Promise<void>((resolve, reject) => {
      const iframe = document.createElement("iframe");
      iframe.title = "Trình phát nhạc YouTube";
      iframe.src = this.embedUrl;
      iframe.allow = "autoplay; encrypted-media";
      iframe.tabIndex = -1;
      iframe.setAttribute("aria-hidden", "true");
      Object.assign(iframe.style, { position: "fixed", width: "1px", height: "1px", right: "0", bottom: "0", opacity: "0.01", pointerEvents: "none", border: "0" });
      let settled = false;
      const finish = (callback: () => void) => {
        if (settled) return;
        settled = true;
        this.settlePending = null;
        callback();
      };
      this.settlePending = () => finish(resolve);
      const fail = (error: Error) => {
        this.onerror?.();
        finish(() => reject(error));
        this.removeFrame();
      };
      this.messageListener = (event) => {
        if (event.origin !== "https://www.youtube.com" || event.source !== iframe.contentWindow) return;
        const message = youtubeMessage(event.data);
        if (!message) return;
        if (message.event === "onReady") {
          this.command("setVolume", [Math.round(this.currentVolume * 100)]);
          this.command("playVideo", []);
          this.onplay?.();
          finish(resolve);
        } else if (message.event === "onError") {
          fail(new Error(`YOUTUBE_PLAYER_ERROR_${String(message.info ?? "UNKNOWN")}`));
        }
      };
      window.addEventListener("message", this.messageListener);
      iframe.onload = () => iframe.contentWindow?.postMessage(JSON.stringify({ event: "listening" }), "https://www.youtube.com");
      iframe.onerror = () => fail(new Error("YOUTUBE_PLAYER_LOAD_FAILED"));
      this.iframe = iframe;
      document.body.appendChild(iframe);
    });
  }

  pause() {
    if (!this.iframe) return;
    this.command("stopVideo", []);
    this.settlePending?.();
    this.removeFrame();
  }

  private command(func: string, args: readonly unknown[]) {
    this.iframe?.contentWindow?.postMessage(JSON.stringify({ event: "command", func, args }), "https://www.youtube.com");
  }

  private removeFrame() {
    if (this.messageListener) window.removeEventListener("message", this.messageListener);
    this.messageListener = null;
    this.iframe?.remove();
    this.iframe = null;
  }
}

function youtubeMessage(data: unknown): { event?: string; info?: unknown } | undefined {
  if (typeof data === "object" && data !== null) return data as { event?: string; info?: unknown };
  if (typeof data !== "string") return undefined;
  try {
    const parsed = JSON.parse(data) as unknown;
    return typeof parsed === "object" && parsed !== null ? parsed as { event?: string; info?: unknown } : undefined;
  } catch {
    return undefined;
  }
}
