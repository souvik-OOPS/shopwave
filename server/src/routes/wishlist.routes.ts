import { Router } from 'express';
import { z } from 'zod';

import { wishlistController } from '@/controllers/cart.controller';
import { requireAuth } from '@/middleware/auth';
import { validate } from '@/middleware/validate';
import { idSchema } from '@/schemas/common.schema';

const router = Router();

router.use(requireAuth);

const productParamSchema = z.object({ productId: idSchema });

const moveToCartSchema = z
  .object({
    variantId: idSchema.nullable().optional(),
    quantity: z.number().int().min(1).max(10).default(1),
  })
  .strict();

const addSchema = z.object({ variantId: idSchema.nullable().optional() }).strict();

router.get('/', wishlistController.get);
router.get('/ids', wishlistController.ids);
router.post('/:productId', validate({ params: productParamSchema, body: addSchema }), wishlistController.add);
router.delete('/:productId', validate({ params: productParamSchema }), wishlistController.remove);
router.delete('/', wishlistController.clear);
router.post(
  '/:productId/move-to-cart',
  validate({ params: productParamSchema, body: moveToCartSchema }),
  wishlistController.moveToCart,
);

export default router;
