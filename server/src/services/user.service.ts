import { type Prisma, type Role } from '@prisma/client';

import { prisma } from '@/lib/prisma';
import { userRepository } from '@/repositories/user.repository';
import type { AdminUpdateUserInput, AdminUserQuery } from '@/schemas/user.schema';
import { ApiError, ErrorCode } from '@/utils/ApiError';
import { toNumber } from '@/utils/money';
import { resolvePagination } from '@/utils/pagination';

const adminUserSelect = {
  id: true,
  email: true,
  firstName: true,
  lastName: true,
  phone: true,
  avatarUrl: true,
  role: true,
  isActive: true,
  emailVerified: true,
  lastLoginAt: true,
  createdAt: true,
  _count: { select: { orders: true, reviews: true } },
} satisfies Prisma.UserSelect;

function buildOrderBy(sort: AdminUserQuery['sort']): Prisma.UserOrderByWithRelationInput {
  switch (sort) {
    case 'oldest':
      return { createdAt: 'asc' };
    case 'name':
      return { firstName: 'asc' };
    case 'orders':
      return { orders: { _count: 'desc' } };
    case 'newest':
    default:
      return { createdAt: 'desc' };
  }
}

export const userService = {
  async list(query: AdminUserQuery) {
    const { skip, take, page, limit } = resolvePagination(query);

    const where: Prisma.UserWhereInput = {
      ...(query.role ? { role: query.role } : {}),
      ...(query.isActive !== undefined ? { isActive: query.isActive } : {}),
      ...(query.q
        ? {
            OR: [
              { email: { contains: query.q, mode: 'insensitive' } },
              { firstName: { contains: query.q, mode: 'insensitive' } },
              { lastName: { contains: query.q, mode: 'insensitive' } },
              { phone: { contains: query.q } },
            ],
          }
        : {}),
    };

    const [items, total] = await prisma.$transaction([
      prisma.user.findMany({ where, orderBy: buildOrderBy(query.sort), skip, take, select: adminUserSelect }),
      prisma.user.count({ where }),
    ]);

    return {
      items: items.map(({ _count, ...user }) => ({
        ...user,
        orderCount: _count.orders,
        reviewCount: _count.reviews,
      })),
      total,
      page,
      limit,
    };
  },

  /** Customer detail for support: profile, lifetime value and recent orders. */
  async get(userId: string) {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        ...adminUserSelect,
        addresses: true,
        orders: {
          orderBy: { createdAt: 'desc' },
          take: 10,
          select: {
            id: true,
            orderNumber: true,
            status: true,
            paymentStatus: true,
            total: true,
            createdAt: true,
          },
        },
      },
    });

    if (!user) throw ApiError.notFound('User not found', ErrorCode.USER_NOT_FOUND);

    const spend = await prisma.order.aggregate({
      where: { userId, paymentStatus: 'PAID', status: { notIn: ['CANCELLED', 'REFUNDED'] } },
      _sum: { total: true },
      _count: { _all: true },
    });

    const { _count, orders, ...rest } = user;

    return {
      ...rest,
      orderCount: _count.orders,
      reviewCount: _count.reviews,
      lifetimeValue: spend._sum.total ? toNumber(spend._sum.total) : 0,
      paidOrderCount: spend._count._all,
      recentOrders: orders.map((order) => ({ ...order, total: toNumber(order.total) })),
    };
  },

  /**
   * Two self-inflicted-outage guards: an admin cannot disable or demote themselves,
   * and the last remaining admin cannot be removed. Both are cheap to check and
   * expensive to recover from.
   */
  async update(actorId: string, userId: string, input: AdminUpdateUserInput) {
    const target = await userRepository.findById(userId);
    if (!target) throw ApiError.notFound('User not found', ErrorCode.USER_NOT_FOUND);

    if (userId === actorId) {
      if (input.isActive === false) {
        throw ApiError.badRequest('You cannot disable your own account', ErrorCode.CANNOT_MODIFY_SELF);
      }
      if (input.role && input.role !== target.role) {
        throw ApiError.badRequest('You cannot change your own role', ErrorCode.CANNOT_MODIFY_SELF);
      }
    }

    const losingAdmin =
      target.role === 'ADMIN' && ((input.role && input.role !== 'ADMIN') || input.isActive === false);

    if (losingAdmin) {
      const activeAdmins = await prisma.user.count({ where: { role: 'ADMIN', isActive: true } });
      if (activeAdmins <= 1) {
        throw ApiError.conflict('The last active administrator cannot be demoted or disabled');
      }
    }

    const updated = await prisma.user.update({
      where: { id: userId },
      data: input,
      select: adminUserSelect,
    });

    // Disabling or re-roling must take effect immediately, not when the token expires.
    if (input.isActive === false || (input.role && input.role !== target.role)) {
      await prisma.$transaction([
        prisma.user.update({ where: { id: userId }, data: { tokenVersion: { increment: 1 } } }),
        prisma.refreshToken.updateMany({
          where: { userId, revokedAt: null },
          data: { revokedAt: new Date() },
        }),
      ]);
    }

    const { _count, ...rest } = updated;
    return { ...rest, orderCount: _count.orders, reviewCount: _count.reviews };
  },

  async stats(): Promise<{ total: number; byRole: Record<Role, number>; active: number }> {
    const [total, active, byRole] = await Promise.all([
      prisma.user.count(),
      prisma.user.count({ where: { isActive: true } }),
      prisma.user.groupBy({ by: ['role'], _count: { role: true } }),
    ]);

    return {
      total,
      active,
      byRole: Object.fromEntries(byRole.map((row) => [row.role, row._count.role])) as Record<Role, number>,
    };
  },
};
