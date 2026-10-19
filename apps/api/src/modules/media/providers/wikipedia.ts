import {
  asObject,
  candidateFromWikimediaPage,
  fetchProviderJson,
  safeHttpsUrl,
  stringValue,
  type ProviderCandidate,
  type ProviderOptions
} from "../types.js";

const API_HOST = "en.wikipedia.org";

export function createWikipediaProvider(options: ProviderOptions = {}): {
  exact(term: string): Promise<ProviderCandidate | null>;
} {
  return {
    async exact(rawTerm) {
      const term = rawTerm.trim().slice(0, 120);
      if (!term) return null;
      const pageUrl = mediaWikiUrl(API_HOST, {
        action: "query",
        prop: "pageimages|pageprops",
        titles: term,
        redirects: "1",
        piprop: "name|thumbnail",
        pithumbsize: "640"
      });
      const pageResponse = await fetchProviderJson(pageUrl, API_HOST, options);
      const page = firstPage(pageResponse);
      const title = stringValue(page?.title);
      const pageProps = asObject(page?.pageprops);
      const pageImage = stringValue(page?.pageimage);
      const thumbnail = safeHttpsUrl(asObject(page?.thumbnail)?.source, new Set(["upload.wikimedia.org"]));
      if (!page || !title || normalizeTitle(title) !== normalizeTitle(term)
        || Boolean(pageProps && Object.hasOwn(pageProps, "disambiguation"))
        || !pageImage || !thumbnail) return null;

      const fileTitle = pageImage.toLowerCase().startsWith("file:") ? pageImage : `File:${pageImage}`;
      const imageUrl = mediaWikiUrl(API_HOST, {
        action: "query",
        prop: "imageinfo",
        titles: fileTitle,
        iiprop: "url|mime|extmetadata",
        iiurlwidth: "640"
      });
      return candidateFromWikimediaPage("wikipedia", firstPage(await fetchProviderJson(imageUrl, API_HOST, options)));
    }
  };
}

function mediaWikiUrl(hostname: string, parameters: Record<string, string>): URL {
  const url = new URL(`https://${hostname}/w/api.php`);
  for (const [key, value] of Object.entries({ ...parameters, format: "json", origin: "*" })) url.searchParams.set(key, value);
  return url;
}

function firstPage(response: Record<string, unknown> | null): Record<string, unknown> | null {
  const pages = asObject(asObject(response?.query)?.pages);
  return pages ? asObject(Object.values(pages)[0]) : null;
}

function normalizeTitle(value: string): string {
  return value.normalize("NFKC").replace(/_/g, " ").trim().replace(/\s+/g, " ").toLocaleLowerCase("en-US");
}
