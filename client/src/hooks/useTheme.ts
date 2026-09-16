import { useCallback, useEffect } from 'react';

import { useAppDispatch, useAppSelector } from '@/app/store';
import { cycleThemeMode, setThemeMode, systemThemeChanged } from '@/features/theme/themeSlice';
import { applyTheme, watchSystemTheme, type ThemeMode } from '@/lib/theme';

/**
 * Keeps `<html class="dark">` in step with the store and follows the OS preference while
 * the mode is `system`. Mounted once from `App`; components elsewhere use the returned
 * values without re-running the effects (the effects are idempotent regardless).
 */
export function useTheme() {
  const dispatch = useAppDispatch();
  const mode = useAppSelector((state) => state.theme.mode);
  const resolved = useAppSelector((state) => state.theme.resolved);

  useEffect(() => {
    applyTheme(resolved);
  }, [resolved]);

  useEffect(() => {
    if (mode !== 'system') return undefined;
    // Re-read on subscribe as well: the OS may have changed while another mode was active.
    dispatch(systemThemeChanged(undefined));
    return watchSystemTheme((prefersDark) => dispatch(systemThemeChanged(prefersDark)));
  }, [dispatch, mode]);

  const setMode = useCallback((next: ThemeMode) => dispatch(setThemeMode(next)), [dispatch]);
  const cycleMode = useCallback(() => dispatch(cycleThemeMode()), [dispatch]);

  return { mode, resolved, setMode, cycleMode };
}
