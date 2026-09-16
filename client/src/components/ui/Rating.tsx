import { Star } from 'lucide-react';

import { cn } from '@/lib/utils';

export interface RatingProps {
  value: number;
  count?: number;
  size?: 'sm' | 'md' | 'lg';
  showValue?: boolean;
  className?: string;
}

const SIZES = {
  sm: 'h-3.5 w-3.5',
  md: 'h-4 w-4',
  lg: 'h-5 w-5',
};

/**
 * Renders partial stars by clipping a filled row over an empty one — a 4.3 average
 * should look like 4.3, not round up to 4 or 5.
 */
export function Rating({ value, count, size = 'sm', showValue = false, className }: RatingProps) {
  const clamped = Math.max(0, Math.min(5, value));
  const percentage = (clamped / 5) * 100;

  return (
    <div className={cn('flex items-center gap-1.5', className)}>
      <div
        className="relative inline-flex"
        role="img"
        aria-label={`Rated ${clamped.toFixed(1)} out of 5${count !== undefined ? ` from ${count} reviews` : ''}`}
      >
        <div className="flex gap-0.5">
          {[0, 1, 2, 3, 4].map((index) => (
            <Star key={index} className={cn(SIZES[size], 'text-ink-300')} aria-hidden="true" />
          ))}
        </div>
        <div
          className="absolute inset-0 flex gap-0.5 overflow-hidden"
          style={{ width: `${percentage}%` }}
          aria-hidden="true"
        >
          {[0, 1, 2, 3, 4].map((index) => (
            <Star
              key={index}
              className={cn(SIZES[size], 'shrink-0 fill-amber-400 text-amber-400')}
            />
          ))}
        </div>
      </div>

      {showValue && <span className="text-sm font-semibold text-ink-800">{clamped.toFixed(1)}</span>}
      {count !== undefined && (
        <span className="text-sm text-ink-500">({count.toLocaleString('en-IN')})</span>
      )}
    </div>
  );
}

export interface RatingInputProps {
  value: number;
  onChange: (value: number) => void;
  error?: string;
}

/** Keyboard-operable star picker for the review form. */
export function RatingInput({ value, onChange, error }: RatingInputProps) {
  return (
    <div>
      <div className="flex gap-1" role="radiogroup" aria-label="Rating">
        {[1, 2, 3, 4, 5].map((star) => (
          <button
            key={star}
            type="button"
            role="radio"
            aria-checked={value === star}
            aria-label={`${star} star${star === 1 ? '' : 's'}`}
            onClick={() => onChange(star)}
            className="rounded p-0.5 transition-transform hover:scale-110 focus-visible:ring-2 focus-visible:ring-brand-500"
          >
            <Star
              className={cn(
                'h-7 w-7 transition-colors',
                star <= value ? 'fill-amber-400 text-amber-400' : 'text-ink-300',
              )}
              aria-hidden="true"
            />
          </button>
        ))}
      </div>
      {error && (
        <p role="alert" className="mt-1.5 text-sm text-danger-600">
          {error}
        </p>
      )}
    </div>
  );
}
