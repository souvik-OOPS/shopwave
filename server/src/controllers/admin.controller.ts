import type { Request, Response } from 'express';

import { couponService } from '@/services/coupon.service';
import { dashboardService } from '@/services/dashboard.service';
import { reviewService } from '@/services/review.service';
import { userService } from '@/services/user.service';
import type { CouponQuery, CreateCouponInput, UpdateCouponInput } from '@/schemas/coupon.schema';
import type { ReviewQuery } from '@/schemas/review.schema';
import type { AdminUpdateUserInput, AdminUserQuery } from '@/schemas/user.schema';
import { asyncHandler } from '@/utils/asyncHandler';
import { buildPaginationMeta, sendCreated, sendSuccess } from '@/utils/response';
import type { AuthenticatedRequest } from '@/types';

export const dashboardController = {
  overview: asyncHandler(async (_req: Request, res: Response) => {
    const dashboard = await dashboardService.fullDashboard();
    return sendSuccess(res, dashboard);
  }),

  summary: asyncHandler(async (_req: Request, res: Response) => {
    const summary = await dashboardService.summary();
    return sendSuccess(res, summary);
  }),

  revenueSeries: asyncHandler(async (req: Request, res: Response) => {
    const days = Number((req.query as { days?: string }).days ?? 30);
    const series = await dashboardService.revenueSeries(Number.isFinite(days) ? days : 30);
    return sendSuccess(res, { series });
  }),

  bestSellers: asyncHandler(async (_req: Request, res: Response) => {
    const products = await dashboardService.bestSellers(10);
    return sendSuccess(res, { products });
  }),

  lowStock: asyncHandler(async (_req: Request, res: Response) => {
    const products = await dashboardService.lowStockProducts(20);
    return sendSuccess(res, { products });
  }),
};

export const adminUserController = {
  list: asyncHandler(async (req: Request, res: Response) => {
    const { items, total, page, limit } = await userService.list(req.query as unknown as AdminUserQuery);
    return sendSuccess(res, { users: items }, { meta: buildPaginationMeta(total, page, limit) });
  }),

  get: asyncHandler(async (req: Request, res: Response) => {
    const user = await userService.get(req.params.id);
    return sendSuccess(res, { user });
  }),

  update: asyncHandler(async (req: Request, res: Response) => {
    const { user: actor } = req as AuthenticatedRequest;
    const user = await userService.update(
      actor.id,
      req.params.id,
      req.body as AdminUpdateUserInput,
    );
    return sendSuccess(res, { user }, { message: 'User updated' });
  }),

  stats: asyncHandler(async (_req: Request, res: Response) => {
    const stats = await userService.stats();
    return sendSuccess(res, stats);
  }),
};

export const couponController = {
  list: asyncHandler(async (req: Request, res: Response) => {
    const { items, total, page, limit } = await couponService.list(req.query as unknown as CouponQuery);
    return sendSuccess(res, { coupons: items }, { meta: buildPaginationMeta(total, page, limit) });
  }),

  get: asyncHandler(async (req: Request, res: Response) => {
    const coupon = await couponService.get(req.params.id);
    return sendSuccess(res, { coupon });
  }),

  create: asyncHandler(async (req: Request, res: Response) => {
    const coupon = await couponService.create(req.body as CreateCouponInput);
    return sendCreated(res, { coupon }, 'Coupon created');
  }),

  update: asyncHandler(async (req: Request, res: Response) => {
    const coupon = await couponService.update(req.params.id, req.body as UpdateCouponInput);
    return sendSuccess(res, { coupon }, { message: 'Coupon updated' });
  }),

  remove: asyncHandler(async (req: Request, res: Response) => {
    const result = await couponService.remove(req.params.id);
    return sendSuccess(res, result, {
      message: result.deleted
        ? 'Coupon deleted'
        : 'Coupon has been used before, so it was deactivated instead of deleted',
    });
  }),
};

export const adminReviewController = {
  list: asyncHandler(async (req: Request, res: Response) => {
    const query = req.query as unknown as ReviewQuery & { status?: 'PENDING' | 'APPROVED' | 'REJECTED' };
    const { items, total, page, limit } = await reviewService.listAdmin(query);
    return sendSuccess(res, { reviews: items }, { meta: buildPaginationMeta(total, page, limit) });
  }),

  moderate: asyncHandler(async (req: Request, res: Response) => {
    const { status } = req.body as { status: 'PENDING' | 'APPROVED' | 'REJECTED' };
    const review = await reviewService.moderate(req.params.id, status);
    return sendSuccess(res, { review }, { message: 'Review updated' });
  }),
};
