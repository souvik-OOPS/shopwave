import { Prisma } from '@prisma/client';

import { CACHE_TTL } from '@/config/constants';
import { deleteImage, uploadImages } from '@/lib/cloudinary';
import { prisma } from '@/lib/prisma';
import { cacheInvalidate, cacheRemember } from '@/lib/redis';
import { inventoryRepository } from '@/repositories/inventory.repository';
import {
  buildOrderBy,
  buildSearchFilter,
  productRepository,
  type ProductDetailRow,
  type ProductListRow,
} from '@/repositories/product.repository';
import type {
  AdminProductQuery,
  CreateProductInput,
  ProductQuery,
  UpdateInventoryInput,
  UpdateProductInput,
} from '@/schemas/product.schema';
import { ApiError, ErrorCode } from '@/utils/ApiError';
import { toNumber } from '@/utils/money';
import { resolvePagination } from '@/utils/pagination';
import { buildPriceView, buildStockView, decimalsToNumbers } from '@/utils/serializers';
import { generateSku, uniqueSlug } from '@/utils/slug';

function serializeListItem(row: ProductListRow) {
  const { price, discountPrice, inventory, variants, ...rest } = row;
  return {
    ...rest,
    ...buildPriceView(price, discountPrice),
    // A card's stock is everything a customer could buy from this product: the base row
    // plus every active variant. Reading the base row alone shows a variant-only product
    // as out of stock while its options are in stock.
    ...buildStockView(aggregateStock(inventory, variants)),
  };
}

function serializeDetail(row: ProductDetailRow) {
  const { price, discountPrice, effectivePrice: _generated, inventory, variants, ...rest } = row;

  return {
    ...decimalsToNumbers(rest),
    ...buildPriceView(price, discountPrice),
    ...buildStockView(aggregateStock(inventory, variants)),
    reservedQuantity: inventory?.reserved ?? 0,
    variants: variants.map((variant) => {
      const { price: variantPrice, discountPrice: variantDiscount, inventory: variantInventory, ...variantRest } = variant;
      // A variant without its own price inherits the parent product's.
      const basePrice = variantPrice ?? price;
      const baseDiscount = variantDiscount ?? (variantPrice ? null : discountPrice);
      return {
        ...decimalsToNumbers(variantRest),
        ...buildPriceView(basePrice, baseDiscount),
        ...buildStockView(variantInventory),
        // `price` above is the price this variant sells at, inherited or not, so it
        // cannot answer "does this variant override the product price?" — an override
        // that happens to match the product's would be indistinguishable. An editor
        // needs the difference to know whether clearing the field changes anything.
        hasPriceOverride: variantPrice !== null,
        hasDiscountOverride: variantDiscount !== null,
      };
    }),
  };
}

/**
 * Total sellable units behind a product card.
 *
 * Stock lives on the product row, on each variant row, or both — the demo seed writes
 * both, a variant product created through the API writes only the variants. Summing is
 * the only reading that is right for all three shapes. The low-stock threshold comes from
 * whichever row actually holds stock, so the badge still means something.
 */
function aggregateStock(
  inventory: { quantity: number; lowStockThreshold: number } | null,
  variants: Array<{ inventory: { quantity: number; lowStockThreshold: number } | null }>,
): { quantity: number; lowStockThreshold: number } | null {
  const rows = [inventory, ...variants.map((variant) => variant.inventory)].filter(
    (row): row is { quantity: number; lowStockThreshold: number } => row !== null,
  );

  if (rows.length === 0) return null;

  return {
    quantity: rows.reduce((total, row) => total + row.quantity, 0),
    lowStockThreshold: Math.max(...rows.map((row) => row.lowStockThreshold)),
  };
}

async function invalidateProductCache(): Promise<void> {
  await cacheInvalidate('products:*');
}

/** Storefront filters. Draft/archived/deleted rows are never reachable from here. */
function buildStorefrontWhere(query: ProductQuery): Prisma.ProductWhereInput {
  const where: Prisma.ProductWhereInput = { status: 'ACTIVE', deletedAt: null };
  const and: Prisma.ProductWhereInput[] = [];

  if (query.q) and.push(buildSearchFilter(query.q));

  const categorySlugs = [...(query.categories ?? []), ...(query.category ? [query.category] : [])];
  if (categorySlugs.length > 0) {
    // Selecting a parent category must also return everything beneath it.
    and.push({
      OR: [
        { category: { slug: { in: categorySlugs } } },
        { category: { parent: { slug: { in: categorySlugs } } } },
      ],
    });
  }

  const brandSlugs = [...(query.brands ?? []), ...(query.brand ? [query.brand] : [])];
  if (brandSlugs.length > 0) and.push({ brand: { slug: { in: brandSlugs } } });

  if (query.minPrice !== undefined || query.maxPrice !== undefined) {
    // Filtered on the price the shopper sees. Against the list price, a ₹2,000 product
    // discounted to ₹900 is missing from a "under ₹1,000" search.
    and.push({
      effectivePrice: {
        ...(query.minPrice !== undefined ? { gte: new Prisma.Decimal(query.minPrice) } : {}),
        ...(query.maxPrice !== undefined ? { lte: new Prisma.Decimal(query.maxPrice) } : {}),
      },
    });
  }

  if (query.minRating !== undefined) and.push({ ratingAverage: { gte: query.minRating } });
  if (query.featured) and.push({ isFeatured: true });
  if (query.tags?.length) and.push({ tags: { hasSome: query.tags } });
  // In stock means "buyable", which for a variant product means any active variant has
  // units — its own inventory row is empty by design.
  if (query.inStock) {
    and.push({
      OR: [
        { inventory: { quantity: { gt: 0 } } },
        { variants: { some: { isActive: true, inventory: { quantity: { gt: 0 } } } } },
      ],
    });
  }

  if (and.length > 0) where.AND = and;
  return where;
}

export const productService = {
  async list(query: ProductQuery) {
    const { skip, take, page, limit } = resolvePagination(query);
    const where = buildStorefrontWhere(query);
    const orderBy = buildOrderBy(query.sort);

    const cacheKey = `products:list:${JSON.stringify({ query, page, limit })}`;

    const result = await cacheRemember(cacheKey, CACHE_TTL.PRODUCT_LIST, async () => {
      const { items, total } = await productRepository.findMany(where, orderBy, skip, take);
      return { items: items.map(serializeListItem), total };
    });

    return { ...result, page, limit };
  },

  /** Bounds for the price slider, computed over the same filter set minus price itself. */
  async facets(query: ProductQuery) {
    const { minPrice: _min, maxPrice: _max, ...rest } = query;
    const where = buildStorefrontWhere(rest);

    const aggregate = await productRepository.priceRange(where);

    return {
      priceRange: {
        min: aggregate._min.effectivePrice ? Math.floor(toNumber(aggregate._min.effectivePrice)) : 0,
        max: aggregate._max.effectivePrice ? Math.ceil(toNumber(aggregate._max.effectivePrice)) : 0,
      },
    };
  },

  async getBySlug(slug: string, includeInactive = false) {
    const cacheKey = `products:detail:${slug}`;

    if (includeInactive) {
      const product = await productRepository.findBySlug(slug, true);
      if (!product) throw ApiError.notFound('Product not found', ErrorCode.PRODUCT_NOT_FOUND);
      return serializeDetail(product);
    }

    const cached = await cacheRemember(cacheKey, CACHE_TTL.PRODUCT_DETAIL, async () => {
      const product = await productRepository.findBySlug(slug, false);
      return product ? serializeDetail(product) : null;
    });

    if (!cached) throw ApiError.notFound('Product not found', ErrorCode.PRODUCT_NOT_FOUND);
    return cached;
  },

  async getById(id: string) {
    const product = await productRepository.findById(id);
    if (!product) throw ApiError.notFound('Product not found', ErrorCode.PRODUCT_NOT_FOUND);
    return serializeDetail(product);
  },

  async getRelated(slug: string, limit = 8) {
    const product = await productRepository.findBySlug(slug, false);
    if (!product) throw ApiError.notFound('Product not found', ErrorCode.PRODUCT_NOT_FOUND);

    const related = await productRepository.findRelated(product.id, product.categoryId, limit);
    return related.map(serializeListItem);
  },

  async adminList(query: AdminProductQuery) {
    const { skip, take, page, limit } = resolvePagination(query);

    const where: Prisma.ProductWhereInput = {
      ...(query.includeDeleted ? {} : { deletedAt: null }),
      ...(query.status ? { status: query.status } : {}),
      ...(query.category ? { categoryId: query.category } : {}),
      ...(query.brand ? { brandId: query.brand } : {}),
      ...(query.q ? buildSearchFilter(query.q) : {}),
    };

    const { items, total } = await productRepository.findMany(where, buildOrderBy(query.sort), skip, take);

    // Column-to-column comparison isn't expressible in Prisma's `where`, so low-stock
    // is filtered after selection rather than pushed into SQL.
    const filtered = query.lowStock
      ? items.filter((item) => {
          const stock = aggregateStock(item.inventory, item.variants);
          return (stock?.quantity ?? 0) <= (stock?.lowStockThreshold ?? 0);
        })
      : items;

    return {
      items: filtered.map(serializeListItem),
      total: query.lowStock ? filtered.length : total,
      page,
      limit,
    };
  },

  /**
   * Creates the product, its images, attributes, variants and inventory rows in one
   * transaction — a product that exists without an inventory row would be unsellable
   * and invisible to every stock check.
   */
  async create(input: CreateProductInput) {
    const category = await prisma.category.findUnique({ where: { id: input.categoryId } });
    if (!category) throw ApiError.badRequest('Category not found', ErrorCode.CATEGORY_NOT_FOUND);

    if (input.brandId) {
      const brand = await prisma.brand.findUnique({ where: { id: input.brandId } });
      if (!brand) throw ApiError.badRequest('Brand not found', ErrorCode.BRAND_NOT_FOUND);
    }

    if (input.slug && (await productRepository.slugExists(input.slug))) {
      throw ApiError.conflict('That slug is already taken', ErrorCode.SLUG_ALREADY_EXISTS);
    }
    if (input.sku && (await productRepository.skuExists(input.sku))) {
      throw ApiError.conflict('That SKU is already in use', ErrorCode.SKU_ALREADY_EXISTS);
    }

    const slug = input.slug ?? (await uniqueSlug(input.name, (c) => productRepository.slugExists(c)));
    const sku = input.sku ?? generateSku(input.name);

    const productId = await prisma.$transaction(async (tx) => {
      const product = await tx.product.create({
        data: {
          name: input.name,
          slug,
          sku,
          description: input.description,
          price: new Prisma.Decimal(input.price),
          status: input.status,
          isFeatured: input.isFeatured,
          tags: input.tags.map((tag) => tag.toLowerCase()),
          category: { connect: { id: input.categoryId } },
          ...(input.brandId ? { brand: { connect: { id: input.brandId } } } : {}),
          ...(input.discountPrice !== undefined
            ? { discountPrice: new Prisma.Decimal(input.discountPrice) }
            : {}),
          ...(input.shortDescription ? { shortDescription: input.shortDescription } : {}),
          ...(input.weightGrams !== undefined ? { weightGrams: input.weightGrams } : {}),
          ...(input.metaTitle ? { metaTitle: input.metaTitle } : {}),
          ...(input.metaDescription ? { metaDescription: input.metaDescription } : {}),
          ...(input.status === 'ACTIVE' ? { publishedAt: new Date() } : {}),
          ...(input.images.length > 0
            ? {
                images: {
                  createMany: {
                    data: input.images.map((image, index) => ({
                      url: image.url,
                      position: image.position || index,
                      isPrimary: image.isPrimary || index === 0,
                      ...(image.publicId ? { publicId: image.publicId } : {}),
                      ...(image.alt ? { alt: image.alt } : {}),
                    })),
                  },
                },
              }
            : {}),
          ...(input.attributes.length > 0
            ? { attributes: { createMany: { data: input.attributes } } }
            : {}),
        },
      });

      // A product with variants tracks stock per variant; otherwise on the product itself.
      if (input.variants.length > 0) {
        for (const [index, variant] of input.variants.entries()) {
          const created = await tx.productVariant.create({
            data: {
              productId: product.id,
              name: variant.name,
              sku: variant.sku ?? `${sku}-V${index + 1}`,
              attributes: variant.attributes,
              position: variant.position || index,
              isActive: variant.isActive,
              ...(variant.price !== undefined ? { price: new Prisma.Decimal(variant.price) } : {}),
              ...(variant.discountPrice !== undefined
                ? { discountPrice: new Prisma.Decimal(variant.discountPrice) }
                : {}),
              ...(variant.imageUrl ? { imageUrl: variant.imageUrl } : {}),
            },
          });

          await tx.inventory.create({
            data: {
              variantId: created.id,
              quantity: variant.stock,
              lowStockThreshold: input.lowStockThreshold,
            },
          });
        }
      }

      await tx.inventory.create({
        data: {
          productId: product.id,
          quantity: input.stock,
          lowStockThreshold: input.lowStockThreshold,
        },
      });

      return product.id;
    });

    await invalidateProductCache();
    return this.getById(productId);
  },

  async update(id: string, input: UpdateProductInput) {
    const existing = await productRepository.findById(id);
    if (!existing) throw ApiError.notFound('Product not found', ErrorCode.PRODUCT_NOT_FOUND);

    if (input.slug && input.slug !== existing.slug && (await productRepository.slugExists(input.slug, id))) {
      throw ApiError.conflict('That slug is already taken', ErrorCode.SLUG_ALREADY_EXISTS);
    }
    if (input.sku && input.sku !== existing.sku && (await productRepository.skuExists(input.sku, id))) {
      throw ApiError.conflict('That SKU is already in use', ErrorCode.SKU_ALREADY_EXISTS);
    }

    // Variant SKUs are unique across the whole catalogue, so a clash has to be caught
    // here and reported as a 409 — not left to surface as a constraint violation.
    for (const variant of input.variants ?? []) {
      if (!variant.sku) continue;

      const current = variant.id
        ? existing.variants.find((candidate) => candidate.id === variant.id)
        : undefined;
      if (current?.sku === variant.sku) continue;

      if (await productRepository.variantSkuExists(variant.sku, variant.id)) {
        throw ApiError.conflict(
          `The SKU "${variant.sku}" is already in use`,
          ErrorCode.SKU_ALREADY_EXISTS,
        );
      }
    }

    // Guard the cross-field rule when only one of the two prices is being changed.
    const nextPrice = input.price ?? toNumber(existing.price);
    const nextDiscount = input.discountPrice === undefined ? existing.discountPrice : input.discountPrice;
    if (nextDiscount !== null && nextDiscount !== undefined && toNumber(nextDiscount) >= nextPrice) {
      throw ApiError.badRequest('Discount price must be lower than the regular price');
    }

    await prisma.$transaction(async (tx) => {
      await tx.product.update({
        where: { id },
        data: {
          ...(input.name !== undefined ? { name: input.name } : {}),
          ...(input.slug !== undefined ? { slug: input.slug } : {}),
          ...(input.sku !== undefined ? { sku: input.sku } : {}),
          ...(input.description !== undefined ? { description: input.description } : {}),
          ...(input.shortDescription !== undefined ? { shortDescription: input.shortDescription } : {}),
          ...(input.price !== undefined ? { price: new Prisma.Decimal(input.price) } : {}),
          ...(input.discountPrice !== undefined
            ? { discountPrice: input.discountPrice === null ? null : new Prisma.Decimal(input.discountPrice) }
            : {}),
          ...(input.categoryId !== undefined ? { category: { connect: { id: input.categoryId } } } : {}),
          ...(input.brandId !== undefined
            ? input.brandId === null
              ? { brand: { disconnect: true } }
              : { brand: { connect: { id: input.brandId } } }
            : {}),
          ...(input.status !== undefined
            ? {
                status: input.status,
                ...(input.status === 'ACTIVE' && !existing.publishedAt ? { publishedAt: new Date() } : {}),
              }
            : {}),
          ...(input.isFeatured !== undefined ? { isFeatured: input.isFeatured } : {}),
          ...(input.weightGrams !== undefined ? { weightGrams: input.weightGrams } : {}),
          ...(input.tags !== undefined ? { tags: input.tags.map((tag) => tag.toLowerCase()) } : {}),
          ...(input.metaTitle !== undefined ? { metaTitle: input.metaTitle } : {}),
          ...(input.metaDescription !== undefined ? { metaDescription: input.metaDescription } : {}),
        },
      });

      // Images and attributes are replace-in-full: the admin form always posts the
      // complete desired list, so diffing would add complexity with no benefit.
      if (input.images) {
        await tx.productImage.deleteMany({ where: { productId: id } });
        if (input.images.length > 0) {
          await tx.productImage.createMany({
            data: input.images.map((image, index) => ({
              productId: id,
              url: image.url,
              position: image.position || index,
              isPrimary: image.isPrimary || index === 0,
              ...(image.publicId ? { publicId: image.publicId } : {}),
              ...(image.alt ? { alt: image.alt } : {}),
            })),
          });
        }
      }

      if (input.attributes) {
        await tx.productAttribute.deleteMany({ where: { productId: id } });
        if (input.attributes.length > 0) {
          await tx.productAttribute.createMany({
            data: input.attributes.map((attribute) => ({ ...attribute, productId: id })),
          });
        }
      }

      // Variants are upserted, never wiped: deleting them would orphan inventory rows
      // and break order items that still reference the variant.
      if (input.variants) {
        for (const [index, variant] of input.variants.entries()) {
          if (variant.id) {
            // Only what the caller actually sent is written. An update that mentions a
            // variant to reposition or rename it must not blank the attributes, price or
            // SKU it said nothing about; `null` is how a field is deliberately cleared.
            await tx.productVariant.update({
              where: { id: variant.id },
              data: {
                name: variant.name,
                position: variant.position || index,
                isActive: variant.isActive,
                ...(variant.attributes !== undefined ? { attributes: variant.attributes } : {}),
                ...(variant.sku !== undefined ? { sku: variant.sku } : {}),
                ...(variant.price !== undefined
                  ? { price: variant.price === null ? null : new Prisma.Decimal(variant.price) }
                  : {}),
                ...(variant.discountPrice !== undefined
                  ? {
                      discountPrice:
                        variant.discountPrice === null
                          ? null
                          : new Prisma.Decimal(variant.discountPrice),
                    }
                  : {}),
                ...(variant.imageUrl ? { imageUrl: variant.imageUrl } : {}),
              },
            });
          } else {
            // A new variant has nothing to preserve, so null and omitted mean the same
            // thing here: no override, inherit the product's price.
            const created = await tx.productVariant.create({
              data: {
                productId: id,
                name: variant.name,
                sku: variant.sku ?? `${existing.sku}-V${Date.now()}${index}`,
                attributes: variant.attributes ?? {},
                position: variant.position || index,
                isActive: variant.isActive,
                ...(variant.price != null ? { price: new Prisma.Decimal(variant.price) } : {}),
                ...(variant.discountPrice != null
                  ? { discountPrice: new Prisma.Decimal(variant.discountPrice) }
                  : {}),
                ...(variant.imageUrl ? { imageUrl: variant.imageUrl } : {}),
              },
            });
            await tx.inventory.create({ data: { variantId: created.id, quantity: variant.stock } });
          }
        }
      }
    });

    await invalidateProductCache();
    return this.getById(id);
  },

  async remove(id: string): Promise<void> {
    const existing = await productRepository.findById(id);
    if (!existing) throw ApiError.notFound('Product not found', ErrorCode.PRODUCT_NOT_FOUND);

    await productRepository.softDelete(id);
    await invalidateProductCache();
  },

  async uploadImages(productId: string, files: Express.Multer.File[]) {
    const product = await productRepository.findById(productId);
    if (!product) throw ApiError.notFound('Product not found', ErrorCode.PRODUCT_NOT_FOUND);

    const existingCount = await productRepository.countImages(productId);
    const uploaded = await uploadImages(
      files.map((file) => file.buffer),
      'products',
    );

    await productRepository.addImages(
      productId,
      uploaded.map((image, index) => ({
        productId,
        url: image.url,
        publicId: image.publicId,
        position: existingCount + index,
        isPrimary: existingCount === 0 && index === 0,
      })),
    );

    await invalidateProductCache();
    return this.getById(productId);
  },

  async deleteImage(productId: string, imageId: string): Promise<void> {
    const image = await productRepository.findImage(imageId);
    if (!image || image.productId !== productId) {
      throw ApiError.notFound('Image not found');
    }

    await productRepository.deleteImage(imageId);
    // Remote cleanup after the DB row is gone: an orphaned CDN asset is harmless,
    // a DB row pointing at a deleted asset is a broken image.
    if (image.publicId) await deleteImage(image.publicId);
    await invalidateProductCache();
  },

  async updateInventory(productId: string, input: UpdateInventoryInput) {
    const product = await productRepository.findById(productId);
    if (!product) throw ApiError.notFound('Product not found', ErrorCode.PRODUCT_NOT_FOUND);

    if (input.variantId) {
      const variant = product.variants.find((candidate) => candidate.id === input.variantId);
      if (!variant) throw ApiError.notFound('Variant not found', ErrorCode.VARIANT_NOT_FOUND);
    }

    const inventory = await inventoryRepository.findForSelection(productId, input.variantId);
    if (!inventory) throw ApiError.notFound('Inventory record not found');

    if (input.delta !== undefined) {
      const adjusted = await inventoryRepository.adjustQuantity(inventory.id, input.delta);
      if (!adjusted) throw ApiError.notFound('Inventory record not found');
    }
    // `quantity` is passed through as-is: a threshold-only edit must not write back the
    // count read a moment ago, which a concurrent delta may already have moved.
    if (input.quantity !== undefined || input.lowStockThreshold !== undefined) {
      await inventoryRepository.setQuantity(inventory.id, input.quantity, input.lowStockThreshold);
    }

    await invalidateProductCache();
    return this.getById(productId);
  },
};
