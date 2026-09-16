import { Monitor, Moon, Sun } from 'lucide-react';

import { useTheme } from '@/hooks/useTheme';
import type { ThemeMode } from '@/lib/theme';
import { cn } from '@/lib/utils';

const MODES: Record<ThemeMode, { icon: typeof Sun; label: string; next: string }> = {
  light: { icon: Sun, label: 'Light', next: 'dark' },
  dark: { icon: Moon, label: 'Dark', next: 'system' },
  system: { icon: Monitor, label: 'System', next: 'light' },
};

export interface ThemeToggleProps {
  className?: string;
  /** Adds a text label beside the icon — used in the mobile menu, where icons alone are ambiguous. */
  showLabel?: boolean;
}

/**
 * One button cycling light → dark → system. `system` is a real third state rather than a
 * hidden default: without it, a visitor who once tapped the toggle could never hand the
 * decision back to their OS.
 */
export function ThemeToggle({ className, showLabel = false }: ThemeToggleProps) {
  const { mode, resolved, cycleMode } = useTheme();
  const { icon: Icon, label, next } = MODES[mode];

  return (
    <button
      type="button"
      onClick={cycleMode}
      // The control is not a simple on/off, so it announces its state rather than pressed-ness.
      aria-label={`Theme: ${label}${mode === 'system' ? ` (currently ${resolved})` : ''}. Switch to ${next}.`}
      title={`Theme: ${label} — switch to ${next}`}
      className={cn(
        'relative flex items-center gap-2 rounded-lg p-2.5 text-ink-700 transition-colors hover:bg-ink-100',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500',
        showLabel && 'w-full px-3 py-2.5 text-sm font-medium',
        className,
      )}
    >
      <Icon className="h-5 w-5 shrink-0" aria-hidden="true" />
      {showLabel && <span>{label} theme</span>}
    </button>
  );
}
