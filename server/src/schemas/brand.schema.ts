import { z } from 'zod';

import { booleanQuery, nonEmptyString, slugSchema } from '@/schemas/common.schema';

export const createBrandSchema = z
  .object({
    name: nonEmptyString(80, 'Brand name'),
    slug: slugSchema.optional(),
    description: z.string().trim().max(1000).optional(),
    logoUrl: z.string().url().max(500).optional(),
    website: z.string().url().max(500).optional(),
    isActive: z.boolean().default(true),
  })
  .strict();

export const updateBrandSchema = createBrandSchema.partial().strict();

export const brandQuerySchema = z.object({ includeInactive: booleanQuery.optional() }).partial();

export type CreateBrandInput = z.infer<typeof createBrandSchema>;
export type UpdateBrandInput = z.infer<typeof updateBrandSchema>;
export type BrandQuery = z.infer<typeof brandQuerySchema>;
