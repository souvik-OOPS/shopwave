import { Link, useNavigate } from 'react-router-dom';
import { AlertTriangle, Minus, Plus, ShoppingBag, Trash2 } from 'lucide-react';

import { useAppDispatch, useAppSelector } from '@/app/store';
import { closeCartDrawer } from '@/features/ui/uiSlice';
import { Button } from '@/components/ui/Button';
import { EmptyState, Spinner } from '@/components/ui/Feedback';
import { Image } from '@/components/ui/Image';
import { Modal } from '@/components/ui/Modal';
import { useCart, useRemoveCartItem, useUpdateCartItem } from '@/hooks/useCart';
import { cn, formatCurrency } from '@/lib/utils';

export function CartDrawer() {
  const dispatch = useAppDispatch();
  const navigate = useNavigate();
  const open = useAppSelector((state) => state.ui.cartDrawerOpen);
  const isAuthenticated = useAppSelector((state) => state.auth.status === 'authenticated');

  const { data: cart, isLoading } = useCart();
  const updateItem = useUpdateCartItem();
  const removeItem = useRemoveCartItem();

  function close() {
    dispatch(closeCartDrawer());
  }

  function goTo(path: string) {
    close();
    navigate(path);
  }

  const isEmpty = !cart || cart.items.length === 0;

  return (
    <Modal
      open={open}
      onClose={close}
      variant="drawer"
      title="Your cart"
      description={cart ? `${cart.summary.totalQuantity} item(s)` : undefined}
      footer={
        !isEmpty ? (
          <div className="space-y-3">
            {cart.summary.amountToFreeShipping > 0 && (
              <p className="rounded-lg bg-brand-50 px-3 py-2 text-xs text-brand-800">
                Add {formatCurrency(cart.summary.amountToFreeShipping)} more for free delivery
              </p>
            )}

            <dl className="space-y-1.5 text-sm">
              <div className="flex justify-between">
                <dt className="text-ink-600">Subtotal</dt>
                <dd className="font-medium text-ink-900">{formatCurrency(cart.summary.subtotal)}</dd>
              </div>
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
              <div className="flex justify-between border-t border-ink-200 pt-2 text-base">
                <dt className="font-semibold text-ink-900">Total</dt>
                <dd className="font-bold text-ink-900">{formatCurrency(cart.summary.total)}</dd>
              </div>
            </dl>

            <div className="grid gap-2">
              <Button fullWidth onClick={() => goTo('/checkout')}>
                Checkout
              </Button>
              <Button fullWidth variant="outline" onClick={() => goTo('/cart')}>
                View full cart
              </Button>
            </div>
          </div>
        ) : undefined
      }
    >
      {!isAuthenticated ? (
        <EmptyState
          icon={<ShoppingBag className="h-7 w-7" />}
          title="Sign in to see your cart"
          description="Your cart is saved to your account, so it follows you across devices."
          action={<Button onClick={() => goTo('/login')}>Sign in</Button>}
        />
      ) : isLoading ? (
        <div className="flex justify-center py-12">
          <Spinner />
        </div>
      ) : isEmpty ? (
        <EmptyState
          icon={<ShoppingBag className="h-7 w-7" />}
          title="Your cart is empty"
          description="Browse the catalogue and add something you like."
          action={<Button onClick={() => goTo('/products')}>Start shopping</Button>}
        />
      ) : (
        <div className="space-y-4">
          {cart.issues.length > 0 && (
            <div className="rounded-xl border border-warning-500/30 bg-warning-50 p-3">
              <p className="flex items-center gap-1.5 text-xs font-semibold text-warning-700">
                <AlertTriangle className="h-3.5 w-3.5" aria-hidden="true" />
                Some items changed
              </p>
              <ul className="mt-1.5 space-y-1 text-xs text-warning-700">
                {cart.issues.map((issue) => (
                  <li key={`${issue.itemId}-${issue.code}`}>{issue.message}</li>
                ))}
              </ul>
            </div>
          )}

          <ul className="divide-y divide-ink-100">
            {cart.items.map((item) => (
              <li key={item.id} className="flex gap-3 py-4">
                <Link to={`/products/${item.slug}`} onClick={close} className="shrink-0">
                  <Image
                    src={item.imageUrl}
                    alt={item.name}
                    aspect="square"
                    containerClassName="h-20 w-20 rounded-lg"
                  />
                </Link>

                <div className="flex min-w-0 flex-1 flex-col">
                  <Link
                    to={`/products/${item.slug}`}
                    onClick={close}
                    className="line-clamp-2 text-sm font-medium text-ink-900 hover:text-brand-700"
                  >
                    {item.name}
                  </Link>
                  {item.variantName && <p className="text-xs text-ink-500">{item.variantName}</p>}

                  {!item.isAvailable && (
                    <p className="mt-0.5 text-xs font-medium text-danger-600">Unavailable</p>
                  )}

                  <div className="mt-auto flex items-center justify-between pt-2">
                    <div
                      className={cn(
                        'inline-flex items-center rounded-lg border border-ink-300',
                        !item.isAvailable && 'opacity-50',
                      )}
                    >
                      <button
                        type="button"
                        aria-label="Decrease quantity"
                        disabled={updateItem.isPending || !item.isAvailable}
                        onClick={() =>
                          updateItem.mutate({ itemId: item.id, quantity: item.quantity - 1 })
                        }
                        className="p-1.5 text-ink-600 hover:bg-ink-50 disabled:opacity-40"
                      >
                        <Minus className="h-3.5 w-3.5" aria-hidden="true" />
                      </button>
                      <span className="min-w-8 text-center text-sm font-medium">{item.quantity}</span>
                      <button
                        type="button"
                        aria-label="Increase quantity"
                        disabled={
                          updateItem.isPending || !item.isAvailable || item.quantity >= item.maxQuantity
                        }
                        onClick={() =>
                          updateItem.mutate({ itemId: item.id, quantity: item.quantity + 1 })
                        }
                        className="p-1.5 text-ink-600 hover:bg-ink-50 disabled:opacity-40"
                      >
                        <Plus className="h-3.5 w-3.5" aria-hidden="true" />
                      </button>
                    </div>

                    <div className="flex items-center gap-2">
                      <span className="text-sm font-semibold text-ink-900">
                        {formatCurrency(item.lineTotal)}
                      </span>
                      <button
                        type="button"
                        aria-label={`Remove ${item.name}`}
                        onClick={() => removeItem.mutate(item.id)}
                        disabled={removeItem.isPending}
                        className="rounded p-1 text-ink-400 hover:bg-danger-50 hover:text-danger-600"
                      >
                        <Trash2 className="h-4 w-4" aria-hidden="true" />
                      </button>
                    </div>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}
    </Modal>
  );
}
