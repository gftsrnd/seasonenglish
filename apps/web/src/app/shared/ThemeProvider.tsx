import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { resolveAutomaticTheme, useAutomaticTheme } from "../../features/experience/useAutomaticTheme.js";

export const themePreferences = ["auto", "spring", "summer", "autumn", "winter", "tet", "midautumn", "christmas"] as const;
export type ThemePreference = typeof themePreferences[number];
const themeStorageKey = "e4s:theme";
type ThemeApi = { theme: ThemePreference; resolvedTheme: Exclude<ThemePreference, "auto">; setTheme: (theme: ThemePreference) => void };
const fallbackTheme: ThemeApi = { theme: "auto", resolvedTheme: resolveAutomaticTheme(new Date()), setTheme: persistTheme };
const ThemeContext = createContext<ThemeApi>(fallbackTheme);

export function useTheme(): ThemeApi { return useContext(ThemeContext); }

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<ThemePreference>(() => readStoredTheme());
  const resolvedTheme = useAutomaticTheme(theme);
  const setTheme = useCallback((nextTheme: ThemePreference) => {
    setThemeState(nextTheme);
    persistTheme(nextTheme);
  }, []);
  useEffect(() => { document.documentElement.dataset.theme = resolvedTheme; }, [resolvedTheme]);
  const value = useMemo(() => ({ theme, resolvedTheme, setTheme }), [resolvedTheme, setTheme, theme]);
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

function persistTheme(theme: ThemePreference): void {
  try { window.localStorage.setItem(themeStorageKey, theme); } catch { /* Storage is optional in privacy mode. */ }
  document.documentElement.dataset.theme = theme === "auto" ? resolveAutomaticTheme(new Date()) : theme;
}

function readStoredTheme(): ThemePreference {
  try {
    const stored = window.localStorage.getItem(themeStorageKey);
    return isThemePreference(stored) ? stored : "auto";
  } catch { return "auto"; }
}

export function isThemePreference(value: string | null | undefined): value is ThemePreference {
  return Boolean(value && (themePreferences as readonly string[]).includes(value));
}
