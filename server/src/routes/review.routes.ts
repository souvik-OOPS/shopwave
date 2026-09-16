import { Router } from 'express';

import { reviewController } from '@/controllers/review.controller';
import { requireAuth } from '@/middleware/auth';
import { writeLimiter } from '@/middleware/rateLimit';
import { validate, validateBody, validateQuery } from '@/middleware/validate';
import { idParamSchema, idSchema, slugParamSchema } from '@/schemas/common.schema';
import { createReviewSchema, reviewQuerySchema, updateReviewSchema } from '@/schemas/review.schema';
import { z } from 'zod';

const router = Router();

// Public: reviews for a product
router.get(
  '/product/:slug',
  validate({ params: slugParamSchema, query: reviewQuerySchema }),
  reviewController.listForProduct,
);

// Authenticated
router.get('/mine', requireAuth, validateQuery(reviewQuerySchema), reviewController.listMine);
router.get(
  '/eligibility/:productId',
  requireAuth,
  validate({ params: z.object({ productId: idSchema }) }),
  reviewController.eligibility,
);

router.post('/', requireAuth, writeLimiter, validateBody(createReviewSchema), reviewController.create);
router.patch(
  '/:id',
  requireAuth,
  writeLimiter,
  validate({ params: idParamSchema, body: updateReviewSchema }),
  reviewController.update,
);
router.delete('/:id', requireAuth, validate({ params: idParamSchema }), reviewController.remove);

export default router;
