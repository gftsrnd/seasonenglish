import {
  asObject,
  candidateFromWikimediaPage,
  fetchProviderJson,
  type ProviderCandidate,
  type ProviderOptions
} from "../types.js";

const API_HOST = "commons.wikimedia.org";

export function createWikimediaProvider(options: ProviderOptions = {}): {
  search(query: string): Promise<ProviderCandidate | null>;
} {
  return {
    async search(rawQuery) {
      const query = rawQuery.trim().slice(0, 160);
      if (!query) return null;
      const url = new URL(`https://${API_HOST}/w/api.php`);
      const parameters = {
        action: "query",
        generator: "search",
        gsrsearch: `${query} filetype:bitmap`,
        gsrnamespace: "6",
        gsrlimit: "10",
        prop: "imageinfo",
        iiprop: "url|mime|extmetadata",
        iiurlwidth: "640",
        format: "json",
        origin: "*"
      };
      for (const [key, value] of Object.entries(parameters)) url.searchParams.set(key, value);
      const response = await fetchProviderJson(url, API_HOST, options);
      const pages = asObject(asObject(response?.query)?.pages);
      if (!pages) return null;
      for (const page of Object.values(pages)) {
        const candidate = candidateFromWikimediaPage("wikimedia", page);
        if (candidate) return candidate;
      }
      return null;
    }
  };
}
