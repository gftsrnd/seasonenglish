import type { CSSProperties } from "react";

export type SeasonTheme = "spring" | "summer" | "autumn" | "winter" | "tet" | "midautumn" | "christmas";
type HeroKind = "rabbit" | "cricket" | "squirrel" | "penguin" | "swallow" | "reindeer";
type HeroPose = "idle" | "run1" | "run2" | "jump";

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
const catchItems: Record<SeasonTheme, { name: string; label: string; emoji: string }> = {
  spring: { name: "bông hoa", label: "Hoa", emoji: "🌸" },
  summer: { name: "cây kem", label: "Kem", emoji: "🍦" },
  autumn: { name: "chiếc lá", label: "Lá", emoji: "🍂" },
  winter: { name: "bông tuyết", label: "Tuyết", emoji: "❄️" },
  tet: { name: "bao lì xì", label: "Lì xì", emoji: "🧧" },
  midautumn: { name: "đèn lồng", label: "Đèn lồng", emoji: "🏮" },
  christmas: { name: "hộp quà", label: "Quà", emoji: "🎁" }
};
const heroFoods: Record<HeroKind, { emoji: string; name: string }> = {
  rabbit: { emoji: "🥕", name: "củ cà rốt" }, cricket: { emoji: "🌿", name: "lá cỏ" },
  squirrel: { emoji: "🌰", name: "hạt dẻ" }, penguin: { emoji: "🐟", name: "con cá" },
  swallow: { emoji: "🐛", name: "con sâu" }, reindeer: { emoji: "🍎", name: "quả táo" }
};

const tetDates: Record<number, string> = { 2026: "2026-02-17", 2027: "2027-02-06", 2028: "2028-01-26", 2029: "2029-02-13", 2030: "2030-02-03" };
const midautumnDates: Record<number, string> = { 2026: "2026-09-25", 2027: "2027-09-15", 2028: "2028-10-03", 2029: "2029-09-22", 2030: "2030-09-12" };

export function autoSeasonTheme(date = new Date()): SeasonTheme {
  const year = date.getFullYear(); const month = date.getMonth() + 1; const day = date.getDate(); const time = date.getTime();
  const near = (iso: string | undefined, before: number, after: number) => {
    if (!iso) return false;
    const center = new Date(`${iso}T00:00:00`).getTime();
    return time >= center - before * 86_400_000 && time <= center + after * 86_400_000;
  };
  if (near(tetDates[year], 7, 10) || near(tetDates[year + 1], 7, 10)) return "tet";
  if (near(midautumnDates[year], 5, 5)) return "midautumn";
  if ((month === 12 && day >= 15) || (month === 1 && day <= 2)) return "christmas";
  if (month >= 2 && month <= 4) return "spring";
  if (month >= 5 && month <= 7) return "summer";
  if (month >= 8 && month <= 10) return "autumn";
  return "winter";
}

export function currentSeasonTheme(): SeasonTheme {
  const configured = typeof document === "undefined" ? undefined : document.documentElement.dataset.theme;
  return configured && configured in seasonHero ? configured as SeasonTheme : autoSeasonTheme();
}

export function currentSeasonVisual() {
  const theme = currentSeasonTheme(); const hero = seasonHero[theme];
  return { theme, themeName: themeNames[theme], hero, heroName: heroNames[hero], food: heroFoods[hero], catchItem: catchItems[theme] };
}

export function SeasonMark({ className }: { className?: string }) {
  const theme = currentSeasonTheme();
  const shared = { className: `season-mark ${className ?? ""}`.trim(), "data-testid": "season-mark", viewBox: "0 0 32 32", "aria-hidden": true } as const;
  if (theme === "summer") return <svg {...shared}><g stroke="var(--accent)" strokeWidth="2.6" strokeLinecap="round"><path d="M16 2.5v3.5M16 26v3.5M2.5 16H6M26 16h3.5M6.5 6.5l2.4 2.4M23.1 23.1l2.4 2.4M6.5 25.5l2.4-2.4M23.1 8.9l2.4-2.4" /></g><circle cx="16" cy="16" r="7.5" fill="var(--accent)" /></svg>;
  if (theme === "spring") return <svg {...shared}><g fill="var(--accent)"><circle cx="16" cy="7.5" r="4.6" /><circle cx="24.1" cy="13.4" r="4.6" /><circle cx="21" cy="22.9" r="4.6" /><circle cx="11" cy="22.9" r="4.6" /><circle cx="7.9" cy="13.4" r="4.6" /></g><circle cx="16" cy="16" r="3.6" fill="var(--primary)" /></svg>;
  if (theme === "autumn") return <svg {...shared}><path d="M6 26C6 13 14 6 27 6c0 13-7 21-21 20z" fill="var(--primary)" /><path d="M6 26c4-7 9-12 15-16" fill="none" stroke="var(--accent)" strokeWidth="2.2" strokeLinecap="round" /></svg>;
  if (theme === "winter") return <svg {...shared}><g fill="none" stroke="var(--accent)" strokeWidth="2.4" strokeLinecap="round"><path d="M16 3v26M4.7 9.5l22.6 13M4.7 22.5l22.6-13" /><path d="M16 3l-3 3M16 3l3 3M16 29l-3-3M16 29l3-3M4.7 9.5l4 1M4.7 9.5l1-4M27.3 22.5l-4-1M27.3 22.5l-1 4M4.7 22.5l1 4M4.7 22.5l4-1M27.3 9.5l-1-4M27.3 9.5l-4 1" /></g></svg>;
  if (theme === "tet") return <svg {...shared}><path d="M16 4.5c2.6 0 4.2 2.4 3.4 5.2 2.9-.3 4.9 1.8 4.1 4.3 2.5 1.4 2.5 4.4 0 5.8.8 2.5-1.2 4.6-4.1 4.3.8 2.8-.8 5.2-3.4 5.2s-4.2-2.4-3.4-5.2c-2.9.3-4.9-1.8-4.1-4.3-2.5-1.4-2.5-4.4 0-5.8-.8-2.5 1.2-4.6 4.1-4.3-.8-2.8.8-5.2 3.4-5.2z" fill="var(--primary)" stroke="var(--accent)" strokeWidth="1.2" /><circle cx="16" cy="16" r="3.2" fill="var(--accent)" /></svg>;
  if (theme === "midautumn") return <svg {...shared}><path d="M16 3v3" stroke="var(--accent)" strokeWidth="2.2" strokeLinecap="round" /><rect x="11" y="6" width="10" height="3" rx="1.5" fill="var(--accent)" /><path d="M8 11c0-1.7 3.6-2.5 8-2.5s8 .8 8 2.5v9c0 1.7-3.6 2.5-8 2.5s-8-.8-8-2.5z" fill="var(--primary)" /><path d="M12.5 9v13.5M19.5 9v13.5" stroke="var(--accent)" strokeWidth="1.4" opacity=".6" /><rect x="11" y="22" width="10" height="3" rx="1.5" fill="var(--accent)" /><path d="M14 25v4M18 25v4" stroke="var(--accent)" strokeWidth="1.8" strokeLinecap="round" /></svg>;
  return <svg {...shared}><path d="M16 3l3.6 7.6 8.3 1-6.1 5.7 1.6 8.2L16 21.4l-7.4 4.1 1.6-8.2-6.1-5.7 8.3-1z" fill="var(--primary)" stroke="var(--accent)" strokeWidth="1.6" strokeLinejoin="round" /></svg>;
}

export function SeasonHero({ pose = "idle", className, style }: { pose?: HeroPose; className?: string; style?: CSSProperties }) {
  const visual = currentSeasonVisual();
  return <img className={className} style={style} src={svgData(heroSvg(visual.hero, pose))} alt={`${visual.heroName} ${visual.themeName}`} />;
}

export function SeasonCatchItem({ className }: { className?: string }) {
  const visual = currentSeasonVisual();
  return <img className={className} src={svgData(catchItemSvg(visual.theme))} alt="" aria-hidden="true" />;
}

export function GiftArt({ state = "closed", className }: { state?: "closed" | "correct" | "wrong"; className?: string }) {
  return <span className={className} aria-hidden="true"><img src={svgData(state === "closed" ? giftBoxSvg : state === "correct" ? giftOpenSvg : bombSvg)} alt="" />{state === "correct" ? <img className="gift-reward" src={svgData(mushroomSvg)} alt="" /> : null}</span>;
}

function svgData(svg: string) {
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

function heroSvg(kind: HeroKind, pose: HeroPose) {
  const legs = {
    idle: ["M108 196 V236 M96 240 H120", "M148 196 V236 M136 240 H160"],
    run1: ["M108 196 L90 232 M78 238 L102 234", "M148 196 L170 228 M160 236 L186 230"],
    run2: ["M108 196 L104 234 M92 240 L118 238", "M148 196 L162 226 M152 234 L178 230"],
    jump: ["M108 196 L98 214 M86 220 L108 218", "M148 196 L158 214 M148 220 L170 218"]
  }[pose];
  const rotation = pose === "jump" ? -10 : pose === "run1" ? -4 : pose === "run2" ? 3 : 0;
  const ink = "#1E1E1E";
  const legColor: Record<HeroKind, string> = { rabbit: "#D6CCBF", cricket: "#4B6120", squirrel: "#8C3F22", penguin: "#F28C28", swallow: "#B5532B", reindeer: "#5B3F2A" };
  const eye = (x: number, y: number, radius = 5) => `<circle cx="${x}" cy="${y}" r="${radius}" fill="${ink}"/><circle cx="${x + 1.5}" cy="${y - 1.5}" r="1.6" fill="#fff"/>`;
  const smile = (x: number, y: number) => `<path d="M${x - 8} ${y} Q${x} ${y + 7} ${x + 8} ${y}" fill="none" stroke="${ink}" stroke-width="3" stroke-linecap="round"/>`;
  const bodies: Record<HeroKind, string> = {
    rabbit: `<ellipse cx="88" cy="150" rx="16" ry="14" fill="#fff"/><ellipse cx="128" cy="152" rx="50" ry="44" fill="#EDE9E3"/><ellipse cx="128" cy="166" rx="26" ry="22" fill="#fff"/><ellipse cx="112" cy="38" rx="12" ry="34" fill="#EDE9E3"/><ellipse cx="112" cy="40" rx="6" ry="24" fill="#F6D3CB"/><ellipse cx="146" cy="40" rx="12" ry="34" transform="rotate(14 146 40)" fill="#EDE9E3"/><ellipse cx="146" cy="42" rx="6" ry="24" transform="rotate(14 146 42)" fill="#F6D3CB"/><circle cx="128" cy="96" r="40" fill="#EDE9E3"/>${eye(142, 90)}${eye(118, 90, 4)}<ellipse cx="146" cy="106" rx="5" ry="3.5" fill="#E58BA6"/>${smile(146, 112)}`,
    cricket: `<path d="M74 108 C60 80 48 72 40 60" fill="none" stroke="#4B6120" stroke-width="4" stroke-linecap="round"/><path d="M96 92 C80 70 70 56 56 44" fill="none" stroke="#4B6120" stroke-width="4" stroke-linecap="round"/><circle cx="40" cy="58" r="5" fill="#4B6120"/><circle cx="56" cy="42" r="5" fill="#4B6120"/><ellipse cx="124" cy="156" rx="54" ry="40" fill="#8BA33A"/><path d="M80 150 C96 128 138 128 160 150" fill="none" stroke="#4B6120" stroke-width="4"/><path d="M90 160 C104 142 134 142 154 160" fill="none" stroke="#4B6120" stroke-width="3"/><circle cx="138" cy="104" r="36" fill="#9CCB5A"/>${eye(156, 98, 7)}${smile(154, 118)}`,
    squirrel: `<path d="M76 190 C30 190 26 110 70 96 C108 84 110 150 80 150 C60 150 60 180 76 190 Z" fill="#B5532B"/><path d="M58 150 C50 120 72 104 86 112" fill="none" stroke="#D77A4B" stroke-width="5" stroke-linecap="round"/><ellipse cx="132" cy="154" rx="46" ry="42" fill="#B5532B"/><ellipse cx="134" cy="164" rx="24" ry="24" fill="#F3D9C1"/><path d="M104 68 L112 40 L126 64 Z M158 64 L170 40 L178 68 Z" fill="#B5532B"/><circle cx="140" cy="96" r="38" fill="#B5532B"/>${eye(154, 90)}${eye(128, 90, 4)}<ellipse cx="158" cy="106" rx="5" ry="3.5" fill="${ink}"/>${smile(158, 112)}`,
    penguin: `<ellipse cx="128" cy="150" rx="52" ry="50" fill="${ink}"/><ellipse cx="130" cy="158" rx="34" ry="38" fill="#fff"/><path d="M78 126 C58 146 60 176 74 190 C90 178 92 146 78 126 Z" fill="${ink}"/><path d="M178 126 C198 146 196 176 182 190 C166 178 164 146 178 126 Z" fill="${ink}"/><circle cx="128" cy="96" r="40" fill="${ink}"/><ellipse cx="136" cy="100" rx="24" ry="20" fill="#fff"/>${eye(146, 92)}${eye(126, 92, 4)}<path d="M150 104 L172 110 L150 116 Z" fill="#F28C28"/>`,
    swallow: `<path d="M60 150 L24 126 L54 166 L18 196 Z" fill="#2C3E6B"/><ellipse cx="128" cy="152" rx="52" ry="40" fill="#2C3E6B"/><ellipse cx="136" cy="164" rx="30" ry="24" fill="#fff"/><path d="M96 128 C76 108 116 92 150 118 C136 124 116 134 96 128 Z" fill="#1E2C4F"/><circle cx="140" cy="98" r="36" fill="#2C3E6B"/><ellipse cx="146" cy="116" rx="18" ry="9" fill="#C8102E"/>${eye(154, 92)}<path d="M172 100 L196 106 L172 112 Z" fill="#F2C14E"/>`,
    reindeer: `<path d="M106 62 L98 30 M98 46 L84 40 M98 36 L110 24 M150 62 L158 30 M158 46 L172 40 M158 36 L146 24" fill="none" stroke="#5B3F2A" stroke-width="6" stroke-linecap="round"/><ellipse cx="128" cy="154" rx="50" ry="42" fill="#7A5A3A"/><ellipse cx="130" cy="168" rx="24" ry="20" fill="#D6B894"/><path d="M96 86 L88 70 L108 78 Z M160 86 L168 70 L148 78 Z" fill="#7A5A3A"/><circle cx="128" cy="98" r="38" fill="#7A5A3A"/><ellipse cx="146" cy="110" rx="18" ry="13" fill="#D6B894"/>${eye(144, 92)}${eye(120, 92, 4)}<circle cx="160" cy="112" r="8" fill="#C62828"/><path d="M80 110 C68 102 70 86 84 84 M176 110 C188 102 186 86 172 84" fill="none" stroke="#7A5A3A" stroke-width="5" stroke-linecap="round"/>`
  };
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256"><g fill="none" stroke="${legColor[kind]}" stroke-width="11" stroke-linecap="round">${legs.map((path) => `<path d="${path}"/>`).join("")}</g><g transform="rotate(${rotation} 128 150)">${bodies[kind]}</g></svg>`;
}

function catchItemSvg(theme: SeasonTheme) {
  const art: Record<SeasonTheme, string> = {
    autumn: `<g transform="translate(50 46) rotate(29)"><ellipse cx="0" cy="0" rx="20" ry="32" fill="#E9963E"/><g fill="none" stroke="#B5532B" stroke-width="2.5" stroke-linecap="round"><path d="M0 -30V34M0 -8L12 -18M0 8L-12 -2M0 20L10 10M0 32L4 44"/></g></g>`,
    spring: `<g transform="translate(50 50)" fill="#E58BA6">${Array.from({ length: 5 }, (_, index) => { const angle = index * Math.PI * 2 / 5; return `<ellipse cx="${Math.cos(angle) * 17}" cy="${Math.sin(angle) * 17}" rx="13" ry="10" transform="rotate(${angle * 180 / Math.PI})"/>`; }).join("")}<circle cx="0" cy="0" r="10" fill="#FBB829"/></g>`,
    summer: `<g transform="translate(50 48)"><path d="M-18 0H18L0 40Z" fill="#E9B46A" stroke="#B5532B" stroke-width="1.5"/><circle cx="-8" cy="-12" r="15" fill="#F6D3CB"/><circle cx="10" cy="-10" r="14" fill="#FFF4D9"/><circle cx="2" cy="-28" r="5" fill="#C62828"/></g>`,
    winter: `<g transform="translate(50 50)" fill="none" stroke="#6FA8DC" stroke-width="3.5" stroke-linecap="round">${Array.from({ length: 6 }, (_, index) => { const angle = index * Math.PI / 3; return `<path d="M0 0L${Math.cos(angle) * 28} ${Math.sin(angle) * 28}"/>`; }).join("")}</g>`,
    tet: `<g transform="translate(50 50)"><rect x="-18" y="-30" width="36" height="60" rx="6" fill="#C8102E"/><rect x="-18" y="-8" width="36" height="6" fill="#F2C14E"/><circle cx="0" cy="8" r="9" fill="#F2C14E"/><text x="0" y="12" text-anchor="middle" font-size="11" font-family="sans-serif" font-weight="700" fill="#C8102E">福</text></g>`,
    midautumn: `<g transform="translate(50 50)"><rect x="-10" y="-34" width="20" height="6" fill="#B23A48"/><ellipse cx="0" cy="0" rx="22" ry="30" fill="#F4A261" stroke="#B23A48" stroke-width="1.5"/><rect x="-10" y="28" width="20" height="6" fill="#B23A48"/><path d="M-4 34V44M4 34V44" stroke="#B23A48" stroke-width="1.8"/></g>`,
    christmas: `<g transform="translate(50 50)"><rect x="-22" y="-14" width="44" height="42" rx="5" fill="#1F6B44"/><rect x="-25" y="-22" width="50" height="12" rx="4" fill="#2E7D4F"/><path d="M-4 -22H4V28H-4Z" fill="#C62828"/><ellipse cx="-9" cy="-28" rx="8" ry="5" transform="rotate(-29 -9 -28)" fill="#C62828"/><ellipse cx="9" cy="-28" rx="8" ry="5" transform="rotate(29 9 -28)" fill="#C62828"/></g>`
  };
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">${art[theme]}</svg>`;
}

const giftBoxSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256"><rect x="40" y="112" width="176" height="120" rx="16" fill="#FBB829" stroke="#1E1E1E" stroke-width="8"/><rect x="110" y="112" width="36" height="120" fill="#F6D3CB" stroke="#1E1E1E" stroke-width="7"/><circle cx="128" cy="178" r="36" fill="#fff" stroke="#1E1E1E" stroke-width="7"/><path d="M114 168C114 152 142 152 142 168C142 178 128 179 128 190" fill="none" stroke="#1E1E1E" stroke-width="9" stroke-linecap="round"/><circle cx="128" cy="204" r="5.5" fill="#1E1E1E"/><path d="M128 78C108 42 68 42 70 64C71 82 104 84 128 78ZM128 78C148 42 188 42 186 64C185 82 152 84 128 78Z" fill="#F6D3CB" stroke="#1E1E1E" stroke-width="7"/><rect x="28" y="78" width="200" height="44" rx="14" fill="#FBB829" stroke="#1E1E1E" stroke-width="8"/><rect x="110" y="78" width="36" height="44" fill="#F6D3CB" stroke="#1E1E1E" stroke-width="7"/></svg>`;
const giftOpenSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256"><rect x="40" y="132" width="176" height="104" rx="16" fill="#FBB829" stroke="#1E1E1E" stroke-width="8"/><rect x="54" y="132" width="148" height="18" rx="6" fill="#1E1E1E"/><rect x="110" y="150" width="36" height="86" fill="#F6D3CB" stroke="#1E1E1E" stroke-width="7"/><g transform="translate(10 -6) rotate(-16 128 100)"><rect x="28" y="78" width="200" height="44" rx="14" fill="#FBB829" stroke="#1E1E1E" stroke-width="8"/><rect x="110" y="78" width="36" height="44" fill="#F6D3CB" stroke="#1E1E1E" stroke-width="7"/></g></svg>`;
const mushroomSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256"><path d="M88 150C86 180 80 196 84 214C88 234 168 234 172 214C176 196 170 180 168 150Z" fill="#fff" stroke="#1E1E1E" stroke-width="8"/><path d="M32 136C32 72 78 34 128 34S224 72 224 136C224 154 198 160 128 160S32 154 32 136Z" fill="#A8BF55" stroke="#1E1E1E" stroke-width="8"/><circle cx="84" cy="88" r="22" fill="#FBB829"/><circle cx="158" cy="70" r="16" fill="#FBB829"/><circle cx="196" cy="126" r="20" fill="#FBB829"/></svg>`;
const bombSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256"><path d="M180 92C188 70 206 74 206 50" fill="none" stroke="#FBB829" stroke-width="13" stroke-linecap="round"/><rect x="150" y="80" width="48" height="30" rx="7" transform="rotate(45 174 95)" fill="#77736C" stroke="#1E1E1E" stroke-width="8"/><circle cx="118" cy="156" r="78" fill="#1E1E1E"/><path d="M66 140C70 112 92 96 120 94" fill="none" stroke="#7A7064" stroke-width="11" stroke-linecap="round"/></svg>`;
