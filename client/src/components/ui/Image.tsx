import { useState, type ImgHTMLAttributes } from 'react';
import { ImageOff } from 'lucide-react';

import { cn } from '@/lib/utils';

export interface ImageProps extends Omit<ImgHTMLAttributes<HTMLImageElement>, 'onError' | 'src'> {
  /** Nullable by design: catalogue records frequently have no image yet. */
  src: string | null | undefined;
  alt: string;
  aspect?: 'square' | 'portrait' | 'landscape' | 'auto';
  containerClassName?: string;
  /** Above-the-fold imagery should load eagerly; everything else defers. */
  priority?: boolean;
}

const ASPECTS = {
  square: 'aspect-square',
  portrait: 'aspect-[3/4]',
  landscape: 'aspect-[4/3]',
  auto: '',
};

/**
 * Image with three states baked in: a shimmer while loading, a graceful icon on
 * failure, and native lazy loading below the fold. Product grids are mostly images —
 * getting this wrong is what makes a catalogue feel janky.
 */
export function Image({
  src,
  alt,
  aspect = 'square',
  className,
  containerClassName,
  priority = false,
  ...props
}: ImageProps) {
  const [status, setStatus] = useState<'loading' | 'loaded' | 'error'>(src ? 'loading' : 'error');

  return (
    <div className={cn('relative overflow-hidden bg-ink-100', ASPECTS[aspect], containerClassName)}>
      {status === 'loading' && <div className="skeleton absolute inset-0 rounded-none" aria-hidden="true" />}

      {status === 'error' ? (
        <div className="flex h-full w-full items-center justify-center text-ink-300">
          <ImageOff className="h-8 w-8" aria-hidden="true" />
          <span className="sr-only">{alt}</span>
        </div>
      ) : (
        <img
          src={src ?? undefined}
          alt={alt}
          loading={priority ? 'eager' : 'lazy'}
          decoding="async"
          // `fetchpriority` lets the browser front-load the hero image.
          fetchPriority={priority ? 'high' : 'auto'}
          onLoad={() => setStatus('loaded')}
          onError={() => setStatus('error')}
          className={cn(
            'h-full w-full object-cover transition-opacity duration-300',
            status === 'loaded' ? 'opacity-100' : 'opacity-0',
            className,
          )}
          {...props}
        />
      )}
    </div>
  );
}
