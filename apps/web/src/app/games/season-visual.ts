export type SeasonTheme = "spring" | "summer" | "autumn" | "winter" | "tet" | "midautumn" | "christmas";
export type HeroKind = "rabbit" | "cricket" | "squirrel" | "penguin" | "swallow" | "reindeer";
type HeroArtId = `hero-${HeroKind}`;
type FoodArtId = `food-${HeroKind}`;
type CatchArtId = `catch-${SeasonTheme}`;

const seasonHero: Record<SeasonTheme, HeroKind> = {
  spring: "rabbit", summer: "cricket", autumn: "squirrel", winter: "penguin",
  tet: "swallow", midautumn: "rabbit", christmas: "reindeer"
};
const heroNames: Record<HeroKind, string> = {
  rabbit: "Thỏ", cricket: "Dế", squirrel: "Sóc", penguin: "Cánh cụt", swallow: "Én", reindeer: "Tuần lộc"
};
const themeNames: Record<SeasonTheme, string> = {
  spring: "mùa xuân", summer: "mùa hạ", autumn: "mùa thu", winter: "mùa đông",
  tet: "Tết", midautumn: "Trung thu", christmas: "Giáng sinh"
};
const catchItems: Record<SeasonTheme, { name: string; label: string }> = {
  spring: { name: "bông hoa", label: "Hoa" },
  summer: { name: "cây kem", label: "Kem" },
  autumn: { name: "chiếc lá", label: "Lá" },
  winter: { name: "bông tuyết", label: "Tuyết" },
  tet: { name: "bao lì xì", label: "Lì xì" },
  midautumn: { name: "đèn lồng", label: "Đèn lồng" },
  christmas: { name: "hộp quà", label: "Quà" }
};
const heroFoods: Record<HeroKind, { name: string }> = {
  rabbit: { name: "củ cà rốt" }, cricket: { name: "lá cỏ" }, squirrel: { name: "hạt dẻ" },
  penguin: { name: "con cá" }, swallow: { name: "con sâu" }, reindeer: { name: "quả táo" }
};

const tetDates: Record<number, string> = { 2026: "2026-02-17", 2027: "2027-02-06", 2028: "2028-01-26", 2029: "2029-02-13", 2030: "2030-02-03" };
const midautumnDates: Record<number, string> = { 2026: "2026-09-25", 2027: "2027-09-15", 2028: "2028-10-03", 2029: "2029-09-22", 2030: "2030-09-12" };

export function autoSeasonTheme(date = new Date()): SeasonTheme {
  const year = date.getFullYear();
  const month = date.getMonth() + 1;
  const day = date.getDate();
  const localDay = Date.UTC(year, month - 1, day);
  const near = (iso: string | undefined, before: number, after: number) => {
    if (!iso) return false;
    const [isoYear, isoMonth, isoDay] = iso.split("-").map(Number);
    const center = Date.UTC(isoYear!, isoMonth! - 1, isoDay!);
    return localDay >= center - before * 86_400_000 && localDay <= center + after * 86_400_000;
  };
  if (near(tetDates[year], 7, 10) || near(tetDates[year + 1], 7, 10)) return "tet";
  if (near(midautumnDates[year], 5, 5)) return "midautumn";
  if ((month === 12 && day >= 15) || (month === 1 && day <= 2)) return "christmas";
  if (month >= 2 && month <= 4) return "spring";
  if (month >= 5 && month <= 7) return "summer";
  if (month >= 8 && month <= 10) return "autumn";
  return "winter";
}

export const resolveAutomaticTheme = autoSeasonTheme;

export function currentSeasonTheme(): SeasonTheme {
  const configured = typeof document === "undefined" ? undefined : document.documentElement.dataset.theme;
  return configured && configured in seasonHero ? configured as SeasonTheme : autoSeasonTheme();
}

export function seasonVisual(theme: SeasonTheme) {
  const hero = seasonHero[theme];
  return {
    theme,
    themeName: themeNames[theme],
    hero,
    heroName: heroNames[hero],
    heroArt: `hero-${hero}` as HeroArtId,
    food: { ...heroFoods[hero], art: `food-${hero}` as FoodArtId },
    catchItem: { ...catchItems[theme], art: `catch-${theme}` as CatchArtId }
  };
}

export function currentSeasonVisual() {
  return seasonVisual(currentSeasonTheme());
}
