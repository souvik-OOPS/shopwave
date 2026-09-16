import { z } from 'zod';

import { booleanQuery, idSchema, nonEmptyString, slugSchema } from '@/schemas/common.schema';

export const createCategorySchema = z
  .object({
    name: nonEmptyString(80, 'Category name'),
    slug: slugSchema.optional(),
    description: z.string().trim().max(1000).optional(),
    imageUrl: z.string().url().max(500).optional(),
    parentId: idSchema.nullable().optional(),
    isActive: z.boolean().default(true),
    sortOrder: z.number().int().min(0).max(9999).default(0),
  })
  .strict();

export const updateCategorySchema = createCategorySchema.partial().strict();

export const categoryQuerySchema = z
  .object({
    includeInactive: booleanQuery.optional(),
    parentId: idSchema.optional(),
    tree: booleanQuery.optional(),
  })
  .partial();

export type CreateCategoryInput = z.infer<typeof createCategorySchema>;
export type UpdateCategoryInput = z.infer<typeof updateCategorySchema>;
export type CategoryQuery = z.infer<typeof categoryQuerySchema>;
