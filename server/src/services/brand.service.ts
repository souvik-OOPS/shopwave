import type { Brand, Prisma } from '@prisma/client';

import { CACHE_TTL } from '@/config/constants';
import { cacheInvalidate, cacheRemember } from '@/lib/redis';
import { brandRepository } from '@/repositories/brand.repository';
import type { BrandQuery, CreateBrandInput, UpdateBrandInput } from '@/schemas/brand.schema';
import { ApiError, ErrorCode } from '@/utils/ApiError';
import { uniqueSlug } from '@/utils/slug';

export const brandService = {
  async list(query: BrandQuery) {
    const where: Prisma.BrandWhereInput = query.includeInactive ? {} : { isActive: true };

    return cacheRemember(`brands:list:${String(query.includeInactive ?? false)}`, CACHE_TTL.BRAND_LIST, async () => {
      const rows = await brandRepository.findManyWithCounts(where);
      return rows.map(({ _count, ...brand }) => ({ ...brand, productCount: _count.products }));
    });
  },

  async getBySlug(slug: string): Promise<Brand> {
    const brand = await brandRepository.findBySlug(slug);
    if (!brand) throw ApiError.notFound('Brand not found', ErrorCode.BRAND_NOT_FOUND);
    return brand;
  },

  async create(input: CreateBrandInput): Promise<Brand> {
    if (await brandRepository.nameExists(input.name)) {
      throw ApiError.conflict('A brand with this name already exists', ErrorCode.CONFLICT);
    }

    if (input.slug && (await brandRepository.slugExists(input.slug))) {
      throw ApiError.conflict('That slug is already taken', ErrorCode.SLUG_ALREADY_EXISTS);
    }

    const slug = input.slug ?? (await uniqueSlug(input.name, (c) => brandRepository.slugExists(c)));

    const brand = await brandRepository.create({
      name: input.name,
      slug,
      isActive: input.isActive,
      ...(input.description ? { description: input.description } : {}),
      ...(input.logoUrl ? { logoUrl: input.logoUrl } : {}),
      ...(input.website ? { website: input.website } : {}),
    });

    await cacheInvalidate('brands:*');
    return brand;
  },

  async update(id: string, input: UpdateBrandInput): Promise<Brand> {
    const existing = await brandRepository.findById(id);
    if (!existing) throw ApiError.notFound('Brand not found', ErrorCode.BRAND_NOT_FOUND);

    if (input.name && input.name !== existing.name && (await brandRepository.nameExists(input.name, id))) {
      throw ApiError.conflict('A brand with this name already exists', ErrorCode.CONFLICT);
    }

    if (input.slug && input.slug !== existing.slug && (await brandRepository.slugExists(input.slug, id))) {
      throw ApiError.conflict('That slug is already taken', ErrorCode.SLUG_ALREADY_EXISTS);
    }

    const brand = await brandRepository.update(id, input);
    await cacheInvalidate('brands:*');
    return brand;
  },

  /** Brands are nulled on the product rather than blocking deletion (`SetNull` FK). */
  async delete(id: string): Promise<void> {
    const existing = await brandRepository.findById(id);
    if (!existing) throw ApiError.notFound('Brand not found', ErrorCode.BRAND_NOT_FOUND);

    const productCount = await brandRepository.countProducts(id);
    if (productCount > 0) {
      throw ApiError.conflict(
        `Cannot delete: ${productCount} product(s) still reference this brand`,
        ErrorCode.CONFLICT,
        { productCount },
      );
    }

    await brandRepository.delete(id);
    await cacheInvalidate('brands:*');
  },
};
