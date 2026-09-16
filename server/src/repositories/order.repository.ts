import { randomBytes } from 'node:crypto';

import type { OrderStatus, PaymentStatus, Prisma } from '@prisma/client';

import { ORDERS } from '@/config/constants';
import { prisma, type PrismaTransactionClient } from '@/lib/prisma';

export const orderDetailInclude = {
  items: { orderBy: { createdAt: 'asc' } },
  payments: { orderBy: { createdAt: 'desc' } },
  events: { orderBy: { createdAt: 'asc' } },
  user: { select: { id: true, email: true, firstName: true, lastName: true, phone: true } },
} satisfies Prisma.OrderInclude;

export const orderListInclude = {
  items: {
    select: { id: true, name: true, imageUrl: true, quantity: true, unitPrice: true, variantName: true },
    orderBy: { createdAt: 'asc' },
  },
  _count: { select: { items: true } },
} satisfies Prisma.OrderInclude;

export type OrderDetailRow = Prisma.OrderGetPayload<{ include: typeof orderDetailInclude }>;
export type OrderListRow = Prisma.OrderGetPayload<{ include: typeof orderListInclude }>;

/** The fields every guarded transition needs to decide what it is allowed to do. */
export interface OrderLockState {
  id: string;
  status: OrderStatus;
  paymentStatus: PaymentStatus;
  stockReserved: boolean;
  couponId: string | null;
}

/**
 * Human-facing order number: `SW-240815-8F2A1C`. Date-prefixed so support can eyeball
 * roughly when an order was placed, random-suffixed so numbers are not enumerable —
 * a sequential id would let anyone guess how many orders the shop has taken.
 */
export function generateOrderNumber(): string {
  const now = new Date();
  const datePart = [
    now.getFullYear().toString().slice(-2),
    String(now.getMonth() + 1).padStart(2, '0'),
    String(now.getDate()).padStart(2, '0'),
  ].join('');

  return `${ORDERS.NUMBER_PREFIX}-${datePart}-${randomBytes(3).toString('hex').toUpperCase()}`;
}

export const orderRepository = {
  async findManyForUser(userId: string, where: Prisma.OrderWhereInput, skip: number, take: number) {
    const scoped: Prisma.OrderWhereInput = { ...where, userId };

    const [items, total] = await prisma.$transaction([
      prisma.order.findMany({
        where: scoped,
        orderBy: { createdAt: 'desc' },
        skip,
        take,
        include: orderListInclude,
      }),
      prisma.order.count({ where: scoped }),
    ]);

    return { items, total };
  },

  async findManyAdmin(where: Prisma.OrderWhereInput, skip: number, take: number) {
    const [items, total] = await prisma.$transaction([
      prisma.order.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take,
        include: {
          ...orderListInclude,
          user: { select: { id: true, email: true, firstName: true, lastName: true } },
        },
      }),
      prisma.order.count({ where }),
    ]);

    return { items, total };
  },

  findById(id: string): Promise<OrderDetailRow | null> {
    return prisma.order.findUnique({ where: { id }, include: orderDetailInclude });
  },

  /** Ownership folded into the query so a foreign order id is simply "not found". */
  findOwned(id: string, userId: string): Promise<OrderDetailRow | null> {
    return prisma.order.findFirst({ where: { id, userId }, include: orderDetailInclude });
  },

  findByOrderNumber(orderNumber: string): Promise<OrderDetailRow | null> {
    return prisma.order.findUnique({ where: { orderNumber }, include: orderDetailInclude });
  },

  findByRazorpayOrderId(razorpayOrderId: string) {
    return prisma.payment.findUnique({
      where: { razorpayOrderId },
      include: { order: { include: orderDetailInclude } },
    });
  },

  /**
   * Takes the row lock for an order and returns its *current* state.
   *
   * Cancellation, payment capture and refunds all read an order, decide what to do, then
   * write stock and status. Without a lock two of those can interleave between the read
   * and the write and both act on the same state — restoring stock twice, or confirming
   * an order that was cancelled a millisecond earlier. Every such transaction takes this
   * lock first, so they queue instead of racing, and each one sees what the previous one
   * committed.
   */
  async lockById(
    id: string,
    client: PrismaTransactionClient,
  ): Promise<OrderLockState | null> {
    const rows = await client.$queryRaw<OrderLockState[]>`
      SELECT id, status, "paymentStatus", "stockReserved", "couponId"
      FROM orders
      WHERE id = ${id}
      FOR UPDATE
    `;
    return rows[0] ?? null;
  },

  updateStatus(
    id: string,
    status: OrderStatus,
    extra: Prisma.OrderUpdateInput = {},
    client: PrismaTransactionClient = prisma,
  ) {
    return client.order.update({ where: { id }, data: { status, ...extra } });
  },

  addEvent(
    data: { orderId: string; status: OrderStatus; note?: string; actorId?: string },
    client: PrismaTransactionClient = prisma,
  ) {
    return client.orderEvent.create({ data });
  },

  countByStatus(status: OrderStatus): Promise<number> {
    return prisma.order.count({ where: { status } });
  },

  /** Order items for a delivered order — the verified-purchase check for reviews. */
  findDeliveredItemForProduct(userId: string, productId: string) {
    return prisma.orderItem.findFirst({
      where: { productId, order: { userId, status: 'DELIVERED' } },
      orderBy: { createdAt: 'desc' },
    });
  },

  hasPurchased(userId: string, productId: string): Promise<boolean> {
    return prisma.orderItem
      .count({
        where: {
          productId,
          order: { userId, status: { in: ['DELIVERED', 'SHIPPED', 'OUT_FOR_DELIVERY'] } },
        },
      })
      .then((count) => count > 0);
  },
};
