type JsonObject = Record<string, unknown>;

export interface VocabularyImageResolver {
  resolve(word: string): Promise<string | null>;
}

const safeImageUrl = (value: unknown): string | null => {
  if (typeof value !== "string") return null;
  try {
    const url = new URL(value);
    return url.protocol === "https:" ? url.toString() : null;
  } catch {
    return null;
  }
};

const asObject = (value: unknown): JsonObject | null =>
  value && typeof value === "object" && !Array.isArray(value) ? value as JsonObject : null;

async function getJson(url: string, headers: Record<string, string> = {}): Promise<JsonObject | null> {
  try {
    const response = await fetch(url, {
      headers: { accept: "application/json", "user-agent": "E4S/1.0 (vocabulary image resolver)", ...headers },
      signal: AbortSignal.timeout(4_000)
    });
    if (!response.ok) return null;
    return asObject(await response.json());
  } catch {
    return null;
  }
}

async function wikipediaImage(word: string): Promise<string | null> {
  const summary = await getJson(`https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(word)}?redirect=true`);
  if (summary?.type !== "disambiguation") {
    const thumbnail = asObject(summary?.thumbnail);
    const thumbnailUrl = safeImageUrl(thumbnail?.source);
    if (thumbnailUrl) return thumbnailUrl;
  }

  const commons = await getJson(
    `https://commons.wikimedia.org/w/api.php?action=query&generator=search&gsrsearch=${encodeURIComponent(`${word} filetype:bitmap`)}`
      + "&gsrnamespace=6&gsrlimit=5&prop=imageinfo&iiprop=url%7Cmime&iiurlwidth=640&format=json&origin=*"
  );
  const pages = asObject(asObject(commons?.query)?.pages);
  if (!pages) return null;
  for (const value of Object.values(pages)) {
    const page = asObject(value);
    const imageInfo = Array.isArray(page?.imageinfo) ? asObject(page.imageinfo[0]) : null;
    const mime = typeof imageInfo?.mime === "string" ? imageInfo.mime : "";
    if (!/^image\/(?:jpeg|png|webp)$/i.test(mime)) continue;
    const url = safeImageUrl(imageInfo?.thumburl) ?? safeImageUrl(imageInfo?.url);
    if (url) return url;
  }
  return null;
}

async function openverseImage(word: string): Promise<string | null> {
  const result = await getJson(`https://api.openverse.org/v1/images/?q=${encodeURIComponent(word)}&page_size=5`);
  const rows = Array.isArray(result?.results) ? result.results : [];
  for (const value of rows) {
    const item = asObject(value);
    const url = safeImageUrl(item?.thumbnail) ?? safeImageUrl(item?.url);
    if (url) return url;
  }
  return null;
}

async function pexelsImage(word: string): Promise<string | null> {
  const key = process.env.PEXELS_API_KEY?.trim();
  if (!key) return null;
  const result = await getJson(`https://api.pexels.com/v1/search?query=${encodeURIComponent(word)}&per_page=5`, { authorization: key });
  const photos = Array.isArray(result?.photos) ? result.photos : [];
  for (const value of photos) {
    const source = asObject(asObject(value)?.src);
    const url = safeImageUrl(source?.medium) ?? safeImageUrl(source?.large);
    if (url) return url;
  }
  return null;
}

async function pixabayImage(word: string): Promise<string | null> {
  const key = process.env.PIXABAY_API_KEY?.trim();
  if (!key) return null;
  const result = await getJson(`https://pixabay.com/api/?key=${encodeURIComponent(key)}&q=${encodeURIComponent(word)}&image_type=photo&safesearch=true&per_page=5`);
  const hits = Array.isArray(result?.hits) ? result.hits : [];
  for (const value of hits) {
    const item = asObject(value);
    const url = safeImageUrl(item?.webformatURL) ?? safeImageUrl(item?.largeImageURL);
    if (url) return url;
  }
  return null;
}

export function createVocabularyImageResolver(
  source = process.env.VOCAB_IMAGE_SOURCE?.trim().toLowerCase() || "wikimedia"
): VocabularyImageResolver {
  return {
    async resolve(rawWord) {
      const word = rawWord.trim().slice(0, 120);
      if (!word || source === "disabled") return null;
      if (source === "pexels") return await pexelsImage(word) ?? wikipediaImage(word);
      if (source === "pixabay") return await pixabayImage(word) ?? wikipediaImage(word);
      if (source === "openverse") return await openverseImage(word) ?? wikipediaImage(word);
      return wikipediaImage(word);
    }
  };
}
