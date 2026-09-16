import type { Prisma } from '@prisma/client';

import { prisma, type PrismaTransactionClient } from '@/lib/prisma';

/**
 * A cart line is only meaningful together with live product, variant and stock data,
 * so the repository always returns the full graph. Callers never see a bare quantity.
 */
export const cartItemInclude = {
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
      images: {
        select: { url: true, alt: true },
        orderBy: [{ isPrimary: 'desc' }, { position: 'asc' }],
        take: 1,
      },
      inventory: { select: { id: true, quantity: true } },
    },
  },
  variant: {
    select: {
      id: true,
      name: true,
      sku: true,
      price: true,
      discountPrice: true,
      attributes: true,
      imageUrl: true,
      isActive: true,
      inventory: { select: { id: true, quantity: true } },
    },
  },
} satisfies Prisma.CartItemInclude;

export type CartItemRow = Prisma.CartItemGetPayload<{ include: typeof cartItemInclude }>;

export const cartRepository = {
  /** Carts are created lazily so a user record is never missing one. */
  async findOrCreateByUserId(userId: string, client: PrismaTransactionClient = prisma) {
    const existing = await client.cart.findUnique({
      where: { userId },
      include: { items: { include: cartItemInclude, orderBy: { createdAt: 'asc' } } },
    });

    if (existing) return existing;

    return client.cart.create({
      data: { userId },
      include: { items: { include: cartItemInclude, orderBy: { createdAt: 'asc' } } },
    });
  },

  findItemById(itemId: string) {
    return prisma.cartItem.findUnique({ where: { id: itemId }, include: cartItemInclude });
  },

  /**
   * Takes the cart's row lock, so everything that follows in the same transaction is the
   * only thing touching this cart.
   *
   * Adding an item is read-then-write by nature — find the existing line, decide the new
   * quantity, write it. Four concurrent taps on "add to cart" otherwise all read "no line
   * yet" and all insert one, leaving duplicate lines and a per-item limit that counted
   * only the row each request happened to see.
   */
  async lockCart(cartId: string, client: PrismaTransactionClient): Promise<void> {
    await client.$queryRaw`SELECT id FROM carts WHERE id = ${cartId} FOR UPDATE`;
  },

  /**
   * `null` and a variant id must be matched exactly — Postgres treats NULLs as distinct
   * in unique indexes, so the composite constraint alone will not deduplicate rows where
   * `variantId IS NULL`. A partial unique index covers that case in the database; this
   * lookup is what finds the line to top up.
   */
  findExistingItem(
    cartId: string,
    productId: string,
    variantId: string | null,
    client: PrismaTransactionClient = prisma,
  ) {
    return client.cartItem.findFirst({
      where: { cartId, productId, variantId: variantId ?? null },
      include: cartItemInclude,
    });
  },

  createItem(
    data: { cartId: string; productId: string; variantId: string | null; quantity: number },
    client: PrismaTransactionClient = prisma,
  ) {
    return client.cartItem.create({ data, include: cartItemInclude });
  },

  updateItemQuantity(itemId: string, quantity: number, client: PrismaTransactionClient = prisma) {
    return client.cartItem.update({ where: { id: itemId }, data: { quantity }, include: cartItemInclude });
  },

  deleteItem(itemId: string, client: PrismaTransactionClient = prisma) {
    return client.cartItem.delete({ where: { id: itemId } });
  },

  clear(cartId: string, client: PrismaTransactionClient = prisma) {
    return client.cartItem.deleteMany({ where: { cartId } });
  },

  countItems(cartId: string, client: PrismaTransactionClient = prisma): Promise<number> {
    return client.cartItem.count({ where: { cartId } });
  },

  /** Bumps `updatedAt`, which the client uses to detect a stale cached cart. */
  touch(cartId: string, client: PrismaTransactionClient = prisma) {
    return client.cart.update({ where: { id: cartId }, data: { updatedAt: new Date() } });
  },
};
