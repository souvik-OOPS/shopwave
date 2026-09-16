import { QueryClient } from '@tanstack/react-query';

import { ApiRequestError } from '@/lib/apiClient';

/**
 * React Query owns *server* state (products, orders, the cart). Redux owns *client*
 * state (session identity, UI). Keeping the split clean is why there is no
 * `productsSlice` full of loading booleans anywhere in this app.
 */
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 60_000,
      gcTime: 5 * 60_000,
      refetchOnWindowFocus: false,
      retry: (failureCount, error) => {
        // Retrying a 404 or a 403 just delays the inevitable error state.
        if (error instanceof ApiRequestError) {
          if (error.status >= 400 && error.status < 500) return false;
        }
        return failureCount < 2;
      },
    },
    mutations: {
      retry: false,
    },
  },
});

/** Centralised key factory — prevents typo-driven cache misses across the app. */
export const queryKeys = {
  products: {
    all: ['products'] as const,
    list: (filters: Record<string, unknown>) => ['products', 'list', filters] as const,
    detail: (slug: string) => ['products', 'detail', slug] as const,
    related: (slug: string) => ['products', 'related', slug] as const,
    facets: (filters: Record<string, unknown>) => ['products', 'facets', filters] as const,
    adminList: (filters: Record<string, unknown>) => ['products', 'admin', filters] as const,
    adminDetail: (id: string) => ['products', 'admin', 'detail', id] as const,
  },
  categories: {
    all: ['categories'] as const,
    list: (params?: Record<string, unknown>) => ['categories', 'list', params ?? {}] as const,
    detail: (slug: string) => ['categories', 'detail', slug] as const,
  },
  brands: {
    all: ['brands'] as const,
    list: (params?: Record<string, unknown>) => ['brands', 'list', params ?? {}] as const,
  },
  cart: ['cart'] as const,
  /** One entry per coupon view of the cart; `null` is the plain, undiscounted cart. */
  cartWithCoupon: (couponCode?: string | null) => ['cart', couponCode ?? null] as const,
  wishlist: {
    all: ['wishlist'] as const,
    ids: ['wishlist', 'ids'] as const,
  },
  addresses: ['addresses'] as const,
  orders: {
    all: ['orders'] as const,
    list: (params: Record<string, unknown>) => ['orders', 'list', params] as const,
    detail: (id: string) => ['orders', 'detail', id] as const,
    adminList: (params: Record<string, unknown>) => ['orders', 'admin', params] as const,
    adminDetail: (id: string) => ['orders', 'admin', 'detail', id] as const,
  },
  reviews: {
    all: ['reviews'] as const,
    forProduct: (slug: string, params: Record<string, unknown>) => ['reviews', slug, params] as const,
    eligibility: (productId: string) => ['reviews', 'eligibility', productId] as const,
    mine: ['reviews', 'mine'] as const,
    admin: (params: Record<string, unknown>) => ['reviews', 'admin', params] as const,
  },
  coupons: {
    list: (params: Record<string, unknown>) => ['coupons', 'list', params] as const,
  },
  admin: {
    dashboard: ['admin', 'dashboard'] as const,
    users: (params: Record<string, unknown>) => ['admin', 'users', params] as const,
    userDetail: (id: string) => ['admin', 'users', id] as const,
  },
  auth: {
    me: ['auth', 'me'] as const,
  },
} as const;
