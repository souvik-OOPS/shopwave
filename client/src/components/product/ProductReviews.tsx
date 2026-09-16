import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { BadgeCheck, MessageSquare } from 'lucide-react';

import { useAppSelector } from '@/app/store';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { EmptyState, Spinner } from '@/components/ui/Feedback';
import { Input, Textarea } from '@/components/ui/Input';
import { Modal } from '@/components/ui/Modal';
import { Rating, RatingInput } from '@/components/ui/Rating';
import { reviewApi } from '@/lib/api';
import { queryKeys } from '@/lib/queryClient';
import { useProductReviews } from '@/hooks/useCatalog';
import { useToast } from '@/hooks/useToast';
import { cn, formatDate, initials } from '@/lib/utils';

const reviewSchema = z.object({
  rating: z.number().int().min(1, 'Please choose a rating').max(5),
  title: z.string().trim().max(120).optional(),
  comment: z.string().trim().min(1, 'Please write a few words').max(2000),
});

type ReviewValues = z.infer<typeof reviewSchema>;

function RatingBreakdown({
  distribution,
  total,
}: {
  distribution: Record<string, number>;
  total: number;
}) {
  return (
    <ul className="space-y-1.5">
      {[5, 4, 3, 2, 1].map((star) => {
        const count = distribution[String(star)] ?? 0;
        const percentage = total > 0 ? (count / total) * 100 : 0;

        return (
          <li key={star} className="flex items-center gap-2.5 text-xs">
            <span className="w-8 shrink-0 text-ink-600">{star}★</span>
            <div className="h-2 flex-1 overflow-hidden rounded-full bg-ink-100">
              <div
                className="h-full rounded-full bg-amber-400"
                style={{ width: `${percentage}%` }}
                aria-hidden="true"
              />
            </div>
            <span className="w-8 shrink-0 text-right text-ink-500">{count}</span>
          </li>
        );
      })}
    </ul>
  );
}

export function ProductReviews({ productId, slug }: { productId: string; slug: string }) {
  const isAuthenticated = useAppSelector((state) => state.auth.status === 'authenticated');
  const toast = useToast();
  const client = useQueryClient();

  const [sort, setSort] = useState('newest');
  const [formOpen, setFormOpen] = useState(false);

  const { data, isLoading } = useProductReviews(slug, { sort, limit: 10 });

  /**
   * The server decides who may review — a customer must have a delivered order for
   * this product. The UI asks, rather than guessing, so the button state always matches
   * what the API would actually allow.
   */
  const { data: eligibility } = useQuery({
    queryKey: queryKeys.reviews.eligibility(productId),
    queryFn: () => reviewApi.eligibility(productId),
    enabled: isAuthenticated,
  });

  const {
    register,
    handleSubmit,
    setValue,
    watch,
    reset,
    formState: { errors },
  } = useForm<ReviewValues>({
    resolver: zodResolver(reviewSchema),
    defaultValues: { rating: 0, comment: '' },
  });

  const mutation = useMutation({
    mutationFn: (values: ReviewValues) =>
      reviewApi.create({
        productId,
        rating: values.rating,
        comment: values.comment,
        ...(values.title ? { title: values.title } : {}),
      }),
    onSuccess: () => {
      toast.success('Thanks for your review');
      setFormOpen(false);
      reset({ rating: 0, comment: '', title: '' });
      void client.invalidateQueries({ queryKey: ['reviews'] });
      void client.invalidateQueries({ queryKey: queryKeys.products.detail(slug) });
    },
    onError: (error) => toast.error(error),
  });

  const summary = data?.summary;
  const reviews = data?.reviews ?? [];

  return (
    <section className="mt-14 border-t border-ink-200 pt-10">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h2 className="text-heading text-ink-900">Customer reviews</h2>

        {isAuthenticated && eligibility?.canReview && (
          <Button onClick={() => setFormOpen(true)}>Write a review</Button>
        )}
        {isAuthenticated && eligibility?.hasReviewed && (
          <Badge tone="success">You reviewed this product</Badge>
        )}
        {isAuthenticated && !eligibility?.hasPurchased && !eligibility?.hasReviewed && (
          <p className="text-sm text-ink-500">Only verified buyers can review this product.</p>
        )}
      </div>

      {isLoading ? (
        <div className="flex justify-center py-12">
          <Spinner />
        </div>
      ) : (
        <div className="mt-8 grid gap-10 lg:grid-cols-[18rem_1fr]">
          <div>
            <div className="rounded-2xl border border-ink-200 p-5">
              <div className="flex items-baseline gap-2">
                <span className="text-4xl font-bold text-ink-900">
                  {(summary?.ratingAverage ?? 0).toFixed(1)}
                </span>
                <span className="text-sm text-ink-500">out of 5</span>
              </div>
              <Rating value={summary?.ratingAverage ?? 0} size="md" className="mt-2" />
              <p className="mt-1 text-sm text-ink-500">
                Based on {summary?.reviewCount ?? 0} review{summary?.reviewCount === 1 ? '' : 's'}
              </p>

              {summary && summary.reviewCount > 0 && (
                <div className="mt-5">
                  <RatingBreakdown distribution={summary.distribution} total={summary.reviewCount} />
                </div>
              )}
            </div>
          </div>

          <div>
            {reviews.length > 0 && (
              <div className="mb-5 flex justify-end">
                <label className="sr-only" htmlFor="review-sort">
                  Sort reviews
                </label>
                <select
                  id="review-sort"
                  value={sort}
                  onChange={(event) => setSort(event.target.value)}
                  className="input-base h-9 w-auto py-0 text-sm"
                >
                  <option value="newest">Most recent</option>
                  <option value="helpful">Most helpful</option>
                  <option value="highest">Highest rated</option>
                  <option value="lowest">Lowest rated</option>
                </select>
              </div>
            )}

            {reviews.length === 0 ? (
              <EmptyState
                icon={<MessageSquare className="h-7 w-7" />}
                title="No reviews yet"
                description="Be the first to share your experience with this product."
              />
            ) : (
              <ul className="divide-y divide-ink-100">
                {reviews.map((review) => (
                  <li key={review.id} className="py-6 first:pt-0">
                    <div className="flex items-start gap-3">
                      <span
                        className={cn(
                          'flex h-10 w-10 shrink-0 items-center justify-center rounded-full',
                          'bg-ink-100 text-sm font-semibold text-ink-600',
                        )}
                        aria-hidden="true"
                      >
                        {review.author.avatarUrl ? (
                          <img
                            src={review.author.avatarUrl}
                            alt=""
                            className="h-full w-full rounded-full object-cover"
                          />
                        ) : (
                          initials(review.author.name)
                        )}
                      </span>

                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="text-sm font-semibold text-ink-900">{review.author.name}</span>
                          {review.isVerifiedPurchase && (
                            <Badge
                              tone="success"
                              icon={<BadgeCheck className="h-3 w-3" aria-hidden="true" />}
                            >
                              Verified purchase
                            </Badge>
                          )}
                          <span className="text-xs text-ink-400">{formatDate(review.createdAt)}</span>
                        </div>

                        <Rating value={review.rating} className="mt-1.5" />

                        {review.title && (
                          <h3 className="mt-2 text-sm font-semibold text-ink-900">{review.title}</h3>
                        )}
                        <p className="mt-1.5 whitespace-pre-line text-sm leading-relaxed text-ink-600">
                          {review.comment}
                        </p>

                        {review.images.length > 0 && (
                          <ul className="mt-3 flex gap-2">
                            {review.images.map((image) => (
                              <li key={image.id}>
                                <img
                                  src={image.url}
                                  alt=""
                                  loading="lazy"
                                  className="h-16 w-16 rounded-lg object-cover"
                                />
                              </li>
                            ))}
                          </ul>
                        )}
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}

      <Modal
        open={formOpen}
        onClose={() => setFormOpen(false)}
        title="Write a review"
        description="Your review helps other shoppers decide."
        footer={
          <div className="flex justify-end gap-3">
            <Button variant="outline" onClick={() => setFormOpen(false)}>
              Cancel
            </Button>
            <Button
              loading={mutation.isPending}
              onClick={handleSubmit((values) => mutation.mutate(values))}
            >
              Submit review
            </Button>
          </div>
        }
      >
        <form className="space-y-5" onSubmit={handleSubmit((values) => mutation.mutate(values))}>
          <div>
            <span className="mb-2 block text-sm font-medium text-ink-800">Your rating</span>
            <RatingInput
              value={watch('rating')}
              onChange={(value) => setValue('rating', value, { shouldValidate: true })}
              error={errors.rating?.message}
            />
          </div>

          <Input
            label="Title"
            placeholder="Sum it up in a few words"
            error={errors.title?.message}
            {...register('title')}
          />

          <Textarea
            label="Your review"
            rows={5}
            placeholder="What did you like or dislike? How did it hold up?"
            error={errors.comment?.message}
            {...register('comment')}
          />
        </form>
      </Modal>
    </section>
  );
}
