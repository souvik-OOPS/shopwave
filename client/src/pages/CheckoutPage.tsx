import { useEffect, useMemo, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Check, CreditCard, MapPin, Package, ShieldCheck } from 'lucide-react';

import { Button } from '@/components/ui/Button';
import { EmptyState, Spinner } from '@/components/ui/Feedback';
import { Image } from '@/components/ui/Image';
import { Textarea } from '@/components/ui/Input';
import { AddressForm } from '@/components/account/AddressForm';
import { useCart } from '@/hooks/useCart';
import { useToast } from '@/hooks/useToast';
import { addressApi, orderApi, paymentApi } from '@/lib/api';
import { queryKeys } from '@/lib/queryClient';
import { loadRazorpayCheckout, type RazorpayHandlerResponse } from '@/lib/razorpay';
import { cn, formatCurrency } from '@/lib/utils';
import type { Address } from '@/types/api';

type Step = 'address' | 'review' | 'payment';

const STEPS: Array<{ id: Step; label: string; icon: typeof MapPin }> = [
  { id: 'address', label: 'Delivery address', icon: MapPin },
  { id: 'review', label: 'Review order', icon: Package },
  { id: 'payment', label: 'Payment', icon: CreditCard },
];

export default function CheckoutPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const toast = useToast();
  const client = useQueryClient();

  const couponCode = (location.state as { couponCode?: string | null } | null)?.couponCode ?? null;

  // Same coupon-priced cart the cart screen showed. Without the code the summary here
  // would quote undiscounted totals and then charge the discounted ones.
  const { data: cart, isLoading: cartLoading } = useCart(couponCode);
  const { data: addressData, isLoading: addressesLoading } = useQuery({
    queryKey: queryKeys.addresses,
    queryFn: () => addressApi.list(),
  });

  const [step, setStep] = useState<Step>('address');
  const [selectedAddressId, setSelectedAddressId] = useState<string | null>(null);
  const [note, setNote] = useState('');
  const [addingAddress, setAddingAddress] = useState(false);
  const [processing, setProcessing] = useState(false);

  // Memoised so the fallback `[]` is not a fresh array on every render, which would
  // re-run the preselect effect below indefinitely.
  const addresses = useMemo(() => addressData?.addresses ?? [], [addressData]);

  // Preselect the default address so the common path is one click.
  useEffect(() => {
    if (!selectedAddressId && addresses.length > 0) {
      setSelectedAddressId((addresses.find((address) => address.isDefault) ?? addresses[0])!.id);
    }
  }, [addresses, selectedAddressId]);

  /**
   * The full payment handshake:
   *   1. POST /checkout          → server prices the order and reserves stock
   *   2. POST /payments/create-order → server creates the Razorpay order for that total
   *   3. Razorpay widget         → customer pays
   *   4. POST /payments/verify   → server checks the HMAC before marking anything paid
   *
   * The browser never states an amount or a payment status. If the tab closes between
   * 3 and 4, the Razorpay webhook still settles the order server-side.
   */
  const placeOrder = useMutation({
    mutationFn: async () => {
      if (!selectedAddressId) throw new Error('Select a delivery address');

      const { order } = await orderApi.checkout({
        addressId: selectedAddressId,
        ...(couponCode ? { couponCode } : {}),
        ...(note.trim() ? { customerNote: note.trim() } : {}),
      });

      const config = await paymentApi.config();
      if (!config.enabled || !config.keyId) {
        // Gateway not configured (e.g. a fresh clone) — the order still exists as PENDING.
        return { order, paid: false as const };
      }

      const payment = await paymentApi.createOrder(order.id);
      await loadRazorpayCheckout();

      const verified = await new Promise<boolean>((resolve, reject) => {
        const razorpay = new window.Razorpay({
          key: config.keyId as string,
          amount: payment.amount,
          currency: payment.currency,
          name: 'ShopWave',
          description: `Order ${payment.orderNumber}`,
          order_id: payment.razorpayOrderId,
          prefill: {
            name: order.shippingName,
            contact: order.shippingPhone,
          },
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
          modal: {
            ondismiss: () => resolve(false),
          },
        });

        razorpay.on('payment.failed', () => reject(new Error('Payment failed. Please try again.')));
        razorpay.open();
      });

      return { order, paid: verified };
    },

    onMutate: () => setProcessing(true),

    onSuccess: ({ order, paid }) => {
      void client.invalidateQueries({ queryKey: queryKeys.cart });
      void client.invalidateQueries({ queryKey: queryKeys.orders.all });

      if (paid) {
        toast.success('Payment successful', `Order ${order.orderNumber} is confirmed.`);
      } else {
        toast.info('Order placed', 'Complete the payment from your orders page to confirm it.');
      }
      navigate(`/orders/${order.id}`, { replace: true });
    },

    onError: (error) => toast.error(error),
    onSettled: () => setProcessing(false),
  });

  if (cartLoading || addressesLoading) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center">
        <Spinner className="h-8 w-8" />
      </div>
    );
  }

  if (!cart || cart.items.length === 0) {
    return (
      <div className="container-page py-16">
        <EmptyState
          title="Nothing to check out"
          description="Your cart is empty."
          action={
            <Link to="/products">
              <Button>Browse products</Button>
            </Link>
          }
        />
      </div>
    );
  }

  const selectedAddress = addresses.find((address) => address.id === selectedAddressId);
  const currentStepIndex = STEPS.findIndex((item) => item.id === step);

  return (
    <div className="container-page py-8">
      <h1 className="text-heading-lg text-ink-900">Checkout</h1>

      {/* Step indicator */}
      <ol className="mt-6 flex flex-wrap items-center gap-2" aria-label="Checkout progress">
        {STEPS.map((item, index) => {
          const isComplete = index < currentStepIndex;
          const isCurrent = index === currentStepIndex;

          return (
            <li key={item.id} className="flex items-center gap-2">
              <div
                className={cn(
                  'flex items-center gap-2 rounded-full px-3.5 py-1.5 text-sm font-medium',
                  isCurrent
                    ? 'bg-brand-600 text-white'
                    : isComplete
                      ? 'bg-success-50 text-success-700'
                      : 'bg-ink-100 text-ink-500',
                )}
                aria-current={isCurrent ? 'step' : undefined}
              >
                {isComplete ? (
                  <Check className="h-3.5 w-3.5" aria-hidden="true" />
                ) : (
                  <item.icon className="h-3.5 w-3.5" aria-hidden="true" />
                )}
                {item.label}
              </div>
              {index < STEPS.length - 1 && (
                <span className="h-px w-6 bg-ink-200 sm:w-10" aria-hidden="true" />
              )}
            </li>
          );
        })}
      </ol>

      <div className="mt-8 grid gap-8 lg:grid-cols-[1fr_22rem]">
        <div className="min-w-0 space-y-6">
          {/* Step 1 — address */}
          <section className="rounded-2xl border border-ink-200 p-5">
            <div className="flex items-center justify-between">
              <h2 className="text-base font-semibold text-ink-900">Delivery address</h2>
              {step !== 'address' && (
                <Button variant="ghost" size="sm" onClick={() => setStep('address')}>
                  Change
                </Button>
              )}
            </div>

            {step === 'address' ? (
              <div className="mt-4 space-y-3">
                {addresses.length === 0 && !addingAddress && (
                  <EmptyState
                    icon={<MapPin className="h-7 w-7" />}
                    title="No saved addresses"
                    description="Add where you'd like this order delivered."
                    action={<Button onClick={() => setAddingAddress(true)}>Add an address</Button>}
                  />
                )}

                {addresses.map((address: Address) => (
                  <label
                    key={address.id}
                    className={cn(
                      'flex cursor-pointer gap-3 rounded-xl border p-4 transition-colors',
                      selectedAddressId === address.id
                        ? 'border-brand-600 bg-brand-50/50'
                        : 'border-ink-200 hover:border-ink-300',
                    )}
                  >
                    <input
                      type="radio"
                      name="address"
                      value={address.id}
                      checked={selectedAddressId === address.id}
                      onChange={() => setSelectedAddressId(address.id)}
                      className="mt-1 h-4 w-4 text-brand-600 focus:ring-brand-500"
                    />
                    <div className="min-w-0 text-sm">
                      <p className="font-semibold text-ink-900">
                        {address.fullName}
                        {address.isDefault && (
                          <span className="ml-2 rounded bg-ink-100 px-1.5 py-0.5 text-xs font-medium text-ink-600">
                            Default
                          </span>
                        )}
                      </p>
                      <p className="mt-1 text-ink-600">
                        {address.line1}
                        {address.line2 ? `, ${address.line2}` : ''}
                        <br />
                        {address.city}, {address.state} {address.postalCode}
                        <br />
                        {address.country}
                      </p>
                      <p className="mt-1 text-ink-500">{address.phone}</p>
                    </div>
                  </label>
                ))}

                {addingAddress ? (
                  <div className="rounded-xl border border-ink-200 p-4">
                    <AddressForm
                      onSuccess={(address) => {
                        setSelectedAddressId(address.id);
                        setAddingAddress(false);
                      }}
                      onCancel={() => setAddingAddress(false)}
                    />
                  </div>
                ) : (
                  addresses.length > 0 && (
                    <Button variant="outline" size="sm" onClick={() => setAddingAddress(true)}>
                      Add a new address
                    </Button>
                  )
                )}

                <Button
                  className="mt-2"
                  disabled={!selectedAddressId}
                  onClick={() => setStep('review')}
                >
                  Continue to review
                </Button>
              </div>
            ) : (
              selectedAddress && (
                <p className="mt-3 text-sm text-ink-600">
                  <span className="font-medium text-ink-900">{selectedAddress.fullName}</span> ·{' '}
                  {selectedAddress.line1}, {selectedAddress.city}, {selectedAddress.state}{' '}
                  {selectedAddress.postalCode}
                </p>
              )
            )}
          </section>

          {/* Step 2 — review */}
          {(step === 'review' || step === 'payment') && (
            <section className="rounded-2xl border border-ink-200 p-5">
              <h2 className="text-base font-semibold text-ink-900">Order items</h2>

              <ul className="mt-4 divide-y divide-ink-100">
                {cart.items.map((item) => (
                  <li key={item.id} className="flex gap-3 py-3 first:pt-0">
                    <Image
                      src={item.imageUrl}
                      alt={item.name}
                      aspect="square"
                      containerClassName="h-16 w-16 shrink-0 rounded-lg"
                    />
                    <div className="min-w-0 flex-1">
                      <p className="line-clamp-1 text-sm font-medium text-ink-900">{item.name}</p>
                      {item.variantName && <p className="text-xs text-ink-500">{item.variantName}</p>}
                      <p className="mt-0.5 text-xs text-ink-500">
                        {formatCurrency(item.unitPrice)} × {item.quantity}
                      </p>
                    </div>
                    <span className="text-sm font-semibold text-ink-900">
                      {formatCurrency(item.lineTotal)}
                    </span>
                  </li>
                ))}
              </ul>

              {step === 'review' && (
                <>
                  <Textarea
                    label="Delivery instructions"
                    hint="Optional — e.g. a landmark or a preferred time"
                    rows={3}
                    className="mt-4"
                    value={note}
                    onChange={(event) => setNote(event.target.value)}
                    maxLength={500}
                  />
                  <Button className="mt-4" onClick={() => setStep('payment')}>
                    Continue to payment
                  </Button>
                </>
              )}
            </section>
          )}

          {/* Step 3 — payment */}
          {step === 'payment' && (
            <section className="rounded-2xl border border-ink-200 p-5">
              <h2 className="text-base font-semibold text-ink-900">Payment</h2>

              <div className="mt-4 rounded-xl border border-brand-200 bg-brand-50/60 p-4">
                <div className="flex items-start gap-3">
                  <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-brand-600" aria-hidden="true" />
                  <div className="text-sm">
                    <p className="font-semibold text-ink-900">Secure payment via Razorpay</p>
                    <p className="mt-1 leading-relaxed text-ink-600">
                      Cards, UPI, net banking and wallets. Your order is only marked paid after the
                      payment signature is verified on our server.
                    </p>
                  </div>
                </div>
              </div>

              <Button
                fullWidth
                size="lg"
                className="mt-5"
                loading={processing}
                onClick={() => placeOrder.mutate()}
              >
                Pay {formatCurrency(cart.summary.total)}
              </Button>

              <p className="mt-3 text-center text-xs text-ink-500">
                By placing this order you agree to our terms and refund policy.
              </p>
            </section>
          )}
        </div>

        {/* Summary rail */}
        <aside className="lg:sticky lg:top-24 lg:self-start">
          <div className="rounded-2xl border border-ink-200 p-5">
            <h2 className="text-base font-semibold text-ink-900">Summary</h2>

            <dl className="mt-4 space-y-2.5 text-sm">
              <div className="flex justify-between">
                <dt className="text-ink-600">
                  Items ({cart.summary.totalQuantity})
                </dt>
                <dd className="font-medium text-ink-900">{formatCurrency(cart.summary.subtotal)}</dd>
              </div>
              {cart.summary.discountAmount > 0 && (
                <div className="flex justify-between text-success-700">
                  <dt>Coupon {cart.appliedCoupon?.code ?? couponCode}</dt>
                  <dd className="font-medium">−{formatCurrency(cart.summary.discountAmount)}</dd>
                </div>
              )}
              <div className="flex justify-between">
                <dt className="text-ink-600">Delivery</dt>
                <dd className="font-medium text-ink-900">
                  {cart.summary.shippingAmount === 0 ? 'Free' : formatCurrency(cart.summary.shippingAmount)}
                </dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-ink-600">GST ({cart.summary.taxRatePercent}%)</dt>
                <dd className="font-medium text-ink-900">{formatCurrency(cart.summary.taxAmount)}</dd>
              </div>
              <div className="flex justify-between border-t border-ink-200 pt-3 text-base">
                <dt className="font-semibold text-ink-900">Total</dt>
                <dd className="font-bold text-ink-900">{formatCurrency(cart.summary.total)}</dd>
              </div>
            </dl>

            <p className="mt-4 text-xs leading-relaxed text-ink-500">
              The server recalculates every amount when the order is created. Any coupon is
              revalidated then, against the live cart.
            </p>
          </div>
        </aside>
      </div>
    </div>
  );
}
