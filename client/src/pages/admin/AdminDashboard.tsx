import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import {
  AlertTriangle,
  ArrowUpRight,
  IndianRupee,
  Package,
  ShoppingCart,
  Users,
} from 'lucide-react';

import { useAppSelector } from '@/app/store';
import { OrderStatusBadge } from '@/components/ui/Badge';
import { ErrorState, Skeleton } from '@/components/ui/Feedback';
import { adminApi } from '@/lib/api';
import { queryKeys } from '@/lib/queryClient';
import { formatCurrency, formatDate, formatNumber } from '@/lib/utils';

/**
 * Recharts paints SVG presentation attributes, not classes, so it cannot inherit the CSS
 * variables the rest of the UI themes with — the palette has to be handed in per render.
 * These values mirror the `--color-*` tokens in styles/index.css; keep them in step.
 */
const CHART_THEME = {
  light: {
    grid: '#e2e8f0',
    axis: '#94a3b8',
    axisStrong: '#475569',
    accent: '#4f46e5',
    bar: '#6366f1',
    tooltipBg: '#ffffff',
    tooltipBorder: '#e2e8f0',
    tooltipText: '#0f172a',
    tooltipShadow: '0 8px 24px -6px rgb(15 23 42 / 0.12)',
  },
  dark: {
    grid: '#2a364c',
    axis: '#7c8aa3',
    axisStrong: '#b4c0d4',
    accent: '#818cf8',
    bar: '#818cf8',
    tooltipBg: '#182031',
    tooltipBorder: '#2a364c',
    tooltipText: '#f1f5f9',
    tooltipShadow: '0 12px 32px -8px rgb(0 0 0 / 0.7)',
  },
} as const;

function StatCard({
  label,
  value,
  sublabel,
  icon: Icon,
  tone = 'brand',
}: {
  label: string;
  value: string;
  sublabel?: string;
  icon: typeof IndianRupee;
  tone?: 'brand' | 'success' | 'warning' | 'neutral';
}) {
  const tones = {
    brand: 'bg-brand-50 text-brand-600',
    success: 'bg-success-50 text-success-600',
    warning: 'bg-warning-50 text-warning-600',
    neutral: 'bg-ink-100 text-ink-600',
  };

  return (
    <div className="rounded-2xl border border-ink-200 bg-surface p-5">
      <div className="flex items-start justify-between">
        <p className="text-sm font-medium text-ink-500">{label}</p>
        <span className={`flex h-9 w-9 items-center justify-center rounded-xl ${tones[tone]}`}>
          <Icon className="h-4.5 w-4.5" aria-hidden="true" />
        </span>
      </div>
      <p className="mt-3 text-2xl font-bold tracking-tight text-ink-900">{value}</p>
      {sublabel && <p className="mt-1 text-xs text-ink-500">{sublabel}</p>}
    </div>
  );
}

/** Recharts renders raw values; the axis and tooltip get compact Indian formatting. */
function compactCurrency(value: number): string {
  if (value >= 10_000_000) return `₹${(value / 10_000_000).toFixed(1)}Cr`;
  if (value >= 100_000) return `₹${(value / 100_000).toFixed(1)}L`;
  if (value >= 1000) return `₹${(value / 1000).toFixed(0)}k`;
  return `₹${value}`;
}

export default function AdminDashboard() {
  const chart = CHART_THEME[useAppSelector((state) => state.theme.resolved)];
  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: queryKeys.admin.dashboard,
    queryFn: () => adminApi.dashboard(),
  });

  if (isLoading) {
    return (
      <div className="p-6 lg:p-8">
        <Skeleton className="h-9 w-56" />
        <div className="mt-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {Array.from({ length: 4 }, (_, index) => (
            <Skeleton key={index} className="h-32 rounded-2xl" />
          ))}
        </div>
        <Skeleton className="mt-6 h-80 rounded-2xl" />
      </div>
    );
  }

  if (isError || !data) return <ErrorState className="py-24" onRetry={() => void refetch()} />;

  const { summary, revenueSeries, bestSellers, recentOrders, lowStock, categories } = data;

  return (
    <div className="p-6 lg:p-8">
      <header className="mb-6">
        <h1 className="text-heading-lg text-ink-900">Dashboard</h1>
        <p className="mt-1 text-sm text-ink-500">
          Revenue counts paid orders only — pending checkouts are excluded.
        </p>
      </header>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Total revenue"
          value={formatCurrency(summary.revenue.total)}
          sublabel={`${formatCurrency(summary.revenue.averageOrderValue)} average order`}
          icon={IndianRupee}
          tone="success"
        />
        <StatCard
          label="Today's revenue"
          value={formatCurrency(summary.revenue.today)}
          sublabel={`${summary.orders.today} orders today`}
          icon={ArrowUpRight}
          tone="brand"
        />
        <StatCard
          label="Orders"
          value={formatNumber(summary.orders.total)}
          sublabel={`${summary.orders.pending} awaiting payment`}
          icon={ShoppingCart}
          tone="neutral"
        />
        <StatCard
          label="Customers"
          value={formatNumber(summary.customers.total)}
          sublabel={`+${summary.customers.newThisMonth} this month`}
          icon={Users}
          tone="brand"
        />
      </div>

      <div className="mt-4 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="This month"
          value={formatCurrency(summary.revenue.month)}
          icon={IndianRupee}
          tone="success"
        />
        <StatCard
          label="Products"
          value={formatNumber(summary.products.total)}
          icon={Package}
          tone="neutral"
        />
        <StatCard
          label="Low stock"
          value={formatNumber(summary.products.lowStock)}
          sublabel="At or below threshold"
          icon={AlertTriangle}
          tone="warning"
        />
        <StatCard
          label="Out of stock"
          value={formatNumber(summary.products.outOfStock)}
          icon={AlertTriangle}
          tone="warning"
        />
      </div>

      {/* Revenue chart */}
      <section className="mt-6 rounded-2xl border border-ink-200 bg-surface p-5">
        <h2 className="text-base font-semibold text-ink-900">Revenue — last 30 days</h2>
        <div className="mt-5 h-72">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={revenueSeries} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
              <defs>
                <linearGradient id="revenueFill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={chart.accent} stopOpacity={0.28} />
                  <stop offset="100%" stopColor={chart.accent} stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke={chart.grid} vertical={false} />
              <XAxis
                dataKey="date"
                tickFormatter={(value: string) => value.slice(5)}
                tick={{ fontSize: 11, fill: chart.axis }}
                tickLine={false}
                axisLine={false}
                minTickGap={24}
              />
              <YAxis
                tickFormatter={compactCurrency}
                tick={{ fontSize: 11, fill: chart.axis }}
                tickLine={false}
                axisLine={false}
                width={56}
              />
              <Tooltip
                formatter={(value: number) => [formatCurrency(value), 'Revenue']}
                labelFormatter={(label: string) => formatDate(label)}
                contentStyle={{
                  borderRadius: 12,
                  background: chart.tooltipBg,
                  border: `1px solid ${chart.tooltipBorder}`,
                  color: chart.tooltipText,
                  fontSize: 13,
                  boxShadow: chart.tooltipShadow,
                }}
                labelStyle={{ color: chart.tooltipText }}
                itemStyle={{ color: chart.tooltipText }}
              />
              <Area
                type="monotone"
                dataKey="revenue"
                stroke={chart.accent}
                strokeWidth={2}
                fill="url(#revenueFill)"
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </section>

      <div className="mt-6 grid gap-6 xl:grid-cols-2">
        {/* Best sellers */}
        <section className="rounded-2xl border border-ink-200 bg-surface p-5">
          <h2 className="text-base font-semibold text-ink-900">Best sellers</h2>
          {bestSellers.length === 0 ? (
            <p className="mt-4 text-sm text-ink-500">No sales recorded yet.</p>
          ) : (
            <ul className="mt-4 divide-y divide-ink-100">
              {bestSellers.map((product, index) => (
                <li key={product.sku} className="flex items-center gap-3 py-3">
                  <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-ink-100 text-xs font-bold text-ink-600">
                    {index + 1}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-ink-900">{product.name}</p>
                    <p className="text-xs text-ink-500">{product.sku}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-semibold text-ink-900">{formatCurrency(product.revenue)}</p>
                    <p className="text-xs text-ink-500">{product.unitsSold} sold</p>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>

        {/* Category performance */}
        <section className="rounded-2xl border border-ink-200 bg-surface p-5">
          <h2 className="text-base font-semibold text-ink-900">Revenue by category</h2>
          {categories.length === 0 ? (
            <p className="mt-4 text-sm text-ink-500">No category sales yet.</p>
          ) : (
            <div className="mt-4 h-64">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={categories} layout="vertical" margin={{ left: 8, right: 16 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke={chart.grid} horizontal={false} />
                  <XAxis
                    type="number"
                    tickFormatter={compactCurrency}
                    tick={{ fontSize: 11, fill: chart.axis }}
                    tickLine={false}
                    axisLine={false}
                  />
                  <YAxis
                    type="category"
                    dataKey="category"
                    tick={{ fontSize: 11, fill: chart.axisStrong }}
                    tickLine={false}
                    axisLine={false}
                    width={100}
                  />
                  <Tooltip
                    formatter={(value: number) => [formatCurrency(value), 'Revenue']}
                    contentStyle={{
                      borderRadius: 12,
                      background: chart.tooltipBg,
                      border: `1px solid ${chart.tooltipBorder}`,
                      color: chart.tooltipText,
                      fontSize: 13,
                      boxShadow: chart.tooltipShadow,
                    }}
                    labelStyle={{ color: chart.tooltipText }}
                    itemStyle={{ color: chart.tooltipText }}
                    cursor={{ fill: chart.grid, fillOpacity: 0.4 }}
                  />
                  <Bar dataKey="revenue" fill={chart.bar} radius={[0, 6, 6, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </section>
      </div>

      <div className="mt-6 grid gap-6 xl:grid-cols-2">
        {/* Recent orders */}
        <section className="rounded-2xl border border-ink-200 bg-surface p-5">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-semibold text-ink-900">Recent orders</h2>
            <Link to="/admin/orders" className="text-sm font-medium text-brand-700 hover:underline">
              View all
            </Link>
          </div>

          {recentOrders.length === 0 ? (
            <p className="mt-4 text-sm text-ink-500">No orders yet.</p>
          ) : (
            <ul className="mt-4 divide-y divide-ink-100">
              {recentOrders.map((order) => (
                <li key={order.id} className="py-3">
                  <Link to={`/admin/orders/${order.id}`} className="flex items-center gap-3">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-ink-900">{order.orderNumber}</p>
                      <p className="truncate text-xs text-ink-500">
                        {order.shippingName} · {formatDate(order.createdAt)}
                      </p>
                    </div>
                    <OrderStatusBadge status={order.status} />
                    <span className="w-20 text-right text-sm font-semibold text-ink-900">
                      {formatCurrency(order.total)}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>

        {/* Low stock */}
        <section className="rounded-2xl border border-ink-200 bg-surface p-5">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-semibold text-ink-900">Low stock alerts</h2>
            <Link to="/admin/products" className="text-sm font-medium text-brand-700 hover:underline">
              Manage
            </Link>
          </div>

          {lowStock.length === 0 ? (
            <p className="mt-4 text-sm text-ink-500">Everything is comfortably stocked.</p>
          ) : (
            <ul className="mt-4 divide-y divide-ink-100">
              {lowStock.map((product) => (
                <li key={product.id} className="flex items-center gap-3 py-3">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-ink-900">{product.name}</p>
                    <p className="text-xs text-ink-500">{product.sku}</p>
                  </div>
                  <span
                    className={`rounded-full px-2.5 py-1 text-xs font-semibold ${
                      product.quantity === 0
                        ? 'bg-danger-50 text-danger-700'
                        : 'bg-warning-50 text-warning-700'
                    }`}
                  >
                    {product.quantity === 0 ? 'Out of stock' : `${product.quantity} left`}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}
