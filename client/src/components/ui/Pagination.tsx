import { ChevronLeft, ChevronRight } from 'lucide-react';

import { Button } from '@/components/ui/Button';
import { cn } from '@/lib/utils';
import type { PaginationMeta } from '@/types/api';

interface PaginationProps {
  meta: PaginationMeta;
  onPageChange: (page: number) => void;
  className?: string;
}

/**
 * Windowed page numbers: always shows first and last, the current page and its
 * neighbours, and ellipses for the gaps. A 200-page catalogue must not render 200 buttons.
 */
function buildPageList(current: number, total: number): Array<number | 'gap'> {
  if (total <= 7) return Array.from({ length: total }, (_, index) => index + 1);

  const pages: Array<number | 'gap'> = [1];

  const start = Math.max(2, current - 1);
  const end = Math.min(total - 1, current + 1);

  if (start > 2) pages.push('gap');
  for (let page = start; page <= end; page += 1) pages.push(page);
  if (end < total - 1) pages.push('gap');

  pages.push(total);
  return pages;
}

export function Pagination({ meta, onPageChange, className }: PaginationProps) {
  if (meta.totalPages <= 1) return null;

  const pages = buildPageList(meta.page, meta.totalPages);

  return (
    <nav
      aria-label="Pagination"
      className={cn('flex flex-wrap items-center justify-center gap-1.5', className)}
    >
      <Button
        variant="outline"
        size="sm"
        disabled={!meta.hasPreviousPage}
        onClick={() => onPageChange(meta.page - 1)}
        aria-label="Previous page"
        leftIcon={<ChevronLeft className="h-4 w-4" aria-hidden="true" />}
      >
        <span className="hidden sm:inline">Previous</span>
      </Button>

      <ul className="flex items-center gap-1">
        {pages.map((page, index) =>
          page === 'gap' ? (
            <li key={`gap-${index}`} className="px-2 text-ink-400" aria-hidden="true">
              …
            </li>
          ) : (
            <li key={page}>
              <button
                type="button"
                onClick={() => onPageChange(page)}
                aria-current={page === meta.page ? 'page' : undefined}
                aria-label={`Page ${page}`}
                className={cn(
                  'h-9 min-w-9 rounded-lg px-3 text-sm font-semibold transition-colors',
                  'focus-visible:ring-2 focus-visible:ring-brand-500',
                  page === meta.page
                    ? 'bg-brand-600 text-white'
                    : 'text-ink-700 hover:bg-ink-100',
                )}
              >
                {page}
              </button>
            </li>
          ),
        )}
      </ul>

      <Button
        variant="outline"
        size="sm"
        disabled={!meta.hasNextPage}
        onClick={() => onPageChange(meta.page + 1)}
        aria-label="Next page"
        rightIcon={<ChevronRight className="h-4 w-4" aria-hidden="true" />}
      >
        <span className="hidden sm:inline">Next</span>
      </Button>
    </nav>
  );
}
