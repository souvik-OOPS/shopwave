import type { Brand, Prisma } from '@prisma/client';

import { prisma } from '@/lib/prisma';

export const brandRepository = {
  findManyWithCounts(where: Prisma.BrandWhereInput) {
    return prisma.brand.findMany({
      where,
      orderBy: { name: 'asc' },
      include: {
        _count: { select: { products: { where: { status: 'ACTIVE', deletedAt: null } } } },
      },
    });
  },

  findById(id: string): Promise<Brand | null> {
    return prisma.brand.findUnique({ where: { id } });
  },

  findBySlug(slug: string): Promise<Brand | null> {
    return prisma.brand.findUnique({ where: { slug } });
  },

  slugExists(slug: string, excludeId?: string): Promise<boolean> {
    return prisma.brand
      .count({ where: { slug, ...(excludeId ? { id: { not: excludeId } } : {}) } })
      .then((count) => count > 0);
  },

  nameExists(name: string, excludeId?: string): Promise<boolean> {
    return prisma.brand
      .count({
        where: {
          name: { equals: name, mode: 'insensitive' },
          ...(excludeId ? { id: { not: excludeId } } : {}),
        },
      })
      .then((count) => count > 0);
  },

  create(data: Prisma.BrandCreateInput): Promise<Brand> {
    return prisma.brand.create({ data });
  },

  update(id: string, data: Prisma.BrandUpdateInput): Promise<Brand> {
    return prisma.brand.update({ where: { id }, data });
  },

  delete(id: string): Promise<Brand> {
    return prisma.brand.delete({ where: { id } });
  },

  countProducts(brandId: string): Promise<number> {
    return prisma.product.count({ where: { brandId, deletedAt: null } });
  },
};
