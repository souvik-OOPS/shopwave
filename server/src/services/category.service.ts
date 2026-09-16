import type { Category, Prisma } from '@prisma/client';

import { CACHE_TTL } from '@/config/constants';
import { cacheInvalidate, cacheRemember } from '@/lib/redis';
import { categoryRepository } from '@/repositories/category.repository';
import type { CategoryQuery, CreateCategoryInput, UpdateCategoryInput } from '@/schemas/category.schema';
import { ApiError, ErrorCode } from '@/utils/ApiError';
import { uniqueSlug } from '@/utils/slug';

export interface CategoryNode extends Category {
  productCount: number;
  children: CategoryNode[];
}

type CountedCategory = Category & { _count: { products: number } };

/**
 * Rolls descendant product counts up into their ancestors.
 *
 * Prisma's `_count` only counts products assigned *directly* to a category, so a parent
 * like "Electronics" reads zero when every product actually sits under "Headphones" or
 * "Speakers". That is wrong for the UI, because selecting a parent on the storefront
 * deliberately matches its children too (see `buildStorefrontWhere`) — the badge must
 * agree with what the click returns.
 */
function withDescendantCounts(rows: CountedCategory[]): Map<string, number> {
  const childrenByParent = new Map<string, string[]>();
  const ownCount = new Map<string, number>();

  for (const row of rows) {
    ownCount.set(row.id, row._count.products);
    if (row.parentId) {
      const siblings = childrenByParent.get(row.parentId) ?? [];
      siblings.push(row.id);
      childrenByParent.set(row.parentId, siblings);
    }
  }

  const totals = new Map<string, number>();

  // Depth-guarded so a cyclic parent chain cannot recurse forever, even though
  // `isDescendantOf` should already have prevented one being created.
  function total(id: string, depth = 0): number {
    const cached = totals.get(id);
    if (cached !== undefined) return cached;
    if (depth > 20) return ownCount.get(id) ?? 0;

    const sum =
      (ownCount.get(id) ?? 0) +
      (childrenByParent.get(id) ?? []).reduce((acc, childId) => acc + total(childId, depth + 1), 0);

    totals.set(id, sum);
    return sum;
  }

  for (const row of rows) total(row.id);
  return totals;
}

/** Flat rows → nested tree in one pass, so deep hierarchies cost a single query. */
function buildTree(rows: CountedCategory[]): CategoryNode[] {
  const nodes = new Map<string, CategoryNode>();
  const roots: CategoryNode[] = [];
  const totals = withDescendantCounts(rows);

  for (const row of rows) {
    const { _count, ...category } = row;
    nodes.set(row.id, {
      ...category,
      productCount: totals.get(row.id) ?? _count.products,
      children: [],
    });
  }

  for (const row of rows) {
    const node = nodes.get(row.id);
    if (!node) continue;

    const parent = row.parentId ? nodes.get(row.parentId) : undefined;
    if (parent) {
      parent.children.push(node);
    } else {
      roots.push(node);
    }
  }

  return roots;
}

async function invalidateCache(): Promise<void> {
  await cacheInvalidate('categories:*');
}

export const categoryService = {
  async list(query: CategoryQuery) {
    const where: Prisma.CategoryWhereInput = {
      ...(query.includeInactive ? {} : { isActive: true }),
      ...(query.parentId ? { parentId: query.parentId } : {}),
    };

    const cacheKey = `categories:list:${JSON.stringify(query)}`;

    return cacheRemember(cacheKey, CACHE_TTL.CATEGORY_TREE, async () => {
      const rows = await categoryRepository.findManyWithCounts(where);

      if (query.tree) return buildTree(rows);

      const totals = withDescendantCounts(rows);
      return rows.map(({ _count, ...category }) => ({
        ...category,
        productCount: totals.get(category.id) ?? _count.products,
        /** Products assigned directly to this category, excluding sub-categories. */
        directProductCount: _count.products,
      }));
    });
  },

  async getBySlug(slug: string) {
    const category = await categoryRepository.findBySlug(slug);
    if (!category) throw ApiError.notFound('Category not found', ErrorCode.CATEGORY_NOT_FOUND);
    return category;
  },

  async getById(id: string) {
    const category = await categoryRepository.findById(id);
    if (!category) throw ApiError.notFound('Category not found', ErrorCode.CATEGORY_NOT_FOUND);
    return category;
  },

  async create(input: CreateCategoryInput): Promise<Category> {
    if (input.parentId) {
      const parent = await categoryRepository.findById(input.parentId);
      if (!parent) throw ApiError.badRequest('Parent category not found', ErrorCode.CATEGORY_NOT_FOUND);
    }

    const slug = input.slug
      ? input.slug
      : await uniqueSlug(input.name, (candidate) => categoryRepository.slugExists(candidate));

    if (input.slug && (await categoryRepository.slugExists(input.slug))) {
      throw ApiError.conflict('That slug is already taken', ErrorCode.SLUG_ALREADY_EXISTS);
    }

    const category = await categoryRepository.create({
      name: input.name,
      slug,
      isActive: input.isActive,
      sortOrder: input.sortOrder,
      ...(input.description ? { description: input.description } : {}),
      ...(input.imageUrl ? { imageUrl: input.imageUrl } : {}),
      ...(input.parentId ? { parent: { connect: { id: input.parentId } } } : {}),
    });

    await invalidateCache();
    return category;
  },

  async update(id: string, input: UpdateCategoryInput): Promise<Category> {
    const existing = await categoryRepository.findById(id);
    if (!existing) throw ApiError.notFound('Category not found', ErrorCode.CATEGORY_NOT_FOUND);

    if (input.slug && input.slug !== existing.slug && (await categoryRepository.slugExists(input.slug, id))) {
      throw ApiError.conflict('That slug is already taken', ErrorCode.SLUG_ALREADY_EXISTS);
    }

    if (input.parentId) {
      if (input.parentId === id) {
        throw ApiError.badRequest('A category cannot be its own parent');
      }
      // Re-parenting under a descendant would make the tree cyclic.
      if (await categoryRepository.isDescendantOf(input.parentId, id)) {
        throw ApiError.badRequest('Cannot move a category beneath one of its own descendants');
      }
    }

    const data: Prisma.CategoryUpdateInput = {
      ...(input.name !== undefined ? { name: input.name } : {}),
      ...(input.slug !== undefined ? { slug: input.slug } : {}),
      ...(input.description !== undefined ? { description: input.description } : {}),
      ...(input.imageUrl !== undefined ? { imageUrl: input.imageUrl } : {}),
      ...(input.isActive !== undefined ? { isActive: input.isActive } : {}),
      ...(input.sortOrder !== undefined ? { sortOrder: input.sortOrder } : {}),
      ...(input.parentId !== undefined
        ? input.parentId === null
          ? { parent: { disconnect: true } }
          : { parent: { connect: { id: input.parentId } } }
        : {}),
    };

    const category = await categoryRepository.update(id, data);
    await invalidateCache();
    return category;
  },

  /**
   * Deletion is blocked while products or child categories still point here —
   * `onDelete: Restrict` would raise a raw FK error, and a 409 with a reason is
   * far more useful to an admin than a 500.
   */
  async delete(id: string): Promise<void> {
    const existing = await categoryRepository.findById(id);
    if (!existing) throw ApiError.notFound('Category not found', ErrorCode.CATEGORY_NOT_FOUND);

    const productCount = await categoryRepository.countProducts(id);
    if (productCount > 0) {
      throw ApiError.conflict(
        `Cannot delete: ${productCount} product(s) still belong to this category`,
        ErrorCode.CATEGORY_HAS_PRODUCTS,
        { productCount },
      );
    }

    const childCount = await categoryRepository.countChildren(id);
    if (childCount > 0) {
      throw ApiError.conflict(
        `Cannot delete: ${childCount} sub-categor${childCount === 1 ? 'y' : 'ies'} still exist`,
        ErrorCode.CONFLICT,
      );
    }

    await categoryRepository.delete(id);
    await invalidateCache();
  },
};
