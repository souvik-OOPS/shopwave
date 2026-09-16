import type { Request, Response } from 'express';

import { reviewService } from '@/services/review.service';
import type { CreateReviewInput, ReviewQuery, UpdateReviewInput } from '@/schemas/review.schema';
import { asyncHandler } from '@/utils/asyncHandler';
import { buildPaginationMeta, sendCreated, sendNoContent, sendSuccess } from '@/utils/response';
import type { AuthenticatedRequest } from '@/types';

export const reviewController = {
  listForProduct: asyncHandler(async (req: Request, res: Response) => {
    const { items, total, page, limit, summary } = await reviewService.listForProduct(
      req.params.slug,
      req.query as unknown as ReviewQuery,
    );
    return sendSuccess(
      res,
      { reviews: items, summary },
      { meta: buildPaginationMeta(total, page, limit) },
    );
  }),

  listMine: asyncHandler(async (req: Request, res: Response) => {
    const { user } = req as AuthenticatedRequest;
    const result = await reviewService.listMine(user.id, req.query as unknown as ReviewQuery);
    return sendSuccess(res, { reviews: result.items });
  }),

  /** Tells the UI whether to show "Write a review", "Edit yours", or nothing at all. */
  eligibility: asyncHandler(async (req: Request, res: Response) => {
    const { user } = req as AuthenticatedRequest;
    const eligibility = await reviewService.eligibility(user.id, req.params.productId);
    return sendSuccess(res, eligibility);
  }),

  create: asyncHandler(async (req: Request, res: Response) => {
    const { user } = req as AuthenticatedRequest;
    const review = await reviewService.create(user.id, req.body as CreateReviewInput);
    return sendCreated(res, { review }, 'Thanks for your review');
  }),

  update: asyncHandler(async (req: Request, res: Response) => {
    const { user } = req as AuthenticatedRequest;
    const review = await reviewService.update(
      user.id,
      req.params.id,
      req.body as UpdateReviewInput,
    );
    return sendSuccess(res, { review }, { message: 'Review updated' });
  }),

  remove: asyncHandler(async (req: Request, res: Response) => {
    const { user } = req as AuthenticatedRequest;
    const isStaff = user.role === 'ADMIN' || user.role === 'STAFF';
    await reviewService.remove(user.id, req.params.id, isStaff);
    return sendNoContent(res);
  }),
};
