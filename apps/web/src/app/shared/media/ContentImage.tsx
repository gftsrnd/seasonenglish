import { useEffect, useRef, useState } from "react";
import { ImageOff, LoaderCircle } from "lucide-react";
import type { ContentImageView } from "@e4s/contracts";
import "./content-image.css";

type ContentImageState =
  | { status: "idle" | "loading" }
  | { status: "available"; image: Extract<ContentImageView, { status: "available" }> }
  | { status: "unavailable" };

export function ContentImage({ term, load, unavailable = "mascot" }: {
  term: string;
  load: () => Promise<ContentImageView>;
  required?: boolean;
  unavailable?: "mascot" | "hide" | "placeholder";
}) {
  const loadRef = useRef(load);
  const [state, setState] = useState<ContentImageState>({ status: "idle" });
  loadRef.current = load;

  useEffect(() => {
    let live = true;
    setState({ status: "loading" });
    void loadRef.current()
      .then((image) => {
        if (!live) return;
        setState(toImageState(image));
      })
      .catch(() => { if (live) setState({ status: "unavailable" }); });
    return () => { live = false; };
  }, [term]);

  if (state.status === "unavailable" && unavailable === "hide") {
    return <span className="content-image content-image--hidden" data-testid="hidden-content-image" aria-hidden="true" />;
  }
  if (state.status === "unavailable" && unavailable === "placeholder") {
    return <span className="game-image-placeholder" role="img" aria-label={`Chưa có ảnh minh hoạ cho ${term}`}><ImageOff size={22} strokeWidth={1.8} aria-hidden="true" /></span>;
  }
  if (state.status === "unavailable") {
    return <figure className="content-image content-image--available content-image--fallback">
      <img src="/media/mascot/season-bear.png" alt={`Minh hoạ ${term}`} />
    </figure>;
  }
  if (state.status === "available") {
    const { image } = state;
    return <figure className="content-image content-image--available">
      <img
        src={image.imageUrl}
        alt={image.alt || term}
        loading="eager"
        decoding="async"
        onLoad={(event) => { if (event.currentTarget.naturalWidth < 1) setState({ status: "unavailable" }); }}
        onError={() => setState({ status: "unavailable" })}
      />
    </figure>;
  }
  return <div className="content-image content-image--loading" role="status" aria-label={`Đang tải ảnh minh hoạ cho ${term}`}><LoaderCircle size={18} aria-hidden="true" /><span className="sr-only">Đang tải ảnh minh hoạ</span></div>;
}

function toImageState(image: ContentImageView): ContentImageState {
  if (image.status !== "available" || !isValidImageUrl(image.imageUrl)) return { status: "unavailable" };
  return {
    status: "available",
    image: { ...image, imageUrl: image.imageUrl.trim() }
  };
}

function isValidImageUrl(value: unknown): value is string {
  if (typeof value !== "string" || !value.trim()) return false;
  try {
    const parsed = new URL(value.trim(), window.location.href);
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch {
    return false;
  }
}
