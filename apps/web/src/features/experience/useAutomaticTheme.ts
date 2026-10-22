import { useEffect, useState } from "react";
import { resolveAutomaticTheme, type SeasonTheme } from "../../app/games/season-visual.js";

export { resolveAutomaticTheme } from "../../app/games/season-visual.js";

export type ConfiguredTheme = SeasonTheme | "auto";
export type ResolvedSeasonTheme = SeasonTheme;

export function millisecondsUntilNextLocalDay(at: Date): number {
  const nextDay = new Date(at.getFullYear(), at.getMonth(), at.getDate() + 1);
  return Math.max(0, nextDay.getTime() - at.getTime());
}

export function useAutomaticTheme(configuredTheme: ConfiguredTheme): ResolvedSeasonTheme {
  const [resolvedTheme, setResolvedTheme] = useState<ResolvedSeasonTheme>(() => configuredTheme === "auto" ? resolveAutomaticTheme(new Date()) : configuredTheme);

  useEffect(() => {
    if (configuredTheme !== "auto") {
      setResolvedTheme(configuredTheme);
      return;
    }

    let timer: ReturnType<typeof setTimeout> | undefined;
    const refresh = () => setResolvedTheme(resolveAutomaticTheme(new Date()));
    const scheduleNextDay = () => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => {
        refresh();
        scheduleNextDay();
      }, millisecondsUntilNextLocalDay(new Date()) + 1);
    };
    const handleVisibilityChange = () => {
      if (document.visibilityState !== "visible") return;
      refresh();
      scheduleNextDay();
    };

    refresh();
    scheduleNextDay();
    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => {
      if (timer) clearTimeout(timer);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [configuredTheme]);

  return resolvedTheme;
}
