import { Router } from 'express';

import { paymentController } from '@/controllers/order.controller';
import { requireAuth } from '@/middleware/auth';
import { checkoutLimiter } from '@/middleware/rateLimit';
import { validateBody } from '@/middleware/validate';
import { createPaymentOrderSchema, verifyPaymentSchema } from '@/schemas/order.schema';

const router = Router();

router.get('/config', paymentController.config);

router.post(
  '/create-order',
  requireAuth,
  checkoutLimiter,
  validateBody(createPaymentOrderSchema),
  paymentController.createOrder,
);

router.post(
  '/verify',
  requireAuth,
  checkoutLimiter,
  validateBody(verifyPaymentSchema),
  paymentController.verify,
);

/**
 * No `requireAuth` and no body schema: the caller is Razorpay, not a signed-in user,
 * and authentication here *is* the HMAC signature over the raw body. Adding a Zod
 * schema would also be counterproductive — the payload shape is Razorpay's to change.
 */
router.post('/webhook', paymentController.webhook);

export default router;
