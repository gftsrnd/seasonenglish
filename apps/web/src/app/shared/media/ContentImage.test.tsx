// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ContentImageView } from "@e4s/contracts";
import { ContentImage } from "./ContentImage.js";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const available: ContentImageView = {
  status: "available",
  imageUrl: "https://storage.example/notebook.jpg",
  alt: "notebook",
  attribution: {
    creator: "Open artist",
    licence: "CC BY 4.0",
    licenceUrl: "https://creativecommons.org/licenses/by/4.0/",
    sourceUrl: "https://commons.wikimedia.org/wiki/File:Notebook.jpg"
  }
};

describe("ContentImage", () => {
  it("loads only after entering the viewport", async () => {
    let enter: ((entries: IntersectionObserverEntry[]) => void) | undefined;
    vi.stubGlobal("IntersectionObserver", class {
      constructor(callback: (entries: IntersectionObserverEntry[]) => void) { enter = callback; }
      observe() {}
      disconnect() {}
      unobserve() {}
      takeRecords() { return []; }
      root = null;
      rootMargin = "0px";
      thresholds = [0];
    });
    const load = vi.fn().mockResolvedValue(available);
    render(<ContentImage term="notebook" load={load} />);
    expect(load).not.toHaveBeenCalled();
    enter?.([{ isIntersecting: true } as IntersectionObserverEntry]);
    expect(await screen.findByRole("img", { name: "notebook" })).toHaveAttribute("src", available.imageUrl);
  });

  it("shows attributed media and safe source links", async () => {
    vi.stubGlobal("IntersectionObserver", undefined);
    render(<ContentImage term="notebook" load={() => Promise.resolve(available)} />);
    expect(await screen.findByRole("img", { name: "notebook" })).toBeInTheDocument();
    fireEvent.click(screen.getByText("Nguồn ảnh"));
    expect(screen.getByRole("link", { name: "Xem ảnh gốc" })).toHaveAttribute("href", available.attribution.sourceUrl);
    expect(screen.getByRole("link", { name: "CC BY 4.0" })).toHaveAttribute("href", available.attribution.licenceUrl);
    expect(screen.getByText("Open artist")).toBeInTheDocument();
  });

  it("collapses optional unavailable media", async () => {
    vi.stubGlobal("IntersectionObserver", undefined);
    const { container } = render(<ContentImage term="reliable" load={() => Promise.resolve({ status: "unavailable" })} />);
    await waitFor(() => expect(container).toBeEmptyDOMElement());
  });

  it.each([
    ["unavailable", () => Promise.resolve({ status: "unavailable" } as ContentImageView)],
    ["rejected", () => Promise.reject(new Error("offline"))]
  ])("shows a compact required fallback when loading is %s", async (_label, load) => {
    vi.stubGlobal("IntersectionObserver", undefined);
    render(<ContentImage term="reliable" required load={load} />);
    expect(await screen.findByText("Chưa có ảnh minh hoạ")).toBeInTheDocument();
  });

  it("falls back safely when the downloaded image cannot render", async () => {
    vi.stubGlobal("IntersectionObserver", undefined);
    render(<ContentImage term="notebook" required load={() => Promise.resolve(available)} />);
    fireEvent.error(await screen.findByRole("img", { name: "notebook" }));
    expect(await screen.findByText("Chưa có ảnh minh hoạ")).toBeInTheDocument();
  });
});
