import { z } from 'zod';

import {
  booleanQuery,
  csvArray,
  idSchema,
  moneySchema,
  nonEmptyString,
  paginationSchema,
  slugSchema,
} from '@/schemas/common.schema';

export const productSortSchema = z
  .enum(['newest', 'oldest', 'price_asc', 'price_desc', 'rating', 'popular', 'name_asc', 'name_desc'])
  .default('newest');

export const productQuerySchema = paginationSchema
  .extend({
    /** Free-text search across name, description, SKU, tags, brand and category. */
    q: z.string().trim().min(1).max(120).optional(),
    category: slugSchema.optional(),
    categories: csvArray(slugSchema).optional(),
    brand: slugSchema.optional(),
    brands: csvArray(slugSchema).optional(),
    minPrice: z.coerce.number().nonnegative().optional(),
    maxPrice: z.coerce.number().nonnegative().optional(),
    minRating: z.coerce.number().min(0).max(5).optional(),
    inStock: booleanQuery.optional(),
    featured: booleanQuery.optional(),
    tags: csvArray(z.string().min(1).max(40)).optional(),
    sort: productSortSchema,
  })
  .refine(
    (data) => data.minPrice === undefined || data.maxPrice === undefined || data.minPrice <= data.maxPrice,
    { message: 'minPrice cannot be greater than maxPrice', path: ['minPrice'] },
  );

/** Admin listing sees drafts and archived rows, which the storefront query never does. */
export const adminProductQuerySchema = paginationSchema.extend({
  q: z.string().trim().min(1).max(120).optional(),
  status: z.enum(['DRAFT', 'ACTIVE', 'ARCHIVED']).optional(),
  category: idSchema.optional(),
  brand: idSchema.optional(),
  lowStock: booleanQuery.optional(),
  includeDeleted: booleanQuery.optional(),
  sort: productSortSchema,
});

const variantSchema = z
  .object({
    name: nonEmptyString(80, 'Variant name'),
    sku: z.string().trim().min(1).max(60).optional(),
    price: moneySchema.optional(),
    discountPrice: moneySchema.optional(),
    imageUrl: z.string().url().max(500).optional(),
    attributes: z.record(z.string().max(40), z.string().max(120)).default({}),
    position: z.number().int().min(0).default(0),
    isActive: z.boolean().default(true),
    stock: z.number().int().min(0).default(0),
  })
  .strict();

const attributeSchema = z
  .object({
    name: nonEmptyString(40, 'Attribute name'),
    value: nonEmptyString(200, 'Attribute value'),
    position: z.number().int().min(0).default(0),
  })
  .strict();

const imageSchema = z
  .object({
    url: z.string().url().max(500),
    publicId: z.string().max(200).optional(),
    alt: z.string().max(200).optional(),
    position: z.number().int().min(0).default(0),
    isPrimary: z.boolean().default(false),
  })
  .strict();

export const createProductSchema = z
  .object({
    name: nonEmptyString(200, 'Product name'),
    slug: slugSchema.optional(),
    sku: z.string().trim().min(1).max(60).optional(),
    description: nonEmptyString(10_000, 'Description'),
    shortDescription: z.string().trim().max(300).optional(),
    price: moneySchema,
    discountPrice: moneySchema.optional(),
    categoryId: idSchema,
    brandId: idSchema.optional(),
    status: z.enum(['DRAFT', 'ACTIVE', 'ARCHIVED']).default('DRAFT'),
    isFeatured: z.boolean().default(false),
    weightGrams: z.number().int().min(0).max(1_000_000).optional(),
    tags: z.array(z.string().trim().min(1).max(40)).max(20).default([]),
    metaTitle: z.string().trim().max(160).optional(),
    metaDescription: z.string().trim().max(320).optional(),
    stock: z.number().int().min(0).default(0),
    lowStockThreshold: z.number().int().min(0).max(10_000).default(5),
    images: z.array(imageSchema).max(10).default([]),
    variants: z.array(variantSchema).max(50).default([]),
    attributes: z.array(attributeSchema).max(40).default([]),
  })
  .strict()
  .refine((data) => data.discountPrice === undefined || data.discountPrice < data.price, {
    message: 'Discount price must be lower than the regular price',
    path: ['discountPrice'],
  });

export const updateProductSchema = z
  .object({
    name: nonEmptyString(200, 'Product name').optional(),
    slug: slugSchema.optional(),
    sku: z.string().trim().min(1).max(60).optional(),
    description: nonEmptyString(10_000, 'Description').optional(),
    shortDescription: z.string().trim().max(300).nullable().optional(),
    price: moneySchema.optional(),
    discountPrice: moneySchema.nullable().optional(),
    categoryId: idSchema.optional(),
    brandId: idSchema.nullable().optional(),
    status: z.enum(['DRAFT', 'ACTIVE', 'ARCHIVED']).optional(),
    isFeatured: z.boolean().optional(),
    weightGrams: z.number().int().min(0).max(1_000_000).nullable().optional(),
    tags: z.array(z.string().trim().min(1).max(40)).max(20).optional(),
    metaTitle: z.string().trim().max(160).nullable().optional(),
    metaDescription: z.string().trim().max(320).nullable().optional(),
    images: z.array(imageSchema).max(10).optional(),
    /**
     * Editing a variant follows the same "omitted means unchanged, null means clear"
     * rule as the rest of this schema. `attributes` therefore loses its create-time
     * `{}` default — a form that does not edit attributes must not be able to erase
     * them by staying silent — and the prices accept an explicit null so an override
     * can be removed and the product price inherited again.
     */
    variants: z
      .array(
        variantSchema.extend({
          id: idSchema.optional(),
          attributes: z.record(z.string().max(40), z.string().max(120)).optional(),
          price: moneySchema.nullable().optional(),
          discountPrice: moneySchema.nullable().optional(),
        }),
      )
      .max(50)
      .optional(),
    attributes: z.array(attributeSchema).max(40).optional(),
  })
  .strict()
  .refine((data) => Object.keys(data).length > 0, { message: 'Provide at least one field to update' });

/**
 * Stock is adjusted through its own endpoint, never as part of a product edit —
 * inventory changes need their own audit trail and concurrency rules.
 */
export const updateInventorySchema = z
  .object({
    variantId: idSchema.optional(),
    /** Absolute set. Mutually exclusive with `delta`. */
    quantity: z.number().int().min(0).max(1_000_000).optional(),
    /** Relative adjustment, e.g. -3 for shrinkage or +50 for a restock. */
    delta: z.number().int().min(-100_000).max(100_000).optional(),
    lowStockThreshold: z.number().int().min(0).max(10_000).optional(),
  })
  .strict()
  .refine((data) => data.quantity !== undefined || data.delta !== undefined || data.lowStockThreshold !== undefined, {
    message: 'Provide quantity, delta, or lowStockThreshold',
  })
  .refine((data) => !(data.quantity !== undefined && data.delta !== undefined), {
    message: 'Provide either quantity or delta, not both',
    path: ['delta'],
  });

export type ProductQuery = z.infer<typeof productQuerySchema>;
export type AdminProductQuery = z.infer<typeof adminProductQuerySchema>;
export type CreateProductInput = z.infer<typeof createProductSchema>;
export type UpdateProductInput = z.infer<typeof updateProductSchema>;
export type UpdateInventoryInput = z.infer<typeof updateInventorySchema>;
export type ProductSort = z.infer<typeof productSortSchema>;
