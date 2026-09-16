import { useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ChevronRight, Heart, Minus, Plus, ShieldCheck, ShoppingBag, Truck, Undo2 } from 'lucide-react';

import { useAppSelector } from '@/app/store';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { EmptyState, ErrorState, Skeleton } from '@/components/ui/Feedback';
import { Image } from '@/components/ui/Image';
import { Rating } from '@/components/ui/Rating';
import { ProductCard } from '@/components/product/ProductCard';
import { ProductReviews } from '@/components/product/ProductReviews';
import { useAddToCart } from '@/hooks/useCart';
import { useProduct, useRelatedProducts } from '@/hooks/useCatalog';
import { useToast } from '@/hooks/useToast';
import { useToggleWishlist } from '@/hooks/useWishlist';
import { cn, formatCurrency } from '@/lib/utils';

function DetailSkeleton() {
  return (
    <div className="container-page py-8">
      <div className="grid gap-10 lg:grid-cols-2">
        <Skeleton className="aspect-square w-full rounded-2xl" />
        <div className="space-y-4">
          <Skeleton className="h-4 w-24" />
          <Skeleton className="h-9 w-3/4" />
          <Skeleton className="h-5 w-40" />
          <Skeleton className="h-10 w-48" />
          <Skeleton className="h-24 w-full" />
          <Skeleton className="h-12 w-full" />
        </div>
      </div>
    </div>
  );
}

export default function ProductDetailPage() {
  const { slug } = useParams<{ slug: string }>();
  const { data: product, isLoading, isError, refetch } = useProduct(slug);
  const { data: related } = useRelatedProducts(slug);

  const isAuthenticated = useAppSelector((state) => state.auth.status === 'authenticated');
  const isSaved = useAppSelector((state) =>
    product ? state.wishlist.productIds.includes(product.id) : false,
  );

  const addToCart = useAddToCart();
  const toggleWishlist = useToggleWishlist();
  const toast = useToast();

  const [activeImage, setActiveImage] = useState(0);
  const [selectedVariantId, setSelectedVariantId] = useState<string | null>(null);
  const [quantity, setQuantity] = useState(1);

  const selectedVariant = useMemo(
    () => product?.variants.find((variant) => variant.id === selectedVariantId) ?? null,
    [product, selectedVariantId],
  );

  if (isLoading) return <DetailSkeleton />;
  if (isError) return <ErrorState className="py-24" onRetry={() => void refetch()} />;
  if (!product) {
    return (
      <EmptyState
        className="py-24"
        title="Product not found"
        description="It may have been removed from the catalogue."
        action={
          <Link to="/products">
            <Button>Browse products</Button>
          </Link>
        }
      />
    );
  }

  // Re-bound after the guards above so the narrowed type survives into the closures below.
  const loadedProduct = product;

  const hasVariants = product.variants.length > 0;
  // With variants, price and stock come from the selection, not the parent product.
  const activePrice = selectedVariant?.effectivePrice ?? product.effectivePrice;
  const activeListPrice = selectedVariant?.price ?? product.price;
  const isDiscounted = selectedVariant?.isDiscounted ?? product.isDiscounted;
  const stock = selectedVariant?.stockQuantity ?? product.stockQuantity;
  const inStock = hasVariants ? Boolean(selectedVariant?.inStock) : product.inStock;
  const maxQuantity = Math.min(stock, 10);

  // "Waiting for a choice" is not the same as "sold out". Conflating them tells a
  // customer the product is unavailable when in fact 40 units are in stock across
  // variants — they simply have not picked a colour yet.
  const awaitingVariantChoice = hasVariants && !selectedVariantId;
  const anyVariantInStock = product.variants.some((variant) => variant.inStock);
  const isSoldOut = hasVariants ? !anyVariantInStock : !product.inStock;

  const addToCartLabel = awaitingVariantChoice
    ? 'Select an option'
    : isSoldOut || !inStock
      ? 'Out of stock'
      : 'Add to cart';

  function handleAddToCart() {
    if (!isAuthenticated) {
      toast.info('Please sign in', 'You need an account to add items to your cart.');
      return;
    }
    if (hasVariants && !selectedVariantId) {
      toast.warning('Choose an option', 'Select a variant before adding to your cart.');
      return;
    }

    addToCart.mutate({
      productId: loadedProduct.id,
      variantId: selectedVariantId,
      quantity,
    });
  }

  return (
    <div className="pb-8">
      <div className="container-page py-6">
        <nav aria-label="Breadcrumb">
          <ol className="flex flex-wrap items-center gap-1.5 text-sm text-ink-500">
            <li>
              <Link to="/" className="hover:text-ink-900">
                Home
              </Link>
            </li>
            <ChevronRight className="h-3.5 w-3.5" aria-hidden="true" />
            <li>
              <Link to="/products" className="hover:text-ink-900">
                Products
              </Link>
            </li>
            {product.category && (
              <>
                <ChevronRight className="h-3.5 w-3.5" aria-hidden="true" />
                <li>
                  <Link to={`/category/${product.category.slug}`} className="hover:text-ink-900">
                    {product.category.name}
                  </Link>
                </li>
              </>
            )}
            <ChevronRight className="h-3.5 w-3.5" aria-hidden="true" />
            <li aria-current="page" className="truncate font-medium text-ink-900">
              {product.name}
            </li>
          </ol>
        </nav>
      </div>

      <div className="container-page">
        <div className="grid gap-10 lg:grid-cols-2">
          {/* Gallery */}
          <div className="lg:sticky lg:top-24 lg:self-start">
            <Image
              src={product.images[activeImage]?.url}
              alt={product.images[activeImage]?.alt ?? product.name}
              aspect="square"
              priority
              containerClassName="rounded-2xl border border-ink-200"
            />

            {product.images.length > 1 && (
              <ul className="mt-3 flex gap-3 overflow-x-auto no-scrollbar">
                {product.images.map((image, index) => (
                  <li key={image.id}>
                    <button
                      type="button"
                      onClick={() => setActiveImage(index)}
                      aria-label={`View image ${index + 1}`}
                      aria-current={index === activeImage}
                      className={cn(
                        'overflow-hidden rounded-xl border-2 transition-colors',
                        index === activeImage ? 'border-brand-600' : 'border-ink-200 hover:border-ink-300',
                      )}
                    >
                      <Image
                        src={image.url}
                        alt=""
                        aspect="square"
                        containerClassName="h-20 w-20"
                      />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {/* Buy box */}
          <div>
            {product.brand && (
              <Link
                to={`/products?brands=${product.brand.slug}`}
                className="text-sm font-semibold uppercase tracking-wide text-brand-700 hover:underline"
              >
                {product.brand.name}
              </Link>
            )}

            <h1 className="mt-2 text-heading-lg text-ink-900">{product.name}</h1>

            <div className="mt-3 flex flex-wrap items-center gap-3">
              {product.reviewCount > 0 ? (
                <Rating value={product.ratingAverage} count={product.reviewCount} size="md" showValue />
              ) : (
                <span className="text-sm text-ink-500">No reviews yet</span>
              )}
              <span className="text-ink-300" aria-hidden="true">
                |
              </span>
              <span className="text-sm text-ink-500">SKU {selectedVariant?.sku ?? product.sku}</span>
            </div>

            <div className="mt-5 flex flex-wrap items-baseline gap-3">
              <span className="text-3xl font-bold tracking-tight text-ink-900">
                {formatCurrency(activePrice)}
              </span>
              {isDiscounted && (
                <>
                  <span className="text-lg text-ink-400 line-through">
                    {formatCurrency(activeListPrice)}
                  </span>
                  <Badge tone="danger">
                    Save {formatCurrency(activeListPrice - activePrice)}
                  </Badge>
                </>
              )}
            </div>
            <p className="mt-1 text-xs text-ink-500">Inclusive of all taxes</p>

            {product.shortDescription && (
              <p className="mt-5 text-sm leading-relaxed text-ink-600">{product.shortDescription}</p>
            )}

            {hasVariants && (
              <fieldset className="mt-6">
                <legend className="mb-2.5 text-sm font-semibold text-ink-900">
                  Options
                  {!selectedVariantId && (
                    <span className="ml-1.5 font-normal text-ink-500">— please select one</span>
                  )}
                </legend>
                <ul className="flex flex-wrap gap-2">
                  {product.variants.map((variant) => (
                    <li key={variant.id}>
                      <button
                        type="button"
                        disabled={!variant.inStock}
                        onClick={() => {
                          setSelectedVariantId(variant.id);
                          setQuantity(1);
                        }}
                        className={cn(
                          'rounded-xl border px-4 py-2.5 text-sm font-medium transition-colors',
                          'disabled:cursor-not-allowed disabled:border-dashed disabled:text-ink-400',
                          selectedVariantId === variant.id
                            ? 'border-brand-600 bg-brand-50 text-brand-800'
                            : 'border-ink-300 text-ink-700 hover:border-ink-400',
                        )}
                      >
                        {variant.name}
                        {!variant.inStock && <span className="ml-1.5 text-xs">(sold out)</span>}
                      </button>
                    </li>
                  ))}
                </ul>
              </fieldset>
            )}

            <div className="mt-6">
              {inStock ? (
                stock <= 5 ? (
                  <p className="text-sm font-medium text-warning-700">
                    Hurry — only {stock} left in stock
                  </p>
                ) : (
                  <p className="text-sm font-medium text-success-700">In stock</p>
                )
              ) : awaitingVariantChoice ? (
                <p className="text-sm font-medium text-ink-500">
                  Select an option to see availability
                </p>
              ) : (
                <p className="text-sm font-medium text-danger-600">Out of stock</p>
              )}
            </div>

            <div className="mt-5 flex flex-wrap items-center gap-3">
              <div className="inline-flex items-center rounded-xl border border-ink-300">
                <button
                  type="button"
                  aria-label="Decrease quantity"
                  disabled={quantity <= 1}
                  onClick={() => setQuantity((value) => Math.max(1, value - 1))}
                  className="p-3 text-ink-600 hover:bg-ink-50 disabled:opacity-40"
                >
                  <Minus className="h-4 w-4" aria-hidden="true" />
                </button>
                <span className="min-w-10 text-center text-sm font-semibold" aria-live="polite">
                  {quantity}
                </span>
                <button
                  type="button"
                  aria-label="Increase quantity"
                  disabled={quantity >= maxQuantity || !inStock}
                  onClick={() => setQuantity((value) => Math.min(maxQuantity, value + 1))}
                  className="p-3 text-ink-600 hover:bg-ink-50 disabled:opacity-40"
                >
                  <Plus className="h-4 w-4" aria-hidden="true" />
                </button>
              </div>

              <Button
                size="lg"
                className="flex-1"
                // Left enabled while awaiting a choice so the click can explain what to do.
                disabled={!inStock && !awaitingVariantChoice}
                loading={addToCart.isPending}
                onClick={handleAddToCart}
                leftIcon={<ShoppingBag className="h-4.5 w-4.5" aria-hidden="true" />}
              >
                {addToCartLabel}
              </Button>

              <Button
                size="icon"
                variant="outline"
                className="h-12 w-12"
                aria-label={isSaved ? 'Remove from wishlist' : 'Save to wishlist'}
                aria-pressed={isSaved}
                onClick={() => {
                  if (!isAuthenticated) {
                    toast.info('Please sign in', 'You need an account to save items.');
                    return;
                  }
                  toggleWishlist.mutate({ productId: product.id, isSaved });
                }}
              >
                <Heart
                  className={cn('h-5 w-5', isSaved && 'fill-danger-600 text-danger-600')}
                  aria-hidden="true"
                />
              </Button>
            </div>

            <ul className="mt-8 grid gap-3 border-t border-ink-200 pt-6 sm:grid-cols-3">
              {[
                { icon: Truck, label: 'Free over ₹999' },
                { icon: Undo2, label: '7-day returns' },
                { icon: ShieldCheck, label: 'Secure checkout' },
              ].map(({ icon: Icon, label }) => (
                <li key={label} className="flex items-center gap-2 text-sm text-ink-600">
                  <Icon className="h-4.5 w-4.5 shrink-0 text-brand-600" aria-hidden="true" />
                  {label}
                </li>
              ))}
            </ul>
          </div>
        </div>

        {/* Description & specifications */}
        <section className="mt-14 grid gap-10 lg:grid-cols-2">
          <div>
            <h2 className="text-heading text-ink-900">About this product</h2>
            <p className="mt-4 whitespace-pre-line text-sm leading-relaxed text-ink-600">
              {product.description}
            </p>
          </div>

          {product.attributes.length > 0 && (
            <div>
              <h2 className="text-heading text-ink-900">Specifications</h2>
              <dl className="mt-4 divide-y divide-ink-100 rounded-2xl border border-ink-200">
                {product.attributes.map((attribute) => (
                  <div key={attribute.id} className="grid grid-cols-3 gap-4 px-4 py-3">
                    <dt className="text-sm font-medium text-ink-500">{attribute.name}</dt>
                    <dd className="col-span-2 text-sm text-ink-900">{attribute.value}</dd>
                  </div>
                ))}
              </dl>
            </div>
          )}
        </section>

        <ProductReviews productId={product.id} slug={product.slug} />

        {related && related.length > 0 && (
          <section className="mt-14">
            <h2 className="mb-6 text-heading text-ink-900">You might also like</h2>
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
              {related.slice(0, 4).map((item) => (
                <ProductCard key={item.id} product={item} />
              ))}
            </div>
          </section>
        )}
      </div>
    </div>
  );
}
