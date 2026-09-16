import { Prisma } from '@prisma/client';

import { CART } from '@/config/constants';
import { prisma } from '@/lib/prisma';
import { cartRepository, type CartItemRow } from '@/repositories/cart.repository';
import type { AddToCartInput } from '@/schemas/cart.schema';
import { ApiError, ErrorCode } from '@/utils/ApiError';
import { effectivePrice, multiply, toNumber } from '@/utils/money';
import { couponService } from '@/services/coupon.service';
import { calculateSubtotal, calculateTotals, serializeTotals, type SerializedTotals } from '@/services/pricing.service';

/**
 * Everything about a cart is recomputed from the database on every read.
 *
 * The stored row holds only `productId`, `variantId` and `quantity` — three pieces of
 * data the customer is allowed to choose. Price, availability and stock come from the
 * catalog at read time, so a cart created when an item cost ₹999 correctly shows ₹1,299
 * after a price change, and an item that sold out shows as unavailable rather than
 * silently failing at checkout.
 */

export type CartIssueCode =
  | 'PRODUCT_UNAVAILABLE'
  | 'VARIANT_UNAVAILABLE'
  | 'OUT_OF_STOCK'
  | 'QUANTITY_REDUCED'
  | 'PRICE_CHANGED';

export interface CartIssue {
  itemId: string;
  code: CartIssueCode;
  message: string;
}

export interface CartLineView {
  id: string;
  productId: string;
  variantId: string | null;
  name: string;
  variantName: string | null;
  slug: string;
  sku: string;
  imageUrl: string | null;
  attributes: Prisma.JsonValue | null;
  unitPrice: number;
  originalPrice: number;
  quantity: number;
  lineTotal: number;
  availableStock: number;
  maxQuantity: number;
  isAvailable: boolean;
}

export interface AppliedCouponView {
  code: string;
  discountAmount: number;
}

export interface CartView {
  id: string;
  items: CartLineView[];
  summary: SerializedTotals & { itemCount: number; totalQuantity: number };
  issues: CartIssue[];
  /** Present when the caller asked for a coupon and it validated against this cart. */
  appliedCoupon: AppliedCouponView | null;
  updatedAt: Date;
}

interface ResolvedLine {
  view: CartLineView;
  unitPrice: Prisma.Decimal;
  issues: CartIssue[];
}

/** Live price for a line: variant price wins, otherwise the product's, discount applied. */
function resolveUnitPrice(item: CartItemRow): { unit: Prisma.Decimal; original: Prisma.Decimal } {
  if (item.variant && item.variant.price !== null) {
    return {
      unit: effectivePrice(item.variant.price, item.variant.discountPrice),
      original: item.variant.price,
    };
  }
  return {
    unit: effectivePrice(item.product.price, item.product.discountPrice),
    original: item.product.price,
  };
}

function resolveLine(item: CartItemRow): ResolvedLine {
  const issues: CartIssue[] = [];

  const productSellable = item.product.status === 'ACTIVE' && item.product.deletedAt === null;
  const variantSellable = item.variant ? item.variant.isActive : true;

  const inventory = item.variant ? item.variant.inventory : item.product.inventory;
  const availableStock = inventory?.quantity ?? 0;

  if (!productSellable) {
    issues.push({
      itemId: item.id,
      code: 'PRODUCT_UNAVAILABLE',
      message: `"${item.product.name}" is no longer available`,
    });
  } else if (!variantSellable) {
    issues.push({
      itemId: item.id,
      code: 'VARIANT_UNAVAILABLE',
      message: `The selected option for "${item.product.name}" is no longer available`,
    });
  } else if (availableStock === 0) {
    issues.push({
      itemId: item.id,
      code: 'OUT_OF_STOCK',
      message: `"${item.product.name}" is out of stock`,
    });
  } else if (item.quantity > availableStock) {
    issues.push({
      itemId: item.id,
      code: 'QUANTITY_REDUCED',
      message: `Only ${availableStock} left of "${item.product.name}" — quantity reduced`,
    });
  }

  const isAvailable = productSellable && variantSellable && availableStock > 0;
  // Show what can actually be bought, not what the row happens to say.
  const sellableQuantity = isAvailable ? Math.min(item.quantity, availableStock) : 0;

  const { unit, original } = resolveUnitPrice(item);
  const maxQuantity = Math.min(availableStock, CART.MAX_QUANTITY_PER_ITEM);

  return {
    unitPrice: unit,
    issues,
    view: {
      id: item.id,
      productId: item.productId,
      variantId: item.variantId,
      name: item.product.name,
      variantName: item.variant?.name ?? null,
      slug: item.product.slug,
      sku: item.variant?.sku ?? item.product.sku,
      imageUrl: item.variant?.imageUrl ?? item.product.images[0]?.url ?? null,
      attributes: item.variant?.attributes ?? null,
      unitPrice: toNumber(unit),
      originalPrice: toNumber(original),
      quantity: item.quantity,
      lineTotal: toNumber(multiply(unit, sellableQuantity)),
      availableStock,
      maxQuantity,
      isAvailable,
    },
  };
}

export function buildCartView(
  cart: { id: string; updatedAt: Date; items: CartItemRow[] },
  discountAmount: Prisma.Decimal = new Prisma.Decimal(0),
  appliedCode: string | null = null,
): CartView {
  const resolved = cart.items.map(resolveLine);

  // Unavailable lines stay visible (so the customer understands what changed) but
  // contribute nothing to the money.
  const billable = resolved
    .filter((line) => line.view.isAvailable)
    .map((line) => ({
      unitPrice: line.unitPrice,
      quantity: Math.min(line.view.quantity, line.view.availableStock),
    }));

  const subtotal = calculateSubtotal(billable);
  const totals = calculateTotals(subtotal, discountAmount);

  return {
    id: cart.id,
    items: resolved.map((line) => line.view),
    issues: resolved.flatMap((line) => line.issues),
    summary: {
      ...serializeTotals(totals),
      itemCount: resolved.length,
      totalQuantity: billable.reduce((sum, line) => sum + line.quantity, 0),
    },
    appliedCoupon: appliedCode
      ? { code: appliedCode, discountAmount: toNumber(totals.discountAmount) }
      : null,
    updatedAt: cart.updatedAt,
  };
}

/** The billable subtotal of a cart — unavailable lines and over-stock quantities excluded. */
export function cartSubtotal(items: CartItemRow[]): Prisma.Decimal {
  return calculateSubtotal(
    items
      .map(resolveLine)
      .filter((line) => line.view.isAvailable)
      .map((line) => ({
        unitPrice: line.unitPrice,
        quantity: Math.min(line.view.quantity, line.view.availableStock),
      })),
  );
}

export const cartService = {
  /**
   * Reads the cart, optionally priced with a coupon applied.
   *
   * The discount changes more than one line: it moves the free-shipping decision and the
   * GST base too. Computing it here — through the same `calculateTotals` the order is
   * created with — is what keeps the cart screen, the checkout summary and the stored
   * order showing one number. An unusable code is simply not applied; the apply action
   * is where the customer is told why.
   */
  async getCart(userId: string, couponCode?: string): Promise<CartView> {
    const cart = await cartRepository.findOrCreateByUserId(userId);

    if (!couponCode || cart.items.length === 0) return buildCartView(cart);

    try {
      const { discountAmount } = await couponService.validate(
        couponCode,
        userId,
        cartSubtotal(cart.items),
      );
      return buildCartView(cart, discountAmount, couponCode.toUpperCase());
    } catch {
      return buildCartView(cart);
    }
  },

  /**
   * Adds — or tops up — a line after checking the product is sellable and stock covers
   * the *resulting* quantity, not just the delta.
   */
  async addItem(userId: string, input: AddToCartInput): Promise<CartView> {
    const cart = await cartRepository.findOrCreateByUserId(userId);

    const product = await prisma.product.findFirst({
      where: { id: input.productId, deletedAt: null },
      include: { inventory: true },
    });

    if (!product) throw ApiError.notFound('Product not found', ErrorCode.PRODUCT_NOT_FOUND);
    if (product.status !== 'ACTIVE') {
      throw ApiError.badRequest('This product is not available for purchase', ErrorCode.PRODUCT_UNAVAILABLE);
    }

    let availableStock = product.inventory?.quantity ?? 0;
    const variantId = input.variantId ?? null;

    if (variantId) {
      const variant = await prisma.productVariant.findUnique({
        where: { id: variantId },
        include: { inventory: true },
      });

      if (!variant || variant.productId !== product.id) {
        throw ApiError.notFound('Product option not found', ErrorCode.VARIANT_NOT_FOUND);
      }
      if (!variant.isActive) {
        throw ApiError.badRequest('This option is no longer available', ErrorCode.PRODUCT_UNAVAILABLE);
      }
      availableStock = variant.inventory?.quantity ?? 0;
    }

    if (availableStock === 0) {
      throw ApiError.conflict('This item is out of stock', ErrorCode.OUT_OF_STOCK);
    }

    // Look up the line, decide the resulting quantity and write it under the cart's row
    // lock. Concurrent adds of the same item then queue instead of racing, so each one
    // tops up the single line and the limits below see the real running total.
    await prisma.$transaction(async (tx) => {
      await cartRepository.lockCart(cart.id, tx);

      const existing = await cartRepository.findExistingItem(cart.id, product.id, variantId, tx);
      const desiredQuantity = (existing?.quantity ?? 0) + input.quantity;

      if (desiredQuantity > CART.MAX_QUANTITY_PER_ITEM) {
        throw ApiError.badRequest(
          `You can order at most ${CART.MAX_QUANTITY_PER_ITEM} of this item`,
          ErrorCode.MAX_QUANTITY_EXCEEDED,
        );
      }

      if (desiredQuantity > availableStock) {
        throw ApiError.conflict(
          `Only ${availableStock} unit(s) available`,
          ErrorCode.INSUFFICIENT_STOCK,
          { availableStock },
        );
      }

      if (!existing) {
        const distinctItems = await cartRepository.countItems(cart.id, tx);
        if (distinctItems >= CART.MAX_DISTINCT_ITEMS) {
          throw ApiError.badRequest(
            `A cart can hold at most ${CART.MAX_DISTINCT_ITEMS} different items`,
          );
        }
      }

      if (existing) {
        await cartRepository.updateItemQuantity(existing.id, desiredQuantity, tx);
      } else {
        await cartRepository.createItem(
          {
            cartId: cart.id,
            productId: product.id,
            variantId,
            quantity: input.quantity,
          },
          tx,
        );
      }
    });

    return this.getCart(userId);
  },

  async updateItem(userId: string, itemId: string, quantity: number): Promise<CartView> {
    const cart = await cartRepository.findOrCreateByUserId(userId);
    const item = cart.items.find((candidate) => candidate.id === itemId);

    // Scoped to the caller's own cart — an item id from another user is a 404, not a 403,
    // so the endpoint does not confirm that the id exists.
    if (!item) throw ApiError.notFound('Cart item not found', ErrorCode.CART_ITEM_NOT_FOUND);

    if (quantity === 0) {
      await cartRepository.deleteItem(itemId);
      return this.getCart(userId);
    }

    const availableStock = (item.variant ? item.variant.inventory : item.product.inventory)?.quantity ?? 0;
    if (quantity > availableStock) {
      throw ApiError.conflict(`Only ${availableStock} unit(s) available`, ErrorCode.INSUFFICIENT_STOCK, {
        availableStock,
      });
    }

    await cartRepository.updateItemQuantity(itemId, quantity);
    return this.getCart(userId);
  },

  async removeItem(userId: string, itemId: string): Promise<CartView> {
    const cart = await cartRepository.findOrCreateByUserId(userId);
    const item = cart.items.find((candidate) => candidate.id === itemId);
    if (!item) throw ApiError.notFound('Cart item not found', ErrorCode.CART_ITEM_NOT_FOUND);

    await cartRepository.deleteItem(itemId);
    return this.getCart(userId);
  },

  async clear(userId: string): Promise<CartView> {
    const cart = await cartRepository.findOrCreateByUserId(userId);
    await cartRepository.clear(cart.id);
    return this.getCart(userId);
  },

  /** Drops lines that can no longer be bought and clamps the rest to available stock. */
  async reconcile(userId: string): Promise<CartView> {
    const cart = await cartRepository.findOrCreateByUserId(userId);

    await prisma.$transaction(async (tx) => {
      for (const item of cart.items) {
        const sellable =
          item.product.status === 'ACTIVE' &&
          item.product.deletedAt === null &&
          (item.variant ? item.variant.isActive : true);
        const stock = (item.variant ? item.variant.inventory : item.product.inventory)?.quantity ?? 0;

        if (!sellable || stock === 0) {
          await cartRepository.deleteItem(item.id, tx);
        } else if (item.quantity > stock) {
          await cartRepository.updateItemQuantity(item.id, stock, tx);
        }
      }
    });

    return this.getCart(userId);
  },
};
