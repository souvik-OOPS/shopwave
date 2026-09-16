import { Router } from 'express';

import { couponCartController } from '@/controllers/order.controller';
import { couponController } from '@/controllers/admin.controller';
import { requireAuth, requireRole } from '@/middleware/auth';
import { writeLimiter } from '@/middleware/rateLimit';
import { validate, validateBody, validateQuery } from '@/middleware/validate';
import { idParamSchema } from '@/schemas/common.schema';
import {
  couponQuerySchema,
  createCouponSchema,
  updateCouponSchema,
  validateCouponSchema,
} from '@/schemas/coupon.schema';

const router = Router();

/** Customer-facing: check a code against my cart. */
router.post(
  '/validate',
  requireAuth,
  writeLimiter,
  validateBody(validateCouponSchema),
  couponCartController.preview,
);

// Admin CRUD
router.get(
  '/',
  requireAuth,
  requireRole('ADMIN', 'STAFF'),
  validateQuery(couponQuerySchema),
  couponController.list,
);

router.get(
  '/:id',
  requireAuth,
  requireRole('ADMIN', 'STAFF'),
  validate({ params: idParamSchema }),
  couponController.get,
);

router.post(
  '/',
  requireAuth,
  requireRole('ADMIN'),
  writeLimiter,
  validateBody(createCouponSchema),
  couponController.create,
);

router.patch(
  '/:id',
  requireAuth,
  requireRole('ADMIN'),
  writeLimiter,
  validate({ params: idParamSchema, body: updateCouponSchema }),
  couponController.update,
);

router.delete(
  '/:id',
  requireAuth,
  requireRole('ADMIN'),
  validate({ params: idParamSchema }),
  couponController.remove,
);

export default router;
