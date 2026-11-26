import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';

/** The three themes of the design system (index.css). `paper` is light, `graphite` dark, `cloud` a light sky blue. */
export const THEMES = ['paper', 'graphite', 'cloud'] as const;
export type Theme = (typeof THEMES)[number];

export const THEME_STORAGE_KEY = 'ctoc.theme';

const isTheme = (value: unknown): value is Theme => typeof value === 'string' && (THEMES as readonly string[]).includes(value);

/** The saved choice, else the system preference (dark → graphite). Storage may be unavailable (private mode): then the default. */
export function initialTheme(): Theme {
  try {
    const saved = window.localStorage.getItem(THEME_STORAGE_KEY);
    if (isTheme(saved)) return saved;
  } catch {
    /* storage is not available */
  }
  return typeof window.matchMedia === 'function' && window.matchMedia('(prefers-color-scheme: dark)').matches ? 'graphite' : 'paper';
}

/** The current theme and a setter that applies it to <html data-theme> and remembers it. One state for the whole app. */
function useThemeState() {
  const [theme, setThemeState] = useState<Theme>(initialTheme);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
  }, [theme]);

  const setTheme = useCallback((next: Theme) => {
    setThemeState(next);
    try {
      window.localStorage.setItem(THEME_STORAGE_KEY, next);
    } catch {
      /* the choice lasts for this visit only */
    }
  }, []);

  return { theme, setTheme };
}

const ThemeContext = createContext<ReturnType<typeof useThemeState> | null>(null);

/** Shares one theme state, so the header switch and the phone menu switch always agree. */
export function ThemeProvider({ children }: { children: ReactNode }) {
  const state = useThemeState();
  const value = useMemo(() => state, [state.theme, state.setTheme]);
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

/** The theme from the provider; a component rendered without one keeps its own state. */
export function useTheme() {
  const shared = useContext(ThemeContext);
  const own = useThemeState();
  return shared ?? own;
}
