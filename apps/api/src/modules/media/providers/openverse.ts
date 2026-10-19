import { normalizeLicence } from "../safety.js";
import {
  asArray,
  asObject,
  fetchProviderJson,
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
      const response = await fetchProviderJson(url, API_HOST, { ...options, timeoutMs: options.timeoutMs ?? 800 });
      for (const value of asArray(response?.results)) {
        const item = asObject(value);
        if (!item || item.mature === true) continue;
        const filetype = stringValue(item.filetype)?.toLowerCase();
        if (!filetype || !["jpg", "jpeg", "png", "webp"].includes(filetype)) continue;
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
          licenceUrl
        };
      }
      return null;
    }
  };
}
