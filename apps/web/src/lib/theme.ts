import { useCallback, useEffect, useState } from 'react';

/** The three themes of the design system (index.css). `paper` is light, `graphite` dark, `blueprint` the blue drawing paper. */
export const THEMES = ['paper', 'graphite', 'blueprint'] as const;
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

/** The current theme and a setter that applies it to <html data-theme> and remembers it. */
export function useTheme() {
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
