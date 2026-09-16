import { createSlice, type PayloadAction } from '@reduxjs/toolkit';

import {
  readStoredTheme,
  resolveTheme,
  storeTheme,
  systemPrefersDark,
  type ResolvedTheme,
  type ThemeMode,
} from '@/lib/theme';

/**
 * `mode` is what the user asked for; `resolved` is what is actually painted. Keeping both
 * means the toggle can show "System" honestly while the UI still knows it is currently dark.
 *
 * Persistence lives in these reducers rather than in a caller: dispatching `setThemeMode`
 * from anywhere should survive a reload, and one storage write is not worth a middleware.
 * The DOM class is a different matter and is written only by `useTheme`.
 */
interface ThemeState {
  mode: ThemeMode;
  resolved: ResolvedTheme;
}

/** Rotation order for the single-button toggle: whatever you see now, then the other, then System. */
const CYCLE: Record<ThemeMode, ThemeMode> = {
  light: 'dark',
  dark: 'system',
  system: 'light',
};

function initialise(): ThemeState {
  // Read at module scope on purpose: it matches what the pre-hydration script in
  // index.html already applied, so the first React render agrees with the painted page.
  const mode = readStoredTheme() ?? 'system';
  return { mode, resolved: resolveTheme(mode) };
}

const themeSlice = createSlice({
  name: 'theme',
  initialState: initialise(),
  reducers: {
    setThemeMode(state, action: PayloadAction<ThemeMode>) {
      state.mode = action.payload;
      state.resolved = resolveTheme(action.payload);
      storeTheme(action.payload);
    },
    cycleThemeMode(state) {
      const next = CYCLE[state.mode];
      state.mode = next;
      state.resolved = resolveTheme(next);
      storeTheme(next);
    },
    /** The OS preference changed under us — only meaningful while mode is `system`. */
    systemThemeChanged(state, action: PayloadAction<boolean | undefined>) {
      if (state.mode !== 'system') return;
      state.resolved = (action.payload ?? systemPrefersDark()) ? 'dark' : 'light';
    },
  },
});

export const { setThemeMode, cycleThemeMode, systemThemeChanged } = themeSlice.actions;

export default themeSlice.reducer;
