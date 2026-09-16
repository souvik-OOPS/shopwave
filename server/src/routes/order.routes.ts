import { Router } from 'express';

import { orderController } from '@/controllers/order.controller';
import { requireAuth } from '@/middleware/auth';
import { checkoutLimiter } from '@/middleware/rateLimit';
import { validate, validateBody, validateQuery } from '@/middleware/validate';
import { idParamSchema } from '@/schemas/common.schema';
import {
  cancelOrderSchema,
  checkoutSchema,
  orderQuerySchema,
  returnOrderSchema,
} from '@/schemas/order.schema';

const router = Router();

router.use(requireAuth);

router.get('/', validateQuery(orderQuerySchema), orderController.list);
router.get('/:id', validate({ params: idParamSchema }), orderController.get);

router.patch(
  '/:id/cancel',
  validate({ params: idParamSchema, body: cancelOrderSchema }),
  orderController.cancel,
);

router.patch(
  '/:id/return',
  validate({ params: idParamSchema, body: returnOrderSchema }),
  orderController.requestReturn,
);

export default router;

/** Mounted separately at /api/checkout — it creates an order, it does not list them. */
export const checkoutRouter = Router();
checkoutRouter.post(
  '/',
  requireAuth,
  checkoutLimiter,
  validateBody(checkoutSchema),
  orderController.checkout,
);
