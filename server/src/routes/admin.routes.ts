import { Router } from 'express';
import { z } from 'zod';

import {
  adminReviewController,
  adminUserController,
  dashboardController,
} from '@/controllers/admin.controller';
import { orderController } from '@/controllers/order.controller';
import { requireAuth, requireRole } from '@/middleware/auth';
import { writeLimiter } from '@/middleware/rateLimit';
import { validate, validateQuery } from '@/middleware/validate';
import { idParamSchema } from '@/schemas/common.schema';
import { adminOrderQuerySchema, updateOrderStatusSchema } from '@/schemas/order.schema';
import { moderateReviewSchema, reviewQuerySchema } from '@/schemas/review.schema';
import { adminUpdateUserSchema, adminUserQuerySchema } from '@/schemas/user.schema';

const router = Router();

// Nothing under /admin is reachable without a staff or admin role.
router.use(requireAuth);

// ── Dashboard & analytics (STAFF may view) ─────────────────────────────────
router.get('/dashboard', requireRole('ADMIN', 'STAFF'), dashboardController.overview);
router.get('/dashboard/summary', requireRole('ADMIN', 'STAFF'), dashboardController.summary);
router.get('/analytics/revenue', requireRole('ADMIN', 'STAFF'), dashboardController.revenueSeries);
router.get('/analytics/best-sellers', requireRole('ADMIN', 'STAFF'), dashboardController.bestSellers);
router.get('/analytics/low-stock', requireRole('ADMIN', 'STAFF'), dashboardController.lowStock);

// ── Orders ─────────────────────────────────────────────────────────────────
router.get(
  '/orders',
  requireRole('ADMIN', 'STAFF'),
  validateQuery(adminOrderQuerySchema),
  orderController.adminList,
);
router.get(
  '/orders/:id',
  requireRole('ADMIN', 'STAFF'),
  validate({ params: idParamSchema }),
  orderController.adminGet,
);
router.patch(
  '/orders/:id/status',
  requireRole('ADMIN', 'STAFF'),
  writeLimiter,
  validate({ params: idParamSchema, body: updateOrderStatusSchema }),
  orderController.adminUpdateStatus,
);

// Money leaving the business is ADMIN-only.
router.post(
  '/orders/:id/refund',
  requireRole('ADMIN'),
  writeLimiter,
  validate({
    params: idParamSchema,
    body: z.object({ amount: z.number().positive().optional() }).strict(),
  }),
  orderController.adminRefund,
);

// ── Customers (ADMIN only — this exposes personal data) ────────────────────
router.get('/users', requireRole('ADMIN'), validateQuery(adminUserQuerySchema), adminUserController.list);
router.get('/users/stats', requireRole('ADMIN'), adminUserController.stats);
router.get('/users/:id', requireRole('ADMIN'), validate({ params: idParamSchema }), adminUserController.get);
router.patch(
  '/users/:id',
  requireRole('ADMIN'),
  writeLimiter,
  validate({ params: idParamSchema, body: adminUpdateUserSchema }),
  adminUserController.update,
);

// ── Review moderation ──────────────────────────────────────────────────────
router.get(
  '/reviews',
  requireRole('ADMIN', 'STAFF'),
  validateQuery(reviewQuerySchema.extend({ status: z.enum(['PENDING', 'APPROVED', 'REJECTED']).optional() })),
  adminReviewController.list,
);
router.patch(
  '/reviews/:id',
  requireRole('ADMIN', 'STAFF'),
  validate({ params: idParamSchema, body: moderateReviewSchema }),
  adminReviewController.moderate,
);

export default router;
