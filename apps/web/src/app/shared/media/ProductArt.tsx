import type { HeroKind, SeasonTheme } from "../../games/season-visual.js";
import "./product-art.css";

export type ProductArtId =
  | "mascot"
  | "basket"
  | "dinosaur"
  | "gift-closed"
  | "gift-correct"
  | "gift-wrong"
  | "flag"
  | "mushroom"
  | "bomb"
  | `hero-${HeroKind}`
  | `food-${HeroKind}`
  | `catch-${SeasonTheme}`;

type ProductArtProps =
  | { id: ProductArtId; className?: string; decorative: true; alt?: never }
  | { id: ProductArtId; className?: string; decorative?: false; alt: string };

export const PRODUCT_ART_PATHS = {
  mascot: "/media/mascot/season-bear.png",
  basket: "/media/games/basket.png",
  dinosaur: "/media/games/dinosaur.png",
  "gift-closed": "/media/games/gift-closed.png",
  "gift-correct": "/media/games/gift-correct.png",
  "gift-wrong": "/media/games/gift-wrong.png",
  flag: "/media/games/flag.png",
  mushroom: "/media/games/mushroom.png",
  bomb: "/media/games/bomb.png",
  "hero-rabbit": "/media/seasons/hero-rabbit.png",
  "hero-cricket": "/media/seasons/hero-cricket.png",
  "hero-squirrel": "/media/seasons/hero-squirrel.png",
  "hero-penguin": "/media/seasons/hero-penguin.png",
  "hero-swallow": "/media/seasons/hero-swallow.png",
  "hero-reindeer": "/media/seasons/hero-reindeer.png",
  "food-rabbit": "/media/seasons/food-rabbit.png",
  "food-cricket": "/media/seasons/food-cricket.png",
  "food-squirrel": "/media/seasons/food-squirrel.png",
  "food-penguin": "/media/seasons/food-penguin.png",
  "food-swallow": "/media/seasons/food-swallow.png",
  "food-reindeer": "/media/seasons/food-reindeer.png",
  "catch-spring": "/media/seasons/catch-spring.png",
  "catch-summer": "/media/seasons/catch-summer.png",
  "catch-autumn": "/media/seasons/catch-autumn.png",
  "catch-winter": "/media/seasons/catch-winter.png",
  "catch-tet": "/media/seasons/catch-tet.png",
  "catch-midautumn": "/media/seasons/catch-midautumn.png",
  "catch-christmas": "/media/seasons/catch-christmas.png"
} as const satisfies Record<ProductArtId, string>;

export const PRODUCT_ART_IDS = Object.keys(PRODUCT_ART_PATHS) as ProductArtId[];

export function ProductArt(props: ProductArtProps) {
  const decorative = props.decorative === true;
  const alt = decorative ? "" : props.alt.trim();
  if (!decorative && !alt) throw new Error(`ProductArt ${props.id} requires non-empty alt text.`);
  const className = ["product-art", props.className].filter(Boolean).join(" ");
  return <img
    className={className}
    src={PRODUCT_ART_PATHS[props.id]}
    alt={alt}
    aria-hidden={decorative || undefined}
    data-product-art={props.id}
    decoding="async"
    draggable={false}
  />;
}
