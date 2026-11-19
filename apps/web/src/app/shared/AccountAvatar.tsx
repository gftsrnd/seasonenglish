import { Cloud, Droplets, Flower2, Leaf, Snowflake, Star, Sun } from "lucide-react";
import type { AvatarCharacter, LearnerAvatarData } from "@e4s/contracts";
import { useTheme } from "./ThemeProvider.js";
import "./account-avatar.css";

export const AVATAR_CHARACTER_NAMES = {
  rabbit: "Thỏ hồng", cricket: "Dế mèn", squirrel: "Sóc", penguin: "Cánh cụt",
  swallow: "Chim én", "jade-rabbit": "Thỏ ngọc", reindeer: "Tuần lộc"
} satisfies Record<AvatarCharacter, string>;
export const AVATAR_COLOR_HEX = {
  ink: "#1E1E1E", brown: "#6E3B32", olive: "#4B6120", taupe: "#7A7064", orange: "#F28C28", rose: "#B4374B"
} satisfies Record<LearnerAvatarData["color"], string>;
export const AVATAR_BG = ["#FBB829", "#F6D3CB", "#E3DCFB", "#DCE8C8", "#FFF4D9", "#D6CCBF"] as const;
const avatarIcons = { leaf: Leaf, sun: Sun, flower: Flower2, cloud: Cloud, star: Star, drop: Droplets, snow: Snowflake };

/** The avatar character of each season (the 7 Season English characters) – the default before a learner picks one. */
export const SEASON_AVATAR_CHARACTER = { spring: "rabbit", summer: "cricket", autumn: "squirrel", winter: "penguin", tet: "swallow", midautumn: "jade-rabbit", christmas: "reindeer" } as const satisfies Record<string, AvatarCharacter>;

export function AvatarCharacterArt({ character }: { character: AvatarCharacter }) {
  return <img src={`/media/avatars/${character}.webp`} alt="" decoding="async" draggable={false} />;
}

export function AvatarMark({ acc, size = 32 }: { acc: Exclude<LearnerAvatarData["acc"], "none">; size?: number }) {
  const Icon = avatarIcons[acc];
  return <Icon size={size} strokeWidth={1.7} aria-hidden="true" />;
}

export function AccountAvatar({ avatar, name, size = 88 }: {
  avatar: Partial<LearnerAvatarData> | undefined;
  name: string;
  size?: number;
}) {
  const dimension = `var(--profile-avatar-size, ${size}px)`;
  const { resolvedTheme } = useTheme();
  // Nothing chosen yet → the season's character (19/11), never bare initials.
  const character = avatar?.character && Object.hasOwn(AVATAR_CHARACTER_NAMES, avatar.character) ? avatar.character : avatar ? undefined : SEASON_AVATAR_CHARACTER[resolvedTheme];
  const accessory = avatar?.acc && avatar.acc !== "none" && Object.hasOwn(avatarIcons, avatar.acc) ? avatar.acc : undefined;
  const initials = name.trim().split(/\s+/u).slice(-2).map(word => word[0]).join("").toUpperCase();
  return <span className="account-avatar" role="img" aria-label={`Avatar của ${name}`}
    style={{
      width: dimension, height: dimension, minWidth: dimension, minHeight: dimension,
      background: AVATAR_BG[avatar?.bg ?? 0] ?? AVATAR_BG[0],
      color: AVATAR_COLOR_HEX[avatar?.color ?? (size === 32 ? "ink" : "olive")],
      ...(size === 32 ? { fontSize: 12 } : {})
    }}>
    {character ? <AvatarCharacterArt character={character} /> : accessory ? <AvatarMark acc={accessory} size={Math.round(size * .58)} /> : initials || "?"}
  </span>;
}
