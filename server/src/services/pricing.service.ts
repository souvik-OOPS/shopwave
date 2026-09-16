import { Prisma } from '@prisma/client';

import { PRICING } from '@/config/constants';
import { add, isGreaterOrEqual, multiply, percentageOf, round2, subtract, toNumber } from '@/utils/money';

/**
 * The single source of truth for what an order costs.
 *
 * Both the cart preview and the real checkout call this with the same inputs, so the
 * price a customer is shown is arithmetically the same one they are charged. The client
 * never sends money — it sends product ids and quantities, and everything below is
 * derived from database prices.
 */

export interface PricedLine {
  unitPrice: Prisma.Decimal;
  quantity: number;
}

export interface OrderTotals {
  subtotal: Prisma.Decimal;
  discountAmount: Prisma.Decimal;
  shippingAmount: Prisma.Decimal;
  taxAmount: Prisma.Decimal;
  total: Prisma.Decimal;
}

export interface SerializedTotals {
  subtotal: number;
  discountAmount: number;
  shippingAmount: number;
  taxAmount: number;
  total: number;
  freeShippingThreshold: number;
  amountToFreeShipping: number;
  taxRatePercent: number;
}

export function calculateSubtotal(lines: PricedLine[]): Prisma.Decimal {
  return round2(
    lines.reduce<Prisma.Decimal>(
      (sum, line) => sum.add(multiply(line.unitPrice, line.quantity)),
      new Prisma.Decimal(0),
    ),
  );
}

/**
 * Order of operations matters and is deliberate:
 *   1. subtotal            (sum of line totals at DB prices)
 *   2. minus discount      (coupon, already validated and capped elsewhere)
 *   3. shipping            (free above the threshold, judged on the discounted amount)
 *   4. tax                 (GST on the discounted goods value, not on shipping)
 *   5. total
 *
 * Charging tax before the discount would overcharge; judging free shipping on the
 * pre-discount subtotal would give it away too easily. Both are business decisions,
 * so they live in one readable place rather than being scattered across services.
 */
export function calculateTotals(
  subtotal: Prisma.Decimal,
  discountAmount: Prisma.Decimal = new Prisma.Decimal(0),
): OrderTotals {
  const safeSubtotal = round2(subtotal);

  // A coupon can never make an order negative.
  const cappedDiscount = discountAmount.greaterThan(safeSubtotal) ? safeSubtotal : round2(discountAmount);
  const discountedSubtotal = round2(subtract(safeSubtotal, cappedDiscount));

  const shippingAmount =
    discountedSubtotal.lessThanOrEqualTo(0) || isGreaterOrEqual(discountedSubtotal, PRICING.FREE_SHIPPING_THRESHOLD)
      ? new Prisma.Decimal(0)
      : new Prisma.Decimal(PRICING.SHIPPING_FLAT_RATE);

  const taxAmount = percentageOf(discountedSubtotal, PRICING.TAX_RATE * 100);
  const total = round2(add(discountedSubtotal, shippingAmount, taxAmount));

  return {
    subtotal: safeSubtotal,
    discountAmount: cappedDiscount,
    shippingAmount,
    taxAmount,
    total,
  };
}

export function serializeTotals(totals: OrderTotals): SerializedTotals {
  const discounted = subtract(totals.subtotal, totals.discountAmount);
  const remaining = subtract(PRICING.FREE_SHIPPING_THRESHOLD, discounted);

  return {
    subtotal: toNumber(totals.subtotal),
    discountAmount: toNumber(totals.discountAmount),
    shippingAmount: toNumber(totals.shippingAmount),
    taxAmount: toNumber(totals.taxAmount),
    total: toNumber(totals.total),
    freeShippingThreshold: PRICING.FREE_SHIPPING_THRESHOLD,
    amountToFreeShipping: remaining.greaterThan(0) ? toNumber(remaining) : 0,
    taxRatePercent: PRICING.TAX_RATE * 100,
  };
}
