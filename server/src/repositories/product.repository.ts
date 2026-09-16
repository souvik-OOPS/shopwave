import { type Prisma, type Product } from '@prisma/client';

import { prisma, type PrismaTransactionClient } from '@/lib/prisma';
import type { ProductSort } from '@/schemas/product.schema';

/** List cards need far less than the detail page — keeping them separate halves payload size. */
export const productListSelect = {
  id: true,
  name: true,
  slug: true,
  sku: true,
  shortDescription: true,
  price: true,
  discountPrice: true,
  currency: true,
  status: true,
  isFeatured: true,
  ratingAverage: true,
  reviewCount: true,
  soldCount: true,
  tags: true,
  createdAt: true,
  category: { select: { id: true, name: true, slug: true } },
  brand: { select: { id: true, name: true, slug: true } },
  images: {
    select: { id: true, url: true, alt: true, isPrimary: true, position: true },
    orderBy: [{ isPrimary: 'desc' }, { position: 'asc' }],
    take: 2,
  },
  inventory: { select: { quantity: true, lowStockThreshold: true } },
  /**
   * A product that tracks stock per variant has nothing in its own inventory row, so a
   * card built from that row alone reports "out of stock" for something with units on
   * the shelf. The active variants' counts come along to be summed into the card.
   */
  variants: {
    where: { isActive: true },
    select: { inventory: { select: { quantity: true, lowStockThreshold: true } } },
  },
} satisfies Prisma.ProductSelect;

export const productDetailInclude = {
  category: { select: { id: true, name: true, slug: true, parentId: true } },
  brand: { select: { id: true, name: true, slug: true, logoUrl: true } },
  images: { orderBy: [{ isPrimary: 'desc' }, { position: 'asc' }] },
  attributes: { orderBy: { position: 'asc' } },
  variants: {
    where: { isActive: true },
    orderBy: { position: 'asc' },
    include: { inventory: { select: { quantity: true, lowStockThreshold: true } } },
  },
  inventory: { select: { quantity: true, reserved: true, lowStockThreshold: true } },
} satisfies Prisma.ProductInclude;

export type ProductListRow = Prisma.ProductGetPayload<{ select: typeof productListSelect }>;
export type ProductDetailRow = Prisma.ProductGetPayload<{ include: typeof productDetailInclude }>;

/**
 * Sort mapping. `popular` is a compound sort — units sold, then rating — so a brand-new
 * product with one 5-star review does not outrank a proven best-seller.
 */
export function buildOrderBy(sort: ProductSort): Prisma.ProductOrderByWithRelationInput[] {
  switch (sort) {
    // Sorted on what the card displays. Ordering by the list price puts a discounted
    // ₹6,999 product behind an undiscounted ₹7,499 one.
    case 'price_asc':
      return [{ effectivePrice: 'asc' }, { id: 'asc' }];
    case 'price_desc':
      return [{ effectivePrice: 'desc' }, { id: 'asc' }];
    case 'rating':
      return [{ ratingAverage: 'desc' }, { reviewCount: 'desc' }, { id: 'asc' }];
    case 'popular':
      return [{ soldCount: 'desc' }, { ratingAverage: 'desc' }, { id: 'asc' }];
    case 'name_asc':
      return [{ name: 'asc' }, { id: 'asc' }];
    case 'name_desc':
      return [{ name: 'desc' }, { id: 'asc' }];
    case 'oldest':
      return [{ createdAt: 'asc' }, { id: 'asc' }];
    case 'newest':
    default:
      return [{ createdAt: 'desc' }, { id: 'asc' }];
  }
}

/**
 * Multi-field search. Each whitespace-separated term must match somewhere (AND across
 * terms, OR across fields), so "sony wireless" finds the Sony wireless headphones
 * rather than everything Sony plus everything wireless.
 */
export function buildSearchFilter(query: string): Prisma.ProductWhereInput {
  const terms = query
    .split(/\s+/)
    .map((term) => term.trim())
    .filter((term) => term.length > 0)
    .slice(0, 6);

  if (terms.length === 0) return {};

  return {
    AND: terms.map<Prisma.ProductWhereInput>((term) => ({
      OR: [
        { name: { contains: term, mode: 'insensitive' } },
        { shortDescription: { contains: term, mode: 'insensitive' } },
        { description: { contains: term, mode: 'insensitive' } },
        { sku: { contains: term, mode: 'insensitive' } },
        { tags: { has: term.toLowerCase() } },
        { brand: { name: { contains: term, mode: 'insensitive' } } },
        { category: { name: { contains: term, mode: 'insensitive' } } },
      ],
    })),
  };
}

export const productRepository = {
  /** Count and page are issued together so the two never disagree under load. */
  async findMany(
    where: Prisma.ProductWhereInput,
    orderBy: Prisma.ProductOrderByWithRelationInput[],
    skip: number,
    take: number,
  ): Promise<{ items: ProductListRow[]; total: number }> {
    const [items, total] = await prisma.$transaction([
      prisma.product.findMany({ where, orderBy, skip, take, select: productListSelect }),
      prisma.product.count({ where }),
    ]);

    return { items, total };
  },

  findBySlug(slug: string, includeInactive = false): Promise<ProductDetailRow | null> {
    return prisma.product.findFirst({
      where: {
        slug,
        deletedAt: null,
        ...(includeInactive ? {} : { status: 'ACTIVE' }),
      },
      include: productDetailInclude,
    });
  },

  findById(id: string): Promise<ProductDetailRow | null> {
    return prisma.product.findFirst({ where: { id, deletedAt: null }, include: productDetailInclude });
  },

  findRelated(productId: string, categoryId: string, limit: number): Promise<ProductListRow[]> {
    return prisma.product.findMany({
      where: { categoryId, status: 'ACTIVE', deletedAt: null, id: { not: productId } },
      orderBy: [{ soldCount: 'desc' }, { ratingAverage: 'desc' }],
      take: limit,
      select: productListSelect,
    });
  },

  slugExists(slug: string, excludeId?: string): Promise<boolean> {
    return prisma.product
      .count({ where: { slug, ...(excludeId ? { id: { not: excludeId } } : {}) } })
      .then((count) => count > 0);
  },

  skuExists(sku: string, excludeId?: string): Promise<boolean> {
    return prisma.product
      .count({ where: { sku, ...(excludeId ? { id: { not: excludeId } } : {}) } })
      .then((count) => count > 0);
  },

  variantSkuExists(sku: string, excludeId?: string): Promise<boolean> {
    return prisma.productVariant
      .count({ where: { sku, ...(excludeId ? { id: { not: excludeId } } : {}) } })
      .then((count) => count > 0);
  },

  create(data: Prisma.ProductCreateInput, client: PrismaTransactionClient = prisma): Promise<Product> {
    return client.product.create({ data });
  },

  update(
    id: string,
    data: Prisma.ProductUpdateInput,
    client: PrismaTransactionClient = prisma,
  ): Promise<Product> {
    return client.product.update({ where: { id }, data });
  },

  /** Soft delete — order history and reviews must keep resolving. */
  softDelete(id: string): Promise<Product> {
    return prisma.product.update({
      where: { id },
      data: { deletedAt: new Date(), status: 'ARCHIVED' },
    });
  },

  addImages(productId: string, images: Prisma.ProductImageCreateManyInput[]) {
    return prisma.productImage.createMany({ data: images.map((image) => ({ ...image, productId })) });
  },

  findImage(imageId: string) {
    return prisma.productImage.findUnique({ where: { id: imageId } });
  },

  deleteImage(imageId: string) {
    return prisma.productImage.delete({ where: { id: imageId } });
  },

  countImages(productId: string): Promise<number> {
    return prisma.productImage.count({ where: { productId } });
  },

  findVariant(variantId: string) {
    return prisma.productVariant.findUnique({
      where: { id: variantId },
      include: { inventory: true, product: { select: { id: true, status: true, deletedAt: true } } },
    });
  },

  /**
   * Recomputes the denormalised rating aggregate from source rows. Called after every
   * review write so the cached average can never drift from reality.
   */
  async refreshRatingAggregate(productId: string, client: PrismaTransactionClient = prisma): Promise<void> {
    const aggregate = await client.review.aggregate({
      where: { productId, status: 'APPROVED' },
      _avg: { rating: true },
      _count: { _all: true },
    });

    await client.product.update({
      where: { id: productId },
      data: {
        ratingAverage: Number((aggregate._avg.rating ?? 0).toFixed(2)),
        reviewCount: aggregate._count._all,
      },
    });
  },

  lowStock(limit: number) {
    // Prisma cannot compare two columns in `where`, so the threshold check is raw SQL.
    return prisma.$queryRaw<
      Array<{ id: string; name: string; sku: string; slug: string; quantity: number; lowStockThreshold: number }>
    >`
      SELECT p.id, p.name, p.sku, p.slug, i.quantity, i."lowStockThreshold"
      FROM products p
      JOIN inventory i ON i."productId" = p.id
      WHERE p."deletedAt" IS NULL
        AND p.status = 'ACTIVE'
        AND i.quantity <= i."lowStockThreshold"
      ORDER BY i.quantity ASC
      LIMIT ${limit}
    `;
  },

  /** Cheapest/most expensive active product — drives the price-filter slider bounds. */
  priceRange(where: Prisma.ProductWhereInput) {
    // Bounds must match what the filter compares against, or the slider's own extremes
    // exclude products.
    return prisma.product.aggregate({
      where,
      _min: { effectivePrice: true },
      _max: { effectivePrice: true },
    });
  },
};
