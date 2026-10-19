import { describe, expect, it, vi } from "vitest";
import { createOpenverseProvider } from "./openverse.js";
import { createWikimediaProvider } from "./wikimedia.js";
import { createWikipediaProvider } from "./wikipedia.js";

describe("exact Wikipedia media", () => {
  it("accepts only an exact non-disambiguation page with attributed bitmap metadata", async () => {
    const fetchImpl = vi.fn()
      .mockResolvedValueOnce(jsonResponse({
        query: { pages: { 12: {
          pageid: 12,
          title: "Notebook",
          pageimage: "Paper_notebook.jpg",
          thumbnail: { source: "https://upload.wikimedia.org/notebook-thumb.jpg" }
        } } }
      }))
      .mockResolvedValueOnce(jsonResponse({
        query: { pages: { 55: {
          pageid: 55,
          title: "File:Paper notebook.jpg",
          imageinfo: [{
            mime: "image/jpeg",
            thumburl: "https://upload.wikimedia.org/notebook-640.jpg",
            descriptionurl: "https://commons.wikimedia.org/wiki/File:Paper_notebook.jpg",
            extmetadata: {
              Artist: { value: "Example Photographer" },
              LicenseShortName: { value: "CC BY-SA 4.0" },
              LicenseUrl: { value: "https://creativecommons.org/licenses/by-sa/4.0/" }
            }
          }]
        } } }
      }));

    await expect(createWikipediaProvider({ fetchImpl }).exact(" notebook ")).resolves.toEqual({
      provider: "wikipedia",
      providerAssetId: "File:Paper notebook.jpg",
      downloadUrl: "https://upload.wikimedia.org/notebook-640.jpg",
      sourcePageUrl: "https://commons.wikimedia.org/wiki/File:Paper_notebook.jpg",
      creator: "Example Photographer",
      licence: "CC BY-SA",
      licenceUrl: "https://creativecommons.org/licenses/by-sa/4.0/"
    });
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    const pageQuery = new URL(String(fetchImpl.mock.calls[0]?.[0]));
    expect(pageQuery.hostname).toBe("en.wikipedia.org");
    expect(pageQuery.searchParams.get("titles")).toBe("notebook");
    expect(pageQuery.searchParams.get("prop")).toContain("pageimages");
  });

  it.each([
    ["a different page title", { pageid: 1, title: "Notebook computer", pageimage: "Laptop.jpg", thumbnail: { source: "https://upload.wikimedia.org/laptop.jpg" } }],
    ["a disambiguation page", { pageid: 2, title: "Notebook", pageprops: { disambiguation: "" }, pageimage: "Notebook.jpg", thumbnail: { source: "https://upload.wikimedia.org/notebook.jpg" } }],
    ["a page without a thumbnail", { pageid: 3, title: "Notebook", pageimage: "Notebook.jpg" }]
  ])("rejects %s", async (_label, page) => {
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse({ query: { pages: { 1: page } } }));

    await expect(createWikipediaProvider({ fetchImpl }).exact("notebook")).resolves.toBeNull();
    expect(fetchImpl).toHaveBeenCalledOnce();
  });

  it("rejects the image when attribution metadata is incomplete", async () => {
    const fetchImpl = vi.fn()
      .mockResolvedValueOnce(jsonResponse({ query: { pages: { 1: {
        pageid: 1, title: "Notebook", pageimage: "Notebook.jpg",
        thumbnail: { source: "https://upload.wikimedia.org/notebook.jpg" }
      } } } }))
      .mockResolvedValueOnce(jsonResponse({ query: { pages: { 2: {
        pageid: 2, title: "File:Notebook.jpg",
        imageinfo: [{ mime: "image/jpeg", url: "https://upload.wikimedia.org/notebook.jpg", extmetadata: {} }]
      } } } }));

    await expect(createWikipediaProvider({ fetchImpl }).exact("notebook")).resolves.toBeNull();
  });
});

describe("Wikimedia Commons search", () => {
  it("skips non-bitmap, sensitive, and unlicensed rows before returning attributed media", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse({
      query: { pages: {
        1: imagePage(1, "File:Notebook.svg", "image/svg+xml", "CC0", false),
        2: imagePage(2, "File:Nude notebook campaign.jpg", "image/jpeg", "CC BY 4.0", false),
        3: imagePage(3, "File:Unlicensed notebook.jpg", "image/jpeg", "", false),
        4: imagePage(4, "File:Paper notebook.jpg", "image/jpeg", "CC BY 4.0", false)
      } }
    }));

    await expect(createWikimediaProvider({ fetchImpl }).search("paper notebook on desk")).resolves.toMatchObject({
      provider: "wikimedia",
      providerAssetId: "File:Paper notebook.jpg",
      licence: "CC BY",
      creator: "Fixture creator"
    });
    const searchUrl = new URL(String(fetchImpl.mock.calls[0]?.[0]));
    expect(searchUrl.hostname).toBe("commons.wikimedia.org");
    expect(searchUrl.searchParams.get("gsrsearch")).toBe("paper notebook on desk filetype:bitmap");
    expect(searchUrl.searchParams.get("gsrnamespace")).toBe("6");
  });

  it("returns null when source, licence, or creator metadata cannot establish attribution", async () => {
    const page = imagePage(9, "File:Notebook.jpg", "image/jpeg", "CC BY 4.0", false);
    page.imageinfo[0]!.descriptionurl = "";
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse({ query: { pages: { 9: page } } }));

    await expect(createWikimediaProvider({ fetchImpl }).search("notebook")).resolves.toBeNull();
  });
});

describe("Openverse search", () => {
  it("returns a non-mature bitmap with complete open-licence metadata", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse({ results: [{
      id: "openverse-1",
      url: "https://live.staticflickr.com/notebook.jpg",
      thumbnail: "https://api.openverse.org/v1/images/openverse-1/thumb/",
      foreign_landing_url: "https://www.flickr.com/photos/example/1",
      creator: "Example Creator",
      license: "by",
      license_version: "4.0",
      license_url: "https://creativecommons.org/licenses/by/4.0/",
      mature: false,
      filetype: "jpg"
    }] }));

    await expect(createOpenverseProvider({ fetchImpl }).search("paper notebook")).resolves.toMatchObject({
      provider: "openverse",
      providerAssetId: "openverse-1",
      licence: "CC BY",
      creator: "Example Creator"
    });
  });

  it("returns null for mature or incomplete results", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse({ results: [{
      id: "unsafe",
      url: "https://images.example/unsafe.jpg",
      mature: true,
      license: "by"
    }] }));

    await expect(createOpenverseProvider({ fetchImpl }).search("notebook")).resolves.toBeNull();
  });

  it("returns null within the configured budget when Openverse times out", async () => {
    const fetchImpl = vi.fn((_url: string | URL | Request, init?: RequestInit) => new Promise<Response>((_resolve, reject) => {
      init?.signal?.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError")), { once: true });
    }));
    const startedAt = Date.now();

    await expect(createOpenverseProvider({ fetchImpl, timeoutMs: 5 }).search("notebook")).resolves.toBeNull();
    expect(Date.now() - startedAt).toBeLessThan(100);
  });
});

function jsonResponse(value: unknown): Response {
  return new Response(JSON.stringify(value), { status: 200, headers: { "content-type": "application/json" } });
}

function imagePage(id: number, title: string, mime: string, licence: string, mature: boolean) {
  return {
    pageid: id,
    title,
    imageinfo: [{
      mime,
      thumburl: `https://upload.wikimedia.org/${id}.jpg`,
      descriptionurl: `https://commons.wikimedia.org/wiki/${encodeURIComponent(title)}`,
      extmetadata: {
        Artist: { value: "Fixture creator" },
        LicenseShortName: { value: licence },
        LicenseUrl: { value: "https://creativecommons.org/licenses/by/4.0/" },
        Categories: { value: mature ? "Nude people" : "Office supplies" }
      }
    }]
  };
}
