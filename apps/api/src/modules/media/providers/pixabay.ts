import {
  asArray,
  asObject,
  fetchProviderJson,
  looksLikeVisualArtifact,
  photoSearchQuery,
  safeHttpsUrl,
  stringValue,
  type ProviderCandidate,
  type ProviderOptions
} from "../types.js";

const API_HOST = "pixabay.com";
const IMAGE_HOST = "cdn.pixabay.com";
const LICENCE_URL = "https://pixabay.com/service/license-summary/";

export function createPixabayProvider(options: ProviderOptions & { apiKey?: string } = {}): {
  search(query: string): Promise<ProviderCandidate | null>;
} {
  const apiKey = options.apiKey?.trim() ?? "";
  return {
    async search(rawQuery) {
      const query = photoSearchQuery(rawQuery);
      if (!apiKey || !query) return null;
      const url = new URL(`https://${API_HOST}/api/`);
      url.searchParams.set("key", apiKey);
      url.searchParams.set("q", query);
      url.searchParams.set("image_type", "photo");
      url.searchParams.set("safesearch", "true");
      url.searchParams.set("orientation", "horizontal");
      url.searchParams.set("per_page", "20");
      const response = await fetchProviderJson(url, API_HOST, { ...options, timeoutMs: options.timeoutMs ?? 5_000 });
      for (const value of asArray(response?.hits)) {
        const item = asObject(value);
        const semanticText = item ? stringValue(item.tags) : null;
        if (!item || !semanticText || looksLikeVisualArtifact(semanticText)) continue;
        const id = typeof item.id === "number" || typeof item.id === "string" ? String(item.id) : "";
        const downloadUrl = safeHttpsUrl(item.previewURL, new Set([IMAGE_HOST]));
        const sourcePageUrl = safeHttpsUrl(item.pageURL, new Set([API_HOST, `www.${API_HOST}`]));
        if (!id || !downloadUrl || !sourcePageUrl) continue;
        return {
          provider: "pixabay",
          providerAssetId: id,
          downloadUrl,
          sourcePageUrl,
          creator: stringValue(item.user),
          licence: "Pixabay Content License",
          licenceUrl: LICENCE_URL,
          semanticText
        };
      }
      return null;
    }
  };
}
