import { z } from 'zod';

import { booleanQuery, paginationSchema } from '@/schemas/common.schema';

export const adminUserQuerySchema = paginationSchema.extend({
  q: z.string().trim().max(80).optional(),
  role: z.enum(['CUSTOMER', 'STAFF', 'ADMIN']).optional(),
  isActive: booleanQuery.optional(),
  sort: z.enum(['newest', 'oldest', 'name', 'orders']).default('newest'),
});

/**
 * Role and activation are the only user fields an admin may change through the API.
 * Names, emails and passwords stay under the account owner's control.
 */
export const adminUpdateUserSchema = z
  .object({
    role: z.enum(['CUSTOMER', 'STAFF', 'ADMIN']).optional(),
    isActive: z.boolean().optional(),
  })
  .strict()
  .refine((data) => Object.keys(data).length > 0, { message: 'Provide at least one field to update' });

export type AdminUserQuery = z.infer<typeof adminUserQuerySchema>;
export type AdminUpdateUserInput = z.infer<typeof adminUpdateUserSchema>;
