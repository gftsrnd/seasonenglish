import { useEffect, useRef, useState } from "react";
import { ImageOff, LoaderCircle } from "lucide-react";
import type { ContentImageView } from "@e4s/contracts";
import "./content-image.css";

type ContentImageState =
  | { status: "idle" | "loading" }
  | { status: "available"; image: Extract<ContentImageView, { status: "available" }> }
  | { status: "unavailable" };

export function ContentImage({ term, load, required = false }: {
  term: string;
  load: () => Promise<ContentImageView>;
  required?: boolean;
}) {
  const hostRef = useRef<HTMLDivElement>(null);
  const loadRef = useRef(load);
  const startedRef = useRef(false);
  const [state, setState] = useState<ContentImageState>({ status: "idle" });
  loadRef.current = load;

  useEffect(() => {
    let live = true;
    startedRef.current = false;
    setState({ status: "idle" });
    const start = () => {
      if (startedRef.current) return;
      startedRef.current = true;
      setState({ status: "loading" });
      void loadRef.current()
        .then((image) => {
          if (!live) return;
          setState(image.status === "available" ? { status: "available", image } : { status: "unavailable" });
        })
        .catch(() => { if (live) setState({ status: "unavailable" }); });
    };
    if (typeof IntersectionObserver === "undefined") {
      start();
      return () => { live = false; };
    }
    const observer = new IntersectionObserver((entries) => {
      if (entries.some((entry) => entry.isIntersecting)) {
        start();
        observer.disconnect();
      }
    }, { rootMargin: "160px" });
    if (hostRef.current) observer.observe(hostRef.current);
    return () => { live = false; observer.disconnect(); };
  }, [term]);

  if (state.status === "unavailable" && !required) return null;
  if (state.status === "unavailable") {
    return <div className="content-image content-image--fallback" role="status"><ImageOff size={18} aria-hidden="true" /><span>Chưa có ảnh minh hoạ</span></div>;
  }
  if (state.status === "available") {
    const { image } = state;
    return <figure className="content-image content-image--available">
      <img src={image.imageUrl} alt={image.alt || term} loading="lazy" decoding="async" onError={() => setState({ status: "unavailable" })} />
      <details className="content-image__source">
        <summary>Nguồn ảnh</summary>
        <div><a href={image.attribution.sourceUrl} target="_blank" rel="noreferrer">Xem ảnh gốc</a>{image.attribution.creator ? <span>{image.attribution.creator}</span> : null}<a href={image.attribution.licenceUrl} target="_blank" rel="noreferrer">{image.attribution.licence}</a></div>
      </details>
    </figure>;
  }
  return <div ref={hostRef} className="content-image content-image--loading" role="status" aria-label={`Đang tải ảnh minh hoạ cho ${term}`}><LoaderCircle size={18} aria-hidden="true" /><span className="sr-only">Đang tải ảnh minh hoạ</span></div>;
}
