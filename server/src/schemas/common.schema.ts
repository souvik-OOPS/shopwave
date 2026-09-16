import { z } from 'zod';

import { PAGINATION } from '@/config/constants';

/** cuid()s are what Prisma generates; validating the shape rejects junk before a DB hit. */
export const idSchema = z.string().min(1, 'Identifier is required').max(64);

export const idParamSchema = z.object({ id: idSchema });

export const slugSchema = z
  .string()
  .min(1)
  .max(200)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'Invalid slug format');

export const slugParamSchema = z.object({ slug: slugSchema });

export const paginationSchema = z.object({
  page: z.coerce.number().int().min(1).default(PAGINATION.DEFAULT_PAGE),
  limit: z.coerce.number().int().min(1).max(PAGINATION.MAX_LIMIT).default(PAGINATION.DEFAULT_LIMIT),
});

export const emailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .email('Enter a valid email address')
  .max(255);

/**
 * Password policy. Length does more for entropy than symbol classes, but a minimum
 * of one lower, one upper and one digit blocks the most common weak choices.
 */
export const passwordSchema = z
  .string()
  .min(8, 'Password must be at least 8 characters')
  .max(128, 'Password must be at most 128 characters')
  .regex(/[a-z]/, 'Password must contain a lowercase letter')
  .regex(/[A-Z]/, 'Password must contain an uppercase letter')
  .regex(/[0-9]/, 'Password must contain a number');

/** Indian mobile numbers, optionally with +91 / 0 prefix. */
export const phoneSchema = z
  .string()
  .trim()
  .regex(/^(?:\+91[-\s]?|0)?[6-9]\d{9}$/, 'Enter a valid 10-digit Indian mobile number');

export const postalCodeSchema = z
  .string()
  .trim()
  .regex(/^[1-9][0-9]{5}$/, 'Enter a valid 6-digit PIN code');

export const nonEmptyString = (max: number, label = 'This field') =>
  z.string().trim().min(1, `${label} is required`).max(max, `${label} must be at most ${max} characters`);

/** Money arriving from an admin form: non-negative, at most 2 decimal places. */
export const moneySchema = z
  .number()
  .nonnegative('Amount cannot be negative')
  .max(99_999_999, 'Amount is too large')
  .refine((value) => Number.isFinite(value) && Math.round(value * 100) === Number((value * 100).toFixed(0)), {
    message: 'Amount can have at most 2 decimal places',
  });

export const quantitySchema = z.coerce.number().int().min(1, 'Quantity must be at least 1');

/**
 * Accepts `?tags=a,b` and `?tags=a&tags=b` — both are common from query builders.
 * Generic in the element schema so the inferred output stays `T[]` rather than `any[]`.
 */
export const csvArray = <T extends z.ZodTypeAny>(inner: T) =>
  z
    .union([z.string(), z.array(z.string())])
    .transform((value) => (Array.isArray(value) ? value : value.split(',')))
    .transform((values) => values.map((v) => v.trim()).filter(Boolean))
    .pipe(z.array(inner));

export const booleanQuery = z
  .union([z.boolean(), z.string()])
  .transform((value) => (typeof value === 'boolean' ? value : ['true', '1', 'yes'].includes(value.toLowerCase())));

export const sortDirectionSchema = z.enum(['asc', 'desc']).default('desc');
