import { Router } from 'express';

import { cartController } from '@/controllers/cart.controller';
import { requireAuth } from '@/middleware/auth';
import { validate, validateBody, validateQuery } from '@/middleware/validate';
import { addToCartSchema, cartQuerySchema, updateCartItemSchema } from '@/schemas/cart.schema';
import { idParamSchema } from '@/schemas/common.schema';

const router = Router();

// The whole cart is per-user state; nothing here is reachable anonymously.
router.use(requireAuth);

router.get('/', validateQuery(cartQuerySchema), cartController.get);
router.post('/items', validateBody(addToCartSchema), cartController.addItem);
router.patch(
  '/items/:id',
  validate({ params: idParamSchema, body: updateCartItemSchema }),
  cartController.updateItem,
);
router.delete('/items/:id', validate({ params: idParamSchema }), cartController.removeItem);
router.delete('/', cartController.clear);
router.post('/reconcile', cartController.reconcile);

export default router;
