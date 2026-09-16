import { z } from 'zod';

import { CART } from '@/config/constants';
import { idSchema } from '@/schemas/common.schema';

export const addToCartSchema = z
  .object({
    productId: idSchema,
    variantId: idSchema.nullable().optional(),
    quantity: z.number().int().min(1).max(CART.MAX_QUANTITY_PER_ITEM).default(1),
  })
  .strict();

export const updateCartItemSchema = z
  .object({
    // 0 is accepted and treated as "remove", which keeps stepper UIs simple.
    quantity: z.number().int().min(0).max(CART.MAX_QUANTITY_PER_ITEM),
  })
  .strict();

export const applyCouponSchema = z
  .object({ code: z.string().trim().min(3).max(40).toUpperCase() })
  .strict();

/**
 * `GET /cart?couponCode=…`. The cart screen and the checkout summary must show the same
 * money the order will be created with, and only the server knows how a discount changes
 * shipping and GST — so the code is sent along and the totals come back already correct.
 */
export const cartQuerySchema = z
  .object({ couponCode: z.string().trim().min(3).max(40).toUpperCase().optional() })
  .strict();

export type AddToCartInput = z.infer<typeof addToCartSchema>;
export type CartQuery = z.infer<typeof cartQuerySchema>;
export type UpdateCartItemInput = z.infer<typeof updateCartItemSchema>;
export type ApplyCouponInput = z.infer<typeof applyCouponSchema>;
