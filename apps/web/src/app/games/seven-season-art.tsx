import { useCallback, useEffect, useRef, type CSSProperties } from "react";
import { useExperience } from "../../features/experience/Experience.js";
import { isExclusiveAudioActive } from "../../features/experience/audio-precedence.js";
import { useTheme } from "../shared/ThemeProvider.js";

const root = "/media/games/seven-seasons";
const seasons = {
  spring: { id: "xuan", hero: "Thỏ", drop: "Hoa đào", boss: "Cà rốt", layout: [[32,51,75],[43,55,45],[55,110,60],1] as const },
  summer: { id: "ha", hero: "Dế", drop: "Kem", boss: "Lá cỏ", layout: [[43,65,84],[57,48,45],[60,60,55],0] as const },
  autumn: { id: "thu", hero: "Sóc", drop: "Lá phong", boss: "Hạt dẻ", layout: [[30,45,66,86],[33,42,47,41],[60,55,110,60],2] as const },
  winter: { id: "dong", hero: "Cánh cụt", drop: "Bông tuyết", boss: "Cá", layout: [[44,60,78],[46,52,57],[55,110,110],1] as const },
  tet: { id: "tet", hero: "Én", drop: "Lì xì", boss: "Sâu xanh", layout: [[35,54,81],[46,60,52],[55,110,60],1] as const },
  midautumn: { id: "trung-thu", hero: "Thỏ trăng", drop: "Đèn ông sao", boss: "Cà rốt tím", layout: [[32,53,70,88],[38,43,39,35],[60,55,110,60],2] as const },
  christmas: { id: "giang-sinh", hero: "Tuần lộc", drop: "Hộp quà", boss: "Táo", layout: [[38,57,83],[55,60,47],[55,110,60],1] as const },
};

type Season = (typeof seasons)[keyof typeof seasons];
type GameSound = "drop" | "catch-correct" | "catch-wrong" | "game-over" | "run" | "jump" | "gate-open" | "boss-hit" | "boss-win" | "timeout";

export function useGameSeason() {
  return seasons[useTheme().resolvedTheme];
}

export function SeasonImage({ season, asset, className, style, alt = "" }: {
  season: Season;
  asset: string;
  className?: string;
  style?: CSSProperties;
  alt?: string;
}) {
  const src = asset === "shared-jump" ? `${root}/effects/jump.svg` : `${root}/seasons/${season.id}/${asset}.svg`;
  return <img src={src} alt={alt} className={className} style={style} draggable={false} />;
}

export function SeasonStageSky({ season }: { season: Season }) {
  return <div className="season-stage-sky" aria-hidden="true">
    <SeasonImage season={season} asset="background" className="season-stage-background" />
    <SeasonImage season={season} asset="ambient" className="season-stage-ambient" />
  </div>;
}

export function SeasonHearts({ season, lives }: { season: Season; lives: number }) {
  return <span className="game-lives" aria-label={`${lives} mạng còn lại`}>
    {[0, 1, 2].map(index => <SeasonImage key={index} season={season} asset={index < lives ? "hud/heart" : "hud/heart-lost"} />)}
  </span>;
}

export function useSeasonGameSound() {
  const { effectsOn } = useExperience();
  const sound = useRef<HTMLAudioElement | null>(null);
  useEffect(() => () => {
    sound.current?.pause();
    sound.current = null;
  }, [effectsOn]);
  return useCallback((cue: GameSound) => {
    if (!effectsOn || isExclusiveAudioActive("speech") || isExclusiveAudioActive("media") || isExclusiveAudioActive("microphone")) return;
    sound.current?.pause();
    const next = new Audio(`${root}/sound/${cue}.wav`);
    next.volume = .55;
    sound.current = next;
    void next.play()?.catch(() => undefined);
  }, [effectsOn]);
}
