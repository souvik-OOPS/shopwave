import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Search } from 'lucide-react';

import { Button } from '@/components/ui/Button';
import { EmptyState, ProductGridSkeleton } from '@/components/ui/Feedback';
import { Input, Select } from '@/components/ui/Input';
import { Pagination } from '@/components/ui/Pagination';
import { ProductCard } from '@/components/product/ProductCard';
import { useDebouncedValue, useProducts } from '@/hooks/useCatalog';
import type { ProductFilters } from '@/types/api';

const SORT_OPTIONS = [
  { value: 'newest', label: 'Newest first' },
  { value: 'popular', label: 'Most popular' },
  { value: 'rating', label: 'Highest rated' },
  { value: 'price_asc', label: 'Price: low to high' },
  { value: 'price_desc', label: 'Price: high to low' },
];

export default function SearchPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const query = searchParams.get('q') ?? '';
  const sort = (searchParams.get('sort') as ProductFilters['sort']) ?? 'newest';
  const page = Number(searchParams.get('page') ?? 1);

  const [term, setTerm] = useState(query);
  // Typing issues one request after a pause, not one per keystroke.
  const debouncedTerm = useDebouncedValue(term, 400);

  useEffect(() => {
    if (debouncedTerm === query) return;

    const next = new URLSearchParams(searchParams);
    if (debouncedTerm) next.set('q', debouncedTerm);
    else next.delete('q');
    next.delete('page');

    setSearchParams(next, { replace: true });
  }, [debouncedTerm, query, searchParams, setSearchParams]);

  const { data, isLoading, isFetching } = useProducts({
    ...(query ? { q: query } : {}),
    sort,
    page,
    limit: 24,
  });

  function updateParam(key: string, value: string) {
    const next = new URLSearchParams(searchParams);
    next.set(key, value);
    if (key !== 'page') next.delete('page');
    setSearchParams(next, { replace: true });
  }

  return (
    <div className="container-page py-8">
      <header className="mb-6">
        <h1 className="text-heading-lg text-ink-900">Search</h1>
        {query && (
          <p className="mt-1 text-sm text-ink-500">
            {data?.meta
              ? `${data.meta.total.toLocaleString('en-IN')} result${data.meta.total === 1 ? '' : 's'} for "${query}"`
              : `Searching for "${query}"…`}
          </p>
        )}
      </header>

      <div className="mb-6 flex flex-wrap gap-3">
        <Input
          aria-label="Search products"
          placeholder="Search products, brands, categories…"
          value={term}
          onChange={(event) => setTerm(event.target.value)}
          leftIcon={<Search className="h-4 w-4" aria-hidden="true" />}
          containerClassName="flex-1 min-w-64"
          autoFocus
        />
        <div className="w-full sm:w-56">
          <Select
            aria-label="Sort results"
            options={SORT_OPTIONS}
            value={sort}
            onChange={(event) => updateParam('sort', event.target.value)}
          />
        </div>
      </div>

      {!query ? (
        <EmptyState
          icon={<Search className="h-7 w-7" />}
          title="What are you looking for?"
          description="Search across product names, descriptions, SKUs, brands and categories."
        />
      ) : isLoading ? (
        <ProductGridSkeleton count={12} />
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
              onPageChange={(nextPage) => updateParam('page', String(nextPage))}
              className="mt-10"
            />
          )}
        </>
      ) : (
        <EmptyState
          icon={<Search className="h-7 w-7" />}
          title={`No results for "${query}"`}
          description="Check the spelling, try a broader term, or browse the full catalogue."
          action={
            <Link to="/products">
              <Button variant="outline">Browse all products</Button>
            </Link>
          }
        />
      )}
    </div>
  );
}
