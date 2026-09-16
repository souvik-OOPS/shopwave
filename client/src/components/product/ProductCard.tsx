import { memo } from 'react';
import { Link } from 'react-router-dom';
import { Heart, ShoppingBag } from 'lucide-react';

import { useAppSelector } from '@/app/store';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Image } from '@/components/ui/Image';
import { Rating } from '@/components/ui/Rating';
import { useAddToCart } from '@/hooks/useCart';
import { useToggleWishlist } from '@/hooks/useWishlist';
import { useToast } from '@/hooks/useToast';
import { cn, formatCurrency } from '@/lib/utils';
import type { ProductListItem } from '@/types/api';

interface ProductCardProps {
  product: ProductListItem;
  priority?: boolean;
  className?: string;
}

/**
 * Memoised: a product grid renders 20–40 of these, and re-rendering them all whenever
 * an unrelated piece of state changes is the difference between a snappy and a sluggish
 * catalogue.
 */
export const ProductCard = memo(function ProductCard({ product, priority, className }: ProductCardProps) {
  const isAuthenticated = useAppSelector((state) => state.auth.status === 'authenticated');
  const isSaved = useAppSelector((state) => state.wishlist.productIds.includes(product.id));

  const addToCart = useAddToCart();
  const toggleWishlist = useToggleWishlist();
  const toast = useToast();

  const primaryImage = product.images.find((image) => image.isPrimary) ?? product.images[0];

  function handleAddToCart(event: React.MouseEvent) {
    // The whole card is a link; the button must not navigate.
    event.preventDefault();
    event.stopPropagation();

    if (!isAuthenticated) {
      toast.info('Please sign in', 'You need an account to add items to your cart.');
      return;
    }
    if (!product.inStock) return;

    addToCart.mutate({ productId: product.id, quantity: 1 });
  }

  function handleToggleWishlist(event: React.MouseEvent) {
    event.preventDefault();
    event.stopPropagation();

    if (!isAuthenticated) {
      toast.info('Please sign in', 'You need an account to save items.');
      return;
    }

    toggleWishlist.mutate({ productId: product.id, isSaved });
  }

  return (
    <article
      className={cn(
        'group relative flex flex-col overflow-hidden rounded-2xl border border-ink-200 bg-surface',
        'transition-shadow duration-200 hover:shadow-card-hover',
        className,
      )}
    >
      <Link to={`/products/${product.slug}`} className="flex flex-1 flex-col focus:outline-none">
        <div className="relative overflow-hidden">
          <Image
            src={primaryImage?.url}
            alt={primaryImage?.alt ?? product.name}
            aspect="square"
            priority={priority}
            className="transition-transform duration-500 group-hover:scale-[1.04]"
          />

          <div className="absolute left-3 top-3 flex flex-col gap-1.5">
            {product.isDiscounted && <Badge tone="danger">-{product.discountPercentage}%</Badge>}
            {product.isFeatured && <Badge tone="brand">Featured</Badge>}
          </div>

          {!product.inStock && (
            <div className="absolute inset-0 flex items-center justify-center bg-surface/70 backdrop-blur-[1px]">
              <Badge tone="neutral" className="px-3 py-1.5 text-sm">
                Out of stock
              </Badge>
            </div>
          )}

          {product.inStock && product.isLowStock && (
            <div className="absolute bottom-3 left-3">
              <Badge tone="warning">Only {product.stockQuantity} left</Badge>
            </div>
          )}
        </div>

        <div className="flex flex-1 flex-col p-4">
          {product.brand && (
            <p className="mb-1 text-xs font-medium uppercase tracking-wide text-ink-500">
              {product.brand.name}
            </p>
          )}

          <h3 className="line-clamp-2 text-sm font-semibold leading-snug text-ink-900 group-hover:text-brand-700">
            {product.name}
          </h3>

          {product.reviewCount > 0 && (
            <div className="mt-2">
              <Rating value={product.ratingAverage} count={product.reviewCount} />
            </div>
          )}

          <div className="mt-auto flex items-baseline gap-2 pt-3">
            <span className="text-lg font-bold text-ink-900">{formatCurrency(product.effectivePrice)}</span>
            {product.isDiscounted && (
              <span className="text-sm text-ink-400 line-through">{formatCurrency(product.price)}</span>
            )}
          </div>
        </div>
      </Link>

      <button
        type="button"
        onClick={handleToggleWishlist}
        aria-label={isSaved ? `Remove ${product.name} from wishlist` : `Save ${product.name} to wishlist`}
        aria-pressed={isSaved}
        className={cn(
          'absolute right-3 top-3 flex h-9 w-9 items-center justify-center rounded-full',
          'bg-surface/90 shadow-sm backdrop-blur transition-colors',
          'hover:bg-surface focus-visible:ring-2 focus-visible:ring-brand-500',
          isSaved ? 'text-danger-600' : 'text-ink-500',
        )}
      >
        <Heart className={cn('h-4.5 w-4.5', isSaved && 'fill-current')} aria-hidden="true" />
      </button>

      <div className="px-4 pb-4">
        <Button
          size="sm"
          fullWidth
          variant={product.inStock ? 'primary' : 'outline'}
          disabled={!product.inStock}
          loading={addToCart.isPending}
          onClick={handleAddToCart}
          leftIcon={<ShoppingBag className="h-4 w-4" aria-hidden="true" />}
        >
          {product.inStock ? 'Add to cart' : 'Out of stock'}
        </Button>
      </div>
    </article>
  );
});
