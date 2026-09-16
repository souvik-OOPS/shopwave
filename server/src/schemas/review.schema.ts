import { z } from 'zod';

import { idSchema, nonEmptyString, paginationSchema } from '@/schemas/common.schema';

/**
 * Note what is absent: `isVerifiedPurchase`, `status` and `userId`. All three are
 * derived server-side. A client that posts them gets a 422 from `.strict()` rather
 * than a self-awarded "Verified Purchase" badge.
 */
export const createReviewSchema = z
  .object({
    productId: idSchema,
    rating: z.number().int().min(1, 'Rating must be between 1 and 5').max(5, 'Rating must be between 1 and 5'),
    title: z.string().trim().max(120).optional(),
    comment: nonEmptyString(2000, 'Review'),
    images: z.array(z.string().url().max(500)).max(5).default([]),
  })
  .strict();

export const updateReviewSchema = z
  .object({
    rating: z.number().int().min(1).max(5).optional(),
    title: z.string().trim().max(120).nullable().optional(),
    comment: nonEmptyString(2000, 'Review').optional(),
    images: z.array(z.string().url().max(500)).max(5).optional(),
  })
  .strict()
  .refine((data) => Object.keys(data).length > 0, { message: 'Provide at least one field to update' });

export const reviewQuerySchema = paginationSchema.extend({
  rating: z.coerce.number().int().min(1).max(5).optional(),
  sort: z.enum(['newest', 'oldest', 'highest', 'lowest', 'helpful']).default('newest'),
  verifiedOnly: z
    .union([z.boolean(), z.string()])
    .transform((value) => (typeof value === 'boolean' ? value : value === 'true'))
    .optional(),
});

export const moderateReviewSchema = z
  .object({ status: z.enum(['PENDING', 'APPROVED', 'REJECTED']) })
  .strict();

export type CreateReviewInput = z.infer<typeof createReviewSchema>;
export type UpdateReviewInput = z.infer<typeof updateReviewSchema>;
export type ReviewQuery = z.infer<typeof reviewQuerySchema>;
