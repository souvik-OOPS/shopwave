import { useEffect, useState } from 'react';
import { keepPreviousData, useQuery } from '@tanstack/react-query';

import { brandApi, categoryApi, productApi, reviewApi } from '@/lib/api';
import { queryKeys } from '@/lib/queryClient';
import type { ProductFilters } from '@/types/api';

export function useProducts(filters: ProductFilters) {
  return useQuery({
    queryKey: queryKeys.products.list(filters as Record<string, unknown>),
    queryFn: () => productApi.list(filters),
    // Keeps the previous page on screen while the next loads, so paging does not
    // flash an empty grid.
    placeholderData: keepPreviousData,
  });
}

export function useProduct(slug: string | undefined) {
  return useQuery({
    queryKey: queryKeys.products.detail(slug ?? ''),
    queryFn: async () => {
      const { product } = await productApi.detail(slug as string);
      return product;
    },
    enabled: Boolean(slug),
  });
}

export function useRelatedProducts(slug: string | undefined) {
  return useQuery({
    queryKey: queryKeys.products.related(slug ?? ''),
    queryFn: async () => {
      const { products } = await productApi.related(slug as string);
      return products;
    },
    enabled: Boolean(slug),
    staleTime: 5 * 60_000,
  });
}

export function useCategories(params?: { tree?: boolean; includeInactive?: boolean }) {
  return useQuery({
    queryKey: queryKeys.categories.list(params),
    queryFn: async () => {
      const { categories } = await categoryApi.list(params);
      return categories;
    },
    staleTime: 10 * 60_000,
  });
}

export function useBrands(params?: { includeInactive?: boolean }) {
  return useQuery({
    queryKey: queryKeys.brands.list(params),
    queryFn: async () => {
      const { brands } = await brandApi.list(params);
      return brands;
    },
    staleTime: 10 * 60_000,
  });
}

export function useProductReviews(slug: string | undefined, params: Record<string, unknown>) {
  return useQuery({
    queryKey: queryKeys.reviews.forProduct(slug ?? '', params),
    queryFn: () => reviewApi.forProduct(slug as string, params),
    enabled: Boolean(slug),
    placeholderData: keepPreviousData,
  });
}

/**
 * Delays a rapidly-changing value. Used for the search box so typing "headphones"
 * issues one request rather than ten.
 */
export function useDebouncedValue<T>(value: T, delay = 350): T {
  const [debounced, setDebounced] = useState(value);

  useEffect(() => {
    const timer = window.setTimeout(() => setDebounced(value), delay);
    return () => window.clearTimeout(timer);
  }, [value, delay]);

  return debounced;
}
