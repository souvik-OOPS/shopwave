import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, CheckCircle2, CreditCard, MapPin, Package, Undo2 } from 'lucide-react';

import { OrderStatusBadge, PaymentStatusBadge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { EmptyState, ErrorState, Spinner } from '@/components/ui/Feedback';
import { Image } from '@/components/ui/Image';
import { Textarea } from '@/components/ui/Input';
import { ConfirmDialog, Modal } from '@/components/ui/Modal';
import { orderApi, paymentApi } from '@/lib/api';
import { queryKeys } from '@/lib/queryClient';
import { loadRazorpayCheckout, type RazorpayHandlerResponse } from '@/lib/razorpay';
import { useToast } from '@/hooks/useToast';
import { cn, formatCurrency, formatDate, humanise } from '@/lib/utils';

const CANCELLABLE = ['PENDING', 'CONFIRMED', 'PROCESSING'];

export default function OrderDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const toast = useToast();
  const client = useQueryClient();

  const [confirmCancel, setConfirmCancel] = useState(false);
  const [returnOpen, setReturnOpen] = useState(false);
  const [returnReason, setReturnReason] = useState('');
  const [paying, setPaying] = useState(false);

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: queryKeys.orders.detail(id ?? ''),
    queryFn: async () => {
      const { order } = await orderApi.detail(id as string);
      return order;
    },
    enabled: Boolean(id),
  });

  const invalidate = () => {
    void client.invalidateQueries({ queryKey: queryKeys.orders.all });
  };

  const cancelOrder = useMutation({
    mutationFn: (reason?: string) => orderApi.cancel(id as string, reason),
    onSuccess: () => {
      toast.success('Order cancelled', 'Any reserved stock has been released.');
      setConfirmCancel(false);
      invalidate();
    },
    onError: (error) => toast.error(error),
  });

  const requestReturn = useMutation({
    mutationFn: (reason: string) => orderApi.requestReturn(id as string, reason),
    onSuccess: () => {
      toast.success('Return requested', 'Our team will be in touch shortly.');
      setReturnOpen(false);
      setReturnReason('');
      invalidate();
    },
    onError: (error) => toast.error(error),
  });

  /** Retry payment for an order that was created but never paid. */
  const retryPayment = useMutation({
    mutationFn: async () => {
      const config = await paymentApi.config();
      if (!config.enabled || !config.keyId) throw new Error('Payments are not configured');

      const payment = await paymentApi.createOrder(id as string);
      await loadRazorpayCheckout();

      return new Promise<boolean>((resolve, reject) => {
        const razorpay = new window.Razorpay({
          key: config.keyId as string,
          amount: payment.amount,
          currency: payment.currency,
          name: 'ShopWave',
          description: `Order ${payment.orderNumber}`,
          order_id: payment.razorpayOrderId,
          theme: { color: '#4f46e5' },
          handler: (response: RazorpayHandlerResponse) => {
            paymentApi
              .verify({
                razorpay_order_id: response.razorpay_order_id,
                razorpay_payment_id: response.razorpay_payment_id,
                razorpay_signature: response.razorpay_signature,
              })
              .then(() => resolve(true))
              .catch(reject);
          },
          modal: { ondismiss: () => resolve(false) },
        });
        razorpay.open();
      });
    },
    onMutate: () => setPaying(true),
    onSuccess: (paid) => {
      if (paid) toast.success('Payment successful');
      invalidate();
    },
    onError: (error) => toast.error(error),
    onSettled: () => setPaying(false),
  });

  if (isLoading) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center">
        <Spinner className="h-8 w-8" />
      </div>
    );
  }

  if (isError) return <ErrorState className="py-24" onRetry={() => void refetch()} />;

  if (!data) {
    return (
      <EmptyState
        className="py-24"
        title="Order not found"
        description="This order does not exist, or it belongs to another account."
        action={<Button onClick={() => navigate('/orders')}>Back to orders</Button>}
      />
    );
  }

  const canCancel = CANCELLABLE.includes(data.status);
  const canReturn = data.status === 'DELIVERED';
  const needsPayment = data.paymentStatus === 'PENDING' && data.status === 'PENDING';

  return (
    <div className="container-page py-8">
      <Link
        to="/orders"
        className="mb-6 inline-flex items-center gap-1.5 text-sm font-medium text-ink-600 hover:text-ink-900"
      >
        <ArrowLeft className="h-4 w-4" aria-hidden="true" />
        Back to orders
      </Link>

      <header className="mb-8 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-heading-lg text-ink-900">{data.orderNumber}</h1>
          <p className="mt-1 text-sm text-ink-500">Placed on {formatDate(data.placedAt, 'long')}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <OrderStatusBadge status={data.status} />
          <PaymentStatusBadge status={data.paymentStatus} />
        </div>
      </header>

      {needsPayment && (
        <div className="mb-6 flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-warning-500/30 bg-warning-50 p-5">
          <div className="flex items-start gap-3">
            <CreditCard className="mt-0.5 h-5 w-5 shrink-0 text-warning-700" aria-hidden="true" />
            <div className="text-sm">
              <p className="font-semibold text-warning-800">Payment pending</p>
              <p className="mt-0.5 text-warning-700">
                Stock is reserved for this order. Complete payment to confirm it.
              </p>
            </div>
          </div>
          <Button loading={paying} onClick={() => retryPayment.mutate()}>
            Pay {formatCurrency(data.total)}
          </Button>
        </div>
      )}

      <div className="grid gap-8 lg:grid-cols-[1fr_20rem]">
        <div className="space-y-6">
          {/* Timeline */}
          <section className="rounded-2xl border border-ink-200 p-5">
            <h2 className="text-base font-semibold text-ink-900">Order tracking</h2>
            <ol className="mt-5 space-y-5">
              {data.events.map((event, index) => {
                const isLatest = index === data.events.length - 1;
                return (
                  <li key={event.id} className="flex gap-3.5">
                    <div className="flex flex-col items-center">
                      <span
                        className={cn(
                          'flex h-7 w-7 shrink-0 items-center justify-center rounded-full',
                          isLatest ? 'bg-brand-600 text-white' : 'bg-success-50 text-success-600',
                        )}
                      >
                        <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
                      </span>
                      {index < data.events.length - 1 && (
                        <span className="mt-1 w-px flex-1 bg-ink-200" aria-hidden="true" />
                      )}
                    </div>
                    <div className="pb-1">
                      <p className="text-sm font-semibold text-ink-900">{humanise(event.status)}</p>
                      {event.note && <p className="mt-0.5 text-sm text-ink-600">{event.note}</p>}
                      <p className="mt-0.5 text-xs text-ink-400">{formatDate(event.createdAt, 'long')}</p>
                    </div>
                  </li>
                );
              })}
            </ol>
          </section>

          {/* Items */}
          <section className="rounded-2xl border border-ink-200 p-5">
            <h2 className="text-base font-semibold text-ink-900">
              Items ({data.totalQuantity})
            </h2>
            <ul className="mt-4 divide-y divide-ink-100">
              {data.items.map((item) => (
                <li key={item.id} className="flex gap-4 py-4 first:pt-0">
                  <Image
                    src={item.imageUrl}
                    alt={item.name}
                    aspect="square"
                    containerClassName="h-20 w-20 shrink-0 rounded-xl"
                  />
                  <div className="min-w-0 flex-1">
                    {/* Snapshot data — deliberately not a live product lookup. */}
                    <Link
                      to={`/products/${item.slug}`}
                      className="line-clamp-2 text-sm font-medium text-ink-900 hover:text-brand-700"
                    >
                      {item.name}
                    </Link>
                    {item.variantName && <p className="text-xs text-ink-500">{item.variantName}</p>}
                    <p className="mt-0.5 text-xs text-ink-400">SKU {item.sku}</p>
                    <p className="mt-1 text-sm text-ink-600">
                      {formatCurrency(item.unitPrice)} × {item.quantity}
                    </p>
                  </div>
                  <span className="text-sm font-semibold text-ink-900">
                    {formatCurrency(item.lineTotal)}
                  </span>
                </li>
              ))}
            </ul>
          </section>

          {(canCancel || canReturn) && (
            <section className="flex flex-wrap gap-3">
              {canCancel && (
                <Button variant="outline" onClick={() => setConfirmCancel(true)}>
                  Cancel order
                </Button>
              )}
              {canReturn && (
                <Button
                  variant="outline"
                  onClick={() => setReturnOpen(true)}
                  leftIcon={<Undo2 className="h-4 w-4" aria-hidden="true" />}
                >
                  Request return
                </Button>
              )}
            </section>
          )}
        </div>

        <aside className="space-y-6">
          <section className="rounded-2xl border border-ink-200 p-5">
            <h2 className="flex items-center gap-2 text-base font-semibold text-ink-900">
              <MapPin className="h-4 w-4 text-ink-400" aria-hidden="true" />
              Delivery address
            </h2>
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
              {data.shippingCountry}
              <br />
              <span className="text-ink-500">{data.shippingPhone}</span>
            </address>
          </section>

          <section className="rounded-2xl border border-ink-200 p-5">
            <h2 className="flex items-center gap-2 text-base font-semibold text-ink-900">
              <Package className="h-4 w-4 text-ink-400" aria-hidden="true" />
              Payment summary
            </h2>
            <dl className="mt-4 space-y-2.5 text-sm">
              <div className="flex justify-between">
                <dt className="text-ink-600">Subtotal</dt>
                <dd className="font-medium text-ink-900">{formatCurrency(data.subtotal)}</dd>
              </div>
              {data.discountAmount > 0 && (
                <div className="flex justify-between text-success-700">
                  <dt>Discount{data.couponCode ? ` (${data.couponCode})` : ''}</dt>
                  <dd className="font-medium">−{formatCurrency(data.discountAmount)}</dd>
                </div>
              )}
              <div className="flex justify-between">
                <dt className="text-ink-600">Delivery</dt>
                <dd className="font-medium text-ink-900">
                  {data.shippingAmount === 0 ? 'Free' : formatCurrency(data.shippingAmount)}
                </dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-ink-600">GST</dt>
                <dd className="font-medium text-ink-900">{formatCurrency(data.taxAmount)}</dd>
              </div>
              <div className="flex justify-between border-t border-ink-200 pt-3 text-base">
                <dt className="font-semibold text-ink-900">Total paid</dt>
                <dd className="font-bold text-ink-900">{formatCurrency(data.total)}</dd>
              </div>
            </dl>
          </section>

          {data.cancellationReason && (
            <section className="rounded-2xl border border-danger-500/30 bg-danger-50 p-5">
              <h2 className="text-sm font-semibold text-danger-800">Cancellation reason</h2>
              <p className="mt-1.5 text-sm text-danger-700">{data.cancellationReason}</p>
            </section>
          )}
        </aside>
      </div>

      <ConfirmDialog
        open={confirmCancel}
        title="Cancel this order?"
        description="Reserved stock is released immediately and any coupon you used becomes available again. This cannot be undone."
        confirmLabel="Cancel order"
        cancelLabel="Keep order"
        variant="danger"
        loading={cancelOrder.isPending}
        onConfirm={() => cancelOrder.mutate('Cancelled by customer')}
        onCancel={() => setConfirmCancel(false)}
      />

      <Modal
        open={returnOpen}
        onClose={() => setReturnOpen(false)}
        title="Request a return"
        description="Tell us what went wrong so we can sort it out quickly."
        footer={
          <div className="flex justify-end gap-3">
            <Button variant="outline" onClick={() => setReturnOpen(false)}>
              Cancel
            </Button>
            <Button
              loading={requestReturn.isPending}
              disabled={returnReason.trim().length === 0}
              onClick={() => requestReturn.mutate(returnReason.trim())}
            >
              Submit request
            </Button>
          </div>
        }
      >
        <Textarea
          label="Reason for return"
          rows={4}
          maxLength={300}
          value={returnReason}
          onChange={(event) => setReturnReason(event.target.value)}
          placeholder="e.g. The item arrived damaged"
          data-autofocus
        />
      </Modal>
    </div>
  );
}
