const rewardBadgeIcons: Readonly<Record<string, string>> = {
  first: "🐣", // media-scan: allow-avatar-reward -- deliberate reward symbol
  week: "📅", // media-scan: allow-avatar-reward -- deliberate reward symbol
  streak3: "🔥", // media-scan: allow-avatar-reward -- deliberate reward symbol
  streak7: "🌟", // media-scan: allow-avatar-reward -- deliberate reward symbol
  sharp: "🎯", // media-scan: allow-avatar-reward -- deliberate reward symbol
  words: "🔑", // media-scan: allow-avatar-reward -- deliberate reward symbol
  chat: "💬", // media-scan: allow-avatar-reward -- deliberate reward symbol
  friday: "✍️" // media-scan: allow-avatar-reward -- deliberate reward symbol
};
const badgeAliases = new Map([
  ["starter", "first"],
  ["week_complete", "week"],
  ["streak5", "streak7"],
  ["first_try", "sharp"],
  ["wordsmith", "words"],
  ["coach_friend", "chat"]
]);

export function rewardBadgeKey(key: string) {
  return badgeAliases.get(key) ?? key;
}

export function rewardBadgeIcon(key: string): string | undefined {
  const canonical = rewardBadgeKey(key);
  return Object.hasOwn(rewardBadgeIcons, canonical) ? rewardBadgeIcons[canonical] : undefined;
}
