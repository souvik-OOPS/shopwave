import { Prisma } from '@prisma/client';

import { PRICING } from '@/config/constants';

/**
 * Money crosses three representations in this app:
 *   • Prisma.Decimal   — how it is stored and computed
 *   • number (2dp)     — how it leaves the API as JSON
 *   • integer paise    — how Razorpay wants it
 *
 * Every conversion goes through here so no service does `Number(x) * 1.18` by hand.
 */

export type MoneyInput = Prisma.Decimal | number | string;

export function toDecimal(value: MoneyInput): Prisma.Decimal {
  return value instanceof Prisma.Decimal ? value : new Prisma.Decimal(value);
}

/** Rounds half-up to 2dp — the convention Indian invoices use. */
export function round2(value: MoneyInput): Prisma.Decimal {
  return toDecimal(value).toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP);
}

/** Serialise for JSON. Safe because all amounts here are far below 2^53 paise. */
export function toNumber(value: MoneyInput): number {
  return round2(value).toNumber();
}

export function add(...values: MoneyInput[]): Prisma.Decimal {
  return values.reduce<Prisma.Decimal>((sum, value) => sum.add(toDecimal(value)), new Prisma.Decimal(0));
}

export function subtract(a: MoneyInput, b: MoneyInput): Prisma.Decimal {
  return toDecimal(a).sub(toDecimal(b));
}

export function multiply(a: MoneyInput, b: MoneyInput): Prisma.Decimal {
  return toDecimal(a).mul(toDecimal(b));
}

export function percentageOf(value: MoneyInput, percentage: MoneyInput): Prisma.Decimal {
  return round2(toDecimal(value).mul(toDecimal(percentage)).div(100));
}

export function isGreaterThan(a: MoneyInput, b: MoneyInput): boolean {
  return toDecimal(a).greaterThan(toDecimal(b));
}

export function isGreaterOrEqual(a: MoneyInput, b: MoneyInput): boolean {
  return toDecimal(a).greaterThanOrEqualTo(toDecimal(b));
}

export function min(a: MoneyInput, b: MoneyInput): Prisma.Decimal {
  const left = toDecimal(a);
  const right = toDecimal(b);
  return left.lessThan(right) ? left : right;
}

export function max(a: MoneyInput, b: MoneyInput): Prisma.Decimal {
  const left = toDecimal(a);
  const right = toDecimal(b);
  return left.greaterThan(right) ? left : right;
}

/** Razorpay transacts in the smallest currency unit. 249.50 → 24950 paise. */
export function toSubunits(value: MoneyInput): number {
  return round2(value).mul(PRICING.CURRENCY_SUBUNIT_FACTOR).toNearest(1, Prisma.Decimal.ROUND_HALF_UP).toNumber();
}

export function fromSubunits(value: number): Prisma.Decimal {
  return round2(new Prisma.Decimal(value).div(PRICING.CURRENCY_SUBUNIT_FACTOR));
}

/** The price a customer actually pays: discount price when it undercuts list price. */
export function effectivePrice(price: MoneyInput, discountPrice?: MoneyInput | null): Prisma.Decimal {
  if (discountPrice === null || discountPrice === undefined) return round2(price);
  const discounted = toDecimal(discountPrice);
  const list = toDecimal(price);
  return discounted.greaterThan(0) && discounted.lessThan(list) ? round2(discounted) : round2(list);
}
