/**
 * Theme plumbing shared by the Redux slice, the `useTheme` hook and the pre-hydration
 * script in `index.html`. The storage key is duplicated in that script by necessity —
 * it has to run before any module loads to avoid a flash of the wrong theme — so keep
 * the two in sync.
 */
export type ThemeMode = 'light' | 'dark' | 'system';
export type ResolvedTheme = 'light' | 'dark';

export const THEME_STORAGE_KEY = 'shopwave:theme';

const DARK_QUERY = '(prefers-color-scheme: dark)';

/**
 * Mobile browser chrome. Light keeps the original brand indigo; dark matches
 * `--color-canvas`, because an indigo bar above a near-black page looks like a bug.
 */
const THEME_COLOR: Record<ResolvedTheme, string> = {
  light: '#4f46e5',
  dark: '#090d18',
};

export function isThemeMode(value: unknown): value is ThemeMode {
  return value === 'light' || value === 'dark' || value === 'system';
}

/** Private-mode Safari throws on storage access, so every touch is guarded. */
export function readStoredTheme(): ThemeMode | null {
  try {
    const stored = window.localStorage.getItem(THEME_STORAGE_KEY);
    return isThemeMode(stored) ? stored : null;
  } catch {
    return null;
  }
}

export function storeTheme(mode: ThemeMode): void {
  try {
    window.localStorage.setItem(THEME_STORAGE_KEY, mode);
  } catch {
    // A theme preference is not worth breaking a render over.
  }
}

export function systemPrefersDark(): boolean {
  return typeof window !== 'undefined' && window.matchMedia(DARK_QUERY).matches;
}

export function resolveTheme(mode: ThemeMode): ResolvedTheme {
  if (mode === 'system') return systemPrefersDark() ? 'dark' : 'light';
  return mode;
}

/** Single writer of the `dark` class — nothing else should touch `documentElement.classList`. */
export function applyTheme(resolved: ResolvedTheme): void {
  const root = document.documentElement;
  root.classList.toggle('dark', resolved === 'dark');
  root.style.colorScheme = resolved;
  root.dataset.theme = resolved;

  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', THEME_COLOR[resolved]);
}

/** Subscribes to OS-level changes; returns an unsubscribe. */
export function watchSystemTheme(onChange: (prefersDark: boolean) => void): () => void {
  const query = window.matchMedia(DARK_QUERY);
  const listener = (event: MediaQueryListEvent) => onChange(event.matches);

  query.addEventListener('change', listener);
  return () => query.removeEventListener('change', listener);
}
