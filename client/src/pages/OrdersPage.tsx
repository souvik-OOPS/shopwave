import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { ChevronRight, Package } from 'lucide-react';

import { Button } from '@/components/ui/Button';
import { OrderStatusBadge, PaymentStatusBadge } from '@/components/ui/Badge';
import { EmptyState, ErrorState, TableSkeleton } from '@/components/ui/Feedback';
import { Image } from '@/components/ui/Image';
import { Pagination } from '@/components/ui/Pagination';
import { orderApi } from '@/lib/api';
import { queryKeys } from '@/lib/queryClient';
import { formatCurrency, formatDate } from '@/lib/utils';
import type { OrderStatus } from '@/types/api';

const STATUS_TABS: Array<{ value: OrderStatus | 'ALL'; label: string }> = [
  { value: 'ALL', label: 'All orders' },
  { value: 'PENDING', label: 'Pending' },
  { value: 'CONFIRMED', label: 'Confirmed' },
  { value: 'SHIPPED', label: 'Shipped' },
  { value: 'DELIVERED', label: 'Delivered' },
  { value: 'CANCELLED', label: 'Cancelled' },
];

export default function OrdersPage() {
  const [status, setStatus] = useState<OrderStatus | 'ALL'>('ALL');
  const [page, setPage] = useState(1);

  const params = { page, limit: 10, ...(status !== 'ALL' ? { status } : {}) };

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: queryKeys.orders.list(params),
    queryFn: () => orderApi.list(params),
  });

  return (
    <div className="container-page py-8">
      <header className="mb-6">
        <h1 className="text-heading-lg text-ink-900">My orders</h1>
        <p className="mt-1 text-sm text-ink-500">Track deliveries, cancel or request a return.</p>
      </header>

      <div className="mb-6 flex gap-1 overflow-x-auto no-scrollbar border-b border-ink-200">
        {STATUS_TABS.map((tab) => (
          <button
            key={tab.value}
            type="button"
            onClick={() => {
              setStatus(tab.value);
              setPage(1);
            }}
            aria-current={status === tab.value ? 'true' : undefined}
            className={`whitespace-nowrap border-b-2 px-4 py-2.5 text-sm font-medium transition-colors ${
              status === tab.value
                ? 'border-brand-600 text-brand-700'
                : 'border-transparent text-ink-500 hover:text-ink-800'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {isLoading ? (
        <TableSkeleton rows={4} columns={4} />
      ) : isError ? (
        <ErrorState onRetry={() => void refetch()} />
      ) : !data || data.orders.length === 0 ? (
        <EmptyState
          icon={<Package className="h-7 w-7" />}
          title={status === 'ALL' ? 'No orders yet' : `No ${status.toLowerCase()} orders`}
          description="When you place an order it will appear here with live tracking."
          action={
            <Link to="/products">
              <Button>Start shopping</Button>
            </Link>
          }
        />
      ) : (
        <>
          <ul className="space-y-4">
            {data.orders.map((order) => (
              <li key={order.id}>
                <Link
                  to={`/orders/${order.id}`}
                  className="block rounded-2xl border border-ink-200 p-5 transition-shadow hover:shadow-card-hover"
                >
                  <div className="flex flex-wrap items-start justify-between gap-4">
                    <div>
                      <p className="font-semibold text-ink-900">{order.orderNumber}</p>
                      <p className="mt-0.5 text-sm text-ink-500">
                        Placed {formatDate(order.createdAt)} · {order.itemCount} item
                        {order.itemCount === 1 ? '' : 's'}
                      </p>
                    </div>

                    <div className="flex flex-wrap items-center gap-2">
                      <OrderStatusBadge status={order.status} />
                      <PaymentStatusBadge status={order.paymentStatus} />
                    </div>
                  </div>

                  <div className="mt-4 flex items-center justify-between gap-4">
                    <ul className="flex -space-x-2">
                      {order.items.slice(0, 4).map((item) => (
                        <li key={item.id}>
                          <Image
                            src={item.imageUrl}
                            alt={item.name}
                            aspect="square"
                            containerClassName="h-12 w-12 rounded-lg ring-2 ring-surface"
                          />
                        </li>
                      ))}
                      {order.items.length > 4 && (
                        <li
                          className="flex h-12 w-12 items-center justify-center rounded-lg bg-ink-100
                                     text-xs font-semibold text-ink-600 ring-2 ring-surface"
                        >
                          +{order.items.length - 4}
                        </li>
                      )}
                    </ul>

                    <div className="flex items-center gap-3">
                      <span className="text-lg font-bold text-ink-900">{formatCurrency(order.total)}</span>
                      <ChevronRight className="h-5 w-5 text-ink-400" aria-hidden="true" />
                    </div>
                  </div>
                </Link>
              </li>
            ))}
          </ul>

          {data.meta && <Pagination meta={data.meta} onPageChange={setPage} className="mt-8" />}
        </>
      )}
    </div>
  );
}
