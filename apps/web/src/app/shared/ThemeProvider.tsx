import { createContext, useCallback, useContext, useLayoutEffect, useMemo, useState, type ReactNode } from "react";
import { resolveAutomaticTheme, useAutomaticTheme } from "../../features/experience/useAutomaticTheme.js";

export const themePreferences = ["auto", "spring", "summer", "autumn", "winter", "tet", "midautumn", "christmas"] as const;
export type ThemePreference = typeof themePreferences[number];
export const themePatternUrls: Record<Exclude<ThemePreference, "auto">, string> = {
  spring: "/patterns/season-spring.png",
  summer: "/patterns/season-summer.png",
  autumn: "/patterns/season-autumn.png",
  winter: "/patterns/season-winter.png",
  tet: "/patterns/season-tet.png",
  midautumn: "/patterns/season-midautumn.png",
  christmas: "/patterns/season-christmas.png"
};
type ThemeApi = {
  theme: ThemePreference;
  resolvedTheme: Exclude<ThemePreference, "auto">;
  setTheme: (theme: ThemePreference) => void;
  previewTheme: (theme: ThemePreference) => void;
  clearThemePreview: () => void;
};
const fallbackTheme: ThemeApi = {
  theme: "auto",
  resolvedTheme: resolveAutomaticTheme(new Date()),
  setTheme: () => undefined,
  previewTheme: () => undefined,
  clearThemePreview: () => undefined
};
const ThemeContext = createContext<ThemeApi>(fallbackTheme);
export const organisationThemeStorageKey = "e4s:organisation-theme";

function readOrganisationTheme(): ThemePreference | undefined {
  try {
    const cached = window.localStorage.getItem(organisationThemeStorageKey);
    if (isThemePreference(cached)) return cached;
  } catch {
    // Browsers can restrict storage access.
  }
  return undefined;
}

export function useTheme(): ThemeApi { return useContext(ThemeContext); }

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [organisationTheme, setOrganisationTheme] = useState(readOrganisationTheme);
  const [preview, setPreview] = useState<ThemePreference>();
  const theme = organisationTheme ?? "auto";
  const resolvedTheme = useAutomaticTheme(preview ?? theme);
  const hasTheme = organisationTheme !== undefined || preview !== undefined;
  const setTheme = useCallback((nextTheme: ThemePreference) => {
    if (!isThemePreference(nextTheme)) return;
    setOrganisationTheme(nextTheme);
    try {
      window.localStorage.setItem(organisationThemeStorageKey, nextTheme);
    } catch {
      // The theme still applies for the current page.
    }
  }, []);
  const previewTheme = useCallback((nextTheme: ThemePreference) => setPreview(nextTheme), []);
  const clearThemePreview = useCallback(() => setPreview(undefined), []);
  useLayoutEffect(() => {
    if (hasTheme) {
      applyResolvedTheme(resolvedTheme);
    } else {
      delete document.documentElement.dataset.theme;
      delete document.documentElement.dataset.themePattern;
      document.documentElement.style.removeProperty("--season-pattern-image");
    }
  }, [hasTheme, resolvedTheme]);
  const value = useMemo(() => ({ theme, resolvedTheme, setTheme, previewTheme, clearThemePreview }), [clearThemePreview, previewTheme, resolvedTheme, setTheme, theme]);
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

function applyResolvedTheme(theme: Exclude<ThemePreference, "auto">): void {
  document.documentElement.dataset.theme = theme;
  document.documentElement.dataset.themePattern = theme;
  document.documentElement.style.setProperty("--season-pattern-image", `url("${themePatternUrls[theme]}")`);
}

export function isThemePreference(value: string | null | undefined): value is ThemePreference {
  return Boolean(value && (themePreferences as readonly string[]).includes(value));
}
