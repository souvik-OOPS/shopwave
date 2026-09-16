import type { Inventory } from '@prisma/client';

import { prisma, type PrismaTransactionClient } from '@/lib/prisma';

/**
 * Every stock mutation lives here, and every one of them is a **conditional** update.
 *
 * The pattern is always:
 *     UPDATE inventory SET quantity = quantity - n WHERE id = ? AND quantity >= n
 *
 * The database evaluates the guard and the write atomically, so two concurrent buyers
 * competing for the last unit cannot both succeed. `count === 0` means the guard failed —
 * someone else won the race — and the caller aborts the transaction. Read-then-write
 * (`if (stock >= n) { update }`) would oversell here, however short the gap.
 */
export const inventoryRepository = {
  findForProduct(productId: string): Promise<Inventory | null> {
    return prisma.inventory.findUnique({ where: { productId } });
  },

  findForVariant(variantId: string): Promise<Inventory | null> {
    return prisma.inventory.findUnique({ where: { variantId } });
  },

  /** Resolves the single inventory row backing a product-or-variant selection. */
  findForSelection(productId: string, variantId?: string | null): Promise<Inventory | null> {
    return variantId
      ? prisma.inventory.findUnique({ where: { variantId } })
      : prisma.inventory.findUnique({ where: { productId } });
  },

  findManyByProductIds(productIds: string[]): Promise<Inventory[]> {
    return prisma.inventory.findMany({ where: { productId: { in: productIds } } });
  },

  findManyByVariantIds(variantIds: string[]): Promise<Inventory[]> {
    return prisma.inventory.findMany({ where: { variantId: { in: variantIds } } });
  },

  /**
   * Moves `quantity` units from available → reserved.
   * Returns false when stock ran out between the cart read and this call.
   */
  async reserve(inventoryId: string, quantity: number, client: PrismaTransactionClient): Promise<boolean> {
    const result = await client.inventory.updateMany({
      where: { id: inventoryId, quantity: { gte: quantity } },
      data: { quantity: { decrement: quantity }, reserved: { increment: quantity } },
    });
    return result.count === 1;
  },

  /** Payment captured: the hold becomes a real sale, so the reservation is dropped. */
  async commitReservation(
    inventoryId: string,
    quantity: number,
    client: PrismaTransactionClient,
  ): Promise<boolean> {
    const result = await client.inventory.updateMany({
      where: { id: inventoryId, reserved: { gte: quantity } },
      data: { reserved: { decrement: quantity } },
    });
    return result.count === 1;
  },

  /**
   * Order cancelled or payment failed: units go back on sale.
   *
   * Guarded on `reserved >= quantity` for the same reason `reserve` is guarded on
   * `quantity >= n`: two concurrent cancellations of the same order would otherwise both
   * add the units back, inflating available stock and driving `reserved` negative. The
   * guard makes the second release a no-op, and `false` tells the caller it did nothing.
   */
  async releaseReservation(
    inventoryId: string,
    quantity: number,
    client: PrismaTransactionClient,
  ): Promise<boolean> {
    const result = await client.inventory.updateMany({
      where: { id: inventoryId, reserved: { gte: quantity } },
      data: { quantity: { increment: quantity }, reserved: { decrement: quantity } },
    });
    return result.count === 1;
  },

  /** Return accepted: restock without touching `reserved` (that was cleared at capture). */
  async restock(inventoryId: string, quantity: number, client: PrismaTransactionClient): Promise<void> {
    await client.inventory.update({
      where: { id: inventoryId },
      data: { quantity: { increment: quantity } },
    });
  },

  /**
   * Absolute set. `quantity` is only written when the caller actually supplied one, so
   * editing just the low-stock threshold cannot silently stamp a stale count back over a
   * concurrent adjustment.
   */
  setQuantity(
    inventoryId: string,
    quantity: number | undefined,
    lowStockThreshold?: number,
    client: PrismaTransactionClient = prisma,
  ): Promise<Inventory> {
    return client.inventory.update({
      where: { id: inventoryId },
      data: {
        ...(quantity !== undefined ? { quantity } : {}),
        ...(lowStockThreshold !== undefined ? { lowStockThreshold } : {}),
      },
    });
  },

  /**
   * Relative adjustment, floored at zero so a bad delta cannot create negative stock.
   *
   * The floor is applied by the database inside the UPDATE, not by reading the row and
   * writing back an absolute replacement: five concurrent `+1` adjustments must leave
   * +5, and a read-then-write would lose whichever writes interleave.
   */
  async adjustQuantity(inventoryId: string, delta: number): Promise<Inventory | null> {
    const rows = await prisma.$queryRaw<Inventory[]>`
      UPDATE inventory
      SET quantity = GREATEST(0, quantity + ${delta}::int), "updatedAt" = NOW()
      WHERE id = ${inventoryId}
      RETURNING *
    `;
    return rows[0] ?? null;
  },

  create(
    data: { productId?: string; variantId?: string; quantity: number; lowStockThreshold?: number },
    client: PrismaTransactionClient = prisma,
  ): Promise<Inventory> {
    return client.inventory.create({ data });
  },

  countLowStock(): Promise<number> {
    return prisma.$queryRaw<Array<{ count: bigint }>>`
      SELECT COUNT(*)::bigint AS count
      FROM inventory i
      JOIN products p ON p.id = i."productId"
      WHERE p."deletedAt" IS NULL AND p.status = 'ACTIVE' AND i.quantity <= i."lowStockThreshold"
    `.then((rows) => Number(rows[0]?.count ?? 0));
  },

  countOutOfStock(): Promise<number> {
    return prisma.inventory.count({
      where: { quantity: 0, product: { deletedAt: null, status: 'ACTIVE' } },
    });
  },
};
