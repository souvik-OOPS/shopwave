import { z } from 'zod';

import { couponCodeSchema } from '@/schemas/coupon.schema';
import { idSchema, nonEmptyString, paginationSchema } from '@/schemas/common.schema';

const ORDER_STATUSES = [
  'PENDING',
  'CONFIRMED',
  'PROCESSING',
  'SHIPPED',
  'OUT_FOR_DELIVERY',
  'DELIVERED',
  'CANCELLED',
  'RETURN_REQUESTED',
  'RETURNED',
  'REFUNDED',
] as const;

/**
 * Checkout takes an address id and (optionally) a coupon code. It deliberately accepts
 * no prices, no totals and no item list — the server reads all of that from the cart
 * and the catalog. There is no field here through which a client could influence money.
 */
export const checkoutSchema = z
  .object({
    addressId: idSchema,
    couponCode: couponCodeSchema.optional(),
    paymentMethod: z.enum(['RAZORPAY', 'COD']).default('RAZORPAY'),
    customerNote: z.string().trim().max(500).optional(),
  })
  .strict();

export const orderQuerySchema = paginationSchema.extend({
  status: z.enum(ORDER_STATUSES).optional(),
});

export const adminOrderQuerySchema = paginationSchema.extend({
  q: z.string().trim().max(80).optional(),
  status: z.enum(ORDER_STATUSES).optional(),
  paymentStatus: z.enum(['PENDING', 'AUTHORIZED', 'PAID', 'FAILED', 'REFUNDED', 'PARTIALLY_REFUNDED']).optional(),
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
});

export const cancelOrderSchema = z
  .object({ reason: z.string().trim().max(300).optional() })
  .strict();

export const returnOrderSchema = z
  .object({ reason: nonEmptyString(300, 'Return reason') })
  .strict();

export const updateOrderStatusSchema = z
  .object({
    status: z.enum(ORDER_STATUSES),
    note: z.string().trim().max(300).optional(),
  })
  .strict();

export const createPaymentOrderSchema = z.object({ orderId: idSchema }).strict();

/**
 * The three fields Razorpay's checkout widget hands back. They are treated as untrusted
 * input: the signature is recomputed server-side before anything is marked paid.
 */
export const verifyPaymentSchema = z
  .object({
    razorpay_order_id: z.string().min(1).max(120),
    razorpay_payment_id: z.string().min(1).max(120),
    razorpay_signature: z.string().min(1).max(256),
  })
  .strict();

export type CheckoutInput = z.infer<typeof checkoutSchema>;
export type OrderQuery = z.infer<typeof orderQuerySchema>;
export type AdminOrderQuery = z.infer<typeof adminOrderQuerySchema>;
export type CancelOrderInput = z.infer<typeof cancelOrderSchema>;
export type ReturnOrderInput = z.infer<typeof returnOrderSchema>;
export type UpdateOrderStatusInput = z.infer<typeof updateOrderStatusSchema>;
export type VerifyPaymentInput = z.infer<typeof verifyPaymentSchema>;
