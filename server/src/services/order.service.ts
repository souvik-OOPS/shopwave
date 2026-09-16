import { Prisma, type OrderStatus } from '@prisma/client';

import { CUSTOMER_CANCELLABLE_STATUSES, ORDERS, ORDER_STATUS_TRANSITIONS } from '@/config/constants';
import { logger } from '@/lib/logger';
import { sendOrderConfirmationEmail, sendOrderStatusEmail } from '@/lib/mailer';
import { prisma, type PrismaTransactionClient } from '@/lib/prisma';
import { addressRepository } from '@/repositories/address.repository';
import { cartRepository, type CartItemRow } from '@/repositories/cart.repository';
import { couponRepository } from '@/repositories/coupon.repository';
import { inventoryRepository } from '@/repositories/inventory.repository';
import {
  generateOrderNumber,
  orderRepository,
  type OrderDetailRow,
  type OrderListRow,
} from '@/repositories/order.repository';
import { couponService } from '@/services/coupon.service';
import { calculateSubtotal, calculateTotals } from '@/services/pricing.service';
import type {
  AdminOrderQuery,
  CheckoutInput,
  OrderQuery,
  UpdateOrderStatusInput,
} from '@/schemas/order.schema';
import { ApiError, ErrorCode } from '@/utils/ApiError';
import { effectivePrice, multiply, toNumber } from '@/utils/money';
import { resolvePagination } from '@/utils/pagination';
import { decimalsToNumbers } from '@/utils/serializers';

interface PreparedLine {
  item: CartItemRow;
  inventoryId: string;
  unitPrice: Prisma.Decimal;
  originalPrice: Prisma.Decimal;
  quantity: number;
}

export function serializeOrder(order: OrderDetailRow) {
  return decimalsToNumbers({
    ...order,
    itemCount: order.items.length,
    totalQuantity: order.items.reduce((sum, item) => sum + item.quantity, 0),
  });
}

function serializeOrderListItem(order: OrderListRow) {
  return decimalsToNumbers({
    ...order,
    itemCount: order._count.items,
  });
}

/**
 * Reads the cart and turns it into priced, stock-backed lines — or refuses.
 *
 * This is where "never trust the client" is enforced: `unitPrice` comes from the
 * product/variant row, not from anything the browser sent.
 */
async function prepareLines(
  userId: string,
  client: PrismaTransactionClient = prisma,
): Promise<PreparedLine[]> {
  const cart = await cartRepository.findOrCreateByUserId(userId, client);

  if (cart.items.length === 0) {
    throw ApiError.badRequest('Your cart is empty', ErrorCode.CART_EMPTY);
  }

  const lines: PreparedLine[] = [];

  for (const item of cart.items) {
    const productSellable = item.product.status === 'ACTIVE' && item.product.deletedAt === null;
    if (!productSellable) {
      throw ApiError.conflict(
        `"${item.product.name}" is no longer available. Please remove it to continue.`,
        ErrorCode.PRODUCT_UNAVAILABLE,
      );
    }

    if (item.variant && !item.variant.isActive) {
      throw ApiError.conflict(
        `The selected option for "${item.product.name}" is no longer available.`,
        ErrorCode.PRODUCT_UNAVAILABLE,
      );
    }

    const inventory = item.variant ? item.variant.inventory : item.product.inventory;
    if (!inventory) {
      throw ApiError.conflict(
        `"${item.product.name}" cannot be ordered right now`,
        ErrorCode.PRODUCT_UNAVAILABLE,
      );
    }

    // Advisory check for a clear error message. The authoritative one is the atomic
    // reservation inside the transaction below.
    if (inventory.quantity < item.quantity) {
      throw ApiError.conflict(
        inventory.quantity === 0
          ? `"${item.product.name}" is out of stock`
          : `Only ${inventory.quantity} unit(s) of "${item.product.name}" remain`,
        ErrorCode.INSUFFICIENT_STOCK,
        { productId: item.productId, available: inventory.quantity },
      );
    }

    const usesVariantPrice = item.variant && item.variant.price !== null;
    const unitPrice = usesVariantPrice
      ? effectivePrice(item.variant!.price!, item.variant!.discountPrice)
      : effectivePrice(item.product.price, item.product.discountPrice);
    const originalPrice = usesVariantPrice ? item.variant!.price! : item.product.price;

    lines.push({
      item,
      inventoryId: inventory.id,
      unitPrice,
      originalPrice,
      quantity: item.quantity,
    });
  }

  return lines;
}

export const orderService = {
  /**
   * Creates a PENDING order.
   *
   * Everything that must not partially apply happens inside one transaction:
   * stock reservation, coupon slot claim, order + items + event creation, and clearing
   * the cart. If any step fails — most importantly, if another buyer takes the last
   * unit between the check and the write — the whole thing rolls back and no stock,
   * coupon budget or order row is consumed.
   */
  async checkout(userId: string, input: CheckoutInput) {
    const address = await addressRepository.findOwned(input.addressId, userId);
    if (!address) throw ApiError.notFound('Delivery address not found', ErrorCode.ADDRESS_NOT_FOUND);

    const orderId = await prisma.$transaction(
      async (tx) => {
        // The cart is read *inside* the transaction. Reading it outside would let two
        // concurrent submissions of the same cart each prepare the same lines and each
        // create an order from them.
        const lines = await prepareLines(userId, tx);

        const subtotal = calculateSubtotal(
          lines.map((line) => ({ unitPrice: line.unitPrice, quantity: line.quantity })),
        );

        // Coupon is re-validated here against the live subtotal, regardless of what the
        // cart screen previously showed.
        const couponResult = input.couponCode
          ? await couponService.validate(input.couponCode, userId, subtotal, tx)
          : null;

        const totals = calculateTotals(subtotal, couponResult?.discountAmount);

        // Claim the cart by emptying it, and require every prepared line to still be
        // there. The DELETE takes row locks, so a duplicate submission waits here and
        // then finds nothing to claim — exactly one request can turn a cart into an order.
        const claimedCart = await cartRepository.clear(lines[0].item.cartId, tx);
        if (claimedCart.count !== lines.length) {
          throw ApiError.conflict(
            'This cart was already checked out. Please review your orders.',
            ErrorCode.CART_ALREADY_CHECKED_OUT,
          );
        }

        for (const line of lines) {
          const reserved = await inventoryRepository.reserve(line.inventoryId, line.quantity, tx);
          if (!reserved) {
            // Lost the race for the last unit(s) — abort everything.
            throw ApiError.conflict(
              `"${line.item.product.name}" just sold out. Please adjust your cart.`,
              ErrorCode.INSUFFICIENT_STOCK,
              { productId: line.item.productId },
            );
          }
        }

        if (couponResult) {
          const claimed = await couponRepository.claimUsageSlot(couponResult.coupon.id, tx);
          if (!claimed) {
            throw ApiError.badRequest(
              'This coupon has reached its usage limit',
              ErrorCode.COUPON_USAGE_LIMIT_REACHED,
            );
          }

          // `validate` above already checked this limit, but against whatever was
          // committed at that moment. `claimUsageSlot` has since updated the coupon row,
          // which serialises concurrent redemptions of the same code — so this second
          // count is the one that can actually see a rival checkout's redemption.
          await couponService.assertPerUserLimit(couponResult.coupon, userId, tx);
        }

        const order = await tx.order.create({
          data: {
            orderNumber: generateOrderNumber(),
            userId,
            status: 'PENDING',
            paymentStatus: 'PENDING',
            paymentMethod: input.paymentMethod,
            subtotal: totals.subtotal,
            discountAmount: totals.discountAmount,
            shippingAmount: totals.shippingAmount,
            taxAmount: totals.taxAmount,
            total: totals.total,
            stockReserved: true,
            shippingName: address.fullName,
            shippingPhone: address.phone,
            shippingLine1: address.line1,
            shippingCity: address.city,
            shippingState: address.state,
            shippingPostalCode: address.postalCode,
            shippingCountry: address.country,
            ...(address.line2 ? { shippingLine2: address.line2 } : {}),
            ...(input.customerNote ? { customerNote: input.customerNote } : {}),
            ...(couponResult
              ? { couponId: couponResult.coupon.id, couponCode: couponResult.coupon.code }
              : {}),
            items: {
              createMany: {
                // The snapshot. Nothing here is a foreign key lookup at render time,
                // so editing or deleting the product later cannot rewrite this order.
                data: lines.map((line) => ({
                  productId: line.item.productId,
                  variantId: line.item.variantId,
                  name: line.item.product.name,
                  slug: line.item.product.slug,
                  sku: line.item.variant?.sku ?? line.item.product.sku,
                  imageUrl: line.item.variant?.imageUrl ?? line.item.product.images[0]?.url ?? null,
                  variantName: line.item.variant?.name ?? null,
                  attributes: (line.item.variant?.attributes ?? {}),
                  unitPrice: line.unitPrice,
                  originalPrice: line.originalPrice,
                  quantity: line.quantity,
                  lineTotal: multiply(line.unitPrice, line.quantity),
                })),
              },
            },
          },
        });

        await tx.orderEvent.create({
          data: { orderId: order.id, status: 'PENDING', note: 'Order placed' },
        });

        if (couponResult) {
          await couponRepository.recordUsage(
            {
              couponId: couponResult.coupon.id,
              userId,
              orderId: order.id,
              discountAmount: totals.discountAmount,
            },
            tx,
          );
        }

        return order.id;
      },
      { timeout: 15_000, isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted },
    );

    const order = await orderRepository.findById(orderId);
    if (!order) throw ApiError.internal('Order was created but could not be read back');

    return serializeOrder(order);
  },

  async listForUser(userId: string, query: OrderQuery) {
    const { skip, take, page, limit } = resolvePagination(query);
    const { items, total } = await orderRepository.findManyForUser(
      userId,
      query.status ? { status: query.status } : {},
      skip,
      take,
    );

    return { items: items.map(serializeOrderListItem), total, page, limit };
  },

  async getForUser(userId: string, orderId: string) {
    const order = await orderRepository.findOwned(orderId, userId);
    if (!order) throw ApiError.notFound('Order not found', ErrorCode.ORDER_NOT_FOUND);
    return serializeOrder(order);
  },

  /**
   * Customer cancellation. Restores stock and returns the coupon slot, so a cancelled
   * order never permanently consumes either.
   */
  async cancel(userId: string, orderId: string, reason?: string) {
    const order = await orderRepository.findOwned(orderId, userId);
    if (!order) throw ApiError.notFound('Order not found', ErrorCode.ORDER_NOT_FOUND);

    if (!(CUSTOMER_CANCELLABLE_STATUSES as readonly string[]).includes(order.status)) {
      throw ApiError.conflict(
        `An order that is ${order.status.toLowerCase().replace(/_/g, ' ')} can no longer be cancelled`,
        ErrorCode.ORDER_NOT_CANCELLABLE,
      );
    }

    await this.applyCancellation(order, reason ?? 'Cancelled by customer', userId);
    return this.getForUser(userId, orderId);
  },

  /**
   * Shared by customer cancel, admin cancel and payment-failure cleanup.
   *
   * Cancelling is not idempotent by nature — it hands stock back and returns a coupon
   * slot — so the transaction locks the order row first and re-reads its state. The
   * second of two simultaneous cancellations finds the order already CANCELLED and does
   * nothing, rather than crediting the same units twice.
   */
  async applyCancellation(order: OrderDetailRow, reason: string, actorId?: string): Promise<void> {
    await prisma.$transaction(async (tx) => {
      const current = await orderRepository.lockById(order.id, tx);
      if (!current || current.status === 'CANCELLED' || current.status === 'REFUNDED') return;

      // Stock sits in one of two places, and each is returned differently:
      //   • reservation still open (unpaid) → move the units back from reserved to available
      //   • reservation already committed at payment → the units were sold, so restock
      //     them outright; `reserved` was cleared when the sale completed.
      const stockWasConsumed = !current.stockReserved && current.paymentStatus === 'PAID';

      if (current.stockReserved || stockWasConsumed) {
        for (const item of order.items) {
          const inventory = await inventoryRepository.findForSelection(
            item.productId ?? '',
            item.variantId,
          );
          if (!inventory) continue;

          if (current.stockReserved) {
            await inventoryRepository.releaseReservation(inventory.id, item.quantity, tx);
          } else {
            await inventoryRepository.restock(inventory.id, item.quantity, tx);
          }
        }
      }

      if (current.couponId) {
        await couponRepository.releaseUsageSlot(current.couponId, tx);
        await couponRepository.deleteUsageForOrder(order.id, tx);
      }

      await tx.order.update({
        where: { id: order.id },
        data: {
          status: 'CANCELLED',
          cancelledAt: new Date(),
          cancellationReason: reason,
          stockReserved: false,
        },
      });

      await tx.orderEvent.create({
        data: {
          orderId: order.id,
          status: 'CANCELLED',
          note: reason,
          ...(actorId ? { actorId } : {}),
        },
      });
    });
  },

  async requestReturn(userId: string, orderId: string, reason: string) {
    const order = await orderRepository.findOwned(orderId, userId);
    if (!order) throw ApiError.notFound('Order not found', ErrorCode.ORDER_NOT_FOUND);

    if (order.status !== 'DELIVERED') {
      throw ApiError.conflict('Only delivered orders can be returned', ErrorCode.ORDER_NOT_RETURNABLE);
    }

    const deliveredAt = order.deliveredAt ?? order.updatedAt;
    const daysSinceDelivery = (Date.now() - deliveredAt.getTime()) / (1000 * 60 * 60 * 24);

    if (daysSinceDelivery > ORDERS.RETURN_WINDOW_DAYS) {
      throw ApiError.conflict(
        `The ${ORDERS.RETURN_WINDOW_DAYS}-day return window for this order has closed`,
        ErrorCode.ORDER_NOT_RETURNABLE,
      );
    }

    await prisma.$transaction(async (tx) => {
      await tx.order.update({
        where: { id: orderId },
        data: { status: 'RETURN_REQUESTED', returnRequestedAt: new Date(), returnReason: reason },
      });
      await tx.orderEvent.create({
        data: { orderId, status: 'RETURN_REQUESTED', note: reason, actorId: userId },
      });
    });

    return this.getForUser(userId, orderId);
  },

  // ----- admin ------------------------------------------------------------

  async listAdmin(query: AdminOrderQuery) {
    const { skip, take, page, limit } = resolvePagination(query);

    const where: Prisma.OrderWhereInput = {
      ...(query.status ? { status: query.status } : {}),
      ...(query.paymentStatus ? { paymentStatus: query.paymentStatus } : {}),
      ...(query.from || query.to
        ? {
            createdAt: {
              ...(query.from ? { gte: query.from } : {}),
              ...(query.to ? { lte: query.to } : {}),
            },
          }
        : {}),
      ...(query.q
        ? {
            OR: [
              { orderNumber: { contains: query.q, mode: 'insensitive' } },
              { shippingName: { contains: query.q, mode: 'insensitive' } },
              { shippingPhone: { contains: query.q } },
              { user: { email: { contains: query.q, mode: 'insensitive' } } },
            ],
          }
        : {}),
    };

    const { items, total } = await orderRepository.findManyAdmin(where, skip, take);
    return { items: items.map((item) => decimalsToNumbers(item)), total, page, limit };
  },

  async getAdmin(orderId: string) {
    const order = await orderRepository.findById(orderId);
    if (!order) throw ApiError.notFound('Order not found', ErrorCode.ORDER_NOT_FOUND);
    return serializeOrder(order);
  },

  /**
   * Staff status changes, gated by the transition whitelist. Attempting an illegal jump
   * (e.g. PENDING → DELIVERED) is a 409 describing what *is* allowed, not a silent write.
   */
  async updateStatus(orderId: string, input: UpdateOrderStatusInput, actorId: string) {
    const order = await orderRepository.findById(orderId);
    if (!order) throw ApiError.notFound('Order not found', ErrorCode.ORDER_NOT_FOUND);

    if (order.status === input.status) return serializeOrder(order);

    const allowed: readonly string[] = ORDER_STATUS_TRANSITIONS[order.status] ?? [];
    if (!allowed.includes(input.status)) {
      throw ApiError.conflict(
        `Cannot move an order from ${order.status} to ${input.status}`,
        ErrorCode.INVALID_STATUS_TRANSITION,
        { from: order.status, to: input.status, allowed },
      );
    }

    // REFUNDED is not a label staff can apply: it asserts that money went back to the
    // customer. Only the ADMIN refund endpoint sets it, and only after the gateway has
    // actually processed the refund — otherwise the order and the accounting would claim
    // a refund that never happened.
    if (input.status === 'REFUNDED') {
      throw ApiError.conflict(
        'Refund an order through the refund action so the payment is actually returned',
        ErrorCode.REFUND_REQUIRES_GATEWAY,
        { orderId, paymentStatus: order.paymentStatus },
      );
    }

    if (input.status === 'CANCELLED') {
      await this.applyCancellation(order, input.note ?? 'Cancelled by store', actorId);
      return this.getAdmin(orderId);
    }

    const timestamps: Partial<Record<OrderStatus, Prisma.OrderUpdateInput>> = {
      CONFIRMED: { confirmedAt: new Date() },
      SHIPPED: { shippedAt: new Date() },
      DELIVERED: { deliveredAt: new Date() },
    };

    await prisma.$transaction(async (tx) => {
      await orderRepository.updateStatus(orderId, input.status, timestamps[input.status] ?? {}, tx);

      // A return that is accepted puts the goods back on the shelf.
      if (input.status === 'RETURNED') {
        for (const item of order.items) {
          const inventory = await inventoryRepository.findForSelection(item.productId ?? '', item.variantId);
          if (inventory) await inventoryRepository.restock(inventory.id, item.quantity, tx);
        }
      }

      await orderRepository.addEvent(
        {
          orderId,
          status: input.status,
          ...(input.note ? { note: input.note } : {}),
          actorId,
        },
        tx,
      );
    });

    if (order.user?.email) {
      void sendOrderStatusEmail(order.user.email, {
        firstName: order.user.firstName,
        orderNumber: order.orderNumber,
        status: input.status,
      });
    }

    return this.getAdmin(orderId);
  },

  /**
   * Called by the payment layer once a payment is confirmed by Razorpay.
   *
   * Both the browser handshake and the webhook land here, sometimes at the same instant
   * and sometimes long after the order moved on, so the confirmation is claimed under the
   * order's row lock. Exactly one caller commits the reservation, increments `soldCount`
   * and writes the confirmation event; everyone else is a no-op.
   */
  async markPaidAndConfirm(orderId: string): Promise<void> {
    const order = await orderRepository.findById(orderId);
    if (!order) return;

    const confirmed = await prisma.$transaction(async (tx) => {
      const current = await orderRepository.lockById(orderId, tx);
      if (!current) return false;

      // A cancelled order has already given its stock back. Confirming it now would
      // create a sale with no inventory behind it, so the money is recorded against the
      // order and flagged for refund instead.
      if (current.status === 'CANCELLED' || current.status === 'REFUNDED') {
        if (current.paymentStatus !== 'PAID') {
          await tx.order.update({ where: { id: orderId }, data: { paymentStatus: 'PAID' } });
          await tx.orderEvent.create({
            data: {
              orderId,
              status: current.status,
              note: 'Payment captured after cancellation — refund required',
            },
          });
        }
        logger.warn({ orderId, status: current.status }, 'Capture arrived for a cancelled order');
        return false;
      }

      // Already confirmed by whichever of the two paths arrived first.
      if (current.paymentStatus === 'PAID' && current.status !== 'PENDING') return false;

      if (current.stockReserved) {
        for (const item of order.items) {
          const inventory = await inventoryRepository.findForSelection(item.productId ?? '', item.variantId);
          if (inventory) await inventoryRepository.commitReservation(inventory.id, item.quantity, tx);
        }
      }

      // Sales counters drive the "best sellers" ranking.
      for (const item of order.items) {
        if (item.productId) {
          await tx.product.update({
            where: { id: item.productId },
            data: { soldCount: { increment: item.quantity } },
          });
        }
      }

      await tx.order.update({
        where: { id: orderId },
        data: {
          status: 'CONFIRMED',
          paymentStatus: 'PAID',
          confirmedAt: new Date(),
          stockReserved: false,
        },
      });

      await tx.orderEvent.create({
        data: { orderId, status: 'CONFIRMED', note: 'Payment received' },
      });

      return true;
    });

    if (!confirmed) return;

    if (order.user?.email) {
      void sendOrderConfirmationEmail(order.user.email, {
        firstName: order.user.firstName,
        orderNumber: order.orderNumber,
        total: `₹${toNumber(order.total).toLocaleString('en-IN')}`,
        itemCount: order.items.length,
      });
    }

    logger.info({ orderId, orderNumber: order.orderNumber }, 'Order confirmed after payment');
  },

  /** Payment failed or was abandoned: release the hold so the stock is sellable again. */
  async releaseFailedOrder(orderId: string, reason: string): Promise<void> {
    const order = await orderRepository.findById(orderId);
    if (!order || order.paymentStatus === 'PAID' || order.status === 'CANCELLED') return;

    await this.applyCancellation(order, reason);
  },
};
