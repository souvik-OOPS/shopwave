import type { Coupon, Prisma } from '@prisma/client';

import { prisma, type PrismaTransactionClient } from '@/lib/prisma';

export const couponRepository = {
  findByCode(code: string, client: PrismaTransactionClient = prisma): Promise<Coupon | null> {
    return client.coupon.findUnique({ where: { code: code.toUpperCase() } });
  },

  findById(id: string): Promise<Coupon | null> {
    return prisma.coupon.findUnique({ where: { id } });
  },

  codeExists(code: string, excludeId?: string): Promise<boolean> {
    return prisma.coupon
      .count({ where: { code: code.toUpperCase(), ...(excludeId ? { id: { not: excludeId } } : {}) } })
      .then((count) => count > 0);
  },

  async findMany(where: Prisma.CouponWhereInput, skip: number, take: number) {
    const [items, total] = await prisma.$transaction([
      prisma.coupon.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take,
        include: { _count: { select: { usages: true } } },
      }),
      prisma.coupon.count({ where }),
    ]);
    return { items, total };
  },

  create(data: Prisma.CouponCreateInput): Promise<Coupon> {
    return prisma.coupon.create({ data });
  },

  update(id: string, data: Prisma.CouponUpdateInput): Promise<Coupon> {
    return prisma.coupon.update({ where: { id }, data });
  },

  delete(id: string): Promise<Coupon> {
    return prisma.coupon.delete({ where: { id } });
  },

  /**
   * How many times this specific customer has already redeemed the code.
   *
   * Takes a client so checkout can run it inside its transaction, where it sees the
   * redemptions committed by checkouts that were queued ahead of it.
   */
  countUsagesByUser(
    couponId: string,
    userId: string,
    client: PrismaTransactionClient = prisma,
  ): Promise<number> {
    return client.couponUsage.count({ where: { couponId, userId } });
  },

  /**
   * Claims one redemption slot atomically. The `usedCount < usageLimit` guard is part
   * of the UPDATE, so a coupon with 1 use left cannot be redeemed twice by two
   * simultaneous checkouts. Returns false when the limit was already reached.
   */
  async claimUsageSlot(couponId: string, client: PrismaTransactionClient): Promise<boolean> {
    const coupon = await client.coupon.findUnique({
      where: { id: couponId },
      select: { usageLimit: true },
    });
    if (!coupon) return false;

    const result = await client.coupon.updateMany({
      where: {
        id: couponId,
        ...(coupon.usageLimit !== null ? { usedCount: { lt: coupon.usageLimit } } : {}),
      },
      data: { usedCount: { increment: 1 } },
    });

    return result.count === 1;
  },

  releaseUsageSlot(couponId: string, client: PrismaTransactionClient) {
    return client.coupon.updateMany({
      where: { id: couponId, usedCount: { gt: 0 } },
      data: { usedCount: { decrement: 1 } },
    });
  },

  recordUsage(
    data: { couponId: string; userId: string; orderId: string; discountAmount: Prisma.Decimal },
    client: PrismaTransactionClient,
  ) {
    return client.couponUsage.create({ data });
  },

  deleteUsageForOrder(orderId: string, client: PrismaTransactionClient) {
    return client.couponUsage.deleteMany({ where: { orderId } });
  },
};
