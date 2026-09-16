import type { Prisma } from '@prisma/client';

import { prisma, type PrismaTransactionClient } from '@/lib/prisma';

export const wishlistItemInclude = {
  product: {
    select: {
      id: true,
      name: true,
      slug: true,
      sku: true,
      price: true,
      discountPrice: true,
      status: true,
      deletedAt: true,
      ratingAverage: true,
      reviewCount: true,
      images: {
        select: { url: true, alt: true },
        orderBy: [{ isPrimary: 'desc' }, { position: 'asc' }],
        take: 1,
      },
      inventory: { select: { quantity: true } },
      brand: { select: { name: true, slug: true } },
    },
  },
  variant: { select: { id: true, name: true, attributes: true, inventory: { select: { quantity: true } } } },
} satisfies Prisma.WishlistItemInclude;

export type WishlistItemRow = Prisma.WishlistItemGetPayload<{ include: typeof wishlistItemInclude }>;

export const wishlistRepository = {
  async findOrCreateByUserId(userId: string, client: PrismaTransactionClient = prisma) {
    const existing = await client.wishlist.findUnique({
      where: { userId },
      include: { items: { include: wishlistItemInclude, orderBy: { createdAt: 'desc' } } },
    });

    if (existing) return existing;

    return client.wishlist.create({
      data: { userId },
      include: { items: { include: wishlistItemInclude, orderBy: { createdAt: 'desc' } } },
    });
  },

  findItem(wishlistId: string, productId: string, variantId: string | null) {
    return prisma.wishlistItem.findFirst({
      where: { wishlistId, productId, variantId: variantId ?? null },
      include: wishlistItemInclude,
    });
  },

  createItem(
    data: { wishlistId: string; productId: string; variantId: string | null },
    client: PrismaTransactionClient = prisma,
  ) {
    return client.wishlistItem.create({ data, include: wishlistItemInclude });
  },

  deleteItem(itemId: string, client: PrismaTransactionClient = prisma) {
    return client.wishlistItem.delete({ where: { id: itemId } });
  },

  deleteByProduct(wishlistId: string, productId: string) {
    return prisma.wishlistItem.deleteMany({ where: { wishlistId, productId } });
  },

  clear(wishlistId: string) {
    return prisma.wishlistItem.deleteMany({ where: { wishlistId } });
  },

  /** Powers the "already saved" heart on product cards without a per-card request. */
  async productIdsForUser(userId: string): Promise<string[]> {
    const rows = await prisma.wishlistItem.findMany({
      where: { wishlist: { userId } },
      select: { productId: true },
    });
    return [...new Set(rows.map((row) => row.productId))];
  },
};
