import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, Search } from 'lucide-react';

import { OrderStatusBadge, PaymentStatusBadge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { EmptyState, ErrorState, Spinner, TableSkeleton } from '@/components/ui/Feedback';
import { Image } from '@/components/ui/Image';
import { Input, Select, Textarea } from '@/components/ui/Input';
import { Pagination } from '@/components/ui/Pagination';
import { adminApi } from '@/lib/api';
import { queryKeys } from '@/lib/queryClient';
import { useDebouncedValue } from '@/hooks/useCatalog';
import { useToast } from '@/hooks/useToast';
import { formatCurrency, formatDate, humanise } from '@/lib/utils';
import type { OrderStatus } from '@/types/api';

const STATUS_OPTIONS = [
  { value: '', label: 'All statuses' },
  ...(
    [
      'PENDING',
      'CONFIRMED',
      'PROCESSING',
      'SHIPPED',
      'OUT_FOR_DELIVERY',
      'DELIVERED',
      'CANCELLED',
      'RETURN_REQUESTED',
      'RETURNED',
      'REFUNDED',
    ] as OrderStatus[]
  ).map((status) => ({ value: status, label: humanise(status) })),
];

export function AdminOrders() {
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');
  const [page, setPage] = useState(1);

  const debouncedSearch = useDebouncedValue(search, 400);
  const params = { page, limit: 20, ...(debouncedSearch ? { q: debouncedSearch } : {}), ...(status ? { status } : {}) };

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: queryKeys.orders.adminList(params),
    queryFn: () => adminApi.orders(params),
  });

  return (
    <div className="p-6 lg:p-8">
      <header className="mb-6">
        <h1 className="text-heading-lg text-ink-900">Orders</h1>
        <p className="mt-1 text-sm text-ink-500">
          {data?.meta ? `${data.meta.total} orders` : 'Loading…'}
        </p>
      </header>

      <div className="mb-5 flex flex-wrap gap-3">
        <Input
          aria-label="Search orders"
          placeholder="Order number, customer name, email or phone"
          value={search}
          onChange={(event) => {
            setSearch(event.target.value);
            setPage(1);
          }}
          leftIcon={<Search className="h-4 w-4" aria-hidden="true" />}
          containerClassName="flex-1 min-w-64"
        />
        <div className="w-full sm:w-52">
          <Select
            aria-label="Filter by status"
            options={STATUS_OPTIONS}
            value={status}
            onChange={(event) => {
              setStatus(event.target.value);
              setPage(1);
            }}
          />
        </div>
      </div>

      <div className="overflow-hidden rounded-2xl border border-ink-200 bg-surface">
        {isLoading ? (
          <div className="p-5">
            <TableSkeleton rows={6} columns={5} />
          </div>
        ) : isError ? (
          <ErrorState onRetry={() => void refetch()} />
        ) : !data || data.orders.length === 0 ? (
          <EmptyState title="No orders found" description="Try a different search or filter." />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[52rem] text-sm">
              <thead className="border-b border-ink-200 bg-ink-50 text-left">
                <tr>
                  <th scope="col" className="px-5 py-3 font-semibold text-ink-600">Order</th>
                  <th scope="col" className="px-5 py-3 font-semibold text-ink-600">Customer</th>
                  <th scope="col" className="px-5 py-3 font-semibold text-ink-600">Date</th>
                  <th scope="col" className="px-5 py-3 font-semibold text-ink-600">Status</th>
                  <th scope="col" className="px-5 py-3 font-semibold text-ink-600">Payment</th>
                  <th scope="col" className="px-5 py-3 text-right font-semibold text-ink-600">Total</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-ink-100">
                {data.orders.map((order) => (
                  <tr key={order.id} className="transition-colors hover:bg-ink-50">
                    <td className="px-5 py-3">
                      <Link
                        to={`/admin/orders/${order.id}`}
                        className="font-medium text-brand-700 hover:underline"
                      >
                        {order.orderNumber}
                      </Link>
                      <p className="text-xs text-ink-500">{order.itemCount} items</p>
                    </td>
                    <td className="px-5 py-3">
                      <p className="text-ink-900">
                        {order.user ? `${order.user.firstName} ${order.user.lastName}` : 'Deleted user'}
                      </p>
                      <p className="text-xs text-ink-500">{order.user?.email}</p>
                    </td>
                    <td className="px-5 py-3 text-ink-600">{formatDate(order.createdAt)}</td>
                    <td className="px-5 py-3">
                      <OrderStatusBadge status={order.status} />
                    </td>
                    <td className="px-5 py-3">
                      <PaymentStatusBadge status={order.paymentStatus} />
                    </td>
                    <td className="px-5 py-3 text-right font-semibold text-ink-900">
                      {formatCurrency(order.total)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {data?.meta && <Pagination meta={data.meta} onPageChange={setPage} className="mt-6" />}
    </div>
  );
}

export function AdminOrderDetail() {
  const { id } = useParams<{ id: string }>();
  const toast = useToast();
  const client = useQueryClient();

  const [nextStatus, setNextStatus] = useState('');
  const [note, setNote] = useState('');

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: queryKeys.orders.adminDetail(id ?? ''),
    queryFn: async () => {
      const { order } = await adminApi.order(id as string);
      return order;
    },
    enabled: Boolean(id),
  });

  const updateStatus = useMutation({
    mutationFn: () =>
      adminApi.updateOrderStatus(id as string, {
        status: nextStatus as OrderStatus,
        ...(note.trim() ? { note: note.trim() } : {}),
      }),
    onSuccess: () => {
      toast.success('Order status updated');
      setNextStatus('');
      setNote('');
      void client.invalidateQueries({ queryKey: queryKeys.orders.all });
    },
    // The server enforces a transition whitelist; an illegal jump returns 409 with
    // the allowed set, which surfaces here as a clear message.
    onError: (error) => toast.error(error),
  });

  const refund = useMutation({
    mutationFn: () => adminApi.refundOrder(id as string),
    onSuccess: () => {
      toast.success('Refund processed');
      void client.invalidateQueries({ queryKey: queryKeys.orders.all });
    },
    onError: (error) => toast.error(error),
  });

  if (isLoading) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center">
        <Spinner className="h-8 w-8" />
      </div>
    );
  }

  if (isError || !data) return <ErrorState className="py-24" onRetry={() => void refetch()} />;

  return (
    <div className="p-6 lg:p-8">
      <Link
        to="/admin/orders"
        className="mb-6 inline-flex items-center gap-1.5 text-sm font-medium text-ink-600 hover:text-ink-900"
      >
        <ArrowLeft className="h-4 w-4" aria-hidden="true" />
        Back to orders
      </Link>

      <header className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-heading-lg text-ink-900">{data.orderNumber}</h1>
          <p className="mt-1 text-sm text-ink-500">Placed {formatDate(data.placedAt, 'long')}</p>
        </div>
        <div className="flex gap-2">
          <OrderStatusBadge status={data.status} />
          <PaymentStatusBadge status={data.paymentStatus} />
        </div>
      </header>

      <div className="grid gap-6 lg:grid-cols-[1fr_20rem]">
        <div className="space-y-6">
          <section className="rounded-2xl border border-ink-200 bg-surface p-5">
            <h2 className="text-base font-semibold text-ink-900">Items</h2>
            <ul className="mt-4 divide-y divide-ink-100">
              {data.items.map((item) => (
                <li key={item.id} className="flex gap-4 py-3 first:pt-0">
                  <Image
                    src={item.imageUrl}
                    alt={item.name}
                    aspect="square"
                    containerClassName="h-16 w-16 shrink-0 rounded-lg"
                  />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-ink-900">{item.name}</p>
                    {item.variantName && <p className="text-xs text-ink-500">{item.variantName}</p>}
                    <p className="text-xs text-ink-400">SKU {item.sku}</p>
                  </div>
                  <div className="text-right text-sm">
                    <p className="font-semibold text-ink-900">{formatCurrency(item.lineTotal)}</p>
                    <p className="text-ink-500">
                      {formatCurrency(item.unitPrice)} × {item.quantity}
                    </p>
                  </div>
                </li>
              ))}
            </ul>
          </section>

          <section className="rounded-2xl border border-ink-200 bg-surface p-5">
            <h2 className="text-base font-semibold text-ink-900">Update status</h2>
            <p className="mt-1 text-sm text-ink-500">
              Only transitions allowed by the workflow will be accepted.
            </p>

            <div className="mt-4 space-y-3">
              <Select
                label="New status"
                placeholder="Choose a status"
                options={STATUS_OPTIONS.filter((option) => option.value)}
                value={nextStatus}
                onChange={(event) => setNextStatus(event.target.value)}
              />
              <Textarea
                label="Internal note"
                rows={2}
                maxLength={300}
                value={note}
                onChange={(event) => setNote(event.target.value)}
                placeholder="Optional — shown on the customer's tracking timeline"
              />
              <div className="flex flex-wrap gap-3">
                <Button
                  disabled={!nextStatus}
                  loading={updateStatus.isPending}
                  onClick={() => updateStatus.mutate()}
                >
                  Update status
                </Button>
                {data.paymentStatus === 'PAID' && (
                  <Button variant="danger" loading={refund.isPending} onClick={() => refund.mutate()}>
                    Issue full refund
                  </Button>
                )}
              </div>
            </div>
          </section>

          <section className="rounded-2xl border border-ink-200 bg-surface p-5">
            <h2 className="text-base font-semibold text-ink-900">History</h2>
            <ol className="mt-4 space-y-3">
              {data.events.map((event) => (
                <li key={event.id} className="flex gap-3 text-sm">
                  <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-brand-500" aria-hidden="true" />
                  <div>
                    <p className="font-medium text-ink-900">{humanise(event.status)}</p>
                    {event.note && <p className="text-ink-600">{event.note}</p>}
                    <p className="text-xs text-ink-400">{formatDate(event.createdAt, 'long')}</p>
                  </div>
                </li>
              ))}
            </ol>
          </section>
        </div>

        <aside className="space-y-6">
          <section className="rounded-2xl border border-ink-200 bg-surface p-5">
            <h2 className="text-base font-semibold text-ink-900">Customer</h2>
            <div className="mt-3 text-sm">
              <p className="font-medium text-ink-900">
                {data.user ? `${data.user.firstName} ${data.user.lastName}` : 'Deleted user'}
              </p>
              <p className="text-ink-500">{data.user?.email}</p>
              {data.user && (
                <Link
                  to={`/admin/customers/${data.user.id}`}
                  className="mt-2 inline-block text-sm font-medium text-brand-700 hover:underline"
                >
                  View customer
                </Link>
              )}
            </div>
          </section>

          <section className="rounded-2xl border border-ink-200 bg-surface p-5">
            <h2 className="text-base font-semibold text-ink-900">Shipping</h2>
            <address className="mt-3 text-sm not-italic leading-relaxed text-ink-600">
              <span className="font-medium text-ink-900">{data.shippingName}</span>
              <br />
              {data.shippingLine1}
              {data.shippingLine2 && (
                <>
                  <br />
                  {data.shippingLine2}
                </>
              )}
              <br />
              {data.shippingCity}, {data.shippingState} {data.shippingPostalCode}
              <br />
              {data.shippingPhone}
            </address>
            {data.customerNote && (
              <p className="mt-3 rounded-lg bg-ink-50 p-3 text-sm text-ink-600">
                <span className="font-medium">Note:</span> {data.customerNote}
              </p>
            )}
          </section>

          <section className="rounded-2xl border border-ink-200 bg-surface p-5">
            <h2 className="text-base font-semibold text-ink-900">Totals</h2>
            <dl className="mt-3 space-y-2 text-sm">
              <div className="flex justify-between">
                <dt className="text-ink-600">Subtotal</dt>
                <dd className="text-ink-900">{formatCurrency(data.subtotal)}</dd>
              </div>
              {data.discountAmount > 0 && (
                <div className="flex justify-between text-success-700">
                  <dt>Discount {data.couponCode && `(${data.couponCode})`}</dt>
                  <dd>−{formatCurrency(data.discountAmount)}</dd>
                </div>
              )}
              <div className="flex justify-between">
                <dt className="text-ink-600">Shipping</dt>
                <dd className="text-ink-900">{formatCurrency(data.shippingAmount)}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-ink-600">Tax</dt>
                <dd className="text-ink-900">{formatCurrency(data.taxAmount)}</dd>
              </div>
              <div className="flex justify-between border-t border-ink-200 pt-2 font-semibold">
                <dt className="text-ink-900">Total</dt>
                <dd className="text-ink-900">{formatCurrency(data.total)}</dd>
              </div>
            </dl>
          </section>
        </aside>
      </div>
    </div>
  );
}
