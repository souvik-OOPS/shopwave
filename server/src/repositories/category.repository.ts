import type { Category, Prisma } from '@prisma/client';

import { prisma } from '@/lib/prisma';

export const categoryRepository = {
  findMany(where: Prisma.CategoryWhereInput): Promise<Category[]> {
    return prisma.category.findMany({
      where,
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
    });
  },

  /** Counts only sellable products, so the UI never advertises an empty category. */
  findManyWithCounts(where: Prisma.CategoryWhereInput) {
    return prisma.category.findMany({
      where,
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
      include: {
        _count: { select: { products: { where: { status: 'ACTIVE', deletedAt: null } } } },
      },
    });
  },

  findById(id: string) {
    return prisma.category.findUnique({
      where: { id },
      include: { parent: true, children: true },
    });
  },

  findBySlug(slug: string) {
    return prisma.category.findUnique({
      where: { slug },
      include: { parent: true, children: { where: { isActive: true }, orderBy: { sortOrder: 'asc' } } },
    });
  },

  slugExists(slug: string, excludeId?: string): Promise<boolean> {
    return prisma.category
      .count({ where: { slug, ...(excludeId ? { id: { not: excludeId } } : {}) } })
      .then((count) => count > 0);
  },

  create(data: Prisma.CategoryCreateInput): Promise<Category> {
    return prisma.category.create({ data });
  },

  update(id: string, data: Prisma.CategoryUpdateInput): Promise<Category> {
    return prisma.category.update({ where: { id }, data });
  },

  delete(id: string): Promise<Category> {
    return prisma.category.delete({ where: { id } });
  },

  countProducts(categoryId: string): Promise<number> {
    return prisma.product.count({ where: { categoryId, deletedAt: null } });
  },

  countChildren(categoryId: string): Promise<number> {
    return prisma.category.count({ where: { parentId: categoryId } });
  },

  /**
   * Walks up the parent chain. Used to reject a re-parent that would create a cycle
   * (A → B → A), which would otherwise make the tree endpoint recurse forever.
   */
  async isDescendantOf(candidateId: string, ancestorId: string): Promise<boolean> {
    let currentId: string | null = candidateId;
    let hops = 0;

    while (currentId && hops < 20) {
      if (currentId === ancestorId) return true;
      const node: { parentId: string | null } | null = await prisma.category.findUnique({
        where: { id: currentId },
        select: { parentId: true },
      });
      currentId = node?.parentId ?? null;
      hops += 1;
    }

    return false;
  },
};
