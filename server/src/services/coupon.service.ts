import { Prisma, type Coupon } from '@prisma/client';

import { prisma, type PrismaTransactionClient } from '@/lib/prisma';
import { couponRepository } from '@/repositories/coupon.repository';
import type { CouponQuery, CreateCouponInput, UpdateCouponInput } from '@/schemas/coupon.schema';
import { ApiError, ErrorCode } from '@/utils/ApiError';
import { min, percentageOf, round2, toNumber } from '@/utils/money';
import { resolvePagination } from '@/utils/pagination';

export interface CouponValidation {
  coupon: Coupon;
  discountAmount: Prisma.Decimal;
}

function serializeCoupon(coupon: Coupon & { _count?: { usages: number } }) {
  return {
    id: coupon.id,
    code: coupon.code,
    description: coupon.description,
    type: coupon.type,
    value: toNumber(coupon.value),
    minOrderAmount: coupon.minOrderAmount === null ? null : toNumber(coupon.minOrderAmount),
    maxDiscountAmount: coupon.maxDiscountAmount === null ? null : toNumber(coupon.maxDiscountAmount),
    usageLimit: coupon.usageLimit,
    perUserLimit: coupon.perUserLimit,
    usedCount: coupon.usedCount,
    startsAt: coupon.startsAt,
    expiresAt: coupon.expiresAt,
    isActive: coupon.isActive,
    createdAt: coupon.createdAt,
    ...(coupon._count ? { totalRedemptions: coupon._count.usages } : {}),
  };
}

/**
 * Computes the money a coupon takes off. Two caps apply, in this order:
 *   • `maxDiscountAmount` — stops "20% off" from removing ₹8,000 on a large order
 *   • the subtotal itself  — a discount can never exceed what is being bought
 */
export function computeDiscount(coupon: Coupon, subtotal: Prisma.Decimal): Prisma.Decimal {
  const raw =
    coupon.type === 'PERCENTAGE' ? percentageOf(subtotal, coupon.value) : round2(coupon.value);

  const capped = coupon.maxDiscountAmount !== null ? min(raw, coupon.maxDiscountAmount) : raw;

  return round2(min(capped, subtotal));
}

export const couponService = {
  /**
   * The complete server-side gate. Every checkout runs this again with the live
   * subtotal — a code validated at cart time is never trusted at payment time,
   * because the cart may have changed in between.
   */
  async validate(
    code: string,
    userId: string,
    subtotal: Prisma.Decimal,
    client: PrismaTransactionClient = prisma,
  ): Promise<CouponValidation> {
    const coupon = await couponRepository.findByCode(code, client);

    if (!coupon) {
      throw ApiError.notFound('That coupon code is not valid', ErrorCode.COUPON_NOT_FOUND);
    }

    if (!coupon.isActive) {
      throw ApiError.badRequest('This coupon is no longer active', ErrorCode.COUPON_INACTIVE);
    }

    const now = new Date();

    if (coupon.startsAt > now) {
      throw ApiError.badRequest('This coupon is not active yet', ErrorCode.COUPON_NOT_STARTED);
    }

    if (coupon.expiresAt && coupon.expiresAt < now) {
      throw ApiError.badRequest('This coupon has expired', ErrorCode.COUPON_EXPIRED);
    }

    if (coupon.usageLimit !== null && coupon.usedCount >= coupon.usageLimit) {
      throw ApiError.badRequest(
        'This coupon has reached its usage limit',
        ErrorCode.COUPON_USAGE_LIMIT_REACHED,
      );
    }

    await this.assertPerUserLimit(coupon, userId, client);

    if (coupon.minOrderAmount !== null && subtotal.lessThan(coupon.minOrderAmount)) {
      throw ApiError.badRequest(
        `Add ₹${toNumber(coupon.minOrderAmount.sub(subtotal))} more to use this coupon`,
        ErrorCode.COUPON_MIN_ORDER_NOT_MET,
        [{ path: 'code', message: `Minimum order value is ₹${toNumber(coupon.minOrderAmount)}` }],
      );
    }

    const discountAmount = computeDiscount(coupon, subtotal);

    if (discountAmount.lessThanOrEqualTo(0)) {
      throw ApiError.badRequest('This coupon does not apply to your cart', ErrorCode.COUPON_INACTIVE);
    }

    return { coupon, discountAmount };
  },

  /**
   * "Has this customer already used their allowance?"
   *
   * Split out because checkout has to ask twice: once up front for a useful error
   * message, and once inside the transaction after the coupon row has been claimed —
   * at which point concurrent redemptions of the same code are serialised and the count
   * is final. Checking only before the transaction lets two simultaneous checkouts both
   * pass a one-per-customer limit.
   */
  async assertPerUserLimit(
    coupon: Coupon,
    userId: string,
    client: PrismaTransactionClient = prisma,
  ): Promise<void> {
    if (coupon.perUserLimit === null) return;

    const used = await couponRepository.countUsagesByUser(coupon.id, userId, client);
    if (used >= coupon.perUserLimit) {
      throw ApiError.badRequest(
        coupon.perUserLimit === 1
          ? 'You have already used this coupon'
          : `You can only use this coupon ${coupon.perUserLimit} times`,
        ErrorCode.COUPON_USER_LIMIT_REACHED,
      );
    }
  },

  /** Preview used by the cart screen — same rules, response instead of a throw path. */
  async preview(code: string, userId: string, subtotal: Prisma.Decimal) {
    const { coupon, discountAmount } = await this.validate(code, userId, subtotal);
    return {
      code: coupon.code,
      type: coupon.type,
      value: toNumber(coupon.value),
      description: coupon.description,
      discountAmount: toNumber(discountAmount),
    };
  },

  // ----- admin ------------------------------------------------------------

  async list(query: CouponQuery) {
    const { skip, take, page, limit } = resolvePagination(query);

    const where: Prisma.CouponWhereInput = {
      ...(query.q ? { code: { contains: query.q.toUpperCase() } } : {}),
      ...(query.isActive !== undefined ? { isActive: query.isActive } : {}),
      ...(query.includeExpired ? {} : { OR: [{ expiresAt: null }, { expiresAt: { gte: new Date() } }] }),
    };

    const { items, total } = await couponRepository.findMany(where, skip, take);
    return { items: items.map(serializeCoupon), total, page, limit };
  },

  async get(id: string) {
    const coupon = await couponRepository.findById(id);
    if (!coupon) throw ApiError.notFound('Coupon not found', ErrorCode.COUPON_NOT_FOUND);
    return serializeCoupon(coupon);
  },

  async create(input: CreateCouponInput) {
    if (await couponRepository.codeExists(input.code)) {
      throw ApiError.conflict('That coupon code already exists', ErrorCode.COUPON_CODE_EXISTS);
    }

    const coupon = await couponRepository.create({
      code: input.code,
      type: input.type,
      value: new Prisma.Decimal(input.value),
      isActive: input.isActive,
      ...(input.description ? { description: input.description } : {}),
      ...(input.minOrderAmount !== undefined
        ? { minOrderAmount: new Prisma.Decimal(input.minOrderAmount) }
        : {}),
      ...(input.maxDiscountAmount !== undefined
        ? { maxDiscountAmount: new Prisma.Decimal(input.maxDiscountAmount) }
        : {}),
      ...(input.usageLimit !== undefined ? { usageLimit: input.usageLimit } : {}),
      ...(input.perUserLimit !== undefined ? { perUserLimit: input.perUserLimit } : {}),
      ...(input.startsAt ? { startsAt: input.startsAt } : {}),
      ...(input.expiresAt !== undefined ? { expiresAt: input.expiresAt } : {}),
    });

    return serializeCoupon(coupon);
  },

  async update(id: string, input: UpdateCouponInput) {
    const existing = await couponRepository.findById(id);
    if (!existing) throw ApiError.notFound('Coupon not found', ErrorCode.COUPON_NOT_FOUND);

    // Re-check the percentage ceiling when either side of the pair changes.
    const nextType = input.type ?? existing.type;
    const nextValue = input.value ?? toNumber(existing.value);
    if (nextType === 'PERCENTAGE' && nextValue > 100) {
      throw ApiError.badRequest('A percentage discount cannot exceed 100%');
    }

    const coupon = await couponRepository.update(id, {
      ...(input.description !== undefined ? { description: input.description } : {}),
      ...(input.type !== undefined ? { type: input.type } : {}),
      ...(input.value !== undefined ? { value: new Prisma.Decimal(input.value) } : {}),
      ...(input.minOrderAmount !== undefined
        ? { minOrderAmount: input.minOrderAmount === null ? null : new Prisma.Decimal(input.minOrderAmount) }
        : {}),
      ...(input.maxDiscountAmount !== undefined
        ? {
            maxDiscountAmount:
              input.maxDiscountAmount === null ? null : new Prisma.Decimal(input.maxDiscountAmount),
          }
        : {}),
      ...(input.usageLimit !== undefined ? { usageLimit: input.usageLimit } : {}),
      ...(input.perUserLimit !== undefined ? { perUserLimit: input.perUserLimit } : {}),
      ...(input.startsAt !== undefined ? { startsAt: input.startsAt } : {}),
      ...(input.expiresAt !== undefined ? { expiresAt: input.expiresAt } : {}),
      ...(input.isActive !== undefined ? { isActive: input.isActive } : {}),
    });

    return serializeCoupon(coupon);
  },

  /**
   * Redeemed coupons are deactivated rather than deleted — `CouponUsage` rows point at
   * them, and destroying the record would erase the discount history on past orders.
   */
  async remove(id: string): Promise<{ deleted: boolean }> {
    const existing = await couponRepository.findById(id);
    if (!existing) throw ApiError.notFound('Coupon not found', ErrorCode.COUPON_NOT_FOUND);

    if (existing.usedCount > 0) {
      await couponRepository.update(id, { isActive: false });
      return { deleted: false };
    }

    await couponRepository.delete(id);
    return { deleted: true };
  },
};
