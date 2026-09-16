import { useMemo } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import { SlidersHorizontal, X } from 'lucide-react';

import { useAppDispatch, useAppSelector } from '@/app/store';
import { setFiltersOpen } from '@/features/ui/uiSlice';
import { Button } from '@/components/ui/Button';
import { EmptyState, ErrorState, ProductGridSkeleton } from '@/components/ui/Feedback';
import { Checkbox, Select } from '@/components/ui/Input';
import { Modal } from '@/components/ui/Modal';
import { Pagination } from '@/components/ui/Pagination';
import { ProductCard } from '@/components/product/ProductCard';
import { useBrands, useCategories, useProducts } from '@/hooks/useCatalog';
import { formatCurrency } from '@/lib/utils';
import type { ProductFilters } from '@/types/api';

const SORT_OPTIONS = [
  { value: 'newest', label: 'Newest first' },
  { value: 'popular', label: 'Most popular' },
  { value: 'rating', label: 'Highest rated' },
  { value: 'price_asc', label: 'Price: low to high' },
  { value: 'price_desc', label: 'Price: high to low' },
  { value: 'name_asc', label: 'Name: A to Z' },
];

const PRICE_BUCKETS = [
  { label: 'Under ₹1,000', min: undefined, max: 1000 },
  { label: '₹1,000 – ₹5,000', min: 1000, max: 5000 },
  { label: '₹5,000 – ₹15,000', min: 5000, max: 15000 },
  { label: '₹15,000 – ₹30,000', min: 15000, max: 30000 },
  { label: 'Over ₹30,000', min: 30000, max: undefined },
];

/**
 * The URL is the single source of truth for filter state. That makes every filtered
 * view shareable, bookmarkable and correct on back/forward — none of which works if
 * the filters live in component state.
 */
function useFilterParams() {
  const [searchParams, setSearchParams] = useSearchParams();

  const filters = useMemo<ProductFilters>(() => {
    const brands = searchParams.get('brands');
    return {
      q: searchParams.get('q') ?? undefined,
      category: searchParams.get('category') ?? undefined,
      brands: brands ? brands.split(',').filter(Boolean) : undefined,
      minPrice: searchParams.get('minPrice') ? Number(searchParams.get('minPrice')) : undefined,
      maxPrice: searchParams.get('maxPrice') ? Number(searchParams.get('maxPrice')) : undefined,
      minRating: searchParams.get('minRating') ? Number(searchParams.get('minRating')) : undefined,
      inStock: searchParams.get('inStock') === 'true' || undefined,
      featured: searchParams.get('featured') === 'true' || undefined,
      sort: (searchParams.get('sort') as ProductFilters['sort']) ?? 'newest',
      page: searchParams.get('page') ? Number(searchParams.get('page')) : 1,
      limit: 24,
    };
  }, [searchParams]);

  function update(patch: Partial<ProductFilters>, options: { resetPage?: boolean } = {}) {
    const next = new URLSearchParams(searchParams);

    for (const [key, value] of Object.entries(patch)) {
      if (value === undefined || value === null || value === '' || value === false) {
        next.delete(key);
      } else if (Array.isArray(value)) {
        if (value.length === 0) next.delete(key);
        else next.set(key, value.join(','));
      } else {
        next.set(key, String(value));
      }
    }

    // Changing a filter while on page 7 would usually land on an empty page.
    if (options.resetPage !== false) next.delete('page');

    setSearchParams(next, { replace: true });
  }

  function clearAll() {
    const next = new URLSearchParams();
    const query = searchParams.get('q');
    if (query) next.set('q', query);
    setSearchParams(next, { replace: true });
  }

  return { filters, update, clearAll, searchParams };
}

function FilterPanel({
  filters,
  update,
  clearAll,
}: {
  filters: ProductFilters;
  update: (patch: Partial<ProductFilters>) => void;
  clearAll: () => void;
}) {
  const { data: categories } = useCategories();
  const { data: brands } = useBrands();

  const activeBrands = filters.brands ?? [];

  function toggleBrand(slug: string) {
    const next = activeBrands.includes(slug)
      ? activeBrands.filter((value) => value !== slug)
      : [...activeBrands, slug];
    update({ brands: next });
  }

  return (
    <div className="space-y-7">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-ink-900">Filters</h2>
        <button
          type="button"
          onClick={clearAll}
          className="text-xs font-medium text-brand-700 hover:underline"
        >
          Clear all
        </button>
      </div>

      <fieldset>
        <legend className="mb-2.5 text-xs font-semibold uppercase tracking-wide text-ink-500">
          Category
        </legend>
        <ul className="space-y-1">
          {(categories ?? [])
            .filter((category) => !category.parentId)
            .map((category) => (
              <li key={category.id}>
                <button
                  type="button"
                  onClick={() =>
                    update({ category: filters.category === category.slug ? undefined : category.slug })
                  }
                  className={`flex w-full items-center justify-between rounded-lg px-2.5 py-1.5 text-sm transition-colors ${
                    filters.category === category.slug
                      ? 'bg-brand-50 font-semibold text-brand-800'
                      : 'text-ink-600 hover:bg-ink-50'
                  }`}
                >
                  {category.name}
                  <span className="text-xs text-ink-400">{category.productCount}</span>
                </button>
              </li>
            ))}
        </ul>
      </fieldset>

      <fieldset>
        <legend className="mb-2.5 text-xs font-semibold uppercase tracking-wide text-ink-500">Brand</legend>
        <ul className="space-y-2">
          {(brands ?? []).map((brand) => (
            <li key={brand.id}>
              <Checkbox
                label={brand.name}
                checked={activeBrands.includes(brand.slug)}
                onChange={() => toggleBrand(brand.slug)}
              />
            </li>
          ))}
        </ul>
      </fieldset>

      <fieldset>
        <legend className="mb-2.5 text-xs font-semibold uppercase tracking-wide text-ink-500">Price</legend>
        <ul className="space-y-1">
          {PRICE_BUCKETS.map((bucket) => {
            const isActive = filters.minPrice === bucket.min && filters.maxPrice === bucket.max;
            return (
              <li key={bucket.label}>
                <button
                  type="button"
                  onClick={() =>
                    update(
                      isActive
                        ? { minPrice: undefined, maxPrice: undefined }
                        : { minPrice: bucket.min, maxPrice: bucket.max },
                    )
                  }
                  className={`w-full rounded-lg px-2.5 py-1.5 text-left text-sm transition-colors ${
                    isActive ? 'bg-brand-50 font-semibold text-brand-800' : 'text-ink-600 hover:bg-ink-50'
                  }`}
                >
                  {bucket.label}
                </button>
              </li>
            );
          })}
        </ul>
      </fieldset>

      <fieldset>
        <legend className="mb-2.5 text-xs font-semibold uppercase tracking-wide text-ink-500">
          Customer rating
        </legend>
        <ul className="space-y-1">
          {[4, 3, 2].map((rating) => (
            <li key={rating}>
              <button
                type="button"
                onClick={() => update({ minRating: filters.minRating === rating ? undefined : rating })}
                className={`w-full rounded-lg px-2.5 py-1.5 text-left text-sm transition-colors ${
                  filters.minRating === rating
                    ? 'bg-brand-50 font-semibold text-brand-800'
                    : 'text-ink-600 hover:bg-ink-50'
                }`}
              >
                {rating}★ and above
              </button>
            </li>
          ))}
        </ul>
      </fieldset>

      <fieldset className="space-y-2.5">
        <legend className="mb-2.5 text-xs font-semibold uppercase tracking-wide text-ink-500">
          Availability
        </legend>
        <Checkbox
          label="In stock only"
          checked={Boolean(filters.inStock)}
          onChange={(event) => update({ inStock: event.target.checked || undefined })}
        />
        <Checkbox
          label="Featured only"
          checked={Boolean(filters.featured)}
          onChange={(event) => update({ featured: event.target.checked || undefined })}
        />
      </fieldset>
    </div>
  );
}

export default function ProductsPage() {
  const dispatch = useAppDispatch();
  const params = useParams<{ slug?: string }>();
  const filtersOpen = useAppSelector((state) => state.ui.filtersOpen);
  const { filters, update, clearAll } = useFilterParams();

  // /category/:slug renders this same page with the category pinned from the route.
  const effectiveFilters: ProductFilters = params.slug
    ? { ...filters, category: params.slug }
    : filters;

  const { data, isLoading, isError, refetch, isFetching } = useProducts(effectiveFilters);
  const { data: categories } = useCategories();

  const activeCategory = categories?.find((category) => category.slug === effectiveFilters.category);

  const activeChips = [
    effectiveFilters.q && { label: `"${effectiveFilters.q}"`, clear: () => update({ q: undefined }) },
    !params.slug &&
      activeCategory && { label: activeCategory.name, clear: () => update({ category: undefined }) },
    ...(effectiveFilters.brands ?? []).map((brand) => ({
      label: brand,
      clear: () => update({ brands: (effectiveFilters.brands ?? []).filter((b) => b !== brand) }),
    })),
    (effectiveFilters.minPrice !== undefined || effectiveFilters.maxPrice !== undefined) && {
      label: `${effectiveFilters.minPrice ? formatCurrency(effectiveFilters.minPrice) : 'Under'} – ${
        effectiveFilters.maxPrice ? formatCurrency(effectiveFilters.maxPrice) : 'above'
      }`,
      clear: () => update({ minPrice: undefined, maxPrice: undefined }),
    },
    effectiveFilters.minRating && {
      label: `${effectiveFilters.minRating}★ and above`,
      clear: () => update({ minRating: undefined }),
    },
    effectiveFilters.inStock && { label: 'In stock', clear: () => update({ inStock: undefined }) },
  ].filter(Boolean) as Array<{ label: string; clear: () => void }>;

  const heading = params.slug ? (activeCategory?.name ?? 'Category') : 'All products';

  return (
    <div className="container-page py-8">
      <header className="mb-6">
        <h1 className="text-heading-lg text-ink-900">{heading}</h1>
        <p className="mt-1 text-sm text-ink-500">
          {data?.meta ? `${data.meta.total.toLocaleString('en-IN')} products` : 'Loading products…'}
          {activeCategory?.description ? ` · ${activeCategory.description}` : ''}
        </p>
      </header>

      <div className="lg:grid lg:grid-cols-[16rem_1fr] lg:gap-10">
        <aside className="hidden lg:block">
          <div className="sticky top-24">
            <FilterPanel filters={effectiveFilters} update={update} clearAll={clearAll} />
          </div>
        </aside>

        <div className="min-w-0">
          <div className="mb-5 flex flex-wrap items-center gap-3">
            <Button
              variant="outline"
              size="sm"
              className="lg:hidden"
              onClick={() => dispatch(setFiltersOpen(true))}
              leftIcon={<SlidersHorizontal className="h-4 w-4" aria-hidden="true" />}
            >
              Filters
            </Button>

            <div className="ml-auto w-full sm:w-56">
              <Select
                aria-label="Sort products"
                options={SORT_OPTIONS}
                value={effectiveFilters.sort}
                onChange={(event) =>
                  update({ sort: event.target.value as ProductFilters['sort'] })
                }
              />
            </div>
          </div>

          {activeChips.length > 0 && (
            <ul className="mb-5 flex flex-wrap gap-2">
              {activeChips.map((chip, index) => (
                <li key={`${chip.label}-${index}`}>
                  <button
                    type="button"
                    onClick={chip.clear}
                    className="inline-flex items-center gap-1.5 rounded-full bg-ink-100 px-3 py-1
                               text-xs font-medium text-ink-700 transition-colors hover:bg-ink-200"
                  >
                    {chip.label}
                    <X className="h-3 w-3" aria-hidden="true" />
                    <span className="sr-only">Remove filter</span>
                  </button>
                </li>
              ))}
            </ul>
          )}

          {isLoading ? (
            <ProductGridSkeleton count={12} />
          ) : isError ? (
            <ErrorState onRetry={() => void refetch()} />
          ) : data && data.products.length > 0 ? (
            <>
              <div
                className={`grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4 ${
                  isFetching ? 'opacity-60 transition-opacity' : ''
                }`}
              >
                {data.products.map((product, index) => (
                  <ProductCard key={product.id} product={product} priority={index < 4} />
                ))}
              </div>

              {data.meta && (
                <Pagination
                  meta={data.meta}
                  onPageChange={(page) => {
                    // Paging is the one update that must keep the page number.
                    update({ page }, { resetPage: false });
                    window.scrollTo({ top: 0, behavior: 'smooth' });
                  }}
                  className="mt-10"
                />
              )}
            </>
          ) : (
            <EmptyState
              title="No products match those filters"
              description="Try widening your price range or clearing a filter or two."
              action={
                <Button variant="outline" onClick={clearAll}>
                  Clear all filters
                </Button>
              }
            />
          )}
        </div>
      </div>

      <Modal
        open={filtersOpen}
        onClose={() => dispatch(setFiltersOpen(false))}
        title="Filters"
        variant="drawer"
        footer={
          <Button fullWidth onClick={() => dispatch(setFiltersOpen(false))}>
            Show {data?.meta?.total ?? 0} results
          </Button>
        }
      >
        <FilterPanel filters={effectiveFilters} update={update} clearAll={clearAll} />
      </Modal>
    </div>
  );
}
