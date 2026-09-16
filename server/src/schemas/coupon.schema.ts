import { z } from 'zod';

import { booleanQuery, moneySchema, paginationSchema } from '@/schemas/common.schema';

export const couponCodeSchema = z
  .string()
  .trim()
  .toUpperCase()
  .min(3, 'Coupon code must be at least 3 characters')
  .max(40)
  .regex(/^[A-Z0-9_-]+$/, 'Coupon codes may contain letters, numbers, hyphens and underscores');

export const createCouponSchema = z
  .object({
    code: couponCodeSchema,
    description: z.string().trim().max(300).optional(),
    type: z.enum(['PERCENTAGE', 'FIXED']),
    value: moneySchema.refine((value) => value > 0, 'Discount value must be greater than zero'),
    minOrderAmount: moneySchema.optional(),
    maxDiscountAmount: moneySchema.optional(),
    usageLimit: z.number().int().min(1).max(1_000_000).nullable().optional(),
    perUserLimit: z.number().int().min(1).max(1000).nullable().optional(),
    startsAt: z.coerce.date().optional(),
    expiresAt: z.coerce.date().nullable().optional(),
    isActive: z.boolean().default(true),
  })
  .strict()
  .refine((data) => data.type !== 'PERCENTAGE' || data.value <= 100, {
    message: 'A percentage discount cannot exceed 100%',
    path: ['value'],
  })
  .refine((data) => !data.expiresAt || !data.startsAt || data.expiresAt > data.startsAt, {
    message: 'Expiry must be after the start date',
    path: ['expiresAt'],
  });

export const updateCouponSchema = z
  .object({
    description: z.string().trim().max(300).nullable().optional(),
    type: z.enum(['PERCENTAGE', 'FIXED']).optional(),
    value: moneySchema.optional(),
    minOrderAmount: moneySchema.nullable().optional(),
    maxDiscountAmount: moneySchema.nullable().optional(),
    usageLimit: z.number().int().min(1).max(1_000_000).nullable().optional(),
    perUserLimit: z.number().int().min(1).max(1000).nullable().optional(),
    startsAt: z.coerce.date().optional(),
    expiresAt: z.coerce.date().nullable().optional(),
    isActive: z.boolean().optional(),
  })
  .strict()
  .refine((data) => Object.keys(data).length > 0, { message: 'Provide at least one field to update' });

export const couponQuerySchema = paginationSchema.extend({
  q: z.string().trim().max(60).optional(),
  isActive: booleanQuery.optional(),
  includeExpired: booleanQuery.optional(),
});

export const validateCouponSchema = z.object({ code: couponCodeSchema }).strict();

export type CreateCouponInput = z.infer<typeof createCouponSchema>;
export type UpdateCouponInput = z.infer<typeof updateCouponSchema>;
export type CouponQuery = z.infer<typeof couponQuerySchema>;
