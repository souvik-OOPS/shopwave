import { Prisma } from '@prisma/client';

import { effectivePrice, toNumber } from '@/utils/money';

/**
 * Prisma returns `Decimal` objects, which `JSON.stringify` renders as `{"s":1,"e":2,…}`.
 * Every response therefore passes through a serializer that converts money to plain
 * numbers and computes the derived fields the UI needs — so no component recomputes
 * "is this discounted?" and gets it subtly wrong.
 */

export interface PriceView {
  price: number;
  discountPrice: number | null;
  effectivePrice: number;
  discountPercentage: number;
  isDiscounted: boolean;
}

export function buildPriceView(price: Prisma.Decimal | number, discountPrice: Prisma.Decimal | number | null): PriceView {
  const listPrice = toNumber(price);
  const effective = toNumber(effectivePrice(price, discountPrice));
  const isDiscounted = effective < listPrice;

  return {
    price: listPrice,
    discountPrice: discountPrice === null ? null : toNumber(discountPrice),
    effectivePrice: effective,
    discountPercentage: isDiscounted && listPrice > 0 ? Math.round(((listPrice - effective) / listPrice) * 100) : 0,
    isDiscounted,
  };
}

export interface StockView {
  inStock: boolean;
  stockQuantity: number;
  isLowStock: boolean;
}

export function buildStockView(inventory: { quantity: number; lowStockThreshold?: number } | null): StockView {
  const quantity = inventory?.quantity ?? 0;
  const threshold = inventory?.lowStockThreshold ?? 0;

  return {
    inStock: quantity > 0,
    stockQuantity: quantity,
    isLowStock: quantity > 0 && quantity <= threshold,
  };
}

/** Recursively converts any Decimal in a plain object graph to a number. */
export function decimalsToNumbers<T>(value: T): T {
  if (value instanceof Prisma.Decimal) return toNumber(value) as unknown as T;
  if (value instanceof Date || value === null || typeof value !== 'object') return value;
  if (Array.isArray(value)) {
    return (value as unknown[]).map((item) => decimalsToNumbers(item)) as unknown as T;
  }

  const result: Record<string, unknown> = {};
  for (const [key, nested] of Object.entries(value as Record<string, unknown>)) {
    result[key] = decimalsToNumbers(nested);
  }
  return result as T;
}
