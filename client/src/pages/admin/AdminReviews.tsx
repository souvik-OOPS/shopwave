import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Check, MessageSquare, X } from 'lucide-react';

import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { EmptyState, ErrorState, TableSkeleton } from '@/components/ui/Feedback';
import { Select } from '@/components/ui/Input';
import { Pagination } from '@/components/ui/Pagination';
import { Rating } from '@/components/ui/Rating';
import { adminApi } from '@/lib/api';
import { queryKeys } from '@/lib/queryClient';
import { useToast } from '@/hooks/useToast';
import { formatDate } from '@/lib/utils';
import type { Review } from '@/types/api';

const STATUS_OPTIONS = [
  { value: 'PENDING', label: 'Awaiting moderation' },
  { value: 'APPROVED', label: 'Approved' },
  { value: 'REJECTED', label: 'Rejected' },
  { value: '', label: 'All reviews' },
];

const STATUS_TONE: Record<Review['status'], 'warning' | 'success' | 'danger'> = {
  PENDING: 'warning',
  APPROVED: 'success',
  REJECTED: 'danger',
};

/**
 * The moderation queue for customer reviews.
 *
 * Reviews are published through the storefront and land here before they affect a
 * product's rating — rejecting one removes it from the average rather than merely hiding
 * it, which is why this is a staff screen and not a toggle on the product page.
 */
export function AdminReviews() {
  const toast = useToast();
  const client = useQueryClient();

  // Pending first: the queue exists to be emptied.
  const [status, setStatus] = useState('PENDING');
  const [page, setPage] = useState(1);

  const params = { page, limit: 20, ...(status ? { status } : {}) };

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: queryKeys.reviews.admin(params),
    queryFn: () => adminApi.reviews(params),
  });

  const moderate = useMutation({
    mutationFn: ({ id, next }: { id: string; next: Review['status'] }) =>
      adminApi.moderateReview(id, next),
    onSuccess: (_result, { next }) => {
      toast.success(next === 'APPROVED' ? 'Review approved' : 'Review rejected');
      void client.invalidateQueries({ queryKey: queryKeys.reviews.all });
      // An approval or rejection changes the product's rating aggregate.
      void client.invalidateQueries({ queryKey: queryKeys.products.all });
    },
    onError: (error) => toast.error(error),
  });

  const reviews = data?.reviews ?? [];

  return (
    <div className="p-6 lg:p-8">
      <header className="mb-6 flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-heading-lg text-ink-900">Reviews</h1>
          <p className="mt-1 text-sm text-ink-500">
            {data?.meta ? `${data.meta.total} reviews` : 'Loading…'}
          </p>
        </div>
        <Select
          aria-label="Filter by status"
          options={STATUS_OPTIONS}
          value={status}
          onChange={(event) => {
            setStatus(event.target.value);
            setPage(1);
          }}
          containerClassName="w-56"
        />
      </header>

      {isError ? (
        <ErrorState onRetry={() => void refetch()} />
      ) : isLoading ? (
        <div className="rounded-2xl border border-ink-200 bg-surface p-5">
          <TableSkeleton rows={5} />
        </div>
      ) : reviews.length === 0 ? (
        <div className="rounded-2xl border border-ink-200 bg-surface p-5">
          <EmptyState
            icon={<MessageSquare className="h-7 w-7" />}
            title="Nothing to moderate"
            description="Reviews appear here as customers submit them."
          />
        </div>
      ) : (
        <ul className="space-y-4">
          {reviews.map((review) => (
            <li key={review.id} className="rounded-2xl border border-ink-200 bg-surface p-5">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <Rating value={review.rating} size="sm" />
                    <Badge tone={STATUS_TONE[review.status]}>{review.status}</Badge>
                    {review.isVerifiedPurchase && <Badge tone="info">Verified purchase</Badge>}
                  </div>

                  <Link
                    to={`/products/${review.product.slug}`}
                    className="mt-2 block text-sm font-semibold text-ink-900 hover:text-brand-700"
                  >
                    {review.product.name}
                  </Link>

                  {review.title && <p className="mt-2 font-medium text-ink-900">{review.title}</p>}
                  <p className="mt-1 max-w-3xl whitespace-pre-line text-sm text-ink-600">
                    {review.comment}
                  </p>

                  <p className="mt-2 text-xs text-ink-400">
                    {review.author.name} · {formatDate(review.createdAt)}
                  </p>
                </div>

                <div className="flex shrink-0 gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={review.status === 'APPROVED' || moderate.isPending}
                    leftIcon={<Check className="h-4 w-4" aria-hidden="true" />}
                    onClick={() => moderate.mutate({ id: review.id, next: 'APPROVED' })}
                  >
                    Approve
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    disabled={review.status === 'REJECTED' || moderate.isPending}
                    leftIcon={<X className="h-4 w-4" aria-hidden="true" />}
                    onClick={() => moderate.mutate({ id: review.id, next: 'REJECTED' })}
                  >
                    Reject
                  </Button>
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}

      {data?.meta && data.meta.totalPages > 1 && (
        <Pagination meta={data.meta} onPageChange={setPage} className="mt-6" />
      )}
    </div>
  );
}
