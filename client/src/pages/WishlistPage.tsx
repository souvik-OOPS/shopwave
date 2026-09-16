import { Link } from 'react-router-dom';
import { Heart, ShoppingBag, Trash2 } from 'lucide-react';

import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { EmptyState, ProductGridSkeleton } from '@/components/ui/Feedback';
import { Image } from '@/components/ui/Image';
import { Rating } from '@/components/ui/Rating';
import { useMoveWishlistItemToCart, useToggleWishlist, useWishlist } from '@/hooks/useWishlist';
import { formatCurrency } from '@/lib/utils';

export default function WishlistPage() {
  const { data: wishlist, isLoading } = useWishlist();
  const moveToCart = useMoveWishlistItemToCart();
  const toggle = useToggleWishlist();

  if (isLoading) {
    return (
      <div className="container-page py-8">
        <ProductGridSkeleton count={4} />
      </div>
    );
  }

  if (!wishlist || wishlist.items.length === 0) {
    return (
      <div className="container-page py-16">
        <EmptyState
          icon={<Heart className="h-7 w-7" />}
          title="Your wishlist is empty"
          description="Tap the heart on any product to save it here for later."
          action={
            <Link to="/products">
              <Button size="lg">Browse products</Button>
            </Link>
          }
        />
      </div>
    );
  }

  return (
    <div className="container-page py-8">
      <header className="mb-6">
        <h1 className="text-heading-lg text-ink-900">Wishlist</h1>
        <p className="mt-1 text-sm text-ink-500">
          {wishlist.itemCount} saved item{wishlist.itemCount === 1 ? '' : 's'}
        </p>
      </header>

      <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {wishlist.items.map((item) => (
          <li
            key={item.id}
            className="flex gap-4 rounded-2xl border border-ink-200 p-4 transition-shadow hover:shadow-card-hover"
          >
            <Link to={`/products/${item.slug}`} className="shrink-0">
              <Image
                src={item.imageUrl}
                alt={item.name}
                aspect="square"
                containerClassName="h-28 w-28 rounded-xl"
              />
            </Link>

            <div className="flex min-w-0 flex-1 flex-col">
              {item.brand && (
                <p className="text-xs font-medium uppercase tracking-wide text-ink-500">
                  {item.brand.name}
                </p>
              )}

              <Link
                to={`/products/${item.slug}`}
                className="line-clamp-2 text-sm font-semibold text-ink-900 hover:text-brand-700"
              >
                {item.name}
              </Link>

              {item.reviewCount > 0 && (
                <Rating value={item.ratingAverage} count={item.reviewCount} className="mt-1" />
              )}

              <div className="mt-1.5 flex items-baseline gap-2">
                <span className="text-base font-bold text-ink-900">
                  {formatCurrency(item.effectivePrice)}
                </span>
                {item.isDiscounted && (
                  <span className="text-xs text-ink-400 line-through">{formatCurrency(item.price)}</span>
                )}
              </div>

              {!item.isPurchasable && (
                <Badge tone="neutral" className="mt-1.5 self-start">
                  No longer available
                </Badge>
              )}
              {item.isPurchasable && !item.inStock && (
                <Badge tone="warning" className="mt-1.5 self-start">
                  Out of stock
                </Badge>
              )}

              <div className="mt-auto flex items-center gap-2 pt-3">
                <Button
                  size="sm"
                  className="flex-1"
                  disabled={!item.inStock || !item.isPurchasable}
                  loading={moveToCart.isPending}
                  onClick={() =>
                    moveToCart.mutate({
                      productId: item.productId,
                      variantId: item.variantId,
                      quantity: 1,
                    })
                  }
                  leftIcon={<ShoppingBag className="h-3.5 w-3.5" aria-hidden="true" />}
                >
                  Move to cart
                </Button>

                <Button
                  size="icon"
                  variant="ghost"
                  className="h-9 w-9 shrink-0"
                  aria-label={`Remove ${item.name} from wishlist`}
                  // Everything on this page is saved by definition, so this is always a removal.
                  onClick={() => toggle.mutate({ productId: item.productId, isSaved: true })}
                >
                  <Trash2 className="h-4 w-4 text-ink-400" aria-hidden="true" />
                </Button>
              </div>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
