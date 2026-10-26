import { normalizeLicence } from "../safety.js";
import {
  asArray,
  asObject,
  fetchProviderJson,
  looksLikeVisualArtifact,
  safeHttpsUrl,
  stringValue,
  type ProviderCandidate,
  type ProviderOptions
} from "../types.js";

const API_HOST = "api.openverse.org";

export function createOpenverseProvider(options: ProviderOptions = {}): {
  search(query: string): Promise<ProviderCandidate | null>;
} {
  return {
    async search(rawQuery) {
      const query = rawQuery.trim().slice(0, 160);
      if (!query) return null;
      const url = new URL(`https://${API_HOST}/v1/images/`);
      url.searchParams.set("q", query);
      url.searchParams.set("page_size", "10");
      url.searchParams.set("mature", "false");
      const response = await fetchProviderJson(url, API_HOST, { ...options, timeoutMs: options.timeoutMs ?? 5_000 });
      for (const value of asArray(response?.results)) {
        const item = asObject(value);
        const semanticText = item ? stringValue(item.title) : null;
        if (!item || !semanticText || item.mature === true || looksLikeVisualArtifact(semanticText)) continue;
        // Openverse currently returns real bitmap thumbnails with `filetype` and
        // `format` empty for a number of sources. The download safety layer still
        // verifies the response bytes and MIME type, so an omitted hint must not
        // discard an otherwise fully attributed candidate.
        const filetype = stringValue(item.filetype)?.toLowerCase() ?? stringValue(item.format)?.toLowerCase();
        if (filetype && !["jpg", "jpeg", "png", "webp"].includes(filetype)) continue;
        const id = stringValue(item.id);
        const downloadUrl = safeHttpsUrl(item.thumbnail, new Set([API_HOST]));
        const sourcePageUrl = safeHttpsUrl(item.foreign_landing_url);
        const licenceName = stringValue(item.license);
        const licenceVersion = stringValue(item.license_version);
        const licence = normalizeLicence(licenceName ? `CC ${licenceName}${licenceVersion ? ` ${licenceVersion}` : ""}` : "");
        const licenceUrl = safeHttpsUrl(item.license_url, new Set(["creativecommons.org"]));
        if (!id || !downloadUrl || !sourcePageUrl || !licence || !licenceUrl) continue;
        return {
          provider: "openverse",
          providerAssetId: id,
          downloadUrl,
          sourcePageUrl,
          creator: stringValue(item.creator),
          licence,
          licenceUrl,
          semanticText
        };
      }
      return null;
    }
  };
}
