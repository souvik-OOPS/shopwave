import { type Prisma } from '@prisma/client';

import { CACHE_TTL } from '@/config/constants';
import { prisma } from '@/lib/prisma';
import { cacheRemember } from '@/lib/redis';
import { inventoryRepository } from '@/repositories/inventory.repository';
import { productRepository } from '@/repositories/product.repository';
import { toNumber } from '@/utils/money';

/**
 * Revenue counts only orders that were actually paid for. Including PENDING orders
 * would inflate every figure on the dashboard with abandoned checkouts.
 */
const PAID_ORDER_FILTER: Prisma.OrderWhereInput = {
  paymentStatus: 'PAID',
  status: { notIn: ['CANCELLED', 'REFUNDED'] },
};

function startOfToday(): Date {
  const date = new Date();
  date.setHours(0, 0, 0, 0);
  return date;
}

function startOfMonth(): Date {
  const date = new Date();
  date.setDate(1);
  date.setHours(0, 0, 0, 0);
  return date;
}

async function revenueSince(since?: Date): Promise<number> {
  const result = await prisma.order.aggregate({
    where: { ...PAID_ORDER_FILTER, ...(since ? { createdAt: { gte: since } } : {}) },
    _sum: { total: true },
  });
  return result._sum.total ? toNumber(result._sum.total) : 0;
}

export const dashboardService = {
  async summary() {
    return cacheRemember('dashboard:summary', CACHE_TTL.DASHBOARD, async () => {
      const today = startOfToday();
      const monthStart = startOfMonth();

      // Independent aggregates, so they run concurrently rather than in series.
      const [
        totalRevenue,
        todayRevenue,
        monthRevenue,
        totalOrders,
        pendingOrders,
        todayOrders,
        totalCustomers,
        newCustomersThisMonth,
        totalProducts,
        lowStockCount,
        outOfStockCount,
        statusBreakdown,
      ] = await Promise.all([
        revenueSince(),
        revenueSince(today),
        revenueSince(monthStart),
        prisma.order.count(),
        prisma.order.count({ where: { status: 'PENDING' } }),
        prisma.order.count({ where: { createdAt: { gte: today } } }),
        prisma.user.count({ where: { role: 'CUSTOMER' } }),
        prisma.user.count({ where: { role: 'CUSTOMER', createdAt: { gte: monthStart } } }),
        prisma.product.count({ where: { deletedAt: null } }),
        inventoryRepository.countLowStock(),
        inventoryRepository.countOutOfStock(),
        prisma.order.groupBy({ by: ['status'], _count: { status: true } }),
      ]);

      const averageOrderValue = totalOrders > 0 ? Number((totalRevenue / totalOrders).toFixed(2)) : 0;

      return {
        revenue: {
          total: totalRevenue,
          today: todayRevenue,
          month: monthRevenue,
          averageOrderValue,
        },
        orders: {
          total: totalOrders,
          pending: pendingOrders,
          today: todayOrders,
          byStatus: Object.fromEntries(statusBreakdown.map((row) => [row.status, row._count.status])),
        },
        customers: { total: totalCustomers, newThisMonth: newCustomersThisMonth },
        products: { total: totalProducts, lowStock: lowStockCount, outOfStock: outOfStockCount },
      };
    });
  },

  /**
   * Daily revenue for the chart. Generated from a date series and LEFT JOINed so days
   * with no sales appear as zero — without that the line chart would silently skip them
   * and misrepresent the trend.
   */
  async revenueSeries(days = 30) {
    const safeDays = Math.min(Math.max(Math.trunc(days), 1), 365);

    return cacheRemember(`dashboard:revenue:${safeDays}`, CACHE_TTL.DASHBOARD, async () => {
      const rows = await prisma.$queryRaw<Array<{ date: Date; revenue: string | null; orders: bigint }>>`
        SELECT
          series.day::date AS date,
          COALESCE(SUM(o.total), 0) AS revenue,
          COUNT(o.id) AS orders
        FROM generate_series(
          CURRENT_DATE - (${safeDays - 1} || ' days')::interval,
          CURRENT_DATE,
          '1 day'
        ) AS series(day)
        LEFT JOIN orders o
          ON o."createdAt"::date = series.day::date
          AND o."paymentStatus" = 'PAID'
          AND o.status NOT IN ('CANCELLED', 'REFUNDED')
        GROUP BY series.day
        ORDER BY series.day ASC
      `;

      return rows.map((row) => ({
        date: row.date.toISOString().slice(0, 10),
        revenue: row.revenue ? Number(row.revenue) : 0,
        orders: Number(row.orders),
      }));
    });
  },

  /** Best sellers ranked by units actually shipped, not by catalog `soldCount`. */
  async bestSellers(limit = 8) {
    return cacheRemember(`dashboard:bestsellers:${limit}`, CACHE_TTL.DASHBOARD, async () => {
      const rows = await prisma.orderItem.groupBy({
        by: ['productId', 'name', 'sku'],
        where: { order: PAID_ORDER_FILTER, productId: { not: null } },
        _sum: { quantity: true, lineTotal: true },
        orderBy: { _sum: { quantity: 'desc' } },
        take: limit,
      });

      return rows.map((row) => ({
        productId: row.productId,
        name: row.name,
        sku: row.sku,
        unitsSold: row._sum.quantity ?? 0,
        revenue: row._sum.lineTotal ? toNumber(row._sum.lineTotal) : 0,
      }));
    });
  },

  async recentOrders(limit = 8) {
    const orders = await prisma.order.findMany({
      orderBy: { createdAt: 'desc' },
      take: limit,
      select: {
        id: true,
        orderNumber: true,
        status: true,
        paymentStatus: true,
        total: true,
        createdAt: true,
        shippingName: true,
        user: { select: { id: true, email: true, firstName: true, lastName: true } },
        _count: { select: { items: true } },
      },
    });

    return orders.map((order) => ({
      ...order,
      total: toNumber(order.total),
      itemCount: order._count.items,
    }));
  },

  lowStockProducts(limit = 10) {
    return productRepository.lowStock(limit);
  },

  /** Revenue split by category — answers "what actually sells here?". */
  async categoryPerformance(limit = 8) {
    const rows = await prisma.$queryRaw<Array<{ name: string; revenue: string; units: bigint }>>`
      SELECT c.name, COALESCE(SUM(oi."lineTotal"), 0) AS revenue, COALESCE(SUM(oi.quantity), 0) AS units
      FROM order_items oi
      JOIN orders o ON o.id = oi."orderId"
      JOIN products p ON p.id = oi."productId"
      JOIN categories c ON c.id = p."categoryId"
      WHERE o."paymentStatus" = 'PAID' AND o.status NOT IN ('CANCELLED', 'REFUNDED')
      GROUP BY c.name
      ORDER BY revenue DESC
      LIMIT ${limit}
    `;

    return rows.map((row) => ({
      category: row.name,
      revenue: Number(row.revenue),
      units: Number(row.units),
    }));
  },

  /** One request populates the entire dashboard — the UI makes a single round trip. */
  async fullDashboard() {
    const [summary, revenueSeries, bestSellers, recentOrders, lowStock, categories] = await Promise.all([
      this.summary(),
      this.revenueSeries(30),
      this.bestSellers(8),
      this.recentOrders(8),
      this.lowStockProducts(10),
      this.categoryPerformance(6),
    ]);

    return { summary, revenueSeries, bestSellers, recentOrders, lowStock, categories };
  },
};
