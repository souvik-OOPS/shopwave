import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { AlertTriangle, ArrowRight, Minus, Plus, ShoppingBag, Tag, Trash2 } from 'lucide-react';
import { useMutation } from '@tanstack/react-query';

import { Button } from '@/components/ui/Button';
import { EmptyState, Spinner } from '@/components/ui/Feedback';
import { Image } from '@/components/ui/Image';
import { Input } from '@/components/ui/Input';
import { ConfirmDialog } from '@/components/ui/Modal';
import { useCart, useClearCart, useRemoveCartItem, useUpdateCartItem } from '@/hooks/useCart';
import { useToast } from '@/hooks/useToast';
import { couponApi } from '@/lib/api';
import { cn, formatCurrency } from '@/lib/utils';

export default function CartPage() {
  const navigate = useNavigate();
  const toast = useToast();

  const [couponCode, setCouponCode] = useState('');
  const [activeCoupon, setActiveCoupon] = useState<string | null>(null);
  const [confirmClear, setConfirmClear] = useState(false);

  // Priced by the server with the coupon in hand, so the discount, the free-shipping
  // decision and the GST base all come back consistent — and identical to what checkout
  // will quote and what the order will be created with.
  const { data: cart, isLoading } = useCart(activeCoupon);

  const updateItem = useUpdateCartItem();
  const removeItem = useRemoveCartItem();
  const clearCart = useClearCart();

  /**
   * Applying a coupon here is a *preview* only. Checkout revalidates the code against
   * the live cart, so a stale or tampered preview can never become a real discount.
   */
  const applyCoupon = useMutation({
    mutationFn: (code: string) => couponApi.validate(code),
    onSuccess: ({ coupon }) => {
      setActiveCoupon(coupon.code);
      toast.success(`Coupon applied`, `${coupon.code} saves you ${formatCurrency(coupon.discountAmount)}`);
    },
    onError: (error) => {
      setActiveCoupon(null);
      toast.error(error);
    },
  });

  if (isLoading) {
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
          icon={<ShoppingBag className="h-7 w-7" />}
          title="Your cart is empty"
          description="Once you add something, it will show up here — and stay saved to your account."
          action={
            <Link to="/products">
              <Button size="lg">Start shopping</Button>
            </Link>
          }
        />
      </div>
    );
  }

  const appliedCoupon = cart.appliedCoupon;
  const discount = cart.summary.discountAmount;

  return (
    <div className="container-page py-8">
      <header className="mb-6 flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-heading-lg text-ink-900">Your cart</h1>
          <p className="mt-1 text-sm text-ink-500">
            {cart.summary.totalQuantity} item{cart.summary.totalQuantity === 1 ? '' : 's'}
          </p>
        </div>
        <Button variant="ghost" size="sm" onClick={() => setConfirmClear(true)}>
          Clear cart
        </Button>
      </header>

      {cart.issues.length > 0 && (
        <div role="alert" className="mb-6 rounded-xl border border-warning-500/30 bg-warning-50 p-4">
          <p className="flex items-center gap-2 text-sm font-semibold text-warning-700">
            <AlertTriangle className="h-4 w-4" aria-hidden="true" />
            Some items in your cart changed
          </p>
          <ul className="mt-2 list-inside list-disc space-y-1 text-sm text-warning-700">
            {cart.issues.map((issue) => (
              <li key={`${issue.itemId}-${issue.code}`}>{issue.message}</li>
            ))}
          </ul>
        </div>
      )}

      <div className="grid gap-8 lg:grid-cols-[1fr_22rem]">
        <ul className="divide-y divide-ink-100 rounded-2xl border border-ink-200">
          {cart.items.map((item) => (
            <li key={item.id} className={cn('flex gap-4 p-4 sm:p-5', !item.isAvailable && 'bg-ink-50')}>
              <Link to={`/products/${item.slug}`} className="shrink-0">
                <Image
                  src={item.imageUrl}
                  alt={item.name}
                  aspect="square"
                  containerClassName="h-24 w-24 rounded-xl sm:h-28 sm:w-28"
                />
              </Link>

              <div className="flex min-w-0 flex-1 flex-col">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <Link
                      to={`/products/${item.slug}`}
                      className="line-clamp-2 text-sm font-semibold text-ink-900 hover:text-brand-700 sm:text-base"
                    >
                      {item.name}
                    </Link>
                    {item.variantName && <p className="mt-0.5 text-sm text-ink-500">{item.variantName}</p>}
                    <p className="mt-0.5 text-xs text-ink-400">SKU {item.sku}</p>

                    {!item.isAvailable && (
                      <p className="mt-1.5 text-sm font-medium text-danger-600">
                        No longer available — remove to continue
                      </p>
                    )}
                  </div>

                  <button
                    type="button"
                    aria-label={`Remove ${item.name}`}
                    onClick={() => removeItem.mutate(item.id)}
                    className="shrink-0 rounded-lg p-2 text-ink-400 transition-colors hover:bg-danger-50 hover:text-danger-600"
                  >
                    <Trash2 className="h-4 w-4" aria-hidden="true" />
                  </button>
                </div>

                <div className="mt-auto flex flex-wrap items-center justify-between gap-3 pt-3">
                  <div className="inline-flex items-center rounded-lg border border-ink-300">
                    <button
                      type="button"
                      aria-label="Decrease quantity"
                      disabled={updateItem.isPending || !item.isAvailable}
                      onClick={() => updateItem.mutate({ itemId: item.id, quantity: item.quantity - 1 })}
                      className="p-2 text-ink-600 hover:bg-ink-50 disabled:opacity-40"
                    >
                      <Minus className="h-3.5 w-3.5" aria-hidden="true" />
                    </button>
                    <span className="min-w-9 text-center text-sm font-semibold">{item.quantity}</span>
                    <button
                      type="button"
                      aria-label="Increase quantity"
                      disabled={
                        updateItem.isPending || !item.isAvailable || item.quantity >= item.maxQuantity
                      }
                      onClick={() => updateItem.mutate({ itemId: item.id, quantity: item.quantity + 1 })}
                      className="p-2 text-ink-600 hover:bg-ink-50 disabled:opacity-40"
                    >
                      <Plus className="h-3.5 w-3.5" aria-hidden="true" />
                    </button>
                  </div>

                  <div className="text-right">
                    <p className="text-base font-bold text-ink-900">{formatCurrency(item.lineTotal)}</p>
                    <p className="text-xs text-ink-500">{formatCurrency(item.unitPrice)} each</p>
                  </div>
                </div>
              </div>
            </li>
          ))}
        </ul>

        <aside className="lg:sticky lg:top-24 lg:self-start">
          <div className="rounded-2xl border border-ink-200 p-5">
            <h2 className="text-base font-semibold text-ink-900">Order summary</h2>

            <form
              className="mt-4"
              onSubmit={(event) => {
                event.preventDefault();
                if (couponCode.trim()) applyCoupon.mutate(couponCode.trim().toUpperCase());
              }}
            >
              <div className="flex gap-2">
                <Input
                  aria-label="Coupon code"
                  placeholder="Coupon code"
                  value={couponCode}
                  onChange={(event) => setCouponCode(event.target.value.toUpperCase())}
                  leftIcon={<Tag className="h-4 w-4" aria-hidden="true" />}
                  containerClassName="flex-1"
                />
                <Button type="submit" variant="outline" loading={applyCoupon.isPending}>
                  Apply
                </Button>
              </div>
            </form>

            {appliedCoupon && (
              <div className="mt-3 flex items-center justify-between rounded-lg bg-success-50 px-3 py-2">
                <span className="text-sm font-semibold text-success-700">{appliedCoupon.code}</span>
                <button
                  type="button"
                  onClick={() => {
                    setActiveCoupon(null);
                    setCouponCode('');
                  }}
                  className="text-xs font-medium text-success-700 hover:underline"
                >
                  Remove
                </button>
              </div>
            )}

            <dl className="mt-5 space-y-2.5 text-sm">
              <div className="flex justify-between">
                <dt className="text-ink-600">Subtotal</dt>
                <dd className="font-medium text-ink-900">{formatCurrency(cart.summary.subtotal)}</dd>
              </div>

              {discount > 0 && (
                <div className="flex justify-between text-success-700">
                  <dt>Coupon discount</dt>
                  <dd className="font-medium">−{formatCurrency(discount)}</dd>
                </div>
              )}

              <div className="flex justify-between">
                <dt className="text-ink-600">Delivery</dt>
                <dd className="font-medium text-ink-900">
                  {cart.summary.shippingAmount === 0 ? (
                    <span className="text-success-700">Free</span>
                  ) : (
                    formatCurrency(cart.summary.shippingAmount)
                  )}
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

            {cart.summary.amountToFreeShipping > 0 && (
              <p className="mt-3 rounded-lg bg-brand-50 px-3 py-2 text-xs text-brand-800">
                Add {formatCurrency(cart.summary.amountToFreeShipping)} more to qualify for free delivery.
              </p>
            )}

            <Button
              fullWidth
              size="lg"
              className="mt-5"
              disabled={cart.items.some((item) => !item.isAvailable)}
              onClick={() => navigate('/checkout', { state: { couponCode: activeCoupon } })}
              rightIcon={<ArrowRight className="h-4 w-4" aria-hidden="true" />}
            >
              Proceed to checkout
            </Button>

            <p className="mt-3 text-center text-xs text-ink-500">
              Final pricing is confirmed by the server at checkout.
            </p>
          </div>
        </aside>
      </div>

      <ConfirmDialog
        open={confirmClear}
        title="Clear your cart?"
        description="This removes every item from your cart. It cannot be undone."
        confirmLabel="Clear cart"
        variant="danger"
        loading={clearCart.isPending}
        onConfirm={() => {
          clearCart.mutate();
          setConfirmClear(false);
        }}
        onCancel={() => setConfirmClear(false)}
      />
    </div>
  );
}
